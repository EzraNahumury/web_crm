'use client';

// Finance · Laporan Produksi Harian.
// Permintaan finance: laporan WO yang sudah jalan produksi — mis. "div Printing
// sudah memproses WO a,b,c,d; div Press WO a,b; dst sampai divisi akhir".
//
// Sumber data: wo_progress (status SELESAI + completed_at) × production_stages.
// Untuk rentang tanggal terpilih, tiap divisi (stage) menampilkan WO yang
// stage-nya DISELESAIKAN pada periode itu. Divisi diurut sesuai alur produksi.
//
// Opsi:
//   - Tanggal: Harian (1 hari) atau Periode (dari–sampai).
//   - Jenis  : Rincian (daftar WO per divisi) atau Rekap (jumlah WO + total qty
//              jersey per divisi).
// Read-only.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet } from '@/lib/api-db';
import { buildAksesorisSet } from '@/lib/qty-aksesoris';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Tanggal kalender WIB (Asia/Jakarta) dari sebuah nilai waktu → 'YYYY-MM-DD'.
function wibDate(value: unknown): string {
  if (!value) return '';
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return String(value).slice(0, 10);
  try { return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); } catch { return String(value).slice(0, 10); }
}
function wibTime(value: unknown): string {
  if (!value) return '';
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return '';
  try { return d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}
function todayWIB(): string {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); }
  catch { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }
}
function shiftDate(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function fmtPanjang(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${HARI[dow]}, ${d} ${BULAN[m - 1]} ${y}`;
}
function fmtPendek(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${BULAN[m - 1].slice(0, 3)} ${y}`;
}

interface WoInfo { id: number; no_wo: string; customer: string; qty: number; paket: string }
interface StageInfo { id: number; nama: string; urutan: number }
interface DivisionGroup { stage: StageInfo; items: { wo: WoInfo; date: string; time: string }[] }

export default function LaporanProduksiHarianPage() {
  const [mode, setMode] = useState<'harian' | 'periode'>('harian');
  const [view, setView] = useState<'rincian' | 'rekap'>('rincian');
  const [date, setDate] = useState(todayWIB());     // mode harian
  const [from, setFrom] = useState(todayWIB());      // mode periode
  const [to, setTo] = useState(todayWIB());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [woById, setWoById] = useState<Map<number, WoInfo>>(new Map());
  const [stagesById, setStagesById] = useState<Map<number, StageInfo>>(new Map());
  const [progress, setProgress] = useState<Row[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [wos, orders, items, barangCs, stages, prog] = await Promise.all([
        dbGet('work_orders'),
        dbGet('orders'),
        dbGet('order_items'),
        dbGet('barang_cs').catch(() => []),
        dbGet('production_stages'),
        dbGet('wo_progress'),
      ]);
      const aksesorisSet = buildAksesorisSet(barangCs as Row[]);
      const orderMap: Record<string, Row> = {};
      for (const o of orders as Row[]) orderMap[String(o.id)] = o;
      const itemsByOrder: Record<string, { paket: string[]; qty: number }> = {};
      for (const it of items as Row[]) {
        const key = String(it.order_id);
        if (!itemsByOrder[key]) itemsByOrder[key] = { paket: [], qty: 0 };
        if (it.paket_nama) itemsByOrder[key].paket.push(String(it.paket_nama));
        const nama = String(it.paket_nama || '').trim().toLowerCase();
        if (!aksesorisSet.has(nama)) itemsByOrder[key].qty += Number(it.qty) || 0;
      }
      const wm = new Map<number, WoInfo>();
      for (const w of wos as Row[]) {
        const ord = orderMap[String(w.order_id)];
        const oi = itemsByOrder[String(w.order_id)];
        wm.set(Number(w.id), {
          id: Number(w.id),
          no_wo: String(w.no_wo || ''),
          customer: String(ord?.customer_nama || w.customer_nama || '-'),
          qty: oi ? oi.qty : (Number(w.jumlah) || 0),
          paket: oi ? oi.paket.join(', ') : String(w.paket || '-'),
        });
      }
      setWoById(wm);
      const sm = new Map<number, StageInfo>();
      for (const s of stages as Row[]) sm.set(Number(s.id), { id: Number(s.id), nama: String(s.nama || ''), urutan: Number(s.urutan) || 0 });
      setStagesById(sm);
      setProgress(prog as Row[]);
    } catch { setWoById(new Map()); setStagesById(new Map()); setProgress([]); }
    setLoading(false);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Predikat tanggal sesuai mode (harian = 1 hari; periode = [from,to]).
  const matchDate = useCallback((iso: string): boolean => {
    if (!iso) return false;
    if (mode === 'harian') return iso === date;
    if (from && iso < from) return false;
    if (to && iso > to) return false;
    return true;
  }, [mode, date, from, to]);

  // Grup per divisi (stage): WO yang stage-nya SELESAI pada rentang terpilih.
  const groups = useMemo<DivisionGroup[]>(() => {
    const byStage = new Map<number, DivisionGroup>();
    for (const p of progress) {
      if (String(p.status || '').toUpperCase() !== 'SELESAI') continue;
      const d = wibDate(p.completed_at);
      if (!matchDate(d)) continue;
      const stage = stagesById.get(Number(p.stage_id));
      const wo = woById.get(Number(p.work_order_id));
      if (!stage || !wo) continue;
      if (!byStage.has(stage.id)) byStage.set(stage.id, { stage, items: [] });
      byStage.get(stage.id)!.items.push({ wo, date: d, time: wibTime(p.completed_at) });
    }
    const out = Array.from(byStage.values());
    for (const g of out) g.items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.wo.no_wo.localeCompare(b.wo.no_wo));
    out.sort((a, b) => a.stage.urutan - b.stage.urutan);
    return out;
  }, [progress, stagesById, woById, matchDate]);

  // Filter pencarian (WO / customer / paket) — sembunyikan divisi kosong.
  const filteredGroups = useMemo<DivisionGroup[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map(g => ({ stage: g.stage, items: g.items.filter(it =>
        it.wo.no_wo.toLowerCase().includes(q)
        || it.wo.customer.toLowerCase().includes(q)
        || it.wo.paket.toLowerCase().includes(q)) }))
      .filter(g => g.items.length > 0);
  }, [groups, search]);

  // Rekap per divisi: jumlah WO unik + total qty jersey (qty dihitung sekali
  // per WO walau ada beberapa baris progress).
  const rekap = useMemo(() => filteredGroups.map(g => {
    const seen = new Set<number>();
    let count = 0, qty = 0;
    for (const it of g.items) {
      if (seen.has(it.wo.id)) continue;
      seen.add(it.wo.id); count++; qty += it.wo.qty || 0;
    }
    return { stage: g.stage, count, qty };
  }), [filteredGroups]);

  const rekapTotal = useMemo(() => ({
    count: rekap.reduce((s, r) => s + r.count, 0),
    qty: rekap.reduce((s, r) => s + r.qty, 0),
  }), [rekap]);

  const totalPenyelesaian = useMemo(() => filteredGroups.reduce((s, g) => s + g.items.length, 0), [filteredGroups]);
  const totalWoUnik = useMemo(() => {
    const set = new Set<number>();
    for (const g of filteredGroups) for (const it of g.items) set.add(it.wo.id);
    return set.size;
  }, [filteredGroups]);
  const totalQtyUnik = useMemo(() => {
    const set = new Set<number>(); let qty = 0;
    for (const g of filteredGroups) for (const it of g.items) { if (set.has(it.wo.id)) continue; set.add(it.wo.id); qty += it.wo.qty || 0; }
    return qty;
  }, [filteredGroups]);

  const isTodayHarian = mode === 'harian' && date === todayWIB();
  const periodeLabel = mode === 'harian' ? fmtPanjang(date) : `${fmtPendek(from)} – ${fmtPendek(to)}`;

  const tabBtn = (active: boolean) => `px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${active ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'}`;
  const inputCls = 'bg-white/[0.03] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500/40 date-input';

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-emerald-500/[0.14] via-teal-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border border-emerald-500/25 grid place-items-center shrink-0">
                <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" /></svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Laporan Produksi Harian</h1>
                <p className="text-[13px] text-slate-300 mt-0.5">
                  WO yang sudah diproses tiap divisi — <span className="text-emerald-300 font-medium">{periodeLabel}</span>.
                </p>
              </div>
            </div>
            <div className="relative w-full lg:w-64">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari WO, customer, paket..."
                className="w-full bg-white/[0.03] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-emerald-500/40" />
            </div>
          </div>

          {/* Kontrol: mode tanggal + jenis laporan + input tanggal */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0d1117] border border-white/[0.06]">
              <button onClick={() => setMode('harian')} className={tabBtn(mode === 'harian')}>Harian</button>
              <button onClick={() => setMode('periode')} className={tabBtn(mode === 'periode')}>Periode</button>
            </div>

            {mode === 'harian' ? (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setDate(d => shiftDate(d, -1))} title="Hari sebelumnya" className="w-9 h-9 grid place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]">‹</button>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
                <button onClick={() => setDate(d => shiftDate(d, 1))} title="Hari berikutnya" className="w-9 h-9 grid place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]">›</button>
                <button onClick={() => setDate(todayWIB())} disabled={isTodayHarian} className="text-xs font-medium text-slate-300 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-40 transition-colors">Hari Ini</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className={inputCls} />
                <span className="text-slate-500 text-xs">s/d</span>
                <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className={inputCls} />
                <button onClick={() => { const t = todayWIB(); setFrom(t); setTo(t); }} className="text-xs font-medium text-slate-300 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors">Hari Ini</button>
              </div>
            )}

            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0d1117] border border-white/[0.06] sm:ml-auto">
              <button onClick={() => setView('rincian')} className={tabBtn(view === 'rincian')}>Rincian</button>
              <button onClick={() => setView('rekap')} className={tabBtn(view === 'rekap')}>Rekap</button>
            </div>
          </div>

          {/* Ringkasan */}
          <div className="flex items-center gap-4 flex-wrap text-[13px]">
            <span className="text-slate-300">Divisi aktif: <span className="text-white font-bold tabular-nums">{filteredGroups.length}</span></span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-300">Penyelesaian: <span className="text-white font-bold tabular-nums">{totalPenyelesaian}</span></span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-300">WO unik: <span className="text-white font-bold tabular-nums">{totalWoUnik}</span></span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-300">Total qty jersey: <span className="text-white font-bold tabular-nums">{totalQtyUnik}</span></span>
          </div>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] px-5 py-16 text-center text-sm text-slate-500">Memuat data…</div>
      ) : filteredGroups.length === 0 ? (
        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] px-5 py-16 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-transparent border border-emerald-500/20 grid place-items-center">
              <svg className="w-6 h-6 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <p className="text-sm text-slate-300 font-medium">{search ? 'Tidak ada WO yang cocok' : 'Belum ada WO yang diselesaikan divisi pada periode ini'}</p>
            <p className="text-xs text-slate-500 max-w-xs">Pilih tanggal/periode lain, atau pastikan operator sudah menekan "Selesai &amp; Lanjut" di menu Produksi.</p>
          </div>
        </div>
      ) : view === 'rekap' ? (
        /* ── REKAP ── jumlah WO + total qty jersey per divisi ── */
        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06] bg-white/[0.015] text-sm font-bold text-white">Rekap per Divisi</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] text-slate-500 font-semibold uppercase tracking-widest">
                  <th className="text-left px-5 py-3">Divisi</th>
                  <th className="text-right px-5 py-3">Jumlah WO</th>
                  <th className="text-right px-5 py-3">Total Qty Jersey</th>
                </tr>
              </thead>
              <tbody>
                {rekap.map(r => (
                  <tr key={r.stage.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 shrink-0" />
                        <span className="text-sm text-white font-medium">{r.stage.nama}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm text-slate-200 font-semibold tabular-nums">{r.count}</td>
                    <td className="px-5 py-3.5 text-right text-sm text-emerald-300 font-semibold tabular-nums">{r.qty}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10 bg-white/[0.03] font-bold">
                  <td className="px-5 py-3.5 text-sm text-white uppercase tracking-wide">Total</td>
                  <td className="px-5 py-3.5 text-right text-sm text-white tabular-nums">{rekapTotal.count}</td>
                  <td className="px-5 py-3.5 text-right text-sm text-emerald-300 tabular-nums">{rekapTotal.qty}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="px-5 py-2.5 border-t border-white/[0.06] text-[11px] text-slate-500">
            Catatan: baris Total menjumlahkan tiap divisi — satu WO dihitung di tiap divisi yang memprosesnya. WO unik keseluruhan: <span className="text-slate-300 font-semibold tabular-nums">{totalWoUnik}</span> · qty <span className="text-slate-300 font-semibold tabular-nums">{totalQtyUnik}</span>.
          </div>
        </div>
      ) : (
        /* ── RINCIAN ── daftar WO per divisi ── */
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredGroups.map(g => (
            <div key={g.stage.id} className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-white/[0.06] bg-white/[0.015]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 shrink-0" />
                  <h2 className="text-sm font-bold text-white truncate">{g.stage.nama}</h2>
                </div>
                <span className="shrink-0 text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1 tabular-nums">{g.items.length} WO</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px]">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[10px] text-slate-500 font-semibold uppercase tracking-widest">
                      <th className="text-left px-4 py-2.5">No WO</th>
                      <th className="text-left px-4 py-2.5">Customer</th>
                      <th className="text-left px-4 py-2.5">Paket</th>
                      <th className="text-right px-4 py-2.5">Qty</th>
                      <th className="text-right px-4 py-2.5">{mode === 'periode' ? 'Tgl/Jam' : 'Jam'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((it, i) => (
                      <tr key={`${it.wo.id}-${i}`} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-sm text-blue-300 font-semibold whitespace-nowrap">{it.wo.no_wo}</td>
                        <td className="px-4 py-2.5 text-sm text-white truncate max-w-[180px]" title={it.wo.customer}>{it.wo.customer}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[200px]"><span className="line-clamp-1" title={it.wo.paket}>{it.wo.paket || '-'}</span></td>
                        <td className="px-4 py-2.5 text-right text-sm text-slate-300 tabular-nums">{it.wo.qty > 0 ? it.wo.qty : '-'}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">{mode === 'periode' ? `${fmtPendek(it.date).replace(/ \d{4}$/, '')} ${it.time}` : (it.time || '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
