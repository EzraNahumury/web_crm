'use client';
import { useState } from 'react';

const PROD_STAGES = [
  'Proofing', 'Printing Layout', 'Approval Layout', 'Printing Process',
  'Sublim Press', 'QC Panel Process', 'Fabric Cutting', 'QC Cutting',
  'Sewing', 'QC Jersey', 'Finishing', 'Shipment',
];

export default function ProduksiPage() {
  const [activeStage, setActiveStage] = useState(PROD_STAGES[0]);

  return (
    <div className="space-y-0">
      {/* Stage Tabs */}
      <div className="border-b border-white/[0.06] -mx-6 px-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {PROD_STAGES.map(stage => (
            <button key={stage} onClick={() => setActiveStage(stage)}
              className={`px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeStage === stage
                  ? 'text-white border-blue-500'
                  : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}>
              {stage}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 pt-6">
        {/* Tersedia Section */}
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-slate-700/50 grid place-items-center">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Tersedia untuk {activeStage}</h2>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-xs text-slate-500">Total Qty</span>
                <span className="text-xs text-slate-500 -ml-2 mr-2">|</span>
                <span className="text-xs text-slate-500">Jumlah WO</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 mt-2 ml-12">
            <span className="text-2xl font-bold text-white">0</span>
            <div className="w-px h-6 bg-white/10" />
            <span className="text-2xl font-bold text-white">0</span>
          </div>
        </div>

        {/* Tersedia List */}
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.06]">
            <h3 className="text-base font-bold text-white">Tersedia untuk {activeStage}</h3>
          </div>
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-slate-500">Tidak ada perintah kerja yang tersedia untuk tahap ini.</p>
          </div>
        </div>

        {/* Sedang Section */}
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-slate-700/50 grid place-items-center">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Sedang {activeStage}</h2>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-xs text-slate-500">Total Qty</span>
                <span className="text-xs text-slate-500 -ml-2 mr-2">|</span>
                <span className="text-xs text-slate-500">Jumlah WO</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 mt-2 ml-12">
            <span className="text-2xl font-bold text-white">0</span>
            <div className="w-px h-6 bg-white/10" />
            <span className="text-2xl font-bold text-white">0</span>
          </div>
        </div>

        {/* Sedang List */}
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.06]">
            <h3 className="text-base font-bold text-white">Sedang {activeStage}</h3>
          </div>
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-slate-500">Tidak ada perintah kerja yang sedang diproses di tahap ini.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
