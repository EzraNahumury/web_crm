'use client';
import { useCallback, useEffect, useState } from 'react';
import { classifyLayanan } from '@/lib/business-days';

type OrderRow = {
  no_order: string;
  cust: string;
  qty: number;
  paket: string;
  bonus: string;
  ket: string;
  deadline_lock: string;
  pilihan_paket: string;
  stts: string;
};
type Group = { date: string; orders: OrderRow[] };
type ApiData = { month: string; monthName: string; groups: Group[] };

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function fmtDateShort(iso: string) {
  if (!iso) return '-';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][Number(m[2]) - 1];
  return `${Number(m[3])} ${monthShort} ${m[1]}`;
}

// Header label shown above each per-date table. Example: "01/2026" for
// 1 Juli 2026 (month is already conveyed by the page-level banner).
function fmtDayYear(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[1]}` : iso;
}

export default function CrmDeadlineLockPage() {
  const [month, setMonth] = useState(currentYearMonth());
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/deadline-lock?month=${encodeURIComponent(month)}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal memuat data');
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

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-red-500/[0.14] via-orange-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-red-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500/25 to-red-500/5 border border-red-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">CRM Deadline Lock</h1>
              <p className="text-[13px] text-slate-300 mt-0.5 max-w-2xl">
                Deadline order per tanggal ACC proofing. Reguler <strong className="text-white">21 hari</strong> kerja · Express <strong className="text-white">N hari</strong> · Prioritas manual.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:block">Bulan</label>
            <MonthYearPicker value={month} onChange={setMonth} />
            <button
              onClick={() => setMonth(currentYearMonth())}
              className="text-xs font-medium text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-white/10 bg-[#111827] hover:bg-white/[0.04] transition-colors"
            >
              Bulan Ini
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">{error}</div>
      )}

      {/* Red banner header */}
      <div className="rounded-lg bg-red-600 text-white text-center py-2 font-bold tracking-wide">
        DEADLINE CUSTOMER {data?.monthName || '—'}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-72 bg-white/[0.03] rounded-xl animate-pulse" />)}
        </div>
      ) : data && data.groups.length === 0 ? (
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] py-16 text-center">
          <p className="text-sm text-slate-500">
            Belum ada order dengan tanggal ACC proofing di bulan ini.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data?.groups.map(group => (
            <BoardTable key={group.date} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

function BoardTable({ group }: { group: Group }) {
  const totalQty = group.orders.reduce((s, o) => s + (Number(o.qty) || 0), 0);
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      {/* Date label */}
      <div className="px-4 py-2 bg-white text-slate-800 border-b border-slate-200">
        <p className="text-sm font-bold" title={fmtDateShort(group.date)}>{fmtDayYear(group.date)}</p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-cyan-500/90 text-white">
              <Th className="w-[7%] text-center">NO</Th>
              <Th className="w-[24%]">CUST</Th>
              <Th className="w-[7%] text-center">QTY</Th>
              <Th className="w-[16%]">PAKET</Th>
              <Th className="w-[18%]">BONUS</Th>
              <Th className="w-[8%]">KET</Th>
              <Th className="w-[10%] text-center">DL</Th>
              <Th className="w-[10%] text-center">STTS</Th>
            </tr>
          </thead>
          <tbody>
            {group.orders.map((o, i) => {
              // Same tint palette as Orders / CRM Finishing:
              // Prioritas = orange, Express = red, Reguler/others = default.
              const kind = classifyLayanan(o.pilihan_paket);
              const rowTint =
                kind === 'prioritas' ? 'bg-orange-500/[0.10] hover:bg-orange-500/[0.14]' :
                kind === 'express'   ? 'bg-red-500/[0.10] hover:bg-red-500/[0.14]' :
                'hover:bg-white/[0.02]';
              return (
              <tr key={o.no_order + i} className={`border-b border-white/[0.04] transition-colors ${rowTint}`}>
                <Td className="text-center text-slate-400">{i + 1}</Td>
                <Td className="text-white font-medium">{o.cust || '-'}</Td>
                <Td className="text-center text-white font-semibold tabular-nums">{o.qty || '-'}</Td>
                <Td className="text-slate-300 truncate max-w-[180px]" title={o.paket}>{o.paket}</Td>
                <Td className="text-slate-400 truncate max-w-[200px]" title={o.bonus}>{o.bonus || '-'}</Td>
                <Td className="text-slate-500 truncate max-w-[100px]" title={o.ket}>{o.ket || '-'}</Td>
                <Td className="text-center whitespace-nowrap font-semibold text-amber-400" title={o.pilihan_paket}>
                  {o.deadline_lock ? fmtDateShort(o.deadline_lock) : '-'}
                </Td>
                <Td className="text-center">
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                    {o.stts}
                  </span>
                </Td>
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white/[0.15] bg-white/[0.04]">
              <td className="px-2 py-2 text-right text-[11px] font-bold text-slate-300 uppercase tracking-wider" colSpan={2}>
                Total QTY
              </td>
              <td className="px-2 py-2 text-center text-sm font-bold text-white tabular-nums">
                {totalQty}
              </td>
              <td className="px-2 py-2" colSpan={5}>&nbsp;</td>
            </tr>
          </tfoot>
        </table>
      </div>
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
  return (
    <td className={`px-2 py-2 ${className}`} title={title}>{children}</td>
  );
}
