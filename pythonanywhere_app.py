"""SECOND IN: adaptasi server HTTP bawaan ke WSGI PythonAnywhere.

Tidak mengubah backend, database, HTML/CSS/JS, maupun gambar.
Cara pasang: simpan file ini sebagai pythonanywhere_app.py di samping server.py.
Di WSGI PythonAnywhere: from pythonanywhere_app import application
"""
from __future__ import annotations

import io
import sys
from email.message import Message
from http import HTTPStatus
from wsgiref.util import setup_testing_defaults

from server import Handler, init_db

# Database dibuat pertama kali saat website dijalankan di hosting.
init_db()


class _WSGIHandler(Handler):
    """Menangani 1 permintaan WSGI memakai endpoint Handler asli."""
    def __init__(self, environ):
        self.path = environ.get('PATH_INFO') or '/'
        if environ.get('QUERY_STRING'):
            self.path += '?' + environ['QUERY_STRING']
        self.command = environ.get('REQUEST_METHOD', 'GET').upper()
        self.request_version = 'HTTP/1.1'
        self.requestline = self.command + ' ' + self.path + ' HTTP/1.1'
        self.client_address = (environ.get('REMOTE_ADDR', '127.0.0.1'), 0)
        self.rfile = environ['wsgi.input']
        self.wfile = io.BytesIO()
        self.headers = Message()
        for key, value in environ.items():
            if key.startswith('HTTP_'):
                label = key[5:].replace('_', '-').title()
                self.headers[label] = str(value)
        if environ.get('CONTENT_TYPE'):
            self.headers['Content-Type'] = str(environ['CONTENT_TYPE'])
        if environ.get('CONTENT_LENGTH'):
            self.headers['Content-Length'] = str(environ['CONTENT_LENGTH'])
        # Cookie sesi diberi flag Secure ketika browser memakai HTTPS.
        if not self.headers.get('X-Forwarded-Proto') and environ.get('wsgi.url_scheme'):
            self.headers['X-Forwarded-Proto'] = str(environ['wsgi.url_scheme'])
        self._status_code = 200
        self._response_headers = []

    def send_response(self, code, message=None):
        self._status_code = int(code)

    def send_header(self, keyword, value):
        self._response_headers.append((str(keyword), str(value)))

    def end_headers(self):
        pass

    def log_message(self, format, *args):
        # WSGI server mencatat error sendiri.
        pass


def application(environ, start_response):
    """Entry point untuk WSGI PythonAnywhere."""
    handler = _WSGIHandler(environ)
    try:
        handler.dispatch(handler.command)
    except Exception:
        import traceback
        traceback.print_exc(file=sys.stderr)
        handler._status_code = 500
        handler._response_headers = [('Content-Type', 'text/plain; charset=utf-8')]
        handler.wfile = io.BytesIO(b'Terjadi kesalahan di server SECOND IN.')
    try:
        reason = HTTPStatus(handler._status_code).phrase
    except ValueError:
        reason = 'Unknown'
    status = f'{handler._status_code} {reason}'
    start_response(status, handler._response_headers)
    return [handler.wfile.getvalue()]
