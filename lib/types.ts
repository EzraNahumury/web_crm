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
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
