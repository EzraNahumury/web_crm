import { Order, DashboardStats, ApiResponse } from './types';
import { getCached, setCached, invalidateCache } from './cache';
import { computeDeadlineLock, hasJaket } from './business-days';

// ─── Auth ───────────────────────────────────────────────
export async function apiLogin(username: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}

// ─── Orders ─────────────────────────────────────────────
export async function apiGetOrders(): Promise<ApiResponse<Order[]>> {
  const cached = getCached<Order[]>('wp_orders');
  if (cached) return { success: true, data: cached };

  const [ordersRes, itemsRes, woRes, wpRes, stagesRes, holidaysRes] = await Promise.all([
    fetch('/api/db/orders').then(r => r.json()),
    fetch('/api/db/order_items').then(r => r.json()),
    fetch('/api/db/work_orders').then(r => r.json()),
    fetch('/api/db/wo_progress').then(r => r.json()),
    fetch('/api/db/production_stages').then(r => r.json()),
    fetch('/api/db/libur_nasional').then(r => r.json()).catch(() => ({ success: false, data: [] })),
  ]);
  if (ordersRes.success && ordersRes.data) {
    const items = itemsRes.success ? itemsRes.data : [];
    const wos = woRes.success ? woRes.data : [];
    const wps = wpRes.success ? wpRes.data : [];
    const stages = stagesRes.success ? stagesRes.data : [];
    const holidays = holidaysRes?.success ? holidaysRes.data : [];
    const orders = mapOrders(ordersRes.data, items, wos, wps, stages, holidays);
    setCached('wp_orders', orders);
    return { success: true, data: orders };
  }
  return { success: false, error: ordersRes.error || 'Gagal memuat orders' };
}

export async function apiGetOrdersForce(): Promise<ApiResponse<Order[]>> {
  invalidateCache('wp_orders');
  return apiGetOrders();
}

// ─── Dashboard ──────────────────────────────────────────
export async function apiGetDashboard(): Promise<ApiResponse<DashboardStats>> {
  const cached = getCached<DashboardStats>('wp_dashboard');
  if (cached) return { success: true, data: cached };

  const [oRes, iRes, woRes, wpRes, stagesRes, holidaysRes] = await Promise.all([
    fetch('/api/db/orders').then(r => r.json()),
    fetch('/api/db/order_items').then(r => r.json()),
    fetch('/api/db/work_orders').then(r => r.json()),
    fetch('/api/db/wo_progress').then(r => r.json()),
    fetch('/api/db/production_stages').then(r => r.json()),
    fetch('/api/db/libur_nasional').then(r => r.json()).catch(() => ({ success: false, data: [] })),
  ]);
  if (oRes.success && oRes.data) {
    const orders = mapOrders(oRes.data, iRes.success ? iRes.data : [], woRes.success ? woRes.data : [], wpRes.success ? wpRes.data : [], stagesRes.success ? stagesRes.data : [], holidaysRes?.success ? holidaysRes.data : []);
    const stats = computeStats(orders);
    setCached('wp_dashboard', stats);
    return { success: true, data: stats };
  }
  return { success: false, error: oRes.error || 'Gagal memuat dashboard' };
}

export async function apiGetDashboardForce(): Promise<ApiResponse<DashboardStats>> {
  invalidateCache('wp_dashboard');
  return apiGetDashboard();
}

// ─── Tracking (public) ──────────────────────────────────
export async function apiGetTracking(noWorkOrder: string): Promise<ApiResponse<Order>> {
  const res = await fetch(`/api/db/orders?search=${encodeURIComponent(noWorkOrder)}`);
  const json = await res.json();
  if (json.success && json.data?.length) {
    const orders = mapOrders(json.data);
    const found = orders.find(o => o.noWorkOrder === noWorkOrder);
    if (found) return { success: true, data: found };
  }
  return { success: false, error: 'Order tidak ditemukan' };
}

// ─── Helpers ────────────────────────────────────────────

interface DbOrder {
  id: number;
  no_order: string;
  customer_nama: string;
  customer_phone: string;
  tanggal_order: string;
  estimasi_deadline: string;
  keterangan: string;
  status: string;
  nominal_order: number;
  dp_desain: number;
  dp_produksi: number;
  tracking_link: string;
  tanggal_acc_proofing: string;
  nama_tim: string;
  pilihan_paket?: string | null;
  deadline_lock?: string | null;
  created_at: string;
  // joined from order_items (first item for compat)
  paket_nama?: string;
  bahan_kain?: string;
  qty?: number;
}

interface DbHoliday { tanggal: string }

interface DbItem {
  order_id: number;
  paket_nama: string;
  bahan_kain: string;
  qty: number;
}

interface DbWo {
  id: number;
  order_id: number;
  no_wo: string;
  current_stage_id: number | null;
  status: string;
}

interface DbWp {
  work_order_id: number;
  stage_id: number;
  status: string;
}

interface DbStage {
  id: number;
  urutan: number;
  nama: string;
}

// Extract YYYY-MM-DD from any MySQL date value (string or Date returned by
// mysql2). Kept identical to the /api/crm/deadline-lock isoDate helper.
function normalizeDateOnly(v: string | Date | null | undefined): string {
  if (!v) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function mapOrders(rows: DbOrder[], items: DbItem[] = [], wos: DbWo[] = [], wps: DbWp[] = [], stages: DbStage[] = [], holidays: DbHoliday[] = []): Order[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // Business-day calculator input — same source as CRM Deadline Lock so
  // "Tgl Selesai" here matches the deadline shown there.
  const holidaySet = new Set(holidays.map(h => normalizeDateOnly(h.tanggal)).filter(Boolean));

  // Group items by order_id (collect all)
  const itemsMap: Record<number, DbItem[]> = {};
  for (const item of items) {
    if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
    itemsMap[item.order_id].push(item);
  }

  // Group work orders by order_id
  const woByOrder: Record<number, DbWo[]> = {};
  for (const wo of wos) {
    if (!woByOrder[wo.order_id]) woByOrder[wo.order_id] = [];
    woByOrder[wo.order_id].push(wo);
  }

  // Group wo_progress by work_order_id
  const wpByWo: Record<number, DbWp[]> = {};
  for (const wp of wps) {
    if (!wpByWo[wp.work_order_id]) wpByWo[wp.work_order_id] = [];
    wpByWo[wp.work_order_id].push(wp);
  }

  // Sort stages by urutan
  const sortedStages = [...stages].sort((a, b) => a.urutan - b.urutan);
  const stageMap: Record<number, DbStage> = {};
  for (const s of stages) stageMap[s.id] = s;

  return rows.map((r, i) => {
    const orderItems = itemsMap[r.id] || [];
    const paketNames = orderItems.map(it => it.paket_nama).filter(Boolean).join(', ');
    const bahanNames = orderItems.map(it => it.bahan_kain).filter(Boolean).join(', ');
    const totalQty = orderItems.reduce((s, it) => s + (it.qty || 0), 0);
    const deadline = r.estimasi_deadline ? new Date(r.estimasi_deadline) : null;
    const daysLeft = deadline ? Math.floor((deadline.getTime() - today.getTime()) / 86400000) : null;

    let status: 'OPEN'|'IN_PROGRESS'|'DONE' = r.status === 'DONE' ? 'DONE' : r.status === 'IN_PROGRESS' || r.status === 'CONFIRMED' ? 'IN_PROGRESS' : 'OPEN';

    const fmtDate = (d: string) => {
      if (!d) return '';
      try { const dt = new Date(d); return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`; }
      catch { return d; }
    };

    // Compute real progress from wo_progress
    const orderWos = woByOrder[r.id] || [];
    const woNoList = orderWos.map(w => w.no_wo).filter(Boolean);
    let progressPercent = 0;
    let currentStageName = 'Belum mulai';

    if (orderWos.length > 0 && sortedStages.length > 0) {
      // Aggregate across all WOs for this order
      let totalDone = 0;
      let totalStages = 0;
      let latestActiveStageId: number | null = null;

      for (const wo of orderWos) {
        const progressList = wpByWo[wo.id] || [];
        const selesaiCount = progressList.filter(p => p.status === 'SELESAI').length;
        totalDone += selesaiCount;
        totalStages += sortedStages.length;

        // Find current active stage (TERSEDIA or SEDANG)
        const active = progressList.find(p => p.status === 'SEDANG') || progressList.find(p => p.status === 'TERSEDIA');
        if (active) latestActiveStageId = active.stage_id;
        // If all done for this WO
        if (selesaiCount === sortedStages.length && progressList.length > 0) {
          latestActiveStageId = null; // completed
        }
      }

      if (totalStages > 0) {
        progressPercent = Math.round((totalDone / totalStages) * 100);
      }

      if (progressPercent >= 100) {
        currentStageName = 'Selesai';
      } else if (latestActiveStageId && stageMap[latestActiveStageId]) {
        currentStageName = stageMap[latestActiveStageId].nama;
      } else if (totalDone > 0) {
        // Find the last completed stage
        for (const wo of orderWos) {
          const progressList = wpByWo[wo.id] || [];
          const completed = progressList
            .filter(p => p.status === 'SELESAI')
            .map(p => stageMap[p.stage_id])
            .filter(Boolean)
            .sort((a, b) => b.urutan - a.urutan);
          if (completed.length > 0) {
            currentStageName = completed[0].nama + ' (done)';
            break;
          }
        }
      }
    }

    // Override status to DONE if progress is 100%
    if (progressPercent >= 100) status = 'DONE';

    let riskLevel: 'SAFE'|'NORMAL'|'NEAR'|'HIGH'|'OVERDUE' = 'NORMAL';
    if (status === 'DONE') riskLevel = 'SAFE';
    else if (daysLeft !== null) {
      if (daysLeft < 0) riskLevel = 'OVERDUE';
      else if (daysLeft <= 3) riskLevel = 'HIGH';
      else if (daysLeft <= 7) riskLevel = 'NEAR';
    }

    return {
      rowIndex: r.id,
      no: i + 1,
      customer: r.customer_nama || '',
      customerPhone: r.customer_phone || '',
      qty: totalQty || r.qty || 0,
      paket1: paketNames || r.paket_nama || '',
      paket2: '',
      keterangan: r.keterangan || '',
      bahan: bahanNames || r.bahan_kain || '',
      dpProduksi: fmtDate(r.tanggal_order),
      dlCust: fmtDate(r.estimasi_deadline),
      noWorkOrder: woNoList.join(', '),
      // Tgl Selesai = deadline lock. Same rules as CRM Deadline Lock:
      //   Reguler   → tanggal_acc_proofing + 21 working days
      //   Express N → tanggal_acc_proofing + N working days
      //   Prioritas → orders.deadline_lock (manual from CS)
      tglSelesai: fmtDate(computeDeadlineLock({
        pilihanPaket: r.pilihan_paket,
        tanggalAccProofing: r.tanggal_acc_proofing,
        deadlineLock: r.deadline_lock,
        holidays: holidaySet,
        isJaket: hasJaket(orderItems.map(it => it.paket_nama)),
      })),
      pilihanPaket: r.pilihan_paket || '',
      dpDesainAmount: Number(r.dp_desain) || 0,
      dpProduksiAmount: Number(r.dp_produksi) || 0,
      hasAccProofing: !!r.tanggal_acc_proofing,
      status,
      rawStatus: r.status || '',
      progress: { PROOFING: false, WAITINGLIST: false, PRINT: false, PRES: false, CUT_FABRIC: false, JAHIT: false, QC_JAHIT_STEAM: false, FINISHING: false, PENGIRIMAN: false },
      progressPercent,
      currentStageName,
      daysLeft,
      riskLevel,
      sallaryProduct: Number(r.nominal_order) || 0,
      sallaryShipping: 0,
      tglAccProofing: fmtDate(r.tanggal_acc_proofing),
      trackingLink: r.tracking_link || '',
    } as Order;
  });
}

function computeStats(orders: Order[]): DashboardStats {
  const open = orders.filter(o => o.status === 'OPEN').length;
  const inProgress = orders.filter(o => o.status === 'IN_PROGRESS').length;
  const done = orders.filter(o => o.status === 'DONE').length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.sallaryProduct || 0), 0);
  return {
    totalOrders: orders.length,
    openOrders: open,
    inProgressOrders: inProgress,
    doneOrders: done,
    nearDeadlineCount: orders.filter(o => o.riskLevel === 'NEAR' || o.riskLevel === 'HIGH').length,
    overdueCount: orders.filter(o => o.riskLevel === 'OVERDUE').length,
    highRiskCount: orders.filter(o => o.riskLevel === 'HIGH').length,
    todayCapacity: 200,
    dailyCapacityUsed: 0,
    stageCounts: {},
    totalRevenue,
  };
}
