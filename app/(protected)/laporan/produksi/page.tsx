'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet, dbUpdate } from '@/lib/api-db';
import { isVisibleTanggalOrder } from '@/lib/data-cutoff';
import { computeDeadlineLock, hasJaket } from '@/lib/business-days';
import { buildAksesorisSet, sumQtyExcludingAksesoris } from '@/lib/qty-aksesoris';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// Map production_stages.nama → label pendek yang tampil di kolom STATUS.
// Same style seperti di lembar rekap manual (JAHIT, FINISHING, KIRIM, dst).
const STATUS_SHORTHAND: Record<string, string> = {
  'Sewing': 'JAHIT',
  'Finishing': 'FINISHING',
  'Steam Jersey': 'STEAM',
  'QC Jersey': 'QC JERSEY',
  'QC Final dan Packing': 'QC FINAL',
  'QC Panel Process': 'QC PANEL',
  'Fabric Cutting': 'CUTTING',
  'Sublim Press': 'SUBLIM',
  'Printing Process': 'PRINTING',
  'Printing Layout': 'LAYOUT',
  'Approval Layout': 'ACC LAYOUT',
  'Approval WO': 'ACC WO',
  'Approval Pattern': 'ACC PATTERN',
  'Approval Design': 'ACC DESAIN',
  'Proofing': 'PROOFING',
  'Waiting List': 'WAITING',
  'Shipment': 'KIRIM',
};

function fmtDL(iso: string): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const day = Number(m[3]);
  const mo = Number(m[2]) - 1;
  const yr = Number(m[1]);
  return `${day} ${MONTHS_ID[mo]} ${yr}`;
}

function monthKey(iso: string): string {
  if (!iso) return '_no_dl_';
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : '_no_dl_';
}

function monthLabel(key: string): string {
  if (key === '_no_dl_') return 'Belum Ada Deadline';
  const [y, mo] = key.split('-').map(Number);
  return `${MONTHS_ID[mo - 1]} ${y}`;
}

// Warna row berdasarkan status stage. Mirror gaya lembar manual:
// KIRIM (Shipment done / terkirim) → hijau, QC Panel/Cutting → merah,
// selain itu default (transparan).
function rowStyle(status: string): { bg: string; text: string } {
  const s = status.toUpperCase();
  if (s === 'KIRIM') return { bg: 'rgba(16,185,129,0.12)', text: '#a7f3d0' };
  if (s.includes('QC PANEL') || s.includes('QC CUTTING') || s === 'CUTTING') return { bg: 'rgba(244,63,94,0.10)', text: '#fecaca' };
  if (s === 'JAHIT' || s === 'FINISHING') return { bg: 'transparent', text: 'inherit' };
  return { bg: 'transparent', text: 'inherit' };
}

interface WoRowExpanded {
  id: number;
  no_wo: string;
  customer: string;
  qty: number;
  paket: string;
  variant: string;
  ket: string;
  note: string;
  dl: string;              // YYYY-MM-DD atau ''
  dlDisplay: string;       // "1 Agustus 2026"
  status: string;          // "JAHIT", "KIRIM", "FINISHING", dsb
  monthKey: string;
}

export default function LaporanProduksiPage() {
  const [stages, setStages] = useState<Row[]>([]);
  const [progress, setProgress] = useState<Row[]>([]);
  const [wos, setWos] = useState<Row[]>([]);
  const [orders, setOrders] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  // Local edits untuk KET/NOTE — auto-save on blur.
  const [editing, setEditing] = useState<Record<number, { ket?: string; note?: string }>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, w, o, h, oi, bcs] = await Promise.all([
        dbGet('production_stages'),
        dbGet('wo_progress'),
        dbGet('work_orders'),
        dbGet('orders').catch(() => []),
        dbGet('libur_nasional').catch(() => []),
        dbGet('order_items').catch(() => []),
        dbGet('barang_cs').catch(() => []),
      ]);
      setStages(s.sort((a: Row, b: Row) => (a.urutan || 0) - (b.urutan || 0)));
      setProgress(p);
      // Recompute wo.jumlah exclude aksesoris (barang_cs.hitung_qty=0).
      const aksSet = buildAksesorisSet(bcs as Row[]);
      const itemsByOrder: Record<number, Row[]> = {};
      for (const it of oi as Row[]) {
        const oid = Number(it.order_id);
        if (!oid) continue;
        if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
        itemsByOrder[oid].push(it);
      }
      const qtyByOrder: Record<number, number> = {};
      for (const oid of Object.keys(itemsByOrder).map(Number)) {
        qtyByOrder[oid] = sumQtyExcludingAksesoris(itemsByOrder[oid], aksSet);
      }
      const wFixed = (w as Row[]).map(wo => {
        const oid = Number(wo.order_id);
        if (oid && qtyByOrder[oid] !== undefined) {
          return { ...wo, jumlah: qtyByOrder[oid] };
        }
        return wo;
      });
      setWos(wFixed);
      setOrders(o);
      const hs = new Set<string>();
      for (const row of h as Row[]) {
        const t = row.tanggal;
        if (!t) continue;
        if (t instanceof Date) {
          hs.add(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`);
        } else {
          const m = String(t).match(/(\d{4})-(\d{2})-(\d{2})/);
          if (m) hs.add(`${m[1]}-${m[2]}-${m[3]}`);
        }
      }
      setHolidays(hs);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const onFocus = () => fetchAll();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchAll]);

  const ordersById = useMemo(() => {
    const m: Record<number, Row> = {};
    for (const o of orders) m[Number(o.id)] = o;
    return m;
  }, [orders]);

  const stagesByIdMap = useMemo(() => {
    const m: Record<number, Row> = {};
    for (const s of stages) m[Number(s.id)] = s;
    return m;
  }, [stages]);

  // Progress grouped by work_order_id → all rows for that WO.
  const progressByWo = useMemo(() => {
    const m: Record<number, Row[]> = {};
    for (const p of progress) {
      const k = Number(p.work_order_id);
      if (!m[k]) m[k] = [];
      m[k].push(p);
    }
    return m;
  }, [progress]);

  // Build main dataset — 1 baris per WO, sorted by DL ASC, dikelompokkan
  // per bulan di render nanti.
  const rowsExpanded: WoRowExpanded[] = useMemo(() => {
    const list: WoRowExpanded[] = [];
    for (const wo of wos) {
      const ord = ordersById[Number(wo.order_id)];
      // Cutoff strict: HARUS punya order dengan tanggal_order >= 13 Juli.
      // WO orphan (tanpa order) atau tanggal_order kosong di-hide, beda
      // dengan menu Produksi yang lebih longgar (untuk hindari legacy
      // data bocor ke laporan bulanan).
      if (!ord?.tanggal_order) continue;
      if (!isVisibleTanggalOrder(ord.tanggal_order)) continue;

      // Deadline Lock — compute via biz-days rule. Kalau prioritas tanpa
      // deadline_lock manual, hasilnya '' (kosong sesuai request user).
      const dl = ord
        ? computeDeadlineLock({
            pilihanPaket: ord.pilihan_paket,
            tanggalAccProofing: ord.tanggal_acc_proofing,
            deadlineLock: ord.deadline_lock,
            holidays,
            isJaket: hasJaket([String(ord.paket || wo.paket || '')]),
          })
        : '';

      // STATUS — derive murni dari wo_progress + status_terkirim, SAMA
      // dengan tab counter di menu Produksi.
      //   1. status_terkirim=1 (CS centang History Produksi) → KIRIM
      //   2. Ada progress row Shipment SELESAI → KIRIM (Finance approved pelunasan)
      //   3. Else: pilih stage aktif dengan (urutan * 10) + weight:
      //        SEDANG=3, TERSEDIA=2, SELESAI=1 — highest wins.
      //      WO yang lagi TERSEDIA/SEDANG di Shipment tab akan status
      //      SHIPMENT (bukan KIRIM), sesuai perilaku menu Produksi.
      //   4. Kalau progress kosong → status kosong ('—' di UI).
      // NOTE: sengaja TIDAK pakai wo.status='SELESAI' sebagai shortcut
      // karena data legacy banyak yang status='SELESAI' tanpa proper
      // Shipment SELESAI progress — bikin KIRIM inflated.
      const woProg = progressByWo[Number(wo.id)] || [];
      let stageNama = '';
      const shipmentDoneRow = woProg.find(p => {
        const stg = stagesByIdMap[Number(p.stage_id)];
        return stg && String(stg.nama) === 'Shipment' && String(p.status || '').toUpperCase() === 'SELESAI';
      });
      if (Number(ord?.status_terkirim) === 1 || shipmentDoneRow) {
        stageNama = 'Shipment';
      } else {
        let bestUrut = -1;
        let bestNama = '';
        for (const p of woProg) {
          const st = String(p.status || '').toUpperCase();
          const stg = stagesByIdMap[Number(p.stage_id)];
          if (!stg) continue;
          const ur = Number(stg.urutan || 0);
          const weight = st === 'SEDANG' ? 3 : st === 'TERSEDIA' ? 2 : st === 'SELESAI' ? 1 : 0;
          if (weight === 0) continue;
          const combined = ur * 10 + weight;
          if (combined > bestUrut) {
            bestUrut = combined;
            bestNama = String(stg.nama || '');
          }
        }
        stageNama = bestNama;
      }
      const status = stageNama ? (STATUS_SHORTHAND[stageNama] || stageNama.toUpperCase()) : '';

      // Split paket → main + variant (misal "PRO A" → PRO / A). Kalau
      // tidak match pattern, seluruh paket masuk kolom PAKET dan variant kosong.
      const paketRaw = String(wo.paket || ord?.paket || '').trim();
      let paketMain = paketRaw;
      let variant = '';
      const mv = paketRaw.match(/^(.+?)\s+([A-Z0-9]{1,3})$/i);
      if (mv) {
        paketMain = mv[1].trim();
        variant = mv[2].trim().toUpperCase();
      }

      const woId = Number(wo.id);
      const editedKet = editing[woId]?.ket;
      const editedNote = editing[woId]?.note;

      list.push({
        id: woId,
        no_wo: String(wo.no_wo || ''),
        customer: String(wo.customer_nama || ''),
        qty: Number(wo.jumlah || 0),
        paket: paketMain,
        variant,
        ket: editedKet !== undefined ? editedKet : String(wo.laporan_ket || ''),
        note: editedNote !== undefined ? editedNote : String(wo.laporan_note || ''),
        dl,
        dlDisplay: dl ? fmtDL(dl) : '',
        status,
        monthKey: monthKey(dl),
      });
    }
    // Sort: DL asc (rows tanpa DL di bawah).
    list.sort((a, b) => {
      if (!a.dl && !b.dl) return a.customer.localeCompare(b.customer);
      if (!a.dl) return 1;
      if (!b.dl) return -1;
      if (a.dl !== b.dl) return a.dl.localeCompare(b.dl);
      return a.customer.localeCompare(b.customer);
    });
    return list;
  }, [wos, ordersById, progressByWo, stagesByIdMap, holidays, editing]);

  // Apply search filter (customer name, no wo, paket, status).
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rowsExpanded;
    return rowsExpanded.filter(r =>
      r.customer.toLowerCase().includes(q) ||
      r.no_wo.toLowerCase().includes(q) ||
      r.paket.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q),
    );
  }, [rowsExpanded, search]);

  // Group by month.
  const groupedByMonth = useMemo(() => {
    const map: Record<string, WoRowExpanded[]> = {};
    for (const r of filteredRows) {
      if (!map[r.monthKey]) map[r.monthKey] = [];
      map[r.monthKey].push(r);
    }
    const keys = Object.keys(map).sort((a, b) => {
      if (a === '_no_dl_') return 1;
      if (b === '_no_dl_') return -1;
      return a.localeCompare(b);
    });
    return keys.map(k => ({ key: k, label: monthLabel(k), rows: map[k] }));
  }, [filteredRows]);

  async function saveKet(woId: number, val: string) {
    // Optimistic: state sudah update via onChange. Persist ke DB.
    try {
      await dbUpdate('work_orders', woId, { laporan_ket: val });
      // Update local wos untuk consistency.
      setWos(prev => prev.map(w => Number(w.id) === woId ? { ...w, laporan_ket: val } : w));
      setEditing(prev => {
        const cp = { ...prev };
        if (cp[woId]) { delete cp[woId].ket; if (!cp[woId].note && cp[woId].note !== '') delete cp[woId]; }
        return cp;
      });
    } catch {
      // biarkan editing state supaya user bisa retry
    }
  }
  async function saveNote(woId: number, val: string) {
    try {
      await dbUpdate('work_orders', woId, { laporan_note: val });
      setWos(prev => prev.map(w => Number(w.id) === woId ? { ...w, laporan_note: val } : w));
      setEditing(prev => {
        const cp = { ...prev };
        if (cp[woId]) { delete cp[woId].note; if (!cp[woId].ket && cp[woId].ket !== '') delete cp[woId]; }
        return cp;
      });
    } catch {}
  }

  const totalWo = filteredRows.length;
  const totalQty = filteredRows.reduce((s, r) => s + r.qty, 0);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-14 bg-white/[0.03] rounded-lg animate-pulse" />
      {[1,2,3].map(i => <div key={i} className="h-24 bg-white/[0.03] rounded-xl animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-violet-500/[0.14] via-indigo-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/25 to-violet-500/5 border border-violet-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Laporan Produksi</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Rekap per WO, dikelompokkan per bulan Deadline Lock · <span className="text-white font-medium">{totalWo} WO · {totalQty} pcs</span>
              </p>
            </div>
          </div>
          <div className="w-full lg:w-80">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cari customer, WO, paket, status..."
                className="w-full bg-white/[0.03] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-blue-500/40" />
            </div>
          </div>
        </div>
      </div>

      {groupedByMonth.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/10 py-16 text-center">
          <p className="text-sm text-slate-400">Tidak ada data.</p>
        </div>
      )}

      {groupedByMonth.map(group => (
        <div key={group.key} className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          <div className="px-6 py-3 border-b border-white/[0.06] bg-blue-500/[0.06]">
            <h2 className="text-lg font-bold text-blue-300 tracking-wide">{group.label}</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">{group.rows.length} WO · {group.rows.reduce((s, r) => s + r.qty, 0)} pcs</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="text-[10px] text-slate-500 font-semibold text-center px-2 py-3 uppercase tracking-wider w-12">NO</th>
                  <th className="text-[10px] text-slate-500 font-semibold text-left px-3 py-3 uppercase tracking-wider min-w-[240px]">CUST</th>
                  <th className="text-[10px] text-slate-500 font-semibold text-center px-2 py-3 uppercase tracking-wider w-16">QTY</th>
                  <th className="text-[10px] text-slate-500 font-semibold text-left px-3 py-3 uppercase tracking-wider min-w-[120px]">PAKET</th>
                  <th className="text-[10px] text-slate-500 font-semibold text-center px-2 py-3 uppercase tracking-wider w-14"></th>
                  <th className="text-[10px] text-slate-500 font-semibold text-left px-3 py-3 uppercase tracking-wider min-w-[100px]">KET</th>
                  <th className="text-[10px] text-slate-500 font-semibold text-left px-3 py-3 uppercase tracking-wider min-w-[140px]">DL</th>
                  <th className="text-[10px] text-slate-500 font-semibold text-left px-3 py-3 uppercase tracking-wider min-w-[110px]">STATUS</th>
                  <th className="text-[10px] text-slate-500 font-semibold text-left px-3 py-3 uppercase tracking-wider min-w-[160px]">NOTE</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((r, i) => {
                  const style = rowStyle(r.status);
                  const localKet = editing[r.id]?.ket ?? r.ket;
                  const localNote = editing[r.id]?.note ?? r.note;
                  return (
                    <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors" style={style.bg !== 'transparent' ? { background: style.bg } : undefined}>
                      <td className="px-2 py-2.5 text-center text-slate-500 tabular-nums text-xs">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col leading-tight">
                          <span className="font-semibold text-white text-[13px] truncate max-w-[280px]" title={r.customer}>{r.customer}</span>
                          <span className="text-[10px] text-blue-400 mt-0.5">{r.no_wo}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums font-semibold text-white">{r.qty}</td>
                      <td className="px-3 py-2.5 text-slate-200 uppercase text-xs font-semibold tracking-wide">{r.paket || '—'}</td>
                      <td className="px-2 py-2.5 text-center text-slate-300 uppercase text-xs font-bold">{r.variant || ''}</td>
                      <td className="px-3 py-2.5">
                        <input
                          value={localKet}
                          onChange={e => setEditing(prev => ({ ...prev, [r.id]: { ...prev[r.id], ket: e.target.value } }))}
                          onBlur={e => { if (e.target.value !== r.ket) saveKet(r.id, e.target.value); }}
                          className="w-full bg-transparent text-slate-300 text-xs px-1 py-0.5 rounded focus:bg-white/[0.06] focus:outline-none"
                          placeholder="—"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-slate-300 text-xs whitespace-nowrap">{r.dlDisplay || <span className="text-slate-600">—</span>}</td>
                      <td className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider" style={style.text !== 'inherit' ? { color: style.text } : undefined}>
                        {r.status || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          value={localNote}
                          onChange={e => setEditing(prev => ({ ...prev, [r.id]: { ...prev[r.id], note: e.target.value } }))}
                          onBlur={e => { if (e.target.value !== r.note) saveNote(r.id, e.target.value); }}
                          className="w-full bg-transparent text-slate-300 text-xs px-1 py-0.5 rounded focus:bg-white/[0.06] focus:outline-none"
                          placeholder="—"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
