'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { useToast } from '@/lib/toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDayShort(iso: string): string {
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!m || !d) return iso;
  return `${d} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][m - 1]}`;
}

interface Paket {
  id: number;
  nama: string;
  kolom_prefix: string;
  urutan: number;
}

interface Attendance {
  id: number;
  tanggal: string;
  jumlah_standar: number;
  jumlah_special: number;
  created_at?: string;
}

interface LineJahitRow {
  id: number;
  tanggal: string;
  customer: string;
  [key: string]: string | number; // qty kolom dinamis
}

// Palet warna paket — dipakai bergilir sesuai urutan. Class Tailwind
// ditulis literal supaya JIT scanner Tailwind bisa detect.
const PAKET_PALETTE = [
  { // 1 — kuning (default STANDAR)
    tableHead: 'bg-yellow-100',
    tableSub: 'bg-yellow-50',
    formHead: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/30',
    formRing: 'focus:border-yellow-500/40',
  },
  { // 2 — biru (default KLASIK)
    tableHead: 'bg-blue-100',
    tableSub: 'bg-blue-50',
    formHead: 'bg-blue-500/15 text-blue-200 border-blue-500/30',
    formRing: 'focus:border-blue-500/40',
  },
  { // 3 — pink (default PRO)
    tableHead: 'bg-pink-100',
    tableSub: 'bg-pink-50',
    formHead: 'bg-pink-500/15 text-pink-200 border-pink-500/30',
    formRing: 'focus:border-pink-500/40',
  },
  { // 4 — hijau
    tableHead: 'bg-emerald-100',
    tableSub: 'bg-emerald-50',
    formHead: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
    formRing: 'focus:border-emerald-500/40',
  },
  { // 5 — oranye
    tableHead: 'bg-orange-100',
    tableSub: 'bg-orange-50',
    formHead: 'bg-orange-500/15 text-orange-200 border-orange-500/30',
    formRing: 'focus:border-orange-500/40',
  },
  { // 6 — ungu
    tableHead: 'bg-violet-100',
    tableSub: 'bg-violet-50',
    formHead: 'bg-violet-500/15 text-violet-200 border-violet-500/30',
    formRing: 'focus:border-violet-500/40',
  },
];

type PaletteEntry = typeof PAKET_PALETTE[number];

function paketColor(urutan: number): PaletteEntry {
  const idx = ((urutan || 1) - 1) % PAKET_PALETTE.length;
  return PAKET_PALETTE[idx < 0 ? 0 : idx];
}

export default function LineJahitPage() {
  const toast = useToast();
  const [month, setMonth] = useState(currentYm());
  const [rows, setRows] = useState<LineJahitRow[]>([]);
  const [paketList, setPaketList] = useState<Paket[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state.
  const [newTanggal, setNewTanggal] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [newQty, setNewQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Row yang lagi di-edit lewat modal.
  const [editingRow, setEditingRow] = useState<LineJahitRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Modal tambah paket baru.
  const [showAddPaket, setShowAddPaket] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [allRows, allPaket, allAtt] = await Promise.all([
        dbGet('line_jahit').catch(() => []),
        dbGet('line_jahit_paket').catch(() => []),
        dbGet('penjahit_attendance').catch(() => []),
      ]);
      const [y, m] = month.split('-').map(Number);
      const monthPrefix = `${y}-${String(m).padStart(2, '0')}`;
      const filtered = (allRows as Row[]).filter(r => {
        const t = String(r.tanggal || '').slice(0, 7);
        return t === monthPrefix;
      }).sort((a, b) =>
        String(a.tanggal).localeCompare(String(b.tanggal)) || Number(a.id) - Number(b.id)
      );
      setRows(filtered as LineJahitRow[]);
      const paketSorted = (allPaket as Paket[]).slice().sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
      setPaketList(paketSorted);
      const attFiltered = (allAtt as Attendance[]).filter(a =>
        String(a.tanggal || '').slice(0, 7) === monthPrefix
      ).sort((a, b) =>
        String(b.tanggal).localeCompare(String(a.tanggal)) || Number(b.id) - Number(a.id)
      );
      setAttendance(attFiltered);
    } catch {}
    setLoading(false);
  }, [month]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return `${BULAN_ID[m - 1]?.toUpperCase() || ''} ${y}`;
  }, [month]);

  const groupedByDate = useMemo(() => {
    const g: Record<string, LineJahitRow[]> = {};
    for (const r of rows) {
      const key = String(r.tanggal).slice(0, 10);
      (g[key] ||= []).push(r);
    }
    return g;
  }, [rows]);

  // Summary per paket + grand total. Struktur:
  // per: { [paket_id]: { atasan, celana } }
  const summary = useMemo(() => {
    const per: Record<number, { atasan: number; celana: number }> = {};
    let grandAtasan = 0;
    let grandCelana = 0;
    for (const p of paketList) {
      let a = 0;
      let c = 0;
      for (const r of rows) {
        a += Number(r[`${p.kolom_prefix}_atasan`]) || 0;
        c += Number(r[`${p.kolom_prefix}_celana`]) || 0;
      }
      per[p.id] = { atasan: a, celana: c };
      grandAtasan += a;
      grandCelana += c;
    }
    return { per, grandAtasan, grandCelana, grandTotal: grandAtasan + grandCelana };
  }, [rows, paketList]);

  async function addRow() {
    if (!newTanggal) { toast.warning('Validasi', 'Pilih tanggal.'); return; }
    if (!newCustomer.trim()) { toast.warning('Validasi', 'Isi nama customer.'); return; }
    setSaving(true);
    try {
      const payload: Row = { tanggal: newTanggal, customer: newCustomer.trim() };
      for (const p of paketList) {
        payload[`${p.kolom_prefix}_atasan`] = Number(newQty[`${p.kolom_prefix}_atasan`]) || 0;
        payload[`${p.kolom_prefix}_celana`] = Number(newQty[`${p.kolom_prefix}_celana`]) || 0;
      }
      await dbCreate('line_jahit', payload);
      setNewCustomer('');
      setNewQty({});
      await fetchAll();
      toast.success('Row Ditambahkan', `${newCustomer.trim()} tanggal ${fmtDayShort(newTanggal)}.`);
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  async function updateCell(id: number, key: string, val: number) {
    try {
      await dbUpdate('line_jahit', id, { [key]: val });
      setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: val } as LineJahitRow : r));
    } catch (e) { toast.error('Gagal Update', String(e)); }
  }

  async function updateCustomer(id: number, val: string) {
    const trimmed = val.trim();
    if (!trimmed) return;
    try {
      await dbUpdate('line_jahit', id, { customer: trimmed });
      setRows(prev => prev.map(r => r.id === id ? { ...r, customer: trimmed } : r));
    } catch (e) { toast.error('Gagal Update', String(e)); }
  }

  async function saveEditRow(updated: LineJahitRow) {
    setEditSaving(true);
    try {
      const payload: Row = { tanggal: updated.tanggal, customer: updated.customer };
      for (const p of paketList) {
        payload[`${p.kolom_prefix}_atasan`] = Number(updated[`${p.kolom_prefix}_atasan`]) || 0;
        payload[`${p.kolom_prefix}_celana`] = Number(updated[`${p.kolom_prefix}_celana`]) || 0;
      }
      await dbUpdate('line_jahit', updated.id, payload);
      setEditingRow(null);
      await fetchAll();
      toast.success('Baris Diperbarui', `${updated.customer} berhasil diupdate.`);
    } catch (e) { toast.error('Gagal Update', String(e)); }
    setEditSaving(false);
  }

  async function deleteRow(id: number, customer: string) {
    const yes = await toast.confirm({
      title: 'Hapus Row?',
      message: `Baris "${customer}" akan dihapus permanen.`,
      type: 'danger',
      confirmText: 'Ya, Hapus',
    });
    if (!yes) return;
    try {
      await dbDelete('line_jahit', id);
      await fetchAll();
      toast.deleted('Row Dihapus');
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  async function handlePaketAdded() {
    setShowAddPaket(false);
    await fetchAll();
    toast.success('Paket Ditambahkan', 'Header baru muncul di tabel.');
  }

  async function deleteAttendance(a: Attendance) {
    const yes = await toast.confirm({
      title: 'Hapus catatan?',
      message: `Catatan tanggal ${fmtDayShort(a.tanggal)} akan dihapus.`,
      type: 'danger',
      confirmText: 'Ya, Hapus',
    });
    if (!yes) return;
    try {
      await dbDelete('penjahit_attendance', a.id);
      await fetchAll();
      toast.deleted('Catatan Dihapus');
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  async function handleDeletePaket(p: Paket) {
    const yes = await toast.confirm({
      title: `Hapus paket "${p.nama}"?`,
      message: `Kolom ${p.kolom_prefix}_atasan dan ${p.kolom_prefix}_celana akan dihapus permanen dari database. Semua qty ${p.nama} di seluruh baris akan hilang.`,
      type: 'danger',
      confirmText: 'Ya, Hapus Paket',
    });
    if (!yes) return;
    try {
      const res = await fetch(`/api/line-jahit/hapus-paket?id=${p.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error('Gagal', data.error || 'Gagal hapus paket.');
      } else {
        await fetchAll();
        toast.deleted(`Paket ${p.nama} dihapus`);
      }
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  const paketCount = paketList.length;
  const bodyColCount = 3 + paketCount * 2; // TANGGAL + CUSTOMER + qty + AKSI

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-cyan-500/[0.14] via-blue-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/25 to-cyan-500/5 border border-cyan-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Line Jahit · {monthLabel}</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Catatan jahit internal per tanggal + customer. {paketCount} paket × 2 tipe (Atasan/Celana).
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:block">Bulan</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="bg-[#111827] border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500/40 date-input"
            />
            <button
              onClick={() => setMonth(currentYm())}
              className="text-xs font-medium text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-white/10 bg-[#111827] hover:bg-white/[0.04] transition-colors"
            >
              Bulan Ini
            </button>
            <button
              onClick={() => setShowAddPaket(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
              title="Tambah header paket baru (misal: WARRIOR)"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Tambah Header
            </button>
          </div>
        </div>
      </div>

      {/* Form Tambah Baris — full width (Kedatangan pindah ke sidebar) */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/25 grid place-items-center">
            <svg className="w-4 h-4 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          </div>
          <p className="text-sm font-semibold text-white">Tambah Baris Baru</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Tanggal *</label>
            <input
              type="date"
              value={newTanggal}
              onChange={e => setNewTanggal(e.target.value)}
              min={`${month}-01`}
              max={`${month}-31`}
              className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/40 date-input"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Customer *</label>
            <input
              type="text"
              value={newCustomer}
              onChange={e => setNewCustomer(e.target.value)}
              placeholder="Nama customer..."
              className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/40"
            />
          </div>
        </div>

        {/* Qty per paket — dinamis, auto-wrap */}
        <div className="flex flex-wrap gap-3">
          {paketList.map(p => (
            <div key={p.id} className="flex-1 min-w-[220px]">
              <QtyBlock
                title={p.nama}
                palette={paketColor(p.urutan)}
                atasan={newQty[`${p.kolom_prefix}_atasan`] || ''}
                celana={newQty[`${p.kolom_prefix}_celana`] || ''}
                onAtasan={v => setNewQty(pr => ({ ...pr, [`${p.kolom_prefix}_atasan`]: v }))}
                onCelana={v => setNewQty(pr => ({ ...pr, [`${p.kolom_prefix}_celana`]: v }))}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => { setNewTanggal(''); setNewCustomer(''); setNewQty({}); }}
            disabled={saving}
            className="text-sm font-medium text-slate-400 hover:text-white border border-white/10 hover:bg-white/[0.04] disabled:opacity-40 px-4 py-2 rounded-lg transition-colors"
          >
            Reset
          </button>
          <button
            onClick={addRow}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-cyan-500/20"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            {saving ? 'Menyimpan...' : 'Tambah Baris'}
          </button>
        </div>
      </div>

      {/* Layout: tabel line jahit + sidebar (form Kedatangan sticky + history) */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-x-clip">
          <div className="rounded-t-2xl px-4 py-2 bg-white text-slate-800 border-b border-slate-200 font-bold text-sm tracking-wide">
            BULAN {monthLabel}
          </div>

          <table className="w-full min-w-[720px] text-sm border-collapse">
              <thead className="sticky top-14 z-30 shadow-[0_8px_16px_-8px_rgba(0,0,0,0.5)]">
                <tr className="text-slate-800">
                  <th rowSpan={3} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold w-24 align-middle">TANGGAL</th>
                  <th rowSpan={3} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold align-middle">CUSTOMER</th>
                  <th colSpan={paketCount * 2} className="bg-orange-100 border border-slate-300 px-2 py-2 text-center font-bold">PAKET</th>
                  <th rowSpan={3} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold w-20 align-middle"></th>
                </tr>
                <tr className="text-slate-800">
                  {paketList.map(p => {
                    const c = paketColor(p.urutan);
                    return (
                      <th key={p.id} colSpan={2} className={`${c.tableHead} border border-slate-300 px-2 py-1.5 text-center font-semibold relative group`}>
                        <span>{p.nama}</span>
                        <button
                          type="button"
                          onClick={() => handleDeletePaket(p)}
                          title={`Hapus paket ${p.nama}`}
                          className="absolute top-0.5 right-0.5 text-rose-600 hover:text-white hover:bg-rose-500 rounded p-0.5 opacity-40 hover:opacity-100 transition-all"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
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
                  <tr>
                    <td colSpan={bodyColCount} className="border border-slate-300 px-3 py-8 text-center text-sm text-slate-500 bg-white">
                      Belum ada data untuk bulan ini. Tambah baris di atas.
                    </td>
                  </tr>
                ) : (
                  Object.entries(groupedByDate).map(([date, group]) => (
                    group.map((r, i) => (
                      <tr key={r.id} className="bg-white hover:bg-slate-50 text-slate-800 text-sm">
                        {i === 0 && (
                          <td rowSpan={group.length} className="border border-slate-300 px-2 py-2 text-center text-slate-700 font-medium align-middle">
                            {fmtDayShort(date)}
                          </td>
                        )}
                        <td className="border border-slate-300 px-2 py-1">
                          <input
                            type="text"
                            defaultValue={r.customer}
                            onBlur={e => {
                              if (e.target.value !== r.customer) updateCustomer(r.id, e.target.value);
                            }}
                            className="w-full bg-transparent focus:bg-slate-50 focus:outline-none px-1 py-0.5 rounded"
                          />
                        </td>
                        {paketList.flatMap(p => {
                          const keyA = `${p.kolom_prefix}_atasan`;
                          const keyC = `${p.kolom_prefix}_celana`;
                          return [
                            <td key={`${p.id}-a`} className="border border-slate-300 px-1 py-1 text-center">
                              <QtyCell
                                value={Number(r[keyA]) || 0}
                                onCommit={val => updateCell(r.id, keyA, val)}
                              />
                            </td>,
                            <td key={`${p.id}-c`} className="border border-slate-300 px-1 py-1 text-center">
                              <QtyCell
                                value={Number(r[keyC]) || 0}
                                onCommit={val => updateCell(r.id, keyC, val)}
                              />
                            </td>,
                          ];
                        })}
                        <td className="border border-slate-300 px-1 py-1 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              onClick={() => setEditingRow(r)}
                              className="text-amber-600 hover:text-amber-800 p-1 rounded hover:bg-amber-50"
                              title="Edit baris"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            </button>
                            <button
                              onClick={() => deleteRow(r.id, r.customer)}
                              className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50"
                              title="Hapus baris"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
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
                  <tr className="bg-yellow-200 text-slate-900 text-sm font-bold">
                    <td colSpan={2} className="border border-slate-400 px-3 py-2 text-center uppercase tracking-wide">Total</td>
                    {paketList.flatMap(p => {
                      const s = summary.per[p.id] || { atasan: 0, celana: 0 };
                      return [
                        <td key={`${p.id}-a`} className="border border-slate-400 px-2 py-2 text-center">{s.atasan}</td>,
                        <td key={`${p.id}-c`} className="border border-slate-400 px-2 py-2 text-center">{s.celana}</td>,
                      ];
                    })}
                    <td className="border border-slate-400 px-1 py-2"></td>
                  </tr>
                </tfoot>
              )}
            </table>
        </div>

        {/* Sidebar kanan: form Kedatangan (sticky) + history bulan aktif */}
        <div className="space-y-4 xl:sticky xl:top-16 xl:self-start">
          <KedatanganPenjahitForm defaultMonth={month} onSubmitted={fetchAll} />
          <AttendanceHistoryPanel
            monthLabel={monthLabel}
            rows={attendance}
            onDelete={deleteAttendance}
          />
        </div>
      </div>

      {/* Summary panel — di bawah tabel Line Jahit */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-2xl overflow-hidden border border-white/[0.06]">
          <div className="bg-yellow-200 text-slate-800 text-center py-2 font-bold text-sm">
            PENJAHIT INTERNAL BULAN {monthLabel.split(' ')[0]}
          </div>
          <table className="w-full text-sm bg-white text-slate-800">
            <tbody>
              {paketList.map(p => {
                const c = paketColor(p.urutan);
                const s = summary.per[p.id] || { atasan: 0, celana: 0 };
                return (
                  <FragmentRow key={p.id} paket={p} palette={c} atasan={s.atasan} celana={s.celana} />
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl overflow-hidden border border-orange-500/40">
          <div className="bg-orange-400 text-slate-900 text-center py-2 font-bold text-sm uppercase tracking-wider">
            Grand Total
          </div>
          <table className="w-full text-sm bg-orange-100 text-slate-900">
            <tbody>
              <tr>
                <td className="border border-orange-300 px-3 py-2 font-semibold">GRAND TOTAL ATASAN</td>
                <td className="border border-orange-300 px-3 py-2 text-right font-bold tabular-nums">{summary.grandAtasan}</td>
              </tr>
              <tr>
                <td className="border border-orange-300 px-3 py-2 font-semibold">GRAND TOTAL CELANA</td>
                <td className="border border-orange-300 px-3 py-2 text-right font-bold tabular-nums">{summary.grandCelana}</td>
              </tr>
              <tr>
                <td className="border border-orange-300 px-3 py-2 font-bold uppercase">Grand Total</td>
                <td className="border border-orange-300 px-3 py-2 text-right font-bold tabular-nums text-lg">{summary.grandTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {editingRow && (
        <EditRowModal
          row={editingRow}
          paketList={paketList}
          saving={editSaving}
          onCancel={() => setEditingRow(null)}
          onSave={saveEditRow}
        />
      )}

      {showAddPaket && (
        <AddPaketModal
          onCancel={() => setShowAddPaket(false)}
          onAdded={handlePaketAdded}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Sub-komponen tabel summary (2 baris per paket). Dipisah supaya JSX
   parent tidak crowded — logic-nya cuma render 2 <tr> berturut-turut.
   ───────────────────────────────────────────────────────────────────── */
function FragmentRow({ paket, palette, atasan, celana }: {
  paket: Paket; palette: PaletteEntry; atasan: number; celana: number;
}) {
  return (
    <>
      <tr>
        <td rowSpan={2} className={`${palette.tableHead} border border-slate-300 px-3 py-2 font-bold text-center align-middle`}>{paket.nama}</td>
        <td className={`${palette.tableSub} border border-slate-300 px-3 py-2`}>ATASAN</td>
        <td className="border border-slate-300 px-3 py-2 text-right font-bold tabular-nums">{atasan}</td>
      </tr>
      <tr>
        <td className={`${palette.tableSub} border border-slate-300 px-3 py-2`}>CELANA</td>
        <td className="border border-slate-300 px-3 py-2 text-right font-bold tabular-nums">{celana}</td>
      </tr>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   EditRowModal — dinamis mengikuti paketList, jadi kolom baru otomatis
   muncul di form edit tanpa perlu ubah komponen.
   ───────────────────────────────────────────────────────────────────── */
function EditRowModal({
  row, paketList, saving, onCancel, onSave,
}: {
  row: LineJahitRow;
  paketList: Paket[];
  saving: boolean;
  onCancel: () => void;
  onSave: (updated: LineJahitRow) => void;
}) {
  const [tanggal, setTanggal] = useState(String(row.tanggal).slice(0, 10));
  const [customer, setCustomer] = useState(row.customer);
  const [qty, setQty] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of paketList) {
      init[`${p.kolom_prefix}_atasan`] = String(row[`${p.kolom_prefix}_atasan`] || '');
      init[`${p.kolom_prefix}_celana`] = String(row[`${p.kolom_prefix}_celana`] || '');
    }
    return init;
  });

  function handleSubmit() {
    if (!tanggal || !customer.trim()) return;
    const updated: LineJahitRow = { ...row, tanggal, customer: customer.trim() };
    for (const p of paketList) {
      updated[`${p.kolom_prefix}_atasan`] = Number(qty[`${p.kolom_prefix}_atasan`]) || 0;
      updated[`${p.kolom_prefix}_celana`] = Number(qty[`${p.kolom_prefix}_celana`]) || 0;
    }
    onSave(updated);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={saving ? undefined : onCancel} />
      <div className="relative bg-[#1a1f35] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-toast-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-gradient-to-r from-amber-500/[0.10] to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 grid place-items-center">
              <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Edit Baris</h3>
              <p className="text-xs text-slate-500 mt-0.5">Ubah tanggal, customer, atau qty per paket.</p>
            </div>
          </div>
          <button onClick={onCancel} disabled={saving} className="text-slate-500 hover:text-white transition-colors p-1.5 hover:bg-white/[0.05] rounded-lg disabled:opacity-50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Tanggal *</label>
              <input
                type="date"
                value={tanggal}
                onChange={e => setTanggal(e.target.value)}
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500/40 date-input"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Customer *</label>
              <input
                type="text"
                value={customer}
                onChange={e => setCustomer(e.target.value)}
                placeholder="Nama customer..."
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500/40"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {paketList.map(p => (
              <div key={p.id} className="flex-1 min-w-[220px]">
                <QtyBlock
                  title={p.nama}
                  palette={paketColor(p.urutan)}
                  atasan={qty[`${p.kolom_prefix}_atasan`] || ''}
                  celana={qty[`${p.kolom_prefix}_celana`] || ''}
                  onAtasan={v => setQty(pr => ({ ...pr, [`${p.kolom_prefix}_atasan`]: v }))}
                  onCelana={v => setQty(pr => ({ ...pr, [`${p.kolom_prefix}_celana`]: v }))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06] bg-white/[0.015]">
          <button onClick={onCancel} disabled={saving}
            className="px-5 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-50">
            Batal
          </button>
          <button onClick={handleSubmit} disabled={saving || !tanggal || !customer.trim()}
            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-lg shadow-amber-500/20">
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   AddPaketModal — dialog untuk tambah paket baru. Input nama →
   hitung preview kolom prefix (informational) → panggil endpoint.
   ───────────────────────────────────────────────────────────────────── */
function AddPaketModal({ onCancel, onAdded }: {
  onCancel: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [nama, setNama] = useState('');
  const [saving, setSaving] = useState(false);

  const preview = nama
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);

  const valid = /^[a-z][a-z0-9_]{0,23}$/.test(preview);

  async function handleApply() {
    if (!nama.trim()) { toast.warning('Validasi', 'Isi nama paket.'); return; }
    if (!valid) { toast.warning('Validasi', 'Nama harus dimulai huruf latin (a-z).'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/line-jahit/tambah-paket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama: nama.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error('Gagal', data.error || 'Gagal tambah paket.');
      } else {
        onAdded();
      }
    } catch (e) {
      toast.error('Gagal', String(e));
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={saving ? undefined : onCancel} />
      <div className="relative bg-[#1a1f35] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-toast-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-gradient-to-r from-emerald-500/[0.10] to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 grid place-items-center">
              <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Tambah Header Paket</h3>
              <p className="text-xs text-slate-500 mt-0.5">Header baru akan muncul di semua baris.</p>
            </div>
          </div>
          <button onClick={onCancel} disabled={saving} className="text-slate-500 hover:text-white transition-colors p-1.5 hover:bg-white/[0.05] rounded-lg disabled:opacity-50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Nama Paket *</label>
            <input
              type="text"
              value={nama}
              onChange={e => setNama(e.target.value)}
              placeholder="Contoh: WARRIOR"
              autoFocus
              className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500/40"
            />
          </div>
          {nama && (
            <div className="text-[11px] text-slate-500 space-y-1">
              <div>Preview kolom: <span className="font-mono text-slate-300">{preview}_atasan</span>, <span className="font-mono text-slate-300">{preview}_celana</span></div>
              {!valid && (
                <div className="text-rose-400">Nama harus dimulai huruf latin (a-z).</div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06] bg-white/[0.015]">
          <button onClick={onCancel} disabled={saving}
            className="px-5 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-50">
            Batal
          </button>
          <button onClick={handleApply} disabled={saving || !valid}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20">
            {saving ? 'Menambahkan...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   KedatanganPenjahitForm — form kecil di sebelah Tambah Baris.
   Input tanggal + jumlah_standar + jumlah_special, submit ke tabel
   penjahit_attendance. Append-only log: tiap submit bikin row baru.
   ───────────────────────────────────────────────────────────────────── */
function KedatanganPenjahitForm({ defaultMonth, onSubmitted }: {
  defaultMonth: string;
  onSubmitted: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [tanggal, setTanggal] = useState('');
  const [standar, setStandar] = useState('');
  const [special, setSpecial] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!tanggal) { toast.warning('Validasi', 'Pilih tanggal.'); return; }
    const nStandar = Number(standar) || 0;
    const nSpecial = Number(special) || 0;
    if (nStandar === 0 && nSpecial === 0) {
      toast.warning('Validasi', 'Isi setidaknya salah satu jumlah penjahit.');
      return;
    }
    setSaving(true);
    try {
      await dbCreate('penjahit_attendance', {
        tanggal,
        jumlah_standar: nStandar,
        jumlah_special: nSpecial,
      });
      setTanggal('');
      setStandar('');
      setSpecial('');
      await onSubmitted();
      toast.success('Kedatangan Dicatat', `${nStandar + nSpecial} penjahit datang.`);
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  return (
    <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5 space-y-4 h-fit">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/25 grid place-items-center">
          <svg className="w-4 h-4 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-tight">Pencatatan Kedatangan Penjahit</p>
          <p className="text-[11px] text-slate-500">Log jumlah penjahit yang datang.</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Tanggal *</label>
          <input
            type="date"
            value={tanggal}
            onChange={e => setTanggal(e.target.value)}
            min={`${defaultMonth}-01`}
            max={`${defaultMonth}-31`}
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500/40 date-input"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Jumlah Penjahit Standar</label>
          <input
            type="text"
            inputMode="numeric"
            value={standar}
            onChange={e => setStandar(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500/40 tabular-nums"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Jumlah Penjahit Special</label>
          <input
            type="text"
            inputMode="numeric"
            value={special}
            onChange={e => setSpecial(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500/40 tabular-nums"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => { setTanggal(''); setStandar(''); setSpecial(''); }}
          disabled={saving}
          className="text-sm font-medium text-slate-400 hover:text-white border border-white/10 hover:bg-white/[0.04] disabled:opacity-40 px-4 py-2 rounded-lg transition-colors"
        >
          Reset
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-violet-500/20"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          {saving ? 'Menyimpan...' : 'Catat'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   AttendanceHistoryPanel — tampil di sebelah tabel Line Jahit,
   daftar catatan kedatangan penjahit bulan aktif. Total di footer
   (jumlah_standar + jumlah_special) per-kolom sum.
   ───────────────────────────────────────────────────────────────────── */
function AttendanceHistoryPanel({ monthLabel, rows, onDelete }: {
  monthLabel: string;
  rows: Attendance[];
  onDelete: (a: Attendance) => void | Promise<void>;
}) {
  const totalStandar = rows.reduce((s, r) => s + (Number(r.jumlah_standar) || 0), 0);
  const totalSpecial = rows.reduce((s, r) => s + (Number(r.jumlah_special) || 0), 0);

  return (
    <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden h-fit">
      <div className="px-4 py-2 bg-violet-200 text-slate-800 border-b border-slate-200 font-bold text-sm tracking-wide text-center">
        KEDATANGAN PENJAHIT · {monthLabel}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm bg-white text-slate-800 border-collapse">
          <thead>
            <tr className="text-[11px] text-slate-700 uppercase tracking-wide">
              <th className="bg-violet-100 border border-slate-300 px-2 py-1.5 text-center font-semibold">Tanggal</th>
              <th className="bg-violet-50 border border-slate-300 px-2 py-1.5 text-center font-semibold">Standar</th>
              <th className="bg-violet-50 border border-slate-300 px-2 py-1.5 text-center font-semibold">Special</th>
              <th className="bg-violet-100 border border-slate-300 px-1 py-1.5 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="border border-slate-300 px-3 py-6 text-center text-xs text-slate-500">
                  Belum ada catatan kedatangan bulan ini.
                </td>
              </tr>
            ) : (
              rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="border border-slate-300 px-2 py-1.5 text-center font-medium text-slate-700">{fmtDayShort(r.tanggal)}</td>
                  <td className="border border-slate-300 px-2 py-1.5 text-center tabular-nums">{r.jumlah_standar > 0 ? r.jumlah_standar : <span className="text-slate-300">—</span>}</td>
                  <td className="border border-slate-300 px-2 py-1.5 text-center tabular-nums">{r.jumlah_special > 0 ? r.jumlah_special : <span className="text-slate-300">—</span>}</td>
                  <td className="border border-slate-300 px-1 py-1 text-center">
                    <button
                      onClick={() => onDelete(r)}
                      title="Hapus catatan"
                      className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-violet-200 text-slate-900 font-bold text-xs">
                <td className="border border-slate-400 px-2 py-2 text-center uppercase">Total</td>
                <td className="border border-slate-400 px-2 py-2 text-center tabular-nums">{totalStandar}</td>
                <td className="border border-slate-400 px-2 py-2 text-center tabular-nums">{totalSpecial}</td>
                <td className="border border-slate-400 px-1 py-2"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// Inline editable numeric cell.
function QtyCell({ value, onCommit }: { value: number; onCommit: (val: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(String(value || ''));

  useEffect(() => { setLocal(String(value || '')); }, [value]);

  if (editing) {
    return (
      <input
        type="text"
        inputMode="numeric"
        autoFocus
        value={local}
        onChange={e => setLocal(e.target.value.replace(/\D/g, ''))}
        onBlur={() => {
          setEditing(false);
          const n = Number(local) || 0;
          if (n !== value) onCommit(n);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { setLocal(String(value || '')); setEditing(false); }
        }}
        className="w-full bg-transparent text-center focus:outline-none focus:bg-slate-100 rounded tabular-nums"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="w-full text-center hover:bg-slate-100 rounded px-1 py-0.5 tabular-nums"
    >
      {value > 0 ? value : <span className="text-slate-300">—</span>}
    </button>
  );
}

// Blok inputan qty per paket. Palette dilewatkan dari parent (sesuai
// urutan paket) supaya paket baru dapat warna otomatis.
function QtyBlock({
  title, palette, atasan, celana, onAtasan, onCelana,
}: {
  title: string;
  palette: PaletteEntry;
  atasan: string;
  celana: string;
  onAtasan: (v: string) => void;
  onCelana: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden h-full">
      <div className={`px-3 py-1.5 border-b ${palette.formHead} text-[11px] font-bold uppercase tracking-widest text-center`}>
        {title}
      </div>
      <div className="grid grid-cols-2 gap-2 p-2">
        <label className="block">
          <span className="block text-[10px] font-medium text-slate-500 mb-1 text-center">Atasan</span>
          <input
            type="text"
            inputMode="numeric"
            value={atasan}
            onChange={e => onAtasan(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            className={`w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none ${palette.formRing} text-center tabular-nums`}
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-medium text-slate-500 mb-1 text-center">Celana</span>
          <input
            type="text"
            inputMode="numeric"
            value={celana}
            onChange={e => onCelana(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            className={`w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none ${palette.formRing} text-center tabular-nums`}
          />
        </label>
      </div>
    </div>
  );
}
