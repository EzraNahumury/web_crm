// Batas tanggal_order paling awal yang boleh muncul di CS Order,
// Produksi, dan Work Orders. Data sebelum tanggal ini disembunyikan
// (bukan dihapus) supaya menu-menu tsb start dari titik yang sama
// dengan CS Selling versi baru (yang secara alami sudah tersaring
// karena filter created_via='CS_SELLING').
export const HIDE_ORDERS_BEFORE = '2026-07-13';

// Order tampil kalau tanggal_order-nya >= HIDE_ORDERS_BEFORE.
// Order tanpa tanggal_order tetap tampil supaya WO baru yang belum
// di-set tanggal tidak hilang.
export function isVisibleTanggalOrder(iso: string | null | undefined): boolean {
  if (!iso) return true;
  return String(iso).slice(0, 10) >= HIDE_ORDERS_BEFORE;
}
