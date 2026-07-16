'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { apiGetDashboardForce, apiGetOrdersForce } from '@/lib/api';
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
      router.replace(user.role === 'cs' ? '/orders' : '/produksi');
      return;
    }
    fetchData();
  }, [user]);

  async function fetchData() {
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
  const doneCount = stats?.doneOrders ?? 0;
  const totalOrders = stats?.totalOrders ?? 0;
  const completionRate = totalOrders > 0 ? Math.round((doneCount / totalOrders) * 100) : 0;
  const now = new Date();
  const greeting = now.getHours() < 11 ? 'Selamat pagi' : now.getHours() < 15 ? 'Selamat siang' : now.getHours() < 18 ? 'Selamat sore' : 'Selamat malam';
  const displayName = user?.nama || user?.username || 'Admin';

  if (loading) return <DashboardSkeleton />;

  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 grid place-items-center mb-4">
        <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">Gagal Memuat Data</h3>
      <p className="text-sm text-slate-500 mb-4 max-w-sm">{error}</p>
      <button onClick={() => { setLoading(true); fetchData(); }} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors">Coba Lagi</button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Hero header — gradient + greeting + quick actions.
          Grid decorative background diberi opacity rendah supaya
          nuansanya premium tanpa mengganggu keterbacaan. */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-blue-600/[0.18] via-indigo-600/[0.10] to-transparent p-6 sm:p-8">
        <div
          aria-hidden
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 20%, rgba(59,130,246,0.25) 0%, transparent 45%),
                              radial-gradient(circle at 85% 80%, rgba(16,185,129,0.15) 0%, transparent 40%)`,
          }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-blue-300/80 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Dashboard AYRES
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {greeting}, {displayName} 👋
            </h1>
            <p className="text-sm text-slate-300/80 mt-1.5 max-w-xl">
              Ringkasan bisnis Anda hari ini. Ada <strong className="text-white">{pendingCount}</strong> order pending
              dan <strong className={overdueCount > 0 ? 'text-red-300' : 'text-white'}>{overdueCount}</strong> WO terlambat.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/orders?create=1"
              className="group inline-flex items-center gap-2 bg-white/[0.06] hover:bg-white text-white hover:text-slate-900 border border-white/10 hover:border-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/10">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Order Baru
            </Link>
            <Link href="/master"
              className="inline-flex items-center gap-2 border border-white/10 hover:bg-white/[0.06] text-slate-300 hover:text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg>
              Master
            </Link>
          </div>
        </div>
      </div>

      {/* Stat cards — glass panel dengan gradient aksen per card.
          Dua row: satu Revenue lebar penuh, sisanya 4 kolom. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <RevenueCard
          value={`Rp ${(stats?.totalRevenue ?? 0).toLocaleString('id-ID')}`}
          orders={totalOrders}
          done={doneCount}
          completionRate={completionRate}
        />
        <div className="lg:col-span-3 grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Customer Orders"
            value={String(totalOrders)}
            trend="Total"
            accent="blue"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
            }
          />
          <StatCard
            label="Pending Orders"
            value={String(pendingCount)}
            trend="Menunggu"
            accent="amber"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="WO Aktif"
            value={String(activeCount)}
            trend="Produksi"
            accent="cyan"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122" />
              </svg>
            }
          />
          <StatCard
            label="WO Terlambat"
            value={String(overdueCount)}
            trend={overdueCount > 0 ? 'Perlu tindakan' : 'On track'}
            accent={overdueCount > 0 ? 'red' : 'emerald'}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            }
          />
        </div>
      </div>

      {/* Peringatan Deadline — glass panel dengan strip merah tipis di kiri
          untuk menekankan urgensi tanpa harus mewarnai seluruh card. */}
      <div className="relative rounded-2xl bg-[#111827]/70 backdrop-blur border border-white/[0.06] p-6 overflow-hidden">
        {overdueOrders.length > 0 && (
          <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-red-500/80 via-red-500/40 to-transparent" />
        )}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500/25 to-red-500/5 border border-red-500/20 grid place-items-center">
              <svg className="w-4.5 h-4.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Peringatan Deadline</h2>
              <p className="text-xs text-slate-500 mt-0.5">Order yang mendekati atau melewati deadline</p>
            </div>
          </div>
          {overdueOrders.length > 0 && (
            <span className="text-xs bg-red-500/10 text-red-300 px-3 py-1.5 rounded-full font-semibold border border-red-500/20 whitespace-nowrap">
              {overdueOrders.length} perlu perhatian
            </span>
          )}
        </div>
        {overdueOrders.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 grid place-items-center mx-auto mb-3">
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <p className="text-sm font-medium text-slate-300">Semua order berjalan sesuai jadwal</p>
            <p className="text-xs text-slate-500 mt-1">Tidak ada deadline yang mendesak saat ini</p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
            {overdueOrders.map(order => {
              const daysLate = order.daysLeft != null && order.daysLeft < 0 ? Math.abs(order.daysLeft) : null;
              const isHigh = order.riskLevel === 'HIGH';
              return (
                <div
                  key={order.rowIndex}
                  className={`snap-start min-w-[280px] rounded-xl border p-4 shrink-0 transition-transform hover:scale-[1.02] hover:shadow-xl ${
                    isHigh
                      ? 'border-amber-500/25 bg-gradient-to-br from-amber-500/[0.08] to-transparent'
                      : 'border-red-500/25 bg-gradient-to-br from-red-500/[0.08] to-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                      isHigh ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25' : 'bg-red-500/15 text-red-300 border border-red-500/25'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isHigh ? 'bg-amber-400' : 'bg-red-400'}`} />
                      {isHigh ? 'Mendesak' : 'Terlambat'}
                    </span>
                    {daysLate != null && (
                      <span className="text-[11px] text-red-300 font-semibold">-{daysLate} hari</span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-white truncate">{order.customer || 'Customer'}</p>
                  <p className="text-xs text-slate-400 mt-1 truncate">
                    {order.noWorkOrder || `WO-${order.no}`} · {order.paket1}
                  </p>
                  <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Deadline</span>
                    <span className="text-xs text-white font-medium">{formatDate(order.tglSelesai || order.dlCust)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Work Order Terbaru — table modern dengan avatar bulat untuk WO */}
      <div className="rounded-2xl bg-[#111827]/70 backdrop-blur border border-white/[0.06] overflow-hidden">
        <div className="flex items-center justify-between p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/25 to-blue-500/5 border border-blue-500/20 grid place-items-center">
              <svg className="w-4.5 h-4.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Work Order Terbaru</h2>
              <p className="text-xs text-slate-500 mt-0.5">5 order paling baru masuk ke produksi</p>
            </div>
          </div>
          <Link href="/work-orders" className="hidden sm:inline-flex text-xs font-medium text-blue-300 hover:text-blue-200 items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">
            Lihat Semua
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <div className="px-6 pb-8 text-center text-sm text-slate-500">Belum ada data work order</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-y border-white/[0.06] bg-white/[0.015]">
                    <th className="text-[10px] text-slate-500 font-semibold text-left px-6 py-3 uppercase tracking-wider">No WO</th>
                    <th className="text-[10px] text-slate-500 font-semibold text-left px-6 py-3 uppercase tracking-wider">Customer</th>
                    <th className="text-[10px] text-slate-500 font-semibold text-left px-6 py-3 uppercase tracking-wider">Paket</th>
                    <th className="text-[10px] text-slate-500 font-semibold text-left px-6 py-3 uppercase tracking-wider">Deadline</th>
                    <th className="text-[10px] text-slate-500 font-semibold text-left px-6 py-3 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map(order => {
                    const statusLabel = getStatusLabel(order);
                    const statusStyle = getStatusStyle(order);
                    const initial = (order.customer || 'W').trim().charAt(0).toUpperCase();
                    return (
                      <tr key={order.rowIndex} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/25 to-blue-500/5 border border-blue-500/20 grid place-items-center text-[11px] font-bold text-blue-300 shrink-0">
                              {initial}
                            </div>
                            <span className="text-sm text-blue-300 font-semibold group-hover:text-blue-200 transition-colors">
                              {order.noWorkOrder || `WO-${order.no}`}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-200 font-medium">{order.customer || '-'}</td>
                        <td className="px-6 py-4 text-sm text-slate-400 truncate max-w-[200px]" title={`${order.paket1} ${order.paket2}`}>
                          {order.paket1} {order.paket2}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-300 tabular-nums">{formatDate(order.tglSelesai || order.dlCust)}</td>
                        <td className="px-6 py-4">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusStyle}`}>{statusLabel}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="sm:hidden px-6 py-4 border-t border-white/[0.04]">
              <Link href="/work-orders" className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors">
                Lihat Semua Work Order →
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
  if (order.status === 'IN_PROGRESS') return 'Proses';
  return 'Baru';
}

function getStatusStyle(order: Order): string {
  if (order.riskLevel === 'OVERDUE') return 'text-red-300 border-red-500/30 bg-red-500/10';
  if (order.status === 'DONE') return 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
  if (order.status === 'IN_PROGRESS') return 'text-blue-300 border-blue-500/30 bg-blue-500/10';
  return 'text-slate-300 border-white/10 bg-white/[0.04]';
}

/* ── Components ── */

// Revenue card — versi lebar penuh dengan mini progress bar completion.
function RevenueCard({ value, orders, done, completionRate }: {
  value: string; orders: number; done: number; completionRate: number;
}) {
  return (
    <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.12] via-emerald-500/[0.04] to-transparent p-5">
      <div
        aria-hidden
        className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none"
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 grid place-items-center">
              <svg className="w-4.5 h-4.5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-[11px] font-semibold text-emerald-300/80 uppercase tracking-wider">Total Pendapatan</span>
          </div>
          <span className="text-[10px] font-medium text-emerald-300/60 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            {orders} orders
          </span>
        </div>
        <p className="text-2xl sm:text-3xl font-bold text-white tabular-nums leading-tight">{value}</p>
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-slate-400">Selesai: <strong className="text-emerald-300">{done}</strong> / {orders}</span>
            <span className="text-emerald-300 font-semibold">{completionRate}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const STAT_ACCENT: Record<string, { border: string; glow: string; iconBg: string; iconText: string; trendText: string }> = {
  blue:    { border: 'border-blue-500/20',    glow: 'bg-blue-500/10',    iconBg: 'bg-blue-500/15 border-blue-500/25',       iconText: 'text-blue-300',    trendText: 'text-blue-300/70' },
  amber:   { border: 'border-amber-500/20',   glow: 'bg-amber-500/10',   iconBg: 'bg-amber-500/15 border-amber-500/25',     iconText: 'text-amber-300',   trendText: 'text-amber-300/70' },
  cyan:    { border: 'border-cyan-500/20',    glow: 'bg-cyan-500/10',    iconBg: 'bg-cyan-500/15 border-cyan-500/25',       iconText: 'text-cyan-300',    trendText: 'text-cyan-300/70' },
  red:     { border: 'border-red-500/20',     glow: 'bg-red-500/10',     iconBg: 'bg-red-500/15 border-red-500/25',         iconText: 'text-red-300',     trendText: 'text-red-300/70' },
  emerald: { border: 'border-emerald-500/20', glow: 'bg-emerald-500/10', iconBg: 'bg-emerald-500/15 border-emerald-500/25', iconText: 'text-emerald-300', trendText: 'text-emerald-300/70' },
};

function StatCard({ label, value, trend, icon, accent }: {
  label: string; value: string; trend: string; icon: React.ReactNode;
  accent: keyof typeof STAT_ACCENT;
}) {
  const a = STAT_ACCENT[accent];
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${a.border} bg-[#111827]/60 backdrop-blur p-4 transition-all hover:border-white/20`}>
      <div aria-hidden className={`absolute -top-8 -right-8 w-24 h-24 rounded-full ${a.glow} blur-2xl pointer-events-none`} />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-9 h-9 rounded-xl ${a.iconBg} border grid place-items-center ${a.iconText}`}>
            {icon}
          </div>
          <span className={`text-[10px] font-medium ${a.trendText} uppercase tracking-wider`}>{trend}</span>
        </div>
        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-white tabular-nums mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-32 rounded-2xl bg-gradient-to-br from-white/[0.04] to-transparent animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 h-40 rounded-2xl bg-white/[0.03] animate-pulse" />
        <div className="lg:col-span-3 grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-[110px] rounded-2xl bg-white/[0.03] animate-pulse" />)}
        </div>
      </div>
      <div className="h-52 rounded-2xl bg-white/[0.03] animate-pulse" />
      <div className="h-72 rounded-2xl bg-white/[0.03] animate-pulse" />
    </div>
  );
}
