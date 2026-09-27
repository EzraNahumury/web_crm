'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { dbGet } from '@/lib/api-db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// One reject enriched with its WO / stage / item context so the tracking
// table never has to look anything up while rendering.
interface RejectView {
  id: number;
  workOrderId: number;
  noWo: string;
  customer: string;
  stage: string;
  tipe: string;              // WITH_BAHAN | WITHOUT_BAHAN
  status: string;            // PENDING | APPROVED | GUDANG_REJECTED | RETURNED | CANCELLED
  keterangan: string;
  createdAt: string;
  resolvedAt: string;
  gudangBy: string;
  gudangNotes: string;
  items: Row[];              // stage_reject_items (bahan/warna/kuantitas) for WITH_BAHAN
}

interface CustomerGroup {
  customer: string;
  rejects: RejectView[];
  pending: number;           // masih menunggu gudang — angka yang paling perlu di-track
}

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '-';
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?/);
  if (!m) return String(v);
  const time = m[4] ? ` ${m[4]}:${m[5] || '00'}` : '';
  return `${m[3]}/${m[2]}/${m[1]}${time}`;
}

// Status → label + pill styling. Kept in one place so the chips, the badges
// and the per-customer summary all read the same.
function statusMeta(st: string): { label: string; cls: string } {
  switch (st) {
    case 'PENDING': return { label: 'Menunggu Gudang', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
    case 'APPROVED': return { label: 'Bahan Disetujui', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
    case 'GUDANG_REJECTED': return { label: 'Ditolak Gudang', cls: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
    case 'RETURNED': return { label: 'Perbaiki di Tempat', cls: 'text-sky-400 bg-sky-500/10 border-sky-500/20' };
    case 'CANCELLED': return { label: 'Dibatalkan', cls: 'text-slate-500 bg-slate-500/10 border-slate-500/20' };
    default: return { label: st || '-', cls: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };
  }
}

function tipeLabel(t: string): string {
  return String(t).toUpperCase() === 'WITH_BAHAN' ? 'Butuh Bahan' : 'Perbaiki di Tempat';
}

type Filter = 'ALL' | 'PENDING' | 'APPROVED' | 'GUDANG_REJECTED' | 'RETURNED' | 'CANCELLED';

export default function TrackingRejectPage() {
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<RejectView[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rejects, items, wos, stages] = await Promise.all([
        dbGet('stage_rejects').catch(() => []),
        dbGet('stage_reject_items').catch(() => []),
        dbGet('work_orders').catch(() => []),
        dbGet('production_stages').catch(() => []),
      ]);
      const woById = new Map<number, Row>((wos as Row[]).map(w => [Number(w.id), w]));
      const stageById = new Map<number, Row>((stages as Row[]).map(s => [Number(s.id), s]));
      const itemsByReject = new Map<number, Row[]>();
      for (const it of items as Row[]) {
        const rid = Number(it.reject_id);
        if (!itemsByReject.has(rid)) itemsByReject.set(rid, []);
        itemsByReject.get(rid)!.push(it);
      }
      const built: RejectView[] = (rejects as Row[]).map(r => {
        const wo = woById.get(Number(r.work_order_id));
        const its = (itemsByReject.get(Number(r.id)) || [])
          .sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0));
        return {
          id: Number(r.id),
          workOrderId: Number(r.work_order_id),
          noWo: String(wo?.no_wo || `WO#${r.work_order_id}`),
          customer: String(wo?.customer_nama || 'Tanpa Nama'),
          stage: String(stageById.get(Number(r.stage_id))?.nama || '-'),
          tipe: String(r.tipe || ''),
          status: String(r.status || '').toUpperCase(),
          keterangan: String(r.keterangan || ''),
          createdAt: String(r.created_at || ''),
          resolvedAt: String(r.resolved_at || ''),
          gudangBy: String(r.gudang_approved_by || ''),
          gudangNotes: String(r.gudang_notes || ''),
          items: its,
        };
      });
      // Terbaru dulu.
      built.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      setViews(built);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: views.length, PENDING: 0, APPROVED: 0, GUDANG_REJECTED: 0, RETURNED: 0, CANCELLED: 0 };
    for (const v of views) if (v.status in c) c[v.status as Filter]++;
    return c;
  }, [views]);

  // Apply status filter + free-text search (customer or no WO), then group
  // by customer so each customer becomes one collapsible dropdown.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = views.filter(v => {
      if (filter !== 'ALL' && v.status !== filter) return false;
      if (q && !(`${v.customer} ${v.noWo}`.toLowerCase().includes(q))) return false;
      return true;
    });
    const byCust = new Map<string, RejectView[]>();
    for (const v of filtered) {
      if (!byCust.has(v.customer)) byCust.set(v.customer, []);
      byCust.get(v.customer)!.push(v);
    }
    const out: CustomerGroup[] = [];
    for (const [customer, rejects] of byCust) {
      out.push({ customer, rejects, pending: rejects.filter(r => r.status === 'PENDING').length });
    }
    // Customer dengan permintaan pending naik ke atas, lalu terbanyak reject.
    out.sort((a, b) => (b.pending - a.pending) || (b.rejects.length - a.rejects.length) || a.customer.localeCompare(b.customer));
    return out;
  }, [views, filter, search]);

  const toggle = (cust: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(cust)) next.delete(cust); else next.add(cust);
    return next;
  });

  const chips: { key: Filter; label: string; cls: string }[] = [
    { key: 'ALL', label: 'Semua', cls: 'text-slate-300' },
    { key: 'PENDING', label: 'Menunggu Gudang', cls: 'text-amber-400' },
    { key: 'APPROVED', label: 'Bahan Disetujui', cls: 'text-emerald-400' },
    { key: 'GUDANG_REJECTED', label: 'Ditolak Gudang', cls: 'text-rose-400' },
    { key: 'RETURNED', label: 'Perbaiki di Tempat', cls: 'text-sky-400' },
    { key: 'CANCELLED', label: 'Dibatalkan', cls: 'text-slate-500' },
  ];

  if (loading) return (
    <div className="space-y-3">
      <div className="h-24 bg-white/[0.03] rounded-2xl animate-pulse" />
      {[1, 2, 3].map(i => <div key={i} className="h-14 bg-white/[0.03] rounded-xl animate-pulse" />)}
    </div>
  );

  const totalCustomers = groups.length;

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-rose-500/[0.14] via-rose-500/[0.05] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500/25 to-rose-500/5 border border-rose-500/25 grid place-items-center shrink-0">
            <svg className="w-5 h-5 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Tracking Reject</h1>
            <p className="text-[13px] text-slate-300 mt-0.5 max-w-2xl">
              Semua permintaan reject bahan dari produksi (QC Panel Process, Sewing, QC Final dan Packing),
              dikelompokkan per customer. Klik nama customer untuk lihat detail rejectnya.
            </p>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-2 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {chips.map(t => {
            const active = filter === t.key;
            const n = counts[t.key];
            return (
              <button key={t.key} onClick={() => setFilter(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium whitespace-nowrap transition-all ${
                  active
                    ? 'text-white bg-gradient-to-b from-rose-500/25 to-rose-500/10 border border-rose-500/30 shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent'
                }`}>
                {t.label}
                {n > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full ${
                    active ? 'bg-white/20 text-white' : `bg-white/[0.06] ${t.cls}`
                  }`}>{n}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Cari customer atau No WO..."
          className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#111827] border border-white/[0.06] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/40" />
      </div>

      {/* Customer groups (dropdown) */}
      {groups.length === 0 ? (
        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] px-5 py-12 text-center text-sm text-slate-500">
          Tidak ada data reject di kategori ini.
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500 px-1">{totalCustomers} customer dengan data reject</p>
          <div className="space-y-2.5">
            {groups.map(g => {
              const isOpen = expanded.has(g.customer);
              return (
                <div key={g.customer} className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
                  {/* Dropdown header */}
                  <button onClick={() => toggle(g.customer)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors">
                    <svg className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    <span className="text-sm font-semibold text-white flex-1 truncate">{g.customer}</span>
                    {g.pending > 0 && (
                      <span className="text-[11px] font-medium px-2.5 py-1 rounded-full border text-amber-400 bg-amber-500/10 border-amber-500/20 whitespace-nowrap">
                        {g.pending} menunggu gudang
                      </span>
                    )}
                    <span className="text-[11px] font-medium px-2.5 py-1 rounded-full border text-slate-400 bg-white/[0.04] border-white/[0.08] whitespace-nowrap">
                      {g.rejects.length} reject
                    </span>
                  </button>

                  {/* Detail table */}
                  {isOpen && (
                    <div className="border-t border-white/[0.06] overflow-x-auto">
                      <table className="w-full min-w-[820px]">
                        <thead>
                          <tr className="border-b border-white/[0.06] text-[10px] text-slate-500 font-semibold uppercase tracking-widest bg-white/[0.015]">
                            <th className="text-left px-5 py-3">No WO</th>
                            <th className="text-left px-5 py-3">Proses</th>
                            <th className="text-left px-5 py-3">Jenis</th>
                            <th className="text-left px-5 py-3">Status</th>
                            <th className="text-left px-5 py-3">Keterangan</th>
                            <th className="text-left px-5 py-3">Tgl Reject</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.rejects.map(r => {
                            const sm = statusMeta(r.status);
                            return (
                              <tr key={r.id} className="border-b border-white/[0.04] align-top">
                                <td className="px-5 py-3.5 text-sm font-medium text-blue-400 whitespace-nowrap">{r.noWo}</td>
                                <td className="px-5 py-3.5 text-sm text-slate-300 whitespace-nowrap">{r.stage}</td>
                                <td className="px-5 py-3.5 text-sm text-slate-400 whitespace-nowrap">{tipeLabel(r.tipe)}</td>
                                <td className="px-5 py-3.5">
                                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap ${sm.cls}`}>{sm.label}</span>
                                </td>
                                <td className="px-5 py-3.5 text-sm text-slate-400 max-w-sm">
                                  <div>{r.keterangan || '-'}</div>
                                  {/* Bahan yang diminta ke gudang */}
                                  {r.items.length > 0 && (
                                    <ul className="mt-1.5 space-y-0.5">
                                      {r.items.map(it => (
                                        <li key={it.id} className="text-[11px] text-slate-500">
                                          • <span className="text-slate-300">{it.item}</span>
                                          {it.bahan ? ` — ${it.bahan}` : ''}{it.warna ? `, ${it.warna}` : ''}{it.kuantitas ? ` (${it.kuantitas})` : ''}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  {/* Catatan gudang saat menolak */}
                                  {r.status === 'GUDANG_REJECTED' && r.gudangNotes && (
                                    <div className="mt-1.5 text-[11px] text-rose-300/80">Catatan gudang: {r.gudangNotes}</div>
                                  )}
                                  {(r.status === 'APPROVED' || r.status === 'GUDANG_REJECTED') && r.gudangBy && (
                                    <div className="mt-1 text-[11px] text-slate-600">oleh {r.gudangBy}{r.resolvedAt ? ` · ${fmtDate(r.resolvedAt)}` : ''}</div>
                                  )}
                                </td>
                                <td className="px-5 py-3.5 text-sm text-slate-400 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
