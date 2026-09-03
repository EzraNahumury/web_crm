'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { useToast } from '@/lib/toast';

// Halaman Progress (Printing / Press / Cutting). Struktur sama seperti Line
// Jahit (form input qty per paket + tabel target/realisasi/selisih dalam POIN)
// TAPI target FLAT 340 poin/hari (bukan dari kedatangan penjahit). Paket dibaca
// dari line_jahit_paket (shared); baris disimpan sebagai realisasi_json.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const BASE_RATE_POIN = 5000;
export const PROGRESS_TARGET_PER_DAY = 340; // poin/hari, flat

interface Paket { id: number; nama: string; kolom_prefix: string; urutan: number; rate_atasan: number; rate_celana: number; }
interface PRow { id: number; tanggal: string; customer: string; data: Record<string, number>; }
interface CustomerLite { id: number; nama: string; no_hp: string; kabupaten_kota: string; }

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtDayShort(iso: string): string {
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!m || !d) return iso;
  return `${d} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][m - 1]}`;
}
function fmtRupiah(n: number): string { return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID'); }
function fmtPoin(n: number): string {
  const val = Math.round(n * 10) / 10;
  return val.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}
function poinAtasan(p: Paket): number { return (Number(p.rate_atasan) || BASE_RATE_POIN) / BASE_RATE_POIN; }
function poinCelana(p: Paket): number { return (Number(p.rate_celana) || BASE_RATE_POIN) / BASE_RATE_POIN; }
function realisasiPoin(data: Record<string, number>, paketList: Paket[]): number {
  let total = 0;
  for (const p of paketList) {
    total += (Number(data[`${p.kolom_prefix}_atasan`]) || 0) * poinAtasan(p);
    total += (Number(data[`${p.kolom_prefix}_celana`]) || 0) * poinCelana(p);
  }
  return total;
}

const PAKET_PALETTE = [
  { tableHead: 'bg-yellow-100', tableSub: 'bg-yellow-50', formHead: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/30', formRing: 'focus:border-yellow-500/40' },
  { tableHead: 'bg-blue-100', tableSub: 'bg-blue-50', formHead: 'bg-blue-500/15 text-blue-200 border-blue-500/30', formRing: 'focus:border-blue-500/40' },
  { tableHead: 'bg-pink-100', tableSub: 'bg-pink-50', formHead: 'bg-pink-500/15 text-pink-200 border-pink-500/30', formRing: 'focus:border-pink-500/40' },
  { tableHead: 'bg-emerald-100', tableSub: 'bg-emerald-50', formHead: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30', formRing: 'focus:border-emerald-500/40' },
  { tableHead: 'bg-orange-100', tableSub: 'bg-orange-50', formHead: 'bg-orange-500/15 text-orange-200 border-orange-500/30', formRing: 'focus:border-orange-500/40' },
  { tableHead: 'bg-violet-100', tableSub: 'bg-violet-50', formHead: 'bg-violet-500/15 text-violet-200 border-violet-500/30', formRing: 'focus:border-violet-500/40' },
];
type PaletteEntry = typeof PAKET_PALETTE[number];
function paketColor(urutan: number): PaletteEntry {
  const idx = ((urutan || 1) - 1) % PAKET_PALETTE.length;
  return PAKET_PALETTE[idx < 0 ? 0 : idx];
}

export interface ProgressAccent {
  heroGrad: string; iconBg: string; iconText: string; addBtn: string; ring: string;
}
export const PROGRESS_ACCENTS: Record<string, ProgressAccent> = {
  sky: { heroGrad: 'from-sky-500/[0.14] via-blue-500/[0.06]', iconBg: 'from-sky-500/25 to-sky-500/5 border-sky-500/25', iconText: 'text-sky-300', addBtn: 'bg-sky-600 hover:bg-sky-500 shadow-sky-500/20', ring: 'focus:border-sky-500/40' },
  fuchsia: { heroGrad: 'from-fuchsia-500/[0.14] via-purple-500/[0.06]', iconBg: 'from-fuchsia-500/25 to-fuchsia-500/5 border-fuchsia-500/25', iconText: 'text-fuchsia-300', addBtn: 'bg-fuchsia-600 hover:bg-fuchsia-500 shadow-fuchsia-500/20', ring: 'focus:border-fuchsia-500/40' },
  orange: { heroGrad: 'from-orange-500/[0.14] via-amber-500/[0.06]', iconBg: 'from-orange-500/25 to-orange-500/5 border-orange-500/25', iconText: 'text-orange-300', addBtn: 'bg-orange-600 hover:bg-orange-500 shadow-orange-500/20', ring: 'focus:border-orange-500/40' },
  teal: { heroGrad: 'from-teal-500/[0.14] via-emerald-500/[0.06]', iconBg: 'from-teal-500/25 to-teal-500/5 border-teal-500/25', iconText: 'text-teal-300', addBtn: 'bg-teal-600 hover:bg-teal-500 shadow-teal-500/20', ring: 'focus:border-teal-500/40' },
};

export default function ProgressLinePage({ table, title, accent }: {
  table: 'progress_printing' | 'progress_press' | 'progress_cutting' | 'progress_shipment';
  title: string;
  accent: keyof typeof PROGRESS_ACCENTS;
}) {
  const toast = useToast();
  const a = PROGRESS_ACCENTS[accent];
  const [month, setMonth] = useState(currentYm());
  const [rows, setRows] = useState<PRow[]>([]);
  const [paketList, setPaketList] = useState<Paket[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTanggal, setNewTanggal] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [newQty, setNewQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editingRow, setEditingRow] = useState<PRow | null>(null);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return `${BULAN_ID[(m || 1) - 1]?.toUpperCase() || ''} ${y || ''}`;
  }, [month]);

  const parseData = (raw: unknown): Record<string, number> => {
    try {
      const o = JSON.parse(String(raw || '{}'));
      if (!o || typeof o !== 'object') return {};
      const out: Record<string, number> = {};
      for (const k of Object.keys(o)) out[k] = Number((o as Record<string, unknown>)[k]) || 0;
      return out;
    } catch { return {}; }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [all, paket, cust] = await Promise.all([
        dbGet<Row>(table).catch(() => []),
        dbGet<Row>('line_jahit_paket').catch(() => []),
        dbGet<Row>('customers').catch(() => []),
      ]);
      setPaketList((paket as Paket[]).slice().sort((x, y) => (x.urutan || 0) - (y.urutan || 0)));
      setCustomers((cust as Row[]).map(c => ({
        id: Number(c.id), nama: String(c.nama || ''),
        no_hp: String(c.no_hp || ''), kabupaten_kota: String(c.kabupaten_kota || ''),
      })));
      setRows((all as Row[])
        .filter(r => String(r.tanggal || '').slice(0, 7) === month)
        .sort((x, y) => String(x.tanggal).localeCompare(String(y.tanggal)) || Number(x.id) - Number(y.id))
        .map(r => ({ id: Number(r.id), tanggal: String(r.tanggal).slice(0, 10), customer: String(r.customer || ''), data: parseData(r.realisasi_json) })));
    } catch { setRows([]); }
    setLoading(false);
  }, [table, month]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const paketCount = paketList.length;

  // Group rows by tanggal (urut ascending). Object insertion order = sorted.
  const groupedByDate = useMemo(() => {
    const g: Record<string, PRow[]> = {};
    for (const r of rows) { (g[r.tanggal] ||= []).push(r); }
    return g;
  }, [rows]);

  // Summary per paket + grand totals.
  const summary = useMemo(() => {
    const per: Record<number, { atasan: number; celana: number }> = {};
    let grandAtasan = 0, grandCelana = 0;
    for (const p of paketList) {
      let av = 0, cv = 0;
      for (const r of rows) { av += Number(r.data[`${p.kolom_prefix}_atasan`]) || 0; cv += Number(r.data[`${p.kolom_prefix}_celana`]) || 0; }
      per[p.id] = { atasan: av, celana: cv };
      grandAtasan += av; grandCelana += cv;
    }
    const totalRealisasi = rows.reduce((s, r) => s + realisasiPoin(r.data, paketList), 0);
    const distinctDates = Object.keys(groupedByDate).length;
    const totalTarget = distinctDates * PROGRESS_TARGET_PER_DAY;
    return { per, grandAtasan, grandCelana, totalRealisasi, totalTarget, distinctDates };
  }, [rows, paketList, groupedByDate]);

  async function addRow() {
    if (!newTanggal) { toast.warning('Validasi', 'Pilih tanggal.'); return; }
    if (!newCustomer.trim()) { toast.warning('Validasi', 'Isi nama customer.'); return; }
    setSaving(true);
    try {
      const data: Record<string, number> = {};
      for (const p of paketList) {
        data[`${p.kolom_prefix}_atasan`] = Number(newQty[`${p.kolom_prefix}_atasan`]) || 0;
        data[`${p.kolom_prefix}_celana`] = Number(newQty[`${p.kolom_prefix}_celana`]) || 0;
      }
      await dbCreate(table, { tanggal: newTanggal, customer: newCustomer.trim(), realisasi_json: JSON.stringify(data) });
      setNewCustomer(''); setNewQty({});
      await fetchAll();
      toast.success('Row Ditambahkan', `${newCustomer.trim()} tanggal ${fmtDayShort(newTanggal)}.`);
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  async function persistRow(row: PRow, patch: Partial<PRow>) {
    const merged = { ...row, ...patch, data: { ...row.data, ...(patch.data || {}) } };
    setRows(prev => prev.map(r => r.id === row.id ? merged : r));
    try {
      await dbUpdate(table, row.id, {
        tanggal: merged.tanggal, customer: merged.customer, realisasi_json: JSON.stringify(merged.data),
      });
    } catch (e) { toast.error('Gagal Update', String(e)); fetchAll(); }
  }

  async function updateCell(row: PRow, key: string, val: number) {
    await persistRow(row, { data: { ...row.data, [key]: val } });
  }
  async function updateCustomer(row: PRow, val: string) {
    const trimmed = val.trim();
    if (!trimmed || trimmed === row.customer) return;
    await persistRow(row, { customer: trimmed });
  }
  async function deleteRow(id: number, customer: string) {
    const yes = await toast.confirm({ title: 'Hapus Baris?', message: `Baris ${customer || ''} akan dihapus permanen.`, type: 'danger', confirmText: 'Ya, Hapus' });
    if (!yes) return;
    try { await dbDelete(table, id); await fetchAll(); toast.success('Dihapus', 'Baris berhasil dihapus.'); }
    catch (e) { toast.error('Gagal', String(e)); }
  }

  const bodyColCount = 6 + paketCount * 2;

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
              <p className="text-[13px] text-slate-300 mt-0.5">
                Realisasi harian per customer. Target <span className="text-white font-semibold">{PROGRESS_TARGET_PER_DAY} poin/hari</span> (flat).
              </p>
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

      {paketCount === 0 ? (
        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-10 text-center">
          <p className="text-sm text-slate-300 font-medium">Belum ada paket.</p>
          <p className="text-xs text-slate-500 mt-1">Tambah paket dulu di menu Line Jahit (paket dipakai bersama).</p>
        </div>
      ) : (
      <>
      {/* Form Tambah Baris */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${a.iconBg} border grid place-items-center`}>
            <svg className={`w-4 h-4 ${a.iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          </div>
          <p className="text-sm font-semibold text-white">Tambah Baris Baru</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Tanggal *</label>
            <input type="date" value={newTanggal} onChange={e => setNewTanggal(e.target.value)} min={`${month}-01`} max={`${month}-31`}
              className={`w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none ${a.ring} date-input`} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Customer *</label>
            <CustomerNameInput value={newCustomer} onChange={setNewCustomer} customers={customers} ringCls={a.ring} />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {paketList.map(p => (
            <div key={p.id} className="flex-1 min-w-[220px]">
              <QtyBlock title={p.nama} palette={paketColor(p.urutan)}
                atasan={newQty[`${p.kolom_prefix}_atasan`] || ''} celana={newQty[`${p.kolom_prefix}_celana`] || ''}
                onAtasan={v => setNewQty(pr => ({ ...pr, [`${p.kolom_prefix}_atasan`]: v }))}
                onCelana={v => setNewQty(pr => ({ ...pr, [`${p.kolom_prefix}_celana`]: v }))} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={() => { setNewTanggal(''); setNewCustomer(''); setNewQty({}); }} disabled={saving}
            className="text-sm font-medium text-slate-400 hover:text-white border border-white/10 hover:bg-white/[0.04] disabled:opacity-40 px-4 py-2 rounded-lg transition-colors">Reset</button>
          <button onClick={addRow} disabled={saving}
            className={`inline-flex items-center gap-2 ${a.addBtn} disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            {saving ? 'Menyimpan...' : 'Tambah Baris'}
          </button>
        </div>
      </div>

      {/* Tabel */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-x-auto">
        <div className="rounded-t-2xl px-4 py-2 bg-white text-slate-800 border-b border-slate-200 font-bold text-sm tracking-wide">BULAN {monthLabel}</div>
        <table className="w-full min-w-[720px] text-sm border-collapse">
          <thead>
            <tr className="text-slate-800">
              <th rowSpan={3} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold w-24 align-middle">TANGGAL</th>
              <th rowSpan={3} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold align-middle">CUSTOMER</th>
              <th colSpan={paketCount * 2} className="bg-orange-100 border border-slate-300 px-2 py-2 text-center font-bold">PAKET</th>
              <th rowSpan={3} className="bg-emerald-100 border border-slate-300 px-2 py-2 text-center font-bold w-20 align-middle">TARGET</th>
              <th rowSpan={3} className="bg-sky-100 border border-slate-300 px-2 py-2 text-center font-bold w-20 align-middle">REALISASI</th>
              <th rowSpan={3} className="bg-amber-100 border border-slate-300 px-2 py-2 text-center font-bold w-20 align-middle">SELISIH</th>
              <th rowSpan={3} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold w-16 align-middle"></th>
            </tr>
            <tr className="text-slate-800">
              {paketList.map(p => {
                const c = paketColor(p.urutan);
                return (
                  <th key={p.id} colSpan={2} className={`${c.tableHead} border border-slate-300 px-2 py-1.5 text-center font-semibold`}>
                    <div className="leading-tight">{p.nama}</div>
                    <div className="text-[9px] font-normal text-slate-500 leading-tight" title={`Rate atasan ${fmtRupiah(p.rate_atasan)} · celana ${fmtRupiah(p.rate_celana)}`}>
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
              <tr><td colSpan={bodyColCount} className="border border-slate-300 px-3 py-8 text-center text-sm text-slate-500 bg-white">Belum ada data untuk bulan ini. Tambah baris di atas.</td></tr>
            ) : (
              Object.entries(groupedByDate).map(([date, group]) => (
                group.map((r, i) => (
                  <tr key={r.id} className="bg-white hover:bg-slate-50 text-slate-800 text-sm">
                    {i === 0 && (
                      <td rowSpan={group.length} className="border border-slate-300 px-2 py-2 text-center text-slate-700 font-medium align-middle">{fmtDayShort(date)}</td>
                    )}
                    <td className="border border-slate-300 px-2 py-1">
                      <input type="text" defaultValue={r.customer}
                        onBlur={e => updateCustomer(r, e.target.value)}
                        className="w-full bg-transparent focus:bg-slate-50 focus:outline-none px-1 py-0.5 rounded" />
                    </td>
                    {paketList.flatMap(p => {
                      const keyA = `${p.kolom_prefix}_atasan`;
                      const keyC = `${p.kolom_prefix}_celana`;
                      return [
                        <td key={`${p.id}-a`} className="border border-slate-300 px-1 py-1 text-center">
                          <QtyCell value={Number(r.data[keyA]) || 0} onCommit={val => updateCell(r, keyA, val)} />
                        </td>,
                        <td key={`${p.id}-c`} className="border border-slate-300 px-1 py-1 text-center">
                          <QtyCell value={Number(r.data[keyC]) || 0} onCommit={val => updateCell(r, keyC, val)} />
                        </td>,
                      ];
                    })}
                    {i === 0 && (
                      <td rowSpan={group.length} className="border border-slate-300 px-2 py-1 text-center align-middle tabular-nums font-semibold text-emerald-700 bg-emerald-50/40" title="Target poin harian (flat)">
                        {fmtPoin(PROGRESS_TARGET_PER_DAY)}
                      </td>
                    )}
                    {i === 0 && (() => {
                      const totalRp = group.reduce((s, gr) => s + realisasiPoin(gr.data, paketList), 0);
                      return (
                        <td rowSpan={group.length} className="border border-slate-300 px-2 py-1 text-center align-middle tabular-nums font-semibold text-sky-700 bg-sky-50/40" title="Realisasi harian = Σ qty × poin">
                          {totalRp > 0 ? fmtPoin(totalRp) : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                      );
                    })()}
                    {i === 0 && (() => {
                      const totalRp = group.reduce((s, gr) => s + realisasiPoin(gr.data, paketList), 0);
                      const diff = totalRp - PROGRESS_TARGET_PER_DAY;
                      const isPositive = diff >= 0;
                      const cls = isPositive ? 'bg-emerald-50/60 text-emerald-700' : 'bg-rose-50/60 text-rose-700';
                      return (
                        <td rowSpan={group.length} className={`border border-slate-300 px-2 py-1 text-center align-middle tabular-nums font-bold ${cls}`} title="Selisih = Realisasi − Target">
                          {isPositive ? '+' : '−'}{fmtPoin(Math.abs(diff))}
                        </td>
                      );
                    })()}
                    <td className="border border-slate-300 px-1 py-1 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => setEditingRow(r)} className="text-amber-600 hover:text-amber-800 p-1 rounded hover:bg-amber-50" title="Edit baris">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                        </button>
                        <button onClick={() => deleteRow(r.id, r.customer)} className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50" title="Hapus baris">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 text-slate-900 font-bold text-sm">
                <td className="border border-slate-300 px-2 py-2 text-center" colSpan={2}>TOTAL</td>
                {paketList.flatMap(p => [
                  <td key={`${p.id}-a`} className="border border-slate-300 px-1 py-2 text-center tabular-nums">{summary.per[p.id]?.atasan || 0}</td>,
                  <td key={`${p.id}-c`} className="border border-slate-300 px-1 py-2 text-center tabular-nums">{summary.per[p.id]?.celana || 0}</td>,
                ])}
                <td className="border border-slate-300 px-2 py-2 text-center tabular-nums text-emerald-700">{fmtPoin(summary.totalTarget)}</td>
                <td className="border border-slate-300 px-2 py-2 text-center tabular-nums text-sky-700">{fmtPoin(summary.totalRealisasi)}</td>
                {(() => {
                  const diff = summary.totalRealisasi - summary.totalTarget;
                  const pos = diff >= 0;
                  return <td className={`border border-slate-300 px-2 py-2 text-center tabular-nums ${pos ? 'text-emerald-700' : 'text-rose-700'}`}>{pos ? '+' : '−'}{fmtPoin(Math.abs(diff))}</td>;
                })()}
                <td className="border border-slate-300"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </>
      )}

      {editingRow && (
        <EditProgressModal row={editingRow} paketList={paketList} accent={a} customers={customers}
          onCancel={() => setEditingRow(null)}
          onSave={async (patch) => { await persistRow(editingRow, patch); setEditingRow(null); }} />
      )}
    </div>
  );
}

/* Input nama customer dengan autocomplete dari master customers (nama + no HP
   + kota). Ketik untuk filter; klik salah satu untuk isi otomatis. Tetap bisa
   ketik nama baru yang tidak ada di daftar. */
function CustomerNameInput({ value, onChange, customers, ringCls }: {
  value: string; onChange: (v: string) => void; customers: CustomerLite[]; ringCls: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const q = value.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    return customers.filter(c => c.nama.toLowerCase().includes(q)).slice(0, 40);
  }, [q, customers]);
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
              <p className="text-xs text-slate-500 truncate">
                {c.no_hp || '—'}{c.kabupaten_kota ? ` · ${c.kabupaten_kota}` : ''}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Inline editable numeric cell. */
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

/* Blok input qty per paket (atasan/celana). */
function QtyBlock({ title, palette, atasan, celana, onAtasan, onCelana }: {
  title: string; palette: PaletteEntry; atasan: string; celana: string; onAtasan: (v: string) => void; onCelana: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden h-full">
      <div className={`px-3 py-1.5 border-b ${palette.formHead} text-[11px] font-bold uppercase tracking-widest text-center`}>{title}</div>
      <div className="grid grid-cols-2 gap-2 p-2">
        <label className="block">
          <span className="block text-[10px] font-medium text-slate-500 mb-1 text-center">Atasan</span>
          <input type="text" inputMode="numeric" value={atasan} onChange={e => onAtasan(e.target.value.replace(/\D/g, ''))} placeholder="0"
            className={`w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none ${palette.formRing} text-center tabular-nums`} />
        </label>
        <label className="block">
          <span className="block text-[10px] font-medium text-slate-500 mb-1 text-center">Celana</span>
          <input type="text" inputMode="numeric" value={celana} onChange={e => onCelana(e.target.value.replace(/\D/g, ''))} placeholder="0"
            className={`w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none ${palette.formRing} text-center tabular-nums`} />
        </label>
      </div>
    </div>
  );
}

/* Modal edit baris. */
function EditProgressModal({ row, paketList, accent, customers, onCancel, onSave }: {
  row: PRow; paketList: Paket[]; accent: ProgressAccent; customers: CustomerLite[];
  onCancel: () => void; onSave: (patch: Partial<PRow>) => void | Promise<void>;
}) {
  const [tanggal, setTanggal] = useState(String(row.tanggal).slice(0, 10));
  const [customer, setCustomer] = useState(row.customer);
  const [qty, setQty] = useState<Record<string, string>>(() => {
    const q: Record<string, string> = {};
    for (const p of paketList) {
      q[`${p.kolom_prefix}_atasan`] = String(row.data[`${p.kolom_prefix}_atasan`] || '');
      q[`${p.kolom_prefix}_celana`] = String(row.data[`${p.kolom_prefix}_celana`] || '');
    }
    return q;
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!tanggal) return;
    setBusy(true);
    const data: Record<string, number> = {};
    for (const p of paketList) {
      data[`${p.kolom_prefix}_atasan`] = Number(qty[`${p.kolom_prefix}_atasan`]) || 0;
      data[`${p.kolom_prefix}_celana`] = Number(qty[`${p.kolom_prefix}_celana`]) || 0;
    }
    await onSave({ tanggal, customer: customer.trim(), data });
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white">Edit Baris</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Tanggal *</label>
            <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)}
              className={`w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none ${accent.ring} date-input`} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Customer</label>
            <CustomerNameInput value={customer} onChange={setCustomer} customers={customers} ringCls={accent.ring} />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {paketList.map(p => (
            <div key={p.id} className="flex-1 min-w-[200px]">
              <QtyBlock title={p.nama} palette={paketColor(p.urutan)}
                atasan={qty[`${p.kolom_prefix}_atasan`] || ''} celana={qty[`${p.kolom_prefix}_celana`] || ''}
                onAtasan={v => setQty(pr => ({ ...pr, [`${p.kolom_prefix}_atasan`]: v }))}
                onCelana={v => setQty(pr => ({ ...pr, [`${p.kolom_prefix}_celana`]: v }))} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onCancel} disabled={busy} className="text-sm font-medium text-slate-400 hover:text-white border border-white/10 hover:bg-white/[0.04] px-4 py-2 rounded-lg transition-colors">Batal</button>
          <button onClick={submit} disabled={busy} className={`text-sm font-semibold text-white ${accent.addBtn} px-5 py-2 rounded-lg transition-colors shadow-lg disabled:opacity-40`}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  );
}
