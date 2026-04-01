'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

/* ═══ Mock Data ═══ */
const PROD_STAGES = [
  'Proofing','Layout Printing','Approval Layout','Proses Printing','Sublim Press',
  'QC Panel','Potong Kain','QC Cutting','Jahit','QC Jersey','Finishing','Pengiriman',
];

const MOCK_WO = {
  noWo: 'WO001', customer: 'M. Farikh Khaqiqi', status: 'Proses Produksi',
  noOrder: 'ORD001', tglOrder: '10/03/2026', paket: 'PRO A', bahan: 'JAGUARD TOPO',
  upProduksi: '12/03/2026', deadline: '09/04/2026', currentStage: 1,
  keterangan: 'Bahan utama embos topo Bahan kombinasi pecah pola bahu jala airbin LOGO PRINTING',
};

const MOCK_GUDANG = [
  { bagian: 'BADAN DEPAN', bahan: 'BRICK', warna: '', qty: 0 },
  { bagian: 'BADAN BELAKANG', bahan: 'BRICK', warna: '', qty: 0 },
  { bagian: 'LENGAN', bahan: 'BRICK', warna: '', qty: 0 },
  { bagian: 'KERAH', bahan: 'KAIN RIB SUBLIM', warna: '', qty: 0 },
];
const MOCK_AKSESORIS = [
  { bagian: 'Tagline', bahan: 'Ayres', warna: '', qty: 0 },
  { bagian: 'Keaslian', bahan: 'Ayress woven', warna: '', qty: 0 },
  { bagian: 'Info Ukuran', bahan: 'Ayres', warna: '', qty: 0 },
  { bagian: 'Info Logo', bahan: 'PRINT', warna: '', qty: 0 },
  { bagian: 'Info Packing', bahan: 'Ayres', warna: '', qty: 0 },
  { bagian: 'Font & Nomor', bahan: 'ARIAL', warna: '', qty: 0 },
];

const MOCK_PLAYERS = [
  { nama:'A.KAUSAR', np:'NP', size:'XL', ket:'-' },
  { nama:'AGR', np:'NP', size:'XL', ket:'-' },
  { nama:'AMHA', np:'NP', size:'3XL', ket:'L. PANJANG BRAZIL' },
  { nama:'EQ', np:'NP', size:'2XL', ket:'-' },
  { nama:'EWANG KITE', np:'NP', size:'M', ket:'-' },
  { nama:'JAMS', np:'NP', size:'L', ket:'-' },
  { nama:'KAKA', np:'NP', size:'XL', ket:'SIZE OVERSIZE - (CELANA 2XL)' },
  { nama:'LUPITO', np:'NP', size:'L', ket:'L. PANJANG BRAZIL' },
  { nama:'MONI S', np:'NP', size:'XL', ket:'-' },
  { nama:'MONTY', np:'NP', size:'2XL', ket:'-' },
  { nama:'OCKTHARA', np:'NP', size:'2XL', ket:'-' },
  { nama:'RAMBARA', np:'NP', size:'L', ket:'-' },
  { nama:'RICKY', np:'NP', size:'M', ket:'-' },
  { nama:'RPS', np:'NP', size:'XL', ket:'-' },
  { nama:'RVH', np:'NP', size:'L', ket:'-' },
  { nama:'RZR', np:'NP', size:'L', ket:'-' },
  { nama:'SAE', np:'NP', size:'L', ket:'L. PANJANG BRAZIL' },
  { nama:'SGL', np:'NP', size:'XL', ket:'L. PANJANG BRAZIL' },
  { nama:'THOMAS', np:'NP', size:'L', ket:'-' },
];

type Tab = 'detail'|'wo1'|'wo2'|'wo3'|'wo4';

export default function WorkOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [tab, setTab] = useState<Tab>('detail');
  const wo = MOCK_WO;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'detail', label: 'Detail' },
    { key: 'wo1', label: 'WO 1' },
    { key: 'wo2', label: 'WO 2' },
    { key: 'wo3', label: 'WO 3' },
    { key: 'wo4', label: 'WO 4' },
  ];

  return (
    <div className="space-y-0 -mt-2">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push('/work-orders')} className="mt-2 text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">WO {wo.noWo}</h1>
            <p className="text-sm text-slate-400">{wo.customer}</p>
          </div>
        </div>
        <span className="text-xs font-medium text-blue-400 border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 rounded-full">{wo.status}</span>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/[0.06] mb-6">
        <div className="flex gap-0">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'text-white border-blue-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {tab === 'detail' && <TabDetail wo={wo} />}
      {tab === 'wo1' && <TabWO1 wo={wo} />}
      {tab === 'wo2' && <TabWO2 wo={wo} />}
      {tab === 'wo3' && <TabWO3 wo={wo} />}
      {tab === 'wo4' && <TabWO4 wo={wo} />}
    </div>
  );
}

/* ═══ Tab Detail ═══ */
function TabDetail({ wo }: { wo: typeof MOCK_WO }) {
  const pct = Math.round(((wo.currentStage + 1) / PROD_STAGES.length) * 100);
  return (
    <div className="space-y-6">
      {/* Info Grid */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {[
            { label: 'NO ORDER', value: wo.noOrder },
            { label: 'TANGGAL ORDER', value: wo.tglOrder },
            { label: 'CUSTOMER', value: wo.customer },
            { label: 'PAKET', value: wo.paket },
            { label: 'BAHAN', value: wo.bahan },
          ].map(f => (
            <div key={f.label}>
              <p className="text-[11px] text-blue-400 font-medium uppercase tracking-wider mb-1">{f.label}</p>
              <p className="text-sm font-medium text-white">{f.value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          <div>
            <p className="text-[11px] text-blue-400 font-medium uppercase tracking-wider mb-1">UP PRODUKSI</p>
            <p className="text-sm font-medium text-white">{wo.upProduksi}</p>
          </div>
          <div>
            <p className="text-[11px] text-blue-400 font-medium uppercase tracking-wider mb-1">DEADLINE</p>
            <p className="text-sm font-medium text-white">{wo.deadline}</p>
          </div>
        </div>
        <div className="border-t border-white/[0.06] pt-4">
          <p className="text-[11px] text-blue-400 font-medium uppercase tracking-wider mb-1">KETERANGAN</p>
          <p className="text-sm text-slate-300">{wo.keterangan}</p>
        </div>
      </div>

      {/* Progres Produksi */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-6">
        <h2 className="text-base font-bold text-white mb-4">Progres Produksi</h2>
        {/* Progress bar */}
        <div className="w-full h-1.5 bg-slate-700 rounded-full mb-6 overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        {/* Stage circles */}
        <div className="flex items-start justify-between overflow-x-auto pb-2 gap-1">
          {PROD_STAGES.map((stage, i) => {
            const done = i < wo.currentStage;
            const current = i === wo.currentStage;
            return (
              <div key={stage} className="flex flex-col items-center min-w-[70px] shrink-0">
                <div className={`w-7 h-7 rounded-full grid place-items-center mb-2 ${done ? 'bg-emerald-500' : current ? 'bg-white ring-2 ring-blue-500' : 'bg-slate-700'}`}>
                  {done ? (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  ) : current ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  ) : null}
                </div>
                <span className={`text-[10px] text-center leading-tight ${current ? 'text-blue-400 font-medium' : done ? 'text-emerald-400' : 'text-slate-500'}`}>{stage}</span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 text-right mt-3">Stage {wo.currentStage + 1} of {PROD_STAGES.length}: {PROD_STAGES[wo.currentStage]}</p>
      </div>
    </div>
  );
}

/* ═══ Tab WO 1 — Lembar Spesifikasi ═══ */
function TabWO1({ wo }: { wo: typeof MOCK_WO }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [bahanRows, setBahanRows] = useState([{ id: 1, bagian: 'FRONT BODY', bahan: '' }]);
  const iCls = 'w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/40 transition-colors';
  const sCls = `${iCls} appearance-none cursor-pointer`;
  const lCls = 'block text-sm font-medium text-white mb-1.5';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Lembar Spesifikasi</h2>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 border border-white/10 hover:bg-white/[0.04] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Buat Lembar Spesifikasi Baru
        </button>
      </div>

      {/* ── Create Drawer ── */}
      {createOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setCreateOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] bg-[#0c1120] border-l border-white/[0.06] shadow-2xl flex flex-col animate-slide-in-right">
            <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-white">Buat Lembar Spesifikasi</h2>
              <button onClick={() => setCreateOpen(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Informasi Dasar */}
              <div>
                <h3 className="text-sm font-bold text-white mb-4">Informasi Dasar</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lCls}>Nama Spesifikasi</label><input className={iCls} placeholder="mis. Jersey Home" defaultValue="Jersey Home" /></div>
                    <div><label className={lCls}>Nama Customer</label><input className={iCls} defaultValue={wo.customer} readOnly /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lCls}>Paket</label><input className={iCls} defaultValue={wo.paket} readOnly /></div>
                    <div><label className={lCls}>Jumlah</label><input type="number" className={iCls} defaultValue={10} readOnly /></div>
                  </div>
                  <div><label className={lCls}>Deadline</label><input className={iCls} defaultValue={wo.deadline} readOnly /></div>
                </div>
              </div>

              {/* Gambar */}
              <div className="border-t border-white/[0.06] pt-5">
                <h3 className="text-sm font-bold text-white mb-4">Gambar</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-2">Dokumen Desain & Pola</p>
                    <div className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center hover:border-blue-500/30 transition-colors cursor-pointer">
                      <svg className="w-7 h-7 text-slate-500 mx-auto mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                      <p className="text-sm font-medium text-white">Upload Dokumen Desain & Pola</p>
                      <p className="text-xs text-slate-500 mt-1">Accepted types: image/*</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-2">Dokumen Pattern / Pecah Pola</p>
                    <div className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center hover:border-blue-500/30 transition-colors cursor-pointer">
                      <svg className="w-7 h-7 text-slate-500 mx-auto mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                      <p className="text-sm font-medium text-white">Upload Dokumen Pattern</p>
                      <p className="text-xs text-slate-500 mt-1">Accepted types: image/*</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Aksesoris & Detail */}
              <div className="border-t border-white/[0.06] pt-5">
                <h3 className="text-sm font-bold text-white mb-4">Aksesoris & Detail</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lCls}>Tagline</label><select className={sCls}><option>Pilih...</option><option>Ayres</option></select></div>
                    <div><label className={lCls}>Authentic</label><select className={sCls}><option>Pilih...</option><option>Ayress woven</option></select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lCls}>Info Ukuran</label><select className={sCls}><option>Pilih...</option><option>Ayres</option></select></div>
                    <div><label className={lCls}>Info Logo</label><input className={iCls} placeholder="PRINT" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lCls}>Info Packing</label><select className={sCls}><option>Pilih...</option><option>Ayres</option></select></div>
                    <div><label className={lCls}>Webbing</label><select className={sCls}><option>Pilih...</option></select></div>
                  </div>
                  <div><label className={lCls}>Font & Nomor</label><input className={iCls} placeholder="ARIAL" /></div>
                  <div><label className={lCls}>Keterangan</label><textarea rows={3} className={`${iCls} resize-none`} /></div>
                  <div><label className={lCls}>Keterangan Jahit</label><textarea rows={3} className={`${iCls} resize-none`} /></div>
                </div>
              </div>

              {/* Detail Bahan */}
              <div className="border-t border-white/[0.06] pt-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white">Detail Bahan</h3>
                  <button onClick={() => setBahanRows(prev => [...prev, { id: Date.now(), bagian: '', bahan: '' }])}
                    className="text-xs text-blue-400 border border-blue-500/20 px-3 py-1 rounded-lg hover:bg-blue-500/10 transition-colors">+ Tambah Baris Bahan</button>
                </div>
                <div className="space-y-2">
                  {bahanRows.map(r => (
                    <div key={r.id} className="grid grid-cols-2 gap-2">
                      <input className={iCls} placeholder="Nama bagian" defaultValue={r.bagian} />
                      <input className={iCls} placeholder="Pilih atau ketik nama bahan" defaultValue={r.bahan} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Persetujuan */}
              <div className="border-t border-white/[0.06] pt-5">
                <h3 className="text-sm font-bold text-white mb-3">Persetujuan</h3>
                <label className={lCls}>Data Persetujuan Admin</label>
                <input className={iCls} />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-3 shrink-0">
              <button onClick={() => setCreateOpen(false)} className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
              <button onClick={() => setCreateOpen(false)} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">Buat Lembar Spesifikasi</button>
            </div>
          </div>
        </>
      )}

      {/* Player tab */}
      <div className="border-b border-white/[0.06]">
        <button className="px-4 py-3 text-sm font-medium text-white border-b-2 border-blue-500">PLAYER</button>
      </div>

      {/* Spec card */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-3 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.02]">
          <span className="text-xs text-slate-500">ID: 18 &nbsp; Diperbarui: 3/12/2026</span>
          <div className="flex items-center gap-2">
            {['Download PDF','Cetak','Edit'].map(a => (
              <button key={a} className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">{a}</button>
            ))}
            <button className="flex items-center gap-1.5 text-xs text-red-400 border border-red-500/20 bg-red-500/10 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors">Hapus</button>
          </div>
        </div>

        {/* Spec document preview */}
        <div className="p-6">
          <div className="bg-white rounded-lg p-6 text-black max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b-2 border-black pb-3 mb-4">
              <div className="flex items-center gap-3">
                <img src="/logo/new logo.png" alt="AYRES" className="h-8" style={{ filter: 'brightness(0)' }} />
                <h3 className="text-xl font-bold">AYRES APPAREL</h3>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">WORK ORDER NO.</p>
                <p className="text-base font-bold border border-black px-3 py-1 rounded">{wo.noWo}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {/* Left: Mock up area */}
              <div className="col-span-2">
                <div className="bg-blue-900 text-white text-center text-xs font-bold py-1 mb-2">DESAIN MOCK UP & PATTERN</div>
                <div className="h-48 bg-slate-100 rounded grid place-items-center text-slate-400 text-sm border border-slate-200">
                  Preview Desain Jersey
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="border border-black rounded p-2">
                    <p className="text-[10px] font-bold text-red-600 bg-red-50 px-1">KETERANGAN JAHIT</p>
                    <p className="text-xs mt-1">-</p>
                  </div>
                  <div className="border border-black rounded p-2">
                    <p className="text-[10px] font-bold text-center bg-blue-900 text-white px-1">FONT & NUMBER</p>
                    <p className="text-xs mt-1">ARIAL</p>
                  </div>
                </div>
                <div className="mt-2 bg-green-100 text-black text-xs font-bold px-2 py-1 inline-block border border-black">
                  DEADLINE : 09 April 2026
                </div>
              </div>

              {/* Right: Info */}
              <div className="space-y-2 text-xs">
                <div className="border border-black overflow-hidden">
                  {[['NAMA', wo.customer, false],['PAKET', wo.paket, true],['JUMLAH', '10 PCS', true]].map(([k,v,red]) => (
                    <div key={k as string} className="grid grid-cols-2 border-b border-black last:border-0">
                      <span className="font-bold px-2 py-1 border-r border-black">{k}</span>
                      <span className={`px-2 py-1 ${red ? 'text-red-600' : ''}`}>{v}</span>
                    </div>
                  ))}
                </div>
                <div className="border border-black overflow-hidden">
                  <p className="text-center font-bold bg-black text-white py-1 border-b border-black">Accessories</p>
                  {[['TAGLINE','Ayres'],['AUTHENTIC','Ayress woven'],['SIZE','Ayres'],['LOGO','PRINT'],['PACKING','Ayres']].map(([k,v]) => (
                    <div key={k} className="grid grid-cols-2 border-b border-black last:border-0">
                      <span className="font-bold px-2 py-0.5 border-r border-black">{k}</span>
                      <span className="px-2 py-0.5">{v}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-slate-500">WLWLEWLEWELWELWEL</p>
                <div className="border border-black overflow-hidden">
                  <p className="text-center font-bold bg-black text-white py-1 border-b border-black">PENANGGUNG JAWAB</p>
                  <div className="p-1.5 space-y-0">
                    {['Approval Design','Approval Pattern',...PROD_STAGES].map((s, i) => (
                      <p key={s} className="text-[10px] border-b border-black py-0.5 px-1 last:border-0"><span className="text-blue-600">{i + 1}. {s}</span></p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom section: Bahan + Approval + Export */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              {/* Detail Bahan */}
              <div className="border border-black overflow-hidden text-xs">
                {[['BADAN DEPAN','BRICK'],['BADAN BELAKANG','BRICK'],['LENGAN','BRICK'],['KERAH','KAIN RIB SUBLIM']].map(([bagian, bahan]) => (
                  <div key={bagian} className="grid grid-cols-2 border-b border-black last:border-0">
                    <span className="font-bold px-2 py-1 border-r border-black">{bagian}</span>
                    <span className="px-2 py-1 text-red-600 font-medium">{bahan}</span>
                  </div>
                ))}
              </div>
              {/* Approval Admin */}
              <div className="border border-black overflow-hidden text-xs">
                <p className="text-center font-bold bg-black text-white py-1 border-b border-black">APPROVAL ADMIN / DATA</p>
                <div className="p-2 h-16">
                  <span className="text-slate-400">-</span>
                </div>
              </div>
              {/* Export & ICC */}
              <div className="border border-black overflow-hidden text-xs">
                <p className="text-center font-bold bg-black text-white py-1 border-b border-black">EXPORT & ICC</p>
                <div className="p-2 h-16 flex items-center justify-center">
                  <span className="font-medium">JPEG-RGB 3 PASS</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ Tab WO 2 — Form Permintaan Gudang ═══ */
function TabWO2({ wo }: { wo: typeof MOCK_WO }) {
  const [extraAks, setExtraAks] = useState<{ id: number }[]>([]);
  const [extraMat, setExtraMat] = useState<{ id: number }[]>([{ id: 1 }]);
  const delIcon = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>;
  const totalFixed = MOCK_GUDANG.length + MOCK_AKSESORIS.length;

  return (
    <div className="space-y-5">
      {/* Title bar */}
      <div className="rounded-lg bg-amber-500/20 border border-amber-500/30 px-5 py-3 flex items-center justify-between">
        <span className="text-sm font-bold text-white">FORM PERMINTAAN GUDANG – CUST: {wo.customer.toUpperCase()}</span>
        <button className="flex items-center gap-1.5 text-xs text-slate-300 border border-white/10 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          Download PDF
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead><tr className="border-b border-white/[0.06]">
              {['NO','BAGIAN','BAHAN','WARNA','KUANTITAS','AKSI'].map(h => (
                <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {/* Bahan utama */}
              {MOCK_GUDANG.map((r, i) => (
                <tr key={i} className="border-b border-white/[0.04]">
                  <td className="px-5 py-3.5 text-sm text-blue-400">{i + 1}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-emerald-400">{r.bagian}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-white">{r.bahan}</td>
                  <td className="px-5 py-3.5 text-sm text-slate-500">Warna...</td>
                  <td className="px-5 py-3.5 text-sm text-slate-400">{r.qty}</td>
                  <td className="px-5 py-3.5" />
                </tr>
              ))}

              {/* Aksesoris separator */}
              <tr><td colSpan={6} className="px-5 py-3 text-center border-b border-white/[0.06]">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">AKSESORIS</span>
                <button onClick={() => setExtraAks(prev => [...prev, { id: Date.now() }])}
                  className="text-xs text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded hover:bg-blue-500/10 transition-colors">+ Tambah</button>
              </td></tr>

              {/* Aksesoris fixed */}
              {MOCK_AKSESORIS.map((r, i) => (
                <tr key={`a-${i}`} className="border-b border-white/[0.04]">
                  <td className="px-5 py-3.5 text-sm text-blue-400">{MOCK_GUDANG.length + i + 1}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-emerald-400">{r.bagian}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-white">{r.bahan}</td>
                  <td className="px-5 py-3.5 text-sm text-slate-500">Warna...</td>
                  <td className="px-5 py-3.5 text-sm text-slate-400">{r.qty}</td>
                  <td className="px-5 py-3.5" />
                </tr>
              ))}

              {/* Aksesoris tambahan (editable) */}
              {extraAks.map((row, i) => (
                <tr key={`ea-${row.id}`} className="border-b border-white/[0.04] bg-white/[0.01]">
                  <td className="px-5 py-2.5 text-sm text-blue-400 align-middle">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5" />
                    {totalFixed + i + 1}
                  </td>
                  <td className="px-5 py-2.5"><input type="text" placeholder="Nama bagian..." className="bg-transparent text-sm text-slate-400 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-2.5"><input type="text" placeholder="Nama bahan..." className="bg-transparent text-sm text-slate-400 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-2.5"><input type="text" placeholder="Warna..." className="bg-transparent text-sm text-slate-500 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-2.5"><input type="number" defaultValue={0} className="bg-transparent text-sm text-slate-400 focus:outline-none w-16" /></td>
                  <td className="px-5 py-2.5">
                    <button onClick={() => setExtraAks(prev => prev.filter(r => r.id !== row.id))} className="text-slate-600 hover:text-red-400 transition-colors">{delIcon}</button>
                  </td>
                </tr>
              ))}

              {/* Material Tambahan separator */}
              <tr><td colSpan={6} className="px-5 py-3 text-center border-b border-white/[0.06]">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">MATERIAL TAMBAHAN</span>
                <button onClick={() => setExtraMat(prev => [...prev, { id: Date.now() }])}
                  className="text-xs text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded hover:bg-blue-500/10 transition-colors">+ Tambah</button>
              </td></tr>

              {/* Material tambahan rows (editable) */}
              {extraMat.map((row, i) => (
                <tr key={`em-${row.id}`} className="border-b border-white/[0.04] bg-white/[0.01]">
                  <td className="px-5 py-2.5 text-sm text-blue-400 align-middle">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5" />
                    {totalFixed + extraAks.length + i + 1}
                  </td>
                  <td className="px-5 py-2.5"><input type="text" placeholder="Nama bagian..." className="bg-transparent text-sm text-slate-400 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-2.5"><input type="text" placeholder="Nama bahan..." className="bg-transparent text-sm text-slate-400 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-2.5"><input type="text" placeholder="Warna..." className="bg-transparent text-sm text-slate-500 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-2.5"><input type="number" defaultValue={0} className="bg-transparent text-sm text-slate-400 focus:outline-none w-16" /></td>
                  <td className="px-5 py-2.5">
                    <button onClick={() => setExtraMat(prev => prev.filter(r => r.id !== row.id))} className="text-slate-600 hover:text-red-400 transition-colors">{delIcon}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4">
          <button className="flex items-center gap-2 bg-blue-600/10 border border-blue-500/20 text-blue-400 text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-600/20 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══ Tab WO 3 — Detail Order Items ═══ */
function TabWO3({ wo }: { wo: typeof MOCK_WO }) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-400">Customer: <strong className="text-white">{wo.customer}</strong></span>
          <span className="text-slate-400">Team: <strong className="text-white">3TheReal</strong></span>
        </div>
        <div className="text-lg font-bold text-white">DETAIL ORDER ITEMS</div>
        <div className="flex items-center gap-2 flex-wrap">
          {['Template','Export Data','Import Excel','Download PDF'].map(a => (
            <button key={a} className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">{a}</button>
          ))}
          <button className="flex items-center gap-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
            Simpan Data
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead><tr className="border-b border-white/[0.06]">
              {['NO','NAMA','NP','SIZE','KET','BD','BB','LENGAN','KERAH','PENJAHIT',''].map(h => (
                <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-4 py-3 uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {MOCK_PLAYERS.map((p, i) => (
                <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-sm text-blue-400">{i + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium text-emerald-400">{p.nama}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{p.np}</td>
                  <td className="px-4 py-3 text-sm font-bold text-white">{p.size}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{p.ket === '-' ? <span className="text-slate-600">Keterangan</span> : p.ket}</td>
                  <td className="px-4 py-3 text-sm text-slate-600" />
                  <td className="px-4 py-3 text-sm text-slate-600" />
                  <td className="px-4 py-3 text-sm text-slate-600" />
                  <td className="px-4 py-3 text-sm text-slate-600" />
                  <td className="px-4 py-3 text-sm text-slate-500">Penjahit</td>
                  <td className="px-4 py-3">
                    <button className="text-slate-600 hover:text-red-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══ Tab WO 4 — Form Pengiriman ═══ */
function TabWO4({ wo }: { wo: typeof MOCK_WO }) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white">Form Pengiriman</h2>
          <p className="text-xs text-slate-500 mt-0.5">Lengkapi checklist dan bonus item sebelum mencetak form.</p>
        </div>
        <div className="flex items-center gap-2">
          {['Simpan Perubahan','Download PDF','Cetak Form'].map(a => (
            <button key={a} className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">{a}</button>
          ))}
        </div>
      </div>

      {/* Shipping form */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-4 text-center border-b border-white/[0.06]">
          <h3 className="text-base font-bold text-white">FORM PENGIRIMAN {wo.customer.toUpperCase()} ({wo.paket})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead><tr className="border-b border-white/[0.06]">
              {['NO','NAMA','NP','SIZE','KET','BONUS','CHECKLIST'].map(h => (
                <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-4 py-3 uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {MOCK_PLAYERS.map((p, i) => (
                <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-sm text-blue-400">{i + 1}</td>
                  <td className="px-4 py-2.5 text-sm text-emerald-400 font-medium">{p.nama}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-500">-</td>
                  <td className="px-4 py-2.5 text-sm font-bold text-white">{p.size}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-400">{p.ket === '-' ? '-' : p.ket}</td>
                  <td className="px-4 py-2.5">
                    <input type="text" placeholder="Bonus..." className="w-full bg-transparent text-sm text-slate-300 focus:outline-none placeholder-slate-600" />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input type="checkbox" className="w-4 h-4 rounded border-slate-600 bg-transparent text-blue-500 focus:ring-0 focus:ring-offset-0" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
