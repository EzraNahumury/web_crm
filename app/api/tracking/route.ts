import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { computeDeadlineLock } from '@/lib/business-days';

// Stages the customer is allowed to see on the tracking timeline. Every
// other stage stays inside the wo_progress table (still drives current
// stage + progressPercent) but is filtered out before the JSON goes to
// the customer.
const CUSTOMER_VISIBLE_STAGES = new Set([
  'Proofing',
  'Printing Process',
  'Sublim Press',
  'Fabric Cutting',
  'Sewing',
  'Finishing',
  'Shipment',
]);

interface WoRow {
  id: number;
  no_wo: string;
  tracking_hash: string | null;
  order_id: number;
  customer_nama: string;
  paket: string;
  bahan: string;
  jumlah: number;
  up_produksi: string;
  deadline: string;
  keterangan: string;
  current_stage_id: number | null;
  status: string;
}

interface OrderRow {
  id: number;
  no_order: string;
  customer_phone: string;
  tanggal_order: string;
  estimasi_deadline: string;
  nominal_order: number;
  pilihan_paket: string | null;
  tanggal_acc_proofing: string | Date | null;
  deadline_lock: string | Date | null;
}

interface WpRow {
  stage_id: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
}

interface StageRow {
  id: number;
  urutan: number;
  nama: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // The URL slug can be either a SHA-256 hash (new format) or a no_wo
  // (legacy URLs). The client passes whichever value was in the URL via no_wo.
  const slug = searchParams.get('no_wo');
  if (!slug) return NextResponse.json({ success: false, error: 'no_wo required' }, { status: 400 });

  try {
    // Try hash first (unguessable, new format), fall back to no_wo for legacy links.
    let wos = await query<WoRow>('SELECT * FROM work_orders WHERE tracking_hash = ? LIMIT 1', [slug]);
    if (wos.length === 0) {
      wos = await query<WoRow>('SELECT * FROM work_orders WHERE no_wo = ? LIMIT 1', [slug]);
    }
    if (wos.length === 0) {
      return NextResponse.json({ success: false, error: 'Work order tidak ditemukan' });
    }
    const wo = wos[0];

    // Fetch order info
    const orders = await query<OrderRow>('SELECT * FROM orders WHERE id = ? LIMIT 1', [wo.order_id]);
    const order = orders[0] || null;

    // Fetch all production stages
    const stages = await query<StageRow>('SELECT * FROM production_stages ORDER BY urutan ASC');

    // Fetch wo_progress for this work order
    const progress = await query<WpRow>(
      'SELECT stage_id, status, started_at, completed_at FROM wo_progress WHERE work_order_id = ? ORDER BY stage_id ASC',
      [wo.id]
    );

    // Build stage progress map
    const progressMap: Record<number, WpRow> = {};
    for (const p of progress) progressMap[p.stage_id] = p;

    // Compute progress based on the stages the customer actually sees,
    // so 70% on the bar corresponds to 5/7 checkmarks on the timeline
    // rather than 5/15 hidden internal steps.
    const visibleStageIds = new Set(
      stages.filter(s => CUSTOMER_VISIBLE_STAGES.has(s.nama)).map(s => s.id)
    );
    const visibleTotal = visibleStageIds.size;
    const visibleSelesai = progress.filter(p => p.status === 'SELESAI' && visibleStageIds.has(p.stage_id)).length;
    const progressPercent = visibleTotal > 0 ? Math.round((visibleSelesai / visibleTotal) * 100) : 0;

    // "Current stage" — prefer the deepest visible stage that's active or
    // completed. Hides "Approval Design" etc. from the summary card so it
    // matches the filtered timeline below.
    let currentStageName = 'Belum mulai';
    if (progressPercent >= 100) {
      currentStageName = 'Selesai';
    } else {
      const visibleStages = stages.filter(s => CUSTOMER_VISIBLE_STAGES.has(s.nama));
      const activeVisible = visibleStages.find(s => {
        const p = progressMap[s.id];
        return p && (p.status === 'SEDANG' || p.status === 'TERSEDIA');
      });
      if (activeVisible) {
        currentStageName = activeVisible.nama;
      } else {
        // Fall back to the last completed visible stage
        const doneVisible = [...visibleStages].reverse().find(s => progressMap[s.id]?.status === 'SELESAI');
        if (doneVisible) currentStageName = doneVisible.nama;
      }
    }

    // Build stage list with status — only the stages the customer is
    // meant to see. Renumber the visible ones 1..N so the timeline stays
    // sequential even though hidden stages sit between them internally.
    const stageList = stages
      .filter(s => CUSTOMER_VISIBLE_STAGES.has(s.nama))
      .map((s, i) => {
        const p = progressMap[s.id];
        return {
          id: s.id,
          urutan: i + 1,
          nama: s.nama,
          status: p?.status || 'BELUM',
          started_at: p?.started_at || null,
          completed_at: p?.completed_at || null,
        };
      });

    // Tgl Selesai = deadline lock (same math as the CRM Deadline Lock
    // board). Reguler = ACC + 21 working days, Express = ACC + N working
    // days, Prioritas = manual orders.deadline_lock. Falls back to
    // estimasi_deadline / wo.deadline if the order isn't tagged yet.
    let holidays = new Set<string>();
    try {
      const holidayRows = await query<{ tanggal: string | Date }>('SELECT tanggal FROM libur_nasional');
      holidays = new Set(
        holidayRows
          .map(h => {
            if (!h.tanggal) return '';
            if (h.tanggal instanceof Date) {
              return `${h.tanggal.getFullYear()}-${String(h.tanggal.getMonth() + 1).padStart(2, '0')}-${String(h.tanggal.getDate()).padStart(2, '0')}`;
            }
            const m = String(h.tanggal).match(/(\d{4})-(\d{2})-(\d{2})/);
            return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
          })
          .filter(Boolean)
      );
    } catch {}
    const tglSelesai = order
      ? computeDeadlineLock({
          pilihanPaket: order.pilihan_paket,
          tanggalAccProofing: order.tanggal_acc_proofing,
          deadlineLock: order.deadline_lock,
          holidays,
        })
      : '';
    const displayDeadline = tglSelesai || order?.estimasi_deadline || wo.deadline;

    // Admin/CS contact number for the "Hubungi via WhatsApp" button.
    // Prefer the `admin_whatsapp` row in the settings table so it can be
    // edited without a redeploy; fall back to the ADMIN_WHATSAPP env var.
    let adminWhatsapp = '';
    try {
      const setRows = await query<{ value: string | null }>(
        "SELECT `value` FROM `settings` WHERE `key_name` = 'admin_whatsapp' LIMIT 1"
      );
      adminWhatsapp = String(setRows[0]?.value || '').trim();
    } catch {}
    if (!adminWhatsapp) adminWhatsapp = String(process.env.ADMIN_WHATSAPP || '').trim();

    return NextResponse.json({
      success: true,
      data: {
        no_wo: wo.no_wo,
        no_order: order?.no_order || '',
        customer_nama: wo.customer_nama,
        customer_phone: order?.customer_phone || '',
        admin_whatsapp: adminWhatsapp,
        paket: wo.paket,
        bahan: wo.bahan || '',
        jumlah: wo.jumlah,
        keterangan: wo.keterangan || '',
        tanggal_order: order?.tanggal_order || wo.up_produksi || '',
        deadline: displayDeadline,
        status: wo.status,
        progressPercent,
        currentStageName,
        stages: stageList,
      },
    });
  } catch (err) {
    console.error('Tracking error:', err);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
