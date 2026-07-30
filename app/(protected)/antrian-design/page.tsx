'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dbGet, dbUpdate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';
import {
  DESIGN_STAGE_ORDER,
  DESIGN_STAGE_LABELS,
  DESIGN_DURATIONS,
  computeDesignStageTargets,
  computeCurrentStageDeadline,
  classifyLateDesign,
  totalDurasiDesign,
  nextRevisiStage,
  type DesignStage,
} from '@/lib/design-durasi';
import { isVisibleTanggalOrder } from '@/lib/data-cutoff';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fmtDateLabel(iso: string): string {
  if (!iso) return '-';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  const B = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${d} ${B[m - 1]} ${y}`;
}

function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function daysBetweenLabel(fromISO: string, toISO: string): string {
  if (!fromISO || !toISO) return '';
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1).getTime();
  };
  const diff = Math.round((parse(toISO) - parse(fromISO)) / 86400000);
  if (diff <= 0) return 'hari ini';
  return `terlambat ${diff} hari kalender`;
}

export default function AntrianDesignPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<Row[]>([]);
  const [leads, setLeads] = useState<Row[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DesignStage>('AWAL');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  // Order yang mau di-reject (buka modal). null = modal ditutup.
  const [rejectingOrder, setRejectingOrder] = useState<Row | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  // Order yang mau di-isi keterangan keterlambatan (klik chip Terlambat SLA).
  const [slaNoteOrder, setSlaNoteOrder] = useState<Row | null>(null);
  const [slaNote, setSlaNote] = useState('');
  const [slaNoteSaving, setSlaNoteSaving] = useState(false);
  // Sort mode untuk list order per stage. 'deadline' = ASC by target selesai
  // (pattern default). 'newest' = tanggal_order terbaru dulu. 'oldest' =
  // tanggal_order terlama dulu.
  const [sortMode, setSortMode] = useState<'deadline' | 'newest' | 'oldest'>('deadline');

  useEffect(() => { setSearch(''); }, [activeTab]);

  const fetchData = useCallback(async () => {
    try {
      const [o, l, hol] = await Promise.all([
        dbGet('orders').catch(() => []),
        dbGet('leads').catch(() => []),
        dbGet('libur_nasional').catch(() => []),
      ]);
      setOrders(o);
      setLeads(l);
      setHolidays(new Set(
        (hol as Row[]).map((r: Row) => String(r.tanggal || '').slice(0, 10)).filter(Boolean)
      ));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const leadById = useMemo(() => {
    const m: Record<number, string> = {};
    for (const l of leads) m[Number(l.id)] = String(l.nama || '');
    return m;
  }, [leads]);

  // Order yang tampil di menu ini = finance_status='APPROVED' AND design_stage
  // IS NOT NULL. Legacy data yang design_stage NULL (sebelum feature ini)
  // di-skip supaya tidak tiba-tiba muncul di antrian mereka.
  const antrianOrders = useMemo(() => {
    return orders.filter(o => {
      if (!isVisibleTanggalOrder(o.tanggal_order)) return false;
      const fs = String(o.finance_status || '').toUpperCase();
      if (fs !== 'APPROVED') return false;
      const stage = String(o.design_stage || '');
      return DESIGN_STAGE_ORDER.includes(stage as DesignStage);
    });
  }, [orders]);

  // 2 layer search:
  //   • globalSearch (di tab bar) → filter antrianOrders across all stages.
  //     Hasil populate stageCounts + jadi base activeOrders.
  //   • search (per-stage, di antrian section) → filter tambahan dalam
  //     stage aktif.
  const antrianFiltered = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return antrianOrders;
    return antrianOrders.filter(o =>
      String(o.customer_nama || '').toLowerCase().includes(q)
      || String(o.no_order || '').toLowerCase().includes(q)
    );
  }, [antrianOrders, globalSearch]);

  // Group by stage untuk badge count di tab (pakai hasil filter global).
  const stageCounts = useMemo(() => {
    const c: Record<DesignStage, number> = {
      AWAL: 0, PROSES: 0, REVISI_1: 0, REVISI_2: 0, REVISI_3: 0, SELESAI: 0,
    };
    for (const o of antrianFiltered) {
      const s = o.design_stage as DesignStage;
      if (s in c) c[s]++;
    }
    return c;
  }, [antrianFiltered]);

  // Jumlah order terlambat SLA per stage — dipakai badge merah di tab.
  // Baseline stage saat ini = design_stage_started_at (kalau ada) supaya
  // SLA per-stage mereset saat order pindah stage. Fallback ke
  // design_awal_at untuk order lama yang belum punya stage_started_at.
  // SELESAI skip karena sudah tidak butuh warning lagi.
  const stageLateCounts = useMemo(() => {
    const today = todayIsoLocal();
    const c: Record<DesignStage, number> = {
      AWAL: 0, PROSES: 0, REVISI_1: 0, REVISI_2: 0, REVISI_3: 0, SELESAI: 0,
    };
    for (const o of antrianFiltered) {
      const stage = o.design_stage as DesignStage;
      if (stage === 'SELESAI' || !(stage in c)) continue;
      const baseline = String(o.design_awal_at || '').slice(0, 10);
      const stageStart = String(o.design_stage_started_at || '').slice(0, 10);
      if (!baseline && !stageStart) continue;
      // Deadline stage saat ini — dari stage_started_at kalau ada.
      const tStage = computeCurrentStageDeadline(stageStart, stage, holidays, baseline);
      // Deadline final tetap dari baseline design_awal_at.
      const targets = baseline ? computeDesignStageTargets(baseline, holidays) : ({} as Record<DesignStage, string>);
      const tFinal = targets['REVISI_3'];
      const stageLate = tStage ? classifyLateDesign(tStage, today) === 'terlambat' : false;
      const finalLate = tFinal ? classifyLateDesign(tFinal, today) === 'terlambat' : false;
      if (stageLate || finalLate) c[stage]++;
    }
    return c;
  }, [antrianFiltered, holidays]);

  const activeOrders = useMemo(() => {
    const list = antrianFiltered.filter(o => String(o.design_stage) === activeTab);
    const q = search.trim().toLowerCase();
    const filtered = !q ? list : list.filter(o =>
      String(o.customer_nama || '').toLowerCase().includes(q)
      || String(o.no_order || '').toLowerCase().includes(q)
    );
    return filtered.slice().sort((a, b) => {
      if (sortMode === 'deadline') {
        // Deadline paling dekat naik ke atas. Kalau design_awal_at kosong,
        // fallback ke estimasi_deadline dari CS Selling. Order tanpa target
        // sama sekali diletakkan paling bawah.
        const baseA = String(a.design_awal_at || '').slice(0, 10);
        const baseB = String(b.design_awal_at || '').slice(0, 10);
        const targetA = baseA
          ? (computeDesignStageTargets(baseA, holidays)['REVISI_3'] || '')
          : String(a.estimasi_deadline || '').slice(0, 10);
        const targetB = baseB
          ? (computeDesignStageTargets(baseB, holidays)['REVISI_3'] || '')
          : String(b.estimasi_deadline || '').slice(0, 10);
        if (!targetA && !targetB) return 0;
        if (!targetA) return 1;
        if (!targetB) return -1;
        return targetA.localeCompare(targetB);
      }
      // Sort by tanggal_order (fallback ke created_at kalau tidak ada).
      const tA = String(a.tanggal_order || a.created_at || '').slice(0, 10);
      const tB = String(b.tanggal_order || b.created_at || '').slice(0, 10);
      const cmp = tA.localeCompare(tB);
      return sortMode === 'newest' ? -cmp : cmp;
    });
  }, [antrianFiltered, activeTab, search, holidays, sortMode]);

  // Auto-jump ke stage pertama yang punya match kalau global search
  // baru diketik dan tab aktif kosong. UX: ketik → langsung ke step
  // yang benar.
  const globalSearchRef = useRef(globalSearch);
  useEffect(() => {
    const prev = globalSearchRef.current;
    globalSearchRef.current = globalSearch;
    if (!globalSearch.trim()) return;
    if (prev.trim() === globalSearch.trim()) return;
    if (stageCounts[activeTab] === 0) {
      const firstWithMatch = DESIGN_STAGE_ORDER.find(s => stageCounts[s] > 0);
      if (firstWithMatch) setActiveTab(firstWithMatch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearch, stageCounts]);

  const todayIso = todayIsoLocal();

  // Jumlah order di stage aktif yang lewat SLA. Dipakai chip counter
  // merah di header antrian (mirror pattern di Produksi).
  const activeLateCount = useMemo(() => {
    if (activeTab === 'SELESAI') return 0;
    let n = 0;
    for (const o of activeOrders) {
      const baseline = String(o.design_awal_at || '').slice(0, 10);
      const stageStart = String(o.design_stage_started_at || '').slice(0, 10);
      if (!baseline && !stageStart) continue;
      const tStage = computeCurrentStageDeadline(stageStart, activeTab, holidays, baseline);
      const targets = baseline ? computeDesignStageTargets(baseline, holidays) : ({} as Record<DesignStage, string>);
      const tFinal = targets['REVISI_3'];
      const stageLate = tStage ? classifyLateDesign(tStage, todayIso) === 'terlambat' : false;
      const finalLate = tFinal ? classifyLateDesign(tFinal, todayIso) === 'terlambat' : false;
      if (stageLate || finalLate) n++;
    }
    return n;
  }, [activeOrders, activeTab, holidays, todayIso]);

  // Kumpulkan kartu yang terlambat SLA (baik stage aktif maupun final).
  // Skip stage SELESAI karena sudah tidak butuh warning lagi.
  const lateSummary = useMemo(() => {
    let terlambat = 0;
    let hariH = 0;
    for (const o of antrianOrders) {
      const stage = o.design_stage as DesignStage;
      if (stage === 'SELESAI') continue;
      const baseline = String(o.design_awal_at || '').slice(0, 10);
      const stageStart = String(o.design_stage_started_at || '').slice(0, 10);
      if (!baseline && !stageStart) continue;
      const tStage = computeCurrentStageDeadline(stageStart, stage, holidays, baseline);
      const targets = baseline ? computeDesignStageTargets(baseline, holidays) : ({} as Record<DesignStage, string>);
      const tFinal = targets['REVISI_3'];
      const stageLate = tStage ? classifyLateDesign(tStage, todayIso) : 'aman';
      const finalLate = tFinal ? classifyLateDesign(tFinal, todayIso) : 'aman';
      if (finalLate === 'terlambat' || stageLate === 'terlambat') terlambat++;
      else if (finalLate === 'warning' || stageLate === 'warning') hariH++;
    }
    return { terlambat, hariH };
  }, [antrianOrders, holidays, todayIso]);

  // Notifikasi toast satu kali per session kalau ada yang terlambat pas
  // page pertama kali load. `notifiedRef` mencegah spam saat refetch.
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (notifiedRef.current) return;
    if (lateSummary.terlambat > 0) {
      toast.warning(
        `${lateSummary.terlambat} Order Terlambat SLA`,
        'Ada order yang sudah lewat target SLA — cek chip merah di daftar antrian.',
      );
      notifiedRef.current = true;
    } else if (lateSummary.hariH > 0) {
      toast.info?.(
        `${lateSummary.hariH} Order Hari-H`,
        'Hari ini adalah deadline SLA — segera lanjut proses design.',
      );
      notifiedRef.current = true;
    }
    // toast dependency intentionally omitted supaya tidak re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, lateSummary.terlambat, lateSummary.hariH]);

  function openSlaNoteModal(order: Row) {
    setSlaNoteOrder(order);
    setSlaNote(String(order.keterlambatan_reason || ''));
  }

  async function saveSlaNote() {
    if (!slaNoteOrder) return;
    setSlaNoteSaving(true);
    try {
      await dbUpdate('orders', Number(slaNoteOrder.id), {
        keterlambatan_reason: slaNote.trim() || null,
      });
      toast.success('Tersimpan', 'Keterangan keterlambatan disimpan.');
      setSlaNoteOrder(null);
      setSlaNote('');
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
    setSlaNoteSaving(false);
  }

  // AWAL (Waiting List) → PROSES (Design Awal). Dipanggil dari
  // tombol 'Mulai Proses' di kartu Waiting List. Reset
  // design_stage_started_at supaya SLA PROSES (+2 hari) mulai
  // dihitung dari saat designer pick-up.
  async function startProses(order: Row) {
    setBusyId(Number(order.id));
    try {
      await dbUpdate('orders', Number(order.id), {
        design_stage: 'PROSES',
        design_stage_started_at: nowSql(),
      });
      toast.success('Design Dimulai', `${order.customer_nama || order.no_order} pindah ke Design Awal.`);
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
    setBusyId(null);
  }

  async function advanceToRevisi(order: Row) {
    const cur = order.design_stage as DesignStage;
    const next = nextRevisiStage(cur);
    if (!next) {
      toast.warning('Sudah Maksimal', 'Sudah di Revisi 3 — hanya bisa Selesai.');
      return;
    }
    setBusyId(Number(order.id));
    try {
      await dbUpdate('orders', Number(order.id), {
        design_stage: next,
        design_stage_started_at: nowSql(),
      });
      toast.success('Pindah ke ' + DESIGN_STAGE_LABELS[next], `${order.customer_nama || order.no_order} butuh revisi.`);
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
    setBusyId(null);
  }

  async function finalize(order: Row) {
    setBusyId(Number(order.id));
    try {
      const now = nowSql();
      await dbUpdate('orders', Number(order.id), {
        design_stage: 'SELESAI',
        design_stage_started_at: now,
        design_selesai_at: now,
      });
      toast.success('Design Selesai', `${order.customer_nama || order.no_order} siap dilanjut ke CS Order.`);
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
    setBusyId(null);
  }

  // Klik tombol Batalkan → buka modal reject (isi alasan wajib).
  function openRejectModal(order: Row) {
    setRejectingOrder(order);
    setRejectReason('');
  }

  function closeRejectModal() {
    if (busyId != null) return; // sedang submit, jangan tutup
    setRejectingOrder(null);
    setRejectReason('');
  }

  // Submit reject setelah alasan diisi.
  async function submitReject() {
    if (!rejectingOrder) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      toast.warning('Alasan Wajib', 'Isi alasan minimal 3 karakter untuk melanjutkan.');
      return;
    }
    // Fallback: kalau kolom design_reject_reason belum ada (migration 044
    // belum jalan), retry tanpa field itu supaya alur tidak break.
    setBusyId(Number(rejectingOrder.id));
    try {
      const now = nowSql();
      try {
        await dbUpdate('orders', Number(rejectingOrder.id), {
          design_stage: 'REJECTED',
          design_rejected_at: now,
          design_reject_reason: reason,
        });
      } catch (err) {
        console.warn('reject with reason failed, retrying without:', err);
        await dbUpdate('orders', Number(rejectingOrder.id), {
          design_stage: 'REJECTED',
          design_rejected_at: now,
        });
      }
      toast.success('Pesanan Dibatalkan', `${rejectingOrder.customer_nama || rejectingOrder.no_order} pindah ke History Reject.`);
      setRejectingOrder(null);
      setRejectReason('');
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
    setBusyId(null);
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-14 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-fuchsia-500/[0.14] via-pink-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-fuchsia-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-fuchsia-500/25 to-fuchsia-500/5 border border-fuchsia-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-fuchsia-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Antrian Design</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Design dari CS Selling → SELESAI, baru CS Order bisa lanjut Rincian Order. Klik <strong className="text-white">Butuh Revisi</strong> atau <strong className="text-white">Selesai</strong> untuk lanjut.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {lateSummary.terlambat > 0 && (
              <div className="flex items-center gap-2 bg-red-500/[0.12] border border-red-500/40 rounded-xl px-3 py-2 shadow-lg shadow-red-500/10">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/40 grid place-items-center text-red-200">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-red-300 uppercase tracking-widest">Terlambat SLA</p>
                  <p className="text-lg font-bold text-white leading-tight tabular-nums">{lateSummary.terlambat} order</p>
                </div>
              </div>
            )}
            {lateSummary.hariH > 0 && (
              <div className="flex items-center gap-2 bg-amber-500/[0.10] border border-amber-500/40 rounded-xl px-3 py-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 grid place-items-center text-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-amber-300 uppercase tracking-widest">Hari-H</p>
                  <p className="text-lg font-bold text-white leading-tight tabular-nums">{lateSummary.hariH} order</p>
                </div>
              </div>
            )}
            <div className="hidden md:flex items-center gap-2 bg-[#111827] border border-white/10 rounded-xl px-4 py-2.5">
              <svg className="w-4 h-4 text-fuchsia-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-[10px] font-semibold text-fuchsia-300/70 uppercase tracking-widest">Total SLA</p>
                <p className="text-sm font-bold text-white leading-tight">{totalDurasiDesign()} hari kerja</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stage Tabs + Global Search — global search di kanan filter
          semua stage sekaligus. Badge count di tiap tab otomatis
          update sesuai hasil pencarian. */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-2 flex items-stretch gap-2 flex-wrap">
        <div className="flex gap-0 flex-1 min-w-0 overflow-x-auto">
          {DESIGN_STAGE_ORDER.map(stage => {
            const count = stageCounts[stage];
            const lateCount = stageLateCounts[stage];
            const isActiveTab = activeTab === stage;
            return (
              <button key={stage} onClick={() => setActiveTab(stage)}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium whitespace-nowrap transition-all ${
                  isActiveTab
                    ? 'text-white bg-gradient-to-b from-fuchsia-500/25 to-fuchsia-500/10 border border-fuchsia-500/30 shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent'
                }`}>
                {DESIGN_STAGE_LABELS[stage]}
                {count > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full ${
                    isActiveTab ? 'bg-white/20 text-white' : 'bg-fuchsia-500/20 text-fuchsia-300'
                  }`}>{count}</span>
                )}
                {lateCount > 0 && (
                  <span
                    className="inline-flex items-center gap-1 min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full bg-red-500/25 text-red-200 border border-red-500/40"
                    title={`${lateCount} order terlambat SLA`}
                  >
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.983 1.907a1.5 1.5 0 012.034 0l9.5 8.774a1.5 1.5 0 01-1.017 2.606H2.5A1.5 1.5 0 011.483 10.68l9.5-8.774a1.5 1.5 0 01.5-.319 1.5 1.5 0 01.5 0z" />
                    </svg>
                    {lateCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-[280px] shrink-0">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            placeholder="Cari di semua step..."
            title="Filter semua stage sekaligus"
            className="w-full h-full bg-[#0d1117] border border-white/10 text-white text-sm placeholder-slate-500 rounded-xl pl-9 pr-8 py-2.5 focus:outline-none focus:border-fuchsia-500/40"
          />
          {globalSearch && (
            <button
              type="button"
              onClick={() => setGlobalSearch('')}
              title="Clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Antrian section */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-fuchsia-500/10 grid place-items-center shrink-0">
            <svg className="w-5 h-5 text-fuchsia-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white">{DESIGN_STAGE_LABELS[activeTab]}</h2>
            <div className="flex items-center gap-4 mt-1 flex-wrap">
              <span className="text-xs text-slate-500">
                Jumlah Order: <strong className="text-white">{activeOrders.length}</strong>
              </span>
              {activeTab !== 'SELESAI' && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-300">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Durasi SLA:
                  {DESIGN_DURATIONS[activeTab] === 0
                    ? <strong>hari yang sama</strong>
                    : <strong>+{DESIGN_DURATIONS[activeTab]} hari kerja</strong>}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SortDropdown value={sortMode} onChange={setSortMode} />
            {activeLateCount > 0 && (
              <div
                title="Jumlah order di stage ini yang sudah lewat target SLA (stage aktif atau final). Cek chip merah di daftar antrian."
                className="flex items-center gap-2 shrink-0 bg-red-500/[0.12] border border-red-500/40 rounded-xl px-3 py-2 shadow-lg shadow-red-500/10"
              >
                <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/40 grid place-items-center text-red-200">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-red-300 uppercase tracking-widest">Terlambat SLA</p>
                  <p className="text-lg font-bold text-white leading-tight tabular-nums">{activeLateCount} order</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="relative w-full">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari No Order atau nama customer..."
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm placeholder-slate-500 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-fuchsia-500/40"
          />
        </div>

        {activeOrders.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-500/15 to-transparent border border-fuchsia-500/20 grid place-items-center mx-auto mb-3">
              <svg className="w-6 h-6 text-fuchsia-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm text-slate-300 font-medium">
              {activeTab === 'SELESAI' ? 'Belum ada design yang selesai' : `Belum ada order di ${DESIGN_STAGE_LABELS[activeTab]}`}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              {activeTab === 'AWAL'
                ? 'Order otomatis masuk sini setelah Finance approve DP Design.'
                : activeTab === 'PROSES'
                  ? 'Klik Mulai Proses di kartu Waiting List untuk memindah order ke sini.'
                  : 'Order pindah ke sini kalau customer minta revisi.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04] -mx-6">
            {activeOrders.map(o => (
              <OrderCard
                key={o.id}
                order={o}
                leadName={leadById[Number(o.lead_id)] || ''}
                todayIso={todayIso}
                holidays={holidays}
                busy={busyId === Number(o.id)}
                onMulai={() => startProses(o)}
                onRevisi={() => advanceToRevisi(o)}
                onSelesai={() => finalize(o)}
                onReject={() => openRejectModal(o)}
                onEditSlaNote={() => openSlaNoteModal(o)}
              />
            ))}
          </div>
        )}
      </div>

      {rejectingOrder && (
        <RejectReasonModal
          order={rejectingOrder}
          reason={rejectReason}
          setReason={setRejectReason}
          saving={busyId === Number(rejectingOrder.id)}
          onCancel={closeRejectModal}
          onSubmit={submitReject}
        />
      )}

      {slaNoteOrder && (
        <SlaNoteModal
          order={slaNoteOrder}
          note={slaNote}
          setNote={setSlaNote}
          saving={slaNoteSaving}
          onCancel={() => { if (!slaNoteSaving) { setSlaNoteOrder(null); setSlaNote(''); } }}
          onSubmit={saveSlaNote}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   SlaNoteModal — dialog untuk isi keterangan keterlambatan SLA.
   Muncul saat operator klik chip 'Terlambat SLA' / 'Lewat Deadline'.
   ───────────────────────────────────────────────────────────────────── */
function SlaNoteModal({
  order, note, setNote, saving, onCancel, onSubmit,
}: {
  order: Row;
  note: string;
  setNote: (v: string) => void;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-[#1a1f35] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-gradient-to-r from-red-500/[0.10] to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/25 grid place-items-center">
              <svg className="w-5 h-5 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Keterangan Keterlambatan</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                <span className="text-fuchsia-300 font-semibold">{order.no_order}</span> · {order.customer_nama || '(Tanpa nama)'}
              </p>
            </div>
          </div>
          <button onClick={onCancel} disabled={saving} className="text-slate-500 hover:text-white transition-colors p-1.5 hover:bg-white/[0.05] rounded-lg disabled:opacity-50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-3">
          <label className="block text-[11px] font-medium text-slate-400">Alasan keterlambatan</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Contoh: revisi warna dari customer, menunggu approval, dll..."
            rows={4}
            autoFocus
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-red-500/40 resize-none"
          />
          <p className="text-[11px] text-slate-500">Keterangan akan muncul di sebelah chip Terlambat SLA supaya tim lain langsung tahu situasinya. Kosongkan untuk hapus keterangan.</p>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06] bg-white/[0.015]">
          <button onClick={onCancel} disabled={saving} className="px-5 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] disabled:opacity-50">
            Batal
          </button>
          <button onClick={onSubmit} disabled={saving} className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-semibold">
            {saving ? 'Menyimpan...' : 'Simpan Keterangan'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   SortDropdown — pilih urutan list order antrian design.
   ───────────────────────────────────────────────────────────────────── */
function SortDropdown({ value, onChange }: {
  value: 'deadline' | 'newest' | 'oldest';
  onChange: (v: 'deadline' | 'newest' | 'oldest') => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);
  const labels: Record<typeof value, string> = {
    deadline: 'Deadline Terdekat',
    newest: 'Terbaru Dulu',
    oldest: 'Terlama Dulu',
  };
  const opts: { key: typeof value; label: string; desc: string }[] = [
    { key: 'deadline', label: 'Deadline Terdekat', desc: 'Target selesai paling dekat naik ke atas' },
    { key: 'newest', label: 'Terbaru Dulu', desc: 'Tanggal order terbaru di atas' },
    { key: 'oldest', label: 'Terlama Dulu', desc: 'Tanggal order paling lama di atas' },
  ];
  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Urutkan list order"
        className="flex items-center gap-2 bg-[#111827] border border-white/10 hover:bg-white/[0.04] rounded-xl px-3 py-2.5 text-xs font-medium text-slate-300 transition-colors"
      >
        <svg className="w-4 h-4 text-fuchsia-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25" />
        </svg>
        <span>Sort: {labels[value]}</span>
        <svg className={`w-3 h-3 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 right-0 w-64 bg-[#0d1117] border border-white/10 rounded-lg shadow-xl overflow-hidden">
          {opts.map(o => (
            <button
              key={o.key}
              type="button"
              onClick={() => { onChange(o.key); setOpen(false); }}
              className={`w-full text-left px-3 py-2.5 transition-colors ${o.key === value ? 'bg-fuchsia-600/20 text-fuchsia-200' : 'text-slate-300 hover:bg-white/[0.04]'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{o.label}</span>
                {o.key === value && (
                  <svg className="w-3.5 h-3.5 text-fuchsia-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">{o.desc}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   RejectReasonModal — dialog untuk isi alasan batal pemesanan.
   Wajib min 3 karakter sebelum submit.
   ───────────────────────────────────────────────────────────────────── */
function RejectReasonModal({
  order, reason, setReason, saving, onCancel, onSubmit,
}: {
  order: Row;
  reason: string;
  setReason: (v: string) => void;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={saving ? undefined : onCancel} />
      <div className="relative bg-[#1a1f35] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-toast-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-gradient-to-r from-rose-500/[0.10] to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/25 grid place-items-center">
              <svg className="w-5 h-5 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Batalkan Pesanan</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {order.no_order} · <strong className="text-slate-300">{order.customer_nama || '-'}</strong>
              </p>
            </div>
          </div>
          <button onClick={onCancel} disabled={saving} className="text-slate-500 hover:text-white transition-colors p-1.5 hover:bg-white/[0.05] rounded-lg disabled:opacity-50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-sm text-slate-300 bg-rose-500/[0.06] border border-rose-500/20 rounded-lg px-4 py-3">
            Order akan dipindah ke <strong className="text-white">History Reject</strong> dan tidak bisa lanjut ke CS Order.
            Bisa dikembalikan lagi ke antrian kalau customer berubah pikiran.
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1.5">
              Alasan <span className="text-rose-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={5}
              autoFocus
              placeholder="Contoh: Customer batal karena harga, pindah vendor, tidak jadi ambil, dll."
              className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-rose-500/40 resize-none"
              disabled={saving}
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Wajib diisi minimal 3 karakter. Alasan disimpan di History Reject untuk audit.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06] bg-white/[0.015]">
          <button onClick={onCancel} disabled={saving}
            className="px-5 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-50">
            Batal
          </button>
          <button onClick={onSubmit} disabled={saving || reason.trim().length < 3}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-lg shadow-rose-500/20">
            {saving ? 'Menyimpan...' : 'Submit Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderCard({
  order, leadName, todayIso, holidays, busy, onMulai, onRevisi, onSelesai, onReject, onEditSlaNote,
}: {
  order: Row;
  leadName: string;
  todayIso: string;
  holidays: Set<string>;
  busy: boolean;
  onMulai: () => void;
  onRevisi: () => void;
  onSelesai: () => void;
  onReject: () => void;
  onEditSlaNote: () => void;
}) {
  const currentStage = order.design_stage as DesignStage;
  const isSelesai = currentStage === 'SELESAI';
  const isWaiting = currentStage === 'AWAL';
  const isRevisi3 = currentStage === 'REVISI_3';

  const baselineIso = String(order.design_awal_at || '').slice(0, 10);
  const stageStartedIso = String(order.design_stage_started_at || '').slice(0, 10);
  const targets = useMemo(
    () => baselineIso ? computeDesignStageTargets(baselineIso, holidays) : ({} as Record<DesignStage, string>),
    [baselineIso, holidays],
  );
  // Deadline stage saat ini pakai stage_started_at supaya per-stage SLA
  // reset tiap kali order pindah. Kalau stage_started_at kosong (order
  // legacy), fallback ke deadline dari baseline.
  const targetStage = useMemo(
    () => computeCurrentStageDeadline(stageStartedIso, currentStage, holidays, baselineIso),
    [stageStartedIso, currentStage, holidays, baselineIso],
  );
  const targetSelesaiFinal = targets['REVISI_3'] || '';
  const lateStatus = targetStage ? classifyLateDesign(targetStage, todayIso) : 'aman';
  const finalLate = targetSelesaiFinal ? classifyLateDesign(targetSelesaiFinal, todayIso) : 'aman';
  const isDangerLate = !isSelesai && (finalLate === 'terlambat' || lateStatus === 'terlambat');
  const isWarnLate = !isDangerLate && !isSelesai && (finalLate === 'warning' || lateStatus === 'warning');

  const wrapCls = isDangerLate
    ? 'relative flex flex-col gap-2 px-6 py-4 bg-gradient-to-r from-red-500/[0.08] to-transparent hover:from-red-500/[0.12] transition-colors'
    : isWarnLate
      ? 'relative flex flex-col gap-2 px-6 py-4 bg-gradient-to-r from-amber-500/[0.05] to-transparent hover:from-amber-500/[0.08] transition-colors'
      : 'flex flex-col gap-2 px-6 py-4 hover:bg-white/[0.02] transition-colors';

  return (
    <div className={wrapCls}>
      {isDangerLate && (
        <span aria-hidden className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-red-500" />
      )}
      {isWarnLate && (
        <span aria-hidden className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-amber-500" />
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-fuchsia-300 whitespace-nowrap">{order.no_order}</span>
            <span className={`text-sm font-semibold ${isDangerLate ? 'text-red-100' : 'text-white'}`}>{order.customer_nama || '(Tanpa nama)'}</span>

            {isDangerLate && finalLate === 'terlambat' && (
              <button
                type="button"
                onClick={onEditSlaNote}
                title={`Target final ${fmtDateLabel(targetSelesaiFinal)} — sudah lewat. Klik untuk isi/edit keterangan.`}
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-red-500/50 text-white bg-red-500/40 hover:bg-red-500/60 transition-colors whitespace-nowrap cursor-pointer"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                Lewat Deadline
              </button>
            )}
            {finalLate !== 'terlambat' && lateStatus === 'terlambat' && !isSelesai && (
              <button
                type="button"
                onClick={onEditSlaNote}
                title={`Target stage ini ${fmtDateLabel(targetStage)}. Klik untuk isi/edit keterangan.`}
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-red-500/40 text-red-300 bg-red-500/15 hover:bg-red-500/30 transition-colors whitespace-nowrap cursor-pointer"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                Terlambat SLA
              </button>
            )}
            {order.keterlambatan_reason && (isDangerLate || (lateStatus === 'terlambat' && !isSelesai)) && (
              <span
                onClick={onEditSlaNote}
                title="Klik untuk edit keterangan"
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border border-slate-500/40 text-slate-200 bg-slate-500/10 hover:bg-slate-500/20 transition-colors cursor-pointer max-w-[380px] truncate"
              >
                <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <span className="truncate">{String(order.keterlambatan_reason)}</span>
              </span>
            )}
            {finalLate !== 'terlambat' && lateStatus === 'warning' && !isSelesai && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-300 bg-amber-500/15 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Hari-H
              </span>
            )}
            {isSelesai && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-500/40 text-emerald-300 bg-emerald-500/15 whitespace-nowrap">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Siap ke CS Order
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
            {leadName && (
              <>
                <span className="text-slate-400">Leads: <strong className="text-slate-200">{leadName}</strong></span>
                <span className="text-slate-600">|</span>
              </>
            )}
            <span className="text-slate-400">HP: <strong className="text-slate-200">{order.customer_phone || '-'}</strong></span>
            {targetSelesaiFinal && !isSelesai && (
              <>
                <span className="text-slate-600">|</span>
                <span className={`inline-flex items-center gap-1 ${finalLate === 'terlambat' ? 'text-red-300' : finalLate === 'warning' ? 'text-amber-300' : 'text-slate-400'}`}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  Target selesai: <strong className="font-semibold">{fmtDateLabel(targetSelesaiFinal)}</strong>
                </span>
              </>
            )}
            {isSelesai && order.design_selesai_at && (
              <>
                <span className="text-slate-600">|</span>
                <span className="text-emerald-300">
                  Selesai: <strong>{fmtDateLabel(String(order.design_selesai_at).slice(0, 10))}</strong>
                </span>
              </>
            )}
          </div>

          {isDangerLate && finalLate === 'terlambat' && (
            <div className="mt-1.5 text-[11px] leading-snug max-w-2xl bg-red-500/20 border border-red-500/40 text-red-100 rounded-lg px-3 py-2 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <strong className="text-red-200 uppercase tracking-wider text-[10px]">Lewat Deadline Design</strong>
                <div className="mt-0.5">
                  Target Design final <strong>{fmtDateLabel(targetSelesaiFinal)}</strong> — {daysBetweenLabel(targetSelesaiFinal, todayIso)}. Segera selesaikan!
                </div>
              </div>
            </div>
          )}
        </div>

        {!isSelesai && (
          <div className="flex items-center gap-2 shrink-0">
            {isWaiting ? (
              <button
                onClick={onMulai}
                disabled={busy}
                title="Ambil order — pindah ke Design Awal, SLA +2 hari kerja mulai dihitung dari sekarang."
                className="text-xs font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors shadow-lg shadow-fuchsia-500/20"
              >
                {busy ? 'Memindah...' : 'Mulai Proses'}
              </button>
            ) : (
              <button
                onClick={onRevisi}
                disabled={busy || isRevisi3}
                title={isRevisi3 ? 'Sudah di Revisi 3 — hanya bisa Selesai' : undefined}
                className="text-xs font-semibold text-amber-300 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors"
              >
                Butuh Revisi
              </button>
            )}
            <button
              onClick={onSelesai}
              disabled={busy}
              className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors shadow-lg shadow-emerald-500/20"
            >
              {busy ? 'Menyimpan...' : 'Selesai'}
            </button>
            <button
              onClick={onReject}
              disabled={busy}
              title="Batalkan pesanan — customer tidak lanjut. Pindah ke History Reject."
              className="text-xs font-semibold text-rose-300 border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 px-3 py-2 rounded-lg transition-colors"
            >
              Batalkan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
