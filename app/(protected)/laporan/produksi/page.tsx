'use client';
import { useState, useEffect, useMemo } from 'react';
import { dbGet } from '@/lib/api-db';
import { isVisibleTanggalOrder } from '@/lib/data-cutoff';
import DateRangePicker, { today, formatPeriod } from '../date-range-picker';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export default function LaporanProduksiPage() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [stages, setStages] = useState<Row[]>([]);
  const [progress, setProgress] = useState<Row[]>([]);
  const [wos, setWos] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [orders, setOrders] = useState<Row[]>([]);

  async function fetchData() {
    try {
      const [s, p, w, o] = await Promise.all([
        dbGet('production_stages'),
        dbGet('wo_progress'),
        dbGet('work_orders'),
        dbGet('orders').catch(() => []),
      ]);
      setStages(s.sort((a: Row, b: Row) => (a.urutan || 0) - (b.urutan || 0)));
      setProgress(p);
      setWos(w);
      setOrders(o);
    } catch {}
    setLoading(false);
  }

  // Fetch on mount, on date change, and on window focus
  useEffect(() => { fetchData(); }, [from, to]);
  useEffect(() => {
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const periode = formatPeriod(from, to);

  // TAHAP_PRODUKSI dinamis dari DB — filter stages active + sort by urutan.
  const TAHAP_PRODUKSI = useMemo(() => {
    return stages
      .filter((s: Row) => s.active === undefined || s.active === 1 || s.active === true)
      .sort((a: Row, b: Row) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0))
      .map((s: Row) => String(s.nama || ''))
      .filter(Boolean);
  }, [stages]);

  // Apply cutoff filter (HIDE_ORDERS_BEFORE = 2026-07-13) — SAMA dengan
  // menu Produksi. Order dengan tanggal_order sebelum cutoff hidden.
  // WO tanpa order match tetap tampil (fallback aman).
  const ordersById = useMemo(() => {
    const m: Record<number, Row> = {};
    for (const o of orders) m[Number(o.id)] = o;
    return m;
  }, [orders]);
  const visibleWos = useMemo(() => {
    return wos.filter((w: Row) => {
      const ord = ordersById[Number(w.order_id)];
      return isVisibleTanggalOrder(ord?.tanggal_order);
    });
  }, [wos, ordersById]);
  const visibleWoIds = useMemo(() => new Set(visibleWos.map((w: Row) => Number(w.id))), [visibleWos]);
  const visibleProgress = useMemo(
    () => progress.filter((p: Row) => visibleWoIds.has(Number(p.work_order_id))),
    [progress, visibleWoIds]
  );

  // Helper: get qty for a set of progress items — dari visibleWos only.
  function getQty(items: Row[]) {
    return items.reduce((sum, p) => {
      const wo = visibleWos.find((w: Row) => w.id === p.work_order_id);
      return sum + (wo?.jumlah || 0);
    }, 0);
  }

  // Filter by date range for SELESAI items
  function inRange(dateStr: string) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const f = new Date(from); f.setHours(0,0,0,0);
    const t = new Date(to); t.setHours(23,59,59,999);
    return d >= f && d <= t;
  }

  // Build stats per stage — SAMAKAN definisi dengan menu Produksi:
  //   Aktif/Total = TERSEDIA + SEDANG at THIS stage (WO yg SEKARANG
  //     ada di stage ini — match badge counter tab menu Produksi).
  //   Sedang Proses = SEDANG only (in-flight, sudah di-klik operator).
  //   Selesai (Periode) = SELESAI at THIS stage dengan completed_at
  //     di range periode (historic count).
  const stageStats = TAHAP_PRODUKSI.map(nama => {
    const stageRow = stages.find((s: Row) => s.nama === nama);
    const stageId = stageRow?.id;
    // Selesai historic — SELESAI at THIS stage completed dalam periode.
    const selesaiItems = visibleProgress.filter((p: Row) => {
      if (p.stage_id !== stageId || p.status !== 'SELESAI') return false;
      return inRange(p.completed_at);
    });
    // Sedang aktif — SEDANG at THIS stage (operator klik "Mulai" tapi
    // belum SELESAI).
    const sedangItems = visibleProgress.filter((p: Row) =>
      p.stage_id === stageId && p.status === 'SEDANG'
    );
    // Aktif di stage sekarang — TERSEDIA + SEDANG (match badge menu
    // Produksi). Ini yang jadi "Total (Aktif)".
    const aktifItems = visibleProgress.filter((p: Row) =>
      p.stage_id === stageId && (p.status === 'TERSEDIA' || p.status === 'SEDANG')
    );
    return {
      nama,
      selesaiWo: selesaiItems.length, selesaiPcs: getQty(selesaiItems),
      sedangWo: sedangItems.length, sedangPcs: getQty(sedangItems),
      totalWo: aktifItems.length, totalPcs: getQty(aktifItems),
    };
  });

  const totalSelesaiWo = stageStats.reduce((s, r) => s + r.selesaiWo, 0);
  const totalSelesaiPcs = stageStats.reduce((s, r) => s + r.selesaiPcs, 0);
  const totalSedangWo = stageStats.reduce((s, r) => s + r.sedangWo, 0);
  const totalSedangPcs = stageStats.reduce((s, r) => s + r.sedangPcs, 0);
  const grandWo = stageStats.reduce((s, r) => s + r.totalWo, 0);
  const grandPcs = stageStats.reduce((s, r) => s + r.totalPcs, 0);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-10 bg-white/[0.03] rounded-lg animate-pulse" />
      {[1,2,3].map(i => <div key={i} className="h-24 bg-white/[0.03] rounded-xl animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-violet-500/[0.14] via-indigo-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/25 to-violet-500/5 border border-violet-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Laporan Produksi</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Statistik pergerakan produksi per tahap · <span className="text-white font-medium">{periode}</span>
              </p>
            </div>
          </div>
          <DateRangePicker from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          iconBg="bg-emerald-500/15" iconColor="text-emerald-400"
          label="Total Selesai (Periode)" wo={totalSelesaiWo} pcs={totalSelesaiPcs}
        />
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          iconBg="bg-amber-500/15" iconColor="text-amber-400"
          label="Total Sedang Proses" wo={totalSedangWo} pcs={totalSedangPcs}
        />
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>}
          iconBg="bg-blue-500/15" iconColor="text-blue-400"
          label="Grand Total (Aktif)" wo={grandWo} pcs={grandPcs}
        />
      </div>

      {/* Rincian Per Tahap */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-bold text-white">Rincian Per Tahap</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-[11px] text-slate-500 font-medium text-left px-6 py-3.5 uppercase tracking-wider">TAHAP PRODUKSI</th>
                <th className="text-[11px] text-slate-500 font-medium text-center px-6 py-3.5 uppercase tracking-wider">SELESAI (PERIODE)</th>
                <th className="text-[11px] text-slate-500 font-medium text-center px-6 py-3.5 uppercase tracking-wider">SEDANG PROSES</th>
                <th className="text-[11px] text-slate-500 font-medium text-right px-6 py-3.5 uppercase tracking-wider">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {stageStats.map(row => (
                <tr key={row.nama} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-white">{row.nama}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-sm ${row.selesaiWo > 0 ? 'text-emerald-400 font-medium' : 'text-slate-400'}`}>{row.selesaiWo} WO</span>
                    <span className="block text-xs text-slate-600">({row.selesaiPcs} pcs)</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-sm ${row.sedangWo > 0 ? 'text-amber-400 font-medium' : 'text-slate-400'}`}>{row.sedangWo} WO</span>
                    <span className="block text-xs text-slate-600">({row.sedangPcs} pcs)</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`text-sm font-bold ${row.totalWo > 0 ? 'text-white' : 'text-slate-500'}`}>{row.totalWo} WO</span>
                    <span className="block text-xs text-slate-600">({row.totalPcs} pcs)</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, iconBg, iconColor, label, wo, pcs }: {
  icon: React.ReactNode; iconBg: string; iconColor: string;
  label: string; wo: number; pcs: number;
}) {
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${iconBg} grid place-items-center ${iconColor} shrink-0`}>{icon}</div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-white">{wo}</span>
            <span className="text-xs text-slate-500">WO</span>
            <span className="text-xs text-slate-600 mx-1">&middot;</span>
            <span className="text-sm font-medium text-slate-400">{pcs}</span>
            <span className="text-xs text-slate-500">pcs</span>
          </div>
        </div>
      </div>
    </div>
  );
}
