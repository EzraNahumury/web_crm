'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { apiGetDashboard, apiGetOrders, apiGetDashboardForce, apiGetOrdersForce } from '@/lib/api';
import { DashboardStats, Order } from '@/lib/types';
import { formatDate } from '@/lib/utils';

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace(user.role === 'cs' ? '/orders' : '/production');
      return;
    }
    fetchData();
  }, [user]);

  async function fetchData(force = false) {
    try {
      const [statsRes, ordersRes] = await Promise.all([
        apiGetDashboardForce(),
        apiGetOrdersForce(),
      ]);
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (ordersRes.success && ordersRes.data) setOrders(ordersRes.data);
      if (!statsRes.success) setError(statsRes.error || 'Gagal memuat data');
      else setError('');
    } catch { setError('Gagal terhubung ke server.'); }
    setLoading(false);
  }

  const overdueOrders = orders.filter(o => o.riskLevel === 'OVERDUE' || o.riskLevel === 'HIGH');
  const recentOrders = orders.slice(0, 5);

  const pendingCount = stats ? stats.openOrders : 0;
  const activeCount = stats ? stats.totalOrders - stats.doneOrders : 0;
  const overdueCount = stats?.overdueCount ?? 0;

  if (loading) return <DashboardSkeleton />;

  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 grid place-items-center mb-4">
        <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">Gagal Memuat Data</h3>
      <p className="text-sm text-slate-500 mb-4 max-w-sm">{error}</p>
      <button onClick={() => { setLoading(true); fetchData(true); }} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors">Coba Lagi</button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Selamat datang, berikut ringkasan bisnis Anda.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/orders?create=1"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>
            Order Baru
          </Link>
          <Link href="/master"
            className="flex items-center gap-2 border border-white/10 hover:bg-white/[0.04] text-slate-300 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg>
            Master Data
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="TOTAL PENDAPATAN"
          value="Rp 0,00"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          iconBg="bg-emerald-500/15"
          iconColor="text-emerald-400"
        />
        <StatCard
          label="CUSTOMER ORDERS"
          value={String(stats?.totalOrders ?? 0)}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>}
          iconBg="bg-blue-500/15"
          iconColor="text-blue-400"
        />
        <StatCard
          label="PENDING ORDERS"
          value={String(pendingCount)}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          iconBg="bg-emerald-500/15"
          iconColor="text-emerald-400"
        />
        <StatCard
          label="WO AKTIF"
          value={String(activeCount)}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>}
          iconBg="bg-cyan-500/15"
          iconColor="text-cyan-400"
        />
        <StatCard
          label="WO TERLAMBAT"
          value={String(overdueCount)}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>}
          iconBg="bg-amber-500/15"
          iconColor="text-amber-400"
          valueColor={overdueCount > 0 ? 'text-red-400' : undefined}
        />
      </div>

      {/* Peringatan Deadline */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">Peringatan Deadline</h2>
          {overdueOrders.length > 0 && (
            <span className="text-xs bg-teal-500/15 text-teal-400 px-3 py-1.5 rounded-full font-medium border border-teal-500/20">
              {overdueOrders.length} Perlu Perhatian
            </span>
          )}
        </div>
        {overdueOrders.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 grid place-items-center mx-auto mb-3">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <p className="text-sm text-slate-500">Semua order berjalan sesuai jadwal</p>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {overdueOrders.map(order => {
              const daysLate = order.daysLeft != null && order.daysLeft < 0 ? Math.abs(order.daysLeft) : null;
              return (
                <div key={order.rowIndex} className="min-w-[260px] rounded-lg border-2 border-red-500/25 bg-red-500/[0.04] p-4 shrink-0">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-red-400 uppercase">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                      TERLAMBAT
                    </span>
                    {daysLate && (
                      <span className="text-[11px] text-orange-400 font-medium">Terlambat {daysLate} hari</span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-white">{order.noWorkOrder || `WO-${order.no}`}</p>
                  <p className="text-xs text-slate-400 mt-1.5">
                    {order.paket1} {order.paket2} &middot; {formatDate(order.tglSelesai || order.dlCust)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Work Order Terbaru */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="p-6 pb-4">
          <h2 className="text-base font-bold text-white">Work Order Terbaru</h2>
        </div>
        {recentOrders.length === 0 ? (
          <div className="px-6 pb-8 text-center text-sm text-slate-500">Belum ada data work order</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-y border-white/[0.06]">
                    <th className="text-[11px] text-slate-500 font-medium text-left px-6 py-3 uppercase tracking-wider">NO WO</th>
                    <th className="text-[11px] text-slate-500 font-medium text-left px-6 py-3 uppercase tracking-wider">CUSTOMER</th>
                    <th className="text-[11px] text-slate-500 font-medium text-left px-6 py-3 uppercase tracking-wider">PAKET</th>
                    <th className="text-[11px] text-slate-500 font-medium text-left px-6 py-3 uppercase tracking-wider">DEADLINE</th>
                    <th className="text-[11px] text-slate-500 font-medium text-left px-6 py-3 uppercase tracking-wider">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map(order => {
                    const statusLabel = getStatusLabel(order);
                    const statusStyle = getStatusStyle(order);
                    return (
                      <tr key={order.rowIndex} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <span className="text-sm text-blue-400 font-medium">{order.noWorkOrder || `WO-${order.no}`}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-300">{order.customer}</td>
                        <td className="px-6 py-4 text-sm text-slate-400">{order.paket1} {order.paket2}</td>
                        <td className="px-6 py-4 text-sm text-slate-400">{formatDate(order.tglSelesai || order.dlCust)}</td>
                        <td className="px-6 py-4">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${statusStyle}`}>{statusLabel}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 text-right border-t border-white/[0.04]">
              <Link href="/orders" className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors">
                Lihat Semua Work Order &rarr;
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ── */

function getStatusLabel(order: Order): string {
  if (order.riskLevel === 'OVERDUE') return 'Terlambat';
  if (order.status === 'DONE') return 'Selesai';
  if (order.status === 'IN_PROGRESS') return 'Proses Produksi';
  return 'Baru';
}

function getStatusStyle(order: Order): string {
  if (order.riskLevel === 'OVERDUE') return 'text-red-400 border-red-500/30 bg-red-500/10';
  if (order.status === 'DONE') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  if (order.status === 'IN_PROGRESS') return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
  return 'text-slate-400 border-white/10 bg-white/[0.04]';
}

/* ── Components ── */

function StatCard({ label, value, icon, iconBg, iconColor, valueColor }: {
  label: string; value: string; icon: React.ReactNode;
  iconBg: string; iconColor: string; valueColor?: string;
}) {
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-full ${iconBg} flex items-center justify-center shrink-0 ${iconColor}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 font-medium tracking-wider uppercase">{label}</p>
        <p className={`text-xl font-bold mt-0.5 ${valueColor || 'text-white'}`}>{value}</p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-14 rounded-lg bg-white/[0.03] animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-[88px] rounded-xl bg-white/[0.03] animate-pulse" />)}
      </div>
      <div className="h-40 rounded-xl bg-white/[0.03] animate-pulse" />
      <div className="h-64 rounded-xl bg-white/[0.03] animate-pulse" />
    </div>
  );
}
