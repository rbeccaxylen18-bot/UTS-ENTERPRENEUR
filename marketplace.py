"""Fitur belanja SECOND IN. Tetap menggunakan server dan database proyek ETP."""
from __future__ import annotations
import json, re, secrets
from datetime import datetime, timedelta, timezone


def now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')


def clean(value, limit=1000):
    return str(value or '').strip()[:limit]


PAYMENTS = {'bank_transfer': 'Transfer bank', 'qris': 'QRIS', 'ewallet': 'Dompet digital'}
SERVICES = [
    {'code': 'reguler', 'name': 'Reguler', 'days': '2–4 hari', 'base': 15000},
    {'code': 'hemat', 'name': 'Hemat', 'days': '3–6 hari', 'base': 10000},
    {'code': 'cepat', 'name': 'Cepat', 'days': '1–2 hari', 'base': 24000},
]
ACTIVE = ('Menunggu pembayaran', 'Menunggu konfirmasi', 'Diproses', 'Dikirim', 'Diterima', 'Dalam diskusi', 'Selesai')


def migrate(con, online=False):
    columns = {
        'users': ["city TEXT NOT NULL DEFAULT ''", "bio TEXT NOT NULL DEFAULT ''", "phone TEXT NOT NULL DEFAULT ''", "avatar_url TEXT NOT NULL DEFAULT ''", "google_sub TEXT NOT NULL DEFAULT ''"],
        'products': ["brand TEXT NOT NULL DEFAULT ''", "size TEXT NOT NULL DEFAULT ''", "color TEXT NOT NULL DEFAULT ''", "photos_json TEXT NOT NULL DEFAULT '[]'", "archived INTEGER NOT NULL DEFAULT 0"],
        'orders': ["seller_id INTEGER NOT NULL DEFAULT 0", "item_total INTEGER NOT NULL DEFAULT 0", "shipping_cost INTEGER NOT NULL DEFAULT 0", "service_fee INTEGER NOT NULL DEFAULT 0", "address_json TEXT NOT NULL DEFAULT '{}'", "shipping_code TEXT NOT NULL DEFAULT 'reguler'", "payment_method TEXT NOT NULL DEFAULT 'bank_transfer'", "payment_status TEXT NOT NULL DEFAULT 'unpaid'", "tracking_number TEXT NOT NULL DEFAULT ''", "note TEXT NOT NULL DEFAULT ''", "expires_at TEXT NOT NULL DEFAULT ''", "paid_at TEXT NOT NULL DEFAULT ''", "completed_at TEXT NOT NULL DEFAULT ''", "checkout_ref TEXT NOT NULL DEFAULT ''", "dispute_reason TEXT NOT NULL DEFAULT ''", "previous_status TEXT NOT NULL DEFAULT ''"],
        'order_items': ["image_url TEXT NOT NULL DEFAULT ''"],
    }
    for table, definitions in columns.items():
        if online:
            existing = {r['column_name'] for r in con.execute('SELECT column_name FROM information_schema.columns WHERE table_name=?', (table,))}
        else:
            existing = {r['name'] for r in con.execute('PRAGMA table_info(' + table + ')')}
        old_orders = table == 'orders' and 'payment_status' not in existing
        for definition in definitions:
            if definition.split()[0] not in existing:
                con.execute('ALTER TABLE ' + table + ' ADD COLUMN ' + definition)
        if old_orders:
            con.execute("UPDATE orders SET item_total=total,payment_status='paid'")
    primary = 'SERIAL PRIMARY KEY' if online else 'INTEGER PRIMARY KEY AUTOINCREMENT'
    con.executescript(f'''
      CREATE TABLE IF NOT EXISTS google_challenges (
        token_hash TEXT PRIMARY KEY, nonce_hash TEXT NOT NULL, user_id INTEGER NOT NULL DEFAULT 0, expires_at TIMESTAMP NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_google_sub ON users(google_sub) WHERE google_sub<>'';
      CREATE TABLE IF NOT EXISTS addresses (
        id {primary}, user_id INTEGER NOT NULL REFERENCES users(id), label TEXT NOT NULL,
        recipient TEXT NOT NULL, phone TEXT NOT NULL, province TEXT NOT NULL, city TEXT NOT NULL,
        district TEXT NOT NULL, postal_code TEXT NOT NULL, detail TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS order_events (
        id {primary}, order_id INTEGER NOT NULL REFERENCES orders(id), status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS offers (
        id {primary}, product_id INTEGER NOT NULL REFERENCES products(id), buyer_id INTEGER NOT NULL REFERENCES users(id),
        amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', expires_at TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reviews (
        id {primary}, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id), buyer_id INTEGER NOT NULL REFERENCES users(id),
        seller_id INTEGER NOT NULL REFERENCES users(id), rating INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id {primary}, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, body TEXT NOT NULL,
        order_id INTEGER NOT NULL DEFAULT 0, seen INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS follows (
        user_id INTEGER NOT NULL REFERENCES users(id), seller_id INTEGER NOT NULL REFERENCES users(id), PRIMARY KEY(user_id,seller_id)
      );
      CREATE INDEX IF NOT EXISTS idx_order_seller ON orders(seller_id,id);
      CREATE INDEX IF NOT EXISTS idx_address_owner ON addresses(user_id);
      CREATE INDEX IF NOT EXISTS idx_offers_buyer ON offers(buyer_id,product_id,status);
      CREATE INDEX IF NOT EXISTS idx_notifications_owner ON notifications(user_id,id);
    ''')
    con.execute('''UPDATE orders SET seller_id=COALESCE((SELECT p.seller_id FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=orders.id LIMIT 1),0) WHERE seller_id=0''')
    con.execute('''UPDATE order_items SET image_url=COALESCE((SELECT image_url FROM products WHERE id=product_id),'') WHERE image_url='' ''')
    # Lengkapi merek yang memang tertulis pada nama produk awal, tanpa membuat data baru.
    brands = [('Mizuno','Mizuno Celana Sport Size 29'),('Fladeo','Fladeo Flat Shoes ORI Hitam Wanita Kantoran'),('FROSTOR','Ransel Kuliah FROSTOR'),('Adidas','Adidas Jaket Sport'),('Adidas','Adidas Samba'),('Bostanten','Tas Bostanten Belum Dipakai ORI')]
    for brand,name in brands:
        con.execute("UPDATE products SET brand=? WHERE name=? AND brand=''",(brand,name))
    con.execute("UPDATE products SET size='29' WHERE name='Mizuno Celana Sport Size 29' AND size=''")
    for o in con.execute('SELECT id,status,created_at FROM orders WHERE NOT EXISTS (SELECT 1 FROM order_events WHERE order_id=orders.id)').fetchall():
        event(con, o['id'], o['status'], 'Riwayat pesanan', str(o['created_at']))


def event(con, order_id, status, note='', timestamp=None):
    con.execute('INSERT INTO order_events(order_id,status,note,created_at) VALUES(?,?,?,?)', (order_id,status,note,timestamp or now()))


def notify(con, user_id, title, body, order_id=0):
    if user_id:
        con.execute('INSERT INTO notifications(user_id,title,body,order_id,created_at) VALUES(?,?,?,?,?)', (user_id,title,body,order_id,now()))


def release_stock(con, order_id):
    con.execute("""UPDATE products SET stock=1 WHERE id IN (SELECT product_id FROM order_items WHERE order_id=?)
      AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=products.id AND o.id<>? AND o.status IN ('Menunggu pembayaran','Menunggu konfirmasi','Diproses','Dikirim','Diterima','Dalam diskusi','Selesai'))""", (order_id,order_id))


def expire(con):
    rows=con.execute("SELECT id,buyer_id FROM orders WHERE status='Menunggu pembayaran' AND expires_at<>'' AND expires_at<?",(now(),)).fetchall()
    for o in rows:
        con.execute("UPDATE orders SET status='Kedaluwarsa',payment_status='expired' WHERE id=?",(o['id'],))
        release_stock(con,o['id']);event(con,o['id'],'Kedaluwarsa','Batas pembayaran telah berakhir.')
        notify(con,o['buyer_id'],'Batas pembayaran berakhir','Pesanan dibatalkan dan barang kembali tersedia.',o['id'])


def public_product(row):
    p=dict(row);p['like_count']=int(p.get('like_count',0));p['available']=bool(p.get('stock')) and not p.get('archived')
    try: p['photos']=json.loads(p.get('photos_json') or '[]')
    except ValueError: p['photos']=[]
    if not p['photos']: p['photos']=[p.get('image_url','')]
    return p


PRODUCT_SQL='''SELECT p.*,u.name seller_name,u.city seller_city,
 (SELECT AVG(rating) FROM reviews WHERE seller_id=p.seller_id) seller_rating,
 (SELECT COUNT(*) FROM reviews WHERE seller_id=p.seller_id) review_count,
 (SELECT COUNT(*) FROM wishlists WHERE product_id=p.id) like_count
 FROM products p JOIN users u ON u.id=p.seller_id'''


def seller_data(con, seller_id, viewer=0):
    row=con.execute('SELECT id,name,city,bio,avatar_url,created_at FROM users WHERE id=?',(seller_id,)).fetchone()
    if not row:return None
    d=dict(row)
    d['reviews']=[dict(r) for r in con.execute('''SELECT r.rating,r.body,r.created_at,u.name buyer_name FROM reviews r JOIN users u ON u.id=r.buyer_id WHERE seller_id=? ORDER BY r.id DESC LIMIT 30''',(seller_id,))]
    r=con.execute('SELECT AVG(rating) rating,COUNT(*) count FROM reviews WHERE seller_id=?',(seller_id,)).fetchone()
    d['rating']=r['rating'];d['review_count']=r['count']
    d['sold']=con.execute("SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.seller_id=? AND o.status='Selesai'",(seller_id,)).fetchone()[0]
    d['following']=bool(con.execute('SELECT 1 FROM follows WHERE user_id=? AND seller_id=?',(viewer,seller_id)).fetchone())
    d['followers']=con.execute('SELECT COUNT(*) FROM follows WHERE seller_id=?',(seller_id,)).fetchone()[0]
    return d


def quote(con,u,v,error):
    ids=v.get('product_ids')
    if not isinstance(ids,list) or not ids or len(ids)>50:raise error('Pilih barang yang ingin dibeli.')
    if any(type(i) is not int or i<1 for i in ids):raise error('Pilihan barang tidak valid.')
    ids=list(dict.fromkeys(ids));products=[]
    for pid in sorted(ids):
        sql=PRODUCT_SQL+' WHERE p.id=?'
        if hasattr(con,'connection'):sql+=' FOR UPDATE OF p'
        row=con.execute(sql,(pid,)).fetchone()
        if not row or not row['stock'] or row['archived']:raise error('Salah satu barang sudah tidak tersedia. Periksa keranjangmu.',409)
        p=public_product(row)
        if p['seller_id']==u['id']:raise error('Barang milik sendiri tidak bisa dibeli.')
        if v.get('source')!='direct' and not con.execute('SELECT 1 FROM cart_items WHERE user_id=? AND product_id=?',(u['id'],pid)).fetchone():raise error('Barang tidak ada di keranjangmu.',409)
        offer=con.execute("SELECT id,amount FROM offers WHERE product_id=? AND buyer_id=? AND status='accepted' AND expires_at>? ORDER BY id DESC LIMIT 1",(pid,u['id'],now())).fetchone()
        p['original_price']=p['price'];p['offer_id']=offer['id'] if offer else None
        if offer:p['price']=offer['amount']
        products.append(p)
    address_id=int(v.get('address_id') or 0)
    address=con.execute('SELECT * FROM addresses WHERE id=? AND user_id=?',(address_id,u['id'])).fetchone() if address_id else None
    if address_id and not address:raise error('Alamat tidak ditemukan di akunmu.',404)
    if v.get('require_address') and not address:raise error('Pilih alamat pengiriman terlebih dahulu.')
    choices=v.get('shipping') or {}
    if not isinstance(choices,dict):raise error('Pilihan pengiriman tidak valid.')
    groups={}
    for p in products:groups.setdefault(p['seller_id'],[]).append(p)
    groups_out=[]
    for seller,items in groups.items():
        selected=choices.get(str(seller),'reguler')
        service=next((s for s in SERVICES if s['code']==selected),None)
        if not service:raise error('Layanan pengiriman tidak valid.')
        # Estimasi lokal, bukan tarif atau booking kurir yang sebenarnya.
        extra=6000 if address and items[0]['seller_city'] and address['city'].casefold()!=items[0]['seller_city'].casefold() else 0
        rates=[{**s,'cost':s['base']+extra} for s in SERVICES]
        shipping=service['base']+extra;subtotal=sum(p['price'] for p in items)
        groups_out.append({'seller_id':seller,'seller_name':items[0]['seller_name'],'origin':items[0]['seller_city'],'items':items,'item_total':subtotal,'shipping_cost':shipping,'shipping_code':selected,'services':rates,'service_fee':0,'total':subtotal+shipping})
    return {'groups':groups_out,'address':dict(address) if address else None,'item_total':sum(g['item_total'] for g in groups_out),'shipping_cost':sum(g['shipping_cost'] for g in groups_out),'service_fee':0,'total':sum(g['total'] for g in groups_out),'simulation':True}


def order_data(con,o):
    d=dict(o);d['items']=[dict(r) for r in con.execute('SELECT * FROM order_items WHERE order_id=?',(o['id'],))]
    d['events']=[dict(r) for r in con.execute('SELECT status,note,created_at FROM order_events WHERE order_id=? ORDER BY id',(o['id'],))]
    try:d['address']=json.loads(d.get('address_json') or '{}')
    except ValueError:d['address']={}
    d.pop('address_json',None)
    d['review']=dict(r) if (r:=con.execute('SELECT rating,body FROM reviews WHERE order_id=?',(o['id'],)).fetchone()) else None
    d['reference']='SI-'+str(o['id']).zfill(6)
    return d


def handle(h,con,method,path,query,ApiError):
    out=lambda data,status=200,cookie=None:(data,status,cookie)
    expire(con)
    if path=='/api/products' and method=='GET':
        sql=PRODUCT_SQL+' WHERE p.archived=0';params=[]
        for key,column in [('category','p.category'),('condition','p.condition'),('brand','p.brand'),('size','p.size')]:
            v=h.param(query,key,'semua')
            if v and v!='semua':sql+=' AND LOWER('+column+')=LOWER(?)';params.append(v)
        q=clean(h.param(query,'q'),120).lower()
        if q:sql+=' AND (LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(p.brand) LIKE ? OR LOWER(u.name) LIKE ?)';params.extend(['%'+q+'%']*4)
        city=clean(h.param(query,'city'),80)
        if city:sql+=' AND LOWER(u.city) LIKE ?';params.append('%'+city.lower()+'%')
        minimum=h.param(query,'min');maximum=h.param(query,'max')
        if minimum and maximum and int(minimum)>int(maximum):raise ApiError('Harga minimum tidak boleh melebihi maksimum.')
        for v,op in [(minimum,'>='),(maximum,'<=')]:
            if v:
                if int(v)<0:raise ApiError('Harga tidak boleh negatif.')
                sql+=' AND p.price'+op+'?';params.append(int(v))
        if h.param(query,'availability')=='available':sql+=' AND p.stock=1'
        sql+={'low':' ORDER BY p.price ASC,p.id DESC','high':' ORDER BY p.price DESC,p.id DESC','name':' ORDER BY LOWER(p.name),p.id DESC'}.get(h.param(query,'sort'),' ORDER BY p.id DESC')
        return out({'products':[public_product(r) for r in con.execute(sql,params)]})
    if path=='/api/products/my' and method=='GET':
        u=h.require(con)
        return out({'products':[public_product(r) for r in con.execute(PRODUCT_SQL+' WHERE p.seller_id=? ORDER BY p.id DESC',(u['id'],))]})
    if (path=='/api/products' and method=='POST') or (re.fullmatch(r'/api/products/\d+',path) and method=='PATCH'):
        u=h.require(con);v=h.json_body();pid=int(path.rsplit('/',1)[-1]) if method=='PATCH' else None
        old=con.execute('SELECT * FROM products WHERE id=? AND seller_id=?',(pid,u['id'])).fetchone() if pid else None
        if pid and not old:raise ApiError('Barang tidak ditemukan di akunmu.',404)
        if old and not old['stock']:raise ApiError('Barang yang sedang dipesan tidak bisa diedit.',409)
        name=clean(v.get('name'),120);category=clean(v.get('category'),40);condition=clean(v.get('condition'),40);price=v.get('price')
        if len(name)<3 or type(price) is not int or not 1000<=price<=100000000:raise ApiError('Isi nama dan harga barang yang sesuai.')
        if category not in ('pakaian','tas','sepatu','aksesori','elektronik','perabotan rumah','lainnya') or condition not in ('Sangat baik','Kondisi baik','Layak pakai','Cukup baik'):raise ApiError('Kategori atau kondisi tidak valid.')
        photos=v.get('photos') or ([v.get('image_url')] if v.get('image_url') else [])
        if not isinstance(photos,list) or not 1<=len(photos)<=5 or any(not isinstance(src,str) or not (re.fullmatch(r'/uploads/[a-f0-9]{32}\.(png|jpg)',src) or src.startswith(('https://','http://'))) for src in photos):raise ApiError('Tambahkan 1–5 foto JPG atau PNG.')
        values=[name,category,price,condition,clean(v.get('description'),2000),photos[0],clean(v.get('brand'),60),clean(v.get('size'),30),clean(v.get('color'),30),json.dumps(photos),1 if v.get('archived') else 0]
        if pid:
            con.execute('UPDATE products SET name=?,category=?,price=?,condition=?,description=?,image_url=?,brand=?,size=?,color=?,photos_json=?,archived=? WHERE id=?',values+[pid])
        else:pid=con.execute('INSERT INTO products(name,category,price,condition,description,image_url,brand,size,color,photos_json,archived,seller_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',values+[u['id']]).lastrowid
        return out({'id':pid,'ok':True},201 if method=='POST' else 200)
    if re.fullmatch(r'/api/products/\d+',path) and method=='DELETE':
        u=h.require(con);pid=int(path.rsplit('/',1)[-1]);old=con.execute('SELECT * FROM products WHERE id=? AND seller_id=?',(pid,u['id'])).fetchone()
        if not old:raise ApiError('Barang tidak ditemukan di akunmu.',404)
        if not old['stock']:raise ApiError('Barang yang dipesan tidak dapat diarsipkan.',409)
        con.execute('UPDATE products SET archived=1 WHERE id=?',(pid,));return out({'ok':True})
    if path=='/api/cart' and method=='GET':
        u=h.require(con);items=[public_product(r) for r in con.execute(PRODUCT_SQL+' JOIN cart_items c ON c.product_id=p.id WHERE c.user_id=? ORDER BY p.seller_id,p.id',(u['id'],))]
        return out({'items':items,'total':sum(p['price'] for p in items)})
    if path=='/api/cart' and method=='POST':
        u=h.require(con);pid=int(h.json_body().get('productId') or 0);p=con.execute('SELECT * FROM products WHERE id=?',(pid,)).fetchone()
        if not p or not p['stock'] or p['archived']:raise ApiError('Barang sudah tidak tersedia.',409)
        if p['seller_id']==u['id']:raise ApiError('Barang sendiri tidak bisa dibeli.')
        con.execute('INSERT OR IGNORE INTO cart_items(user_id,product_id) VALUES(?,?)',(u['id'],pid));return out({'ok':True})
    if path=='/api/catalog-options' and method=='GET':
        return out({'brands':[r[0] for r in con.execute("SELECT DISTINCT brand FROM products WHERE brand<>'' AND archived=0 ORDER BY brand")],'sizes':[r[0] for r in con.execute("SELECT DISTINCT size FROM products WHERE size<>'' AND archived=0 ORDER BY size")]})
    if re.fullmatch(r'/api/products/\d+',path) and method=='GET':
        p=con.execute(PRODUCT_SQL+' WHERE p.id=?',(int(path.rsplit('/',1)[-1]),)).fetchone()
        if not p:raise ApiError('Barang tidak ditemukan.',404)
        viewer=h.user(con);return out({'product':public_product(p),'seller':seller_data(con,p['seller_id'],viewer['id'] if viewer else 0)})
    if re.fullmatch(r'/api/sellers/\d+',path):
        sid=int(path.rsplit('/',1)[-1]);viewer=h.user(con)
        if method=='GET':
            seller=seller_data(con,sid,viewer['id'] if viewer else 0)
            if not seller:raise ApiError('Penjual tidak ditemukan.',404)
            return out({'seller':seller,'products':[public_product(p) for p in con.execute(PRODUCT_SQL+' WHERE p.seller_id=? AND p.archived=0 ORDER BY p.id DESC',(sid,))]})
        if method=='POST':
            u=h.require(con)
            if sid==u['id']:raise ApiError('Kamu tidak perlu mengikuti toko sendiri.')
            if not seller_data(con,sid):raise ApiError('Penjual tidak ditemukan.',404)
            exists=con.execute('SELECT 1 FROM follows WHERE user_id=? AND seller_id=?',(u['id'],sid)).fetchone()
            if exists:con.execute('DELETE FROM follows WHERE user_id=? AND seller_id=?',(u['id'],sid))
            else:con.execute('INSERT INTO follows(user_id,seller_id) VALUES(?,?)',(u['id'],sid))
            return out({'following':not bool(exists)})
    if path=='/api/profile/photo' and method in ('POST','DELETE'):
        u=h.require(con)
        avatar=h.uploaded_photo() if method=='POST' else ''
        con.execute('UPDATE users SET avatar_url=? WHERE id=?',(avatar,u['id']))
        return out({'user':h.user(con)})
    if path=='/api/profile' and method=='PATCH':
        u=h.require(con);v=h.json_body();name=clean(v.get('name'),80);phone=clean(v.get('phone'),20)
        if len(name)<2 or (phone and not re.fullmatch(r'[+\d\s-]{8,20}',phone)):raise ApiError('Periksa nama dan nomor teleponmu.')
        con.execute('UPDATE users SET name=?,city=?,bio=?,phone=? WHERE id=?',(name,clean(v.get('city'),80),clean(v.get('bio'),500),phone,u['id']))
        return out({'user':h.user(con)})
    if path=='/api/addresses' and method=='GET':
        u=h.require(con);return out({'addresses':[dict(r) for r in con.execute('SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC,id DESC',(u['id'],))]})
    if (path=='/api/addresses' and method=='POST') or (re.fullmatch(r'/api/addresses/\d+',path) and method=='PATCH'):
        u=h.require(con);v=h.json_body();fields={k:clean(v.get(k),lim) for k,lim in [('label',40),('recipient',80),('phone',20),('province',80),('city',80),('district',80),('postal_code',5),('detail',500)]}
        if not all(fields.values()) or not re.fullmatch(r'[+\d\s-]{8,20}',fields['phone']) or not re.fullmatch(r'\d{5}',fields['postal_code']) or len(fields['detail'])<10:raise ApiError('Lengkapi alamat, telepon valid, dan kode pos 5 angka.')
        address_id=int(path.rsplit('/',1)[-1]) if method=='PATCH' else None
        if address_id and not con.execute('SELECT 1 FROM addresses WHERE id=? AND user_id=?',(address_id,u['id'])).fetchone():raise ApiError('Alamat tidak ditemukan.',404)
        default=1 if v.get('is_default') or not con.execute('SELECT 1 FROM addresses WHERE user_id=?',(u['id'],)).fetchone() else 0
        if default:con.execute('UPDATE addresses SET is_default=0 WHERE user_id=?',(u['id'],))
        values=list(fields.values())+[default]
        if address_id:con.execute('UPDATE addresses SET label=?,recipient=?,phone=?,province=?,city=?,district=?,postal_code=?,detail=?,is_default=? WHERE id=? AND user_id=?',values+[address_id,u['id']])
        else:address_id=con.execute('INSERT INTO addresses(label,recipient,phone,province,city,district,postal_code,detail,is_default,user_id) VALUES(?,?,?,?,?,?,?,?,?,?)',values+[u['id']]).lastrowid
        return out({'id':address_id},201 if method=='POST' else 200)
    if re.fullmatch(r'/api/addresses/\d+',path) and method=='DELETE':
        u=h.require(con);con.execute('DELETE FROM addresses WHERE id=? AND user_id=?',(int(path.rsplit('/',1)[-1]),u['id']))
        row=con.execute('SELECT id FROM addresses WHERE user_id=? ORDER BY is_default DESC,id DESC LIMIT 1',(u['id'],)).fetchone()
        if row:con.execute('UPDATE addresses SET is_default=1 WHERE id=?',(row['id'],))
        return out({'ok':True})
    if path=='/api/checkout/quote' and method=='POST':
        u=h.require(con);return out(quote(con,u,h.json_body(),ApiError))
    if path=='/api/orders' and method=='POST':
        u=h.require(con);v=h.json_body();key=clean(v.get('checkout_ref'),100)
        if not re.fullmatch(r'[a-zA-Z0-9_-]{8,100}',key):raise ApiError('Muat ulang checkout dan coba lagi.')
        previous=con.execute('SELECT id FROM orders WHERE buyer_id=? AND checkout_ref=?',(u['id'],key)).fetchall()
        if previous:return out({'orderIds':[r['id'] for r in previous],'orderId':previous[0]['id']})
        if v.get('payment_method') not in PAYMENTS:raise ApiError('Pilih metode pembayaran.')
        v['require_address']=True;summary=quote(con,u,v,ApiError);ids=[]
        deadline=(datetime.now(timezone.utc)+timedelta(minutes=30)).strftime('%Y-%m-%d %H:%M:%S')
        for g in summary['groups']:
            oid=con.execute('''INSERT INTO orders(buyer_id,seller_id,total,status,item_total,shipping_cost,service_fee,address_json,shipping_code,payment_method,note,expires_at,checkout_ref)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)''',(u['id'],g['seller_id'],g['total'],'Menunggu pembayaran',g['item_total'],g['shipping_cost'],0,json.dumps(summary['address'],ensure_ascii=False),g['shipping_code'],v['payment_method'],clean(v.get('note'),500),deadline,key)).lastrowid
            ids.append(oid)
            for p in g['items']:
                con.execute('INSERT INTO order_items(order_id,product_id,item_name,price,image_url) VALUES(?,?,?,?,?)',(oid,p['id'],p['name'],p['price'],p['image_url']))
                updated=con.execute('UPDATE products SET stock=0 WHERE id=? AND stock=1',(p['id'],))
                if getattr(updated,'rowcount',1)==0:raise ApiError('Barang baru saja dipesan pembeli lain.',409)
                con.execute('DELETE FROM cart_items WHERE user_id=? AND product_id=?',(u['id'],p['id']))
            event(con,oid,'Menunggu pembayaran','Pesanan dibuat. Batas pembayaran 30 menit.')
            notify(con,u['id'],'Selesaikan pembayaran','Pesananmu sudah dibuat. Lanjutkan ke halaman pembayaran.',oid)
        return out({'orderIds':ids,'orderId':ids[0],'total':summary['total']},201)
    if path in ('/api/orders','/api/sales') and method=='GET':
        u=h.require(con);role='seller_id' if path.endswith('/sales') else 'buyer_id'
        rows=con.execute('''SELECT o.*,b.name buyer_name,s.name seller_name FROM orders o JOIN users b ON b.id=o.buyer_id LEFT JOIN users s ON s.id=o.seller_id WHERE o.'''+role+'=? ORDER BY o.id DESC',(u['id'],))
        orders=[order_data(con,o) for o in rows];return out({'orders':orders,'sales':orders})
    if re.fullmatch(r'/api/orders/\d+',path) and method=='GET':
        u=h.require(con);o=con.execute('SELECT o.*,b.name buyer_name,s.name seller_name FROM orders o JOIN users b ON b.id=o.buyer_id LEFT JOIN users s ON s.id=o.seller_id WHERE o.id=?',(int(path.rsplit('/',1)[-1]),)).fetchone()
        if not o or u['id'] not in (o['buyer_id'],o['seller_id']):raise ApiError('Pesanan tidak ditemukan.',404)
        return out({'order':order_data(con,o)})
    if re.fullmatch(r'/api/orders/\d+/pay',path) and method=='POST':
        u=h.require(con);oid=int(path.split('/')[-2]);v=h.json_body()
        if v.get('simulation') is not True:raise ApiError('Gunakan tombol simulasi pembayaran. Belum ada tagihan uang sungguhan.')
        o=con.execute('SELECT * FROM orders WHERE id=? AND buyer_id=?',(oid,u['id'])).fetchone()
        if not o:raise ApiError('Pesanan tidak ditemukan.',404)
        if o['payment_status']=='paid':return out({'ok':True})
        if o['status']!='Menunggu pembayaran':raise ApiError('Pesanan ini tidak dapat dibayar.',409)
        con.execute("UPDATE orders SET status='Diproses',payment_status='paid',paid_at=? WHERE id=?",(now(),oid))
        event(con,oid,'Diproses','Pembayaran simulasi berhasil. Menunggu penjual mengirim barang.')
        notify(con,o['seller_id'],'Pesanan baru','Pembayaran simulasi berhasil. Siapkan barang untuk dikirim.',oid)
        notify(con,u['id'],'Pembayaran berhasil','Pembayaran simulasi tercatat. Pesanan menunggu pengiriman.',oid)
        for p in con.execute('SELECT product_id FROM order_items WHERE order_id=?',(oid,)):
            con.execute("UPDATE offers SET status='used' WHERE product_id=? AND buyer_id=? AND status='accepted'",(p['product_id'],u['id']))
        return out({'ok':True})
    if re.fullmatch(r'/api/orders/\d+',path) and method=='PATCH':
        u=h.require(con);oid=int(path.rsplit('/',1)[-1]);v=h.json_body();o=con.execute('SELECT * FROM orders WHERE id=?',(oid,)).fetchone()
        if not o or u['id'] not in (o['buyer_id'],o['seller_id']):raise ApiError('Pesanan tidak ditemukan.',404)
        buyer=u['id']==o['buyer_id'];action=v.get('action') or v.get('status');status=o['status'];note=''
        if action in ('cancel','Dibatalkan'):
            if status not in ('Menunggu pembayaran','Menunggu konfirmasi','Diproses'):raise ApiError('Pesanan ini tidak dapat dibatalkan lagi.',409)
            target='Dibatalkan';note=clean(v.get('reason'),500) or 'Pesanan dibatalkan.'
            if o['payment_status']=='paid':con.execute("UPDATE orders SET payment_status='refunded' WHERE id=?",(oid,));note+=' Pengembalian pembayaran simulasi dicatat.'
            release_stock(con,oid)
        elif action in ('ship','Dikirim') and not buyer and status=='Diproses':
            tracking=clean(v.get('tracking_number'),80)
            if not tracking:raise ApiError('Masukkan nomor resi pengiriman.')
            con.execute('UPDATE orders SET tracking_number=? WHERE id=?',(tracking,oid));target='Dikirim';note='Resi: '+tracking
        elif action=='arrived' and buyer and status=='Dikirim':target='Diterima';note='Pembeli menyatakan paket sudah tiba. Periksa barang sebelum menyelesaikan pesanan.'
        elif action in ('complete','Selesai') and buyer and status in ('Dikirim','Diterima'):
            target='Selesai';note='Barang sesuai dan pesanan diselesaikan pembeli.';con.execute('UPDATE orders SET completed_at=? WHERE id=?',(now(),oid))
        elif action=='dispute' and buyer and status in ('Diproses','Dikirim','Diterima'):
            note=clean(v.get('reason'),1000)
            if len(note)<10:raise ApiError('Ceritakan kendala minimal 10 karakter.')
            target='Dalam diskusi';con.execute('UPDATE orders SET dispute_reason=?,previous_status=? WHERE id=?',(note,status,oid))
        elif action=='withdraw_dispute' and buyer and status=='Dalam diskusi':target=o['previous_status'];note='Pembeli menutup kendala dan melanjutkan pesanan.'
        elif action=='refund' and not buyer and status=='Dalam diskusi':
            target='Dikembalikan';note='Penjual menyetujui pengembalian pembayaran simulasi. Sepakati pengembalian barang lewat chat.';con.execute("UPDATE orders SET payment_status='refunded' WHERE id=?",(oid,))
        elif action=='Diproses' and not buyer and status=='Menunggu konfirmasi':target='Diproses';note='Penjual mengonfirmasi pesanan sebelumnya.'
        else:raise ApiError('Tindakan ini tidak tersedia untuk status atau akunmu.',409)
        con.execute('UPDATE orders SET status=? WHERE id=?',(target,oid));event(con,oid,target,note)
        notify(con,o['seller_id'] if buyer else o['buyer_id'],'Status pesanan berubah',target,oid)
        return out({'ok':True,'status':target})
    if path=='/api/reviews' and method=='POST':
        u=h.require(con);v=h.json_body();o=con.execute("SELECT * FROM orders WHERE id=? AND buyer_id=? AND status='Selesai'",(int(v.get('order_id') or 0),u['id'])).fetchone()
        if not o:raise ApiError('Ulasan hanya untuk pembelianmu yang sudah selesai.',403)
        rating=v.get('rating');body=clean(v.get('body'),1000)
        if type(rating) is not int or not 1<=rating<=5 or len(body)<5:raise ApiError('Pilih bintang 1–5 dan tulis ulasan minimal 5 karakter.')
        if con.execute('SELECT 1 FROM reviews WHERE order_id=?',(o['id'],)).fetchone():raise ApiError('Pesanan ini sudah diulas.',409)
        con.execute('INSERT INTO reviews(order_id,buyer_id,seller_id,rating,body,created_at) VALUES(?,?,?,?,?,?)',(o['id'],u['id'],o['seller_id'],rating,body,now()))
        notify(con,o['seller_id'],'Ulasan baru','Pembeli memberikan ulasan untuk pesananmu.',o['id']);return out({'ok':True},201)
    if path=='/api/offers' and method=='POST':
        u=h.require(con);v=h.json_body();pid=int(v.get('product_id') or 0);amount=v.get('amount');p=con.execute('SELECT * FROM products WHERE id=?',(pid,)).fetchone()
        if not p or not p['stock'] or p['archived']:raise ApiError('Barang sudah tidak tersedia.',409)
        if p['seller_id']==u['id']:raise ApiError('Kamu tidak dapat menawar barang sendiri.')
        if type(amount) is not int or not 1000<=amount<p['price']:raise ApiError('Tawaran harus minimal Rp1.000 dan lebih rendah dari harga barang.')
        con.execute("UPDATE offers SET status='replaced' WHERE product_id=? AND buyer_id=? AND status IN ('pending','accepted')",(pid,u['id']))
        deadline=(datetime.now(timezone.utc)+timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S')
        oid=con.execute('INSERT INTO offers(product_id,buyer_id,amount,expires_at,created_at) VALUES(?,?,?,?,?)',(pid,u['id'],amount,deadline,now())).lastrowid
        con.execute('INSERT INTO messages(product_id,buyer_id,sender_id,body) VALUES(?,?,?,?)',(pid,u['id'],u['id'],'Mengajukan tawaran Rp'+format(amount,',').replace(',','.')))
        notify(con,p['seller_id'],'Tawaran baru',p['name']);return out({'id':oid},201)
    if path=='/api/offers' and method=='GET':
        u=h.require(con);pid=int(h.param(query,'productId',0));p=con.execute('SELECT seller_id FROM products WHERE id=?',(pid,)).fetchone()
        if not p:raise ApiError('Barang tidak ditemukan.',404)
        buyer=int(h.param(query,'buyerId',u['id'])) if p['seller_id']==u['id'] else u['id']
        rows=con.execute('SELECT * FROM offers WHERE product_id=? AND buyer_id=? ORDER BY id DESC LIMIT 10',(pid,buyer))
        offers=[]
        for row in rows:
            d=dict(row)
            if d['expires_at']<now() and d['status'] in ('pending','accepted'):d['status']='expired'
            offers.append(d)
        return out({'offers':offers})
    if re.fullmatch(r'/api/offers/\d+',path) and method=='PATCH':
        u=h.require(con);v=h.json_body();offer=con.execute('SELECT f.*,p.seller_id,p.stock FROM offers f JOIN products p ON p.id=f.product_id WHERE f.id=?',(int(path.rsplit('/',1)[-1]),)).fetchone()
        if not offer or offer['seller_id']!=u['id']:raise ApiError('Tawaran tidak ditemukan.',404)
        if offer['status']!='pending' or offer['expires_at']<now() or not offer['stock']:raise ApiError('Tawaran sudah tidak aktif.',409)
        status=v.get('status')
        if status not in ('accepted','declined'):raise ApiError('Respons tawaran tidak valid.')
        con.execute('UPDATE offers SET status=?,expires_at=? WHERE id=?',(status,(datetime.now(timezone.utc)+timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S'),offer['id']))
        con.execute('INSERT INTO messages(product_id,buyer_id,sender_id,body) VALUES(?,?,?,?)',(offer['product_id'],offer['buyer_id'],u['id'],'Tawaran diterima. Harga berlaku di checkout selama 24 jam.' if status=='accepted' else 'Tawaran belum dapat diterima.'))
        notify(con,offer['buyer_id'],'Tawaran '+('diterima' if status=='accepted' else 'ditolak'),'Buka percakapan untuk melanjutkan.');return out({'ok':True})
    if path=='/api/notifications' and method=='GET':
        u=h.require(con);return out({'notifications':[dict(r) for r in con.execute('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100',(u['id'],))],'unread':con.execute('SELECT COUNT(*) FROM notifications WHERE user_id=? AND seen=0',(u['id'],)).fetchone()[0]})
    if path=='/api/notifications' and method=='PATCH':
        u=h.require(con);con.execute('UPDATE notifications SET seen=1 WHERE user_id=?',(u['id'],));return out({'ok':True})
    if path=='/api/seller-summary' and method=='GET':
        u=h.require(con);row=con.execute("SELECT COUNT(*) count,COALESCE(SUM(item_total),0) income FROM orders WHERE seller_id=? AND status='Selesai'",(u['id'],)).fetchone()
        return out({'completed':row['count'],'income':row['income'],'active_products':con.execute('SELECT COUNT(*) FROM products WHERE seller_id=? AND stock=1 AND archived=0',(u['id'],)).fetchone()[0]})
    return None
