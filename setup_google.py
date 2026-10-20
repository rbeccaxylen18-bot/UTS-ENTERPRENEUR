"""Pengaturan Client ID publik Google Identity Services untuk proyek lokal."""
import json
import re
import subprocess
import sys
from pathlib import Path


def main():
    root=Path(__file__).resolve().parent
    print('AKTIFKAN LOGIN GOOGLE — SECOND IN')
    print('Siapkan OAuth Client ID tipe Web application milik proyek kalian.')
    print('Authorized JavaScript origin lokal: http://localhost:8015')
    value=input('Tempel Client ID (bukan Client Secret): ').strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]+\.apps\.googleusercontent\.com',value):
        raise SystemExit('Client ID belum sesuai. Tidak ada pengaturan yang diubah.')
    subprocess.run([sys.executable,'-m','pip','install','-r',str(root/'requirements-google.txt')],check=True)
    (root/'google_config.json').write_text(json.dumps({'client_id':value},indent=2)+'\n',encoding='utf-8')
    print('Tersimpan. Jalankan BUKA_BERANDA_BARU.bat dan gunakan http://localhost:8015.')
    print('Jika port 8015 sedang dipakai, tutup terminal SECOND IN lama terlebih dahulu.')


if __name__=='__main__':
    main()
