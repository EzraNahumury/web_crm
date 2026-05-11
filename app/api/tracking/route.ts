import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

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

    // Compute progress
    const totalStages = stages.length;
    const selesaiCount = progress.filter(p => p.status === 'SELESAI').length;
    const progressPercent = totalStages > 0 ? Math.round((selesaiCount / totalStages) * 100) : 0;

    // Find current stage
    const activeStage = progress.find(p => p.status === 'SEDANG') || progress.find(p => p.status === 'TERSEDIA');
    let currentStageName = 'Belum mulai';
    if (progressPercent >= 100) currentStageName = 'Selesai';
    else if (activeStage) {
      const s = stages.find(st => st.id === activeStage.stage_id);
      if (s) currentStageName = s.nama;
    }

    // Build stage list with status
    const stageList = stages.map(s => {
      const p = progressMap[s.id];
      return {
        id: s.id,
        urutan: s.urutan,
        nama: s.nama,
        status: p?.status || 'BELUM',
        started_at: p?.started_at || null,
        completed_at: p?.completed_at || null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        no_wo: wo.no_wo,
        no_order: order?.no_order || '',
        customer_nama: wo.customer_nama,
        customer_phone: order?.customer_phone || '',
        paket: wo.paket,
        bahan: wo.bahan || '',
        jumlah: wo.jumlah,
        keterangan: wo.keterangan || '',
        tanggal_order: order?.tanggal_order || wo.up_produksi || '',
        deadline: order?.estimasi_deadline || wo.deadline,
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
