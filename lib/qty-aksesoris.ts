// Helper untuk menghitung total qty order_items yang tidak mengikutsertakan
// baris aksesoris (barang_cs dengan hitung_qty=0).
//
// Kasus: baris tambahan XL / custom label / sablon extra sebenarnya cuma
// aksesoris — tidak nambah unit produksi. Jersey 127 + tambahan XL 10
// harusnya WO.jumlah = 127, bukan 137.
//
// Dipakai di:
//   • bukti-pembayaran (saat auto-create shadow WO)
//   • work-orders (saat display qty per WO)
//   • monitoring-produksi + history (saat display qty per order)
//   • tempat lain yang butuh angka qty "produksi murni"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/**
 * Bangun Set<string> nama barang_cs yang aksesoris (hitung_qty=0).
 * Nama di-lowercase supaya matching insensitive.
 */
export function buildAksesorisSet(barangCs: Row[]): Set<string> {
  return new Set(
    barangCs
      .filter(b => Number(b.hitung_qty) === 0)
      .map(b => String(b.nama || '').trim().toLowerCase())
  );
}

/**
 * Sum qty dari order_items, kecualikan baris yang paket_nama-nya
 * match set aksesoris (case-insensitive).
 */
export function sumQtyExcludingAksesoris(
  items: Row[],
  aksesorisSet: Set<string>,
): number {
  return items.reduce((sum, it) => {
    const nama = String(it.paket_nama || '').trim().toLowerCase();
    if (aksesorisSet.has(nama)) return sum;
    return sum + (Number(it.qty) || 0);
  }, 0);
}
