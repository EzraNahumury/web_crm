export type Role = 'admin' | 'cs' | 'produksi';
export type OrderStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE';
export type RiskLevel = 'SAFE' | 'NORMAL' | 'NEAR' | 'HIGH' | 'OVERDUE';

export interface Progress {
  PROOFING: boolean;
  WAITINGLIST: boolean;
  PRINT: boolean;
  PRES: boolean;
  CUT_FABRIC: boolean;
  JAHIT: boolean;
  QC_JAHIT_STEAM: boolean;
  FINISHING: boolean;
  PENGIRIMAN: boolean;
}

export interface Order {
  rowIndex: number;
  no: number;
  customer: string;
  customerPhone: string;
  sallaryProduct: number;
  sallaryShipping: number;
  qty: number;
  paket1: string;
  paket2: string;
  keterangan: string;
  bahan: string;
  dpProduksi: string;
  dlCust: string;
  noWorkOrder: string;
  tglSelesai: string;
  status: OrderStatus;
  progress: Progress;
  progressPercent?: number;
  currentStageName?: string;
  tglAccProofing?: string;
  tglKirim?: string;
  trackingLink?: string;
  daysLeft?: number | null;
  riskLevel?: RiskLevel;
  // Raw pilihan_paket string from orders (e.g. "Reguler", "Express - 3 hari",
  // "Prioritas"). Used by the Orders table to tint the row per service tier.
  pilihanPaket?: string;
  // Raw money + flags used by the header stat cards (customers who paid DP,
  // customers with ACC proofing scheduled).
  dpDesainAmount?: number;
  dpProduksiAmount?: number;
  hasAccProofing?: boolean;
  // Raw DB status ('SELLING', 'PENDING', 'IN_PROGRESS', 'DONE', ...) —
  // preserved so the Orders page can flag orders that came in from
  // CS Selling and still need CS Order to complete them.
  rawStatus?: string;
  // 'CS_SELLING' | 'CS_ORDER' — origin badge on the CS Order table
  // so users can tell handoff rows from directly-entered legacy rows.
  createdVia?: string;
  // Finance approval verdict on this order — used by the CS Order
  // table filter to hide rows that are still waiting Finance re-review
  // after CS Order finished the Pembayaran.
  financeStatus?: string;
  // Raw tanggal_order (ISO). Dipakai oleh cutoff filter di CS Order,
  // Produksi, dan Work Orders untuk menyembunyikan data legacy tanpa
  // menghapusnya. Lihat lib/data-cutoff.ts.
  rawTanggalOrder?: string;
}

export interface DashboardStats {
  totalOrders: number;
  openOrders: number;
  inProgressOrders: number;
  doneOrders: number;
  nearDeadlineCount: number;
  overdueCount: number;
  highRiskCount: number;
  todayCapacity: number;
  dailyCapacityUsed: number;
  stageCounts: Record<string, number>;
  totalRevenue: number;
}

export interface User {
  username: string;
  role: Role;
  nama?: string;
  menuAccess?: string[];
  stageAccess?: number[];
  // True only for accounts flagged is_super_admin in the DB. Gates
  // super-admin-only actions like rolling a WO back a production stage.
  isSuperAdmin?: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
