"""Reset demo lokal, harus menghentikan server terlebih dahulu."""
from pathlib import Path
from server import DBFILE, init_db
print('RESET SECOND IN')
print('Perintah ini menghapus produk baru, chat, akun tambahan, dan semua pesanan demo.')
print('Tutup jendela server sebelum melakukan reset.')
if input('Ketik RESET untuk lanjut: ').strip() == 'RESET':
    if DBFILE.exists():
        try: DBFILE.unlink()
        except PermissionError:
            raise SystemExit('Tidak bisa menghapus database. Tutup server terlebih dahulu.')
    init_db()
    print('Selesai. Database kembali berisi 11 produk awal dan 2 akun demo.')
else:
    print('Batal. Tidak ada data yang dihapus.')
