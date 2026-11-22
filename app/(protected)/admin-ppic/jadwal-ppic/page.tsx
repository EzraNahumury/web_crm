'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import DateRangePicker, { today, daysAgo, shiftDate, formatPeriod } from '../../laporan/date-range-picker';

type ProcCell = { tgl: string; done: boolean; late: boolean; na: boolean };
type JadwalRow = {
  woId: number; orderId: number; noWo: string; noOrder: string;
  customer: string; paket: string; qty: number; deadline: string;
  proc: Record<string, ProcCell>;
};
type Batch = { deadline: string; rows: JadwalRow[]; totalQty: number };
type StageDef = { key: string; label: string };

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function parseISO(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
// "5 Nov" — tanggal pendek untuk sel proses.
function fmtShort(iso: string): string {
  const d = parseISO(iso);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]}`;
}
// "Rabu, 5 November 2026" — judul batch.
function fmtLong(iso: string): string {
  const d = parseISO(iso);
  if (!d) return iso;
  const MFULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${DAYS_ID[d.getDay()]}, ${d.getDate()} ${MFULL[d.getMonth()]} ${d.getFullYear()}`;
}

export default function JadwalPpicPage() {
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(shiftDate(today(), 21));
  const [batches, setBatches] = useState<Batch[]>([]);
  const [stages, setStages] = useState<StageDef[]>([]);
  const [totalWo, setTotalWo] = useState(0);
  const [totalQty, setTotalQty] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await fetch(`/api/admin-ppic/jadwal?${qs.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal memuat data');
      setBatches(json.batches || []);
      setStages(json.stages || []);
      setTotalWo(Number(json.totalWo) || 0);
      setTotalQty(Number(json.totalQty) || 0);
      setError('');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

  const periode = formatPeriod(from, to);
  // Jumlah WO yang punya proses terlambat (indikator ringkas).
  const lateCount = useMemo(() => {
    let n = 0;
    for (const b of batches) for (const r of b.rows) {
      if (Object.values(r.proc).some(c => c.late)) n++;
    }
    return n;
  }, [batches]);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-24 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-96 bg-white/[0.03] rounded-xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-indigo-500/[0.14] via-blue-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500/25 to-indigo-500/5 border border-indigo-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Jadwal PPIC</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Production Schedule — alur proses produksi per customer · <span className="text-white font-medium">{periode}</span>
              </p>
            </div>
          </div>
          <DateRangePicker from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        </div>
        <p className="relative mt-2 text-[11px] text-slate-400/80">
          Dikelompokkan per tanggal <strong className="text-slate-200">DEADLINE</strong>. Nama customer, qty &amp; paket otomatis dari CS Order; TGL
          &amp; checklist tiap proses otomatis dari Laporan Progress Produksi. Tanda{' '}
          <span className="text-amber-300 font-medium">⏰</span> = proses terlambat vs target SLA tahap. Qty sudah mengecualikan aksesoris.
        </p>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total WO" value={totalWo.toLocaleString('id-ID')} color="text-white" />
        <Stat label="Total Qty (pcs)" value={totalQty.toLocaleString('id-ID')} color="text-emerald-400" />
        <Stat label="Jumlah Batch" value={batches.length.toLocaleString('id-ID')} color="text-indigo-300" />
        <Stat label="WO Ada Terlambat" value={lateCount.toLocaleString('id-ID')} color={lateCount > 0 ? 'text-amber-400' : 'text-slate-300'} />
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">{error}</div>
      )}

      {batches.length === 0 && !error ? (
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] py-16 text-center">
          <svg className="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <p className="text-sm text-slate-500">Tidak ada WO dengan deadline di rentang ini. Ubah rentang tanggal di atas.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {batches.map((batch, bi) => (
            <BatchTable key={batch.deadline} batch={batch} stages={stages} index={bi + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function BatchTable({ batch, stages, index }: { batch: Batch; stages: StageDef[]; index: number }) {
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      {/* Batch header */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-indigo-600/25 to-transparent border-b border-white/[0.08] flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-200 bg-indigo-500/20 border border-indigo-400/30 rounded-md px-2 py-1">
            Batch {index}
          </span>
          <span className="text-sm font-semibold text-white">Deadline: {fmtLong(batch.deadline)}</span>
        </div>
        <span className="text-xs text-slate-300">
          {batch.rows.length} WO · <span className="text-emerald-300 font-semibold">{batch.totalQty.toLocaleString('id-ID')} pcs</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 980 }}>
          <thead>
            <tr className="border-b border-white/[0.08]">
              <ThFixed rowSpan={2} className="w-10 text-center">NO</ThFixed>
              <ThFixed rowSpan={2} className="text-left min-w-[180px]">NAMA CUSTOMER</ThFixed>
              <ThFixed rowSpan={2} className="w-16 text-right">QTY</ThFixed>
              <ThFixed rowSpan={2} className="text-left min-w-[120px]">PAKET</ThFixed>
              {stages.map(s => (
                <th key={s.key} colSpan={2}
                  className="text-[10px] text-slate-300 font-semibold px-2 py-2 uppercase tracking-wider text-center border-l border-white/[0.08] bg-white/[0.02]">
                  {s.label}
                </th>
              ))}
            </tr>
            <tr className="border-b border-white/[0.08]">
              {stages.map(s => (
                <ThSub key={s.key} />
              ))}
            </tr>
          </thead>
          <tbody>
            {batch.rows.map((r, i) => (
              <tr key={r.woId} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <td className="px-2 py-2.5 text-center text-slate-500 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2.5 text-white font-medium">
                  {r.customer}
                  {r.noWo && <span className="block text-[10px] text-slate-500 font-normal">{r.noWo}</span>}
                </td>
                <td className="px-2 py-2.5 text-right text-emerald-400 font-semibold tabular-nums">{r.qty.toLocaleString('id-ID')}</td>
                <td className="px-3 py-2.5 text-slate-300">{r.paket || <span className="text-slate-600">—</span>}</td>
                {stages.map(s => {
                  const cell = r.proc[s.key] || { tgl: '', done: false, late: false, na: true };
                  return <ProcCellView key={s.key} cell={cell} />;
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-white/[0.03] font-semibold">
              <td className="px-2 py-2.5" />
              <td className="px-3 py-2.5 text-right text-xs text-slate-300 uppercase tracking-wider">Total Batch {index}</td>
              <td className="px-2 py-2.5 text-right text-emerald-400 tabular-nums">{batch.totalQty.toLocaleString('id-ID')}</td>
              <td className="px-3 py-2.5" />
              {stages.map(s => <td key={s.key} colSpan={2} className="border-l border-white/[0.06]" />)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ProcCellView({ cell }: { cell: ProcCell }) {
  if (cell.na) {
    return (
      <>
        <td className="px-1.5 py-2.5 text-center text-slate-700 border-l border-white/[0.06]">—</td>
        <td className="px-1.5 py-2.5 text-center text-slate-700">—</td>
      </>
    );
  }
  const tglColor = cell.late ? 'text-amber-300' : cell.done ? 'text-slate-200' : 'text-slate-400';
  return (
    <>
      <td className={`px-1.5 py-2.5 text-center text-[11px] tabular-nums border-l border-white/[0.06] ${tglColor}`}>
        {cell.tgl ? fmtShort(cell.tgl) : <span className="text-slate-700">·</span>}
      </td>
      <td className="px-1.5 py-2.5 text-center">
        <span className="inline-flex items-center justify-center gap-0.5">
          {cell.done ? (
            <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 20 20" fill="currentColor" aria-label="selesai">
              <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z" clipRule="evenodd" />
            </svg>
          ) : (
            <span className="w-3.5 h-3.5 rounded border border-white/20 inline-block" aria-label="belum" />
          )}
          {cell.late && (
            <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-label="terlambat">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3.5 2M12 22a9 9 0 100-18 9 9 0 000 18z" />
            </svg>
          )}
        </span>
      </td>
    </>
  );
}

function ThFixed({ children, className = '', rowSpan }: { children?: React.ReactNode; className?: string; rowSpan?: number }) {
  return (
    <th rowSpan={rowSpan}
      className={`text-[10px] text-slate-400 font-semibold px-3 py-2 uppercase tracking-wider align-middle bg-white/[0.02] ${className}`}>
      {children}
    </th>
  );
}
function ThSub() {
  return (
    <>
      <th className="text-[9px] text-slate-500 font-medium px-1.5 py-1.5 uppercase tracking-wider text-center border-l border-white/[0.08]">Tgl</th>
      <th className="text-[9px] text-slate-500 font-medium px-1.5 py-1.5 uppercase tracking-wider text-center">Status</th>
    </>
  );
}
