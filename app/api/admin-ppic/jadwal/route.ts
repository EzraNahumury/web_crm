import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { computeDeadlineLock, hasJaket } from '@/lib/business-days';
import { computeStageTargets, classifyLate } from '@/lib/produksi-durasi';
import { buildAksesorisSet, sumQtyExcludingAksesoris } from '@/lib/qty-aksesoris';

// GET /api/admin-ppic/jadwal?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Jadwal PPIC — Production Schedule (read-only, auto dari data yang sudah ada).
//   - NAMA CUSTOMER / QTY / PAKET / DEADLINE  → dari CS Order (orders +
//     order_items + work_orders).
//   - 7 proses (Layout, Print, Press, Cutting, Sewing, Finishing, Shipment)
//     TGL + STATUS (checklist) + tanda TERLAMBAT → dari wo_progress +
//     production_stages, dibandingkan dgn target SLA per tahap
//     (lib/produksi-durasi: computeStageTargets dari tgl Approval Design).
//
// Baris = work_order (1 order ≈ 1 WO). Dikelompokkan per tanggal DEADLINE
// (batch), hanya WO yang deadline-nya di rentang [from, to].

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Urutan kolom proses kiri→kanan + pemetaan ke production_stages.nama.
const DISPLAY_STAGES: { key: string; label: string; stageName: string }[] = [
  { key: 'layout',    label: 'LAYOUT',         stageName: 'Printing Layout' },
  { key: 'print',     label: 'PRINT',          stageName: 'Printing Process' },
  { key: 'press',     label: 'PRESS',          stageName: 'Sublim Press' },
  { key: 'cutting',   label: 'CUTTING',        stageName: 'Fabric Cutting' },
  { key: 'sewing',    label: 'SEWING',         stageName: 'Sewing' },
  { key: 'finishing', label: 'FINISHING',      stageName: 'Finishing' },
  { key: 'shipment',  label: 'SHIPMENT READY', stageName: 'Shipment' },
];
const APPROVAL_DESIGN_STAGE = 'Approval Design';

interface WoRow {
  id: number;
  no_wo: string | null;
  order_id: number;
  customer_nama: string | null;
  paket: string | null;
  jumlah: number | null;
  deadline: string | Date | null;
  status: string | null;
}
interface OrderRow {
  id: number;
  no_order: string | null;
  pilihan_paket: string | null;
  tanggal_acc_proofing: string | Date | null;
  deadline_lock: string | Date | null;
  estimasi_deadline: string | Date | null;
}
interface StageRow { id: number; nama: string; }
interface WpRow {
  work_order_id: number;
  stage_id: number;
  status: string | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
}
interface ItemRow { order_id: number; paket_nama: string | null; qty: number | null; }

// Tanggal WIB dari sebuah timestamp DB. Sama persis dengan konversi di
// Laporan Produksi Harian supaya tanggal selesai konsisten di semua menu.
function wibDate(value: unknown): string {
  if (!value) return '';
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return String(value).slice(0, 10);
  try { return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); }
  catch { return String(value).slice(0, 10); }
}
// Tanggal (YYYY-MM-DD) dari nilai DATE/DATETIME/string apa pun — untuk
// deadline (yang disimpan sbg DATE, tanpa jam) pakai parsing literal supaya
// tidak bergeser karena timezone.
function dateOnly(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const s = String(value);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayWIB(): string {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); }
  catch {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }
}
const norm = (s: string) => s.toLowerCase().trim();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = dateOnly(searchParams.get('from') || '');
    const to = dateOnly(searchParams.get('to') || '');

    const [wos, orders, stages, barangCs, holidayRows] = await Promise.all([
      query<WoRow>('SELECT id, no_wo, order_id, customer_nama, paket, jumlah, deadline, status FROM work_orders'),
      query<OrderRow>('SELECT id, no_order, pilihan_paket, tanggal_acc_proofing, deadline_lock, estimasi_deadline FROM orders'),
      query<StageRow>('SELECT id, nama FROM production_stages'),
      query<{ nama: string; hitung_qty: number | null }>('SELECT nama, hitung_qty FROM barang_cs').catch(() => []),
      query<{ tanggal: string | Date }>('SELECT tanggal FROM libur_nasional').catch(() => []),
    ]);

    // Set libur nasional (YYYY-MM-DD) untuk perhitungan hari kerja.
    const holidays = new Set<string>();
    for (const h of holidayRows) {
      const d = dateOnly(h.tanggal);
      if (d) holidays.add(d);
    }

    // Peta nama stage → id (untuk 7 proses + Approval Design).
    const stageIdByName = new Map<string, number>();
    for (const s of stages) stageIdByName.set(norm(s.nama), s.id);
    const displayStageIds = DISPLAY_STAGES.map(d => ({
      ...d,
      stageId: stageIdByName.get(norm(d.stageName)),
    }));
    const approvalDesignId = stageIdByName.get(norm(APPROVAL_DESIGN_STAGE));

    const orderById = new Map<number, OrderRow>();
    for (const o of orders) orderById.set(Number(o.id), o);

    const aksesorisSet = buildAksesorisSet(
      (barangCs as { nama: string; hitung_qty: number | null }[]).map(b => ({ nama: b.nama, hitung_qty: b.hitung_qty ?? 1 }))
    );

    // 1) Hitung deadline tiap WO, filter yang masuk rentang.
    type Cand = { wo: WoRow; order: OrderRow | null; deadline: string };
    const candidates: Cand[] = [];
    for (const wo of wos) {
      const order = orderById.get(Number(wo.order_id)) || null;
      let deadline = '';
      if (order) {
        deadline = computeDeadlineLock({
          pilihanPaket: order.pilihan_paket,
          tanggalAccProofing: order.tanggal_acc_proofing,
          deadlineLock: order.deadline_lock,
          holidays,
          isJaket: hasJaket([order.pilihan_paket, wo.paket]),
        });
      }
      if (!deadline) deadline = dateOnly(order?.estimasi_deadline) || dateOnly(wo.deadline);
      if (!deadline) continue; // tanpa deadline tidak bisa dijadwalkan
      if (from && deadline < from) continue;
      if (to && deadline > to) continue;
      candidates.push({ wo, order, deadline });
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        success: true, from, to,
        stages: DISPLAY_STAGES.map(d => ({ key: d.key, label: d.label })),
        batches: [], totalWo: 0, totalQty: 0,
      });
    }

    // 2) Ambil wo_progress + order_items hanya untuk kandidat.
    const woIds = candidates.map(c => Number(c.wo.id));
    const orderIds = Array.from(new Set(candidates.map(c => Number(c.wo.order_id)).filter(Boolean)));
    const woPh = woIds.map(() => '?').join(',');
    const ordPh = orderIds.map(() => '?').join(',');

    const [progress, items] = await Promise.all([
      woIds.length
        ? query<WpRow>(
            `SELECT work_order_id, stage_id, status, started_at, completed_at FROM wo_progress WHERE work_order_id IN (${woPh})`,
            woIds
          )
        : Promise.resolve([] as WpRow[]),
      orderIds.length
        ? query<ItemRow>(
            `SELECT order_id, paket_nama, qty FROM order_items WHERE order_id IN (${ordPh})`,
            orderIds
          )
        : Promise.resolve([] as ItemRow[]),
    ]);

    // Progress per WO: Map<woId, Map<stageId, WpRow>>.
    const progByWo = new Map<number, Map<number, WpRow>>();
    for (const p of progress) {
      const wid = Number(p.work_order_id);
      if (!progByWo.has(wid)) progByWo.set(wid, new Map());
      progByWo.get(wid)!.set(Number(p.stage_id), p);
    }
    // Item per order (untuk qty exclude aksesoris + fallback paket).
    const itemsByOrder = new Map<number, ItemRow[]>();
    for (const it of items) {
      const oid = Number(it.order_id);
      if (!itemsByOrder.has(oid)) itemsByOrder.set(oid, []);
      itemsByOrder.get(oid)!.push(it);
    }

    const tWIB = todayWIB();

    // 3) Bangun baris per WO.
    type ProcCell = { tgl: string; done: boolean; late: boolean; na: boolean };
    type JadwalRow = {
      woId: number; orderId: number; noWo: string; noOrder: string;
      customer: string; paket: string; qty: number; deadline: string;
      proc: Record<string, ProcCell>;
    };

    const rows: JadwalRow[] = candidates.map(({ wo, order, deadline }) => {
      const oid = Number(wo.order_id);
      const oItems = itemsByOrder.get(oid) || [];

      // Qty = total order_items TANPA aksesoris (konvensi sama dgn Work
      // Orders / Tracking). Fallback ke work_orders.jumlah kalau item kosong.
      let qty = 0;
      if (oItems.length > 0) {
        qty = sumQtyExcludingAksesoris(
          oItems.map(it => ({ paket_nama: it.paket_nama || '', qty: Number(it.qty) || 0 })),
          aksesorisSet
        );
      } else {
        qty = Number(wo.jumlah) || 0;
      }

      // Paket = work_orders.paket; fallback ke daftar paket utama (bukan
      // aksesoris) dari order_items.
      let paket = String(wo.paket || '').trim();
      if (!paket && oItems.length > 0) {
        const names = Array.from(new Set(
          oItems
            .map(it => String(it.paket_nama || '').trim())
            .filter(n => n && !aksesorisSet.has(norm(n)))
        ));
        paket = names.join(', ');
      }

      const woProg = progByWo.get(Number(wo.id)) || new Map<number, WpRow>();

      // Target SLA per tahap dari tanggal mulai Approval Design (WIB).
      let adStart = '';
      if (approvalDesignId != null) {
        const ad = woProg.get(approvalDesignId);
        if (ad) adStart = wibDate(ad.started_at) || wibDate(ad.completed_at);
      }
      const targets = adStart ? computeStageTargets(adStart, holidays) : {};

      const proc: Record<string, ProcCell> = {};
      for (const ds of displayStageIds) {
        if (ds.stageId == null) {
          proc[ds.key] = { tgl: '', done: false, late: false, na: true };
          continue;
        }
        const p = woProg.get(ds.stageId);
        const done = String(p?.status || '').toUpperCase() === 'SELESAI';
        // TGL = tanggal selesai (completed_at) kalau selesai; kalau sedang
        // dikerjakan pakai started_at; selain itu kosong.
        let tgl = '';
        if (done) tgl = wibDate(p?.completed_at) || wibDate(p?.started_at);
        else if (p?.started_at) tgl = wibDate(p.started_at);

        // Terlambat vs target SLA tahap ini. Kalau sudah selesai →
        // bandingkan tgl selesai. Kalau belum selesai → bandingkan hari ini
        // (overdue tapi belum dikerjakan). Tanpa target (mis. Shipment) =
        // tidak pernah ditandai terlambat.
        const target = targets[ds.stageName];
        let late = false;
        if (target) {
          const actual = done ? (tgl || tWIB) : tWIB;
          late = classifyLate(target, actual) === 'terlambat';
        }
        proc[ds.key] = { tgl, done, late, na: false };
      }

      return {
        woId: Number(wo.id),
        orderId: oid,
        noWo: String(wo.no_wo || ''),
        noOrder: String(order?.no_order || ''),
        customer: String(wo.customer_nama || '').trim() || '(Tanpa Nama)',
        paket,
        qty,
        deadline,
        proc,
      };
    });

    // 4) Kelompokkan per tanggal DEADLINE (batch), urut deadline naik.
    const byDeadline = new Map<string, JadwalRow[]>();
    for (const r of rows) {
      if (!byDeadline.has(r.deadline)) byDeadline.set(r.deadline, []);
      byDeadline.get(r.deadline)!.push(r);
    }
    const batches = Array.from(byDeadline.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([deadline, rs]) => {
        rs.sort((a, b) => a.customer.localeCompare(b.customer, 'id'));
        return {
          deadline,
          rows: rs,
          totalQty: rs.reduce((s, r) => s + (Number(r.qty) || 0), 0),
        };
      });

    const totalQty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);

    return NextResponse.json({
      success: true,
      from, to,
      stages: DISPLAY_STAGES.map(d => ({ key: d.key, label: d.label })),
      batches,
      totalWo: rows.length,
      totalQty,
    });
  } catch (err) {
    console.error('Jadwal PPIC error:', err);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
