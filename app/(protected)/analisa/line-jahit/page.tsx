'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet } from '@/lib/api-db';

// Read-only view Line Jahit untuk menu Analisa.
// Menampilkan tabel produksi + summary + kedatangan penjahit + gaji,
// TANPA form input, tombol edit/delete, atau modal tambah header/paket.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDayShort(iso: string): string {
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!m || !d) return iso;
  return `${d} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][m - 1]}`;
}

interface Paket {
  id: number;
  nama: string;
  kolom_prefix: string;
  urutan: number;
  rate_atasan: number;
  rate_celana: number;
}

interface Attendance {
  id: number;
  tanggal: string;
  jumlah_standar: number;
  jumlah_special: number;
}

interface LineJahitRow {
  id: number;
  tanggal: string;
  customer: string;
  [key: string]: string | number;
}

const GAJI_STANDAR_PER_HARI = 100_000;
const GAJI_SPECIAL_PER_HARI = 160_000;
const BASE_RATE_POIN = 5000;

const PAKET_PALETTE = [
  { tableHead: 'bg-yellow-100', tableSub: 'bg-yellow-50' },
  { tableHead: 'bg-blue-100', tableSub: 'bg-blue-50' },
  { tableHead: 'bg-pink-100', tableSub: 'bg-pink-50' },
  { tableHead: 'bg-emerald-100', tableSub: 'bg-emerald-50' },
  { tableHead: 'bg-orange-100', tableSub: 'bg-orange-50' },
  { tableHead: 'bg-violet-100', tableSub: 'bg-violet-50' },
];

function paketColor(urutan: number) {
  const idx = ((urutan || 1) - 1) % PAKET_PALETTE.length;
  return PAKET_PALETTE[idx < 0 ? 0 : idx];
}

function poinAtasan(p: Paket): number {
  return (Number(p.rate_atasan) || BASE_RATE_POIN) / BASE_RATE_POIN;
}
function poinCelana(p: Paket): number {
  return (Number(p.rate_celana) || BASE_RATE_POIN) / BASE_RATE_POIN;
}

function realisasiPoin(row: LineJahitRow, paketList: Paket[]): number {
  let total = 0;
  for (const p of paketList) {
    total += (Number(row[`${p.kolom_prefix}_atasan`]) || 0) * poinAtasan(p);
    total += (Number(row[`${p.kolom_prefix}_celana`]) || 0) * poinCelana(p);
  }
  return total;
}

function fmtRupiah(n: number): string {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
}
function fmtPoin(n: number): string {
  const val = Math.round(n * 10) / 10;
  return val.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

type SubMenu = 'line-jahit' | 'kedatangan';

export default function AnalisaLineJahitPage() {
  const [month, setMonth] = useState(currentYm());
  const [rows, setRows] = useState<LineJahitRow[]>([]);
  const [paketList, setPaketList] = useState<Paket[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState<SubMenu>('line-jahit');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [allRows, allPaket, allAtt] = await Promise.all([
        dbGet('line_jahit').catch(() => []),
        dbGet('line_jahit_paket').catch(() => []),
        dbGet('penjahit_attendance').catch(() => []),
      ]);
      const [y, m] = month.split('-').map(Number);
      const monthPrefix = `${y}-${String(m).padStart(2, '0')}`;
      const filtered = (allRows as Row[]).filter(r => {
        const t = String(r.tanggal || '').slice(0, 7);
        return t === monthPrefix;
      }).sort((a, b) =>
        String(a.tanggal).localeCompare(String(b.tanggal)) || Number(a.id) - Number(b.id)
      );
      setRows(filtered as LineJahitRow[]);
      setPaketList((allPaket as Paket[]).slice().sort((a, b) => (a.urutan || 0) - (b.urutan || 0)));
      setAttendance((allAtt as Attendance[]).filter(a =>
        String(a.tanggal || '').slice(0, 7) === monthPrefix
      ).sort((a, b) =>
        String(b.tanggal).localeCompare(String(a.tanggal)) || Number(b.id) - Number(a.id)
      ));
    } catch {}
    setLoading(false);
  }, [month]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return `${BULAN_ID[m - 1]?.toUpperCase() || ''} ${y}`;
  }, [month]);

  const groupedByDate = useMemo(() => {
    const g: Record<string, LineJahitRow[]> = {};
    for (const r of rows) {
      const key = String(r.tanggal).slice(0, 10);
      (g[key] ||= []).push(r);
    }
    return g;
  }, [rows]);

  const targetByDate = useMemo(() => {
    const t: Record<string, number> = {};
    for (const a of attendance) {
      const key = String(a.tanggal).slice(0, 10);
      const beban = (Number(a.jumlah_standar) || 0) * GAJI_STANDAR_PER_HARI
                  + (Number(a.jumlah_special) || 0) * GAJI_SPECIAL_PER_HARI;
      t[key] = (t[key] || 0) + beban / BASE_RATE_POIN;
    }
    return t;
  }, [attendance]);

  const summary = useMemo(() => {
    const per: Record<number, { atasan: number; celana: number }> = {};
    let grandAtasan = 0, grandCelana = 0;
    for (const p of paketList) {
      let a = 0, c = 0;
      for (const r of rows) {
        a += Number(r[`${p.kolom_prefix}_atasan`]) || 0;
        c += Number(r[`${p.kolom_prefix}_celana`]) || 0;
      }
      per[p.id] = { atasan: a, celana: c };
      grandAtasan += a;
      grandCelana += c;
    }
    return { per, grandAtasan, grandCelana, grandTotal: grandAtasan + grandCelana };
  }, [rows, paketList]);

  const paketCount = paketList.length;
  const bodyColCount = 5 + paketCount * 2; // TANGGAL + CUSTOMER + qty + TARGET + REALISASI + SELISIH (no aksi)

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero — tanpa tombol Tambah Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-cyan-500/[0.14] via-blue-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/25 to-cyan-500/5 border border-cyan-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Analisa · Line Jahit · {monthLabel}</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                View analisa produksi jahit + kedatangan penjahit. Read-only.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:block">Bulan</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="bg-[#111827] border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500/40 date-input"
            />
            <button
              onClick={() => setMonth(currentYm())}
              className="text-xs font-medium text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-white/10 bg-[#111827] hover:bg-white/[0.04] transition-colors"
            >
              Bulan Ini
            </button>
          </div>
        </div>
      </div>

      {/* Sub-menu tabs */}
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#111827] border border-white/[0.06]">
        <button
          onClick={() => setActiveMenu('line-jahit')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeMenu === 'line-jahit'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          Line Jahit
        </button>
        <button
          onClick={() => setActiveMenu('kedatangan')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeMenu === 'kedatangan'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          Kedatangan Penjahit
        </button>
      </div>

      {activeMenu === 'line-jahit' && (
      <>
      {/* Tabel Line Jahit — full width */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06]">
        <div className="rounded-t-2xl px-4 py-2 bg-white text-slate-800 border-b border-slate-200 font-bold text-sm tracking-wide">
          BULAN {monthLabel}
        </div>
        <table className="w-full min-w-[720px] text-sm border-collapse">
          <thead style={{ position: 'sticky', top: 0, zIndex: 40 }}>
            <tr className="text-slate-800">
              <th rowSpan={3} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold w-24 align-middle">TANGGAL</th>
              <th rowSpan={3} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold align-middle">CUSTOMER</th>
              <th colSpan={paketCount * 2} className="bg-orange-100 border border-slate-300 px-2 py-2 text-center font-bold">PAKET</th>
              <th rowSpan={3} className="bg-emerald-100 border border-slate-300 px-2 py-2 text-center font-bold w-20 align-middle">TARGET</th>
              <th rowSpan={3} className="bg-sky-100 border border-slate-300 px-2 py-2 text-center font-bold w-20 align-middle">REALISASI</th>
              <th rowSpan={3} className="bg-amber-100 border border-slate-300 px-2 py-2 text-center font-bold w-20 align-middle">SELISIH</th>
            </tr>
            <tr className="text-slate-800">
              {paketList.map(p => {
                const c = paketColor(p.urutan);
                return (
                  <th key={p.id} colSpan={2} className={`${c.tableHead} border border-slate-300 px-2 py-1.5 text-center font-semibold`}>
                    <div className="leading-tight">{p.nama}</div>
                    <div className="text-[9px] font-normal text-slate-500 leading-tight">
                      {fmtPoin(poinAtasan(p))} / {fmtPoin(poinCelana(p))} poin
                    </div>
                  </th>
                );
              })}
            </tr>
            <tr className="text-slate-700 text-xs">
              {paketList.flatMap(p => {
                const c = paketColor(p.urutan);
                return [
                  <th key={`${p.id}-a`} className={`${c.tableSub} border border-slate-300 px-1.5 py-1 text-center font-medium w-16`}>ATASAN</th>,
                  <th key={`${p.id}-c`} className={`${c.tableSub} border border-slate-300 px-1.5 py-1 text-center font-medium w-16`}>CELANA</th>,
                ];
              })}
            </tr>
          </thead>
          <tbody>
            {Object.keys(groupedByDate).length === 0 ? (
              <tr>
                <td colSpan={bodyColCount} className="border border-slate-300 px-3 py-8 text-center text-sm text-slate-500 bg-white">
                  Belum ada data untuk bulan ini.
                </td>
              </tr>
            ) : (
              Object.entries(groupedByDate).map(([date, group]) => (
                group.map((r, i) => (
                  <tr key={r.id} className="bg-white text-slate-800 text-sm">
                    {i === 0 && (
                      <td rowSpan={group.length} className="border border-slate-300 px-2 py-2 text-center text-slate-700 font-medium align-middle">
                        {fmtDayShort(date)}
                      </td>
                    )}
                    <td className="border border-slate-300 px-2 py-1 text-slate-700">{r.customer}</td>
                    {paketList.flatMap(p => {
                      const keyA = `${p.kolom_prefix}_atasan`;
                      const keyC = `${p.kolom_prefix}_celana`;
                      const vA = Number(r[keyA]) || 0;
                      const vC = Number(r[keyC]) || 0;
                      return [
                        <td key={`${p.id}-a`} className="border border-slate-300 px-1 py-1 text-center tabular-nums">
                          {vA > 0 ? vA : <span className="text-slate-300">—</span>}
                        </td>,
                        <td key={`${p.id}-c`} className="border border-slate-300 px-1 py-1 text-center tabular-nums">
                          {vC > 0 ? vC : <span className="text-slate-300">—</span>}
                        </td>,
                      ];
                    })}
                    {i === 0 && (
                      <td rowSpan={group.length} className="border border-slate-300 px-2 py-1 text-center align-middle tabular-nums font-semibold text-emerald-700 bg-emerald-50/40">
                        {(targetByDate[date] || 0) > 0
                          ? fmtPoin(targetByDate[date])
                          : <span className="text-slate-300 font-normal">—</span>}
                      </td>
                    )}
                    {i === 0 && (() => {
                      const totalRp = group.reduce((s, gr) => s + realisasiPoin(gr, paketList), 0);
                      return (
                        <td rowSpan={group.length} className="border border-slate-300 px-2 py-1 text-center align-middle tabular-nums font-semibold text-sky-700 bg-sky-50/40">
                          {totalRp > 0 ? fmtPoin(totalRp) : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                      );
                    })()}
                    {i === 0 && (() => {
                      const tgt = targetByDate[date] || 0;
                      const totalRp = group.reduce((s, gr) => s + realisasiPoin(gr, paketList), 0);
                      if (tgt === 0 && totalRp === 0) {
                        return (
                          <td rowSpan={group.length} className="border border-slate-300 px-2 py-1 text-center align-middle text-slate-300">—</td>
                        );
                      }
                      const diff = totalRp - tgt;
                      const isPositive = diff >= 0;
                      const cls = isPositive
                        ? 'bg-emerald-50/60 text-emerald-700'
                        : 'bg-rose-50/60 text-rose-700';
                      const sign = isPositive ? '+' : '−';
                      return (
                        <td rowSpan={group.length} className={`border border-slate-300 px-2 py-1 text-center align-middle tabular-nums font-bold ${cls}`}>
                          {sign}{fmtPoin(Math.abs(diff))}
                        </td>
                      );
                    })()}
                  </tr>
                ))
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-yellow-200 text-slate-900 text-sm font-bold">
                <td colSpan={2} className="border border-slate-400 px-3 py-2 text-center uppercase tracking-wide">Total</td>
                {paketList.flatMap(p => {
                  const s = summary.per[p.id] || { atasan: 0, celana: 0 };
                  return [
                    <td key={`${p.id}-a`} className="border border-slate-400 px-2 py-2 text-center">{s.atasan}</td>,
                    <td key={`${p.id}-c`} className="border border-slate-400 px-2 py-2 text-center">{s.celana}</td>,
                  ];
                })}
                <td className="border border-slate-400 px-2 py-2 text-center tabular-nums text-emerald-800">
                  {fmtPoin(Object.values(targetByDate).reduce((a, b) => a + b, 0))}
                </td>
                <td className="border border-slate-400 px-2 py-2 text-center tabular-nums text-sky-800">
                  {fmtPoin(rows.reduce((s, r) => s + realisasiPoin(r, paketList), 0))}
                </td>
                {(() => {
                  const totalTgt = Object.values(targetByDate).reduce((a, b) => a + b, 0);
                  const totalRp = rows.reduce((s, r) => s + realisasiPoin(r, paketList), 0);
                  const diff = totalRp - totalTgt;
                  const isPositive = diff >= 0;
                  const cls = isPositive ? 'text-emerald-800' : 'text-rose-800';
                  const sign = isPositive ? '+' : '−';
                  return (
                    <td className={`border border-slate-400 px-2 py-2 text-center tabular-nums ${cls}`}>
                      {sign}{fmtPoin(Math.abs(diff))}
                    </td>
                  );
                })()}
              </tr>
              {(() => {
                const totalTgt = Object.values(targetByDate).reduce((a, b) => a + b, 0);
                const totalRp = rows.reduce((s, r) => s + realisasiPoin(r, paketList), 0);
                const diffPoin = totalRp - totalTgt;
                const tgtRupiah = totalTgt * BASE_RATE_POIN;
                const realRupiah = totalRp * BASE_RATE_POIN;
                const diffRupiah = diffPoin * BASE_RATE_POIN;
                const isPositive = diffRupiah >= 0;
                const sign = isPositive ? '+' : '−';
                return (
                  <tr className="bg-yellow-100 text-slate-800 text-xs font-semibold">
                    <td colSpan={2 + paketCount * 2} className="border border-slate-400 px-3 py-2 text-right uppercase tracking-wide">Total (Rp)</td>
                    <td className="border border-slate-400 px-2 py-2 text-center tabular-nums text-emerald-700">{fmtRupiah(tgtRupiah)}</td>
                    <td className="border border-slate-400 px-2 py-2 text-center tabular-nums text-sky-700">{fmtRupiah(realRupiah)}</td>
                    <td className={`border border-slate-400 px-2 py-2 text-center tabular-nums ${isPositive ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {sign}{fmtRupiah(Math.abs(diffRupiah))}
                    </td>
                  </tr>
                );
              })()}
            </tfoot>
          )}
        </table>
      </div>

      {/* Summary panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-2xl overflow-hidden border border-white/[0.06]">
          <div className="bg-yellow-200 text-slate-800 text-center py-2 font-bold text-sm">
            PENJAHIT INTERNAL BULAN {monthLabel.split(' ')[0]}
          </div>
          <table className="w-full text-sm bg-white text-slate-800">
            <tbody>
              {paketList.map(p => {
                const c = paketColor(p.urutan);
                const s = summary.per[p.id] || { atasan: 0, celana: 0 };
                return (
                  <FragmentRow key={p.id} paket={p} palette={c} atasan={s.atasan} celana={s.celana} />
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl overflow-hidden border border-orange-500/40">
          <div className="bg-orange-400 text-slate-900 text-center py-2 font-bold text-sm uppercase tracking-wider">
            Grand Total
          </div>
          <table className="w-full text-sm bg-orange-100 text-slate-900">
            <tbody>
              <tr>
                <td className="border border-orange-300 px-3 py-2 font-semibold">GRAND TOTAL ATASAN</td>
                <td className="border border-orange-300 px-3 py-2 text-right font-bold tabular-nums">{summary.grandAtasan}</td>
              </tr>
              <tr>
                <td className="border border-orange-300 px-3 py-2 font-semibold">GRAND TOTAL CELANA</td>
                <td className="border border-orange-300 px-3 py-2 text-right font-bold tabular-nums">{summary.grandCelana}</td>
              </tr>
              <tr>
                <td className="border border-orange-300 px-3 py-2 font-bold uppercase">Grand Total</td>
                <td className="border border-orange-300 px-3 py-2 text-right font-bold tabular-nums text-lg">{summary.grandTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {activeMenu === 'kedatangan' && (
        <KedatanganReadOnlyView monthLabel={monthLabel} attendance={attendance} />
      )}
    </div>
  );
}

function FragmentRow({ paket, palette, atasan, celana }: {
  paket: Paket;
  palette: typeof PAKET_PALETTE[number];
  atasan: number;
  celana: number;
}) {
  return (
    <>
      <tr>
        <td rowSpan={2} className={`${palette.tableHead} border border-slate-300 px-3 py-2 font-bold text-center align-middle`}>{paket.nama}</td>
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

function KedatanganReadOnlyView({ monthLabel, attendance }: {
  monthLabel: string;
  attendance: Attendance[];
}) {
  const totalStandar = attendance.reduce((s, r) => s + (Number(r.jumlah_standar) || 0), 0);
  const totalSpecial = attendance.reduce((s, r) => s + (Number(r.jumlah_special) || 0), 0);
  const gajiStandar = totalStandar * GAJI_STANDAR_PER_HARI;
  const gajiSpecial = totalSpecial * GAJI_SPECIAL_PER_HARI;
  const grandGaji = gajiStandar + gajiSpecial;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-5 items-start">
        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-4 space-y-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Rate Gaji Harian</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3">
              <p className="text-[10px] text-yellow-300 font-semibold uppercase tracking-wider">Standar</p>
              <p className="text-sm text-white font-bold mt-1 tabular-nums">{fmtRupiah(GAJI_STANDAR_PER_HARI)}</p>
              <p className="text-[10px] text-slate-500">per hari</p>
            </div>
            <div className="rounded-lg bg-pink-500/10 border border-pink-500/30 p-3">
              <p className="text-[10px] text-pink-300 font-semibold uppercase tracking-wider">Special</p>
              <p className="text-sm text-white font-bold mt-1 tabular-nums">{fmtRupiah(GAJI_SPECIAL_PER_HARI)}</p>
              <p className="text-[10px] text-slate-500">per hari</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          <div className="px-4 py-2 bg-violet-200 text-slate-800 border-b border-slate-200 font-bold text-sm tracking-wide text-center">
            KEDATANGAN PENJAHIT · {monthLabel}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm bg-white text-slate-800 border-collapse">
              <thead>
                <tr className="text-[11px] text-slate-700 uppercase tracking-wide">
                  <th className="bg-violet-100 border border-slate-300 px-2 py-1.5 text-center font-semibold">Tanggal</th>
                  <th className="bg-violet-50 border border-slate-300 px-2 py-1.5 text-center font-semibold">Standar</th>
                  <th className="bg-violet-50 border border-slate-300 px-2 py-1.5 text-center font-semibold">Special</th>
                  <th className="bg-violet-100 border border-slate-300 px-2 py-1.5 text-right font-semibold">Gaji Hari Itu</th>
                </tr>
              </thead>
              <tbody>
                {attendance.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="border border-slate-300 px-3 py-6 text-center text-xs text-slate-500">
                      Belum ada catatan kedatangan bulan ini.
                    </td>
                  </tr>
                ) : (
                  attendance.map(r => {
                    const nS = Number(r.jumlah_standar) || 0;
                    const nSp = Number(r.jumlah_special) || 0;
                    const gaji = nS * GAJI_STANDAR_PER_HARI + nSp * GAJI_SPECIAL_PER_HARI;
                    return (
                      <tr key={r.id}>
                        <td className="border border-slate-300 px-2 py-1.5 text-center font-medium text-slate-700">{fmtDayShort(r.tanggal)}</td>
                        <td className="border border-slate-300 px-2 py-1.5 text-center tabular-nums">{nS > 0 ? nS : <span className="text-slate-300">—</span>}</td>
                        <td className="border border-slate-300 px-2 py-1.5 text-center tabular-nums">{nSp > 0 ? nSp : <span className="text-slate-300">—</span>}</td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700">{fmtRupiah(gaji)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {attendance.length > 0 && (
                <tfoot>
                  <tr className="bg-violet-200 text-slate-900 font-bold text-xs">
                    <td className="border border-slate-400 px-2 py-2 text-center uppercase">Total</td>
                    <td className="border border-slate-400 px-2 py-2 text-center tabular-nums">{totalStandar}</td>
                    <td className="border border-slate-400 px-2 py-2 text-center tabular-nums">{totalSpecial}</td>
                    <td className="border border-slate-400 px-2 py-2 text-right tabular-nums text-emerald-800">{fmtRupiah(grandGaji)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden border border-violet-500/40">
        <div className="bg-violet-400 text-slate-900 text-center py-2 font-bold text-sm uppercase tracking-wider">
          Total Gaji Penjahit Bulan {monthLabel.split(' ')[0]}
        </div>
        <table className="w-full text-sm bg-violet-50 text-slate-900">
          <tbody>
            <tr>
              <td className="border border-violet-200 px-3 py-2 font-semibold">Standar ({totalStandar} kedatangan × Rp 100.000)</td>
              <td className="border border-violet-200 px-3 py-2 text-right font-bold tabular-nums w-56">{fmtRupiah(gajiStandar)}</td>
            </tr>
            <tr>
              <td className="border border-violet-200 px-3 py-2 font-semibold">Special ({totalSpecial} kedatangan × Rp 160.000)</td>
              <td className="border border-violet-200 px-3 py-2 text-right font-bold tabular-nums">{fmtRupiah(gajiSpecial)}</td>
            </tr>
            <tr>
              <td className="border border-violet-300 bg-violet-200 px-3 py-2 font-bold uppercase">Grand Total Gaji</td>
              <td className="border border-violet-300 bg-violet-200 px-3 py-2 text-right font-bold tabular-nums text-lg">{fmtRupiah(grandGaji)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
