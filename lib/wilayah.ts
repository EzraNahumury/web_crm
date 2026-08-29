// Sumber data wilayah Indonesia (provinsi → kabupaten/kota → kecamatan →
// kelurahan/desa). Pakai wilayah.id: 38 provinsi, ter-update Kepmendagri
// terbaru (termasuk pemekaran Papua: Papua Selatan/Tengah/Pegunungan/Barat
// Daya). API lama (emsifa) berhenti update Agustus 2022 dan cuma punya 34
// provinsi.
//
// Response wilayah.id dibungkus { data: [{ code, name }] }. Di sini
// dinormalisasi ke { id, name } (id = code) supaya kode pemakai tetap sama
// seperti waktu masih pakai emsifa (yang field-nya id/name).

export const WILAYAH_API = 'https://wilayah.id/api';

export interface Wilayah { id: string; name: string }

export type WilayahLevel = 'provinces' | 'regencies' | 'districts' | 'villages';

// Ambil daftar wilayah 1 level. parentId = kode induk (provinsi untuk
// regencies, dst). Selalu return array (kosong kalau gagal/tanpa parent) —
// UI menampilkan dropdown kosong, tidak crash.
export async function fetchWilayah(level: WilayahLevel, parentId?: string): Promise<Wilayah[]> {
  try {
    const url =
      level === 'provinces'
        ? `${WILAYAH_API}/provinces.json`
        : parentId
          ? `${WILAYAH_API}/${level}/${parentId}.json`
          : '';
    if (!url) return [];
    const res = await fetch(url);
    const json = await res.json();
    // Toleran: dukung format wilayah.id ({data:[...]}) maupun array polos
    // (kalau suatu saat balik ke sumber lain).
    const arr: Array<Record<string, unknown>> = Array.isArray(json) ? json : (json?.data ?? []);
    return arr.map(x => ({
      id: String(x.code ?? x.id ?? ''),
      name: String(x.name ?? ''),
    }));
  } catch {
    return [];
  }
}
