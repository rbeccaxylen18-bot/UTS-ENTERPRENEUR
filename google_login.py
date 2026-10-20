"""Google Identity Services: token diverifikasi di server, bukan dari email kiriman browser."""
import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie, CookieError
from pathlib import Path
from urllib.parse import urlsplit


def client_id():
    value = os.environ.get('GOOGLE_CLIENT_ID', '').strip()
    if not value:
        try:
            value = str(json.loads((Path(__file__).parent/'google_config.json').read_text()).get('client_id', '')).strip()
        except (OSError, ValueError, TypeError):
            value = ''
    return value if re.fullmatch(r'[A-Za-z0-9_-]+\.apps\.googleusercontent\.com', value) else ''


def ready():
    if not client_id():
        return False
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests
        return True
    except ImportError:
        return False


def verify_credential(credential, audience):
    from google.oauth2 import id_token
    from google.auth.transport import requests
    request = requests.Request()
    def transport(*args, **kwargs):
        kwargs['timeout'] = 10
        return request(*args, **kwargs)
    return id_token.verify_oauth2_token(credential, transport, audience)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def handle(h, con, method, path, ApiError, password_hash):
    out = lambda data, status=200, cookie=None: (data, status, cookie)
    if path == '/api/auth/config' and method == 'GET':
        enabled = ready()
        return out({'google_enabled': enabled, 'google_client_id': client_id() if enabled else ''})
    if path not in ('/api/auth/google/nonce', '/api/auth/google'):
        return None
    if not ready():
        raise ApiError('Login Google belum tersedia. Silakan masuk dengan email.', 503)
    origin = h.headers.get('Origin', '')
    if origin:
        parsed=urlsplit(origin)
        if parsed.netloc != h.headers.get('Host', '') or parsed.scheme != ('https' if h.is_https() else 'http'):
            raise ApiError('Permintaan login tidak valid.', 403)
    if path == '/api/auth/google/nonce' and method == 'POST':
        token, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        current = h.user(con)
        expires = (datetime.now(timezone.utc)+timedelta(minutes=10)).strftime('%Y-%m-%d %H:%M:%S')
        con.execute("DELETE FROM google_challenges WHERE expires_at<CURRENT_TIMESTAMP")
        con.execute('INSERT INTO google_challenges(token_hash,nonce_hash,user_id,expires_at) VALUES(?,?,?,?)',
                    (digest(token), digest(nonce), current['id'] if current else 0, expires))
        cookie = 'secondin_google='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=600'+('; Secure' if h.is_https() else '')
        return out({'nonce': nonce}, 200, cookie)
    if path != '/api/auth/google' or method != 'POST':
        raise ApiError('Metode tidak didukung.', 405)
    cookies = SimpleCookie()
    try:
        cookies.load(h.headers.get('Cookie', ''))
        token = cookies['secondin_google'].value
    except (KeyError, ValueError, CookieError):
        raise ApiError('Ulangi login Google dari halaman Masuk.', 401)
    challenge = con.execute('SELECT * FROM google_challenges WHERE token_hash=? AND expires_at>CURRENT_TIMESTAMP', (digest(token),)).fetchone()
    current = h.user(con)
    if not challenge or challenge['user_id'] != (current['id'] if current else 0):
        raise ApiError('Sesi login Google habis. Silakan coba lagi.', 401)
    credential = h.json_body().get('credential', '')
    if not isinstance(credential, str) or not 20 <= len(credential) <= 16000:
        raise ApiError('Login Google tidak valid.', 401)
    try:
        claims = verify_credential(credential, client_id())
    except (ValueError, TypeError):
        raise ApiError('Login Google tidak valid. Silakan coba lagi.', 401)
    except Exception:
        raise ApiError('Google belum dapat dihubungi. Coba lagi atau gunakan email.', 503)
    if (claims.get('iss') not in ('accounts.google.com', 'https://accounts.google.com')
            or claims.get('aud') != client_id() or claims.get('email_verified') is not True
            or not hmac.compare_digest(digest(str(claims.get('nonce', ''))), challenge['nonce_hash'])):
        raise ApiError('Login Google tidak valid.', 401)
    subject, email = str(claims.get('sub', '')), str(claims.get('email', '')).strip().lower()
    if not subject or len(subject)>255 or '@' not in email or len(email)>150:
        raise ApiError('Data akun Google tidak lengkap.', 401)
    row = con.execute('SELECT * FROM users WHERE google_sub=?', (subject,)).fetchone()
    if row:
        if current and current['id'] != row['id']:
            raise ApiError('Akun Google ini sudah terhubung ke akun SECOND IN lain.', 409)
        user_id = row['id']
    elif current:
        user = con.execute('SELECT google_sub FROM users WHERE id=?', (current['id'],)).fetchone()
        if user['google_sub']:
            raise ApiError('Akun ini sudah terhubung dengan Google.', 409)
        if current['email'].lower() != email:
            raise ApiError('Pilih akun Google dengan email yang sama dengan akun SECOND IN.', 409)
        user_id = current['id']
        con.execute('UPDATE users SET google_sub=? WHERE id=?', (subject, user_id))
    else:
        if con.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone():
            raise ApiError('Email ini sudah punya akun. Masuk dengan password, lalu hubungkan Google di Akun saya.', 409)
        name = str(claims.get('name') or email.split('@')[0]).strip()[:80]
        if len(name)<2:
            name = 'Pengguna SECOND IN'
        picture = str(claims.get('picture', ''))
        if not re.fullmatch(r'https://[A-Za-z0-9.-]+\.googleusercontent\.com/[^\s]{1,1500}', picture):
            picture = ''
        user_id = con.execute('INSERT INTO users(name,email,password_hash,google_sub,avatar_url) VALUES(?,?,?,?,?)',
                              (name, email, password_hash(secrets.token_urlsafe(48)), subject, picture)).lastrowid
    con.execute('DELETE FROM google_challenges WHERE token_hash=?', (digest(token),))
    return h.new_session(con, int(user_id), out)
