"""Buka SECOND IN dari folder ini, tanpa menimpa server versi lain."""
from __future__ import annotations
import argparse
import json
import sys
import threading
import webbrowser
from http.server import ThreadingHTTPServer
from pathlib import Path


def create_server(handler, preferred_port=8005, host='127.0.0.1'):
    try:
        return ThreadingHTTPServer((host, preferred_port), handler)
    except OSError:
        if preferred_port == 0:
            raise
        # Biarkan sistem memilih port bebas; tidak menghentikan proses lain.
        return ThreadingHTTPServer((host, 0), handler)


def main(argv=None):
    parser=argparse.ArgumentParser(description='Jalankan SECOND IN ETP #5 dari folder ini.')
    parser.add_argument('--no-browser',action='store_true')
    parser.add_argument('--port',type=int,default=8015)
    args=parser.parse_args(argv)
    if not 0<=args.port<=65535:
        parser.error('Port harus antara 0 dan 65535.')
    if sys.version_info<(3,10):
        raise SystemExit('Gunakan Python 3.10 atau lebih baru.')
    root=Path(__file__).resolve().parent
    if any(not (root/name).is_file() for name in ['server.py','marketplace.py','index.html','app.js','market.css']):
        raise SystemExit('Ekstrak seluruh isi ZIP ke satu folder sebelum menjalankan web.')
    from server import Handler, init_db, build_info
    init_db()
    httpd=create_server(Handler,args.port)
    httpd.daemon_threads=True
    info=build_info()
    from google_login import client_id
    browser_host='localhost' if client_id() else '127.0.0.1'
    url=f'http://{browser_host}:{httpd.server_port}/beranda?build={info["build"]}'
    # Satu baris mesin untuk pemeriksaan peluncur; alamat yang dicetak sudah terikat.
    print('SECONDIN_READY '+json.dumps({'url':url,**info}),flush=True)
    print('\nSECOND IN — ETP #5 · REVISI 8 · BERANDA BARU\n',flush=True)
    print('Folder aktif : '+str(root),flush=True)
    print('Buka alamat  : '+url,flush=True)
    print('Katalog -> Beli sekarang -> Alamat -> Pengiriman -> Pembayaran -> Pesanan',flush=True)
    print('Biarkan terminal ini terbuka. Tekan Ctrl+C untuk berhenti.\n',flush=True)
    if not args.no_browser:
        timer=threading.Timer(.8,lambda:webbrowser.open(url,new=2))
        timer.daemon=True
        timer.start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nSECOND IN dihentikan.',flush=True)
    finally:
        httpd.server_close()
    return 0


if __name__=='__main__':
    try:
        raise SystemExit(main())
    except OSError as error:
        raise SystemExit('Web belum bisa dijalankan: '+str(error))
