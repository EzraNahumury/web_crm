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
interface PRow { id: number; tanggal: string; customer: string; keterangan: string; data: Record<string, number>; eksekusi: boolean; urgensi: string; posisi: string; }
interface CustomerLite { id: number; nama: string; no_hp: string; kabupaten_kota: string; }

// Konfigurasi fitur operasional per halaman (press / print / cutting).
//   slaDays  — ambang "tercecer / tertahan" dalam hari (press 2, print/cut 1)
//   urgensi  — dropdown penanda Express/Urgent/Prioritas per baris (press)
//   recap    — panel kapasitas Harian/Mingguan/Bulanan (print + cutting)
//   pendingan— tabel catatan kendala operator (press)
// Halaman lain (steam/finishing/shipment) memakai komponen tanpa ops.
export type OpsMode = 'press' | 'print' | 'cutting';
export interface OpsConfig {
  mode: OpsMode;
  slaDays: number;
  urgensi?: boolean;
  recap?: boolean;
  pendingan?: boolean;
}

// Status posisi khusus Cutting.
const CUTTING_POSISI = {
  PROSES: 'PROSES',   // sudah cutting, masih menunggu melengkapi panel
  SIAP: 'SIAP',       // panel komplit, siap jahit
  LANJUT: 'LANJUT',   // sudah didorong ke proses jahit
} as const;

// Hitung umur baris (hari kalender) dari tanggal (YYYY-MM-DD) sampai hari ini.
function ageInDays(iso: string): number {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return 0;
  const start = new Date(y, m - 1, d); start.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - start.getTime()) / 86400000);
}

// Nomor minggu ISO (untuk rekap mingguan) — pakai kunci "tahun-Wxx".
function isoWeekKey(iso: string): string {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;             // Senin=1 … Minggu=7
  dt.setUTCDate(dt.getUTCDate() + 4 - day);      // ke Kamis minggu ini
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
// Jumlah hari kerja (Senin–Sabtu, tanpa Minggu) dalam satu bulan YYYY-MM.
function workingDaysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return 0;
  const days = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= days; d++) { if (new Date(y, m - 1, d).getDay() !== 0) n++; }
  return n;
}

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
  rose: { heroGrad: 'from-rose-500/[0.14] via-red-500/[0.06]', iconBg: 'from-rose-500/25 to-rose-500/5 border-rose-500/25', iconText: 'text-rose-300', addBtn: 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/20', ring: 'focus:border-rose-500/40' },
  indigo: { heroGrad: 'from-indigo-500/[0.14] via-violet-500/[0.06]', iconBg: 'from-indigo-500/25 to-indigo-500/5 border-indigo-500/25', iconText: 'text-indigo-300', addBtn: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20', ring: 'focus:border-indigo-500/40' },
};

export default function ProgressLinePage({ table, title, accent, ops }: {
  table: 'progress_printing' | 'progress_press' | 'progress_cutting' | 'progress_shipment' | 'progress_steam' | 'progress_finishing' | 'progress_layouting';
  title: string;
  accent: keyof typeof PROGRESS_ACCENTS;
  // Fitur operasional (press / print / cutting). Halaman lain tanpa ops.
  ops?: OpsConfig;
}) {
  const toast = useToast();
  const a = PROGRESS_ACCENTS[accent];
  // Turunan flag ops — dipakai untuk gating UI supaya halaman non-ops
  // (steam/finishing/shipment) tidak berubah sama sekali.
  const opsMode = ops?.mode;
  const isPress = opsMode === 'press';
  const isCutting = opsMode === 'cutting';
  const showUrgensi = !!ops?.urgensi;
  const showRecap = !!ops?.recap;
  const showPendingan = !!ops?.pendingan;
  const slaDays = ops?.slaDays ?? 2;
  // Baris punya penanda eksekusi (press = keluar press→dieksekusi; print =
  // sudah ditarik/lanjut). Cutting pakai model posisi, bukan eksekusi.
  const hasEksekusi = isPress || opsMode === 'print';
  const [month, setMonth] = useState(currentYm());
  const [rows, setRows] = useState<PRow[]>([]);
  const [paketList, setPaketList] = useState<Paket[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTanggal, setNewTanggal] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [newKeterangan, setNewKeterangan] = useState('');
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
        .map(r => ({ id: Number(r.id), tanggal: String(r.tanggal).slice(0, 10), customer: String(r.customer || ''), keterangan: String(r.keterangan || ''), data: parseData(r.realisasi_json), eksekusi: !!Number(r.sudah_eksekusi), urgensi: String(r.urgensi || ''), posisi: String(r.posisi || CUTTING_POSISI.PROSES) })));
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
      await dbCreate(table, { tanggal: newTanggal, customer: newCustomer.trim(), keterangan: newKeterangan.trim(), realisasi_json: JSON.stringify(data) });
      setNewCustomer(''); setNewKeterangan(''); setNewQty({});
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
        tanggal: merged.tanggal, customer: merged.customer, keterangan: merged.keterangan || '', realisasi_json: JSON.stringify(merged.data),
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
  async function updateKeterangan(row: PRow, val: string) {
    const trimmed = val.trim();
    if (trimmed === (row.keterangan || '')) return;
    await persistRow(row, { keterangan: trimmed });
  }
  async function deleteRow(id: number, customer: string) {
    const yes = await toast.confirm({ title: 'Hapus Baris?', message: `Baris ${customer || ''} akan dihapus permanen.`, type: 'danger', confirmText: 'Ya, Hapus' });
    if (!yes) return;
    try { await dbDelete(table, id); await fetchAll(); toast.success('Dihapus', 'Baris berhasil dihapus.'); }
    catch (e) { toast.error('Gagal', String(e)); }
  }

  // Ops-only: update kolom sudah_eksekusi / urgensi / posisi tanpa menyentuh
  // kolom lain (kolom ini hanya ada di tabel yang relevan). Optimistic +
  // persist.
  async function updateOpsRow(row: PRow, patch: { eksekusi?: boolean; urgensi?: string; posisi?: string }) {
    const merged = { ...row, ...patch };
    setRows(prev => prev.map(r => r.id === row.id ? merged : r));
    const dbPatch: Record<string, unknown> = {};
    if (patch.eksekusi !== undefined) dbPatch.sudah_eksekusi = patch.eksekusi ? 1 : 0;
    if (patch.urgensi !== undefined) dbPatch.urgensi = patch.urgensi || null;
    if (patch.posisi !== undefined) dbPatch.posisi = patch.posisi;
    try { await dbUpdate(table, row.id, dbPatch); }
    catch (e) { toast.error('Gagal Update', String(e)); fetchAll(); }
  }

  // Notif ops:
  //   press/print → baris belum dieksekusi & lewat SLA + (press) baris urgensi.
  //   cutting     → PROSES lewat SLA (menunggu panel) + SIAP tapi belum lanjut.
  const opsNotif = useMemo(() => {
    if (!ops) return { slaOverdue: [] as PRow[], urgent: [] as PRow[], cuttingHeld: [] as PRow[], cuttingReady: [] as PRow[] };
    if (isCutting) {
      const cuttingHeld = rows.filter(r => r.posisi === CUTTING_POSISI.PROSES && ageInDays(r.tanggal) > slaDays);
      const cuttingReady = rows.filter(r => r.posisi === CUTTING_POSISI.SIAP);
      return { slaOverdue: [], urgent: [], cuttingHeld, cuttingReady };
    }
    const slaOverdue = rows.filter(r => !r.eksekusi && ageInDays(r.tanggal) > slaDays);
    const urgent = showUrgensi ? rows.filter(r => !r.eksekusi && r.urgensi) : [];
    return { slaOverdue, urgent, cuttingHeld: [], cuttingReady: [] };
  }, [rows, ops, isCutting, showUrgensi, slaDays]);

  // Rekap kapasitas Harian / Mingguan / Bulanan (print + cutting). Realisasi
  // poin vs kapasitas 340/hari untuk evaluasi. rows = bulan terpilih saja,
  // jadi Harian = hari ini, Mingguan = minggu ISO ini, Bulanan = bulan ini.
  const recap = useMemo(() => {
    const todayIsoStr = todayIso();
    const wkKey = isoWeekKey(todayIsoStr);
    const qtyOf = (r: PRow) => paketList.reduce((s, p) => s + (Number(r.data[`${p.kolom_prefix}_atasan`]) || 0) + (Number(r.data[`${p.kolom_prefix}_celana`]) || 0), 0);
    const agg = (list: PRow[]) => ({
      real: list.reduce((s, r) => s + realisasiPoin(r.data, paketList), 0),
      qty: list.reduce((s, r) => s + qtyOf(r), 0),
    });
    const daily = agg(rows.filter(r => r.tanggal === todayIsoStr));
    const weekly = agg(rows.filter(r => isoWeekKey(r.tanggal) === wkKey));
    const monthly = agg(rows);
    const weekWorkDays = new Set(rows.filter(r => isoWeekKey(r.tanggal) === wkKey).map(r => r.tanggal)).size || 0;
    return {
      daily: { ...daily, target: PROGRESS_TARGET_PER_DAY },
      weekly: { ...weekly, target: PROGRESS_TARGET_PER_DAY * Math.max(weekWorkDays, 6) },
      monthly: { ...monthly, target: PROGRESS_TARGET_PER_DAY * workingDaysInMonth(month) },
    };
  }, [rows, paketList, month]);

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

      {/* Rekap kapasitas Harian / Mingguan / Bulanan (print + cutting) */}
      {showRecap && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([['Harian', recap.daily, 'Hari ini'], ['Mingguan', recap.weekly, 'Minggu ini'], ['Bulanan', recap.monthly, monthLabel]] as const).map(([lbl, r, sub]) => {
            const util = r.target > 0 ? Math.round((r.real / r.target) * 100) : 0;
            const utilCls = util >= 100 ? 'text-emerald-400' : util >= 70 ? 'text-amber-400' : 'text-rose-400';
            return (
              <div key={lbl} className="rounded-2xl bg-[#111827] border border-white/[0.06] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{lbl}</p>
                  <span className="text-[10px] text-slate-500">{sub}</span>
                </div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <p className="text-2xl font-bold text-white tabular-nums">{fmtPoin(r.real)}</p>
                  <span className="text-[11px] text-slate-500">/ {fmtPoin(r.target)} poin</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${util >= 100 ? 'bg-emerald-500' : util >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(util, 100)}%` }} />
                  </div>
                  <span className={`text-[11px] font-semibold tabular-nums ${utilCls}`}>{util}%</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5 tabular-nums">{r.qty} pcs (atasan+celana)</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Banner notif: press/print (SLA + urgensi) & cutting (tertahan + siap) */}
      {ops && (opsNotif.slaOverdue.length > 0 || opsNotif.urgent.length > 0 || opsNotif.cuttingHeld.length > 0 || opsNotif.cuttingReady.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {opsNotif.slaOverdue.length > 0 && (
            <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.08] p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                <p className="text-sm font-semibold text-red-200">Tercecer — Lewat SLA {slaDays} Hari <span className="tabular-nums">({opsNotif.slaOverdue.length})</span></p>
              </div>
              <p className="text-[11px] text-red-300/70 mb-2">{isPress ? 'Gulungan keluar press' : 'Sudah diprint'} tapi belum dieksekusi &gt; {slaDays} hari.</p>
              <div className="flex flex-wrap gap-1.5">
                {opsNotif.slaOverdue.slice(0, 30).map(r => (
                  <span key={r.id} className="text-[11px] px-2 py-1 rounded-lg border border-red-500/25 bg-red-500/10 text-red-200">
                    {r.customer || '(tanpa nama)'} · <span className="tabular-nums">{ageInDays(r.tanggal)}h</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {opsNotif.urgent.length > 0 && (
            <div className="rounded-2xl border border-orange-500/25 bg-orange-500/[0.08] p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                <p className="text-sm font-semibold text-orange-200">Prioritas / Express / Urgent <span className="tabular-nums">({opsNotif.urgent.length})</span></p>
              </div>
              <p className="text-[11px] text-orange-300/70 mb-2">Belum dieksekusi — dahulukan.</p>
              <div className="flex flex-wrap gap-1.5">
                {opsNotif.urgent.slice(0, 30).map(r => (
                  <span key={r.id} className="text-[11px] px-2 py-1 rounded-lg border border-orange-500/25 bg-orange-500/10 text-orange-100">
                    {r.customer || '(tanpa nama)'} · {r.urgensi}
                  </span>
                ))}
              </div>
            </div>
          )}
          {opsNotif.cuttingHeld.length > 0 && (
            <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.08] p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                <p className="text-sm font-semibold text-red-200">Tertahan di Cutting — Lewat SLA {slaDays} Hari <span className="tabular-nums">({opsNotif.cuttingHeld.length})</span></p>
              </div>
              <p className="text-[11px] text-red-300/70 mb-2">Sudah cutting tapi masih menunggu melengkapi panel &gt; {slaDays} hari.</p>
              <div className="flex flex-wrap gap-1.5">
                {opsNotif.cuttingHeld.slice(0, 30).map(r => (
                  <span key={r.id} className="text-[11px] px-2 py-1 rounded-lg border border-red-500/25 bg-red-500/10 text-red-200">
                    {r.customer || '(tanpa nama)'} · <span className="tabular-nums">{ageInDays(r.tanggal)}h</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {opsNotif.cuttingReady.length > 0 && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                <p className="text-sm font-semibold text-amber-200">Siap Jahit, Belum Dilanjutkan <span className="tabular-nums">({opsNotif.cuttingReady.length})</span></p>
              </div>
              <p className="text-[11px] text-amber-300/70 mb-2">Cutting komplit tapi masih tertahan — dorong ke proses jahit.</p>
              <div className="flex flex-wrap gap-1.5">
                {opsNotif.cuttingReady.slice(0, 30).map(r => (
                  <span key={r.id} className="text-[11px] px-2 py-1 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-100">
                    {r.customer || '(tanpa nama)'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Keterangan <span className="text-slate-600">(opsional — mis. dicetak di mesin apa)</span></label>
          <textarea value={newKeterangan} onChange={e => setNewKeterangan(e.target.value)} rows={2}
            placeholder="Keterangan, mis. print di mesin A / mesin B…"
            className={`w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none resize-y ${a.ring}`} />
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
          <button type="button" onClick={() => { setNewTanggal(''); setNewCustomer(''); setNewKeterangan(''); setNewQty({}); }} disabled={saving}
            className="text-sm font-medium text-slate-400 hover:text-white border border-white/10 hover:bg-white/[0.04] disabled:opacity-40 px-4 py-2 rounded-lg transition-colors">Reset</button>
          <button onClick={addRow} disabled={saving}
            className={`inline-flex items-center gap-2 ${a.addBtn} disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            {saving ? 'Menyimpan...' : 'Tambah Baris'}
          </button>
        </div>
      </div>

      {/* Tabel — desktop/tablet (mobile pakai kartu di bawah) */}
      <div className="hidden md:block rounded-2xl bg-[#111827] border border-white/[0.06] overflow-x-auto">
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
                        className="w-full bg-transparent focus:bg-slate-50 focus:outline-none px-1 py-0.5 rounded font-medium" />
                      <input type="text" defaultValue={r.keterangan} placeholder="+ keterangan (mis. mesin)"
                        onBlur={e => updateKeterangan(r, e.target.value)}
                        title="Keterangan — mis. dicetak di mesin apa"
                        className="w-full bg-transparent focus:bg-slate-50 focus:outline-none px-1 py-0.5 rounded text-[11px] text-slate-500 placeholder-slate-400 mt-0.5" />
                      {opsMode && (
                        <div className="flex items-center flex-wrap gap-2 mt-1">
                          {showUrgensi && (
                            <select value={r.urgensi} onChange={e => updateOpsRow(r, { urgensi: e.target.value })}
                              title="Penanda urgensi baris ini"
                              className={`text-[10px] border rounded px-1 py-0.5 bg-white ${r.urgensi ? 'border-orange-400 text-orange-700 font-semibold' : 'border-slate-300 text-slate-600'}`}>
                              <option value="">Normal</option>
                              <option value="EXPRESS">Express</option>
                              <option value="URGENT">Urgent</option>
                              <option value="PRIORITAS">Prioritas</option>
                            </select>
                          )}
                          {hasEksekusi && (
                            <>
                              <label className="flex items-center gap-1 text-[10px] text-slate-600 cursor-pointer select-none">
                                <input type="checkbox" checked={r.eksekusi} onChange={e => updateOpsRow(r, { eksekusi: e.target.checked })} className="accent-emerald-600" />
                                {isPress ? 'Eksekusi' : 'Dilanjut'}
                              </label>
                              {!r.eksekusi && ageInDays(r.tanggal) > slaDays && (
                                <span className="text-[9px] font-bold text-red-600 bg-red-100 border border-red-300 rounded px-1" title={`Lewat SLA ${slaDays} hari`}>SLA {ageInDays(r.tanggal)}h</span>
                              )}
                              {r.eksekusi && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 rounded px-1">✓ selesai</span>}
                            </>
                          )}
                          {isCutting && (
                            <>
                              <select value={r.posisi} onChange={e => updateOpsRow(r, { posisi: e.target.value })}
                                title="Posisi cutting"
                                className={`text-[10px] border rounded px-1 py-0.5 bg-white ${r.posisi === CUTTING_POSISI.PROSES ? 'border-slate-300 text-slate-600' : r.posisi === CUTTING_POSISI.SIAP ? 'border-amber-400 text-amber-700 font-semibold' : 'border-emerald-400 text-emerald-700 font-semibold'}`}>
                                <option value={CUTTING_POSISI.PROSES}>Proses (nunggu panel)</option>
                                <option value={CUTTING_POSISI.SIAP}>Siap Jahit</option>
                                <option value={CUTTING_POSISI.LANJUT}>Lanjut ke Jahit</option>
                              </select>
                              {r.posisi === CUTTING_POSISI.PROSES && ageInDays(r.tanggal) > slaDays && (
                                <span className="text-[9px] font-bold text-red-600 bg-red-100 border border-red-300 rounded px-1" title={`Tertahan > SLA ${slaDays} hari`}>SLA {ageInDays(r.tanggal)}h</span>
                              )}
                              {r.posisi === CUTTING_POSISI.SIAP && <span className="text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded px-1">dorong lanjut</span>}
                            </>
                          )}
                        </div>
                      )}
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

      {/* Tabel versi MOBILE — kartu per tanggal (grid qty tetap bisa diedit) */}
      <div className="md:hidden space-y-3">
        <div className="rounded-xl px-4 py-2 bg-white text-slate-800 border border-slate-200 font-bold text-sm tracking-wide">BULAN {monthLabel}</div>
        {Object.keys(groupedByDate).length === 0 ? (
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] px-4 py-8 text-center text-sm text-slate-500">Belum ada data untuk bulan ini. Tambah baris di atas.</div>
        ) : (
          Object.entries(groupedByDate).map(([date, group]) => {
            const totalRp = group.reduce((s, gr) => s + realisasiPoin(gr.data, paketList), 0);
            const diff = totalRp - PROGRESS_TARGET_PER_DAY;
            const pos = diff >= 0;
            return (
              <div key={date} className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.06]">
                  <span className="font-bold text-white text-sm">{fmtDayShort(date)}</span>
                  <div className="flex items-center gap-2.5 text-[11px] tabular-nums">
                    <span className="text-slate-400">Target <b className="text-emerald-400">{fmtPoin(PROGRESS_TARGET_PER_DAY)}</b></span>
                    <span className="text-slate-400">Real <b className="text-sky-400">{totalRp > 0 ? fmtPoin(totalRp) : '—'}</b></span>
                    <span className={`font-bold ${pos ? 'text-emerald-400' : 'text-rose-400'}`}>{pos ? '+' : '−'}{fmtPoin(Math.abs(diff))}</span>
                  </div>
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {group.map(r => (
                    <div key={r.id} className="p-3 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <input type="text" defaultValue={r.customer} onBlur={e => updateCustomer(r, e.target.value)}
                            className="w-full bg-transparent text-white font-semibold text-sm px-1 py-0.5 rounded focus:bg-white/[0.06] focus:outline-none" />
                          <input type="text" defaultValue={r.keterangan} placeholder="+ keterangan (mis. mesin)" onBlur={e => updateKeterangan(r, e.target.value)}
                            className="w-full bg-transparent text-slate-400 text-xs px-1 py-0.5 rounded focus:bg-white/[0.06] focus:outline-none placeholder-slate-600 mt-0.5" />
                          {opsMode && (
                            <div className="flex items-center flex-wrap gap-2 mt-1.5 px-1">
                              {showUrgensi && (
                                <select value={r.urgensi} onChange={e => updateOpsRow(r, { urgensi: e.target.value })}
                                  className={`text-[11px] border rounded px-1.5 py-1 bg-[#0d1117] ${r.urgensi ? 'border-orange-500/40 text-orange-300 font-semibold' : 'border-white/10 text-slate-300'}`}>
                                  <option value="">Normal</option>
                                  <option value="EXPRESS">Express</option>
                                  <option value="URGENT">Urgent</option>
                                  <option value="PRIORITAS">Prioritas</option>
                                </select>
                              )}
                              {hasEksekusi && (
                                <>
                                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none">
                                    <input type="checkbox" checked={r.eksekusi} onChange={e => updateOpsRow(r, { eksekusi: e.target.checked })} className="accent-emerald-500 w-3.5 h-3.5" />
                                    {isPress ? 'Eksekusi' : 'Dilanjut'}
                                  </label>
                                  {!r.eksekusi && ageInDays(r.tanggal) > slaDays && (
                                    <span className="text-[9px] font-bold text-red-300 bg-red-500/15 border border-red-500/30 rounded px-1.5 py-0.5">SLA {ageInDays(r.tanggal)}h</span>
                                  )}
                                </>
                              )}
                              {isCutting && (
                                <>
                                  <select value={r.posisi} onChange={e => updateOpsRow(r, { posisi: e.target.value })}
                                    className={`text-[11px] border rounded px-1.5 py-1 bg-[#0d1117] ${r.posisi === CUTTING_POSISI.PROSES ? 'border-white/10 text-slate-300' : r.posisi === CUTTING_POSISI.SIAP ? 'border-amber-500/40 text-amber-300 font-semibold' : 'border-emerald-500/40 text-emerald-300 font-semibold'}`}>
                                    <option value={CUTTING_POSISI.PROSES}>Proses (nunggu panel)</option>
                                    <option value={CUTTING_POSISI.SIAP}>Siap Jahit</option>
                                    <option value={CUTTING_POSISI.LANJUT}>Lanjut ke Jahit</option>
                                  </select>
                                  {r.posisi === CUTTING_POSISI.PROSES && ageInDays(r.tanggal) > slaDays && (
                                    <span className="text-[9px] font-bold text-red-300 bg-red-500/15 border border-red-500/30 rounded px-1.5 py-0.5">SLA {ageInDays(r.tanggal)}h</span>
                                  )}
                                  {r.posisi === CUTTING_POSISI.SIAP && <span className="text-[9px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5">dorong lanjut</span>}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setEditingRow(r)} className="text-amber-500 p-1.5 rounded hover:bg-amber-500/10" title="Edit baris">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                          </button>
                          <button onClick={() => deleteRow(r.id, r.customer)} className="text-rose-500 p-1.5 rounded hover:bg-rose-500/10" title="Hapus baris">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166M18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {paketList.map(p => {
                          const c = paketColor(p.urutan);
                          return (
                            <div key={p.id} className="rounded-lg border border-slate-300 overflow-hidden bg-white text-slate-800">
                              <div className={`${c.tableHead} text-[10px] font-bold uppercase text-center py-1 border-b border-slate-300`}>{p.nama}</div>
                              <div className="grid grid-cols-2">
                                <div className="border-r border-slate-200 px-1 py-1.5">
                                  <div className="text-[9px] text-slate-500 text-center mb-0.5">ATASAN</div>
                                  <QtyCell value={Number(r.data[`${p.kolom_prefix}_atasan`]) || 0} onCommit={val => updateCell(r, `${p.kolom_prefix}_atasan`, val)} />
                                </div>
                                <div className="px-1 py-1.5">
                                  <div className="text-[9px] text-slate-500 text-center mb-0.5">CELANA</div>
                                  <QtyCell value={Number(r.data[`${p.kolom_prefix}_celana`]) || 0} onCommit={val => updateCell(r, `${p.kolom_prefix}_celana`, val)} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
      </>
      )}

      {showPendingan && <PressPendinganSection accent={a} customers={customers} />}

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
  const [keterangan, setKeterangan] = useState(row.keterangan || '');
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
    await onSave({ tanggal, customer: customer.trim(), keterangan: keterangan.trim(), data });
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
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Keterangan <span className="text-slate-600">(mis. dicetak di mesin apa)</span></label>
          <textarea value={keterangan} onChange={e => setKeterangan(e.target.value)} rows={2}
            placeholder="Keterangan, mis. print di mesin A / mesin B…"
            className={`w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none resize-y ${accent.ring}`} />
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

/* ─────────────────────────────────────────────────────────────
   Tabel Pendingan Press — catatan kendala operator (mesin, reject
   kekurangan bahan, problem lain). Data di tabel press_pendingan.
   ───────────────────────────────────────────────────────────── */
interface PendinganRow { id: number; tanggal: string; customer: string; kategori: string; catatan: string; status: string; }

const PENDINGAN_KATEGORI: { key: string; label: string; cls: string }[] = [
  { key: 'MESIN', label: 'Kendala Mesin', cls: 'text-rose-300 bg-rose-500/10 border-rose-500/25' },
  { key: 'BAHAN', label: 'Kekurangan Bahan', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
  { key: 'REJECT', label: 'Reject', cls: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/25' },
  { key: 'LAIN', label: 'Lain-lain', cls: 'text-slate-300 bg-slate-500/10 border-slate-500/25' },
];
function kategoriMeta(k: string) {
  return PENDINGAN_KATEGORI.find(x => x.key === String(k).toUpperCase()) || PENDINGAN_KATEGORI[3];
}
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function PressPendinganSection({ accent, customers }: { accent: ProgressAccent; customers: CustomerLite[] }) {
  const toast = useToast();
  const [rows, setRows] = useState<PendinganRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'OPEN' | 'SELESAI' | 'ALL'>('OPEN');
  const [tanggal, setTanggal] = useState(todayIso());
  const [customer, setCustomer] = useState('');
  const [kategori, setKategori] = useState('MESIN');
  const [catatan, setCatatan] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await dbGet<Row>('press_pendingan').catch(() => []);
      setRows((all as Row[])
        .map(r => ({ id: Number(r.id), tanggal: String(r.tanggal || '').slice(0, 10), customer: String(r.customer || ''), kategori: String(r.kategori || 'LAIN'), catatan: String(r.catatan || ''), status: String(r.status || 'OPEN').toUpperCase() }))
        .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)) || b.id - a.id));
    } catch { setRows([]); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => filter === 'ALL' ? rows : rows.filter(r => r.status === filter), [rows, filter]);
  const openCount = useMemo(() => rows.filter(r => r.status === 'OPEN').length, [rows]);

  async function add() {
    if (!catatan.trim()) { toast.warning('Validasi', 'Isi catatan kendala.'); return; }
    setSaving(true);
    try {
      await dbCreate('press_pendingan', { tanggal: tanggal || todayIso(), customer: customer.trim(), kategori, catatan: catatan.trim(), status: 'OPEN' });
      setCustomer(''); setCatatan(''); setKategori('MESIN'); setTanggal(todayIso());
      await load();
      toast.success('Pendingan Dicatat', 'Kendala tersimpan.');
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }
  async function toggleStatus(r: PendinganRow) {
    const next = r.status === 'OPEN' ? 'SELESAI' : 'OPEN';
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: next } : x));
    try { await dbUpdate('press_pendingan', r.id, { status: next, resolved_at: next === 'SELESAI' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null }); }
    catch (e) { toast.error('Gagal', String(e)); load(); }
  }
  async function remove(r: PendinganRow) {
    const yes = await toast.confirm({ title: 'Hapus Pendingan?', message: 'Catatan ini akan dihapus permanen.', type: 'danger', confirmText: 'Ya, Hapus' });
    if (!yes) return;
    try { await dbDelete('press_pendingan', r.id); await load(); toast.success('Dihapus', 'Pendingan dihapus.'); }
    catch (e) { toast.error('Gagal', String(e)); }
  }

  return (
    <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${accent.iconBg} border grid place-items-center`}>
            <svg className={`w-4 h-4 ${accent.iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Pendingan Press</p>
            <p className="text-[11px] text-slate-500">Kendala mesin, kekurangan bahan / reject, problem lain saat proses.</p>
          </div>
        </div>
        <div className="flex gap-1">
          {([['OPEN', 'Belum Selesai'], ['SELESAI', 'Selesai'], ['ALL', 'Semua']] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${filter === k ? 'text-white bg-white/[0.06] border-white/15' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>
              {lbl}{k === 'OPEN' && openCount > 0 ? ` (${openCount})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Form tambah pendingan */}
      <div className="px-5 py-4 border-b border-white/[0.06] grid grid-cols-1 md:grid-cols-[130px_1fr_150px] gap-2.5">
        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)}
          className={`bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none ${accent.ring} date-input`} />
        <CustomerNameInput value={customer} onChange={setCustomer} customers={customers} ringCls={accent.ring} />
        <select value={kategori} onChange={e => setKategori(e.target.value)}
          className={`bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none ${accent.ring}`}>
          {PENDINGAN_KATEGORI.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
        <div className="md:col-span-3 flex gap-2.5">
          <input type="text" value={catatan} onChange={e => setCatatan(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder="Catatan kendala, mis. mesin 2 macet / kurang kain warna navy..."
            className={`flex-1 bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none ${accent.ring}`} />
          <button onClick={add} disabled={saving}
            className={`inline-flex items-center gap-2 ${accent.addBtn} disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg shrink-0`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            {saving ? '...' : 'Tambah'}
          </button>
        </div>
      </div>

      {/* Daftar pendingan */}
      {loading ? (
        <div className="px-5 py-8"><div className="h-10 bg-white/[0.03] rounded-lg animate-pulse" /></div>
      ) : filtered.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-slate-500">Tidak ada pendingan di kategori ini.</div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {filtered.map(r => {
            const km = kategoriMeta(r.kategori);
            const done = r.status === 'SELESAI';
            return (
              <div key={r.id} className={`flex items-start gap-3 px-5 py-3 ${done ? 'opacity-55' : ''}`}>
                <span className={`text-[10px] font-medium px-2 py-1 rounded-full border whitespace-nowrap shrink-0 ${km.cls}`}>{km.label}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm text-white ${done ? 'line-through' : ''}`}>{r.catatan}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {r.customer ? `${r.customer} · ` : ''}{fmtDayShort(r.tanggal)}{done ? ' · selesai' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleStatus(r)} title={done ? 'Buka lagi' : 'Tandai selesai'}
                    className={`p-1.5 rounded-lg transition-colors ${done ? 'text-slate-400 hover:bg-white/[0.05]' : 'text-emerald-400 hover:bg-emerald-500/10'}`}>
                    {done
                      ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                      : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                  </button>
                  <button onClick={() => remove(r)} title="Hapus" className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166M18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165" /></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
