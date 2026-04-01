export const STAGES = [
  { key: 'PROOFING', label: 'Proofing' },
  { key: 'WAITINGLIST', label: 'Waiting List' },
  { key: 'PRINT', label: 'Print' },
  { key: 'PRES', label: 'Pres' },
  { key: 'CUT_FABRIC', label: 'Cut Fabric' },
  { key: 'JAHIT', label: 'Jahit' },
  { key: 'QC_JAHIT_STEAM', label: 'QC Jahit & Steam' },
  { key: 'FINISHING', label: 'Finishing' },
  { key: 'PENGIRIMAN', label: 'Pengiriman' },
] as const;

export const PAKET1_OPTIONS = ['PRO', 'KLASIK', 'STANDAR', 'BASIC'];
export const PAKET2_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'BASIC'];
export const DAILY_CAPACITY = 200;

export const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-blue-50 text-blue-700 border border-blue-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 border border-amber-200',
  DONE: 'bg-green-50 text-green-700 border border-green-200',
};

export const RISK_STYLES: Record<string, string> = {
  SAFE: 'bg-green-50 text-green-700 border border-green-200',
  NORMAL: 'bg-slate-50 text-slate-600 border border-slate-200',
  NEAR: 'bg-amber-50 text-amber-700 border border-amber-200',
  HIGH: 'bg-red-50 text-red-700 border border-red-200',
  OVERDUE: 'bg-red-600 text-white border border-red-600',
};

export const RISK_LABELS: Record<string, string> = {
  SAFE: 'Selesai',
  NORMAL: 'Normal',
  NEAR: 'Near Deadline',
  HIGH: 'High Risk',
  OVERDUE: 'Overdue',
};

export const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Pending',
  IN_PROGRESS: 'Proses',
  DONE: 'Selesai',
};
