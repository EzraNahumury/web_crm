'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { apiGetOrders } from '@/lib/api';
import { Order } from '@/lib/types';
import { formatDate, getCurrentStage } from '@/lib/utils';

const STAGE_COLORS: Record<string, string> = {
  'Proofing': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'Waiting List': 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  'Print': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Pres': 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'Cut Fabric': 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  'Jahit': 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  'QC Jahit & Steam': 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  'Finishing': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  'Pengiriman': 'text-green-400 bg-green-500/10 border-green-500/20',
  'Layout Printing': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  'Belum mulai': 'text-slate-500 bg-slate-500/10 border-slate-500/20',
};

function getStatusInfo(order: Order) {
  if (order.riskLevel === 'OVERDUE') return { label: 'Terlambat', cls: 'text-red-400 bg-red-500/10 border-red-500/20' };
  if (order.status === 'DONE') return { label: 'Selesai', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
  if (order.status === 'IN_PROGRESS') return { label: 'Proses Produksi', cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
  return { label: 'Pending', cls: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };
}

export default function WorkOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    apiGetOrders().then(res => {
      if (res.success && res.data) setOrders(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const customers = useMemo(() => {
    const set = new Set(orders.map(o => o.customer));
    return Array.from(set).sort();
  }, [orders]);

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = !search ||
        o.noWorkOrder?.toLowerCase().includes(search.toLowerCase()) ||
        o.customer.toLowerCase().includes(search.toLowerCase());
      const matchCustomer = customerFilter === 'ALL' || o.customer === customerFilter;
      return matchSearch && matchCustomer;
    });
  }, [orders, search, customerFilter]);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-10 bg-white/[0.03] rounded-lg animate-pulse" />
      <div className="h-12 bg-white/[0.03] rounded-lg animate-pulse" />
      {[1,2,3].map(i => <div key={i} className="h-16 bg-white/[0.03] rounded-lg animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Work Order</h1>
          <p className="text-sm text-slate-400 mt-1">Lacak semua perintah kerja dan progres produksi.</p>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 border border-white/10 hover:bg-white/[0.04] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Buat WO dari Order
        </button>
      </div>

      {/* Search & Filter */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-4">
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cari berdasarkan No WO atau Customer..."
              className="w-full bg-transparent border-0 text-white placeholder-slate-500 pl-10 pr-4 py-2.5 text-sm focus:outline-none" />
          </div>
          <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
            className="bg-transparent border border-white/10 text-slate-300 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer pr-8 shrink-0">
            <option value="ALL">Semua Customer</option>
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['NO WO','NO ORDER','CUSTOMER','PAKET','BAHAN','TANGGAL ORDER','DEADLINE','TAHAP PRODUKSI','STATUS','AKSI'].map(h => (
                  <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-5 py-12 text-center text-sm text-slate-500">Tidak ada work order ditemukan</td></tr>
              ) : (
                filtered.map(order => {
                  const stage = getCurrentStage(order.progress);
                  const status = getStatusInfo(order);
                  const isOverdue = order.riskLevel === 'OVERDUE' || order.riskLevel === 'HIGH';
                  return (
                    <tr key={order.rowIndex} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4">
                        <span className="text-sm text-blue-400 font-medium">{order.noWorkOrder || '-'}</span>
                        {isOverdue && (
                          <svg className="inline-block w-3.5 h-3.5 text-amber-400 ml-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-300">ORD{String(order.no).padStart(3, '0')}</td>
                      <td className="px-5 py-4 text-sm text-slate-300">{order.customer}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">{order.paket1} {order.paket2}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">{order.bahan || '-'}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">{formatDate(order.dpProduksi)}</td>
                      <td className={`px-5 py-4 text-sm font-medium ${isOverdue ? 'text-red-400' : 'text-slate-400'}`}>
                        {formatDate(order.tglSelesai || order.dlCust)}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STAGE_COLORS[stage] || STAGE_COLORS['Belum mulai']}`}>{stage}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${status.cls}`}>{status.label}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => router.push(`/work-orders/${order.rowIndex}`)} className="text-slate-500 hover:text-blue-400 transition-colors p-1" title="Lihat">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </button>
                          <button className="text-slate-500 hover:text-amber-400 transition-colors p-1" title="Edit">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                          </button>
                          <button className="text-slate-500 hover:text-red-400 transition-colors p-1" title="Hapus">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-[#141a2e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-bold text-white">Buat Work Order dari Order</h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-6">Pilih order yang akan dikonversi menjadi Work Order dan upload dokumen pendukung (opsional).</p>
            <div>
              <label className="block text-sm font-medium text-white mb-2">Pilih Order</label>
              <select className="w-full bg-[#0d1117] border border-white/10 text-slate-400 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer">
                <option>Tidak ada order pending</option>
              </select>
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5">
                Tidak ada order pending
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-8">
              <button onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">
                Batal
              </button>
              <button className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
                Buat Work Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
