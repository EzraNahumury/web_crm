'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/lib/toast';

type Row = {
  finishing_id: number;
  order_id: number;
  no_order: string;
  cust: string;
  tim: string;
  qty: number;
  paket: string;
  bonus: string;
  keterangan: string;
  pilihan_paket: string;
  completed_at: string;
};
type ApiData = { month: string; rows: Row[] };

const MONTH_NAMES_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDateTime(iso: string) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export default function CrmFinishingHistoryPage() {
  const [month, setMonth] = useState(currentYearMonth());
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const toast = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/finishing/history?month=${encodeURIComponent(month)}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setData(json.data);
      setError('');
    } catch (e) {
      setError(String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const rows = data?.rows || [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.cust.toLowerCase().includes(q)
      || r.tim.toLowerCase().includes(q)
      || r.paket.toLowerCase().includes(q)
      || r.no_order.toLowerCase().includes(q)
    );
  }, [data, search]);

  const totalQty = filtered.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  async function undoCheck(orderId: number, cust: string) {
    setBusyId(orderId);
    try {
      const res = await fetch('/api/crm/finishing/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, completed: false }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Dikembalikan', `${cust} kembali ke Papan Finishing.`);
      await fetchData();
    } catch (e) {
      toast.error('Gagal', String(e));
    } finally {
      setBusyId(null);
    }
  }

  const [yearStr, monthStr] = month.split('-');
  const monthLabel = `${MONTH_NAMES_ID[Number(monthStr) - 1] || ''} ${yearStr}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">History Finishing</h1>
          <p className="text-sm text-slate-400 mt-1">
            Order yang sudah di-checklist selesai dari Papan Finishing.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs text-slate-500 uppercase tracking-wider">Bulan</label>
          <MonthYearPicker value={month} onChange={setMonth} />
          <button
            onClick={() => setMonth(currentYearMonth())}
            className="text-xs text-slate-400 hover:text-white px-3 py-2 rounded-lg border border-white/10 hover:bg-white/[0.04] transition-colors"
          >
            Bulan Ini
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">{error}</div>
      )}

      <div className="rounded-lg bg-emerald-600 text-white text-center py-2 font-bold tracking-wide">
        HISTORY FINISHING — {monthLabel.toUpperCase()}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari customer, tim, paket..."
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm placeholder-slate-500 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-blue-500/40"
          />
        </div>
        <div className="text-xs text-slate-400 shrink-0">
          {filtered.length} order · Total <strong className="text-white">{totalQty}</strong> qty
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] py-16 text-center">
          <p className="text-sm text-slate-500">Memuat...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] py-16 text-center">
          <p className="text-sm text-slate-500">
            {search ? 'Tidak ada hasil pencarian.' : 'Belum ada order yang di-finishing bulan ini.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-emerald-500/80 text-white">
                  <Th className="w-[4%] text-center">NO</Th>
                  <Th className="w-[20%]">CUST</Th>
                  <Th className="w-[6%] text-center">QTY</Th>
                  <Th className="w-[16%]">PAKET</Th>
                  <Th className="w-[14%]">BONUS</Th>
                  <Th className="w-[16%]">KETERANGAN</Th>
                  <Th className="w-[16%] text-center">SELESAI PADA</Th>
                  <Th className="w-[8%] text-center">AKSI</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.finishing_id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <Td className="text-center text-slate-400">{i + 1}</Td>
                    <Td>
                      <div className="text-white font-medium truncate max-w-[220px]" title={r.cust}>{r.cust || '-'}</div>
                      {r.tim && r.tim !== r.cust && (
                        <div className="text-[10px] text-slate-500 truncate max-w-[220px]" title={r.tim}>{r.tim}</div>
                      )}
                      {r.no_order && (
                        <div className="text-[9px] text-slate-600 font-mono">{r.no_order}</div>
                      )}
                    </Td>
                    <Td className="text-center text-white font-semibold tabular-nums">{r.qty || '-'}</Td>
                    <Td className="text-slate-300 truncate max-w-[180px]" title={r.paket}>{r.paket}</Td>
                    <Td className="text-slate-400 truncate max-w-[180px]" title={r.bonus}>{r.bonus || '-'}</Td>
                    <Td className="text-slate-400 truncate max-w-[180px]" title={r.keterangan}>{r.keterangan || '-'}</Td>
                    <Td className="text-center text-slate-300 whitespace-nowrap">{fmtDateTime(r.completed_at)}</Td>
                    <Td className="text-center">
                      <button
                        onClick={() => undoCheck(r.order_id, r.cust || r.tim || 'order')}
                        disabled={busyId === r.order_id}
                        title="Kembalikan ke Papan Finishing"
                        className="text-[10px] text-amber-400 border border-amber-500/30 bg-amber-500/10 px-2 py-1 rounded hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-wait transition-colors"
                      >
                        Undo
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-white/[0.15] bg-white/[0.04]">
                  <td className="px-3 py-2 text-right text-[11px] font-bold text-slate-300 uppercase tracking-wider" colSpan={2}>
                    Total QTY
                  </td>
                  <td className="px-3 py-2 text-center text-sm font-bold text-white tabular-nums">{totalQty}</td>
                  <td colSpan={5}>&nbsp;</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MonthYearPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [year, monthNum] = value.split('-');
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const selectCls = 'bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer';
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={monthNum}
        onChange={e => onChange(`${year}-${e.target.value}`)}
        className={selectCls}
      >
        {MONTH_NAMES_ID.map((name, i) => {
          const num = String(i + 1).padStart(2, '0');
          return <option key={num} value={num}>{name}</option>;
        })}
      </select>
      <select
        value={year}
        onChange={e => onChange(`${e.target.value}-${monthNum}`)}
        className={selectCls}
      >
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-[10px] font-bold uppercase tracking-wider px-2 py-2 ${className}`}>{children}</th>
  );
}
function Td({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td className={`px-2 py-2 ${className}`} title={title}>{children}</td>;
}
