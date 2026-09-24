'use client';

// Analisa read-only untuk tiap Progress Produksi (Printing/Press/Cutting/
// Steam/Finishing/Shipment). Mirror gaya Analisa Line Jahit: tabel bulanan
// (target flat 340 poin/hari vs realisasi) + grafik target vs realisasi.
// TANPA form input / edit / delete.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet } from '@/lib/api-db';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BASE_RATE_POIN = 5000;
const TARGET_PER_DAY = 340; // flat, sama dgn halaman Progress

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtDayShort(iso: string): string {
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!m || !d) return iso;
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][m - 1]}`;
}
function fmtPoin(n: number): string {
  const v = Math.round((n || 0) * 10) / 10;
  return v.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

interface Paket { id: number; nama: string; kolom_prefix: string; urutan: number; rate_atasan: number; rate_celana: number; }
interface PRow { id: number; tanggal: string; customer: string; keterangan: string; data: Record<string, number>; }

const PAKET_PALETTE = [
  { tableHead: 'bg-yellow-100', tableSub: 'bg-yellow-50' },
  { tableHead: 'bg-blue-100', tableSub: 'bg-blue-50' },
  { tableHead: 'bg-pink-100', tableSub: 'bg-pink-50' },
  { tableHead: 'bg-emerald-100', tableSub: 'bg-emerald-50' },
  { tableHead: 'bg-orange-100', tableSub: 'bg-orange-50' },
  { tableHead: 'bg-violet-100', tableSub: 'bg-violet-50' },
];
function paketColor(urutan: number) { const idx = ((urutan || 1) - 1) % PAKET_PALETTE.length; return PAKET_PALETTE[idx < 0 ? 0 : idx]; }
function poinAtasan(p: Paket): number { return (Number(p.rate_atasan) || BASE_RATE_POIN) / BASE_RATE_POIN; }
function poinCelana(p: Paket): number { return (Number(p.rate_celana) || BASE_RATE_POIN) / BASE_RATE_POIN; }
function realisasiPoin(data: Record<string, number>, paketList: Paket[]): number {
  let total = 0;
  for (const p of paketList) {
    total += (Number(data[`${p.kolom_prefix}_atasan`]) || 0) * poinAtasan(p);
    total += (Number(data[`${p.kolom_prefix}_celana`]) || 0) * poinCelana(p);
  }
  return total;
}
function parseData(raw: unknown): Record<string, number> {
  try {
    const o = JSON.parse(String(raw || '{}'));
    if (!o || typeof o !== 'object') return {};
    const out: Record<string, number> = {};
    for (const k of Object.keys(o)) out[k] = Number((o as Record<string, unknown>)[k]) || 0;
    return out;
  } catch { return {}; }
}

const ACCENTS: Record<string, { grad: string; blob: string; chip: string; icon: string }> = {
  sky: { grad: 'from-sky-500/[0.14] via-blue-500/[0.06]', blob: 'bg-sky-500/10', chip: 'from-sky-500/25 to-sky-500/5 border-sky-500/25', icon: 'text-sky-300' },
  fuchsia: { grad: 'from-fuchsia-500/[0.14] via-purple-500/[0.06]', blob: 'bg-fuchsia-500/10', chip: 'from-fuchsia-500/25 to-fuchsia-500/5 border-fuchsia-500/25', icon: 'text-fuchsia-300' },
  orange: { grad: 'from-orange-500/[0.14] via-amber-500/[0.06]', blob: 'bg-orange-500/10', chip: 'from-orange-500/25 to-orange-500/5 border-orange-500/25', icon: 'text-orange-300' },
  rose: { grad: 'from-rose-500/[0.14] via-red-500/[0.06]', blob: 'bg-rose-500/10', chip: 'from-rose-500/25 to-rose-500/5 border-rose-500/25', icon: 'text-rose-300' },
  indigo: { grad: 'from-indigo-500/[0.14] via-violet-500/[0.06]', blob: 'bg-indigo-500/10', chip: 'from-indigo-500/25 to-indigo-500/5 border-indigo-500/25', icon: 'text-indigo-300' },
  teal: { grad: 'from-teal-500/[0.14] via-emerald-500/[0.06]', blob: 'bg-teal-500/10', chip: 'from-teal-500/25 to-teal-500/5 border-teal-500/25', icon: 'text-teal-300' },
};

export default function AnalisaProgressPage({ table, title, accent = 'sky' }: { table: string; title: string; accent?: keyof typeof ACCENTS }) {
  const a = ACCENTS[accent] || ACCENTS.sky;
  const [month, setMonth] = useState(currentYm());
  const [rows, setRows] = useState<PRow[]>([]);
  const [paketList, setPaketList] = useState<Paket[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'tabel' | 'grafik'>('tabel');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [all, paket] = await Promise.all([
        dbGet<Row>(table).catch(() => []),
        dbGet<Row>('line_jahit_paket').catch(() => []),
      ]);
      setPaketList((paket as Paket[]).slice().sort((x, y) => (x.urutan || 0) - (y.urutan || 0)));
      setRows((all as Row[])
        .filter(r => String(r.tanggal || '').slice(0, 7) === month)
        .sort((x, y) => String(x.tanggal).localeCompare(String(y.tanggal)) || Number(x.id) - Number(y.id))
        .map(r => ({ id: Number(r.id), tanggal: String(r.tanggal).slice(0, 10), customer: String(r.customer || ''), keterangan: String(r.keterangan || ''), data: parseData(r.realisasi_json) })));
    } catch { setRows([]); }
    setLoading(false);
  }, [table, month]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const monthLabel = useMemo(() => { const [y, m] = month.split('-').map(Number); return `${BULAN_ID[m - 1]?.toUpperCase() || ''} ${y}`; }, [month]);
  const paketCount = paketList.length;

  const groupedByDate = useMemo(() => {
    const g: Record<string, PRow[]> = {};
    for (const r of rows) (g[r.tanggal] ||= []).push(r);
    return g;
  }, [rows]);

  const summary = useMemo(() => {
    const per: Record<number, { atasan: number; celana: number }> = {};
    let grandAtasan = 0, grandCelana = 0;
    for (const p of paketList) {
      let av = 0, cv = 0;
      for (const r of rows) { av += Number(r.data[`${p.kolom_prefix}_atasan`]) || 0; cv += Number(r.data[`${p.kolom_prefix}_celana`]) || 0; }
      per[p.id] = { atasan: av, celana: cv };
      grandAtasan += av; grandCelana += cv;
    }
    const distinctDates = Object.keys(groupedByDate).length;
    const totalTarget = distinctDates * TARGET_PER_DAY;
    const totalRealisasi = rows.reduce((s, r) => s + realisasiPoin(r.data, paketList), 0);
    return { per, grandAtasan, grandCelana, grandTotal: grandAtasan + grandCelana, totalTarget, totalRealisasi, distinctDates };
  }, [rows, paketList, groupedByDate]);

  const bodyColCount = 3 + paketCount * 2 + 3;

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className={`relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br ${a.grad} to-transparent p-5 sm:p-6`}>
        <div aria-hidden className={`absolute -top-16 -right-16 w-48 h-48 rounded-full ${a.blob} blur-3xl pointer-events-none`} />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${a.chip} border grid place-items-center shrink-0`}>
              <svg className={`w-5 h-5 ${a.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" /></svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Analisa · {title} · {monthLabel}</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">View analisa realisasi vs target (flat {TARGET_PER_DAY} poin/hari). Read-only.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:block">Bulan</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-[#111827] border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-sky-500/40 date-input" />
            <button onClick={() => setMonth(currentYm())} className="text-xs font-medium text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-white/10 bg-[#111827] hover:bg-white/[0.04] transition-colors">Bulan Ini</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#111827] border border-white/[0.06]">
        {(['tabel', 'grafik'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors capitalize ${tab === t ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'}`}>{t}</button>
        ))}
      </div>

      {tab === 'tabel' && (
        <>
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-x-auto">
            <div className="px-4 py-2 bg-white text-slate-800 border-b border-slate-200 font-bold text-sm tracking-wide">BULAN {monthLabel}</div>
            <table className="w-full min-w-[760px] text-sm border-collapse">
              <thead>
                <tr className="text-slate-800">
                  <th rowSpan={3} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold w-24 align-middle">TANGGAL</th>
                  <th rowSpan={3} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold align-middle">CUSTOMER</th>
                  <th rowSpan={3} className="bg-rose-50 border border-slate-300 px-2 py-2 text-center font-bold align-middle min-w-[120px]">KETERANGAN</th>
                  <th colSpan={paketCount * 2} className="bg-orange-100 border border-slate-300 px-2 py-2 text-center font-bold">PAKET</th>
                  <th rowSpan={3} className="bg-emerald-100 border border-slate-300 px-2 py-2 text-center font-bold w-20 align-middle">TARGET</th>
                  <th rowSpan={3} className="bg-sky-100 border border-slate-300 px-2 py-2 text-center font-bold w-20 align-middle">REALISASI</th>
                  <th rowSpan={3} className="bg-amber-100 border border-slate-300 px-2 py-2 text-center font-bold w-20 align-middle">SELISIH</th>
                </tr>
                <tr className="text-slate-800">
                  {paketList.map(p => { const c = paketColor(p.urutan); return (
                    <th key={p.id} colSpan={2} className={`${c.tableHead} border border-slate-300 px-2 py-1.5 text-center font-semibold`}>
                      <div className="leading-tight">{p.nama}</div>
                      <div className="text-[9px] font-normal text-slate-500 leading-tight">{fmtPoin(poinAtasan(p))} / {fmtPoin(poinCelana(p))} poin</div>
                    </th>
                  ); })}
                </tr>
                <tr className="text-slate-700 text-xs">
                  {paketList.flatMap(p => { const c = paketColor(p.urutan); return [
                    <th key={`${p.id}-a`} className={`${c.tableSub} border border-slate-300 px-1.5 py-1 text-center font-medium w-16`}>ATASAN</th>,
                    <th key={`${p.id}-c`} className={`${c.tableSub} border border-slate-300 px-1.5 py-1 text-center font-medium w-16`}>CELANA</th>,
                  ]; })}
                </tr>
              </thead>
              <tbody>
                {Object.keys(groupedByDate).length === 0 ? (
                  <tr><td colSpan={bodyColCount} className="border border-slate-300 px-3 py-8 text-center text-sm text-slate-500 bg-white">Belum ada data untuk bulan ini.</td></tr>
                ) : (
                  Object.entries(groupedByDate).map(([date, group]) => (
                    group.map((r, i) => (
                      <tr key={r.id} className="bg-white text-slate-800 text-sm">
                        {i === 0 && <td rowSpan={group.length} className="border border-slate-300 px-2 py-2 text-center text-slate-700 font-medium align-middle">{fmtDayShort(date)}</td>}
                        <td className="border border-slate-300 px-2 py-1 text-slate-700">{r.customer}</td>
                        <td className="border border-slate-300 px-2 py-1 text-slate-500 text-xs">{r.keterangan || <span className="text-slate-300">—</span>}</td>
                        {paketList.flatMap(p => {
                          const vA = Number(r.data[`${p.kolom_prefix}_atasan`]) || 0;
                          const vC = Number(r.data[`${p.kolom_prefix}_celana`]) || 0;
                          return [
                            <td key={`${p.id}-a`} className="border border-slate-300 px-1 py-1 text-center tabular-nums">{vA > 0 ? vA : <span className="text-slate-300">—</span>}</td>,
                            <td key={`${p.id}-c`} className="border border-slate-300 px-1 py-1 text-center tabular-nums">{vC > 0 ? vC : <span className="text-slate-300">—</span>}</td>,
                          ];
                        })}
                        {i === 0 && <td rowSpan={group.length} className="border border-slate-300 px-2 py-1 text-center align-middle tabular-nums font-semibold text-emerald-700 bg-emerald-50/40">{fmtPoin(TARGET_PER_DAY)}</td>}
                        {i === 0 && (() => {
                          const totalRp = group.reduce((s, gr) => s + realisasiPoin(gr.data, paketList), 0);
                          return <td rowSpan={group.length} className="border border-slate-300 px-2 py-1 text-center align-middle tabular-nums font-semibold text-sky-700 bg-sky-50/40">{totalRp > 0 ? fmtPoin(totalRp) : <span className="text-slate-300 font-normal">—</span>}</td>;
                        })()}
                        {i === 0 && (() => {
                          const totalRp = group.reduce((s, gr) => s + realisasiPoin(gr.data, paketList), 0);
                          const diff = totalRp - TARGET_PER_DAY;
                          const pos = diff >= 0;
                          return <td rowSpan={group.length} className={`border border-slate-300 px-2 py-1 text-center align-middle tabular-nums font-bold ${pos ? 'bg-emerald-50/60 text-emerald-700' : 'bg-rose-50/60 text-rose-700'}`}>{pos ? '+' : '−'}{fmtPoin(Math.abs(diff))}</td>;
                        })()}
                      </tr>
                    ))
                  ))
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-yellow-200 text-slate-900 text-sm font-bold">
                    <td colSpan={3} className="border border-slate-400 px-3 py-2 text-center uppercase tracking-wide">Total</td>
                    {paketList.flatMap(p => { const s = summary.per[p.id] || { atasan: 0, celana: 0 }; return [
                      <td key={`${p.id}-a`} className="border border-slate-400 px-2 py-2 text-center tabular-nums">{s.atasan}</td>,
                      <td key={`${p.id}-c`} className="border border-slate-400 px-2 py-2 text-center tabular-nums">{s.celana}</td>,
                    ]; })}
                    <td className="border border-slate-400 px-2 py-2 text-center tabular-nums text-emerald-800">{fmtPoin(summary.totalTarget)}</td>
                    <td className="border border-slate-400 px-2 py-2 text-center tabular-nums text-sky-800">{fmtPoin(summary.totalRealisasi)}</td>
                    {(() => { const diff = summary.totalRealisasi - summary.totalTarget; const pos = diff >= 0; return <td className={`border border-slate-400 px-2 py-2 text-center tabular-nums ${pos ? 'text-emerald-800' : 'text-rose-800'}`}>{pos ? '+' : '−'}{fmtPoin(Math.abs(diff))}</td>; })()}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Summary panel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-2xl overflow-hidden border border-white/[0.06]">
              <div className="bg-yellow-200 text-slate-800 text-center py-2 font-bold text-sm">REKAP QTY BULAN {monthLabel.split(' ')[0]}</div>
              <table className="w-full text-sm bg-white text-slate-800">
                <tbody>
                  {paketList.map(p => { const c = paketColor(p.urutan); const s = summary.per[p.id] || { atasan: 0, celana: 0 }; return (
                    <SummaryRows key={p.id} nama={p.nama} palette={c} atasan={s.atasan} celana={s.celana} />
                  ); })}
                </tbody>
              </table>
            </div>
            <div className="rounded-2xl overflow-hidden border border-orange-500/40">
              <div className="bg-orange-400 text-slate-900 text-center py-2 font-bold text-sm uppercase tracking-wider">Grand Total</div>
              <table className="w-full text-sm bg-orange-100 text-slate-900">
                <tbody>
                  <tr><td className="border border-orange-300 px-3 py-2 font-semibold">GRAND TOTAL ATASAN</td><td className="border border-orange-300 px-3 py-2 text-right font-bold tabular-nums">{summary.grandAtasan}</td></tr>
                  <tr><td className="border border-orange-300 px-3 py-2 font-semibold">GRAND TOTAL CELANA</td><td className="border border-orange-300 px-3 py-2 text-right font-bold tabular-nums">{summary.grandCelana}</td></tr>
                  <tr><td className="border border-orange-300 px-3 py-2 font-bold uppercase">Grand Total Pcs</td><td className="border border-orange-300 px-3 py-2 text-right font-bold tabular-nums text-lg">{summary.grandTotal}</td></tr>
                  <tr><td className="border border-orange-300 px-3 py-2 font-bold uppercase">Total Realisasi Poin</td><td className="border border-orange-300 px-3 py-2 text-right font-bold tabular-nums text-lg text-sky-800">{fmtPoin(summary.totalRealisasi)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'grafik' && <GrafikView month={month} monthLabel={monthLabel} rows={rows} paketList={paketList} />}
    </div>
  );
}

function SummaryRows({ nama, palette, atasan, celana }: { nama: string; palette: typeof PAKET_PALETTE[number]; atasan: number; celana: number }) {
  return (
    <>
      <tr>
        <td rowSpan={2} className={`${palette.tableHead} border border-slate-300 px-3 py-2 font-bold text-center align-middle`}>{nama}</td>
        <td className={`${palette.tableSub} border border-slate-300 px-3 py-2`}>ATASAN</td>
        <td className="border border-slate-300 px-3 py-2 text-right font-bold tabular-nums">{atasan}</td>
      </tr>
      <tr>
        <td className={`${palette.tableSub} border border-slate-300 px-3 py-2`}>CELANA</td>
        <td className="border border-slate-300 px-3 py-2 text-right font-bold tabular-nums">{celana}</td>
      </tr>
    </>
  );
}

function GrafikView({ month, monthLabel, rows, paketList }: { month: string; monthLabel: string; rows: PRow[]; paketList: Paket[] }) {
  const dayList = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return [];
    const last = new Date(y, m, 0).getDate();
    const out: string[] = [];
    for (let d = 1; d <= last; d++) out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    return out;
  }, [month]);

  const realisasiByDate = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of rows) { const key = String(r.tanggal || '').slice(0, 10); if (!key) continue; t[key] = (t[key] || 0) + realisasiPoin(r.data, paketList); }
    return t;
  }, [rows, paketList]);

  const activeDatesSet = useMemo(() => new Set(rows.map(r => String(r.tanggal).slice(0, 10))), [rows]);

  const chartData = useMemo(() => dayList.map(d => {
    const realisasi = Math.round(realisasiByDate[d] || 0);
    // Target hanya untuk hari yang ada aktivitas (flat 340), biar grafik tidak
    // menuduh "kurang" di hari libur/tanpa input.
    const target = activeDatesSet.has(d) ? TARGET_PER_DAY : 0;
    const [, mm, dd] = d.split('-').map(Number);
    return { tanggal: d, label: `${dd}/${mm}`, target, realisasi };
  }), [dayList, realisasiByDate, activeDatesSet]);

  const totalTarget = chartData.reduce((s, p) => s + p.target, 0);
  const totalRealisasi = chartData.reduce((s, p) => s + p.realisasi, 0);
  const konv = totalTarget > 0 ? (totalRealisasi / totalTarget) * 100 : 0;
  const selisih = totalRealisasi - totalTarget;
  const activeDays = chartData.filter(p => p.target > 0 || p.realisasi > 0).length;

  return (
    <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-white">Target vs Realisasi · {monthLabel}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Biru = target ({TARGET_PER_DAY} poin/hari aktif). Emerald = realisasi poin.</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          <ChipStat label="Target" value={fmtPoin(totalTarget)} color="blue" />
          <ChipStat label="Realisasi" value={fmtPoin(totalRealisasi)} color="emerald" />
          <ChipStat label="Selisih" value={`${selisih >= 0 ? '+' : ''}${fmtPoin(selisih)}`} color={selisih >= 0 ? 'emerald' : 'rose'} />
          <ChipStat label="Konv" value={totalTarget > 0 ? `${konv.toFixed(1)}%` : '—'} color="fuchsia" />
          <ChipStat label="Hari Aktif" value={String(activeDays)} color="amber" />
        </div>
      </div>
      <div className="p-4">
        {totalTarget === 0 && totalRealisasi === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">Belum ada data di bulan ini.</div>
        ) : (
          <div style={{ width: '100%', height: 340 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={{ stroke: '#334155' }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={{ stroke: '#334155' }} width={40} />
                <Tooltip content={<GrafikTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Legend wrapperStyle={{ paddingTop: 4, fontSize: 11 }} formatter={(v) => <span style={{ color: '#cbd5e1' }}>{v}</span>} />
                <Line type="monotone" name="Target" dataKey="target" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                <Line type="monotone" name="Realisasi" dataKey="realisasi" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function GrafikTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: { target: number; realisasi: number }; name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const konv = row.target > 0 ? (row.realisasi / row.target) * 100 : 0;
  return (
    <div className="rounded-lg bg-[#0c1120] border border-white/[0.1] px-3 py-2 shadow-xl min-w-[180px]">
      <p className="text-xs text-slate-400 mb-1">Tgl {label}</p>
      <div className="space-y-0.5">
        {payload.map(p => (
          <div key={p.name} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />
            <span className="text-slate-300 flex-1">{p.name}</span>
            <span className="text-white font-semibold tabular-nums">{fmtPoin(Number(p.value))}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 text-xs pt-1 mt-1 border-t border-white/[0.06]">
          <span className="w-2 h-2 rounded-sm shrink-0 bg-fuchsia-400" />
          <span className="text-slate-300 flex-1">Konv</span>
          <span className="text-fuchsia-300 font-semibold tabular-nums">{row.target > 0 ? `${konv.toFixed(1)}%` : '—'}</span>
        </div>
      </div>
    </div>
  );
}

function ChipStat({ label, value, color }: { label: string; value: string; color: 'blue' | 'emerald' | 'fuchsia' | 'amber' | 'rose' }) {
  const scheme = {
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    fuchsia: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    rose: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  }[color];
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-lg border ${scheme} px-3 py-1.5`}>
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}
