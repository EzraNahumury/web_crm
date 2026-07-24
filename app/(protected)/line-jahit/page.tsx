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

interface LineJahitRow {
  id: number;
  tanggal: string;
  customer: string;
  standar_atasan: number;
  standar_celana: number;
  klasik_atasan: number;
  klasik_celana: number;
  pro_atasan: number;
  pro_celana: number;
}

// 6 kolom qty per row.
const QTY_KEYS: (keyof LineJahitRow)[] = [
  'standar_atasan', 'standar_celana',
  'klasik_atasan', 'klasik_celana',
  'pro_atasan', 'pro_celana',
];

export default function LineJahitPage() {
  const toast = useToast();
  const [month, setMonth] = useState(currentYm());
  const [rows, setRows] = useState<LineJahitRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state untuk row baru.
  const [newTanggal, setNewTanggal] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [newQty, setNewQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const all = await dbGet('line_jahit').catch(() => []);
      // Filter by month (client-side supaya API tetap generic).
      const [y, m] = month.split('-').map(Number);
      const filtered = (all as Row[]).filter(r => {
        const t = String(r.tanggal || '').slice(0, 7);
        return t === `${y}-${String(m).padStart(2, '0')}`;
      }).sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)) || Number(a.id) - Number(b.id));
      setRows(filtered as LineJahitRow[]);
    } catch {}
    setLoading(false);
  }, [month]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return `${BULAN_ID[m - 1]?.toUpperCase() || ''} ${y}`;
  }, [month]);

  // Group row by tanggal untuk display rowspan-style (Excel-like).
  const groupedByDate = useMemo(() => {
    const g: Record<string, LineJahitRow[]> = {};
    for (const r of rows) {
      const key = String(r.tanggal).slice(0, 10);
      (g[key] ||= []).push(r);
    }
    return g;
  }, [rows]);

  // Summary total per paket (Atasan + Celana) + grand total.
  const summary = useMemo(() => {
    const s = {
      standarAtasan: 0, standarCelana: 0,
      klasikAtasan: 0, klasikCelana: 0,
      proAtasan: 0, proCelana: 0,
    };
    for (const r of rows) {
      s.standarAtasan += Number(r.standar_atasan) || 0;
      s.standarCelana += Number(r.standar_celana) || 0;
      s.klasikAtasan += Number(r.klasik_atasan) || 0;
      s.klasikCelana += Number(r.klasik_celana) || 0;
      s.proAtasan += Number(r.pro_atasan) || 0;
      s.proCelana += Number(r.pro_celana) || 0;
    }
    const grandAtasan = s.standarAtasan + s.klasikAtasan + s.proAtasan;
    const grandCelana = s.standarCelana + s.klasikCelana + s.proCelana;
    return { ...s, grandAtasan, grandCelana, grandTotal: grandAtasan + grandCelana };
  }, [rows]);

  async function addRow() {
    if (!newTanggal) { toast.warning('Validasi', 'Pilih tanggal.'); return; }
    if (!newCustomer.trim()) { toast.warning('Validasi', 'Isi nama customer.'); return; }
    setSaving(true);
    try {
      const payload: Row = { tanggal: newTanggal, customer: newCustomer.trim() };
      for (const k of QTY_KEYS) payload[k] = Number(newQty[k as string]) || 0;
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
      // Optimistic local update supaya UI langsung refleksikan.
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

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero header */}
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
                Catatan jahit internal per tanggal + customer. 3 paket × 2 tipe (Atasan/Celana).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
          </div>
        </div>
      </div>

      {/* 2-col layout: table (2/3) + summary (1/3) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Main table */}
        <div className="xl:col-span-2 rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          {/* Month banner */}
          <div className="px-4 py-2 bg-white text-slate-800 border-b border-slate-200 font-bold text-sm tracking-wide">
            BULAN {monthLabel}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                {/* Group header */}
                <tr className="text-slate-800">
                  <th rowSpan={2} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold w-24">TANGGAL</th>
                  <th rowSpan={2} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold">CUSTOMER</th>
                  <th colSpan={6} className="bg-orange-100 border border-slate-300 px-2 py-2 text-center font-bold">PAKET</th>
                  <th rowSpan={2} className="bg-rose-100 border border-slate-300 px-2 py-2 text-center font-bold w-14"></th>
                </tr>
                <tr className="text-slate-800">
                  <th colSpan={2} className="bg-yellow-100 border border-slate-300 px-2 py-1.5 text-center font-semibold">STANDAR</th>
                  <th colSpan={2} className="bg-blue-100 border border-slate-300 px-2 py-1.5 text-center font-semibold">KLASIK</th>
                  <th colSpan={2} className="bg-pink-100 border border-slate-300 px-2 py-1.5 text-center font-semibold">PRO</th>
                </tr>
                <tr className="text-slate-700 text-xs">
                  <th className="bg-yellow-50 border border-slate-300 px-1.5 py-1 text-center font-medium w-16">ATASAN</th>
                  <th className="bg-yellow-50 border border-slate-300 px-1.5 py-1 text-center font-medium w-16">CELANA</th>
                  <th className="bg-blue-50 border border-slate-300 px-1.5 py-1 text-center font-medium w-16">ATASAN</th>
                  <th className="bg-blue-50 border border-slate-300 px-1.5 py-1 text-center font-medium w-16">CELANA</th>
                  <th className="bg-pink-50 border border-slate-300 px-1.5 py-1 text-center font-medium w-16">ATASAN</th>
                  <th className="bg-pink-50 border border-slate-300 px-1.5 py-1 text-center font-medium w-16">CELANA</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(groupedByDate).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="border border-slate-300 px-3 py-8 text-center text-sm text-slate-500 bg-white">
                      Belum ada data untuk bulan ini. Tambah baris di bawah.
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
                        {QTY_KEYS.map(k => (
                          <td key={k} className="border border-slate-300 px-1 py-1 text-center">
                            <QtyCell
                              value={Number(r[k]) || 0}
                              onCommit={val => updateCell(r.id, k, val)}
                            />
                          </td>
                        ))}
                        <td className="border border-slate-300 px-2 py-1 text-center">
                          <button
                            onClick={() => deleteRow(r.id, r.customer)}
                            className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50"
                            title="Hapus baris"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Add row form */}
          <div className="border-t border-white/[0.06] bg-white/[0.02] p-4">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Tambah Baris</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-9 gap-2 items-center">
              <input
                type="date"
                value={newTanggal}
                onChange={e => setNewTanggal(e.target.value)}
                min={`${month}-01`}
                max={`${month}-31`}
                className="bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-500/40 date-input"
              />
              <input
                type="text"
                value={newCustomer}
                onChange={e => setNewCustomer(e.target.value)}
                placeholder="Nama customer..."
                className="bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-500/40 md:col-span-2"
              />
              {QTY_KEYS.map(k => (
                <input
                  key={k}
                  type="number"
                  min="0"
                  value={newQty[k as string] || ''}
                  onChange={e => setNewQty(prev => ({ ...prev, [k]: e.target.value }))}
                  placeholder="0"
                  className="bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-500/40 text-center tabular-nums"
                />
              ))}
              <button
                onClick={addRow}
                disabled={saving}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors md:col-span-2 lg:col-span-9"
              >
                {saving ? 'Menyimpan...' : '+ Tambah Baris'}
              </button>
            </div>
          </div>
        </div>

        {/* Summary panel */}
        <div className="xl:col-span-1 space-y-4">
          <div className="rounded-2xl overflow-hidden border border-white/[0.06]">
            <div className="bg-yellow-200 text-slate-800 text-center py-2 font-bold text-sm">
              PENJAHIT INTERNAL BULAN {monthLabel.split(' ')[0]}
            </div>
            <table className="w-full text-sm bg-white text-slate-800">
              <tbody>
                <tr>
                  <td rowSpan={2} className="bg-yellow-100 border border-slate-300 px-3 py-2 font-bold text-center align-middle">STANDAR</td>
                  <td className="bg-yellow-50 border border-slate-300 px-3 py-2">ATASAN</td>
                  <td className="border border-slate-300 px-3 py-2 text-right font-bold tabular-nums">{summary.standarAtasan}</td>
                </tr>
                <tr>
                  <td className="bg-yellow-50 border border-slate-300 px-3 py-2">CELANA</td>
                  <td className="border border-slate-300 px-3 py-2 text-right font-bold tabular-nums">{summary.standarCelana}</td>
                </tr>
                <tr>
                  <td rowSpan={2} className="bg-blue-100 border border-slate-300 px-3 py-2 font-bold text-center align-middle">KLASIK</td>
                  <td className="bg-blue-50 border border-slate-300 px-3 py-2">ATASAN</td>
                  <td className="border border-slate-300 px-3 py-2 text-right font-bold tabular-nums">{summary.klasikAtasan}</td>
                </tr>
                <tr>
                  <td className="bg-blue-50 border border-slate-300 px-3 py-2">CELANA</td>
                  <td className="border border-slate-300 px-3 py-2 text-right font-bold tabular-nums">{summary.klasikCelana}</td>
                </tr>
                <tr>
                  <td rowSpan={2} className="bg-pink-100 border border-slate-300 px-3 py-2 font-bold text-center align-middle">PRO</td>
                  <td className="bg-pink-50 border border-slate-300 px-3 py-2">ATASAN</td>
                  <td className="border border-slate-300 px-3 py-2 text-right font-bold tabular-nums">{summary.proAtasan}</td>
                </tr>
                <tr>
                  <td className="bg-pink-50 border border-slate-300 px-3 py-2">CELANA</td>
                  <td className="border border-slate-300 px-3 py-2 text-right font-bold tabular-nums">{summary.proCelana}</td>
                </tr>
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
      </div>
    </div>
  );
}

// Inline editable numeric cell: shows the number (or blank if 0),
// on focus becomes an input, on blur auto-save via onCommit.
function QtyCell({ value, onCommit }: { value: number; onCommit: (val: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(String(value || ''));

  useEffect(() => { setLocal(String(value || '')); }, [value]);

  if (editing) {
    return (
      <input
        type="number"
        min="0"
        autoFocus
        value={local}
        onChange={e => setLocal(e.target.value)}
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
