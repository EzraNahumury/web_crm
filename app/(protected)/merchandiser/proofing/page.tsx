'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { useToast } from '@/lib/toast';
import { Pagination, paginate } from '@/lib/pagination';
import {
  MerchProofingRow, proofingJumlahRevisi, proofingHari, proofingMenunggu, proofingStatus,
  statusColor, fmtTgl, toDateInput, todayIsoWIB,
} from '@/lib/merchandiser';
import { Section, Grid, Field, Inp, DateInp } from '../_ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const EMPTY: MerchProofingRow = {
  no_order: '', proofing_kirim: '', proofing_feedback: '', rev1_kirim: '', rev1_feedback: '',
  rev2_kirim: '', rev2_feedback: '', rev3_kirim: '', rev3_feedback: '', proofing_fix: '',
  data_approve: '', job_ticket_ppic: '', catatan: '',
};

function toRow(r: Row): MerchProofingRow & { id: number } {
  const out = { ...EMPTY, id: Number(r.id) } as MerchProofingRow & { id: number };
  const w = out as unknown as Record<string, string>;
  for (const k of Object.keys(EMPTY)) w[k] = String(r[k] ?? '');
  return out;
}

// Info lookup dari sheet Design per No. Order.
interface DesignLookup { customer: string; dpProduksi: string; found: boolean }

export default function MerchProofingPage() {
  const toast = useToast();
  const [rows, setRows] = useState<(MerchProofingRow & { id: number })[]>([]);
  const [designMap, setDesignMap] = useState<Map<string, DesignLookup>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<(MerchProofingRow & { id: number }) | null>(null);
  const [adding, setAdding] = useState(false);
  const today = todayIsoWIB();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prof, design] = await Promise.all([
        dbGet('merch_proofing').catch(() => []),
        dbGet('merch_design').catch(() => []),
      ]);
      const m = new Map<string, DesignLookup>();
      for (const d of design as Row[]) {
        const key = String(d.no_order || '').trim();
        if (!key) continue;
        m.set(key, { customer: String(d.nama_customer || ''), dpProduksi: toDateInput(d.dp_produksi_diterima), found: true });
      }
      setDesignMap(m);
      setRows((prof as Row[]).map(toRow).sort((a, b) => a.id - b.id));
    } catch { setRows([]); setDesignMap(new Map()); }
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { setPage(1); }, [search]);

  const lookup = useCallback((no: string): DesignLookup => designMap.get(no.trim()) || { customer: '', dpProduksi: '', found: false }, [designMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.no_order.toLowerCase().includes(q) || lookup(r.no_order).customer.toLowerCase().includes(q));
  }, [rows, search, lookup]);
  const paged = paginate(filtered, page, pageSize);

  async function handleDelete(r: MerchProofingRow & { id: number }) {
    const yes = await toast.confirm({ title: 'Hapus Baris?', message: `${r.no_order || '(tanpa no order)'} akan dihapus.`, type: 'danger', confirmText: 'Ya, Hapus' });
    if (!yes) return;
    try { await dbDelete('merch_proofing', r.id); await fetchAll(); toast.deleted('Baris Dihapus'); }
    catch (e) { toast.error('Gagal', String(e)); }
  }

  async function handleExport() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const XLSX = (await import('xlsx-js-style')).default as any;
      const head = ['No', 'No. Order', 'Nama Customer / Tim', 'Tgl DP Produksi', 'Proofing Kirim', 'Proofing Feedback',
        'Revisi Proofing 1 Kirim', 'Revisi Proofing 1 Feedback', 'Revisi Proofing 2 Kirim', 'Revisi Proofing 2 Feedback',
        'Revisi Proofing 3 Kirim', 'Revisi Proofing 3 Feedback', 'Proofing Fix', 'Jumlah Revisi Proofing',
        'Data Nama/Nomor/Size Approve?', 'Menunggu Balasan (hari)', 'Hari DP Produksi → Proofing Fix', 'Job Ticket ke PPIC', 'Status', 'Catatan'];
      const body = filtered.map((r, i) => {
        const lk = lookup(r.no_order);
        return [
          i + 1, r.no_order, lk.customer, fmtTgl(lk.dpProduksi), fmtTgl(r.proofing_kirim), fmtTgl(r.proofing_feedback),
          fmtTgl(r.rev1_kirim), fmtTgl(r.rev1_feedback), fmtTgl(r.rev2_kirim), fmtTgl(r.rev2_feedback),
          fmtTgl(r.rev3_kirim), fmtTgl(r.rev3_feedback), fmtTgl(r.proofing_fix), proofingJumlahRevisi(r),
          r.data_approve, proofingMenunggu(r, today), proofingHari(r, lk.dpProduksi), fmtTgl(r.job_ticket_ppic), proofingStatus(r), r.catatan,
        ];
      });
      const headStyle = { font: { bold: true }, fill: { fgColor: { rgb: 'E2E8F0' } } };
      const aoa = [[{ v: '2. Proses Proofing', s: { font: { bold: true, sz: 13 } } }], head.map(h => ({ v: h, s: headStyle })), ...body];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: head.length - 1 } }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Proofing');
      XLSX.writeFile(wb, `merchandiser-proofing-${today}.xlsx`);
      toast.success('Excel Terunduh', 'Sheet Proofing.');
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  if (loading) return <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />;

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-fuchsia-500/[0.14] via-purple-500/[0.06] to-transparent p-5 sm:p-6">
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Merchandiser · Proofing</h1>
            <p className="text-[13px] text-slate-300 mt-0.5">Ketik No. Order; customer &amp; tgl DP Produksi otomatis dari sheet Design.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleExport} className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-green-700 hover:bg-green-600 px-3 py-2.5 rounded-xl transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Excel
            </button>
            <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-500 px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-fuchsia-500/20">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Tambah Baris
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-3">
        <div className="relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m0 0A7.5 7.5 0 105.2 5.2a7.5 7.5 0 0010.6 10.6z" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari No. Order / customer..."
            className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-fuchsia-500/40" />
        </div>
      </div>

      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] text-slate-500 font-semibold uppercase tracking-widest bg-white/[0.015]">
                <th className="text-left px-4 py-3">No</th>
                <th className="text-left px-4 py-3">No. Order</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Tgl DP Produksi</th>
                <th className="text-left px-4 py-3">Proofing Fix</th>
                <th className="text-right px-4 py-3">Revisi</th>
                <th className="text-right px-4 py-3">Menunggu</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">Belum ada data. Klik Tambah Baris.</td></tr>
              ) : paged.slice.map((r, i) => {
                const lk = lookup(r.no_order);
                const menunggu = proofingMenunggu(r, today);
                const menungguCls = menunggu === '' ? 'text-slate-500' : menunggu >= 3 ? 'text-rose-300 font-bold' : menunggu >= 2 ? 'text-orange-300 font-semibold' : 'text-slate-300';
                const status = proofingStatus(r);
                return (
                  <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-sm text-slate-500 tabular-nums">{(paged.current - 1) * pageSize + i + 1}</td>
                    <td className="px-4 py-3 text-sm text-blue-300 font-semibold whitespace-nowrap">{r.no_order || '-'}</td>
                    <td className="px-4 py-3 text-sm truncate max-w-[180px]" title={lk.customer}>
                      {r.no_order && !lk.found ? <span className="text-rose-300 text-xs">No. Order tidak ada di Design</span> : <span className="text-white">{lk.customer || '-'}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 tabular-nums whitespace-nowrap">{fmtTgl(lk.dpProduksi) || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-400 tabular-nums whitespace-nowrap">{fmtTgl(r.proofing_fix) || '—'}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-300 tabular-nums">{proofingJumlahRevisi(r)}</td>
                    <td className={`px-4 py-3 text-right text-sm tabular-nums ${menungguCls}`}>{menunggu === '' ? '—' : `${menunggu} hr`}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColor(status)}`}>{status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing(r)} title="Edit" className="text-amber-400 hover:text-amber-300 p-1.5 rounded-lg hover:bg-amber-500/10"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg></button>
                        <button onClick={() => handleDelete(r)} title="Hapus" className="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166M18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165" /></svg></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && <Pagination current={paged.current} total={paged.total} count={paged.count} pageSize={pageSize} onChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(1); }} />}
      </div>

      {(editing || adding) && (
        <ProofingModal
          initial={editing || { ...EMPTY, id: 0 }}
          today={today}
          lookup={lookup}
          onClose={() => { setEditing(null); setAdding(false); }}
          onSaved={async () => { setEditing(null); setAdding(false); await fetchAll(); }}
        />
      )}
    </div>
  );
}

/* ═══ Modal tambah/edit baris Proofing ═══ */
function ProofingModal({ initial, today, lookup, onClose, onSaved }: {
  initial: MerchProofingRow & { id: number };
  today: string;
  lookup: (no: string) => DesignLookup;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [f, setF] = useState<MerchProofingRow & { id: number }>(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof MerchProofingRow, v: string) => setF(p => ({ ...p, [k]: v }));
  const lk = lookup(f.no_order);

  async function save() {
    if (!f.no_order.trim()) { toast.warning('Validasi', 'No. Order wajib diisi.'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const k of Object.keys(EMPTY) as (keyof MerchProofingRow)[]) payload[k] = (f[k] as string).trim?.() ?? f[k];
      if (f.id) await dbUpdate('merch_proofing', f.id, payload);
      else await dbCreate('merch_proofing', payload);
      toast.success('Tersimpan', `${f.no_order} berhasil disimpan.`);
      await onSaved();
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  const status = proofingStatus(f);
  const menunggu = proofingMenunggu(f, today);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h3 className="text-lg font-bold text-white">{f.id ? 'Edit' : 'Tambah'} Proofing — {f.no_order || 'Baru'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/[0.05]"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <Section title="Identitas">
            <Grid>
              <Field label="No. Order *"><Inp v={f.no_order} on={v => set('no_order', v)} ph="WO1234-001" /></Field>
              <Field label="Nama Customer (otomatis)"><Inp v={lk.found ? lk.customer : (f.no_order ? 'Tidak ada di sheet Design' : '')} readOnly /></Field>
              <Field label="Tgl DP Produksi (otomatis)"><Inp v={fmtTgl(lk.dpProduksi)} readOnly /></Field>
            </Grid>
            {f.no_order && !lk.found && <p className="text-[11px] text-rose-300 mt-1.5">No. Order belum ada di sheet Design — tambahkan dulu di menu Design agar customer &amp; tgl DP Produksi terisi.</p>}
          </Section>

          <Section title="Tahap Proofing (tanggal kirim & balasan)">
            <Grid>
              <Field label="Proofing — Kirim"><DateInp v={f.proofing_kirim} on={v => set('proofing_kirim', v)} /></Field>
              <Field label="Proofing — Feedback"><DateInp v={f.proofing_feedback} on={v => set('proofing_feedback', v)} /></Field>
              <Field label="Revisi 1 — Kirim"><DateInp v={f.rev1_kirim} on={v => set('rev1_kirim', v)} /></Field>
              <Field label="Revisi 1 — Feedback"><DateInp v={f.rev1_feedback} on={v => set('rev1_feedback', v)} /></Field>
              <Field label="Revisi 2 — Kirim"><DateInp v={f.rev2_kirim} on={v => set('rev2_kirim', v)} /></Field>
              <Field label="Revisi 2 — Feedback"><DateInp v={f.rev2_feedback} on={v => set('rev2_feedback', v)} /></Field>
              <Field label="Revisi 3 — Kirim (oranye)"><DateInp v={f.rev3_kirim} on={v => set('rev3_kirim', v)} accent="orange" /></Field>
              <Field label="Revisi 3 — Feedback"><DateInp v={f.rev3_feedback} on={v => set('rev3_feedback', v)} /></Field>
              <Field label="Proofing Fix (tgl)"><DateInp v={f.proofing_fix} on={v => set('proofing_fix', v)} /></Field>
            </Grid>
          </Section>

          <Section title="Approve & Serah Job Ticket">
            <Grid>
              <Field label="Data Nama/Nomor/Size Approve?">
                <select value={f.data_approve} onChange={e => set('data_approve', e.target.value)} className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-500/40">
                  <option value="">—</option><option value="Ya">Ya</option><option value="Tidak">Tidak</option>
                </select>
              </Field>
              <Field label="Job Ticket ke PPIC (tgl)"><DateInp v={f.job_ticket_ppic} on={v => set('job_ticket_ppic', v)} /></Field>
            </Grid>
          </Section>

          <Section title="Catatan">
            <textarea value={f.catatan} onChange={e => set('catatan', e.target.value)} rows={2} className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-500/40 resize-none" />
          </Section>

          <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[0.05] px-4 py-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span className="text-slate-400">Status: <span className={`font-semibold px-2 py-0.5 rounded-full border ${statusColor(status)}`}>{status}</span></span>
            <span className="text-slate-400">Jumlah Revisi: <strong className="text-white">{proofingJumlahRevisi(f)}</strong></span>
            <span className="text-slate-400">Hari DP→Fix: <strong className="text-white">{proofingHari(f, lk.dpProduksi) === '' ? '—' : proofingHari(f, lk.dpProduksi)}</strong></span>
            <span className="text-slate-400">Menunggu: <strong className="text-white">{menunggu === '' ? '—' : `${menunggu} hari`}</strong></span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-white/[0.02] shrink-0">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg border border-white/10 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] disabled:opacity-50">Batal</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-fuchsia-500/20">{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  );
}
