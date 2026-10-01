'use client';

// Halaman Progress sederhana (Proofing / Design). Berbeda dengan Progress
// Printing/Press dkk: TIDAK pakai paket / poin / target. Cukup catat
// Tanggal, Customer, dan Qty per hari. Read + tambah + edit inline + hapus.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { useToast } from '@/lib/toast';
import { PROGRESS_ACCENTS } from './ProgressLinePage';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtDayShort(iso: string): string {
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!m || !d) return iso;
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][m - 1]}`;
}

interface SRow { id: number; tanggal: string; customer: string; qty: number; keterangan: string; }
interface CustomerLite { id: number; nama: string; no_hp: string; kabupaten_kota: string; }

export default function SimpleProgressPage({ table, title, accent = 'sky', ketOptions }: {
  table: string; title: string; accent?: keyof typeof PROGRESS_ACCENTS;
  // Kalau diisi, muncul kolom + dropdown "Keterangan" (mis. status revisi).
  ketOptions?: string[];
}) {
  const toast = useToast();
  const a = PROGRESS_ACCENTS[accent] || PROGRESS_ACCENTS.sky;
  const hasKet = !!(ketOptions && ketOptions.length);
  const [month, setMonth] = useState(currentYm());
  const [rows, setRows] = useState<SRow[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTanggal, setNewTanggal] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newKeterangan, setNewKeterangan] = useState('');
  const [saving, setSaving] = useState(false);

  const monthLabel = useMemo(() => { const [y, m] = month.split('-').map(Number); return `${BULAN_ID[(m || 1) - 1]?.toUpperCase() || ''} ${y || ''}`; }, [month]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [all, cust] = await Promise.all([
        dbGet<Row>(table).catch(() => []),
        dbGet<Row>('customers').catch(() => []),
      ]);
      setCustomers((cust as Row[]).map(c => ({
        id: Number(c.id), nama: String(c.nama || ''),
        no_hp: String(c.no_hp || ''), kabupaten_kota: String(c.kabupaten_kota || ''),
      })));
      setRows((all as Row[])
        .filter(r => String(r.tanggal || '').slice(0, 7) === month)
        .sort((x, y) => String(x.tanggal).localeCompare(String(y.tanggal)) || Number(x.id) - Number(y.id))
        .map(r => ({ id: Number(r.id), tanggal: String(r.tanggal).slice(0, 10), customer: String(r.customer || ''), qty: Number(r.qty) || 0, keterangan: String(r.keterangan || '') })));
    } catch { setRows([]); }
    setLoading(false);
  }, [table, month]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const groupedByDate = useMemo(() => {
    const g: Record<string, SRow[]> = {};
    for (const r of rows) (g[r.tanggal] ||= []).push(r);
    return g;
  }, [rows]);

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);

  async function addRow() {
    if (!newTanggal) { toast.warning('Validasi', 'Pilih tanggal.'); return; }
    if (!newCustomer.trim()) { toast.warning('Validasi', 'Isi nama customer.'); return; }
    setSaving(true);
    try {
      await dbCreate(table, { tanggal: newTanggal, customer: newCustomer.trim(), qty: Number(newQty) || 0, ...(hasKet ? { keterangan: newKeterangan || null } : {}) });
      setNewCustomer(''); setNewQty(''); setNewKeterangan('');
      await fetchAll();
      toast.success('Ditambahkan', `${newCustomer.trim()} tanggal ${fmtDayShort(newTanggal)}.`);
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  async function persist(row: SRow, patch: Partial<SRow>) {
    const merged = { ...row, ...patch };
    setRows(prev => prev.map(r => r.id === row.id ? merged : r));
    try { await dbUpdate(table, row.id, { tanggal: merged.tanggal, customer: merged.customer, qty: merged.qty, ...(hasKet ? { keterangan: merged.keterangan || null } : {}) }); }
    catch (e) { toast.error('Gagal Update', String(e)); fetchAll(); }
  }
  async function updateCustomer(row: SRow, val: string) {
    const t = val.trim();
    if (!t || t === row.customer) return;
    await persist(row, { customer: t });
  }
  async function updateQty(row: SRow, val: number) {
    if (val === row.qty) return;
    await persist(row, { qty: val });
  }
  async function updateKeterangan(row: SRow, val: string) {
    if (val === row.keterangan) return;
    await persist(row, { keterangan: val });
  }
  async function deleteRow(id: number, customer: string) {
    const yes = await toast.confirm({ title: 'Hapus Baris?', message: `Baris ${customer || ''} akan dihapus permanen.`, type: 'danger', confirmText: 'Ya, Hapus' });
    if (!yes) return;
    try { await dbDelete(table, id); await fetchAll(); toast.success('Dihapus', 'Baris berhasil dihapus.'); }
    catch (e) { toast.error('Gagal', String(e)); }
  }

  if (loading) return (
    <div className="space-y-5"><div className="h-24 bg-white/[0.03] rounded-2xl animate-pulse" /><div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" /></div>
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className={`relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br ${a.heroGrad} to-transparent p-5 sm:p-6`}>
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${a.iconBg} border grid place-items-center shrink-0`}>
              <svg className={`w-5 h-5 ${a.iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" /></svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{title} · {monthLabel}</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">Catatan harian per customer — tanggal, nama, dan qty saja.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:block">Bulan</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className={`bg-[#111827] border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none ${a.ring} date-input`} />
            <button onClick={() => setMonth(currentYm())}
              className="text-xs font-medium text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-white/10 bg-[#111827] hover:bg-white/[0.04] transition-colors">Bulan Ini</button>
          </div>
        </div>
      </div>

      {/* Form tambah */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${a.iconBg} border grid place-items-center`}>
            <svg className={`w-4 h-4 ${a.iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          </div>
          <p className="text-sm font-semibold text-white">Tambah Baris Baru</p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-full sm:w-[170px]">
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Tanggal *</label>
            <input type="date" value={newTanggal} onChange={e => setNewTanggal(e.target.value)} min={`${month}-01`} max={`${month}-31`}
              className={`w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none ${a.ring} date-input`} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Customer *</label>
            <CustomerNameInput value={newCustomer} onChange={setNewCustomer} customers={customers} ringCls={a.ring} />
          </div>
          {hasKet && (
            <div className="w-full sm:w-[160px]">
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Keterangan</label>
              <select value={newKeterangan} onChange={e => setNewKeterangan(e.target.value)}
                className={`w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none ${a.ring}`}>
                <option value="">—</option>
                {ketOptions!.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          )}
          <div className="w-full sm:w-[120px]">
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Qty</label>
            <input type="text" inputMode="numeric" value={newQty} onChange={e => setNewQty(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter') addRow(); }} placeholder="0"
              className={`w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none ${a.ring} tabular-nums`} />
          </div>
          <button onClick={addRow} disabled={saving}
            className={`inline-flex items-center justify-center gap-2 ${a.addBtn} disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg h-[38px]`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            {saving ? '...' : 'Tambah'}
          </button>
        </div>
      </div>

      {/* Tabel */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-x-auto">
        <div className="px-4 py-2 bg-white text-slate-800 border-b border-slate-200 font-bold text-sm tracking-wide">BULAN {monthLabel}</div>
        <table className="w-full min-w-[480px] text-sm border-collapse">
          <thead>
            <tr className="text-slate-800">
              <th className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold w-28">TANGGAL</th>
              <th className="bg-rose-100 border border-slate-300 px-2 py-2 text-left font-bold">CUSTOMER</th>
              {hasKet && <th className="bg-amber-100 border border-slate-300 px-2 py-2 text-center font-bold w-36">KETERANGAN</th>}
              <th className="bg-sky-100 border border-slate-300 px-2 py-2 text-center font-bold w-24">QTY</th>
              <th className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold w-14"></th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(groupedByDate).length === 0 ? (
              <tr><td colSpan={hasKet ? 5 : 4} className="border border-slate-300 px-3 py-8 text-center text-sm text-slate-500 bg-white">Belum ada data untuk bulan ini. Tambah baris di atas.</td></tr>
            ) : (
              Object.entries(groupedByDate).map(([date, group]) => (
                group.map((r, i) => (
                  <tr key={r.id} className="bg-white hover:bg-slate-50 text-slate-800">
                    {i === 0 && <td rowSpan={group.length} className="border border-slate-300 px-2 py-2 text-center text-slate-700 font-medium align-middle">{fmtDayShort(date)}</td>}
                    <td className="border border-slate-300 px-2 py-1">
                      <input type="text" defaultValue={r.customer} onBlur={e => updateCustomer(r, e.target.value)}
                        className="w-full bg-transparent focus:bg-slate-50 focus:outline-none px-1 py-0.5 rounded font-medium" />
                    </td>
                    {hasKet && (
                      <td className="border border-slate-300 px-1 py-1">
                        <select value={r.keterangan} onChange={e => updateKeterangan(r, e.target.value)}
                          className={`w-full bg-transparent text-xs px-1 py-0.5 rounded focus:outline-none focus:bg-slate-50 ${r.keterangan ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
                          <option value="">—</option>
                          {ketOptions!.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                    )}
                    <td className="border border-slate-300 px-1 py-1 text-center">
                      <QtyCell value={r.qty} onCommit={val => updateQty(r, val)} />
                    </td>
                    <td className="border border-slate-300 px-1 py-1 text-center">
                      <button onClick={() => deleteRow(r.id, r.customer)} className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50" title="Hapus baris">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166M18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165" /></svg>
                      </button>
                    </td>
                  </tr>
                ))
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 text-slate-900 font-bold text-sm">
                <td className="border border-slate-300 px-2 py-2 text-center" colSpan={hasKet ? 3 : 2}>TOTAL</td>
                <td className="border border-slate-300 px-2 py-2 text-center tabular-nums text-sky-700">{totalQty}</td>
                <td className="border border-slate-300" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* Inline editable numeric qty cell. */
function QtyCell({ value, onCommit }: { value: number; onCommit: (val: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(String(value || ''));
  useEffect(() => { setLocal(String(value || '')); }, [value]);
  if (editing) {
    return (
      <input type="text" inputMode="numeric" autoFocus value={local}
        onChange={e => setLocal(e.target.value.replace(/\D/g, ''))}
        onBlur={() => { setEditing(false); const n = Number(local) || 0; if (n !== value) onCommit(n); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setLocal(String(value || '')); setEditing(false); } }}
        className="w-full bg-transparent text-center focus:outline-none focus:bg-slate-100 rounded tabular-nums" />
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className="w-full text-center hover:bg-slate-100 rounded px-1 py-0.5 tabular-nums">
      {value > 0 ? value : <span className="text-slate-300">—</span>}
    </button>
  );
}

/* Autocomplete customer dari master customers. */
function CustomerNameInput({ value, onChange, customers, ringCls }: {
  value: string; onChange: (v: string) => void; customers: CustomerLite[]; ringCls: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const q = value.trim().toLowerCase();
  const matches = useMemo(() => q ? customers.filter(c => c.nama.toLowerCase().includes(q)).slice(0, 40) : [], [q, customers]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={boxRef} className="relative">
      <input type="text" value={value} autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
        placeholder="Ketik nama customer..."
        className={`w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none ${ringCls}`} />
      {open && matches.length > 0 && (
        <div className="absolute z-40 mt-1 w-full max-h-72 overflow-y-auto bg-[#0d1117] border border-white/10 rounded-lg shadow-2xl shadow-black/60">
          {matches.map(c => (
            <button key={c.id} type="button"
              onMouseDown={e => { e.preventDefault(); onChange(c.nama); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-white/[0.05] border-b border-white/[0.04] last:border-0 transition-colors">
              <p className="text-sm text-white truncate">{c.nama}</p>
              <p className="text-xs text-slate-500 truncate">{c.no_hp || '—'}{c.kabupaten_kota ? ` · ${c.kabupaten_kota}` : ''}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
