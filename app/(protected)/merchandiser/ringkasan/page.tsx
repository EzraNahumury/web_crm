'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet } from '@/lib/api-db';
import { useToast } from '@/lib/toast';
import {
  MerchDesignRow, MerchProofingRow,
  designJumlahRevisi, designHari, designMenunggu, designStatus,
  proofingJumlahRevisi, proofingHari, proofingMenunggu, proofingStatus,
  dSerial, fmtTgl, toDateInput, todayIsoWIB,
} from '@/lib/merchandiser';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const D_EMPTY: MerchDesignRow = {
  no_order: '', tgl_dp_design: '', nama_customer: '', no_wa: '', pic_cs: '', desainer: '',
  design_awal_kirim: '', design_awal_feedback: '', rev1_kirim: '', rev1_feedback: '',
  rev2_kirim: '', rev2_feedback: '', rev3_kirim: '', rev3_feedback: '', design_fix: '',
  info_dp_produksi_kirim: '', dp_produksi_diterima: '', data_detail_lengkap: '', catatan: '',
};
const P_EMPTY: MerchProofingRow = {
  no_order: '', proofing_kirim: '', proofing_feedback: '', rev1_kirim: '', rev1_feedback: '',
  rev2_kirim: '', rev2_feedback: '', rev3_kirim: '', rev3_feedback: '', proofing_fix: '',
  data_approve: '', job_ticket_ppic: '', catatan: '',
};
function toD(r: Row): MerchDesignRow { const o = { ...D_EMPTY }; const w = o as unknown as Record<string, string>; for (const k of Object.keys(D_EMPTY)) w[k] = String(r[k] ?? ''); return o; }
function toP(r: Row): MerchProofingRow { const o = { ...P_EMPTY }; const w = o as unknown as Record<string, string>; for (const k of Object.keys(P_EMPTY)) w[k] = String(r[k] ?? ''); return o; }

function avg(nums: number[]): string {
  if (nums.length === 0) return '-';
  return String(Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10);
}

export default function MerchRingkasanPage() {
  const toast = useToast();
  const [design, setDesign] = useState<MerchDesignRow[]>([]);
  const [proofing, setProofing] = useState<MerchProofingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const today = todayIsoWIB();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [d, p] = await Promise.all([dbGet('merch_design').catch(() => []), dbGet('merch_proofing').catch(() => [])]);
      setDesign((d as Row[]).map(toD));
      setProofing((p as Row[]).map(toP));
    } catch { setDesign([]); setProofing([]); }
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // DP Produksi per No. Order (untuk hari proofing).
  const dpByOrder = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of design) if (d.no_order.trim()) m.set(d.no_order.trim(), toDateInput(d.dp_produksi_diterima));
    return m;
  }, [design]);

  const kpi = useMemo(() => {
    const dRows = design.filter(d => d.no_order.trim());
    const pRows = proofing.filter(p => p.no_order.trim());
    // Design
    const dTotal = dRows.length;
    const dFix = dRows.filter(d => dSerial(d.design_fix) != null).length;
    const dAvgRev = avg(dRows.map(designJumlahRevisi));
    const dAvgHari = avg(dRows.map(designHari).filter((v): v is number => v !== '').map(Number));
    const dRev3 = dRows.filter(d => dSerial(d.rev3_kirim) != null).length;
    const dWait3 = dRows.filter(d => { const m = designMenunggu(d, today); return m !== '' && m >= 3; }).length;
    const dTungguDp = dRows.filter(d => designStatus(d) === 'Design Fix - tunggu DP Produksi').length;
    // Proofing
    const pTotal = pRows.length;
    const pFix = pRows.filter(p => dSerial(p.proofing_fix) != null).length;
    const pAvgRev = avg(pRows.map(proofingJumlahRevisi));
    const pAvgHari = avg(pRows.map(p => proofingHari(p, dpByOrder.get(p.no_order.trim()) || '')).filter((v): v is number => v !== '').map(Number));
    const pWait3 = pRows.filter(p => { const m = proofingMenunggu(p, today); return m !== '' && m >= 3; }).length;
    const pJobTicket = pRows.filter(p => dSerial(p.job_ticket_ppic) != null).length;
    return {
      design: [
        { label: 'Total customer DP Design', value: dTotal },
        { label: 'Design Fix', value: dFix },
        { label: 'Rata-rata jumlah revisi design', value: dAvgRev },
        { label: 'Rata-rata hari DP Design → Design Fix', value: dAvgHari },
        { label: 'Order sampai Revisi 3', value: dRev3 },
        { label: 'Design menunggu balasan ≥3 hari', value: dWait3, warn: dWait3 > 0 },
        { label: 'Design Fix, DP Produksi belum masuk', value: dTungguDp },
      ],
      proofing: [
        { label: 'Total order di Proofing', value: pTotal },
        { label: 'Proofing Fix', value: pFix },
        { label: 'Rata-rata jumlah revisi proofing', value: pAvgRev },
        { label: 'Rata-rata hari DP Produksi → Proofing Fix', value: pAvgHari },
        { label: 'Proofing menunggu balasan ≥3 hari', value: pWait3, warn: pWait3 > 0 },
        { label: 'Job Ticket sudah ke PPIC', value: pJobTicket },
      ],
    };
  }, [design, proofing, dpByOrder, today]);

  async function handleExportAll() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const XLSX = (await import('xlsx-js-style')).default as any;
      const headStyle = { font: { bold: true }, fill: { fgColor: { rgb: 'E2E8F0' } }, alignment: { wrapText: true, vertical: 'center', horizontal: 'center' } };
      const titleStyle = { font: { bold: true, sz: 13 } };
      const wb = XLSX.utils.book_new();

      // Sheet Design
      const dHead = ['No', 'No. Order', 'Tgl DP Design', 'Nama Customer / Tim', 'No. WA', 'PIC CS / Sales', 'Desainer',
        'Design Awal Kirim', 'Design Awal Feedback', 'Revisi 1 Kirim', 'Revisi 1 Feedback', 'Revisi 2 Kirim', 'Revisi 2 Feedback',
        'Revisi 3 Kirim', 'Revisi 3 Feedback', 'Design Fix', 'Jumlah Revisi', 'Hari DP Design → Design Fix', 'Menunggu Balasan (hari)',
        'Info DP Produksi Dikirim', 'DP Produksi Diterima', 'Data Detail Lengkap?', 'Status', 'Catatan'];
      const dBody = design.filter(d => d.no_order.trim()).map((r, i) => [
        i + 1, r.no_order, fmtTgl(r.tgl_dp_design), r.nama_customer, r.no_wa, r.pic_cs, r.desainer,
        fmtTgl(r.design_awal_kirim), fmtTgl(r.design_awal_feedback), fmtTgl(r.rev1_kirim), fmtTgl(r.rev1_feedback),
        fmtTgl(r.rev2_kirim), fmtTgl(r.rev2_feedback), fmtTgl(r.rev3_kirim), fmtTgl(r.rev3_feedback), fmtTgl(r.design_fix),
        designJumlahRevisi(r), designHari(r), designMenunggu(r, today), fmtTgl(r.info_dp_produksi_kirim),
        fmtTgl(r.dp_produksi_diterima), r.data_detail_lengkap, designStatus(r), r.catatan,
      ]);
      const wsD = XLSX.utils.aoa_to_sheet([[{ v: '1. Proses Design', s: titleStyle }], dHead.map(h => ({ v: h, s: headStyle })), ...dBody]);
      wsD['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: dHead.length - 1 } }];
      wsD['!cols'] = [5, 14, 13, 24, 15, 14, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 9, 13, 12, 14, 15, 13, 26, 28].map(w => ({ wch: w }));
      wsD['!rows'] = [{}, { hpt: 30 }];
      XLSX.utils.book_append_sheet(wb, wsD, '1. Design');

      // Sheet Proofing
      const pHead = ['No', 'No. Order', 'Nama Customer / Tim', 'Tgl DP Produksi', 'Proofing Kirim', 'Proofing Feedback',
        'Revisi Proofing 1 Kirim', 'Revisi Proofing 1 Feedback', 'Revisi Proofing 2 Kirim', 'Revisi Proofing 2 Feedback',
        'Revisi Proofing 3 Kirim', 'Revisi Proofing 3 Feedback', 'Proofing Fix', 'Jumlah Revisi Proofing',
        'Data Nama/Nomor/Size Approve?', 'Menunggu Balasan (hari)', 'Hari DP Produksi → Proofing Fix', 'Job Ticket ke PPIC', 'Status', 'Catatan'];
      const pBody = proofing.filter(p => p.no_order.trim()).map((r, i) => {
        const dp = dpByOrder.get(r.no_order.trim()) || '';
        const cust = (design.find(d => d.no_order.trim() === r.no_order.trim())?.nama_customer) || '';
        return [
          i + 1, r.no_order, cust, fmtTgl(dp), fmtTgl(r.proofing_kirim), fmtTgl(r.proofing_feedback),
          fmtTgl(r.rev1_kirim), fmtTgl(r.rev1_feedback), fmtTgl(r.rev2_kirim), fmtTgl(r.rev2_feedback),
          fmtTgl(r.rev3_kirim), fmtTgl(r.rev3_feedback), fmtTgl(r.proofing_fix), proofingJumlahRevisi(r),
          r.data_approve, proofingMenunggu(r, today), proofingHari(r, dp), fmtTgl(r.job_ticket_ppic), proofingStatus(r), r.catatan,
        ];
      });
      const wsP = XLSX.utils.aoa_to_sheet([[{ v: '2. Proses Proofing', s: titleStyle }], pHead.map(h => ({ v: h, s: headStyle })), ...pBody]);
      wsP['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: pHead.length - 1 } }];
      wsP['!cols'] = [5, 14, 24, 14, 13, 13, 13, 13, 13, 13, 13, 13, 13, 9, 14, 12, 14, 14, 26, 28].map(w => ({ wch: w }));
      wsP['!rows'] = [{}, { hpt: 30 }];
      XLSX.utils.book_append_sheet(wb, wsP, '2. Proofing');

      // Sheet Ringkasan
      const bold = { font: { bold: true } };
      const rAoa: unknown[][] = [[{ v: '4. Ringkasan KPI Merchandiser', s: titleStyle }], [{ v: 'DESIGN', s: bold }]];
      for (const m of kpi.design) rAoa.push([m.label, m.value]);
      rAoa.push([{ v: 'PROOFING', s: bold }]);
      for (const m of kpi.proofing) rAoa.push([m.label, m.value]);
      const wsR = XLSX.utils.aoa_to_sheet(rAoa);
      wsR['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
      wsR['!cols'] = [{ wch: 42 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsR, '4. Ringkasan');

      XLSX.writeFile(wb, `tracker-merchandiser-${today}.xlsx`);
      toast.success('Excel Terunduh', 'Design + Proofing + Ringkasan.');
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  if (loading) return <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />;

  const Card = (m: { label: string; value: number | string; warn?: boolean }) => (
    <div key={m.label} className={`rounded-xl border px-4 py-3 ${m.warn ? 'border-rose-500/30 bg-rose-500/[0.06]' : 'border-white/[0.06] bg-[#0d1117]'}`}>
      <p className="text-[11px] text-slate-400 leading-snug">{m.label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${m.warn ? 'text-rose-300' : 'text-white'}`}>{m.value}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-fuchsia-500/[0.14] via-purple-500/[0.06] to-transparent p-5 sm:p-6">
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Merchandiser · Ringkasan KPI</h1>
            <p className="text-[13px] text-slate-300 mt-0.5">Terhitung otomatis dari sheet Design &amp; Proofing.</p>
          </div>
          <button onClick={handleExportAll} className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-green-700 hover:bg-green-600 px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-green-700/20">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            Export Excel (semua sheet)
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5">
        <h2 className="text-sm font-bold text-fuchsia-200 mb-3">Design</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{kpi.design.map(Card)}</div>
      </div>
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5">
        <h2 className="text-sm font-bold text-fuchsia-200 mb-3">Proofing</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{kpi.proofing.map(Card)}</div>
      </div>
    </div>
  );
}
