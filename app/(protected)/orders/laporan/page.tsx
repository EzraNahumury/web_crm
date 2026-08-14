'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import DateRangePicker, { today, formatPeriod } from '../../laporan/date-range-picker';

type PaketRow = { paket: string; qty: number; cust: number; orders: number };
type Totals = { qty: number; cust: number; orders: number; paket_count: number };

// Awal bulan berjalan (default rentang laporan).
function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const BAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#84cc16', '#f97316'];

export default function CsOrderLaporanPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [paket, setPaket] = useState<PaketRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ qty: 0, cust: 0, orders: 0, paket_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await fetch(`/api/orders/laporan?${qs.toString()}`);
      const json = await res.json();
      if (json.success) {
        setPaket(json.data.paket || []);
        setTotals(json.data.totals || { qty: 0, cust: 0, orders: 0, paket_count: 0 });
      } else {
        setError(json.error || 'Gagal memuat laporan');
      }
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  // Download PDF: rasterize the chart (html2canvas) + tabel per-paket (autoTable).
  async function handleDownloadPDF() {
    if (paket.length === 0 || downloading) return;
    setDownloading(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const html2canvas = (await import('html2canvas')).default;

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 12;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(15);
      pdf.text('Laporan CS Order', margin, 15);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(90, 90, 90);
      pdf.text(`Periode: ${formatPeriod(from, to)}`, margin, 21);
      pdf.setTextColor(20, 20, 20);
      pdf.text(
        `Jenis Paket: ${totals.paket_count}    Jumlah Pemesanan: ${totals.qty.toLocaleString('id-ID')} pcs    Jumlah Customer: ${totals.cust.toLocaleString('id-ID')}`,
        margin, 27,
      );

      let y = 32;
      if (chartRef.current) {
        const canvas = await html2canvas(chartRef.current, { backgroundColor: '#0f1626', scale: 2 });
        const img = canvas.toDataURL('image/png');
        const availW = pageW - margin * 2;
        let imgW = availW;
        let imgH = imgW * (canvas.height / canvas.width);
        const maxH = pageH - y - margin;
        if (imgH > maxH) { imgH = maxH; imgW = imgH * (canvas.width / canvas.height); }
        pdf.addImage(img, 'PNG', margin + (availW - imgW) / 2, y, imgW, imgH);
        y += imgH + 6;
      }

      if (y > pageH - 40) { pdf.addPage(); y = margin; }

      autoTable(pdf, {
        startY: y,
        head: [['No', 'Paket', 'Jumlah Customer', 'Qty (Pemesanan)']],
        body: paket.map((p, i) => [String(i + 1), p.paket, String(p.cust), String(p.qty)]),
        foot: [['', 'TOTAL', String(totals.cust), String(totals.qty)]],
        styles: { fontSize: 8, cellPadding: 2, lineColor: [210, 210, 210], lineWidth: 0.2 },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, halign: 'center', fontStyle: 'bold' },
        footStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          2: { halign: 'right', cellWidth: 34 },
          3: { halign: 'right', cellWidth: 34 },
        },
        margin: { left: margin, right: margin },
      });

      pdf.save(`Laporan-CS-Order-${from}_sd_${to}.pdf`);
    } catch (e) {
      console.error('Download laporan PDF failed', e);
    }
    setDownloading(false);
  }

  const chartData = useMemo(() => paket.slice(0, 30), [paket]);
  const chartHeight = Math.max(240, chartData.length * 34 + 40);

  const cards = [
    { label: 'Jenis Paket', value: totals.paket_count, suffix: 'paket', color: 'text-indigo-300', ring: 'from-indigo-500/20 to-indigo-500/5 border-indigo-500/20' },
    { label: 'Jumlah Pemesanan', value: totals.qty, suffix: 'pcs', color: 'text-sky-300', ring: 'from-sky-500/20 to-sky-500/5 border-sky-500/20' },
    { label: 'Jumlah Customer', value: totals.cust, suffix: 'customer', color: 'text-emerald-300', ring: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-indigo-500/[0.14] via-violet-500/[0.05] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500/25 to-indigo-500/5 border border-indigo-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Laporan CS Order</h1>
              <p className="text-[13px] text-slate-300 mt-0.5 max-w-2xl">
                Rekap paket dari order yang sudah dibuat Rincian Order-nya. {from && to && <span className="text-slate-400">Periode: {formatPeriod(from, to)}.</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <DateRangePicker from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
            <button
              onClick={handleDownloadPDF}
              disabled={downloading || loading || paket.length === 0}
              className="flex items-center gap-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors shadow-lg shadow-indigo-600/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              {downloading ? 'Menyiapkan...' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map(c => (
          <div key={c.label} className={`rounded-2xl bg-gradient-to-br ${c.ring} border p-4`}>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{c.label}</p>
            <p className={`text-3xl font-bold tabular-nums mt-1 ${c.color}`}>
              {loading ? '…' : c.value.toLocaleString('id-ID')}
              <span className="text-sm font-medium text-slate-500 ml-1.5">{c.suffix}</span>
            </p>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/[0.06] border border-red-500/20 p-4 text-sm text-red-300">{error}</div>
      )}

      {/* Chart */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-4 sm:p-5">
        <h2 className="text-sm font-bold text-white mb-1">Jumlah Pemesanan (Qty) per Paket</h2>
        <p className="text-xs text-slate-500 mb-4">Barang yang dihitung qty dari master Barang CS. Aksesoris (hitung qty = 0) dikecualikan.</p>
        {loading ? (
          <div className="h-64 grid place-items-center">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-400 animate-spin" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-48 grid place-items-center text-sm text-slate-500">Tidak ada data pada periode ini.</div>
        ) : (
          <div ref={chartRef} className="bg-[#0f1626] rounded-lg p-2" style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 11, fill: '#cbd5e1' }} tickLine={{ stroke: '#475569' }} />
                <YAxis type="category" dataKey="paket" stroke="#94a3b8" width={200} tick={{ fontSize: 11, fill: '#f1f5f9' }} tickLine={{ stroke: '#475569' }} interval={0} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                  contentStyle={{ background: '#0b1220', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#ffffff', fontWeight: 700 }}
                  itemStyle={{ color: '#e2e8f0', fontWeight: 500 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((value: any, _name: any, item: any) => {
                    const row = item?.payload as PaketRow;
                    return [`${Number(value).toLocaleString('id-ID')} pcs · ${row?.cust ?? 0} customer`, 'Qty'];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  }) as any}
                />
                <Bar dataKey="qty" radius={[0, 4, 4, 0]} barSize={20}>
                  {chartData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Rincian per Paket</h2>
          <span className="text-xs text-slate-500">{paket.length} paket</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.015]">
                {['NO', 'PAKET', 'JUMLAH CUSTOMER', 'JUMLAH PEMESANAN (QTY)'].map(h => (
                  <th key={h} className={`text-[10px] text-slate-500 font-semibold ${h === 'NO' || h === 'PAKET' ? 'text-left' : 'text-right'} px-5 py-3 uppercase tracking-widest`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-500">Memuat…</td></tr>
              ) : paket.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-500">Tidak ada data pada periode ini.</td></tr>
              ) : (
                <>
                  {paket.map((p, i) => (
                    <tr key={p.paket} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3 text-sm text-slate-500 tabular-nums">{i + 1}</td>
                      <td className="px-5 py-3 text-sm text-white font-medium">{p.paket}</td>
                      <td className="px-5 py-3 text-right text-sm text-emerald-300 tabular-nums">{p.cust.toLocaleString('id-ID')}</td>
                      <td className="px-5 py-3 text-right text-sm text-sky-300 font-semibold tabular-nums">{p.qty.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                  <tr className="bg-white/[0.02] font-bold">
                    <td className="px-5 py-3" />
                    <td className="px-5 py-3 text-sm text-slate-300 uppercase">Total</td>
                    <td className="px-5 py-3 text-right text-sm text-emerald-300 tabular-nums">{totals.cust.toLocaleString('id-ID')}</td>
                    <td className="px-5 py-3 text-right text-sm text-sky-300 tabular-nums">{totals.qty.toLocaleString('id-ID')}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
