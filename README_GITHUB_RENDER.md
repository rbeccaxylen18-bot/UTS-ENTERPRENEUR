# SECOND IN — versi GitHub + Render + Database Online

Ini adalah **versi online** dari website SECOND IN. HTML, CSS, logo, gambar produk, dan alur UI asal dipertahankan. Login, daftar, jual barang, favorit, keranjang, chat, dan pesanan terhubung ke PostgreSQL saat di-**deploy**.

## 1. Upload proyek ke GitHub

1. Buka https://github.com/new, buat repo baru, contoh `second-in-uts` (Private/Public boleh).
2. Klik **Add file > Upload files** lalu upload **isi folder ini**, bukan file ZIP dan bukan folder pembungkusnya. Pastikan `render.yaml` berada di root repo, sejajar `server.py`.
3. **JANGAN upload `second_in.db`**, token, atau file `.env` (sudah disiapkan `.gitignore`).
4. Commit changes.

## 2. Jadikan website online melalui Render

1. Buka https://dashboard.render.com dan login dengan GitHub.
2. Pilih **New > Blueprint**, pilih repo GitHub tadi.
3. Render akan membaca `render.yaml` dan menyiapkan **Web Service** serta **Postgres database** pada paket Free. Cek bahwa keduanya dipilih paket Free; jangan lanjut jika ada biaya yang tidak kamu kehendaki.
4. Tinjau dan pilih **Apply/Deploy Blueprint**. Tunggu status web service menjadi **Live**.
5. Klik alamat yang Render berikan, berupa `https://....onrender.com`. Itulah link yang dapat dibagikan ke teman.
6. Database dibuat otomatis saat server pertama dijalankan, termasuk 11 barang contoh dari `produk_awal.json`.

> GitHub Pages **tidak dapat menjalankan `server.py`** dan SQLite lokal. Jangan memakai menu Settings > Pages sebagai hosting utama aplikasi ini.

## 3. Cara teman sekelas mencoba

1. Buka link Render yang kamu bagikan (gunakan Chrome/HP).
2. Buka **Akun** dan **Daftar** untuk membuat akun sendiri.
3. Buka **Jual Barang**, isi nama, kategori, kondisi, harga, keterangan, dan **link foto** (bukan upload file foto langsung).
4. Klik **Pasang barang**. Produk otomatis disimpan di Postgres, lalu muncul di halaman **Jelajahi** untuk semua pengguna.
5. Teman lain bisa chat penjual, menyimpan ke keranjang, dan membuat **pesanan simulasi**.

**Penting:** user tidak harus memilih menjadi penjual secara terpisah; satu akun bisa menjual barang miliknya sekaligus membeli barang orang lain.

## 4. Perbedaan lokal vs online

- **Lokal (Python tanpa package tambahan)**: klik `JALANKAN_WINDOWS.bat`, buka `http://127.0.0.1:8000`. Gunakan akun demo penjual/pembeli (password ada di README_UTS.txt). Data tersimpan dalam SQLite `second_in.db` hanya di laptop sendiri.
- **Online (Render)**: data tersimpan di PostgreSQL dan dipakai semua pengguna. **Akun demo bersama tidak diaktifkan**; daftar akun sendiri. Barang contoh dikelola oleh akun sistem yang tidak memiliki password publik.
- Foto awal berupa URL luar dan masih perlu koneksi internet. Pembayaran, pengiriman riil, dan upload langsung dari galeri **belum tersedia**.

## 5. Hal penting sebelum presentasi UTS

- Render Free bisa berhenti sementara setelah sekitar 15 menit tanpa aktivitas; akses pertama saat bangun bisa perlu sekitar 1 menit.
- PostgreSQL Free Render **kedaluwarsa 30 hari** sejak dibuat. Untuk jangka panjang gunakan database berbayar atau pindahkan ke provider lain.
- Jangan gunakan data pribadi asli atau lakukan pembayaran sungguhan, karena ini masih proyek demo kampus dan belum diaudit keamanan.
- Tes dengan **dua HP**: akun A memasang barang -> akun B membuka Jelajahi -> chat -> keranjang -> pesan contoh -> akun A melihat pesanan masuk.
- Kalau `Deploy Failed`, buka **Render > Web Service > Logs**. Jika web menunjukkan error database, periksa bahwa database statusnya Available.

## 6. Susunan teknis

- `index.html`, `gaya_asli.css`, `tambahan.css`, `app.js`: antarmuka
- `server.py`: backend HTTP/API
- `schema.sql`: tabel SQLite lokal
- `schema_postgres.sql`: tabel PostgreSQL online
- `produk_awal.json`: 11 produk awal
- `render.yaml`: konfigurasi cloud satu kali dari repo
- `requirements.txt`: library koneksi PostgreSQL

Komponen database inti: users, sessions, products, cart_items, wishlists, orders, order_items, messages.

**Alamat link yang benar untuk dibagikan ke teman adalah `https://...onrender.com`, bukan `localhost`, karena `localhost` hanya menunjuk komputer/HP yang sedang membuka URL tersebut.**
