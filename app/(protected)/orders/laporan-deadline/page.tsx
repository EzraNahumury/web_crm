'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet, dbUpdate } from '@/lib/api-db';
import { isVisibleTanggalOrder } from '@/lib/data-cutoff';
import { computeDeadlineLock, hasJaket } from '@/lib/business-days';
import { buildAksesorisSet, sumQtyExcludingAksesoris } from '@/lib/qty-aksesoris';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Poin per unit sesuai tier paket (patokan atasan):
//   Standar = 1, Klasik = 1.4, Pro = 1.7.
function tierRate(tier: string): number {
  if (tier === 'PRO') return 1.7;
  if (tier === 'KLASIK') return 1.4;
  if (tier === 'STANDAR') return 1;
  return 0;
}

// Deteksi tier + variant dari nama paket order. tier '' = tidak terdeteksi
// (paket bukan Standar/Klasik/Pro → CS pilih manual lewat dropdown).
function detectPaket(names: string[]): { tier: string; display: string } {
  for (const raw of names) {
    const s = String(raw || '').toUpperCase();
    let tier = '';
    if (/\bPRO\b/.test(s)) tier = 'PRO';
    else if (/KLASIK|CLASSIC/.test(s)) tier = 'KLASIK';
    else if (/STANDAR|STANDARD/.test(s)) tier = 'STANDAR';
    if (tier) {
      const mv = s.match(/PAKET\s+([A-E])/) || s.match(/\b([A-E])\s*$/);
      const variant = mv ? mv[1] : '';
      return { tier, display: variant ? `${tier} ${variant}` : tier };
    }
  }
  return { tier: '', display: '' };
}

function monthKeyOf(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : '_no_dl_';
}
function monthLabel(key: string): string {
  if (key === '_no_dl_') return 'Belum Ada Deadline';
  const [y, mo] = key.split('-').map(Number);
  return `${MONTHS_ID[mo - 1]} ${y}`;
}
function fmtDL(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])} ${MONTHS_ID[Number(m[2]) - 1]} ${m[1]}` : (iso || '—');
}

const TIER_OPTIONS = ['STANDAR', 'KLASIK', 'PRO'];

type DeadlineRow = {
  id: number; customer: string; qty: number;
  detectedTier: string;   // '' kalau tidak terdeteksi
  detectedDisplay: string;
  manualTier: string;     // dari orders.deadline_paket_tier
  bonus: string; ket: string; dl: string; monthKey: string;
};

// Tier efektif + poin (derived) — auto kalau terdeteksi, kalau tidak pakai
// pilihan manual. Belum ada tier → poin 0 (dikosongkan di UI).
const effTierOf = (r: DeadlineRow) => r.detectedTier || r.manualTier;
const rowPoint = (r: DeadlineRow) => {
  const t = effTierOf(r);
  return t ? Math.round(r.qty * tierRate(t) * 10) / 10 : 0;
};

export default function LaporanDeadlineCsOrderPage() {
  const [rowsAll, setRowsAll] = useState<DeadlineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Baris yang di-expand (klik) untuk menampilkan KET. null = tidak ada.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orders, items, promos, promoMaster, barangCs, libur] = await Promise.all([
        dbGet('orders').catch(() => []),
        dbGet('order_items').catch(() => []),
        dbGet('order_promos').catch(() => []),
        dbGet('promo').catch(() => []),
        dbGet('barang_cs').catch(() => []),
        dbGet('libur_nasional').catch(() => []),
      ]);
      const aksesorisSet = buildAksesorisSet(barangCs as Row[]);

      const holidays = new Set<string>();
      for (const h of libur as Row[]) {
        const t = h.tanggal;
        if (!t) continue;
        const m = String(t instanceof Date ? t.toISOString() : t).match(/(\d{4})-(\d{2})-(\d{2})/);
        if (m) holidays.add(`${m[1]}-${m[2]}-${m[3]}`);
      }

      const itemsByOrder: Record<string, Row[]> = {};
      for (const it of items as Row[]) (itemsByOrder[String(it.order_id)] ||= []).push(it);

      const promoNameById: Record<string, string> = {};
      for (const p of promoMaster as Row[]) promoNameById[String(p.id)] = String(p.nama || '');
      const bonusByOrder: Record<string, string[]> = {};
      for (const op of promos as Row[]) {
        const nama = promoNameById[String(op.promo_id)] || '';
        if (nama) (bonusByOrder[String(op.order_id)] ||= []).push(nama);
      }

      const out: DeadlineRow[] = [];
      for (const o of orders as Row[]) {
        if (!isVisibleTanggalOrder(o.tanggal_order)) continue;
        const its = itemsByOrder[String(o.id)] || [];
        const names = its.map(it => String(it.paket_nama || '')).filter(Boolean);
        const dl = computeDeadlineLock({
          pilihanPaket: o.pilihan_paket,
          tanggalAccProofing: o.tanggal_acc_proofing,
          deadlineLock: o.deadline_lock,
          holidays,
          isJaket: hasJaket(names),
        });
        if (!dl) continue; // hanya yang sudah punya Deadline Lock

        const qty = sumQtyExcludingAksesoris(its, aksesorisSet);
        const det = detectPaket(names);
        const manualTier = String(o.deadline_paket_tier || '').toUpperCase();
        out.push({
          id: Number(o.id),
          customer: String(o.customer_nama || ''),
          qty,
          detectedTier: det.tier,
          detectedDisplay: det.display,
          manualTier: TIER_OPTIONS.includes(manualTier) ? manualTier : '',
          bonus: (bonusByOrder[String(o.id)] || []).join(', '),
          ket: String(o.keterangan || ''),
          dl,
          monthKey: monthKeyOf(dl),
        });
      }
      setRowsAll(out);
    } catch {
      setRowsAll([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Simpan tier manual (optimistic + persist ke orders.deadline_paket_tier).
  async function pickTier(id: number, tier: string) {
    setRowsAll(prev => prev.map(r => (r.id === id ? { ...r, manualTier: tier } : r)));
    try {
      await dbUpdate('orders', id, { deadline_paket_tier: tier || null });
    } catch {
      load();
    }
  }

  const monthKeys = useMemo(() => {
    const set = new Set(rowsAll.map(r => r.monthKey).filter(k => k !== '_no_dl_'));
    return Array.from(set).sort();
  }, [rowsAll]);

  const monthRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = selectedMonth ? rowsAll.filter(r => r.monthKey === selectedMonth) : rowsAll;
    if (q) rows = rows.filter(r => r.customer.toLowerCase().includes(q) || r.detectedDisplay.toLowerCase().includes(q) || r.bonus.toLowerCase().includes(q));
    return rows;
  }, [rowsAll, selectedMonth, search]);

  const dateGroups = useMemo(() => {
    const map = new Map<string, DeadlineRow[]>();
    for (const r of monthRows) {
      if (!map.has(r.dl)) map.set(r.dl, []);
      map.get(r.dl)!.push(r);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dl, rows]) => ({
        dl,
        rows: rows.slice().sort((a, b) => a.customer.localeCompare(b.customer)),
        qty: rows.reduce((s, r) => s + r.qty, 0),
        point: Math.round(rows.reduce((s, r) => s + rowPoint(r), 0) * 10) / 10,
      }));
  }, [monthRows]);

  const totalQty = monthRows.reduce((s, r) => s + r.qty, 0);
  const totalPoint = Math.round(monthRows.reduce((s, r) => s + rowPoint(r), 0) * 10) / 10;
  const needPickCount = monthRows.filter(r => !effTierOf(r)).length;
  const monthLabelSel = selectedMonth ? monthLabel(selectedMonth) : 'Semua Bulan';
  const thisMonth = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-amber-500/[0.14] via-orange-500/[0.05] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/25 to-amber-500/5 border border-amber-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Laporan Deadline CS Order</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Per tanggal Deadline Lock · <span className="text-white font-medium">{monthLabelSel} · {monthRows.length} order · {totalQty} pcs · {totalPoint} poin</span>
                {needPickCount > 0 && <span className="text-amber-300"> · {needPickCount} paket perlu dipilih tier-nya</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-500 uppercase tracking-wider hidden sm:inline">Bulan</span>
              <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                className="bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500/40 date-input" />
              <button onClick={() => setSelectedMonth(thisMonth)}
                className="text-xs text-slate-400 hover:text-white px-3 py-2 rounded-lg border border-white/10 hover:bg-white/[0.04] transition-colors shrink-0">Bulan Ini</button>
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari customer, paket, bonus..."
                className="w-full bg-white/[0.03] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-amber-500/40" />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-40 grid place-items-center"><div className="w-8 h-8 rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin" /></div>
      ) : dateGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 py-16 text-center">
          <p className="text-sm text-slate-400">Tidak ada order untuk {monthLabelSel}.</p>
          {selectedMonth && monthKeys.length > 0 && (
            <p className="text-xs text-slate-500 mt-1.5">Bulan yang ada data: {monthKeys.map(monthLabel).join(' · ')}.</p>
          )}
        </div>
      ) : (
        dateGroups.map(g => (
          <div key={g.dl} className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <div className="px-6 py-3 border-b border-white/[0.06] bg-amber-500/[0.06]">
              <h2 className="text-lg font-bold text-amber-300 tracking-wide">{fmtDL(g.dl)}</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Deadline Lock · {g.rows.length} order · {g.qty} pcs · {g.point.toLocaleString('id-ID')} poin</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm bg-white text-slate-800 border-collapse">
                <thead>
                  <tr className="text-[11px] text-slate-700 font-bold uppercase tracking-wide">
                    <th className="bg-sky-100 border border-slate-300 px-2 py-2 text-center w-12">No</th>
                    <th className="bg-sky-100 border border-slate-300 px-3 py-2 text-left min-w-[240px]">Cust</th>
                    <th className="bg-sky-100 border border-slate-300 px-2 py-2 text-center w-16">Qty</th>
                    <th className="bg-sky-100 border border-slate-300 px-3 py-2 text-left min-w-[150px]">Paket</th>
                    <th className="bg-sky-100 border border-slate-300 px-3 py-2 text-center w-24">Point</th>
                    <th className="bg-sky-100 border border-slate-300 px-3 py-2 text-left min-w-[170px]">Bonus</th>
                    <th className="bg-sky-100 border border-slate-300 px-1 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r, i) => {
                    const eff = effTierOf(r);
                    const pt = rowPoint(r);
                    const isOpen = expandedId === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr
                          onClick={() => setExpandedId(prev => (prev === r.id ? null : r.id))}
                          className={`cursor-pointer transition-colors ${isOpen ? 'bg-sky-50' : 'bg-white hover:bg-slate-50'}`}
                          title="Klik untuk lihat keterangan"
                        >
                          <td className="border border-slate-300 px-2 py-2 text-center tabular-nums text-slate-500">{i + 1}</td>
                          <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-800">{r.customer || '-'}</td>
                          <td className="border border-slate-300 px-2 py-2 text-center tabular-nums font-semibold">{r.qty}</td>
                          <td className="border border-slate-300 px-3 py-2">
                            {r.detectedTier ? (
                              <span className="uppercase text-xs font-semibold tracking-wide text-slate-700">{r.detectedDisplay}</span>
                            ) : (
                              <select
                                value={r.manualTier}
                                onClick={e => e.stopPropagation()}
                                onChange={e => { e.stopPropagation(); pickTier(r.id, e.target.value); }}
                                className={`bg-white border rounded-md px-2 py-1 text-xs focus:outline-none cursor-pointer ${r.manualTier ? 'border-slate-300 text-slate-800' : 'border-amber-400 text-amber-700 bg-amber-50'}`}
                              >
                                <option value="">Pilih paket…</option>
                                {TIER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            )}
                          </td>
                          <td className="border border-slate-300 px-3 py-2 text-center tabular-nums font-bold text-slate-900">
                            {eff ? pt.toLocaleString('id-ID') : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="border border-slate-300 px-3 py-2 text-slate-600 text-xs">{r.bonus || '—'}</td>
                          <td className="border border-slate-300 px-1 py-2 text-center text-slate-400">
                            <svg className={`w-3.5 h-3.5 inline-block transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-sky-50/60">
                            <td className="border border-slate-300 px-3 py-2.5 text-xs text-slate-600 whitespace-pre-wrap" colSpan={7}>
                              <span className="font-bold text-slate-700 uppercase tracking-wide mr-1">Keterangan:</span>
                              {r.ket ? r.ket : <span className="text-slate-400 italic">— tidak ada keterangan —</span>}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  <tr className="font-bold text-slate-900">
                    <td className="bg-slate-100 border border-slate-300 px-2 py-2" />
                    <td className="bg-slate-100 border border-slate-300 px-3 py-2 uppercase text-xs text-slate-600">Total</td>
                    <td className="bg-emerald-200 border border-slate-400 px-2 py-2 text-center tabular-nums text-emerald-900">{g.qty}</td>
                    <td className="bg-slate-100 border border-slate-300 px-3 py-2" />
                    <td className="bg-rose-200 border border-slate-400 px-3 py-2 text-center tabular-nums text-rose-900">{g.point.toLocaleString('id-ID')}</td>
                    <td colSpan={2} className="bg-slate-100 border border-slate-300 px-3 py-2" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
