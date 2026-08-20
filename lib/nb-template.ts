// Template default catatan (NB / Note) di Rincian Order. Bisa diganti
// operator via Master → Notes CS Order (disimpan di tabel `settings` dengan
// key_name = 'nb_template'). Const ini jadi FALLBACK kalau settings belum
// pernah diisi — jadi ganti template cukup di Master, tidak perlu ubah kode.
export const NB_TEMPLATE_KEY = 'nb_template';

export const DEFAULT_NB_TEMPLATE = `Note:
·  Bahan utama:
·  Bahan variasi PECAH POLA:
* Bahan LIST lengan pendek : (Bahan/Rib/Rajut)
   Bahan LIST lengan panjang : (Bahan/Rib/Rajut)
* Bahan Kerah : (Jika kerah rajut bisa di note)
   Size : (Reguler/Wanita/Anak)

   Promo Juni:
* Free Logo 3D Tatami
* Free 3 Bola
* Free 3 Jersey Tim
* Free Ongkir
* Cashback 5% next order (tidak bisa diubah)`;
