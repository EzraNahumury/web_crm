import { Order, DashboardStats, ApiResponse } from './types';
import { getCached, setCached, invalidateCache } from './cache';

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

  const [ordersRes, itemsRes] = await Promise.all([
    fetch('/api/db/orders').then(r => r.json()),
    fetch('/api/db/order_items').then(r => r.json()),
  ]);
  if (ordersRes.success && ordersRes.data) {
    const items = itemsRes.success ? itemsRes.data : [];
    const orders = mapOrders(ordersRes.data, items);
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

  const [oRes, iRes] = await Promise.all([
    fetch('/api/db/orders').then(r => r.json()),
    fetch('/api/db/order_items').then(r => r.json()),
  ]);
  if (oRes.success && oRes.data) {
    const orders = mapOrders(oRes.data, iRes.success ? iRes.data : []);
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
  dp_produksi: number;
  tracking_link: string;
  nama_tim: string;
  created_at: string;
  // joined from order_items (first item for compat)
  paket_nama?: string;
  bahan_kain?: string;
  qty?: number;
}

interface DbItem {
  order_id: number;
  paket_nama: string;
  bahan_kain: string;
  qty: number;
}

function mapOrders(rows: DbOrder[], items: DbItem[] = []): Order[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Group items by order_id (collect all)
  const itemsMap: Record<number, DbItem[]> = {};
  for (const item of items) {
    if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
    itemsMap[item.order_id].push(item);
  }

  return rows.map((r, i) => {
    const orderItems = itemsMap[r.id] || [];
    const paketNames = orderItems.map(it => it.paket_nama).filter(Boolean).join(', ');
    const bahanNames = orderItems.map(it => it.bahan_kain).filter(Boolean).join(', ');
    const totalQty = orderItems.reduce((s, it) => s + (it.qty || 0), 0);
    const deadline = r.estimasi_deadline ? new Date(r.estimasi_deadline) : null;
    const daysLeft = deadline ? Math.floor((deadline.getTime() - today.getTime()) / 86400000) : null;

    const status = r.status === 'DONE' ? 'DONE' : r.status === 'IN_PROGRESS' || r.status === 'CONFIRMED' ? 'IN_PROGRESS' : 'OPEN';
    let riskLevel: 'SAFE'|'NORMAL'|'NEAR'|'HIGH'|'OVERDUE' = 'NORMAL';
    if (status === 'DONE') riskLevel = 'SAFE';
    else if (daysLeft !== null) {
      if (daysLeft < 0) riskLevel = 'OVERDUE';
      else if (daysLeft <= 3) riskLevel = 'HIGH';
      else if (daysLeft <= 7) riskLevel = 'NEAR';
    }

    const fmtDate = (d: string) => {
      if (!d) return '';
      try { const dt = new Date(d); return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`; }
      catch { return d; }
    };

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
      noWorkOrder: '',
      tglSelesai: fmtDate(r.estimasi_deadline),
      status,
      progress: { PROOFING: false, WAITINGLIST: false, PRINT: false, PRES: false, CUT_FABRIC: false, JAHIT: false, QC_JAHIT_STEAM: false, FINISHING: false, PENGIRIMAN: false },
      daysLeft,
      riskLevel,
      sallaryProduct: Number(r.nominal_order) || 0,
      sallaryShipping: 0,
      trackingLink: r.tracking_link || '',
    } as Order;
  });
}

function computeStats(orders: Order[]): DashboardStats {
  const open = orders.filter(o => o.status === 'OPEN').length;
  const inProgress = orders.filter(o => o.status === 'IN_PROGRESS').length;
  const done = orders.filter(o => o.status === 'DONE').length;
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
  };
}
