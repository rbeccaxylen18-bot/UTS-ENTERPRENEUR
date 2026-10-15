"""SECOND IN - server lokal untuk presentasi UTS. Python 3, tanpa paket tambahan."""
from __future__ import annotations
import hashlib, hmac, json, os, re, secrets, sqlite3, sys, mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from email.parser import BytesParser
from email.policy import default
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent
UPLOAD_DIR = ROOT / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)
DBFILE = ROOT / 'second_in.db'
SCHEMA = (ROOT / 'schema.sql').read_text(encoding='utf-8')
SEEDFILE = ROOT / 'produk_awal.json'
PORT = int(os.environ.get('PORT', '8000'))
DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
ONLINE_DB = DATABASE_URL.startswith(('postgres://', 'postgresql://'))

class ApiError(Exception):
    def __init__(self, message, status=400): super().__init__(message); self.status=status

class CompatibleRow(dict):
    """Akses kolom melalui nama maupun indeks seperti sqlite3.Row."""
    def __getitem__(self, key):
        return list(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


def postgres_row_factory(cursor):
    columns = [col.name for col in cursor.description]
    def make_row(values):
        return CompatibleRow(zip(columns, values))
    return make_row


class PgResult:
    def __init__(self, cursor, inserted_id=False):
        self.cursor = cursor
        self.lastrowid = cursor.fetchone()['id'] if inserted_id else None

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    def __iter__(self):
        return iter(self.cursor)


class PgConnection:
    """Lapisan kecil untuk SQL yang semula ditulis bagi SQLite."""
    def __init__(self):
        import psycopg
        self.connection = psycopg.connect(DATABASE_URL, row_factory=postgres_row_factory)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None:
                self.connection.commit()
            else:
                self.connection.rollback()
        finally:
            self.connection.close()

    def execute(self, sql, params=()):
        query = sql.strip()
        # PostgreSQL menggunakan transaksi otomatis saat koneksi mulai dipakai.
        if query.upper() == 'BEGIN IMMEDIATE':
            return None
        if re.match(r'^INSERT OR IGNORE\s+INTO\s+', query, flags=re.I):
            sql = re.sub(r'INSERT OR IGNORE', 'INSERT', sql, count=1, flags=re.I) + ' ON CONFLICT DO NOTHING'
        sql = sql.replace(' COLLATE NOCASE', '')
        # Kunci baris produk sewaktu checkout agar tidak terjual dua kali.
        if query.upper().startswith('SELECT P.* FROM CART_ITEMS C JOIN PRODUCTS P') and 'FOR UPDATE' not in sql:
            sql += ' FOR UPDATE OF p'
        insert_id = bool(re.match(r'^INSERT\s+INTO\s+(users|products|orders)\b', query, re.I))
        if insert_id:
            sql += ' RETURNING id'
        sql = sql.replace('?', '%s')
        cur = self.connection.execute(sql, params)
        return PgResult(cur, inserted_id=insert_id)

    def executescript(self, script):
        for statement in script.split(';'):
            if statement.strip():
                self.connection.execute(statement)


def db():
    if ONLINE_DB:
        return PgConnection()
    connection = sqlite3.connect(DBFILE, timeout=8)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys=ON')
    connection.execute('PRAGMA busy_timeout=8000')
    return connection

def hash_password(value: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256',value.encode(),salt,260000)
    return salt.hex()+':'+digest.hex()

def check_password(value: str, stored: str) -> bool:
    try:
        salt,digest = stored.split(':',1)
        trial=hashlib.pbkdf2_hmac('sha256',value.encode(),bytes.fromhex(salt),260000)
        return hmac.compare_digest(trial.hex(),digest)
    except (ValueError, TypeError):return False

def init_db():
    with db() as con:
        schema = (ROOT / 'schema_postgres.sql').read_text(encoding='utf-8') if ONLINE_DB else SCHEMA
        con.executescript(schema)
        if con.execute('SELECT count(*) FROM users').fetchone()[0] == 0:
            if ONLINE_DB:
                # Akun produk contoh tidak dapat dipakai login oleh pengunjung.
                con.execute('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)',
                            ('SECOND IN', 'produk-awal@secondin.invalid', hash_password(secrets.token_urlsafe(48))))
            else:
                con.execute('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)',
                            ('Admin Barang', 'penjual@secondin.test', hash_password('demo12345')))
                con.execute('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)',
                            ('Pembeli Demo', 'pembeli@secondin.test', hash_password('demo12345')))
        if con.execute('SELECT count(*) FROM products').fetchone()[0] == 0:
            items = json.loads(SEEDFILE.read_text(encoding='utf-8'))
            seller = con.execute('SELECT id FROM users WHERE email=?',
                                 ('produk-awal@secondin.invalid' if ONLINE_DB else 'penjual@secondin.test',)).fetchone()
            if seller:
                for p in items:
                    con.execute('INSERT INTO products(seller_id,name,category,price,condition,description,image_url,badge,stock) VALUES(?,?,?,?,?,?,?,?,1)',
                                (seller['id'],p['name'],p['category'],p['price'],p['condition'],p['description'],p['image_url'],p['badge']))

def product_dict(row):
    d = dict(row)
    d['available'] = d.get('stock',0)>0
    return d

class Handler(BaseHTTPRequestHandler):
    server_version = 'SecondInDemo/1.0'
    def log_message(self,fmt,*args): print('%s %s'%(self.log_date_time_string(),fmt%args))
    def reply(self,payload,status=200,cookie=None):
        data=json.dumps(payload,ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Length',str(len(data)))
        if cookie:self.send_header('Set-Cookie',cookie)
        self.end_headers();self.wfile.write(data)
    def json_body(self):
        size=int(self.headers.get('Content-Length','0'))
        if size<0 or size>1_000_000:raise ApiError('Data terlalu besar.',413)
        try:
            data=json.loads(self.rfile.read(size) or b'{}')
            if not isinstance(data,dict):raise ValueError()
            return data
        except ValueError:raise ApiError('Format data tidak sesuai.')
    def is_https(self):
        return self.headers.get('X-Forwarded-Proto', '').split(',')[0].strip() == 'https'

    def token(self):
        cookie=SimpleCookie()
        try:cookie.load(self.headers.get('Cookie',''))
        except Exception:return ''
        return cookie['secondin_session'].value if 'secondin_session' in cookie else ''
    def user(self,con):
        token=self.token()
        if not token:return None
        key=hashlib.sha256(token.encode()).hexdigest()
        row=con.execute('SELECT users.id, users.name, users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=?',(key,)).fetchone()
        return dict(row) if row else None
    def require(self,con):
        u=self.user(con)
        if not u:raise ApiError('Silakan masuk dulu.',401)
        return u
    def param(self,query,name,default=''):
        return query.get(name,[default])[0]
    def uploaded_photo(self):
        ct=self.headers.get('Content-Type','')
        if not ct.lower().startswith('multipart/form-data;') or 'boundary=' not in ct.lower():
            raise ApiError('Format upload tidak sesuai.',400)
        try: length=int(self.headers.get('Content-Length','0'))
        except (ValueError,TypeError): raise ApiError('Ukuran upload tidak valid.',400)
        if length <= 0 or length > 5*1024*1024+20000:
            raise ApiError('Ukuran foto maksimal 5 MB.',413)
        raw=self.rfile.read(length)
        # Email parser handles multipart boundaries and CRLF binary safely.
        packet=BytesParser(policy=default).parsebytes(b'Content-Type: '+ct.encode('ascii','ignore')+b'\r\nMIME-Version: 1.0\r\n\r\n'+raw)
        if not packet.is_multipart(): raise ApiError('Upload gambar tidak lengkap.',400)
        for part in packet.iter_parts():
            if part.get_param('name',header='content-disposition') != 'image':continue
            filename=part.get_filename() or ''
            image=part.get_payload(decode=True) or b''
            ext=Path(filename).suffix.lower()
            if ext not in ('.jpg','.jpeg','.png'):raise ApiError('Pilih foto JPG, JPEG, atau PNG.',400)
            if not image or len(image)>5*1024*1024:raise ApiError('Ukuran foto maksimal 5 MB.',413)
            if ext=='.png' and not image.startswith(b'\x89PNG\r\n\x1a\n'):
                raise ApiError('File PNG tidak valid.',400)
            if ext in ('.jpg','.jpeg') and not image.startswith(b'\xff\xd8\xff'):
                raise ApiError('File JPEG tidak valid.',400)
            actual_ext='.png' if ext=='.png' else '.jpg'
            name=secrets.token_hex(16)+actual_ext
            (UPLOAD_DIR/name).write_bytes(image)
            return '/uploads/'+name
        raise ApiError('Pilih foto terlebih dahulu.',400)

    def do_GET(self):self.dispatch('GET')
    def do_POST(self):self.dispatch('POST')
    def do_DELETE(self):self.dispatch('DELETE')
    def do_PATCH(self):self.dispatch('PATCH')
    def dispatch(self,method):
        path=urlsplit(self.path).path
        if not path.startswith('/api/'):
            return self.page(path) if method=='GET' else self.reply({'message':'Tidak ditemukan'},404)
        query=parse_qs(urlsplit(self.path).query)
        try:
            with db() as con:
                result=self.api(con,method,path,query)
                if result is not None:
                    data,status,cookie=result
                    self.reply(data,status,cookie)
        except ApiError as e:self.reply({'message':str(e)},e.status)
        except sqlite3.IntegrityError:self.reply({'message':'Data tidak dapat disimpan. Coba periksa kembali.'},409)
        except (ValueError,TypeError):self.reply({'message':'Data tidak valid.'},400)
        except Exception as e:
            if ONLINE_DB and type(e).__module__.startswith('psycopg') and 'UniqueViolation' in type(e).__name__:
                return self.reply({'message':'Data ini sudah terdaftar.'},409)
            print('SERVER ERROR:',repr(e),file=sys.stderr)
            self.reply({'message':'Terjadi kendala pada server.'},500)
    def page(self,path):
        if path in ('/','/beranda','/jelajahi','/jual','/keranjang','/favorit','/pesan','/akun','/bantuan'):
            file=ROOT/'index.html'
        elif path in ('/app.js','/gaya_asli.css','/tambahan.css','/logo_second_in.png'):
            file=ROOT/path.lstrip('/')
        elif re.fullmatch(r'/uploads/[a-f0-9]{32}\.(png|jpg)',path):
            file=UPLOAD_DIR/path.rsplit('/',1)[-1]
        else:
            self.send_error(404);return
        if not file.is_file():self.send_error(404);return
        data=file.read_bytes();self.send_response(200)
        mime=mimetypes.guess_type(str(file))[0] or 'application/octet-stream'
        self.send_header('Content-Type', mime+('; charset=utf-8' if mime.startswith(('text/','application/javascript')) else ''))
        self.send_header('Cache-Control','no-cache')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Length',str(len(data)))
        self.end_headers();self.wfile.write(data)
    def api(self,con,method,path,query):
        out=lambda data,status=200,cookie=None:(data,status,cookie)
        if path=='/api/me' and method=='GET':return out({'user':self.user(con)})
        if path=='/api/register' and method=='POST':
            v=self.json_body();name=str(v.get('name','')).strip();email=str(v.get('email','')).strip().lower();password=str(v.get('password',''))
            if len(name)<2 or len(name)>80 or '@' not in email or len(email)>150 or len(password)<8:raise ApiError('Isi nama, email, dan password minimal 8 karakter.')
            if con.execute('SELECT 1 FROM users WHERE email=?',(email,)).fetchone():raise ApiError('Email ini sudah terdaftar.',409)
            cur=con.execute('INSERT INTO users(name,email,password_hash) VALUES (?,?,?)',(name,email,hash_password(password)))
            return self.new_session(con,int(cur.lastrowid),out)
        if path=='/api/login' and method=='POST':
            v=self.json_body();email=str(v.get('email','')).strip().lower();password=str(v.get('password',''))
            row=con.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
            if not row or not check_password(password,row['password_hash']):raise ApiError('Email atau password salah.',401)
            return self.new_session(con,row['id'],out)
        if path=='/api/logout' and method=='POST':
            token=self.token()
            if token:con.execute('DELETE FROM sessions WHERE token_hash=?',(hashlib.sha256(token.encode()).hexdigest(),))
            return out({'ok':True},200,'secondin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'+('; Secure' if self.is_https() else ''))
        if path=='/api/upload-image' and method=='POST':
            self.require(con)
            location=self.uploaded_photo()
            return out({'url':location},201)
        if path=='/api/products' and method=='GET':
            sql='SELECT products.*, users.name as seller_name FROM products JOIN users ON users.id=products.seller_id WHERE 1=1';params=[]
            category=self.param(query,'category','semua');q=self.param(query,'q').strip().lower();condition=self.param(query,'condition','semua')
            if category!='semua':sql+=' AND products.category=?';params.append(category)
            if q:sql+=' AND (lower(products.name) LIKE ? OR lower(products.description) LIKE ?)';params.extend(['%'+q+'%']*2)
            if condition!='semua':sql+=' AND products.condition=?';params.append(condition)
            for k,operator in [('min','>='),('max','<=')]:
                value=self.param(query,k)
                if value:
                    n=int(value)
                    if n<0:raise ApiError('Harga tidak valid.')
                    sql+=f' AND products.price{operator}?';params.append(n)
            sort=self.param(query,'sort','default')
            sql += {'low':' ORDER BY products.price ASC','high':' ORDER BY products.price DESC','name':' ORDER BY LOWER(products.name) ASC'}.get(sort,' ORDER BY products.id ASC')
            return out({'products':[product_dict(x) for x in con.execute(sql,params).fetchall()]})
        if path=='/api/products/my' and method=='GET':
            u=self.require(con);rows=con.execute('SELECT products.*,users.name seller_name FROM products JOIN users ON users.id=products.seller_id WHERE seller_id=? ORDER BY products.id DESC',(u['id'],))
            return out({'products':[product_dict(x) for x in rows]})
        if path=='/api/products' and method=='POST':
            u=self.require(con);v=self.json_body()
            name=str(v.get('name','')).strip();cat=str(v.get('category','lainnya')).strip().lower();cond=str(v.get('condition','Kondisi baik')).strip();desc=str(v.get('description','')).strip();image=str(v.get('image_url','')).strip();price=int(v.get('price',0))
            if len(name)<3 or len(name)>120 or price<1000 or price>100000000:raise ApiError('Isi nama dan harga barang yang sesuai.')
            if cat not in ('pakaian','sepatu','tas','aksesori','elektronik','perabotan rumah','lainnya'):raise ApiError('Kategori tidak valid.')
            if cond not in ('Sangat baik','Kondisi baik','Layak pakai','Cukup baik'):raise ApiError('Kondisi tidak valid.')
            if len(desc)>1000 or len(image)>1000 or (image and not (image.startswith(('https://','http://')) or re.fullmatch(r'/uploads/[a-f0-9]{32}\.(png|jpg)',image))):raise ApiError('Gunakan foto JPG/PNG yang valid.')
            cur=con.execute('INSERT INTO products(seller_id,name,category,price,condition,description,image_url,badge) VALUES(?,?,?,?,?,?,?,?)',(u['id'],name,cat,price,cond,desc,image,'Baru masuk'))
            return out({'ok':True,'id':cur.lastrowid},201)
        if path.startswith('/api/products/') and method=='DELETE':
            u=self.require(con);p_id=int(path.rsplit('/',1)[-1])
            prod=con.execute('SELECT id,stock FROM products WHERE id=? AND seller_id=?',(p_id,u['id'])).fetchone()
            if not prod:raise ApiError('Barang tidak ditemukan di akunmu.',404)
            if not prod['stock']:raise ApiError('Barang yang sudah dipesan tidak bisa dihapus.',409)
            if con.execute('SELECT 1 FROM order_items WHERE product_id=?',(p_id,)).fetchone():raise ApiError('Barang ada di riwayat pesanan.',409)
            con.execute('DELETE FROM cart_items WHERE product_id=?',(p_id,))
            con.execute('DELETE FROM wishlists WHERE product_id=?',(p_id,))
            con.execute('DELETE FROM messages WHERE product_id=?',(p_id,))
            con.execute('DELETE FROM products WHERE id=?',(p_id,))
            return out({'ok':True})
        if path=='/api/cart' and method=='GET':
            u=self.require(con)
            rows=con.execute('SELECT p.id,p.name,p.price,p.image_url,p.stock,p.seller_id FROM cart_items c JOIN products p ON p.id=c.product_id WHERE c.user_id=?',(u['id'],)).fetchall()
            return out({'items':[dict(x) for x in rows],'total':sum(x['price'] for x in rows)})
        if path=='/api/cart' and method=='POST':
            u=self.require(con);p_id=int(self.json_body().get('productId',0));p=con.execute('SELECT seller_id,stock FROM products WHERE id=?',(p_id,)).fetchone()
            if not p or not p['stock']:raise ApiError('Barang sudah tidak tersedia.',409)
            if p['seller_id']==u['id']:raise ApiError('Barang milik sendiri tidak bisa dibeli.')
            con.execute('INSERT OR IGNORE INTO cart_items(user_id,product_id) VALUES(?,?)',(u['id'],p_id))
            return out({'ok':True})
        if path.startswith('/api/cart/') and method=='DELETE':
            u=self.require(con);p_id=int(path.rsplit('/',1)[-1]);con.execute('DELETE FROM cart_items WHERE user_id=? AND product_id=?',(u['id'],p_id));return out({'ok':True})
        if path=='/api/orders' and method=='POST':
            u=self.require(con)
            con.execute('BEGIN IMMEDIATE')
            rows=con.execute('SELECT p.* FROM cart_items c JOIN products p ON p.id=c.product_id WHERE c.user_id=?',(u['id'],)).fetchall()
            if not rows:raise ApiError('Keranjang masih kosong.')
            if any(p['stock']!=1 or p['seller_id']==u['id'] for p in rows):raise ApiError('Ada barang yang sudah tidak tersedia atau milik sendiri.',409)
            # Setiap penjual mendapat pesanan terpisah; barang preloved umumnya satu unit.
            by_seller={}
            for item in rows:by_seller.setdefault(item['seller_id'],[]).append(item)
            order_ids=[]
            for seller_items in by_seller.values():
                subtotal=sum(item['price'] for item in seller_items)
                cur=con.execute('INSERT INTO orders(buyer_id,total) VALUES(?,?)',(u['id'],subtotal))
                order_ids.append(cur.lastrowid)
                for item in seller_items:
                    con.execute('INSERT INTO order_items(order_id,product_id,item_name,price) VALUES(?,?,?,?)',(cur.lastrowid,item['id'],item['name'],item['price']))
                    con.execute('UPDATE products SET stock=0 WHERE id=? AND stock=1',(item['id'],))
            con.execute('DELETE FROM cart_items WHERE user_id=?',(u['id'],))
            return out({'ok':True,'orderId':order_ids[0],'orderIds':order_ids,'total':sum(p['price'] for p in rows),'status':'Menunggu konfirmasi'},201)
        if path=='/api/orders' and method=='GET':
            u=self.require(con)
            records=con.execute('SELECT * FROM orders WHERE buyer_id=? ORDER BY id DESC',(u['id'],)).fetchall()
            result=[]
            for order in records:
                d=dict(order);d['items']=[dict(x) for x in con.execute('SELECT item_name,price,product_id FROM order_items WHERE order_id=?',(d['id'],))];result.append(d)
            return out({'orders':result})
        if path=='/api/sales' and method=='GET':
            u=self.require(con)
            rows=con.execute('''SELECT o.id,o.status,o.total,o.created_at,oi.item_name,oi.price,oi.product_id,b.name buyer_name
                FROM order_items oi JOIN orders o ON oi.order_id=o.id
                JOIN products p ON p.id=oi.product_id JOIN users b ON b.id=o.buyer_id
                WHERE p.seller_id=? ORDER BY o.id DESC''',(u['id'],))
            return out({'sales':[dict(row) for row in rows]})
        if path.startswith('/api/orders/') and method=='PATCH':
            u=self.require(con);order_id=int(path.rsplit('/',1)[-1]);status=str(self.json_body().get('status',''))
            transitions={'Menunggu konfirmasi':'Diproses','Diproses':'Dikirim','Dikirim':'Selesai'}
            row=con.execute('''SELECT o.status FROM orders o JOIN order_items oi ON oi.order_id=o.id
                JOIN products p ON p.id=oi.product_id WHERE o.id=? AND p.seller_id=?''',(order_id,u['id'])).fetchone()
            if not row:raise ApiError('Pesanan penjual tidak ditemukan.',404)
            if transitions.get(row['status']) != status:raise ApiError('Urutan status pesanan tidak sesuai.',409)
            con.execute('UPDATE orders SET status=? WHERE id=?',(status,order_id))
            return out({'ok':True,'status':status})
        if path=='/api/wishlist' and method=='GET':
            u=self.require(con);rows=con.execute('SELECT p.*, users.name seller_name FROM wishlists w JOIN products p ON p.id=w.product_id JOIN users ON users.id=p.seller_id WHERE w.user_id=? ORDER BY p.id DESC',(u['id'],))
            return out({'products':[product_dict(x) for x in rows]})
        if path.startswith('/api/wishlist/') and method=='POST':
            u=self.require(con);p_id=int(path.rsplit('/',1)[-1])
            if not con.execute('SELECT 1 FROM products WHERE id=?',(p_id,)).fetchone():raise ApiError('Barang tidak ditemukan.',404)
            existing=con.execute('SELECT 1 FROM wishlists WHERE user_id=? AND product_id=?',(u['id'],p_id)).fetchone()
            if existing:con.execute('DELETE FROM wishlists WHERE user_id=? AND product_id=?',(u['id'],p_id));liked=False
            else:con.execute('INSERT INTO wishlists(user_id,product_id) VALUES(?,?)',(u['id'],p_id));liked=True
            return out({'liked':liked})
        if path=='/api/conversations' and method=='GET':
            u=self.require(con)
            rows=con.execute('''SELECT m.product_id,m.buyer_id,p.name product_name,p.image_url,
                 buyer.name buyer_name,seller.name seller_name,p.seller_id,
                 (SELECT body FROM messages WHERE product_id=m.product_id AND buyer_id=m.buyer_id ORDER BY id DESC LIMIT 1) last_message,
                 (SELECT created_at FROM messages WHERE product_id=m.product_id AND buyer_id=m.buyer_id ORDER BY id DESC LIMIT 1) updated_at
                 FROM (SELECT DISTINCT product_id,buyer_id FROM messages) m
                 JOIN products p ON p.id=m.product_id JOIN users buyer ON buyer.id=m.buyer_id
                 JOIN users seller ON seller.id=p.seller_id
                 WHERE m.buyer_id=? OR p.seller_id=?
                 ORDER BY (SELECT MAX(id) FROM messages WHERE product_id=m.product_id AND buyer_id=m.buyer_id) DESC''',(u['id'],u['id'])).fetchall()
            return out({'conversations':[dict(x) for x in rows]})
        if path=='/api/messages' and method=='GET':
            u=self.require(con);p_id=int(self.param(query,'productId',0));p=con.execute('SELECT seller_id FROM products WHERE id=?',(p_id,)).fetchone()
            if not p:raise ApiError('Barang tidak ditemukan.',404)
            buyer_id=int(self.param(query,'buyerId',u['id'])) if p['seller_id']==u['id'] else u['id']
            if p['seller_id']==u['id'] and buyer_id==u['id']:raise ApiError('Pilih percakapan pembeli.')
            if p['seller_id']!=u['id'] and buyer_id!=u['id']:raise ApiError('Akses ditolak.',403)
            rows=con.execute('SELECT messages.id, messages.sender_id, users.name sender_name, messages.body, messages.created_at FROM messages JOIN users ON users.id=messages.sender_id WHERE product_id=? AND buyer_id=? ORDER BY messages.id',(p_id,buyer_id))
            return out({'messages':[dict(x) for x in rows]})
        if path=='/api/messages' and method=='POST':
            u=self.require(con);v=self.json_body();p_id=int(v.get('productId',0));body=str(v.get('body','')).strip();p=con.execute('SELECT seller_id FROM products WHERE id=?',(p_id,)).fetchone()
            if not p:raise ApiError('Barang tidak ditemukan.',404)
            if not body or len(body)>800:raise ApiError('Pesan harus 1–800 karakter.')
            if p['seller_id']==u['id']:
                buyer_id=int(v.get('buyerId',0))
                if buyer_id==u['id'] or not con.execute('SELECT 1 FROM messages WHERE product_id=? AND buyer_id=?',(p_id,buyer_id)).fetchone():raise ApiError('Pilih percakapan yang sudah masuk.')
            else:buyer_id=u['id']
            con.execute('INSERT INTO messages(product_id,buyer_id,sender_id,body) VALUES(?,?,?,?)',(p_id,buyer_id,u['id'],body))
            return out({'ok':True},201)
        if path=='/api/stats' and method=='GET':
            # Ringkasan database untuk keperluan presentasi saja.
            return out({'users':con.execute('SELECT count(*) FROM users').fetchone()[0],
                        'products':con.execute('SELECT count(*) FROM products').fetchone()[0],
                        'orders':con.execute('SELECT count(*) FROM orders').fetchone()[0],
                        'messages':con.execute('SELECT count(*) FROM messages').fetchone()[0]})
        raise ApiError('Alamat API tidak ditemukan.',404)
    def new_session(self,con,user_id,out):
        token=secrets.token_urlsafe(32)
        con.execute('INSERT INTO sessions(token_hash,user_id) VALUES(?,?)',(hashlib.sha256(token.encode()).hexdigest(),user_id))
        user=con.execute('SELECT id,name,email FROM users WHERE id=?',(user_id,)).fetchone()
        cookie=f'secondin_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800' + ('; Secure' if self.is_https() else '')
        return out({'user':dict(user)},200,cookie)

if __name__=='__main__':
    init_db()
    print(f'\nSECOND IN siap: http://localhost:{PORT}\nAkun: pembeli@secondin.test / demo12345\n      penjual@secondin.test / demo12345\nCtrl+C untuk berhenti.\n')
    # Render mengharuskan bind ke 0.0.0.0 agar URL publik dapat diakses.
    host = '0.0.0.0'
    ThreadingHTTPServer((host,PORT),Handler).serve_forever()
