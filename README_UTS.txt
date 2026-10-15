SECOND IN — WEBSITE JUAL BELI PRELOVED (PROYEK UTS)
================================================

Ini versi web SECOND IN dengan halaman terpisah dan database SQLite.
Desain, warna, logo, teks utama, gambar hero, serta foto barang/kategori
berangkat dari file ETPFIKS.html yang sudah dirapikan kelompok.
Bagian ulasan dan rating belum dibuat, sesuai rencana presentasi UTS.

1. CARA BUKA WEB (WINDOWS)
--------------------------
1) Ekstrak ZIP ini dulu. Jangan jalankan dari dalam ZIP.
2) Pastikan Python 3 terpasang. Cek di Command Prompt: py --version
3) Klik dua kali JALANKAN_WINDOWS.bat
   Alternatif: buka terminal di folder ini, ketik: python server.py
4) Jangan tutup jendela terminal selama demo.
5) Buka browser: http://127.0.0.1:8000

Tidak perlu install MySQL, XAMPP, Flask, atau package Python tambahan.
Database akan dibuat otomatis jika second_in.db belum ada.
Kalau port 8000 dipakai aplikasi lain, di Command Prompt:
   set PORT=8010
   python server.py
Lalu buka http://127.0.0.1:8010

2. AKUN DEMO
------------
Penjual
  Email    : penjual@secondin.test
  Password : demo12345

Pembeli
  Email    : pembeli@secondin.test
  Password : demo12345

Kedua akun hanya contoh. Satu akun asli yang baru didaftarkan juga
bisa menjual barang sekaligus membeli barang orang lain.

3. HALAMAN & ALUR
-----------------
Beranda    : judul, gambar utama, kategori, beberapa produk, tombol jual
Jelajahi   : cari, filter kategori/kondisi/harga, urutkan, detail produk
Jual Barang: form memasang barang dan daftar barang milik akun
Favorit    : simpan barang yang menarik
Keranjang  : simpan barang dan buat pesanan contoh
Pesan      : obrolan pembeli-penjual per produk; diperbarui tiap 6 detik
Akun       : daftar/login/logout, pesanan dibeli, pesanan masuk sebagai penjual
Bantuan    : cara pakai, aturan retur versi rancangan, keamanan demo

Catatan: barang preloved punya stok satuan (1 barang = 1 unit).
Setelah dipesan, stok menjadi 0 dan barang ditandai 'Sudah dipesan'.
Jika keranjang berisi barang dari penjual berbeda, sistem membuat
pesanan terpisah untuk tiap penjual.

4. SKENARIO DEMO UTS (3–5 MENIT)
--------------------------------
A. Buka Beranda. Jelaskan SECOND IN mempertemukan pemilik barang
   bekas layak pakai dengan orang yang mencarinya.
B. Buka kategori Elektronik. Tunjukkan 'Belum ada barang'.
   Tidak ada barang palsu yang dibuat agar semua kategori terlihat penuh.
C. Masuk sebagai penjual demo. Halaman Jual Barang > isi produk contoh.
   Tunjukkan barang yang baru dipasang muncul di Jelajahi.
D. Keluar, lalu masuk sebagai pembeli demo. Cari barang > Detail > Chat.
E. Masukkan ke keranjang > Buat pesanan.
F. Keluar, masuk lagi sebagai penjual. Akun > Pesanan masuk,
   ubah status pesanan ke Diproses, lalu Dikirim.
G. Terangkan bahwa semuanya tersimpan di database SQLite, bukan
   hanya contoh yang hilang setelah halaman di-refresh.

Tips: untuk dua akun bersamaan, gunakan jendela normal sebagai penjual
     dan jendela samaran/incognito sebagai pembeli.

5. KALAU DI AWAL BELUM ADA PEMBELI?
----------------------------------
Tetap bisa jalan: yang dibutuhkan lebih dulu adalah PENJUAL dan BARANG.
Awalnya anggota kelompok/teman bisa memasang barang preloved yang memang
mereka ingin jual. Barang demo di proyek ini hanya DATA SIMULASI untuk
presentasi, bukan jual beli sungguhan.
Setelah barang tersedia, pembeli bisa datang lewat promosi kampus,
poster, media sosial, dan rekomendasi teman.

6. DATABASE
------------
File                : second_in.db
Jenis               : SQLite
Skema               : schema.sql
Data awal           : produk_awal.json
Tabel database      : users, sessions, products, cart_items, wishlists,
                      orders, order_items, messages

Relasi penting:
  users (1) ---- (N) products            [penjual]
  users (1) ---- (N) orders              [pembeli]
  orders (1) --- (N) order_items
  products (1) - (N) order_items
  users (1) ---- (N) cart_items/wishlists
  products (1) - (N) messages

Bisa dibuka dengan 'DB Browser for SQLite' jika dosen ingin lihat tabel.
Tanpa aplikasi itu pun database tetap berjalan melalui server Python.
Untuk memulai demo dari awal lagi: tutup server, jalankan RESET_DEMO.bat.
Perhatian: reset menghapus produk, chat, serta pesanan yang sudah dibuat
pada demo sebelumnya dan mengembalikan 11 barang contoh.

7. BATASAN PROTOTIPE (JANGAN DIKLAIM SUDAH PRODUKSI)
----------------------------------------------------
- Tidak ada pembayaran otomatis, rekening bersama, atau kurir terhubung.
- Tidak ada rating/ulasan, sesuai prioritas proyek sekarang.
- Retur/refund berupa informasi rancangan, belum proses otomatis.
- Penyimpanan foto memakai URL, bukan upload berkas ke server.
- Server lokal memakai HTTP di localhost; HTTPS membutuhkan hosting,
  domain, dan sertifikat SSL bila nanti proyek dipublikasikan.
- Password disimpan sebagai hash PBKDF2 dan sesi memakai cookie HttpOnly,
  tetapi ini masih contoh tugas, bukan sistem keamanan produksi.
- Foto produk memakai URL dari file ETPFIKS.html. Butuh koneksi internet
  untuk menampilkan foto jika gambar berasal dari website lain.

Jangan masukkan data pribadi sensitif atau melakukan transaksi uang
sungguhan lewat aplikasi demo ini.

8. SUSUNAN FILE
---------------
server.py             API dan server Python
second_in.db          database SQLite yang sudah berisi data demo awal
schema.sql            rancangan tabel dan relasi database
index.html            tampilan halaman SECOND IN
gaya_asli.css         CSS dari file kiriman pengguna
tambahan.css          CSS untuk halaman baru dan responsif
app.js                navigasi halaman dan koneksi ke API
logo_second_in.png    logo dari versi asli
produk_awal.json      data awal 11 produk dari file ETPFIKS.html
JALANKAN_WINDOWS.bat  jalankan server di Windows
RESET_DEMO.bat        hapus perubahan demo dan isi ulang data awal
reset_demo.py         program reset database

Selamat presentasi UTS!
