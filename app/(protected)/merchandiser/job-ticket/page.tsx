'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet, dbCreate, dbUpdate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';
import { fmtTgl, toDateInput, todayIsoWIB } from '@/lib/merchandiser';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Anak / lainnya'];
const DETAIL_FIELDS: { key: string; label: string; area?: boolean }[] = [
  { key: 'model', label: 'Model (raglan / biasa)' },
  { key: 'jenis_bahan', label: 'Jenis bahan' },
  { key: 'kerah', label: 'Kerah' },
  { key: 'lengan', label: 'Lengan' },
  { key: 'warna_utama', label: 'Warna utama' },
  { key: 'logo_sponsor', label: 'Logo & sponsor + posisi', area: true },
  { key: 'font_nama_nomor', label: 'Font nama / nomor' },
  { key: 'link_design_fix', label: 'Link file Design Fix' },
  { key: 'link_proofing_fix', label: 'Link file / foto Proofing Fix' },
  { key: 'catatan_proofing', label: 'Catatan hasil proofing', area: true },
];
const SERAH_ROLES: { key: string; label: string }[] = [
  { key: 'merch', label: 'Merchandiser (menyerahkan)' },
  { key: 'ppic', label: 'PPIC (menerima)' },
  { key: 'admin', label: 'Admin Work Order' },
];

interface SizeRow { p: string; pj: string }
interface NameRow { nama: string; nomor: string; size: string; lengan: string; catatan: string }
interface SerahRow { nama: string; tgl: string }

function emptySizes(): Record<string, SizeRow> { const o: Record<string, SizeRow> = {}; for (const s of SIZES) o[s] = { p: '', pj: '' }; return o; }
function emptyNames(n = 5): NameRow[] { return Array.from({ length: n }, () => ({ nama: '', nomor: '', size: '', lengan: '', catatan: '' })); }
function emptySerah(): Record<string, SerahRow> { const o: Record<string, SerahRow> = {}; for (const r of SERAH_ROLES) o[r.key] = { nama: '', tgl: '' }; return o; }

export default function MerchJobTicketPage() {
  const toast = useToast();
  const [designMap, setDesignMap] = useState<Map<string, Row>>(new Map());
  const [proofingMap, setProofingMap] = useState<Map<string, Row>>(new Map());
  const [noOrderInput, setNoOrderInput] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [recordId, setRecordId] = useState<number | null>(null);
  const [noOrder, setNoOrder] = useState('');
  const [tglKirim, setTglKirim] = useState('');
  const [detail, setDetail] = useState<Record<string, string>>({});
  const [sizes, setSizes] = useState<Record<string, SizeRow>>(emptySizes());
  const [names, setNames] = useState<NameRow[]>(emptyNames());
  const [serah, setSerah] = useState<Record<string, SerahRow>>(emptySerah());

  const fetchMaps = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([dbGet('merch_design').catch(() => []), dbGet('merch_proofing').catch(() => [])]);
      const dm = new Map<string, Row>(); for (const r of d as Row[]) if (String(r.no_order || '').trim()) dm.set(String(r.no_order).trim(), r);
      const pm = new Map<string, Row>(); for (const r of p as Row[]) if (String(r.no_order || '').trim()) pm.set(String(r.no_order).trim(), r);
      setDesignMap(dm); setProofingMap(pm);
    } catch { /* biarkan kosong */ }
  }, []);
  useEffect(() => { fetchMaps(); }, [fetchMaps]);

  const header = useMemo(() => {
    const d = designMap.get(noOrder.trim());
    const p = proofingMap.get(noOrder.trim());
    return {
      customer: String(d?.nama_customer || ''),
      wa: String(d?.no_wa || ''),
      pic: String(d?.pic_cs || ''),
      tglDpDesign: toDateInput(d?.tgl_dp_design),
      tglDesignFix: toDateInput(d?.design_fix),
      tglDpProduksi: toDateInput(d?.dp_produksi_diterima),
      tglProofingFix: toDateInput(p?.proofing_fix),
      found: Boolean(d),
    };
  }, [designMap, proofingMap, noOrder]);

  async function loadOrder() {
    const no = noOrderInput.trim();
    if (!no) { toast.warning('Validasi', 'Isi No. Order dulu.'); return; }
    setNoOrder(no);
    try {
      const existing = await dbGet<Row>('merch_job_ticket', undefined, { no_order: no }).catch(() => []);
      const rec = (existing as Row[])[0];
      if (rec) {
        setRecordId(Number(rec.id));
        setTglKirim(toDateInput(rec.tgl_kirim_dijanjikan));
        const det: Record<string, string> = {};
        for (const f of DETAIL_FIELDS) det[f.key] = String(rec[f.key] ?? '');
        setDetail(det);
        setSizes(parseSizes(rec.size_json));
        setNames(parseNames(rec.nama_nomor_json));
        setSerah(parseSerah(rec.serah_json));
        toast.success('Dimuat', `Job Ticket ${no} dibuka.`);
      } else {
        setRecordId(null); setTglKirim(''); setDetail({}); setSizes(emptySizes()); setNames(emptyNames()); setSerah(emptySerah());
        toast.info?.('Baru', `Belum ada Job Ticket untuk ${no} — isi lalu simpan.`);
      }
      setLoaded(true);
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  const sizeTotals = useMemo(() => {
    let p = 0, pj = 0;
    const perRow: Record<string, number> = {};
    for (const s of SIZES) {
      const a = Number(sizes[s]?.p) || 0, b = Number(sizes[s]?.pj) || 0;
      perRow[s] = a + b; p += a; pj += b;
    }
    return { perRow, p, pj, total: p + pj };
  }, [sizes]);

  const namesFilled = useMemo(() => names.filter(n => n.nama.trim()).length, [names]);
  const nomorDup = useMemo(() => {
    const seen = new Map<string, number>();
    for (const n of names) { const v = n.nomor.trim(); if (v) seen.set(v, (seen.get(v) || 0) + 1); }
    const dup = new Set<string>(); for (const [k, c] of seen) if (c > 1) dup.add(k);
    return dup;
  }, [names]);
  const cekNama = sizeTotals.total === 0 ? '' : (namesFilled === sizeTotals.total ? 'Cocok' : 'TIDAK COCOK - cek ulang');

  async function save() {
    if (!noOrder.trim()) { toast.warning('Validasi', 'No. Order kosong.'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        no_order: noOrder.trim(),
        tgl_kirim_dijanjikan: tglKirim,
        size_json: JSON.stringify(sizes),
        nama_nomor_json: JSON.stringify(names.filter(n => n.nama.trim() || n.nomor.trim())),
        serah_json: JSON.stringify(serah),
      };
      for (const f of DETAIL_FIELDS) payload[f.key] = (detail[f.key] || '').trim();
      if (recordId) await dbUpdate('merch_job_ticket', recordId, payload);
      else {
        const newId = await dbCreate('merch_job_ticket', payload);
        setRecordId(Number(newId));
      }
      toast.success('Tersimpan', `Job Ticket ${noOrder} berhasil disimpan.`);
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  async function handleExport() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const XLSX = (await import('xlsx-js-style')).default as any;
      const bold = { font: { bold: true } };
      const sec = (t: string) => [{ v: t, s: { font: { bold: true, sz: 12 }, fill: { fgColor: { rgb: 'FDE68A' } } } }];
      const aoa: unknown[][] = [];
      aoa.push([{ v: 'JOB TICKET — AYRES', s: { font: { bold: true, sz: 14 } } }]);
      aoa.push([]);
      aoa.push(sec('A. DATA ORDER'));
      aoa.push(['No. Order', noOrder]);
      aoa.push(['Nama Customer / Tim', header.customer]);
      aoa.push(['No. WA', header.wa]);
      aoa.push(['PIC CS / Sales', header.pic]);
      aoa.push(['Tgl DP Design', fmtTgl(header.tglDpDesign)]);
      aoa.push(['Tgl Design Fix', fmtTgl(header.tglDesignFix)]);
      aoa.push(['Tgl DP Produksi', fmtTgl(header.tglDpProduksi)]);
      aoa.push(['Tgl Proofing Fix', fmtTgl(header.tglProofingFix)]);
      aoa.push(['Tgl kirim dijanjikan (dari PPIC)', fmtTgl(tglKirim)]);
      aoa.push([]);
      aoa.push(sec('B. DETAIL DESIGN'));
      for (const f of DETAIL_FIELDS) aoa.push([f.label, detail[f.key] || '']);
      aoa.push([]);
      aoa.push(sec('C. RINCIAN SIZE'));
      aoa.push([{ v: 'Size', s: bold }, { v: 'Lengan Pendek', s: bold }, { v: 'Lengan Panjang', s: bold }, { v: 'Total', s: bold }]);
      for (const s of SIZES) aoa.push([s, Number(sizes[s]?.p) || 0, Number(sizes[s]?.pj) || 0, sizeTotals.perRow[s]]);
      aoa.push([{ v: 'TOTAL PCS', s: bold }, { v: sizeTotals.p, s: bold }, { v: sizeTotals.pj, s: bold }, { v: sizeTotals.total, s: bold }]);
      aoa.push([]);
      aoa.push(sec('D. DAFTAR NAMA & NOMOR'));
      aoa.push([{ v: 'No', s: bold }, { v: 'Nama Punggung', s: bold }, { v: 'Nomor', s: bold }, { v: 'Size', s: bold }, { v: 'Lengan (P/Pj)', s: bold }, { v: 'Catatan', s: bold }]);
      names.filter(n => n.nama.trim() || n.nomor.trim()).forEach((n, i) => aoa.push([i + 1, n.nama, n.nomor, n.size, n.lengan, n.catatan]));
      aoa.push(['Jumlah nama terisi', namesFilled]);
      aoa.push(['Cek: nama vs total pcs', cekNama]);
      aoa.push([]);
      aoa.push(sec('E. SERAH TERIMA'));
      aoa.push([{ v: 'Peran', s: bold }, { v: 'Nama', s: bold }, { v: 'Tanggal', s: bold }]);
      for (const r of SERAH_ROLES) aoa.push([r.label, serah[r.key]?.nama || '', fmtTgl(serah[r.key]?.tgl)]);

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Job Ticket');
      XLSX.writeFile(wb, `job-ticket-${noOrder || 'baru'}.xlsx`);
      toast.success('Excel Terunduh', `Job Ticket ${noOrder}.`);
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  const iCls = 'w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-500/40';
  const roCls = 'w-full bg-white/[0.03] border border-white/5 text-slate-300 rounded-lg px-3 py-2 text-sm';

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-fuchsia-500/[0.14] via-purple-500/[0.06] to-transparent p-5 sm:p-6">
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Merchandiser · Job Ticket</h1>
            <p className="text-[13px] text-slate-300 mt-0.5">Ketik No. Order → data header otomatis dari Design &amp; Proofing. Lengkapi lalu simpan/ekspor.</p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">No. Order</label>
              <input value={noOrderInput} onChange={e => setNoOrderInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') loadOrder(); }} placeholder="WO1234-001" className="bg-[#111827] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500/40" />
            </div>
            <button onClick={loadOrder} className="text-sm font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-500 px-4 py-2 rounded-lg transition-colors shadow-lg shadow-fuchsia-500/20">Muat / Buat</button>
          </div>
        </div>
      </div>

      {!loaded ? (
        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] px-5 py-16 text-center text-sm text-slate-500">Ketik No. Order lalu klik <strong className="text-white">Muat / Buat</strong>.</div>
      ) : (
        <>
          {/* A. DATA ORDER */}
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-fuchsia-200">A. Data Order — {noOrder}</h2>
              {!header.found && <span className="text-[11px] text-rose-300">No. Order belum ada di sheet Design</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <L label="Nama Customer / Tim"><input className={roCls} value={header.customer} readOnly /></L>
              <L label="No. WA"><input className={roCls} value={header.wa} readOnly /></L>
              <L label="PIC CS / Sales"><input className={roCls} value={header.pic} readOnly /></L>
              <L label="Tgl DP Design"><input className={roCls} value={fmtTgl(header.tglDpDesign)} readOnly /></L>
              <L label="Tgl Design Fix"><input className={roCls} value={fmtTgl(header.tglDesignFix)} readOnly /></L>
              <L label="Tgl DP Produksi"><input className={roCls} value={fmtTgl(header.tglDpProduksi)} readOnly /></L>
              <L label="Tgl Proofing Fix"><input className={roCls} value={fmtTgl(header.tglProofingFix)} readOnly /></L>
              <L label="Tgl kirim dijanjikan (dari PPIC)"><input type="date" className={iCls + ' date-input'} value={tglKirim} onChange={e => setTglKirim(e.target.value)} /></L>
            </div>
          </div>

          {/* B. DETAIL DESIGN */}
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5">
            <h2 className="text-sm font-bold text-fuchsia-200 mb-3">B. Detail Design</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DETAIL_FIELDS.map(f => (
                <L key={f.key} label={f.label} full={f.area}>
                  {f.area
                    ? <textarea rows={2} className={iCls + ' resize-none'} value={detail[f.key] || ''} onChange={e => setDetail(d => ({ ...d, [f.key]: e.target.value }))} />
                    : <input className={iCls} value={detail[f.key] || ''} onChange={e => setDetail(d => ({ ...d, [f.key]: e.target.value }))} />}
                </L>
              ))}
            </div>
          </div>

          {/* C. RINCIAN SIZE */}
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5">
            <h2 className="text-sm font-bold text-fuchsia-200 mb-3">C. Rincian Size</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
                <thead><tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-white/[0.06]">
                  <th className="text-left px-3 py-2">Size</th><th className="text-right px-3 py-2">Lengan Pendek</th><th className="text-right px-3 py-2">Lengan Panjang</th><th className="text-right px-3 py-2">Total</th>
                </tr></thead>
                <tbody>
                  {SIZES.map(s => (
                    <tr key={s} className="border-b border-white/[0.03]">
                      <td className="px-3 py-1.5 text-white">{s}</td>
                      <td className="px-3 py-1.5"><NumInp v={sizes[s]?.p || ''} on={v => setSizes(p => ({ ...p, [s]: { ...p[s], p: v } }))} /></td>
                      <td className="px-3 py-1.5"><NumInp v={sizes[s]?.pj || ''} on={v => setSizes(p => ({ ...p, [s]: { ...p[s], pj: v } }))} /></td>
                      <td className="px-3 py-1.5 text-right text-slate-300 tabular-nums">{sizeTotals.perRow[s] || 0}</td>
                    </tr>
                  ))}
                  <tr className="bg-white/[0.03] font-bold text-white">
                    <td className="px-3 py-2">TOTAL PCS</td>
                    <td className="px-3 py-2 text-right tabular-nums">{sizeTotals.p}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{sizeTotals.pj}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-fuchsia-300">{sizeTotals.total}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* D. DAFTAR NAMA & NOMOR */}
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-bold text-fuchsia-200">D. Daftar Nama &amp; Nomor</h2>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-400">Nama terisi: <strong className="text-white">{namesFilled}</strong></span>
                {cekNama && <span className={`font-semibold px-2 py-0.5 rounded-full border ${cekNama === 'Cocok' ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/25' : 'text-rose-300 bg-rose-500/15 border-rose-500/25'}`}>{cekNama}</span>}
                <button onClick={() => setNames(n => [...n, { nama: '', nomor: '', size: '', lengan: '', catatan: '' }])} className="text-fuchsia-300 border border-fuchsia-500/25 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 px-2.5 py-1 rounded-lg">+ Baris</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-white/[0.06]">
                  <th className="text-left px-2 py-2 w-10">No</th><th className="text-left px-2 py-2">Nama Punggung</th><th className="text-left px-2 py-2 w-20">Nomor</th><th className="text-left px-2 py-2 w-24">Size</th><th className="text-left px-2 py-2 w-24">Lengan</th><th className="text-left px-2 py-2">Catatan</th><th className="w-8" />
                </tr></thead>
                <tbody>
                  {names.map((n, i) => (
                    <tr key={i} className="border-b border-white/[0.03]">
                      <td className="px-2 py-1 text-slate-500 tabular-nums">{i + 1}</td>
                      <td className="px-2 py-1"><input className={iCls} value={n.nama} onChange={e => setNames(p => p.map((x, j) => j === i ? { ...x, nama: e.target.value } : x))} /></td>
                      <td className="px-2 py-1"><input className={`${iCls} ${n.nomor.trim() && nomorDup.has(n.nomor.trim()) ? 'border-rose-500/60 text-rose-300' : ''}`} value={n.nomor} onChange={e => setNames(p => p.map((x, j) => j === i ? { ...x, nomor: e.target.value } : x))} /></td>
                      <td className="px-2 py-1"><input className={iCls} value={n.size} onChange={e => setNames(p => p.map((x, j) => j === i ? { ...x, size: e.target.value } : x))} /></td>
                      <td className="px-2 py-1"><input className={iCls} value={n.lengan} onChange={e => setNames(p => p.map((x, j) => j === i ? { ...x, lengan: e.target.value } : x))} placeholder="P/Pj" /></td>
                      <td className="px-2 py-1"><input className={iCls} value={n.catatan} onChange={e => setNames(p => p.map((x, j) => j === i ? { ...x, catatan: e.target.value } : x))} /></td>
                      <td className="px-2 py-1 text-center"><button onClick={() => setNames(p => p.filter((_, j) => j !== i))} className="text-rose-500 hover:text-rose-300 text-xs">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nomorDup.size > 0 && <p className="text-[11px] text-rose-300 mt-2">Nomor ganda: {[...nomorDup].join(', ')} — cek ulang.</p>}
          </div>

          {/* E. SERAH TERIMA */}
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5">
            <h2 className="text-sm font-bold text-fuchsia-200 mb-3">E. Serah Terima</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SERAH_ROLES.map(r => (
                <div key={r.key} className="rounded-xl border border-white/[0.06] bg-[#0d1117] p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-300">{r.label}</p>
                  <input className={iCls} placeholder="Nama" value={serah[r.key]?.nama || ''} onChange={e => setSerah(s => ({ ...s, [r.key]: { ...s[r.key], nama: e.target.value } }))} />
                  <input type="date" className={iCls + ' date-input'} value={serah[r.key]?.tgl || ''} onChange={e => setSerah(s => ({ ...s, [r.key]: { ...s[r.key], tgl: e.target.value } }))} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button onClick={handleExport} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-green-700 hover:bg-green-600 px-4 py-2.5 rounded-xl transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Export Excel
            </button>
            <button onClick={save} disabled={saving} className="text-sm font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 px-5 py-2.5 rounded-xl transition-colors shadow-lg shadow-fuchsia-500/20">{saving ? 'Menyimpan...' : 'Simpan Job Ticket'}</button>
          </div>
        </>
      )}
    </div>
  );
}

function L({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <div className={full ? 'sm:col-span-2' : ''}><label className="block text-[11px] font-medium text-slate-400 mb-1">{label}</label>{children}</div>;
}
function NumInp({ v, on }: { v: string; on: (v: string) => void }) {
  return <input inputMode="numeric" value={v} onChange={e => on(e.target.value.replace(/\D/g, ''))} className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-2 py-1.5 text-right tabular-nums focus:outline-none focus:border-fuchsia-500/40" placeholder="0" />;
}

// ── Parse JSON tersimpan ──
function parseSizes(raw: unknown): Record<string, SizeRow> {
  const base = emptySizes();
  try { const o = JSON.parse(String(raw || '{}')); if (o && typeof o === 'object') for (const s of SIZES) if (o[s]) base[s] = { p: String(o[s].p ?? ''), pj: String(o[s].pj ?? '') }; } catch { /* default */ }
  return base;
}
function parseNames(raw: unknown): NameRow[] {
  try {
    const a = JSON.parse(String(raw || '[]'));
    if (Array.isArray(a) && a.length > 0) return a.map((n: Row) => ({ nama: String(n.nama || ''), nomor: String(n.nomor || ''), size: String(n.size || ''), lengan: String(n.lengan || ''), catatan: String(n.catatan || '') }));
  } catch { /* default */ }
  return emptyNames();
}
function parseSerah(raw: unknown): Record<string, SerahRow> {
  const base = emptySerah();
  try { const o = JSON.parse(String(raw || '{}')); if (o && typeof o === 'object') for (const r of SERAH_ROLES) if (o[r.key]) base[r.key] = { nama: String(o[r.key].nama || ''), tgl: toDateInput(o[r.key].tgl) }; } catch { /* default */ }
  return base;
}
