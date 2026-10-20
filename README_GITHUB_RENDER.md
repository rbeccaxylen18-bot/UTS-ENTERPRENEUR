# SECOND IN ETP #5

Jalankan lokal dengan `python start_secondin.py`, atau klik `JALANKAN_WINDOWS.bat`. Browser dibuka otomatis pada alamat instance ETP #5 yang baru, memakai port bebas bila alamat sebelumnya sedang dipakai. Gunakan alamat yang dibuka otomatis / tercetak di terminal. Panduan akun contoh dan penggunaan ada di `BACA_DULU.txt`.

## Struktur

- `index.html`, `gaya_asli.css`, `tambahan.css`: tampilan dasar SECOND IN.
- `app.js`, `market.css`: interaksi dan tampilan fitur marketplace.
- `server.py`, `marketplace.py`: server, API, migrasi, checkout, tawaran, pesanan, dan ulasan.
- `schema.sql` / `schema_postgres.sql`: schema awal. Kolom/tabel tambahan dibuat otomatis oleh migrasi saat startup.
- `second_in.db`, `uploads/`: data dan foto lokal.
- `pythonanywhere_app.py`: entry point WSGI, menggunakan backend yang sama.

## Hosting

Konfigurasi `render.yaml` dan dukungan PostgreSQL dari ETP #4 tetap disertakan. Saat memakai PostgreSQL, set `DATABASE_URL` dan pasang dependency dari `requirements.txt`. Penyimpanan upload harus persisten bila proyek dipasang di hosting. Jangan unggah database lokal atau kredensial ke repositori publik.

Pengerjaan ini diuji menggunakan SQLite lokal. PostgreSQL dan deployment publik belum diuji. Pembayaran dan ongkir masih simulasi; belum ada integrasi gateway, rekber, API kurir, atau transfer dana. GitHub Pages saja tidak menjalankan backend Python.

Untuk memasang pada PythonAnywhere, tempatkan semua file proyek dalam satu folder, tambahkan folder itu pada `sys.path` di konfigurasi WSGI, kemudian impor `application` dari `pythonanywhere_app`.
