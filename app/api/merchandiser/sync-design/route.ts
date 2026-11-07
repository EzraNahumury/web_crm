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
function leadIncluded(name: string): boolean {
  const n = norm(name);
  if (!n) return false;
  if (n.includes('revisi')) return false;
  return n.includes('jogja') || n.includes('solo') || n.includes('repeat') || /\bro\b/.test(n);
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

    // progress_design → per customer (ternormalisasi): tanggal per keterangan + desainer.
    interface Design { awal: string; rev1: string; rev2: string; rev3: string; designer: string }
    const progByCust = new Map<string, Design>();
    const assign = (cust: string, field: keyof Design, date: string, designer: string) => {
      const key = norm(cust);
      if (!key || !date) return;
      const cur = progByCust.get(key) || { awal: '', rev1: '', rev2: '', rev3: '', designer: '' };
      if (field !== 'designer' && (!cur[field] || date < cur[field])) cur[field] = date;
      if (field === 'awal' && !cur.designer && designer) cur.designer = designer;
      if (!cur.designer && designer) cur.designer = designer;
      progByCust.set(key, cur);
    };
    for (const r of prog) {
      const d = dateOnly(r.tanggal);
      const ket = norm(r.keterangan);
      const designer = String(r.input_by || '');
      if (ket === 'desain awal') assign(String(r.customer), 'awal', d, designer);
      else if (ket === 'revisi 1') assign(String(r.customer), 'rev1', d, designer);
      else if (ket === 'revisi 2') assign(String(r.customer), 'rev2', d, designer);
      else if (ket === 'revisi 3') assign(String(r.customer), 'rev3', d, designer);
    }
    // Cari data progress untuk sebuah nama customer order (cocok persis / substring).
    const progKeys = [...progByCust.keys()];
    const matchProg = (custOrder: string): Design | null => {
      const n = norm(custOrder);
      if (n.length < 3) return null;
      if (progByCust.has(n)) return progByCust.get(n)!;
      const hit = progKeys.find(k => k.includes(n) || n.includes(k));
      return hit ? progByCust.get(hit)! : null;
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
      const dsg = matchProg(String(o.customer_nama || ''));

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
