import { NextRequest, NextResponse } from 'next/server';
import { query, execute, insert } from '@/lib/db';

// Sinkron sheet Design merchandiser dari data sistem (tanpa isi manual):
//   - Identitas (No. Order, Tgl DP Design, Nama Customer, No. WA) dari CS
//     Selling (tabel orders), untuk closing Jogja/Solo/RO (bukan Revisi),
//     mulai tanggal `from` (default 12 Okt 2026) sampai hari ini.
//   - Tgl DP Produksi Diterima dari order_payments (tipe dp_produksi).
//   - Tgl Desain Awal/Revisi 1-3 + nama Desainer dari progress_design
//     (dicocokkan per nama customer).
// Aturan FILL-IF-EMPTY: hanya mengisi kolom otomatis yang masih kosong di
// baris merch_design — tidak pernah menimpa data yang sudah diisi (mis. PIC
// CS/Sales, tanggal feedback, Design Fix yang diketik manual).

export const dynamic = 'force-dynamic';

type OrderRow = { id: number; no_order: string; customer_nama: string | null; customer_phone: string | null; tanggal_order: unknown; lead_id: number | null };
type LeadRow = { id: number; nama: string | null };
type PayRow = { order_id: number; tipe: string; tanggal: unknown; created_at: unknown };
type ProgRow = { tanggal: unknown; customer: string | null; keterangan: string | null; input_by: string | null };
type MerchRow = Record<string, unknown> & { id: number; no_order: string };

function dateOnly(v: unknown): string {
  if (!v) return '';
  const s = String(v);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function norm(s: unknown): string {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
// Lead termasuk closing yang di-track: Jogja/Solo/RO (repeat), BUKAN revisi.
// Closing yang di-track = semua order yang punya lead, KECUALI lead "revisi".
// (Jogja, Solo, Repeat Order, dll semuanya ikut; hanya revisi yang dibuang.)
function leadIncluded(name: string): boolean {
  const n = norm(name);
  if (!n) return false;              // order tanpa lead tidak ditarik
  return !n.includes('revisi');
}

// Token nama customer untuk pencocokan yang tahan beda urutan kata & marker
// cabang. Buang penanda cabang/umum, angka, dan token pendek.
const NAME_STOP = new Set(['solo', 'jogja', 'sby', 'yogya', 'yogyakarta', 'surabaya', 'jakarta', 'bekasi']);
function nameTokens(name: string): Set<string> {
  const toks = norm(name).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(t => t.length > 2 && !NAME_STOP.has(t) && !/^\d+$/.test(t));
  return new Set(toks);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(body.from || '')) ? String(body.from) : '2026-10-12';

    const [orders, leads, pays, prog, existing] = await Promise.all([
      query<OrderRow>('SELECT id, no_order, customer_nama, customer_phone, tanggal_order, lead_id FROM `orders`').catch(() => [] as OrderRow[]),
      query<LeadRow>('SELECT id, nama FROM `leads`').catch(() => [] as LeadRow[]),
      query<PayRow>("SELECT order_id, tipe, tanggal, created_at FROM `order_payments` WHERE tipe IN ('dp_desain','dp_produksi')").catch(() => [] as PayRow[]),
      query<ProgRow>('SELECT tanggal, customer, keterangan, input_by FROM `progress_design`').catch(() => [] as ProgRow[]),
      query<MerchRow>('SELECT * FROM `merch_design`').catch(() => [] as MerchRow[]),
    ]);

    const leadName = new Map<number, string>();
    for (const l of leads) leadName.set(Number(l.id), String(l.nama || ''));

    // order_payments → tanggal per order per tipe (ambil yang paling awal).
    const payDate = new Map<string, string>(); // key `${order_id}:${tipe}`
    for (const p of pays) {
      const d = dateOnly(p.tanggal) || dateOnly(p.created_at);
      if (!d) continue;
      const key = `${Number(p.order_id)}:${p.tipe}`;
      const cur = payDate.get(key);
      if (!cur || d < cur) payDate.set(key, d);
    }

    // progress_design → daftar baris {tokens nama, tanggal, keterangan, desainer}.
    // TIDAK dikelompokkan per string; pencocokan per-order pakai overlap token
    // supaya "PHYE (DIO ANGGARA) SOLO" dan "Dio Anggara (PHYE) SOLO" dianggap
    // customer yang sama (beda urutan kata).
    interface Design { awal: string; rev1: string; rev2: string; rev3: string; designer: string }
    const progRows = prog.map(r => ({
      tokens: nameTokens(String(r.customer || '')),
      date: dateOnly(r.tanggal),
      ket: norm(r.keterangan),
      designer: String(r.input_by || ''),
    })).filter(r => r.date && r.tokens.size > 0);

    const matchDesign = (custOrder: string): Design | null => {
      const ot = nameTokens(custOrder);
      if (ot.size === 0) return null;
      const matched = progRows.filter(pr => {
        let inter = 0;
        for (const t of ot) if (pr.tokens.has(t)) inter++;
        if (inter === 0) return false;
        const union = new Set([...ot, ...pr.tokens]).size;
        // kuat kalau mirip (Jaccard >= 0.5) atau semua token order ada di progress.
        return inter / union >= 0.5 || inter === ot.size;
      });
      if (matched.length === 0) return null;
      const out: Design = { awal: '', rev1: '', rev2: '', rev3: '', designer: '' };
      const put = (field: keyof Design, date: string) => { if (date && (!out[field] || date < out[field])) out[field] = date; };
      for (const pr of matched) {
        if (!out.designer && pr.designer) out.designer = pr.designer;
        if (pr.ket === 'desain awal') put('awal', pr.date);
        else if (pr.ket === 'revisi 1') put('rev1', pr.date);
        else if (pr.ket === 'revisi 2') put('rev2', pr.date);
        else if (pr.ket === 'revisi 3') put('rev3', pr.date);
      }
      return out;
    };

    const existByNo = new Map<string, MerchRow>();
    for (const e of existing) existByNo.set(String(e.no_order || '').trim(), e);

    let created = 0, updated = 0, skipped = 0;

    for (const o of orders) {
      const no = String(o.no_order || '').trim();
      if (!no) { continue; }
      if (!leadIncluded(leadName.get(Number(o.lead_id)) || '')) { skipped++; continue; }
      const tglOrder = dateOnly(o.tanggal_order);
      if (!tglOrder || tglOrder < from) { skipped++; continue; }

      const dpDesain = payDate.get(`${o.id}:dp_desain`) || '';
      const dpProduksi = payDate.get(`${o.id}:dp_produksi`) || '';
      const dsg = matchDesign(String(o.customer_nama || ''));

      // Nilai otomatis dari sistem.
      const auto: Record<string, string> = {
        tgl_dp_design: dpDesain || tglOrder,
        nama_customer: String(o.customer_nama || ''),
        no_wa: String(o.customer_phone || ''),
        desainer: dsg?.designer || '',
        design_awal_kirim: dsg?.awal || '',
        rev1_kirim: dsg?.rev1 || '',
        rev2_kirim: dsg?.rev2 || '',
        rev3_kirim: dsg?.rev3 || '',
        dp_produksi_diterima: dpProduksi,
      };

      const ex = existByNo.get(no);
      if (!ex) {
        const cols = ['no_order', ...Object.keys(auto)];
        const vals = [no, ...Object.keys(auto).map(k => auto[k])];
        await insert(
          `INSERT INTO \`merch_design\` (${cols.map(c => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
          vals,
        );
        created++;
      } else {
        // FILL-IF-EMPTY: hanya kolom auto yang masih kosong di baris existing.
        const setCols: string[] = [];
        const setVals: unknown[] = [];
        for (const k of Object.keys(auto)) {
          const newV = auto[k];
          if (newV && !String(ex[k] ?? '').trim()) { setCols.push(`\`${k}\` = ?`); setVals.push(newV); }
        }
        if (setCols.length > 0) {
          setVals.push(ex.id);
          await execute(`UPDATE \`merch_design\` SET ${setCols.join(', ')} WHERE id = ?`, setVals);
          updated++;
        } else {
          skipped++;
        }
      }
    }

    return NextResponse.json({ success: true, created, updated, skipped, from });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
