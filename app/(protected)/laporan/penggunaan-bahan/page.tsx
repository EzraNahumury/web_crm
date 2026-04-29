'use client';
import { useState, useEffect, useMemo } from 'react';
import { dbGet } from '@/lib/api-db';
import DateRangePicker, { today, formatPeriod } from '../date-range-picker';
import { Pagination, paginate, DEFAULT_PAGE_SIZE } from '@/lib/pagination';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const KATEGORI_LABEL: Record<string, string> = {
  BAHAN_UTAMA: 'Bahan Utama',
  AKSESORIS: 'Aksesoris',
  MATERIAL_TAMBAHAN: 'Material Tambahan',
};

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

export default function PenggunaanBahanPage() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [gudang, setGudang] = useState<Row[]>([]);
  const [wos, setWos] = useState<Row[]>([]);
  const [barangList, setBarangList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [aggPage, setAggPage] = useState(1);
  const [rincianPage, setRincianPage] = useState(1);

  async function fetchData() {
    setLoading(true);
    try {
      const [g, w, b] = await Promise.all([
        dbGet('wo_permintaan_gudang'),
        dbGet('work_orders'),
        dbGet('barang'),
      ]);
      setGudang(g);
      setWos(w);
      setBarangList(b);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const periode = formatPeriod(from, to);

  // Filter gudang rows by parent WO's created_at within [from, to]
  const filtered = useMemo<Row[]>(() => {
    const fromTs = new Date(from + 'T00:00:00').getTime();
    const toTs = new Date(to + 'T23:59:59').getTime();
    return gudang
      .map((g: Row) => ({ ...g, wo: wos.find((w: Row) => String(w.id) === String(g.work_order_id)) }))
      .filter((g: Row) => {
        if (!g.wo) return false;
        const ts = new Date(g.wo.created_at).getTime();
        return ts >= fromTs && ts <= toTs;
      });
  }, [gudang, wos, from, to]);

  const totalWO = useMemo(() => new Set(filtered.map(r => r.work_order_id)).size, [filtered]);
  const totalRecords = filtered.length;

  // Reset to page 1 whenever the filter changes
  useEffect(() => { setAggPage(1); setRincianPage(1); }, [from, to, gudang.length]);

  // Aggregate by bahan name + satuan
  const aggregated = useMemo(() => {
    const map = new Map<string, { bahan: string; kategori: string; total: number; satuan: string }>();
    for (const r of filtered) {
      const b = barangList.find((bb: Row) => String(bb.nama || '').trim().toLowerCase() === String(r.bahan || '').trim().toLowerCase());
      const satuan = b?.satuan || 'PCS';
      const key = `${r.bahan}__${r.kategori}`;
      const existing = map.get(key);
      if (existing) existing.total += Number(r.kuantitas || 0);
      else map.set(key, { bahan: r.bahan, kategori: r.kategori, total: Number(r.kuantitas || 0), satuan });
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered, barangList]);

  // Pagination slices
  const agg = paginate(aggregated, aggPage);
  const rincian = paginate(filtered, rincianPage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Laporan Penggunaan Bahan</h1>
          <p className="text-sm text-slate-400 mt-1">Rekapitulasi permintaan bahan per Work Order</p>
        </div>
        <DateRangePicker from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      </div>

      {/* Periode badge */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
        Periode: {periode}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-700/50 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Work Order</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-white">{totalWO}</span>
                <span className="text-xs text-slate-500 uppercase">WO</span>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Item Bahan</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-white">{totalRecords}</span>
                <span className="text-xs text-slate-500 uppercase">RECORDS</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Aggregate per bahan */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-bold text-white">Total per Bahan</h2>
        </div>
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">Memuat...</div>
        ) : aggregated.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">Tidak ada data penggunaan bahan pada periode ini.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead><tr className="border-b border-white/[0.06]">
                  {['NAMA BAHAN', 'KATEGORI', 'TOTAL', 'SATUAN'].map(h => (
                    <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-6 py-3 uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {agg.slice.map((a, i) => (
                    <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-6 py-3 text-sm font-medium text-white">{a.bahan}</td>
                      <td className="px-6 py-3"><span className="text-xs text-slate-400 bg-white/[0.06] px-2 py-1 rounded">{KATEGORI_LABEL[a.kategori] || a.kategori}</span></td>
                      <td className="px-6 py-3 text-sm font-bold text-emerald-400">{a.total}</td>
                      <td className="px-6 py-3 text-sm text-slate-400">{a.satuan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination current={agg.current} total={agg.total} count={agg.count} onChange={setAggPage} />
          </>
        )}
      </div>

      {/* Rincian per WO */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-bold text-white">Rincian Penggunaan</h2>
        </div>
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">Memuat...</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">Tidak ada data penggunaan bahan pada periode ini.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead><tr className="border-b border-white/[0.06]">
                  {['NO WO', 'CUSTOMER', 'KATEGORI', 'BAGIAN', 'BAHAN', 'WARNA', 'QTY'].map(h => (
                    <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-6 py-3 uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {rincian.slice.map((r, i) => {
                    const b = barangList.find((bb: Row) => String(bb.nama || '').trim().toLowerCase() === String(r.bahan || '').trim().toLowerCase());
                    const satuan = b?.satuan || 'PCS';
                    return (
                      <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="px-6 py-3 text-sm font-medium text-blue-400">{r.wo?.no_wo || '-'}</td>
                        <td className="px-6 py-3 text-sm text-white">{r.wo?.customer_nama || '-'}</td>
                        <td className="px-6 py-3"><span className="text-xs text-slate-400 bg-white/[0.06] px-2 py-1 rounded">{KATEGORI_LABEL[r.kategori] || r.kategori}</span></td>
                        <td className="px-6 py-3 text-sm text-emerald-400">{r.bagian}</td>
                        <td className="px-6 py-3 text-sm text-white">{r.bahan}</td>
                        <td className="px-6 py-3 text-sm text-slate-400">{r.warna || '-'}</td>
                        <td className="px-6 py-3 text-sm font-medium text-slate-300">{r.kuantitas} {satuan}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination current={rincian.current} total={rincian.total} count={rincian.count} onChange={setRincianPage} />
          </>
        )}
      </div>
    </div>
  );
}
