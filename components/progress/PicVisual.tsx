'use client';

// Visual per-PIC (dipakai /progress/pic-<nama>). Per proses: tabel harian
// (Tgl/Target/Realisasi/Selisih), perbandingan mingguan & bulanan, dan grafik.
// Publik (tanpa login), tema terang, konsisten dengan /progress. Data dari
// /api/public/pic?pic=<nama> (bulan ini + bulan lalu).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
interface DayAgg { date: string; real: number; pcs: number }
interface Proc { key: string; label: string; metric?: 'poin' | 'qty'; days: DayAgg[]; prevDays: DayAgg[] }
interface Feed {
  success: boolean; picLabel: string; target: number;
  month: string; monthLabel: string; prevMonth: string; prevMonthLabel: string;
  processes: Proc[];
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const POLL_MS = 30_000;
const TARGET = 340;

function fmt(n: number): string { const v = Math.round((n || 0) * 10) / 10; return v.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 1 }); }
function dayNum(iso: string): number { return Number(String(iso).slice(8, 10)); }
function monNum(iso: string): number { return Number(String(iso).slice(5, 7)); }
function fmtDayShort(iso: string): string { return `${dayNum(iso)} ${MON_SHORT[monNum(iso) - 1]}`; }

export default function PicVisual({ pic }: { pic: string }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [now, setNow] = useState(new Date());
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/pic?pic=${encodeURIComponent(pic)}`, { cache: 'no-store' });
      const j = await res.json();
      if (j && j.success) { setFeed(j as Feed); setErr(false); } else setErr(true);
    } catch { setErr(true); }
  }, [pic]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { load(); const t = setInterval(load, POLL_MS); return () => clearInterval(t); }, [load]);

  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dateLabel = `${DAY_NAMES[now.getDay()]}, ${now.getDate()} ${MON_SHORT[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div className="min-h-screen text-slate-800" style={{ background: '#f1f5f9' }}>
      <header className="flex items-center justify-between px-6 sm:px-10 pt-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/new%20logo.png" alt="AYRES" className="h-9 w-auto object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <div className="leading-none">
            <div className="font-black tracking-[0.18em] text-indigo-600 text-xl">AYRES</div>
            <div className="tracking-[0.32em] text-slate-400 font-semibold mt-1 text-[10px]">PRODUCTION LIVE</div>
          </div>
        </div>
        <div className="text-right leading-none">
          <div className="font-black text-slate-900 tabular-nums text-3xl">{clock}</div>
          <div className="text-slate-500 font-semibold mt-1 text-xs">{dateLabel}</div>
        </div>
      </header>

      <div className="px-6 sm:px-10 mt-4">
        <div className="flex items-center gap-3 flex-wrap">
          <a href="/progress" className="text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-300 bg-white rounded-lg px-3 py-1.5">← Papan Progress</a>
          <h1 className="font-black tracking-tight text-slate-900 text-2xl sm:text-3xl">Laporan {feed ? feed.processes.map(p => p.label).join(' & ') : ''}</h1>
          <span className="text-slate-500 font-medium">{feed ? feed.monthLabel : ''}</span>
        </div>
      </div>

      <main className="px-6 sm:px-10 py-6 space-y-8">
        {!feed ? (
          <div className="py-24 text-center text-slate-400 font-semibold">{err ? 'Gagal memuat data.' : 'Memuat data…'}</div>
        ) : (
          feed.processes.map(proc => (
            <ProcessSection key={proc.key} proc={proc} month={feed.month} monthLabel={feed.monthLabel} prevMonthLabel={feed.prevMonthLabel} />
          ))
        )}
      </main>
    </div>
  );
}

// Ringkasan agregat dari sekumpulan hari (hari-dengan-data).
function agg(days: DayAgg[]) {
  const real = days.reduce((s, d) => s + d.real, 0);
  const target = days.length * TARGET;
  const selisih = real - target;
  const pct = target > 0 ? Math.round((real / target) * 100) : 0;
  return { real, target, selisih, pct, hari: days.length };
}

function ProcessSection({ proc, month, monthLabel, prevMonthLabel }: {
  proc: Proc; month: string; monthLabel: string; prevMonthLabel: string;
}) {
  // Proses qty-only (Design/Proofing): tanpa poin/target/selisih — cuma qty.
  const isQty = proc.metric === 'qty';
  const cur = useMemo(() => agg(proc.days), [proc.days]);
  const prev = useMemo(() => agg(proc.prevDays), [proc.prevDays]);

  // Perbandingan mingguan: bucket tanggal 1-7 / 8-14 / 15-21 / 22-28 / 29-akhir.
  const weekly = useMemo(() => {
    const buckets = [[1, 7], [8, 14], [15, 21], [22, 28], [29, 31]];
    return buckets.map(([lo, hi], i) => {
      const ds = proc.days.filter(d => { const n = dayNum(d.date); return n >= lo && n <= hi; });
      const a = agg(ds);
      return { label: `Mgg ${i + 1}`, range: `${lo}–${hi === 31 ? 'akhir' : hi}`, ...a };
    }).filter(w => w.hari > 0 || w.label === 'Mgg 1');
  }, [proc.days]);

  // Data grafik: semua hari di bulan ini. poin → real + target; qty → qty saja.
  const chartData = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    const byDate = new Map(proc.days.map(d => [d.date, d.real]));
    const out: { label: string; real: number; target: number }[] = [];
    for (let d = 1; d <= last; d++) {
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const has = byDate.has(iso);
      out.push({ label: `${d}/${m}`, real: has ? Math.round(byDate.get(iso)!) : 0, target: (!isQty && has) ? TARGET : 0 });
    }
    return out;
  }, [proc.days, month, isQty]);

  const diffCls = (n: number) => n >= 0 ? 'text-emerald-600' : 'text-rose-600';

  return (
    <section className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      {/* Header proses + ringkasan bulan */}
      <div className="flex items-center justify-between gap-4 flex-wrap px-5 sm:px-7 py-4 border-b border-slate-200 bg-gradient-to-r from-sky-50 to-transparent">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-sky-500" />
          <h2 className="font-black text-slate-900 text-xl sm:text-2xl">{proc.label}</h2>
          {isQty && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border border-slate-200 rounded-full px-2 py-0.5">qty saja</span>}
        </div>
        <div className="flex items-center gap-4 sm:gap-6 text-right">
          {isQty ? (
            <>
              <Stat label="Total Qty" value={fmt(cur.real)} cls="text-sky-700" />
              <Stat label="Hari" value={String(cur.hari)} cls="text-slate-700" />
            </>
          ) : (
            <>
              <Stat label="Realisasi" value={fmt(cur.real)} cls="text-sky-700" />
              <Stat label="Target" value={fmt(cur.target)} cls="text-emerald-700" />
              <Stat label="Selisih" value={`${cur.selisih >= 0 ? '+' : '−'}${fmt(Math.abs(cur.selisih))}`} cls={diffCls(cur.selisih)} />
              <Stat label="Capaian" value={`${cur.pct}%`} cls="text-fuchsia-700" />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-5 p-5 sm:p-7">
        {/* Kiri: tabel harian */}
        <div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Rekap Harian · {monthLabel}</p>
          <div className="rounded-xl border border-slate-200 overflow-hidden max-h-[360px] overflow-y-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0">
                <tr className="text-slate-700 text-xs">
                  <th className="bg-slate-100 border-b border-slate-200 px-3 py-2 text-left font-bold">TANGGAL</th>
                  {isQty ? (
                    <th className="bg-sky-100 border-b border-slate-200 px-3 py-2 text-center font-bold">QTY</th>
                  ) : (
                    <>
                      <th className="bg-emerald-100 border-b border-slate-200 px-3 py-2 text-center font-bold">TARGET</th>
                      <th className="bg-sky-100 border-b border-slate-200 px-3 py-2 text-center font-bold">REALISASI</th>
                      <th className="bg-amber-100 border-b border-slate-200 px-3 py-2 text-center font-bold">SELISIH</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {proc.days.length === 0 ? (
                  <tr><td colSpan={isQty ? 2 : 4} className="px-3 py-8 text-center text-slate-400">Belum ada data bulan ini.</td></tr>
                ) : proc.days.map(d => {
                  const sel = d.real - TARGET;
                  return (
                    <tr key={d.date} className="odd:bg-white even:bg-slate-50/60">
                      <td className="border-b border-slate-100 px-3 py-1.5 font-medium text-slate-700">{fmtDayShort(d.date)}</td>
                      {isQty ? (
                        <td className="border-b border-slate-100 px-3 py-1.5 text-center tabular-nums font-semibold text-sky-700">{fmt(d.real)}</td>
                      ) : (
                        <>
                          <td className="border-b border-slate-100 px-3 py-1.5 text-center tabular-nums text-emerald-700">{fmt(TARGET)}</td>
                          <td className="border-b border-slate-100 px-3 py-1.5 text-center tabular-nums font-semibold text-sky-700">{fmt(d.real)}</td>
                          <td className={`border-b border-slate-100 px-3 py-1.5 text-center tabular-nums font-bold ${diffCls(sel)}`}>{sel >= 0 ? '+' : '−'}{fmt(Math.abs(sel))}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {proc.days.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900">
                    <td className="px-3 py-2">TOTAL ({cur.hari} hari)</td>
                    {isQty ? (
                      <td className="px-3 py-2 text-center tabular-nums text-sky-700">{fmt(cur.real)}</td>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-center tabular-nums text-emerald-700">{fmt(cur.target)}</td>
                        <td className="px-3 py-2 text-center tabular-nums text-sky-700">{fmt(cur.real)}</td>
                        <td className={`px-3 py-2 text-center tabular-nums ${diffCls(cur.selisih)}`}>{cur.selisih >= 0 ? '+' : '−'}{fmt(Math.abs(cur.selisih))}</td>
                      </>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Kanan: grafik + perbandingan */}
        <div className="space-y-5">
          {/* Grafik */}
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1 px-1">{isQty ? 'Grafik Harian · Qty' : 'Grafik Harian · Realisasi vs Target'}</p>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 2, left: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 9, fill: '#64748b' }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} stroke="#94a3b8" tick={{ fontSize: 10, fill: '#64748b' }} width={38} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" name={isQty ? 'Qty' : 'Realisasi'} dataKey="real" stroke="#0ea5e9" strokeWidth={2.5} dot={false} />
                  {!isQty && <Line type="monotone" name="Target" dataKey="target" stroke="#10b981" strokeWidth={2} strokeDasharray="5 4" dot={false} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Perbandingan mingguan */}
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Perbandingan Mingguan</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {weekly.map(w => (
                <div key={w.label} className="rounded-xl border border-slate-200 p-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-bold text-slate-700">{w.label}</span>
                    <span className="text-[10px] text-slate-400">{w.range}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 flex items-center justify-between tabular-nums">
                    {isQty ? (
                      <span>Qty <b className="text-sky-700">{fmt(w.real)}</b></span>
                    ) : (
                      <>
                        <span>Real <b className="text-sky-700">{fmt(w.real)}</b></span>
                        <span className={`font-bold ${diffCls(w.selisih)}`}>{w.selisih >= 0 ? '+' : '−'}{fmt(Math.abs(w.selisih))}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Perbandingan bulanan */}
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Perbandingan Bulanan</p>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-700">
                    <th className="bg-slate-100 border-b border-slate-200 px-3 py-2 text-left font-bold">BULAN</th>
                    {isQty ? (
                      <th className="bg-sky-100 border-b border-slate-200 px-3 py-2 text-center font-bold">QTY</th>
                    ) : (
                      <>
                        <th className="bg-emerald-100 border-b border-slate-200 px-3 py-2 text-center font-bold">TARGET</th>
                        <th className="bg-sky-100 border-b border-slate-200 px-3 py-2 text-center font-bold">REALISASI</th>
                        <th className="bg-amber-100 border-b border-slate-200 px-3 py-2 text-center font-bold">SELISIH</th>
                        <th className="bg-fuchsia-100 border-b border-slate-200 px-3 py-2 text-center font-bold">%</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {[{ lbl: monthLabel, a: cur, hl: true }, { lbl: prevMonthLabel, a: prev, hl: false }].map(r => (
                    <tr key={r.lbl} className={r.hl ? 'bg-sky-50/50' : 'bg-white'}>
                      <td className="border-b border-slate-100 px-3 py-2 font-semibold text-slate-700">{r.lbl} <span className="text-slate-400 font-normal">({r.a.hari}h)</span></td>
                      {isQty ? (
                        <td className="border-b border-slate-100 px-3 py-2 text-center tabular-nums font-semibold text-sky-700">{fmt(r.a.real)}</td>
                      ) : (
                        <>
                          <td className="border-b border-slate-100 px-3 py-2 text-center tabular-nums text-emerald-700">{fmt(r.a.target)}</td>
                          <td className="border-b border-slate-100 px-3 py-2 text-center tabular-nums font-semibold text-sky-700">{fmt(r.a.real)}</td>
                          <td className={`border-b border-slate-100 px-3 py-2 text-center tabular-nums font-bold ${diffCls(r.a.selisih)}`}>{r.a.selisih >= 0 ? '+' : '−'}{fmt(Math.abs(r.a.selisih))}</td>
                          <td className="border-b border-slate-100 px-3 py-2 text-center tabular-nums font-bold text-fuchsia-700">{r.a.pct}%</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="leading-none">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</div>
      <div className={`font-black tabular-nums mt-1 text-lg sm:text-xl ${cls}`}>{value}</div>
    </div>
  );
}
