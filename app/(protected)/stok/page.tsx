'use client';
import { useState, useEffect, useMemo } from 'react';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { useToast } from '@/lib/toast';
import { Pagination, paginate } from '@/lib/pagination';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const SATUAN_OPTIONS = ['kg', 'roll', 'liter', 'meter', 'pcs'];
const LOW_STOCK_THRESHOLD = 20; // batas "barang akan habis"

function fmtDate(d: string) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; }
}

function fmtRp(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n || 0);
}

export default function StokPage() {
  const [tab, setTab] = useState<'overview' | 'aktual' | 'adjustment'>('overview');
  const [search, setSearch] = useState('');
  const [stokList, setStokList] = useState<Row[]>([]);
  const [adjustments, setAdjustments] = useState<Row[]>([]);
  const [barangList, setBarangList] = useState<Row[]>([]);
  const [tipeBarangList, setTipeBarangList] = useState<Row[]>([]);
  const [gudangList, setGudangList] = useState<Row[]>([]);
  const [woList, setWoList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state — 3 modal berbeda
  const [dataBarangOpen, setDataBarangOpen] = useState(false);
  const [masukOpen, setMasukOpen] = useState(false);
  const [keluarOpen, setKeluarOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [aktualPage, setAktualPage] = useState(1);
  const [adjPage, setAdjPage] = useState(1);
  const toast = useToast();

  useEffect(() => { setAktualPage(1); }, [search]);
  useEffect(() => { setAktualPage(1); setAdjPage(1); }, [tab]);

  async function fetchData() {
    try {
      const [s, a, b, tb, g, w] = await Promise.all([
        dbGet('stok').catch(() => []),
        dbGet('stok_adjustment').catch(() => []),
        dbGet('barang').catch(() => []),
        dbGet('tipe_barang').catch(() => []),
        dbGet('gudang').catch(() => []),
        dbGet('work_orders').catch(() => []),
      ]);
      setStokList(s);
      setAdjustments(a);
      setBarangList(b);
      setTipeBarangList(tb);
      setGudangList(g);
      setWoList(w);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  // Merge stok with barang for display + include kode/harga/letak
  const stokDisplay = useMemo(() => barangList.map(b => {
    const s = stokList.find((st: Row) => String(st.barang_id) === String(b.id));
    const qty = Number(s?.qty) || 0;
    const harga = Number(b.harga) || 0;
    return {
      id: b.id,
      kode: String(b.kode_barang || '') || `ID-${b.id}`,
      nama: String(b.nama || ''),
      jenis: b.tipe_nama || '-',
      qty,
      satuan: String(b.satuan || 'pcs'),
      harga,
      total: qty * harga,
      letak: String(b.letak || '-'),
      stokId: s?.id,
    };
  }), [barangList, stokList]);

  const filtered = useMemo(() => stokDisplay.filter(m =>
    !search || m.nama.toLowerCase().includes(search.toLowerCase())
      || m.kode.toLowerCase().includes(search.toLowerCase())
  ), [stokDisplay, search]);

  const aktualPaged = paginate(filtered, aktualPage);
  const adjPaged = paginate(adjustments, adjPage);

  // ─── Overview stats ───
  const totalMasuk = useMemo(
    () => adjustments.filter((a: Row) => String(a.tipe) === 'Penambahan').reduce((s, a) => s + Math.abs(Number(a.selisih) || 0), 0),
    [adjustments]
  );
  const totalKeluar = useMemo(
    () => adjustments.filter((a: Row) => ['Pengurangan', 'Pemakaian_WO'].includes(String(a.tipe))).reduce((s, a) => s + Math.abs(Number(a.selisih) || 0), 0),
    [adjustments]
  );
  const totalAllStok = useMemo(() => stokDisplay.reduce((s, m) => s + m.qty, 0), [stokDisplay]);

  // Total per gudang: sum semua qty barang yang `letak`-nya sama.
  const perGudang = useMemo(() => {
    const map: Record<string, number> = {};
    for (const g of gudangList) map[String(g.nama)] = 0;
    for (const m of stokDisplay) {
      const key = m.letak && m.letak !== '-' ? m.letak : '(Belum diset)';
      map[key] = (map[key] || 0) + m.qty;
    }
    return map;
  }, [gudangList, stokDisplay]);

  const barangAkanHabis = useMemo(
    () => stokDisplay.filter(m => m.qty <= LOW_STOCK_THRESHOLD).sort((a, b) => a.qty - b.qty).slice(0, 15),
    [stokDisplay]
  );

  // ─── PDF export ───
  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTableMod = await import('jspdf-autotable');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const autoTable = (autoTableMod as any).default;

      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const today = new Date();
      const dateStr = today.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

      // Header
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('LAPORAN STOK BAHAN', 14, 18);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`AYRES Production · Dibuat: ${dateStr}`, 14, 25);

      // Summary
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Ringkasan', 14, 35);
      autoTable(doc, {
        startY: 38,
        head: [['Metric', 'Nilai']],
        body: [
          ['Total Barang Masuk (kumulatif)', String(totalMasuk)],
          ['Total Barang Keluar (kumulatif)', String(totalKeluar)],
          ['Total Semua Gudang', String(totalAllStok)],
          ...Object.entries(perGudang).map(([g, n]) => [`  · ${g}`, String(n)]),
        ],
        theme: 'grid',
        headStyles: { fillColor: [15, 118, 110] },
        styles: { fontSize: 9 },
        margin: { left: 14, right: 14 },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let y = (doc as any).lastAutoTable.finalY + 8;

      // Data Barang lengkap
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Data Barang', 14, y);
      autoTable(doc, {
        startY: y + 3,
        head: [['Kode', 'Nama Barang', 'Jenis', 'Satuan', 'Harga', 'Stok', 'Total (Rp)', 'Letak']],
        body: stokDisplay.map(m => [
          m.kode, m.nama, m.jenis, m.satuan,
          fmtRp(m.harga), String(m.qty), fmtRp(m.total), m.letak,
        ]),
        theme: 'striped',
        headStyles: { fillColor: [30, 64, 175] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
        },
        margin: { left: 14, right: 14 },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 8;

      // Barang akan habis
      if (barangAkanHabis.length > 0) {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(180, 20, 20);
        doc.text(`⚠ Barang yang Akan Habis (≤ ${LOW_STOCK_THRESHOLD})`, 14, y);
        doc.setTextColor(0, 0, 0);
        autoTable(doc, {
          startY: y + 3,
          head: [['Kode', 'Nama Barang', 'Jenis', 'Satuan', 'Stok', 'Letak']],
          body: barangAkanHabis.map(m => [m.kode, m.nama, m.jenis, m.satuan, String(m.qty), m.letak]),
          theme: 'grid',
          headStyles: { fillColor: [220, 38, 38] },
          styles: { fontSize: 9 },
          margin: { left: 14, right: 14 },
        });
      }

      doc.save(`laporan-stok-${today.toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF Terunduh', 'Laporan stok berhasil diunduh.');
    } catch (e) {
      console.error(e);
      toast.error('Gagal Export PDF', String(e));
    }
    setDownloadingPdf(false);
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="grid grid-cols-3 gap-3">
        {[1,2,3].map(i => <div key={i} className="h-24 bg-white/[0.03] rounded-2xl animate-pulse" />)}
      </div>
      <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-teal-500/[0.14] via-emerald-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500/25 to-teal-500/5 border border-teal-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-teal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Aplikasi Persediaan Barang Gudang</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Manajemen stok bahan dengan kode SKU (Accurate). Total <strong className="text-white">{totalAllStok}</strong> barang di <strong className="text-white">{gudangList.length}</strong> gudang.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-red-500/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              {downloadingPdf ? 'Menyiapkan...' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs — pill style */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-2 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {[
            { key: 'overview' as const, label: 'Overview' },
            { key: 'aktual' as const, label: 'Data Barang' },
            { key: 'adjustment' as const, label: 'Riwayat Adjustment' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-xl text-[13px] font-medium whitespace-nowrap transition-all ${
                tab === t.key
                  ? 'text-white bg-gradient-to-b from-blue-500/25 to-blue-500/10 border border-blue-500/30 shadow-inner'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ OVERVIEW TAB ═══ */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {/* 3 stat cards utama */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              label="Barang Masuk"
              value={totalMasuk}
              accent="blue"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25L21 12m0 0l-5.25-5.25M21 12H3" /></svg>}
              onClick={() => setMasukOpen(true)}
            />
            <StatCard
              label="Barang Keluar"
              value={totalKeluar}
              accent="orange"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3.75 9.75M3.75 9.75L9 4.5M3.75 9.75H21" /></svg>}
              onClick={() => setKeluarOpen(true)}
            />
            <StatCard
              label="Total Semua Gudang"
              value={totalAllStok}
              accent="emerald"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>}
              onClick={() => setDataBarangOpen(true)}
            />
          </div>

          {/* Total per gudang — grid dinamis */}
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/25 grid place-items-center shrink-0">
                <svg className="w-4 h-4 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" /></svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Total per Gudang</h2>
                <p className="text-xs text-slate-500 mt-0.5">Ringkasan stok per lokasi penyimpanan</p>
              </div>
            </div>
            {Object.keys(perGudang).length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">Belum ada data gudang. Tambah di menu <strong className="text-white">Master → Gudang</strong>.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(perGudang).map(([g, n], i) => {
                  const palette = ['cyan', 'violet', 'amber', 'emerald', 'pink', 'sky'][i % 6];
                  const cls = palette === 'cyan' ? 'border-cyan-500/20 from-cyan-500/[0.08]'
                    : palette === 'violet' ? 'border-violet-500/20 from-violet-500/[0.08]'
                    : palette === 'amber' ? 'border-amber-500/20 from-amber-500/[0.08]'
                    : palette === 'emerald' ? 'border-emerald-500/20 from-emerald-500/[0.08]'
                    : palette === 'pink' ? 'border-pink-500/20 from-pink-500/[0.08]'
                    : 'border-sky-500/20 from-sky-500/[0.08]';
                  return (
                    <div key={g} className={`relative overflow-hidden rounded-xl bg-gradient-to-br to-transparent border p-4 ${cls}`}>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest truncate" title={g}>{g}</p>
                      <p className="text-2xl font-bold text-white tabular-nums mt-1">{n}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Barang akan habis */}
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06] bg-red-500/[0.03]">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500/20 to-red-500/5 border border-red-500/25 grid place-items-center shrink-0">
                <svg className="w-4 h-4 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-white">Data Barang yang Akan Habis</h2>
                <p className="text-xs text-slate-500 mt-0.5">Stok ≤ {LOW_STOCK_THRESHOLD} — perlu segera restok</p>
              </div>
              <span className="text-xs font-bold text-red-300 bg-red-500/10 border border-red-500/25 rounded-full px-3 py-1">
                {barangAkanHabis.length} item
              </span>
            </div>
            {barangAkanHabis.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-emerald-300">✓ Semua barang stoknya masih aman</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[10px] text-slate-500 font-semibold uppercase tracking-widest bg-white/[0.015]">
                      <th className="text-left px-5 py-3">No</th>
                      <th className="text-left px-5 py-3">Kode</th>
                      <th className="text-left px-5 py-3">Nama Barang</th>
                      <th className="text-left px-5 py-3">Jenis</th>
                      <th className="text-left px-5 py-3">Satuan</th>
                      <th className="text-left px-5 py-3">Gudang</th>
                      <th className="text-right px-5 py-3">Stok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barangAkanHabis.map((m, i) => (
                      <tr key={m.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3 text-sm text-slate-500 tabular-nums">{i + 1}</td>
                        <td className="px-5 py-3 text-sm text-slate-400 font-mono">{m.kode}</td>
                        <td className="px-5 py-3 text-sm text-white font-medium">{m.nama}</td>
                        <td className="px-5 py-3 text-sm text-slate-400">{m.jenis}</td>
                        <td className="px-5 py-3 text-sm text-slate-400">{m.satuan}</td>
                        <td className="px-5 py-3 text-sm text-slate-400">{m.letak}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`text-sm font-bold tabular-nums ${m.qty === 0 ? 'text-red-300' : 'text-amber-300'}`}>{m.qty}</span>
                          <span className="text-xs text-slate-500 ml-1">{m.satuan}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ DATA AKTUAL TAB ═══ */}
      {tab === 'aktual' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-3 flex gap-3 items-center">
            <div className="relative flex-1">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cari kode SKU atau nama barang..." className="w-full bg-transparent text-white placeholder-slate-500 pl-10 pr-4 py-2.5 text-sm focus:outline-none" />
            </div>
            <button onClick={() => setDataBarangOpen(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-blue-500/20 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Kelola Data Barang
            </button>
          </div>

          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[10px] text-slate-500 font-semibold uppercase tracking-widest bg-white/[0.015]">
                    <th className="text-left px-5 py-3.5">No</th>
                    <th className="text-left px-5 py-3.5">Kode</th>
                    <th className="text-left px-5 py-3.5">Nama Barang</th>
                    <th className="text-left px-5 py-3.5">Jenis</th>
                    <th className="text-left px-5 py-3.5">Satuan</th>
                    <th className="text-right px-5 py-3.5">Harga</th>
                    <th className="text-right px-5 py-3.5">Stok</th>
                    <th className="text-right px-5 py-3.5">Total</th>
                    <th className="text-left px-5 py-3.5">Letak</th>
                    <th className="text-left px-5 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-500">Tidak ada data barang</td></tr>
                  ) : aktualPaged.slice.map((m, i) => (
                    <tr key={m.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5 text-sm text-slate-500 tabular-nums">{(aktualPaged.current - 1) * 10 + i + 1}</td>
                      <td className="px-5 py-3.5 text-sm text-slate-400 font-mono">{m.kode}</td>
                      <td className="px-5 py-3.5 text-sm text-white font-medium">{m.nama}</td>
                      <td className="px-5 py-3.5"><span className="text-xs text-slate-400 bg-white/[0.06] px-2.5 py-1 rounded">{m.jenis}</span></td>
                      <td className="px-5 py-3.5 text-sm text-slate-400">{m.satuan}</td>
                      <td className="px-5 py-3.5 text-sm text-right text-slate-300 tabular-nums">Rp {fmtRp(m.harga)}</td>
                      <td className="px-5 py-3.5 text-sm text-right text-white font-semibold tabular-nums">{m.qty}</td>
                      <td className="px-5 py-3.5 text-sm text-right text-emerald-300 tabular-nums">Rp {fmtRp(m.total)}</td>
                      <td className="px-5 py-3.5 text-sm text-slate-400">{m.letak}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          m.qty === 0 ? 'text-red-300 bg-red-500/15 border border-red-500/25'
                          : m.qty <= LOW_STOCK_THRESHOLD ? 'text-amber-300 bg-amber-500/15 border border-amber-500/25'
                          : 'text-emerald-300 bg-emerald-500/15 border border-emerald-500/25'
                        }`}>
                          {m.qty === 0 ? 'Habis' : m.qty <= LOW_STOCK_THRESHOLD ? 'Menipis' : 'Tersedia'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination current={aktualPaged.current} total={aktualPaged.total} count={aktualPaged.count} onChange={setAktualPage} />
          </div>
        </div>
      )}

      {/* ═══ ADJUSTMENT TAB ═══ */}
      {tab === 'adjustment' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setMasukOpen(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-blue-500/20">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25L21 12m0 0l-5.25-5.25M21 12H3" /></svg>
              Barang Masuk
            </button>
            <button onClick={() => setKeluarOpen(true)}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-orange-500/20">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3.75 9.75M3.75 9.75L9 4.5M3.75 9.75H21" /></svg>
              Barang Keluar
            </button>
          </div>

          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[10px] text-slate-500 font-semibold uppercase tracking-widest bg-white/[0.015]">
                    <th className="text-left px-5 py-3.5">Tanggal</th>
                    <th className="text-left px-5 py-3.5">Nama Bahan</th>
                    <th className="text-left px-5 py-3.5">Tipe</th>
                    <th className="text-left px-5 py-3.5">Sumber</th>
                    <th className="text-right px-5 py-3.5">Sebelum</th>
                    <th className="text-right px-5 py-3.5">Sesudah</th>
                    <th className="text-right px-5 py-3.5">Selisih</th>
                    <th className="text-left px-5 py-3.5">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">Belum ada riwayat adjustment</td></tr>
                  ) : adjPaged.slice.map((a: Row) => {
                    const selisih = a.selisih || 0;
                    const satuan = a.satuan || 'pcs';
                    const tipeColor = a.tipe === 'Penambahan' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25'
                      : a.tipe === 'Pengurangan' ? 'text-orange-300 bg-orange-500/10 border-orange-500/25'
                      : a.tipe === 'Pemakaian_WO' ? 'text-amber-300 bg-amber-500/10 border-amber-500/25'
                      : 'text-blue-300 bg-blue-500/10 border-blue-500/25';
                    const tipeLabel = a.tipe === 'Penambahan' ? 'Masuk'
                      : a.tipe === 'Pengurangan' ? 'Keluar'
                      : a.tipe === 'Pemakaian_WO' ? 'Pemakaian WO' : a.tipe;
                    const wo = a.work_order_id ? woList.find((w: Row) => String(w.id) === String(a.work_order_id)) : null;
                    return (
                      <tr key={a.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3.5 text-sm text-slate-400 tabular-nums">{fmtDate(a.created_at)}</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-white">{a.barang_nama}</td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${tipeColor}`}>{tipeLabel}</span>
                        </td>
                        <td className="px-5 py-3.5 text-sm">
                          {wo ? (
                            <span className="text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded font-mono">{wo.no_wo || `WO #${wo.id}`}</span>
                          ) : (
                            <span className="text-xs text-slate-500">Manual</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-slate-400 text-right tabular-nums">{a.qty_sebelum} {satuan}</td>
                        <td className="px-5 py-3.5 text-sm text-slate-300 text-right tabular-nums">{a.qty_sesudah} {satuan}</td>
                        <td className="px-5 py-3.5 text-sm font-semibold text-right tabular-nums">
                          <span className={selisih >= 0 ? 'text-emerald-300' : 'text-orange-300'}>
                            {selisih >= 0 ? '+' : ''}{selisih} {satuan}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-slate-400">{a.keterangan || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination current={adjPaged.current} total={adjPaged.total} count={adjPaged.count} onChange={setAdjPage} />
          </div>
        </div>
      )}

      {/* Modals */}
      {dataBarangOpen && (
        <DataBarangModal
          onClose={() => setDataBarangOpen(false)}
          onSaved={fetchData}
          barangList={barangList}
          stokList={stokList}
          tipeBarangList={tipeBarangList}
          gudangList={gudangList}
          toast={toast}
        />
      )}
      {masukOpen && (
        <AdjustmentModal
          mode="masuk"
          onClose={() => setMasukOpen(false)}
          onSaved={fetchData}
          barangList={barangList}
          stokList={stokList}
          toast={toast}
        />
      )}
      {keluarOpen && (
        <AdjustmentModal
          mode="keluar"
          onClose={() => setKeluarOpen(false)}
          onSaved={fetchData}
          barangList={barangList}
          stokList={stokList}
          toast={toast}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Sub-components
   ───────────────────────────────────────────────────────────────────── */

function StatCard({
  label, value, icon, accent, onClick,
}: {
  label: string; value: number; icon: React.ReactNode; accent: 'blue' | 'orange' | 'emerald' | 'red';
  onClick?: () => void;
}) {
  const a = accent === 'blue' ? { border: 'border-blue-500/20', glow: 'bg-blue-500/10', chip: 'bg-blue-500/15 border-blue-500/25 text-blue-300' }
    : accent === 'orange' ? { border: 'border-orange-500/20', glow: 'bg-orange-500/10', chip: 'bg-orange-500/15 border-orange-500/25 text-orange-300' }
    : accent === 'emerald' ? { border: 'border-emerald-500/20', glow: 'bg-emerald-500/10', chip: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300' }
    : { border: 'border-red-500/20', glow: 'bg-red-500/10', chip: 'bg-red-500/15 border-red-500/25 text-red-300' };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border bg-[#111827] p-5 text-left transition-all hover:border-white/20 hover:scale-[1.01] ${a.border}`}
    >
      <div aria-hidden className={`absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl pointer-events-none ${a.glow}`} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
          <p className="text-3xl font-bold text-white tabular-nums mt-1">{value}</p>
        </div>
        <div className={`w-11 h-11 rounded-xl border grid place-items-center ${a.chip}`}>
          {icon}
        </div>
      </div>
    </button>
  );
}

/* ═══ Data Barang Modal ═══ */
interface DataBarangModalProps {
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  barangList: Row[];
  stokList: Row[];
  tipeBarangList: Row[];
  gudangList: Row[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toast: any;
}

function DataBarangModal({ onClose, onSaved, barangList, stokList, tipeBarangList, gudangList, toast }: DataBarangModalProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({
    kode: '', nama: '', tipeId: '', satuan: 'pcs', harga: '', letak: '',
  });
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return barangList
      .filter(b => !ql || String(b.kode_barang || '').toLowerCase().includes(ql) || String(b.nama || '').toLowerCase().includes(ql))
      .map(b => {
        const s = stokList.find((st: Row) => String(st.barang_id) === String(b.id));
        return {
          id: b.id,
          kode: String(b.kode_barang || '') || `ID-${b.id}`,
          nama: String(b.nama || ''),
          jenis: b.tipe_nama || '-',
          satuan: String(b.satuan || 'pcs'),
          gudang: String(b.letak || '-'),
          stok: Number(s?.qty) || 0,
        };
      });
  }, [barangList, stokList, q]);

  function reset() {
    setEditingId(null);
    setForm({ kode: '', nama: '', tipeId: '', satuan: 'pcs', harga: '', letak: '' });
  }

  function pickForEdit(id: number) {
    const b = barangList.find(x => x.id === id);
    if (!b) return;
    setEditingId(id);
    setForm({
      kode: String(b.kode_barang || ''),
      nama: String(b.nama || ''),
      tipeId: String(b.tipe_barang_id || ''),
      satuan: String(b.satuan || 'pcs'),
      harga: String(b.harga || ''),
      letak: String(b.letak || ''),
    });
  }

  async function handleSave() {
    if (!form.nama.trim()) { toast.warning('Validasi', 'Nama barang wajib diisi.'); return; }
    setSaving(true);
    try {
      const payload: Row = {
        kode_barang: form.kode.trim() || null,
        nama: form.nama.trim(),
        tipe_barang_id: form.tipeId ? Number(form.tipeId) : null,
        satuan: form.satuan,
        harga: Number(form.harga) || 0,
        letak: form.letak || null,
      };
      if (editingId) {
        await dbUpdate('barang', editingId, payload);
        toast.success('Data Diperbarui', `${form.nama} berhasil diupdate.`);
      } else {
        await dbCreate('barang', payload);
        toast.success('Data Ditambah', `${form.nama} berhasil ditambahkan.`);
      }
      reset();
      await onSaved();
    } catch (e) { toast.error('Gagal Menyimpan', String(e)); }
    setSaving(false);
  }

  async function handleDelete() {
    if (!editingId) { toast.warning('Validasi', 'Pilih data yang ingin dihapus dulu.'); return; }
    const yes = await toast.confirm({
      title: 'Hapus Barang?',
      message: `${form.nama} akan dihapus permanen.`,
      type: 'danger',
      confirmText: 'Ya, Hapus',
    });
    if (!yes) return;
    try {
      await dbDelete('barang', editingId);
      toast.deleted('Data Dihapus', `${form.nama} berhasil dihapus.`);
      reset();
      await onSaved();
    } catch (e) { toast.error('Gagal Menghapus', String(e)); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0f1626] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-gradient-to-r from-blue-500/[0.08] to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/25 grid place-items-center">
              <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Form Data Barang</h3>
              <p className="text-xs text-slate-500 mt-0.5">Kelola master data barang / bahan (SKU sesuai Accurate)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1.5 hover:bg-white/[0.05] rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body: 2 column layout */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left 2/3: table */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-sm text-slate-400">
                Total: <strong className="text-white">{filtered.length}</strong> barang
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={handleDelete} disabled={!editingId}
                  className="text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors">
                  Delete
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
                  {editingId ? 'Update' : 'Simpan'}
                </button>
                <button onClick={reset}
                  className="text-xs font-medium text-slate-300 hover:text-white border border-white/10 hover:bg-white/[0.04] px-3 py-1.5 rounded-lg transition-colors">
                  Reset
                </button>
              </div>
            </div>
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari kode atau nama barang..."
                className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/40" />
            </div>
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <div className="overflow-y-auto max-h-[420px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#0d1117]">
                    <tr className="border-b border-white/10 text-[10px] text-slate-500 font-semibold uppercase tracking-widest">
                      <th className="text-left px-3 py-2.5">No</th>
                      <th className="text-left px-3 py-2.5">Kode</th>
                      <th className="text-left px-3 py-2.5">Nama</th>
                      <th className="text-left px-3 py-2.5">Jenis</th>
                      <th className="text-left px-3 py-2.5">Satuan</th>
                      <th className="text-left px-3 py-2.5">Gudang</th>
                      <th className="text-right px-3 py-2.5">Stok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">Tidak ada data</td></tr>
                    ) : filtered.map((b, i) => (
                      <tr key={b.id}
                        onClick={() => pickForEdit(b.id)}
                        className={`border-b border-white/[0.04] cursor-pointer transition-colors ${
                          editingId === b.id ? 'bg-blue-500/[0.10]' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <td className="px-3 py-2.5 text-slate-500 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2.5 text-slate-300 font-mono text-[12px]">{b.kode}</td>
                        <td className="px-3 py-2.5 text-white font-medium">{b.nama}</td>
                        <td className="px-3 py-2.5 text-slate-400">{b.jenis}</td>
                        <td className="px-3 py-2.5 text-slate-400">{b.satuan}</td>
                        <td className="px-3 py-2.5 text-slate-400">{b.gudang}</td>
                        <td className="px-3 py-2.5 text-right text-white tabular-nums">{b.stok}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right 1/3: form */}
          <div className="space-y-3">
            <div className="rounded-xl bg-blue-500/[0.06] border border-blue-500/25 p-4">
              <p className="text-[11px] font-semibold text-blue-300 uppercase tracking-widest">{editingId ? 'Edit Barang' : 'Data Barang Baru'}</p>
              {editingId && <p className="text-xs text-slate-400 mt-1">Klik row lain untuk pindah, atau tekan Reset.</p>}
            </div>
            <div className="space-y-3">
              <FieldSm label="Kode Barang (SKU Accurate)"
                value={form.kode}
                onChange={v => setForm(f => ({ ...f, kode: v }))}
                placeholder="e.g., ID-1001" />
              <FieldSm label="Nama Barang *"
                value={form.nama}
                onChange={v => setForm(f => ({ ...f, nama: v }))}
                placeholder="e.g., Kain Sublim" />
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Jenis Barang</label>
                <select value={form.tipeId} onChange={e => setForm(f => ({ ...f, tipeId: e.target.value }))}
                  className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer">
                  <option value="">Pilih jenis...</option>
                  {tipeBarangList.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Satuan *</label>
                <select value={form.satuan} onChange={e => setForm(f => ({ ...f, satuan: e.target.value }))}
                  className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer">
                  {SATUAN_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Harga (per {form.satuan})</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">Rp</span>
                  <input type="text" inputMode="numeric"
                    value={form.harga ? new Intl.NumberFormat('id-ID').format(Number(form.harga)) : ''}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '');
                      setForm(f => ({ ...f, harga: digits }));
                    }}
                    placeholder="0"
                    className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500/40" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Letak (Gudang)</label>
                <select value={form.letak} onChange={e => setForm(f => ({ ...f, letak: e.target.value }))}
                  className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer">
                  <option value="">Pilih gudang...</option>
                  {gudangList.map(g => <option key={g.id} value={g.nama}>{g.nama}</option>)}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">Kelola daftar gudang di <strong className="text-slate-400">Master → Gudang</strong>.</p>
              </div>
              <button onClick={handleSave} disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-blue-500/20">
                {saving ? 'Menyimpan...' : editingId ? 'Update Data' : 'Add Data'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldSm({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-300 mb-1">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/40" />
    </div>
  );
}

/* ═══ Adjustment Modal (Barang Masuk / Keluar) ═══ */
interface AdjustmentModalProps {
  mode: 'masuk' | 'keluar';
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  barangList: Row[];
  stokList: Row[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toast: any;
}

function AdjustmentModal({ mode, onClose, onSaved, barangList, stokList, toast }: AdjustmentModalProps) {
  const [barangId, setBarangId] = useState('');
  const [qty, setQty] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [noDokumen, setNoDokumen] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedBarang = barangList.find(b => String(b.id) === barangId);
  const currentStok = stokList.find(s => String(s.barang_id) === barangId);
  const currentQty = Number(currentStok?.qty) || 0;
  const qtyNum = Number(qty) || 0;
  const finalQty = mode === 'masuk' ? currentQty + qtyNum : Math.max(0, currentQty - qtyNum);

  const isMasuk = mode === 'masuk';
  const accent = isMasuk ? 'blue' : 'orange';
  const accentCls = accent === 'blue'
    ? { border: 'border-blue-500/25', bg: 'bg-blue-500/[0.08]', chip: 'bg-blue-500/15 border-blue-500/25 text-blue-300', btn: 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20' }
    : { border: 'border-orange-500/25', bg: 'bg-orange-500/[0.08]', chip: 'bg-orange-500/15 border-orange-500/25 text-orange-300', btn: 'bg-orange-600 hover:bg-orange-500 shadow-orange-500/20' };

  async function handleSave() {
    if (!barangId) { toast.warning('Validasi', 'Pilih barang terlebih dahulu.'); return; }
    if (qtyNum <= 0) { toast.warning('Validasi', 'Jumlah harus lebih dari 0.'); return; }
    if (!isMasuk && qtyNum > currentQty) {
      toast.warning('Stok Tidak Cukup', `Stok tersedia hanya ${currentQty} ${selectedBarang?.satuan}.`);
      return;
    }
    setSaving(true);
    try {
      const selisih = isMasuk ? qtyNum : -qtyNum;
      const catatan = [keterangan, noDokumen ? `No dokumen: ${noDokumen}` : null].filter(Boolean).join(' · ');

      await dbCreate('stok_adjustment', {
        barang_id: Number(barangId),
        tipe: isMasuk ? 'Penambahan' : 'Pengurangan',
        qty_sebelum: currentQty,
        qty_sesudah: finalQty,
        selisih,
        keterangan: catatan,
      });

      if (currentStok) {
        await dbUpdate('stok', currentStok.id, { qty: finalQty });
      } else {
        await dbCreate('stok', { barang_id: Number(barangId), qty: finalQty });
      }

      toast.success(
        isMasuk ? 'Barang Masuk Tersimpan' : 'Barang Keluar Tersimpan',
        `${selectedBarang?.nama}: ${currentQty} → ${finalQty}`,
      );
      await onSaved();
      onClose();
    } catch (e) { toast.error('Gagal Menyimpan', String(e)); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0f1626] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-gradient-to-r ${isMasuk ? 'from-blue-500/[0.10]' : 'from-orange-500/[0.10]'} to-transparent`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border grid place-items-center ${accentCls.chip}`}>
              {isMasuk ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25L21 12m0 0l-5.25-5.25M21 12H3" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3.75 9.75M3.75 9.75L9 4.5M3.75 9.75H21" /></svg>
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{isMasuk ? 'Barang Masuk' : 'Barang Keluar'}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isMasuk ? 'Catat penambahan stok dari pembelian/retur.' : 'Catat pengurangan stok dari pemakaian/kirim keluar.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1.5 hover:bg-white/[0.05] rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Pilih Barang <span className="text-red-400">*</span></label>
            <select value={barangId} onChange={e => setBarangId(e.target.value)}
              className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer">
              <option value="">Pilih barang...</option>
              {barangList.map(b => (
                <option key={b.id} value={b.id}>
                  {String(b.kode_barang || '') || `ID-${b.id}`} · {b.nama} {b.tipe_nama ? `(${b.tipe_nama})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className={`grid grid-cols-3 gap-3 rounded-xl border p-4 ${accentCls.border} ${accentCls.bg}`}>
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block">Stok Sekarang</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-xl font-bold text-white tabular-nums">{barangId ? currentQty : '–'}</span>
                {barangId && <span className="text-[11px] text-slate-500">{selectedBarang?.satuan}</span>}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block">Jumlah {isMasuk ? 'Masuk' : 'Keluar'}</span>
              <input type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} placeholder="0"
                className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-2 py-1.5 text-sm mt-1 focus:outline-none focus:border-blue-500/40 tabular-nums" />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block">Stok Akhir</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className={`text-xl font-bold tabular-nums ${!isMasuk && finalQty === 0 && qtyNum > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                  {barangId && qty ? finalQty : '–'}
                </span>
                {barangId && qty && <span className="text-[11px] text-slate-500">{selectedBarang?.satuan}</span>}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1.5">No Dokumen (opsional)</label>
            <input type="text" value={noDokumen} onChange={e => setNoDokumen(e.target.value)}
              placeholder={isMasuk ? "e.g., PO-12345" : "e.g., DO-67890"}
              className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/40" />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Keterangan</label>
            <textarea rows={3} value={keterangan} onChange={e => setKeterangan(e.target.value)}
              placeholder={isMasuk ? "e.g., Restock bulanan, retur supplier" : "e.g., Pemakaian produksi, kirim ke gudang lain"}
              className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/40 resize-none" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06] bg-white/[0.015]">
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">
            Batal
          </button>
          <button onClick={handleSave} disabled={saving}
            className={`px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg ${accentCls.btn}`}>
            {saving ? 'Menyimpan...' : isMasuk ? 'Simpan Barang Masuk' : 'Simpan Barang Keluar'}
          </button>
        </div>
      </div>
    </div>
  );
}
