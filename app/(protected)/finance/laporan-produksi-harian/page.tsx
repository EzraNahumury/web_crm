'use client';

// Finance · Laporan Produksi Harian.
// Permintaan finance: laporan WO yang sudah jalan produksi per harinya — mis.
// "hari ini div Printing sudah memproses WO a,b,c,d; div Press WO a,b; dst
// sampai divisi akhir".
//
// Sumber data: wo_progress (status SELESAI + completed_at) × production_stages.
// Untuk tanggal terpilih, tiap divisi (stage) menampilkan WO yang stage-nya
// DISELESAIKAN pada hari itu. Divisi diurut sesuai urutan produksi.
// Read-only.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet } from '@/lib/api-db';
import { buildAksesorisSet } from '@/lib/qty-aksesoris';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// Tanggal kalender WIB (Asia/Jakarta) dari sebuah nilai waktu, 'YYYY-MM-DD'.
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
function fmtTanggalPanjang(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${HARI[dow]}, ${d} ${BULAN[m - 1]} ${y}`;
}

interface WoInfo { id: number; no_wo: string; customer: string; qty: number; paket: string }
interface StageInfo { id: number; nama: string; urutan: number }
interface DivisionGroup { stage: StageInfo; items: { wo: WoInfo; time: string }[] }

export default function LaporanProduksiHarianPage() {
  const [date, setDate] = useState(todayWIB());
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

  // Grup per divisi (stage) untuk tanggal terpilih: WO yang stage-nya SELESAI
  // pada hari itu. Diurut per urutan produksi; item per jam selesai.
  const groups = useMemo<DivisionGroup[]>(() => {
    const byStage = new Map<number, DivisionGroup>();
    for (const p of progress) {
      if (String(p.status || '').toUpperCase() !== 'SELESAI') continue;
      if (wibDate(p.completed_at) !== date) continue;
      const stage = stagesById.get(Number(p.stage_id));
      const wo = woById.get(Number(p.work_order_id));
      if (!stage || !wo) continue;
      if (!byStage.has(stage.id)) byStage.set(stage.id, { stage, items: [] });
      byStage.get(stage.id)!.items.push({ wo, time: wibTime(p.completed_at) });
    }
    const out = Array.from(byStage.values());
    for (const g of out) g.items.sort((a, b) => a.time.localeCompare(b.time) || a.wo.no_wo.localeCompare(b.wo.no_wo));
    out.sort((a, b) => a.stage.urutan - b.stage.urutan);
    return out;
  }, [progress, stagesById, woById, date]);

  // Filter pencarian (WO / customer / paket) — sembunyikan divisi yang kosong.
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

  const totalPenyelesaian = useMemo(() => filteredGroups.reduce((s, g) => s + g.items.length, 0), [filteredGroups]);
  const totalWoUnik = useMemo(() => {
    const set = new Set<number>();
    for (const g of filteredGroups) for (const it of g.items) set.add(it.wo.id);
    return set.size;
  }, [filteredGroups]);

  const isToday = date === todayWIB();

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-emerald-500/[0.14] via-teal-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border border-emerald-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" /></svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Laporan Produksi Harian</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                WO yang sudah diproses tiap divisi pada <span className="text-emerald-300 font-medium">{fmtTanggalPanjang(date)}</span>.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setDate(d => shiftDate(d, -1))} title="Hari sebelumnya"
                className="w-9 h-9 grid place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]">‹</button>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="bg-white/[0.03] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500/40 date-input" />
              <button onClick={() => setDate(d => shiftDate(d, 1))} title="Hari berikutnya"
                className="w-9 h-9 grid place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]">›</button>
              <button onClick={() => setDate(todayWIB())} disabled={isToday}
                className="text-xs font-medium text-slate-300 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-40 transition-colors">Hari Ini</button>
            </div>
            <div className="relative w-full sm:w-64">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari WO, customer, paket..."
                className="w-full bg-white/[0.03] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-emerald-500/40" />
            </div>
          </div>
        </div>

        {/* Ringkasan */}
        <div className="relative mt-4 flex items-center gap-4 flex-wrap text-[13px]">
          <span className="text-slate-300">Divisi aktif: <span className="text-white font-bold tabular-nums">{filteredGroups.length}</span></span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-300">Penyelesaian: <span className="text-white font-bold tabular-nums">{totalPenyelesaian}</span></span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-300">WO unik: <span className="text-white font-bold tabular-nums">{totalWoUnik}</span></span>
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
            <p className="text-sm text-slate-300 font-medium">{search ? 'Tidak ada WO yang cocok' : 'Belum ada WO yang diselesaikan divisi pada tanggal ini'}</p>
            <p className="text-xs text-slate-500 max-w-xs">Pilih tanggal lain, atau pastikan operator sudah menekan "Selesai &amp; Lanjut" di menu Produksi.</p>
          </div>
        </div>
      ) : (
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
                      <th className="text-right px-4 py-2.5">Jam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((it, i) => (
                      <tr key={`${it.wo.id}-${i}`} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-sm text-blue-300 font-semibold whitespace-nowrap">{it.wo.no_wo}</td>
                        <td className="px-4 py-2.5 text-sm text-white truncate max-w-[180px]" title={it.wo.customer}>{it.wo.customer}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[200px]"><span className="line-clamp-1" title={it.wo.paket}>{it.wo.paket || '-'}</span></td>
                        <td className="px-4 py-2.5 text-right text-sm text-slate-300 tabular-nums">{it.wo.qty > 0 ? it.wo.qty : '-'}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-slate-500 tabular-nums">{it.time || '—'}</td>
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
