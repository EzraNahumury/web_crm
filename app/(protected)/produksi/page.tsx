'use client';
import { useState, useEffect, useCallback } from 'react';
import { dbGet, dbUpdate, dbCreate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const PROD_STAGES = [
  'Proofing', 'Printing Layout', 'Approval Layout', 'Printing Process',
  'Sublim Press', 'QC Panel Process', 'Fabric Cutting', 'QC Cutting',
  'Sewing', 'QC Jersey', 'Finishing', 'Shipment',
];

export default function ProduksiPage() {
  const [activeStage, setActiveStage] = useState(PROD_STAGES[0]);
  const [stages, setStages] = useState<Row[]>([]);
  const [progress, setProgress] = useState<Row[]>([]);
  const [wos, setWos] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

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
          // Re-fetch progress after creating
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

  // Get WOs for current stage filtered by status
  const tersediaItems = progress.filter((p: Row) => p.stage_id === activeStageId && p.status === 'TERSEDIA');
  const sedangItems = progress.filter((p: Row) => p.stage_id === activeStageId && p.status === 'SEDANG');

  // Merge with WO data
  function getWoForProgress(items: Row[]): Row[] {
    return items.map((p: Row) => {
      const wo = wos.find((w: Row) => w.id === p.work_order_id);
      return { ...p, wo };
    }).filter(item => item.wo);
  }

  const tersediaWos = getWoForProgress(tersediaItems);
  const sedangWos = getWoForProgress(sedangItems);
  const tersediaQty = tersediaWos.reduce((sum, item) => sum + (item.wo?.jumlah || 0), 0);
  const sedangQty = sedangWos.reduce((sum, item) => sum + (item.wo?.jumlah || 0), 0);

  // Move WO to next status or next stage
  async function handleMulai(progressId: number) {
    try {
      await dbUpdate('wo_progress', progressId, { status: 'SEDANG', started_at: new Date().toISOString() });
      toast.success('Dimulai', 'WO dipindahkan ke Sedang.');
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  async function handleSelesai(progressRow: Row) {
    try {
      // Mark current stage as SELESAI
      await dbUpdate('wo_progress', progressRow.id, { status: 'SELESAI', completed_at: new Date().toISOString() });

      // Find next stage
      const currentStageIdx = stages.findIndex((s: Row) => s.id === progressRow.stage_id);
      if (currentStageIdx < stages.length - 1) {
        const nextStage = stages[currentStageIdx + 1];
        // Set next stage to TERSEDIA
        const nextProgress = progress.find((p: Row) => p.work_order_id === progressRow.work_order_id && p.stage_id === nextStage.id);
        if (nextProgress) {
          await dbUpdate('wo_progress', nextProgress.id, { status: 'TERSEDIA' });
        }
        // Update WO current_stage_id
        await dbUpdate('work_orders', progressRow.work_order_id, { current_stage_id: nextStage.id });
        toast.success('Selesai', `Dipindahkan ke ${nextStage.nama}.`);
      } else {
        // Last stage - mark WO as SELESAI
        await dbUpdate('work_orders', progressRow.work_order_id, { status: 'SELESAI' });
        toast.success('Selesai', 'Work Order telah selesai semua tahap.');
      }
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
        <div className="flex items-center gap-4">
          <div>
            <span className="text-sm font-medium text-blue-400">{wo.no_wo}</span>
            <p className="text-xs text-slate-500 mt-0.5">{wo.customer_nama}</p>
          </div>
          <div className="text-xs text-slate-500">
            <span className="text-slate-400">{wo.paket}</span>
            <span className="mx-2">|</span>
            <span>{wo.jumlah} pcs</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            const count = progress.filter((p: Row) => p.stage_id === stageRow?.id && (p.status === 'TERSEDIA' || p.status === 'SEDANG')).length;
            return (
              <button key={stage} onClick={() => setActiveStage(stage)}
                className={`px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors relative ${
                  activeStage === stage ? 'text-white border-blue-500' : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}>
                {stage}
                {count > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-400">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 pt-6">
        {/* Tersedia Section */}
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 grid place-items-center">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Tersedia untuk {activeStage}</h2>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-xs text-slate-500">Total Qty: <strong className="text-white">{tersediaQty}</strong></span>
                <span className="text-xs text-slate-500">Jumlah WO: <strong className="text-white">{tersediaWos.length}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Tersedia List */}
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          {tersediaWos.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-slate-500">Tidak ada perintah kerja yang tersedia untuk tahap ini.</p>
            </div>
          ) : (
            tersediaWos.map(item => (
              <WoCard key={item.id} item={item} actions={
                <button onClick={() => handleMulai(item.id)}
                  className="text-xs font-medium text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 rounded-lg hover:bg-emerald-500/20 transition-colors">
                  Mulai {activeStage}
                </button>
              } />
            ))
          )}
        </div>

        {/* Sedang Section */}
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 grid place-items-center">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644V14.652" /></svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Sedang {activeStage}</h2>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-xs text-slate-500">Total Qty: <strong className="text-white">{sedangQty}</strong></span>
                <span className="text-xs text-slate-500">Jumlah WO: <strong className="text-white">{sedangWos.length}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Sedang List */}
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          {sedangWos.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-slate-500">Tidak ada perintah kerja yang sedang diproses di tahap ini.</p>
            </div>
          ) : (
            sedangWos.map(item => (
              <WoCard key={item.id} item={item} actions={
                <button onClick={() => handleSelesai(item)}
                  className="text-xs font-medium text-blue-400 border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 rounded-lg hover:bg-blue-500/20 transition-colors">
                  Selesai & Lanjut
                </button>
              } />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
