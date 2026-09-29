'use client';

// Analisa Progress Produksi — GABUNGAN 6 bagian (Printing/Press/Cutting/Steam/
// Finishing/Shipment) dalam SATU halaman. Satu tabel ringkas per (tanggal,
// bagian) — qty per paket diagregasi (bukan per customer) + target/realisasi/
// selisih — lalu 6 grafik di bawahnya (satu per bagian) supaya bisa langsung
// discroll. Read-only.
//
// Akses PIC tetap dibatasi: bagian yang tampil ditentukan dari menuAccess user
// (mis. 'Analisa Cutting' → hanya Cutting). Admin / punya 'Analisa' → semua.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet } from '@/lib/api-db';
import { useAuth } from '@/lib/auth-context';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BASE_RATE_POIN = 5000;
const TARGET_PER_DAY = 340; // flat per bagian per hari

// Definisi 6 bagian + tabel sumber + key menu (untuk filter akses PIC) + warna
// garis realisasi di grafik.
const BAGIAN = [
  { key: 'printing', table: 'progress_printing', label: 'Printing', menuKey: 'Analisa Printing', color: '#38bdf8' },
  { key: 'press', table: 'progress_press', label: 'Press', menuKey: 'Analisa Press', color: '#e879f9' },
  { key: 'cutting', table: 'progress_cutting', label: 'Cutting', menuKey: 'Analisa Cutting', color: '#fb923c' },
  { key: 'steam', table: 'progress_steam', label: 'Steam', menuKey: null as string | null, color: '#2dd4bf' },
  { key: 'finishing', table: 'progress_finishing', label: 'Finishing', menuKey: 'Analisa Finishing', color: '#818cf8' },
  { key: 'shipment', table: 'progress_shipment', label: 'Shipment', menuKey: 'Analisa Shipment', color: '#f472b6' },
] as const;
type Bagian = typeof BAGIAN[number];

interface Paket { id: number; nama: string; kolom_prefix: string; urutan: number; rate_atasan: number; rate_celana: number; }
interface PRow { tanggal: string; data: Record<string, number>; }

function currentYm(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function fmtDayShort(iso: string): string {
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!m || !d) return iso;
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][m - 1]}`;
}
function fmtPoin(n: number): string {
  const v = Math.round((n || 0) * 10) / 10;
  return v.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}
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

const PAKET_PALETTE = [
  { head: 'bg-yellow-100', sub: 'bg-yellow-50' },
  { head: 'bg-blue-100', sub: 'bg-blue-50' },
  { head: 'bg-pink-100', sub: 'bg-pink-50' },
  { head: 'bg-emerald-100', sub: 'bg-emerald-50' },
  { head: 'bg-orange-100', sub: 'bg-orange-50' },
  { head: 'bg-violet-100', sub: 'bg-violet-50' },
];
function paketColor(urutan: number) { const i = ((urutan || 1) - 1) % PAKET_PALETTE.length; return PAKET_PALETTE[i < 0 ? 0 : i]; }

// Warna pill bagian di kolom BAGIAN.
const BAGIAN_PILL: Record<string, string> = {
  printing: 'text-sky-700 bg-sky-100 border-sky-300',
  press: 'text-fuchsia-700 bg-fuchsia-100 border-fuchsia-300',
  cutting: 'text-orange-700 bg-orange-100 border-orange-300',
  steam: 'text-teal-700 bg-teal-100 border-teal-300',
  finishing: 'text-indigo-700 bg-indigo-100 border-indigo-300',
  shipment: 'text-pink-700 bg-pink-100 border-pink-300',
};

export default function AnalisaProgressCombined() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentYm());
  const [paketList, setPaketList] = useState<Paket[]>([]);
  const [dataByBagian, setDataByBagian] = useState<Record<string, PRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'tabel' | 'grafik'>('tabel');

  // Bagian yang boleh dilihat user. Admin / punya 'Analisa' → semua. PIC →
  // hanya bagian yang key menunya ada di menuAccess.
  const accessibleBagian = useMemo<Bagian[]>(() => {
    const ma = user?.menuAccess || [];
    const full = ma.length === 0 || ma.includes('Analisa');
    return BAGIAN.filter(b => full || (b.menuKey !== null && ma.includes(b.menuKey)));
  }, [user?.menuAccess]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const paketRes = await dbGet<Row>('line_jahit_paket').catch(() => []);
      setPaketList((paketRes as Paket[]).slice().sort((a, b) => (a.urutan || 0) - (b.urutan || 0)));
      const results = await Promise.all(
        accessibleBagian.map(b => dbGet<Row>(b.table).catch(() => []))
      );
      const map: Record<string, PRow[]> = {};
      accessibleBagian.forEach((b, i) => {
        map[b.key] = (results[i] as Row[])
          .filter(r => String(r.tanggal || '').slice(0, 7) === month)
          .map(r => ({ tanggal: String(r.tanggal).slice(0, 10), data: parseData(r.realisasi_json) }));
      });
      setDataByBagian(map);
    } catch { setDataByBagian({}); }
    setLoading(false);
  }, [accessibleBagian, month]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const monthLabel = useMemo(() => { const [y, m] = month.split('-').map(Number); return `${BULAN_ID[m - 1]?.toUpperCase() || ''} ${y}`; }, [month]);
  const paketCount = paketList.length;

  // Agregasi per (tanggal, bagian): jumlah atasan/celana per paket + realisasi.
  const tableGroups = useMemo(() => {
    const byDate = new Map<string, Array<{ bagian: Bagian; per: Record<number, { a: number; c: number }>; realisasi: number }>>();
    for (const b of accessibleBagian) {
      const rows = dataByBagian[b.key] || [];
      const rowsByDate = new Map<string, PRow[]>();
      for (const r of rows) {
        if (!rowsByDate.has(r.tanggal)) rowsByDate.set(r.tanggal, []);
        rowsByDate.get(r.tanggal)!.push(r);
      }
      for (const [date, rs] of rowsByDate) {
        const per: Record<number, { a: number; c: number }> = {};
        for (const p of paketList) {
          let a = 0, c = 0;
          for (const r of rs) { a += Number(r.data[`${p.kolom_prefix}_atasan`]) || 0; c += Number(r.data[`${p.kolom_prefix}_celana`]) || 0; }
          per[p.id] = { a, c };
        }
        const realisasi = rs.reduce((s, r) => s + realisasiPoin(r.data, paketList), 0);
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date)!.push({ bagian: b, per, realisasi });
      }
    }
    const bagIndex = (b: Bagian) => BAGIAN.findIndex(x => x.key === b.key);
    return Array.from(byDate.keys()).sort().map(date => ({
      date,
      rows: byDate.get(date)!.sort((x, y) => bagIndex(x.bagian) - bagIndex(y.bagian)),
    }));
  }, [dataByBagian, accessibleBagian, paketList]);

  const totals = useMemo(() => {
    let target = 0, realisasi = 0;
    for (const g of tableGroups) for (const r of g.rows) { target += TARGET_PER_DAY; realisasi += r.realisasi; }
    return { target, realisasi, selisih: realisasi - target, barisCount: tableGroups.reduce((s, g) => s + g.rows.length, 0) };
  }, [tableGroups]);

  const bodyColCount = 2 + paketCount * 2 + 3;

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-indigo-500/[0.14] via-violet-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500/25 to-indigo-500/5 border border-indigo-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" /></svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Analisa · Progress Produksi · {monthLabel}</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Ringkasan realisasi vs target semua bagian dalam satu tabel + grafik per bagian.
                Target <span className="text-white font-semibold">{TARGET_PER_DAY} poin/hari</span> per bagian. Read-only.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:block">Bulan</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-[#111827] border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500/40 date-input" />
            <button onClick={() => setMonth(currentYm())} className="text-xs font-medium text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-white/10 bg-[#111827] hover:bg-white/[0.04] transition-colors">Bulan Ini</button>
          </div>
        </div>
      </div>

      {accessibleBagian.length === 0 ? (
        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] px-5 py-12 text-center text-sm text-slate-500">
          Tidak ada bagian yang bisa ditampilkan untuk akun ini.
        </div>
      ) : (
        <>
          {/* Tabs — Tabel / Grafik (grafik di sub-tab terpisah, bukan di bawah) */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#111827] border border-white/[0.06]">
            {(['tabel', 'grafik'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors capitalize ${tab === t ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'}`}>{t}</button>
            ))}
          </div>

          {tab === 'tabel' && (
          <>
          {/* Tabel ringkas gabungan */}
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-x-auto">
            <div className="px-4 py-2 bg-white text-slate-800 border-b border-slate-200 font-bold text-sm tracking-wide">
              REKAP HARIAN · BULAN {monthLabel}
            </div>
            <table className="w-full min-w-[820px] text-sm border-collapse">
              <thead>
                <tr className="text-slate-800">
                  <th rowSpan={3} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold w-24 align-middle">TANGGAL</th>
                  <th rowSpan={3} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold w-28 align-middle">BAGIAN</th>
                  <th colSpan={paketCount * 2} className="bg-orange-100 border border-slate-300 px-2 py-2 text-center font-bold">PAKET</th>
                  <th rowSpan={3} className="bg-emerald-100 border border-slate-300 px-2 py-2 text-center font-bold w-20 align-middle">TARGET</th>
                  <th rowSpan={3} className="bg-sky-100 border border-slate-300 px-2 py-2 text-center font-bold w-20 align-middle">REALISASI</th>
                  <th rowSpan={3} className="bg-amber-100 border border-slate-300 px-2 py-2 text-center font-bold w-20 align-middle">SELISIH</th>
                </tr>
                <tr className="text-slate-800">
                  {paketList.map(p => { const c = paketColor(p.urutan); return (
                    <th key={p.id} colSpan={2} className={`${c.head} border border-slate-300 px-2 py-1.5 text-center font-semibold`}>
                      <div className="leading-tight">{p.nama}</div>
                      <div className="text-[9px] font-normal text-slate-500 leading-tight">{fmtPoin(poinAtasan(p))} / {fmtPoin(poinCelana(p))} poin</div>
                    </th>
                  ); })}
                </tr>
                <tr className="text-slate-700 text-xs">
                  {paketList.flatMap(p => { const c = paketColor(p.urutan); return [
                    <th key={`${p.id}-a`} className={`${c.sub} border border-slate-300 px-1.5 py-1 text-center font-medium w-14`}>ATASAN</th>,
                    <th key={`${p.id}-c`} className={`${c.sub} border border-slate-300 px-1.5 py-1 text-center font-medium w-14`}>CELANA</th>,
                  ]; })}
                </tr>
              </thead>
              <tbody>
                {tableGroups.length === 0 ? (
                  <tr><td colSpan={bodyColCount} className="border border-slate-300 px-3 py-8 text-center text-sm text-slate-500 bg-white">Belum ada data untuk bulan ini.</td></tr>
                ) : (
                  tableGroups.map(g => (
                    g.rows.map((r, i) => {
                      const diff = r.realisasi - TARGET_PER_DAY;
                      const pos = diff >= 0;
                      return (
                        <tr key={`${g.date}-${r.bagian.key}`} className="bg-white text-slate-800 text-sm">
                          {i === 0 && <td rowSpan={g.rows.length} className="border border-slate-300 px-2 py-2 text-center text-slate-700 font-medium align-middle">{fmtDayShort(g.date)}</td>}
                          <td className="border border-slate-300 px-2 py-1.5">
                            <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${BAGIAN_PILL[r.bagian.key] || 'text-slate-700 bg-slate-100 border-slate-300'}`}>{r.bagian.label}</span>
                          </td>
                          {paketList.flatMap(p => {
                            const v = r.per[p.id] || { a: 0, c: 0 };
                            return [
                              <td key={`${p.id}-a`} className="border border-slate-300 px-1 py-1 text-center tabular-nums">{v.a > 0 ? v.a : <span className="text-slate-300">—</span>}</td>,
                              <td key={`${p.id}-c`} className="border border-slate-300 px-1 py-1 text-center tabular-nums">{v.c > 0 ? v.c : <span className="text-slate-300">—</span>}</td>,
                            ];
                          })}
                          <td className="border border-slate-300 px-2 py-1 text-center tabular-nums font-semibold text-emerald-700 bg-emerald-50/40">{fmtPoin(TARGET_PER_DAY)}</td>
                          <td className="border border-slate-300 px-2 py-1 text-center tabular-nums font-semibold text-sky-700 bg-sky-50/40">{r.realisasi > 0 ? fmtPoin(r.realisasi) : <span className="text-slate-300 font-normal">—</span>}</td>
                          <td className={`border border-slate-300 px-2 py-1 text-center tabular-nums font-bold ${pos ? 'bg-emerald-50/60 text-emerald-700' : 'bg-rose-50/60 text-rose-700'}`}>{pos ? '+' : '−'}{fmtPoin(Math.abs(diff))}</td>
                        </tr>
                      );
                    })
                  ))
                )}
              </tbody>
              {totals.barisCount > 0 && (
                <tfoot>
                  <tr className="bg-yellow-200 text-slate-900 text-sm font-bold">
                    <td colSpan={2 + paketCount * 2} className="border border-slate-400 px-3 py-2 text-center uppercase tracking-wide">Total ({totals.barisCount} baris)</td>
                    <td className="border border-slate-400 px-2 py-2 text-center tabular-nums text-emerald-800">{fmtPoin(totals.target)}</td>
                    <td className="border border-slate-400 px-2 py-2 text-center tabular-nums text-sky-800">{fmtPoin(totals.realisasi)}</td>
                    <td className={`border border-slate-400 px-2 py-2 text-center tabular-nums ${totals.selisih >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>{totals.selisih >= 0 ? '+' : '−'}{fmtPoin(Math.abs(totals.selisih))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          </>
          )}

          {tab === 'grafik' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {accessibleBagian.map(b => (
                <BagianChart key={b.key} bagian={b} rows={dataByBagian[b.key] || []} paketList={paketList} month={month} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BagianChart({ bagian, rows, paketList, month }: { bagian: Bagian; rows: PRow[]; paketList: Paket[]; month: string }) {
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
    for (const r of rows) { const k = String(r.tanggal || '').slice(0, 10); if (!k) continue; t[k] = (t[k] || 0) + realisasiPoin(r.data, paketList); }
    return t;
  }, [rows, paketList]);
  const activeDates = useMemo(() => new Set(rows.map(r => String(r.tanggal).slice(0, 10))), [rows]);

  const chartData = useMemo(() => dayList.map(d => {
    const [, mm, dd] = d.split('-').map(Number);
    return { label: `${dd}/${mm}`, target: activeDates.has(d) ? TARGET_PER_DAY : 0, realisasi: Math.round(realisasiByDate[d] || 0) };
  }), [dayList, realisasiByDate, activeDates]);

  const totalTarget = chartData.reduce((s, p) => s + p.target, 0);
  const totalReal = chartData.reduce((s, p) => s + p.realisasi, 0);
  const selisih = totalReal - totalTarget;
  const konv = totalTarget > 0 ? (totalReal / totalTarget) * 100 : 0;

  return (
    <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: bagian.color }} />
          <p className="text-sm font-semibold text-white">{bagian.label}</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] tabular-nums">
          <span className="text-slate-400">Real <b className="text-sky-300">{fmtPoin(totalReal)}</b></span>
          <span className="text-slate-400">Target <b className="text-emerald-300">{fmtPoin(totalTarget)}</b></span>
          <span className={`font-bold ${selisih >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{selisih >= 0 ? '+' : '−'}{fmtPoin(Math.abs(selisih))}</span>
          <span className="text-fuchsia-300 font-semibold">{totalTarget > 0 ? `${konv.toFixed(0)}%` : '—'}</span>
        </div>
      </div>
      <div className="p-3">
        {totalTarget === 0 && totalReal === 0 ? (
          <div className="py-14 text-center text-sm text-slate-500">Belum ada data bulan ini.</div>
        ) : (
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 6, right: 10, bottom: 2, left: 0 }}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={{ stroke: '#334155' }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={{ stroke: '#334155' }} width={36} />
                <Tooltip contentStyle={{ background: '#0c1120', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#e2e8f0' }} />
                <Legend wrapperStyle={{ paddingTop: 2, fontSize: 10 }} formatter={(v) => <span style={{ color: '#cbd5e1' }}>{v}</span>} />
                <Line type="monotone" name="Target" dataKey="target" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                <Line type="monotone" name="Realisasi" dataKey="realisasi" stroke={bagian.color} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
