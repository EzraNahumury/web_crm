'use client';
import { useState, useEffect, useCallback } from 'react';
import { dbGet, dbUpdate, dbCreate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth-context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// Only this account gets the "Kembalikan" (roll back a stage) button.
// Gated by email straight off the session so it works without re-login.
const ROLLBACK_EMAIL = 'admin@gmail.com';

const PROD_STAGES = [
  'Approval Design', 'Approval Pattern', 'Proofing', 'Printing Layout',
  'Approval Layout', 'Printing Process', 'Sublim Press', 'QC Panel Process',
  'Fabric Cutting', 'QC Cutting', 'Sewing', 'QC Jersey',
  'Steam Jersey', 'Finishing', 'Shipment',
];

export default function ProduksiPage() {
  const { user } = useAuth();
  const [activeStage, setActiveStage] = useState(PROD_STAGES[0]);
  const [stages, setStages] = useState<Row[]>([]);
  const [progress, setProgress] = useState<Row[]>([]);
  const [wos, setWos] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Reset the search box whenever CS switches to a different stage tab.
  useEffect(() => { setSearch(''); }, [activeStage]);
  const toast = useToast();

  // Determine if user has full access (admin/super admin) or limited stage access
  const isFullAccess = !user?.stageAccess || user.stageAccess.length === 0;

  // Check if user can manage a specific stage (has write access)
  const canManageStage = useCallback((stageId: number) => {
    if (isFullAccess) return true;
    return user?.stageAccess?.includes(stageId) || false;
  }, [isFullAccess, user?.stageAccess]);

  const fetchData = useCallback(async () => {
    try {
      const [s, p, w] = await Promise.all([
        dbGet('production_stages'),
        dbGet('wo_progress'),
        dbGet('work_orders'),
      ]);
      const sortedStages = s.sort((a: Row, b: Row) => (a.urutan || 0) - (b.urutan || 0));
      let updatedProgress: Row[] = p;

      // Auto-create missing wo_progress for existing WOs
      const activeWos = w.filter((wo: Row) => wo.status === 'PROSES_PRODUKSI');
      for (const wo of activeWos) {
        const woProgressIds = p.filter((pr: Row) => pr.work_order_id === wo.id).map((pr: Row) => pr.stage_id);
        if (woProgressIds.length === 0 && sortedStages.length > 0) {
          for (const stage of sortedStages) {
            await dbCreate('wo_progress', {
              work_order_id: wo.id,
              stage_id: stage.id,
              status: stage.id === sortedStages[0].id ? 'TERSEDIA' : 'BELUM',
            });
          }
          if (!wo.current_stage_id) {
            await dbUpdate('work_orders', Number(wo.id), { current_stage_id: sortedStages[0].id });
          }
          updatedProgress = await dbGet('wo_progress');
        }
      }

      setStages(sortedStages);
      setProgress(updatedProgress);
      setWos(w);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Find stage record by name
  const activeStageRow = stages.find((s: Row) => s.nama === activeStage);
  const activeStageId = activeStageRow?.id;
  const activeStageCanManage = activeStageId ? canManageStage(activeStageId) : false;

  // Show actionable WOs at this stage. Includes legacy SEDANG rows so any
  // in-flight work from the old two-click flow still shows here and can be
  // advanced with a single click.
  const tersediaItems = progress.filter((p: Row) =>
    p.stage_id === activeStageId && (p.status === 'TERSEDIA' || p.status === 'SEDANG')
  );

  // Merge with WO data
  function getWoForProgress(items: Row[]): Row[] {
    return items.map((p: Row) => {
      const wo = wos.find((w: Row) => w.id === p.work_order_id);
      return { ...p, wo };
    }).filter(item => item.wo);
  }

  const tersediaWosRaw = getWoForProgress(tersediaItems);
  const tersediaWos = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return tersediaWosRaw;
    return tersediaWosRaw.filter(item => {
      const wo = item.wo;
      return String(wo?.no_wo || '').toLowerCase().includes(q)
        || String(wo?.customer_nama || '').toLowerCase().includes(q)
        || String(wo?.paket || '').toLowerCase().includes(q);
    });
  })();
  const tersediaQty = tersediaWos.reduce((sum, item) => sum + (item.wo?.jumlah || 0), 0);

  // Single-click handler: marks the current stage SELESAI (with both started_at
  // and completed_at) and advances the next stage to TERSEDIA in one shot.
  async function handleSelesai(progressRow: Row) {
    try {
      const now = new Date().toISOString();
      const startedAt = progressRow.started_at || now;
      await dbUpdate('wo_progress', progressRow.id, { status: 'SELESAI', started_at: startedAt, completed_at: now });

      // Auto-deduct stok ketika tahap "Fabric Cutting" diselesaikan
      const currentStage = stages.find((s: Row) => s.id === progressRow.stage_id);
      if (currentStage?.nama === 'Fabric Cutting') {
        try {
          const res = await fetch('/api/wo/deduct-stok', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wo_id: progressRow.work_order_id }),
          });
          const data = await res.json();
          if (!res.ok && data.error === 'Stok tidak cukup' && Array.isArray(data.insufficient)) {
            // Rollback progress status — stok tidak cukup, batalkan SELESAI
            await dbUpdate('wo_progress', progressRow.id, { status: 'TERSEDIA', completed_at: null });
            const detail = data.insufficient
              .map((i: { bahan: string; available: number; needed: number }) => `${i.bahan}: butuh ${i.needed}, tersedia ${i.available}`)
              .join(' • ');
            toast.error('Stok Tidak Cukup', `Tidak bisa selesaikan Fabric Cutting. ${detail}`);
            await fetchData();
            return;
          }
          if (data.success && data.deducted > 0) {
            toast.success('Stok Dipotong', `${data.deducted} item dipotong dari stok${data.skipped ? ` (${data.skipped} di-skip karena tidak ada di master barang)` : ''}.`);
          } else if (data.success && data.skipped > 0) {
            toast.warning('Stok Tidak Dipotong', `${data.skipped} item di-skip karena nama bahan tidak cocok dengan master barang.`);
          }
        } catch (e) { console.error('Deduct stok failed', e); }
      }

      const currentStageIdx = stages.findIndex((s: Row) => s.id === progressRow.stage_id);
      if (currentStageIdx < stages.length - 1) {
        const nextStage = stages[currentStageIdx + 1];
        const nextProgress = progress.find((p: Row) => p.work_order_id === progressRow.work_order_id && p.stage_id === nextStage.id);
        if (nextProgress) {
          await dbUpdate('wo_progress', nextProgress.id, { status: 'TERSEDIA' });
        }
        await dbUpdate('work_orders', progressRow.work_order_id, { current_stage_id: nextStage.id });
        toast.success('Selesai', `Dipindahkan ke ${nextStage.nama}.`);
      } else {
        await dbUpdate('work_orders', progressRow.work_order_id, { status: 'SELESAI' });
        toast.success('Selesai', 'Work Order telah selesai semua tahap.');
      }
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  // Super-admin-only: roll a WO back to the previous stage. Fixes accidental
  // "Selesai & Lanjut" clicks on work that wasn't actually finished. Reopens
  // the previous stage (TERSEDIA, timestamps cleared) and resets the current
  // stage to BELUM. Does not restore deducted stock — that's a physical action.
  async function handleKembalikan(progressRow: Row) {
    const idx = stages.findIndex((s: Row) => s.id === progressRow.stage_id);
    if (idx <= 0) { toast.error('Tidak Bisa', 'Sudah di tahap pertama, tidak ada tahap sebelumnya.'); return; }
    const prevStage = stages[idx - 1];
    const yes = await toast.confirm({
      title: 'Kembalikan ke Tahap Sebelumnya?',
      message: `WO ${progressRow.wo?.no_wo || ''} akan dikembalikan dari ${activeStage} ke ${prevStage.nama}.`,
      type: 'warning',
      confirmText: 'Ya, Kembalikan',
    });
    if (!yes) return;
    try {
      const prevProgress = progress.find((p: Row) => p.work_order_id === progressRow.work_order_id && p.stage_id === prevStage.id);
      if (prevProgress) {
        await dbUpdate('wo_progress', prevProgress.id, { status: 'TERSEDIA', completed_at: null });
      }
      await dbUpdate('wo_progress', progressRow.id, { status: 'BELUM', started_at: null, completed_at: null });
      await dbUpdate('work_orders', progressRow.work_order_id, { current_stage_id: prevStage.id, status: 'PROSES_PRODUKSI' });
      toast.success('Dikembalikan', `WO dikembalikan ke ${prevStage.nama}.`);
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-12 bg-white/[0.03] rounded-lg animate-pulse" />
      {[1,2].map(i => <div key={i} className="h-32 bg-white/[0.03] rounded-xl animate-pulse" />)}
    </div>
  );

  function WoCard({ item, actions }: { item: Row; actions: React.ReactNode }) {
    const wo = item.wo;
    return (
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-blue-400 whitespace-nowrap">{wo.no_wo}</span>
            <span className="text-sm font-semibold text-white">{wo.customer_nama}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-xs">
            <span className="text-slate-300 font-medium">{wo.paket}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">{wo.jumlah} pcs</span>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4 shrink-0">
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Stage Tabs */}
      <div className="border-b border-white/[0.06] -mx-6 px-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {PROD_STAGES.map(stage => {
            const stageRow = stages.find((s: Row) => s.nama === stage);
            const stageId = stageRow?.id;
            const count = progress.filter((p: Row) => p.stage_id === stageId && (p.status === 'TERSEDIA' || p.status === 'SEDANG')).length;
            const hasAccess = stageId ? canManageStage(stageId) : false;
            return (
              <button key={stage} onClick={() => setActiveStage(stage)}
                className={`px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors relative ${
                  activeStage === stage
                    ? 'text-white border-blue-500'
                    : hasAccess
                      ? 'text-slate-500 border-transparent hover:text-slate-300'
                      : 'text-slate-600 border-transparent hover:text-slate-500'
                }`}>
                {stage}
                {!hasAccess && !isFullAccess && (
                  <svg className="inline-block w-3 h-3 ml-1 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                )}
                {count > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-400">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Read-only banner for non-permitted stages */}
      {!activeStageCanManage && !isFullAccess && (
        <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm text-amber-400">Mode hanya lihat — Anda tidak memiliki akses untuk mengelola tahap <strong>{activeStage}</strong>.</p>
        </div>
      )}

      <div className="space-y-4 pt-6">
        {/* Antrian Section (one-click finish + advance) */}
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 grid place-items-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Antrian {activeStage}</h2>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-xs text-slate-500">Total Qty: <strong className="text-white">{tersediaQty}</strong></span>
                  <span className="text-xs text-slate-500">
                    Jumlah WO: <strong className="text-white">{tersediaWos.length}</strong>
                    {search && tersediaWosRaw.length !== tersediaWos.length && (
                      <span className="text-slate-500"> / {tersediaWosRaw.length}</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
            {/* Per-stage search — filters by no_wo, customer, or paket */}
            <div className="relative w-full sm:w-72">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari WO, customer, paket..."
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm placeholder-slate-500 rounded-lg pl-9 pr-8 py-2 focus:outline-none focus:border-blue-500/40"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  title="Clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* List */}
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          {tersediaWos.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-slate-500">
                {search
                  ? `Tidak ada perintah kerja yang cocok dengan "${search}".`
                  : 'Tidak ada perintah kerja yang tersedia untuk tahap ini.'}
              </p>
            </div>
          ) : (
            tersediaWos.map(item => (
              <WoCard key={item.id} item={item} actions={
                activeStageCanManage || isFullAccess ? (
                  <>
                    {user?.username === ROLLBACK_EMAIL && stages.findIndex((s: Row) => s.id === item.stage_id) > 0 && (
                      <button onClick={() => handleKembalikan(item)}
                        className="text-xs font-medium text-amber-400 border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors flex items-center gap-1.5"
                        title="Kembalikan ke tahap sebelumnya">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                        Kembalikan
                      </button>
                    )}
                    <button onClick={() => handleSelesai(item)}
                      className="text-xs font-medium text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 rounded-lg hover:bg-emerald-500/20 transition-colors">
                      Selesai & Lanjut
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-slate-600 italic">Read only</span>
                )
              } />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
