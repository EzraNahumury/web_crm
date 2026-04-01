'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiGetOrders, apiGetOrdersForce, apiUpdateOrder } from '@/lib/api';
import { Order, OrderStatus } from '@/lib/types';
import { STAGES, RISK_LABELS, STATUS_LABELS } from '@/lib/constants';
import { formatDate, getProgressPercent, getCurrentStage } from '@/lib/utils';
import CreateOrderDrawer from './create-order-drawer';

const STATUS_STYLES_DARK: Record<string, string> = {
  OPEN: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  IN_PROGRESS: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  DONE: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
};
const RISK_STYLES_DARK: Record<string, string> = {
  SAFE: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  NORMAL: 'bg-white/[0.04] text-white/40 border border-white/[0.06]',
  NEAR: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  HIGH: 'bg-red-500/10 text-red-400 border border-red-500/20',
  OVERDUE: 'bg-red-500/20 text-red-400 border border-red-500/30',
};

async function generateOrderPDF(orders: Order[], type: 'weekly' | 'monthly', parseMonthKey: (s: string) => string) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const BULAN_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const BULAN_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

  let reportOrders: Order[];
  let title: string;
  let fileName: string;

  if (type === 'monthly') {
    const yr = today.getFullYear(), mo = today.getMonth();
    const key = `${yr}-${String(mo + 1).padStart(2, '0')}`;
    reportOrders = orders.filter(o => parseMonthKey(o.tglSelesai || o.dlCust || '') === key);
    title = `CRM AYRES ${BULAN_FULL[mo].toUpperCase()} ${yr}`;
    fileName = `laporan-bulanan-${yr}-${String(mo + 1).padStart(2, '0')}.pdf`;
  } else {
    const day = today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    const sat = new Date(mon);
    sat.setDate(mon.getDate() + 12);
    reportOrders = orders.filter(o => {
      const dateStr = o.dpProduksi || '';
      if (!dateStr) return false;
      let d: Date;
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
        const [dd, mm, yy] = dateStr.split('/');
        d = new Date(+yy, +mm - 1, +dd);
      } else {
        d = new Date(dateStr);
      }
      return !isNaN(d.getTime()) && d >= mon && d <= sat;
    });
    const fmtD = (d: Date) => `${d.getDate()} ${BULAN_SHORT[d.getMonth()]} ${d.getFullYear()}`;
    title = `CRM AYRES 2 MINGGUAN ${fmtD(mon)} - ${fmtD(sat)}`;
    fileName = `laporan-2mingguan-${today.getFullYear()}-${String(mon.getDate()).padStart(2,'0')}${BULAN_SHORT[mon.getMonth()]}.pdf`;
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageW / 2, 14, { align: 'center' });
  const chk = (v: boolean) => v ? '\u2713' : '-';

  autoTable(doc, {
    startY: 20,
    margin: { left: 8, right: 8 },
    columns: [
      { header: 'NO', dataKey: 'no' },{ header: 'CUSTOMER', dataKey: 'customer' },{ header: 'QTY', dataKey: 'qty' },
      { header: 'PAKET', dataKey: 'paket' },{ header: 'KETERANGAN', dataKey: 'ket' },{ header: 'BAHAN', dataKey: 'bahan' },
      { header: 'DP PRODUKSI', dataKey: 'dp' },{ header: 'DL CUST & PRODUKSI', dataKey: 'dl' },{ header: 'NO WORK ORDER', dataKey: 'wo' },
      { header: 'PROOFING', dataKey: 'p1' },{ header: 'WAITINGLIST', dataKey: 'p2' },{ header: 'PRINT', dataKey: 'p3' },
      { header: 'PRES', dataKey: 'p4' },{ header: 'CUT FABRIC', dataKey: 'p5' },{ header: 'JAHIT', dataKey: 'p6' },
      { header: 'QC JAHIT DAN STEAM', dataKey: 'p7' },{ header: 'FINISHING', dataKey: 'p8' },{ header: 'PENGIRIMAN', dataKey: 'p9' },
    ],
    body: reportOrders.map((o, i) => ({
      no: i + 1, customer: o.customer, qty: o.qty, paket: `${o.paket1} ${o.paket2}`,
      ket: o.keterangan || '-', bahan: o.bahan || '-', dp: formatDate(o.dpProduksi), dl: formatDate(o.dlCust),
      wo: o.noWorkOrder || '-', p1: chk(o.progress.PROOFING), p2: chk(o.progress.WAITINGLIST),
      p3: chk(o.progress.PRINT), p4: chk(o.progress.PRES), p5: chk(o.progress.CUT_FABRIC),
      p6: chk(o.progress.JAHIT), p7: chk(o.progress.QC_JAHIT_STEAM), p8: chk(o.progress.FINISHING), p9: chk(o.progress.PENGIRIMAN),
    })),
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', fontSize: 7, halign: 'center' },
    didParseCell: (data) => {
      if (data.column.index >= 9 && data.section === 'body') {
        if (data.cell.raw === '\u2713') data.cell.text = [''];
        else data.cell.styles.textColor = [200, 200, 200];
      }
    },
    didDrawCell: (data) => {
      if (data.column.index >= 9 && data.section === 'body' && data.cell.raw === '\u2713') {
        const cx = data.cell.x + data.cell.width / 2, cy = data.cell.y + data.cell.height / 2, s = 1.6;
        data.doc.setDrawColor(22, 163, 74); data.doc.setLineWidth(0.55);
        data.doc.line(cx - s, cy + s * 0.05, cx - s * 0.15, cy + s * 0.85);
        data.doc.line(cx - s * 0.15, cy + s * 0.85, cx + s, cy - s * 0.75);
        data.doc.setDrawColor(0); data.doc.setLineWidth(0.2);
      }
    },
    columnStyles: {
      0:{cellWidth:7},1:{cellWidth:22},2:{cellWidth:8,halign:'center'},3:{cellWidth:14,halign:'center'},4:{cellWidth:28},
      5:{cellWidth:14},6:{cellWidth:17,halign:'center'},7:{cellWidth:20,halign:'center'},8:{cellWidth:17},
      9:{cellWidth:14,halign:'center'},10:{cellWidth:15,halign:'center'},11:{cellWidth:11,halign:'center'},
      12:{cellWidth:9,halign:'center'},13:{cellWidth:15,halign:'center'},14:{cellWidth:10,halign:'center'},
      15:{cellWidth:18,halign:'center'},16:{cellWidth:13,halign:'center'},17:{cellWidth:14,halign:'center'},
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  doc.save(fileName);
}

export default function OrdersPage() {
  const { user } = useAuth();
  const orderRouter = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [monthFilter, setMonthFilter] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [selected, setSelected] = useState<Order | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateOpen(true);
  }, [searchParams]);

  useEffect(() => { fetchOrders(false); }, []);

  async function fetchOrders(force = false) {
    try {
      const res = force ? await apiGetOrdersForce() : await apiGetOrders();
      if (res.success && res.data) { setOrders(res.data); setError(''); }
      else setError(res.error || 'Gagal memuat order');
    } catch { setError('Gagal terhubung ke server'); }
    setLoading(false);
  }

  const parseMonthKey = (s: string) => {
    if (!s) return '';
    const parts = s.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}`;
    const d = new Date(s); return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const monthLabel = (key: string) => {
    const [y, m] = key.split('-');
    const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${BULAN[+m - 1]} ${y}`;
  };

  const sortedMonths = useMemo(() => {
    const keys = new Set(orders.map(o => parseMonthKey(o.tglSelesai || o.dlCust || '')).filter(Boolean));
    return Array.from(keys).sort();
  }, [orders]);

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = !search || o.customer.toLowerCase().includes(search.toLowerCase()) ||
        o.noWorkOrder?.toLowerCase().includes(search.toLowerCase()) ||
        o.keterangan?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || o.status === statusFilter;
      const matchRisk = riskFilter === 'ALL' || o.riskLevel === riskFilter;
      const matchMonth = !monthFilter || parseMonthKey(o.tglSelesai || o.dlCust || '') === monthFilter;
      return matchSearch && matchStatus && matchRisk && matchMonth;
    });
  }, [orders, search, statusFilter, riskFilter, monthFilter]);

  useEffect(() => { setPage(1); }, [search, statusFilter, riskFilter, monthFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) return <TableSkeleton />;
  if (error) return (
    <div className="flex flex-col items-center py-20 text-center">
      <p className="text-white/40 mb-4">{error}</p>
      <button onClick={() => fetchOrders(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm">Coba Lagi</button>
    </div>
  );

  const countOpen = orders.filter(o => o.status === 'OPEN').length;
  const countProgress = orders.filter(o => o.status === 'IN_PROGRESS').length;
  const countDone = orders.filter(o => o.status === 'DONE').length;
  const countOverdue = orders.filter(o => o.riskLevel === 'OVERDUE').length;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Summary stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Baru', count: countOpen, color: 'from-blue-500/20 to-blue-500/5', border: 'border-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
          { label: 'Proses', count: countProgress, color: 'from-amber-500/20 to-amber-500/5', border: 'border-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
          { label: 'Selesai', count: countDone, color: 'from-emerald-500/20 to-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
          { label: 'Overdue', count: countOverdue, color: 'from-red-500/20 to-red-500/5', border: 'border-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
        ].map(s => (
          <div key={s.label} className={`relative rounded-xl bg-gradient-to-br ${s.color} border ${s.border} p-4 overflow-hidden`}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider">{s.label}</span>
            </div>
            <p className={`text-2xl font-bold ${s.text} tabular-nums`}>{s.count}</p>
          </div>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2.5 flex-1">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              placeholder="Cari customer, WO..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-xl border border-white/[0.06] bg-white/[0.03] text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/40 focus:bg-white/[0.05] w-56 transition-all"
            />
          </div>

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as OrderStatus | 'ALL')}
            className="px-3 py-2 rounded-xl border border-white/[0.06] bg-white/[0.03] text-[13px] text-white/60 focus:outline-none focus:border-indigo-500/40 transition-all appearance-none cursor-pointer">
            <option value="ALL">Semua Status</option>
            <option value="OPEN">Baru</option>
            <option value="IN_PROGRESS">Proses</option>
            <option value="DONE">Selesai</option>
          </select>

          <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-white/[0.06] bg-white/[0.03] text-[13px] text-white/60 focus:outline-none focus:border-indigo-500/40 transition-all appearance-none cursor-pointer">
            <option value="ALL">Semua Risk</option>
            <option value="HIGH">High Risk</option>
            <option value="NEAR">Near Deadline</option>
            <option value="OVERDUE">Overdue</option>
            <option value="NORMAL">Normal</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {user?.role === 'admin' && (
            <div className="relative">
              <button onClick={() => setExportOpen(o => !o)}
                className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl text-[13px] font-medium transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Export
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1.5 bg-[#141628] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/40 z-20 py-1 min-w-[180px]">
                  <button onClick={() => { generateOrderPDF(orders, 'weekly', parseMonthKey); setExportOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-white/60 hover:text-white hover:bg-white/[0.04] flex items-center gap-2 transition-colors">
                    <svg className="w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    Laporan 2 Mingguan
                  </button>
                  <button onClick={() => { generateOrderPDF(orders, 'monthly', parseMonthKey); setExportOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-white/60 hover:text-white hover:bg-white/[0.04] flex items-center gap-2 transition-colors">
                    <svg className="w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    Laporan Bulanan
                  </button>
                </div>
              )}
            </div>
          )}
          {user?.role === 'admin' && (
            <button onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-[13px] font-medium transition-colors shadow-lg shadow-blue-600/20">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4"/></svg>
              Order Baru
            </button>
          )}
          {user?.role === 'cs' && (
            <Link href="/orders/new"
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-[13px] font-medium transition-colors shadow-lg shadow-indigo-600/20">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4"/></svg>
              Input Order
            </Link>
          )}
        </div>
      </div>

      {/* Month tabs */}
      {sortedMonths.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <button onClick={() => setMonthFilter('')}
            className={`shrink-0 px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all border
              ${!monthFilter ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25' : 'bg-white/[0.02] text-white/30 border-white/[0.04] hover:border-white/[0.08] hover:text-white/50'}`}>
            Semua
          </button>
          {sortedMonths.map(mk => {
            const count = orders.filter(o => parseMonthKey(o.tglSelesai || o.dlCust || '') === mk).length;
            return (
              <button key={mk} onClick={() => setMonthFilter(mk)}
                className={`shrink-0 px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all border
                  ${monthFilter === mk ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25' : 'bg-white/[0.02] text-white/30 border-white/[0.04] hover:border-white/[0.08] hover:text-white/50'}`}>
                {monthLabel(mk)}
                <span className={`ml-1.5 tabular-nums ${monthFilter === mk ? 'text-indigo-400/60' : 'text-white/15'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-white/[0.04]">
                <th className="text-left px-4 py-3 text-[11px] font-medium text-white/20 uppercase tracking-wider">No</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium text-white/20 uppercase tracking-wider">Customer</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium text-white/20 uppercase tracking-wider">Qty</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium text-white/20 uppercase tracking-wider">Paket</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium text-white/20 uppercase tracking-wider">Bahan</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium text-white/20 uppercase tracking-wider">DP Produksi</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium text-white/20 uppercase tracking-wider">DL Customer</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium text-white/20 uppercase tracking-wider">Tgl Selesai</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium text-white/20 uppercase tracking-wider">Progress</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium text-white/20 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium text-white/20 uppercase tracking-wider">Risk</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {paged.map(order => {
                const pct = getProgressPercent(order.progress);
                return (
                  <tr key={order.rowIndex}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer group"
                    onClick={() => orderRouter.push(`/orders/${order.rowIndex}`)}>
                    <td className="px-4 py-3.5 text-white/20 font-mono text-[11px]">{order.no}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-white/80 group-hover:text-white transition-colors">{order.customer}</div>
                      {order.noWorkOrder && <div className="text-[11px] text-white/25 mt-0.5">{order.noWorkOrder}</div>}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-white/50">{order.qty}</td>
                    <td className="px-4 py-3.5">
                      <span className="text-white/60 font-medium">{order.paket1}</span>
                      <span className="ml-1.5 text-[11px] bg-white/[0.05] text-white/30 px-1.5 py-0.5 rounded">{order.paket2}</span>
                    </td>
                    <td className="px-4 py-3.5 text-white/35">{order.bahan || '-'}</td>
                    <td className="px-4 py-3.5 text-white/35">{formatDate(order.dpProduksi)}</td>
                    <td className="px-4 py-3.5 text-white/35">{formatDate(order.dlCust)}</td>
                    <td className="px-4 py-3.5 text-white/35">{formatDate(order.tglSelesai)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] text-white/30 w-7 shrink-0 tabular-nums">{pct}%</span>
                      </div>
                      <div className="text-[11px] text-white/20 mt-0.5">{getCurrentStage(order.progress)}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-[11px] px-2.5 py-1 rounded-lg font-medium ${STATUS_STYLES_DARK[order.status]}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-[11px] px-2.5 py-1 rounded-lg font-medium ${RISK_STYLES_DARK[order.riskLevel || 'NORMAL']}`}>
                        {RISK_LABELS[order.riskLevel || 'NORMAL']}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <button onClick={e => { e.stopPropagation(); orderRouter.push(`/orders/${order.rowIndex}`); }}
                        className="text-white/15 hover:text-indigo-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-6 py-16 text-center text-white/20">
                    <svg className="w-10 h-10 mx-auto mb-3 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    Tidak ada order yang sesuai filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-white/[0.04] flex items-center justify-between">
            <span className="text-[11px] text-white/20 tabular-nums">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} dari {filtered.length}
            </span>
            <PaginationBar current={page} total={totalPages} onChange={setPage} />
          </div>
        )}
      </div>

      {selected && (
        <OrderDetailModal order={selected} onClose={() => setSelected(null)} canEdit={user?.role === 'cs'} onSaved={fetchOrders} />
      )}

      <CreateOrderDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function PaginationBar({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) {
  const pages: (number | '...')[] = [];
  if (total <= 7) { for (let i = 1; i <= total; i++) pages.push(i); }
  else {
    pages.push(1);
    if (current > 3) pages.push('...');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
  }
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => current > 1 && onChange(current - 1)} disabled={current === 1}
        className="min-w-[32px] h-7 px-2 rounded-lg text-[12px] font-medium text-white/30 hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
        Prev
      </button>
      {pages.map((p, i) => p === '...'
        ? <span key={`el-${i}`} className="px-1 text-white/15 text-[12px]">...</span>
        : <button key={p} onClick={() => onChange(p as number)}
            className={`min-w-[28px] h-7 px-1.5 rounded-lg text-[12px] font-medium transition-colors
              ${p === current ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/25' : 'text-white/30 hover:bg-white/[0.04]'}`}>
            {p}
          </button>
      )}
      <button onClick={() => current < total && onChange(current + 1)} disabled={current === total}
        className="min-w-[32px] h-7 px-2 rounded-lg text-[12px] font-medium text-white/30 hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
        Next
      </button>
    </div>
  );
}

function OrderDetailModal({ order, onClose, canEdit, onSaved }: {
  order: Order; onClose: () => void; canEdit: boolean; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ keterangan: order.keterangan, bahan: order.bahan });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const trackingUrl = typeof window !== 'undefined' && order.trackingLink
    ? new URL(order.trackingLink, window.location.origin).toString()
    : order.trackingLink || '';

  async function handleSave() {
    setSaving(true);
    await apiUpdateOrder({ rowIndex: order.rowIndex, ...form });
    setSaving(false); setEditing(false); onSaved();
  }

  async function copyTrackingLink() {
    if (!trackingUrl) return;
    await navigator.clipboard.writeText(trackingUrl);
    setCopied(true); window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#12142a] border border-white/[0.06] rounded-2xl shadow-2xl shadow-black/40 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-white/[0.04] flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white/90">{order.customer}</h3>
            <p className="text-[13px] text-white/30">{order.noWorkOrder || `#${order.no}`}</p>
          </div>
          <button onClick={onClose} className="text-white/20 hover:text-white/50 transition-colors mt-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow label="Qty" value={`${order.qty} pcs`} />
            <InfoRow label="Paket" value={`${order.paket1} ${order.paket2}`} />
            <InfoRow label="WhatsApp" value={order.customerPhone || '-'} />
            <InfoRow label="Sallary Product" value={formatMoney(order.sallaryProduct)} />
            <InfoRow label="Sallary Pengiriman" value={formatMoney(order.sallaryShipping)} />
            <InfoRow label="Bahan" value={order.bahan || '-'} />
            <InfoRow label="DP Produksi" value={formatDate(order.dpProduksi)} />
            <InfoRow label="DL Customer" value={formatDate(order.dlCust)} />
            <InfoRow label="Tgl Selesai" value={formatDate(order.tglSelesai)} highlight />
            <InfoRow label="No. Work Order" value={order.noWorkOrder || '-'} />
          </div>

          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <span className="text-white/25 text-[11px] block mb-1">Keterangan</span>
            <span className="text-white/60 text-[13px]">{order.keterangan || '-'}</span>
          </div>

          {trackingUrl && (
            <div className="p-3.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15 space-y-2">
              <span className="text-emerald-400 text-[11px] font-semibold block">Link Tracking Customer</span>
              <div className="rounded-lg bg-black/20 border border-emerald-500/10 px-3 py-2 text-[11px] text-white/40 break-all">{trackingUrl}</div>
              <div className="flex gap-2">
                <button onClick={copyTrackingLink}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-[11px] font-medium border border-emerald-500/20 transition-colors">
                  {copied ? 'Tersalin' : 'Copy Link'}
                </button>
                <a href={trackingUrl} target="_blank" rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/40 text-[11px] font-medium hover:text-white/60 transition-colors">
                  Buka Tracking
                </a>
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold text-white/20 uppercase tracking-wider mb-3">Progress Tahapan</p>
            <div className="grid grid-cols-3 gap-2">
              {STAGES.map(s => {
                const checked = order.progress[s.key as keyof typeof order.progress];
                return (
                  <div key={s.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium border transition-colors
                    ${checked ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-white/[0.02] border-white/[0.04] text-white/20'}`}>
                    <svg className={`w-3.5 h-3.5 shrink-0 ${checked ? 'text-indigo-400' : 'text-white/10'}`} fill={checked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                    </svg>
                    {s.label}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <span className={`text-[11px] px-3 py-1 rounded-lg font-semibold ${STATUS_STYLES_DARK[order.status]}`}>
              {STATUS_LABELS[order.status]}
            </span>
            <span className={`text-[11px] px-3 py-1 rounded-lg font-semibold ${RISK_STYLES_DARK[order.riskLevel || 'NORMAL']}`}>
              {RISK_LABELS[order.riskLevel || 'NORMAL']}
            </span>
            {order.daysLeft != null && (
              <span className={`text-[11px] px-3 py-1 rounded-lg font-semibold ${order.daysLeft < 0 ? 'bg-red-500/15 text-red-400 border border-red-500/20' : order.daysLeft <= 3 ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 'bg-white/[0.04] text-white/40 border border-white/[0.06]'}`}>
                {order.daysLeft < 0 ? `${Math.abs(order.daysLeft)} hari lewat` : `${order.daysLeft} hari lagi`}
              </span>
            )}
          </div>
        </div>

        {canEdit && order.status === 'OPEN' && (
          <div className="px-6 pb-6">
            <button onClick={onClose} className="w-full bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.06] text-white/50 py-2.5 rounded-xl text-[13px] font-medium transition-colors">
              Tutup
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0);
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
      <span className="text-[11px] text-white/25 block mb-0.5">{label}</span>
      <span className={`text-[13px] font-semibold ${highlight ? 'text-indigo-400' : 'text-white/60'}`}>{value}</span>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <div key={i} className="h-[76px] bg-white/[0.03] rounded-xl animate-pulse border border-white/[0.04]" />)}
      </div>
      <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] overflow-hidden">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-14 border-b border-white/[0.03] animate-pulse bg-white/[0.01]" style={{ opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    </div>
  );
}
