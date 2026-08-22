// Shared helper untuk WO4 (Form Permintaan Gudang) — dipakai oleh
// tab WO4 di halaman detail work-order, Download All PDF, dan modal
// preview di Forecasting Bahan. Sebelumnya inline di page.tsx.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// Order body parts di WO1 → dipakai untuk menentukan urutan first-appearance
// unique bahan (KAIN UTAMA = first bahan, KAIN VARIASI 1..N = subsequent).
export const WO4_BODY_PARTS_ORDER = [
  'FULL BODY', 'FRONT BODY', 'BACK BODY', 'SLEEVE', 'COMBINATION',
  'COLLAR', 'SLEEVE ENDS', 'SIDE PANTS STRIPE', 'PANTS',
];
export const WO4_ACCESSORIES = [
  'AUTHENTIC', 'WEBBING', 'WASHTAG', 'ELASTIC PANTS',
  'TAFETA RUBBER PRO', 'LOGO RUBBER AYRES', 'LOGO TULISAN AYRES', 'PANTS DRAWSTRING',
];
export const WO4_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
// Legacy body-part bagian names (data lama sebelum konsolidasi KAIN UTAMA/VARIASI).
export const WO4_LEGACY_BODY_SET = new Set(WO4_BODY_PARTS_ORDER.map(s => s.toUpperCase()));
// Legacy "kain variasi" label pattern.
export const WO4_KAIN_VARIASI_RE = /^KAIN\s+VARIASI\s+\d+$/i;

export type GudangRow = {
  id: number | null; urutan: number;
  kategori: string; bagian: string; bahan: string; warna: string; kuantitas: number;
  isFixed?: boolean;
  // Kalau di-set, row ini bukan data — cuma header pemisah section (KAIN /
  // ACCESSORIS / SIZE) buat visual rapi di UI + PDF. Skip di save.
  sectionHeader?: string;
};

// Pure helper: derive WO4 rows untuk 1 form (KAIN + ACCESSORIS + SIZE +
// section headers). Dipakai oleh UI tab WO4, Download All PDF, dan
// modal preview Forecasting Bahan supaya format konsisten.
export function buildWo4FormRows(args: {
  sourceRows: Row[];              // existing wo_permintaan_gudang rows (all forms)
  formNo: number;
  woId: number;
  specs: Row[];                   // wo_spesifikasi rows (all WOs)
  specBahan: Row[];               // wo_spesifikasi_bahan rows (all specs)
  ukuranTim: Row[];               // wo_ukuran_tim rows for this WO
  masterBarangSet: Set<string>;   // uppercase master barang names
}): GudangRow[] {
  const { sourceRows, formNo, woId, specs, specBahan, ukuranTim, masterBarangSet } = args;

  // Derive KAIN bahan mapping dari WO1 specs.
  const specsForWo = specs.filter(s => Number(s.work_order_id) === Number(woId));
  const specIds = new Set(specsForWo.map(s => Number(s.id)));
  const bahanForWo = specBahan.filter(b => specIds.has(Number(b.spesifikasi_id)));
  const bahanByBagian: Record<string, string> = {};
  for (const b of bahanForWo) {
    const bg = String(b.bagian || '').toUpperCase().trim();
    if (!bg) continue;
    const bh = String(b.bahan || '').trim();
    if (!bh) continue;
    if (!bahanByBagian[bg]) bahanByBagian[bg] = bh;
  }
  const totalJumlah = specsForWo.reduce((s, x) => s + (Number(x.jumlah) || 0), 0);

  // Sizes count dari WO2 (wo_ukuran_tim) + alias 2XL → XXL.
  const sizeCounts: Record<string, number> = {};
  const extraSizesOrder: string[] = [];
  const stdSet = new Set(WO4_SIZES.map(s => s.toUpperCase()));
  const seenExtra = new Set<string>();
  for (const t of ukuranTim) {
    let sz = String(t.size || '').trim().toUpperCase();
    if (!sz) continue;
    if (sz === '2XL') sz = 'XXL';
    sizeCounts[sz] = (sizeCounts[sz] || 0) + 1;
    if (!stdSet.has(sz) && !seenExtra.has(sz)) {
      seenExtra.add(sz);
      extraSizesOrder.push(sz);
    }
  }

  // Index existing DB rows by bagian (uppercase). Alias legacy '2XL' → 'XXL'.
  const byBagian: Record<string, Row> = {};
  for (const r of sourceRows) {
    if (Number(r.form_no || 1) !== formNo) continue;
    let bg = String(r.bagian || '').toUpperCase();
    if (bg === '2XL' && !byBagian['XXL']) bg = 'XXL';
    byBagian[bg] = r;
  }

  const sizesForForm = [...WO4_SIZES, ...extraSizesOrder];

  // Derive unique bahan dari WO1 body-parts (first-appearance order).
  const uniqueBahan: string[] = [];
  const seenBahan = new Set<string>();
  for (const part of WO4_BODY_PARTS_ORDER) {
    const b = String(bahanByBagian[part] || '').trim();
    if (!b) continue;
    const key = b.toUpperCase();
    if (seenBahan.has(key)) continue;
    seenBahan.add(key);
    uniqueBahan.push(b);
  }
  if (uniqueBahan.length === 0) uniqueBahan.push('');

  const makeSection = (label: string): GudangRow => ({
    id: null, urutan: 0, kategori: 'SECTION', bagian: '', bahan: '',
    warna: '', kuantitas: 0, sectionHeader: label,
  });

  const assembled: GudangRow[] = [];
  let idx = 1;
  // ── SECTION: KAIN ──
  assembled.push(makeSection('KAIN'));
  for (let i = 0; i < uniqueBahan.length; i++) {
    const bagian = i === 0 ? 'KAIN UTAMA' : `KAIN VARIASI ${i}`;
    const found = byBagian[bagian.toUpperCase()];
    assembled.push({
      id: found ? Number(found.id) : null,
      urutan: idx++, kategori: 'BAHAN_UTAMA',
      bagian,
      bahan: found ? String(found.bahan || '') : uniqueBahan[i],
      warna: String(found?.warna || ''),
      kuantitas: found ? (Number(found.kuantitas) || 0) : 0,
      isFixed: true,
    });
  }
  // ── SECTION: ACCESSORIS ──
  assembled.push(makeSection('ACCESSORIS'));
  for (const it of WO4_ACCESSORIES) {
    const found = byBagian[it];
    const savedBahan = String(found?.bahan || '').trim();
    const bahanValid = savedBahan && masterBarangSet.has(savedBahan.toUpperCase());
    assembled.push({
      id: found ? Number(found.id) : null,
      urutan: idx++, kategori: 'BAHAN_UTAMA',
      bagian: it,
      bahan: bahanValid ? savedBahan : '',
      warna: String(found?.warna || ''),
      kuantitas: found ? (Number(found.kuantitas) || 0) : totalJumlah,
      isFixed: true,
    });
  }
  // ── SECTION: SIZE ──
  assembled.push(makeSection('SIZE'));
  for (const sz of sizesForForm) {
    const found = byBagian[sz];
    const rawWarna = String(found?.warna || '');
    const cleanWarna = rawWarna.trim().toUpperCase() === 'CUSTOM' ? '' : rawWarna;
    const autoQty = sizeCounts[sz] || 0;
    assembled.push({
      id: found ? Number(found.id) : null,
      urutan: idx++, kategori: 'MATERIAL_TAMBAHAN',
      bagian: sz, bahan: String(found?.bahan || ''),
      warna: cleanWarna,
      kuantitas: found ? (Number(found.kuantitas) || 0) : autoQty,
      isFixed: true,
    });
  }
  // Extras (LAIN-LAIN) — skip legacy body-parts / KAIN VARIASI orphans / 2XL.
  const currentFixed = new Set<string>();
  for (let i = 0; i < uniqueBahan.length; i++) {
    currentFixed.add((i === 0 ? 'KAIN UTAMA' : `KAIN VARIASI ${i}`).toUpperCase());
  }
  for (const s of WO4_ACCESSORIES) currentFixed.add(s.toUpperCase());
  for (const s of sizesForForm) currentFixed.add(s.toUpperCase());
  const extras: GudangRow[] = [];
  for (const r of sourceRows) {
    if (Number(r.form_no || 1) !== formNo) continue;
    const b = String(r.bagian || '').toUpperCase();
    if (currentFixed.has(b)) continue;
    if (WO4_LEGACY_BODY_SET.has(b)) continue;
    if (WO4_KAIN_VARIASI_RE.test(b)) continue;
    if (b === 'KAIN UTAMA') continue;
    if (b === '2XL') continue;
    extras.push({
      id: Number(r.id), urutan: idx++, kategori: String(r.kategori || 'BAHAN_UTAMA'),
      bagian: String(r.bagian || ''), bahan: String(r.bahan || ''),
      warna: String(r.warna || ''), kuantitas: Number(r.kuantitas) || 0,
      isFixed: false,
    });
  }
  if (extras.length > 0) {
    assembled.push(makeSection('LAIN-LAIN'));
    assembled.push(...extras);
  }
  return assembled;
}

// Unique form_no yang ada di DB rows. Kalau kosong, return [1].
export function detectWo4FormNos(rows: Row[]): number[] {
  const s = new Set<number>();
  for (const r of rows) s.add(Number(r.form_no || 1));
  if (s.size === 0) return [1];
  return Array.from(s).sort((a, b) => a - b);
}
