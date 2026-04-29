'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { useToast } from '@/lib/toast';
import { normBagian } from '@/lib/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const PROD_STAGES = [
  'Proofing','Layout Printing','Approval Layout','Proses Printing','Sublim Press',
  'QC Panel','Potong Kain','QC Cutting','Jahit','QC Jersey','Finishing','Pengiriman',
];

function compressImage(file: File, maxSize = 1600, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar yang valid'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context tidak tersedia'));
        ctx.drawImage(img, 0, 0, width, height);
        const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(mime, quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function fmtD(d: string) {
  if (!d) return '-';
  const m = String(d).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try { return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; }
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Pending', cls: 'text-slate-400 border-slate-500/30 bg-slate-500/10' },
  PROSES_PRODUKSI: { label: 'Proses Produksi', cls: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  SELESAI: { label: 'Selesai', cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  TERLAMBAT: { label: 'Terlambat', cls: 'text-red-400 border-red-500/30 bg-red-500/10' },
};

type Tab = 'detail'|'wo1'|'wo2'|'wo3'|'wo4';

export default function WorkOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [tab, setTab] = useState<Tab>('detail');
  const [wo, setWo] = useState<Row | null>(null);
  const [order, setOrder] = useState<Row | null>(null);
  const [gudangItems, setGudangItems] = useState<Row[]>([]);
  const [detailItems, setDetailItems] = useState<Row[]>([]);
  const [specs, setSpecs] = useState<Row[]>([]);
  const [specBahan, setSpecBahan] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const wos = await dbGet('work_orders');
        const found = wos.find((w: Row) => String(w.id) === String(params.id));
        if (found) {
          // Fetch related order + items for real-time paket/bahan
          const [orders, allItems] = await Promise.all([dbGet('orders'), dbGet('order_items')]);
          const ord = orders.find((o: Row) => String(o.id) === String(found.order_id)) || null;
          setOrder(ord);
          // Merge paket/bahan from order_items
          const oi = allItems.filter((i: Row) => String(i.order_id) === String(found.order_id));
          if (oi.length > 0) {
            found.paket = oi.map((i: Row) => String(i.paket_nama || '')).filter(Boolean).join(', ') || found.paket;
            found.bahan = oi.map((i: Row) => String(i.bahan_kain || '')).filter(Boolean).join(', ') || found.bahan;
          }
          setWo(found);
          // Fetch WO sub-data
          try {
            const g = await dbGet('wo_permintaan_gudang');
            setGudangItems(g.filter((r: Row) => String(r.work_order_id) === String(found.id)));
          } catch {}
          try {
            const d = await dbGet('wo_detail_items');
            setDetailItems(d.filter((r: Row) => String(r.work_order_id) === String(found.id)));
          } catch {}
          try {
            const s = await dbGet('wo_spesifikasi');
            setSpecs(s.filter((r: Row) => String(r.work_order_id) === String(found.id)));
          } catch {}
          try {
            const sb = await dbGet('wo_spesifikasi_bahan');
            setSpecBahan(sb);
          } catch {}
        }
      } catch {}
      setLoading(false);
    })();
  }, [params.id]);

  if (loading) return <div className="space-y-4">{[1,2].map(i => <div key={i} className="h-32 bg-white/[0.03] rounded-xl animate-pulse" />)}</div>;
  if (!wo) return (
    <div className="text-center py-20">
      <p className="text-slate-500">Work Order tidak ditemukan</p>
      <button onClick={() => router.push('/work-orders')} className="mt-4 text-blue-400 text-sm">Kembali</button>
    </div>
  );

  const st = STATUS_MAP[wo.status] || STATUS_MAP.PENDING;

  // Build a compat object for tabs
  const woData = {
    noWo: wo.no_wo,
    customer: wo.customer_nama,
    status: st.label,
    noOrder: order?.no_order || '-',
    tglOrder: fmtD(order?.tanggal_order || wo.created_at),
    paket: wo.paket || '-',
    bahan: wo.bahan || '-',
    jumlah: wo.jumlah || 0,
    upProduksi: fmtD(wo.up_produksi || order?.tanggal_order || wo.created_at),
    deadline: fmtD(order?.estimasi_deadline || wo.deadline),
    currentStage: 0,
    keterangan: wo.keterangan || order?.keterangan || '-',
    id: wo.id,
    order_id: wo.order_id,
    deadlineRaw: order?.estimasi_deadline || wo.deadline,
  };

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
            <h1 className="text-2xl font-bold text-white">WO {wo.no_wo}</h1>
            <p className="text-sm text-slate-400">{wo.customer_nama}</p>
          </div>
        </div>
        <span className={`text-xs font-medium border px-3 py-1.5 rounded-full ${st.cls}`}>{st.label}</span>
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
      {tab === 'detail' && <TabDetail wo={woData} />}
      {tab === 'wo1' && <TabWO1 wo={woData} specs={specs} specBahan={specBahan} />}
      {tab === 'wo2' && <TabWO2 wo={woData} gudangItems={gudangItems} specs={specs} specBahan={specBahan} />}
      {tab === 'wo3' && <TabWO3 wo={woData} detailItems={detailItems} specs={specs} specBahan={specBahan} />}
      {tab === 'wo4' && <TabWO4 wo={woData} detailItems={detailItems} />}
    </div>
  );
}

/* ═══ Tab Detail ═══ */
function TabDetail({ wo }: { wo: Row }) {
  const pct = Math.round(((wo.currentStage + 1) / PROD_STAGES.length) * 100);
  const [detailBahan, setDetailBahan] = useState<Row[]>([]);
  useEffect(() => {
    if (wo.order_id) {
      dbGet('order_detail_bahan').then(all => {
        setDetailBahan(all.filter((d: Row) => String(d.order_id) === String(wo.order_id)));
      }).catch(() => {});
    }
  }, [wo.order_id]);

  return (
    <div className="space-y-6">
      {/* Info Grid */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: 'NO ORDER', value: wo.noOrder },
            { label: 'TANGGAL ORDER', value: wo.tglOrder },
            { label: 'CUSTOMER', value: wo.customer },
            { label: 'PAKET', value: wo.paket },
          ].map(f => (
            <div key={f.label}>
              <p className="text-[11px] text-blue-400 font-medium uppercase tracking-wider mb-1">{f.label}</p>
              <p className="text-sm font-medium text-white">{f.value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-[11px] text-blue-400 font-medium uppercase tracking-wider mb-1">UP PRODUKSI</p>
            <p className="text-sm font-medium text-white">{wo.upProduksi}</p>
          </div>
          <div>
            <p className="text-[11px] text-blue-400 font-medium uppercase tracking-wider mb-1">DEADLINE</p>
            <p className="text-sm font-medium text-white">{wo.deadline}</p>
          </div>
        </div>

        {/* Bahan */}
        {detailBahan.length > 0 && (
          <div className="border-t border-white/[0.06] pt-4">
            <p className="text-[11px] text-blue-400 font-medium uppercase tracking-wider mb-3">BAHAN</p>
            <div className="rounded-lg border border-white/[0.06] overflow-hidden">
              {detailBahan.map((d, idx) => (
                <div key={d.id} className={`flex items-center ${idx !== 0 ? 'border-t border-white/[0.06]' : ''}`}>
                  <span className="text-xs font-medium text-slate-400 w-[140px] shrink-0 px-3 py-2 bg-white/[0.02]">{normBagian(d.bagian)}</span>
                  <span className="flex-1 text-sm text-white px-3 py-2 border-l border-white/[0.06]">{d.bahan}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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
function TabWO1({ wo, specs: initialSpecs, specBahan: initialSpecBahan }: { wo: Row; specs: Row[]; specBahan: Row[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [specs, setSpecs] = useState(initialSpecs);
  const [allSpecBahan, setAllSpecBahan] = useState(initialSpecBahan);
  const [selectedSpecId, setSelectedSpecId] = useState<number | null>(initialSpecs.length > 0 ? initialSpecs[0].id : null);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSpec, setEditSpec] = useState<Row | null>(null);
  const [freshWo, setFreshWo] = useState<Row>(wo);
  const printRef = useRef<Record<number, HTMLDivElement | null>>({});
  const toast = useToast();

  async function refreshSpecs() {
    const allSpecs = await dbGet('wo_spesifikasi');
    const filtered = allSpecs.filter((s: Row) => String(s.work_order_id) === String(wo.id));
    setSpecs(filtered);
    const sb = await dbGet('wo_spesifikasi_bahan');
    setAllSpecBahan(sb);
    // Update selectedSpecId if current selection no longer exists
    if (filtered.length > 0) {
      const ids = filtered.map((s: Row) => s.id);
      setSelectedSpecId(prev => (prev && ids.includes(prev) ? prev : filtered[0].id) as number | null);
    } else {
      setSelectedSpecId(null);
    }
  }

  // Fetch fresh data from DB on mount
  useEffect(() => { refreshSpecs(); }, []);

  async function handleDeleteSpec(spec: Row) {
    const yes = await toast.confirm({ title: 'Hapus Lembar Spesifikasi?', message: `"${spec.nama_spesifikasi}" akan dihapus permanen.`, type: 'danger', confirmText: 'Ya, Hapus' });
    if (!yes) return;
    try {
      await dbDelete('wo_spesifikasi', spec.id);
      await refreshSpecs();
      if (selectedSpecId === spec.id) {
        const remaining = specs.filter((s: Row) => s.id !== spec.id);
        setSelectedSpecId(remaining.length > 0 ? remaining[0].id : null);
      }
      toast.deleted('Dihapus', `${spec.nama_spesifikasi} berhasil dihapus.`);
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  function buildSpecHtml(spec: Row) {
    const bRows = allSpecBahan.filter((b: Row) => String(b.spesifikasi_id) === String(spec.id));
    const stages = ['Approval Design','Approval Pattern',...PROD_STAGES];
    const acc = [['TAGLINE',spec.tagline],['AUTHENTIC',spec.authentic],['SIZE',spec.info_ukuran],['LOGO',spec.info_logo],['PACKING',spec.info_packing],['WEBBING',spec.webbing]];
    const PRIMARY = '#0f172a';
    const ACCENT = '#dc2626';
    const BORDER = '#cbd5e1';
    const SOFT = '#f8fafc';
    const ROW_H = 30;

    const desainImg = spec.dokumen_desain ? `<img src="${spec.dokumen_desain}" style="width:100%;height:100%;object-fit:cover;display:block"/>` : `<div style="width:100%;height:100%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:14px">Desain</div>`;
    const patternImg = spec.dokumen_pattern ? `<img src="${spec.dokumen_pattern}" style="width:100%;height:100%;object-fit:cover;display:block"/>` : `<div style="width:100%;height:100%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:14px">Pattern</div>`;

    // Cell helpers — flexbox vertical-center inside fixed-height div inside td (padding:0 on td)
    const td = `border:1px solid ${BORDER};padding:0;height:${ROW_H}px;`;
    const flexL = `display:flex;align-items:center;height:${ROW_H}px;padding:0 12px;line-height:1.2;`;
    const flexC = `display:flex;align-items:center;justify-content:center;height:${ROW_H}px;padding:0 12px;line-height:1.2;`;
    const HDR = (txt: string, extraTd = '') => `<td style="${td}background:${PRIMARY};${extraTd}"><div style="${flexC}color:#fff;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase">${txt}</div></td>`;
    const LBL = (txt: string, extraTd = '') => `<td style="${td}background:${SOFT};${extraTd}"><div style="${flexL}color:${PRIMARY};font-size:11px;font-weight:700">${txt}</div></td>`;
    const VAL = (txt: string, extraTd = '', innerExtra = '') => `<td style="${td}${extraTd}"><div style="${flexL}color:${PRIMARY};font-size:11px;${innerExtra}">${txt}</div></td>`;
    const VALc = (txt: string, extraTd = '', innerExtra = '') => `<td style="${td}${extraTd}"><div style="${flexC}color:${PRIMARY};font-size:11px;${innerExtra}">${txt}</div></td>`;

    return `<div style="background:#fff;padding:30px 36px;font-family:Arial,Helvetica,sans-serif;color:${PRIMARY};width:1400px;-webkit-font-smoothing:antialiased">
<!-- HEADER -->
<table style="width:100%;border-collapse:collapse;margin-bottom:20px"><tr>
  <td style="vertical-align:bottom">
    <div style="display:flex;align-items:center;gap:12px">
      <img src="${location.origin}/logo/new logo.png" style="height:34px" onerror="this.style.display='none'"/>
      <span style="font-size:26px;font-weight:800;color:${PRIMARY};letter-spacing:-0.3px">AYRES APPAREL</span>
    </div>
    <div style="height:3px;background:${PRIMARY};margin-top:12px"></div>
  </td>
  <td style="vertical-align:bottom;text-align:right;width:230px">
    <div style="font-size:9px;color:#64748b;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px">Work Order No.</div>
    <div style="font-size:20px;font-weight:800;color:${PRIMARY};border:2.5px solid ${PRIMARY};padding:14px 32px;display:inline-block;line-height:1">${wo.noWo}</div>
  </td>
</tr></table>

<!-- MAIN 2-COL -->
<table style="width:100%;border-collapse:separate;border-spacing:14px 0"><tr>

  <!-- LEFT 60% -->
  <td style="width:60%;vertical-align:top;padding:0">
    <div style="background:${PRIMARY};height:${ROW_H}px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Desain Mock Up &amp; Pattern</div>
    <div style="display:flex;gap:10px;height:520px;margin-top:8px">
      <div style="flex:1;border:1px solid ${BORDER};overflow:hidden">${desainImg}</div>
      <div style="flex:1;border:1px solid ${BORDER};overflow:hidden">${patternImg}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:10px">
      <tr>${HDR('Nama Customer', 'width:50%')}${HDR('Nama Spesifikasi')}</tr>
      <tr>${VALc(wo.customer, '', `color:${ACCENT};font-weight:700;font-size:12px`)}${VALc(spec.nama_spesifikasi, '', `color:${ACCENT};font-weight:700;font-size:12px`)}</tr>
    </table>
    <!-- Keterangan Jahit + Font & Number -->
    <table style="width:100%;border-collapse:separate;border-spacing:10px 0;margin-top:10px"><tr>
      <td style="width:50%;vertical-align:top;padding:0">
        <div style="border:1px solid ${BORDER};overflow:hidden">
          <div style="height:${ROW_H}px;display:flex;align-items:center;justify-content:center;color:${ACCENT};font-size:11px;font-weight:700;letter-spacing:0.6px;background:#fef2f2;border-bottom:1px solid ${BORDER};text-transform:uppercase">Keterangan Jahit</div>
          <div style="min-height:60px;display:flex;align-items:center;padding:8px 12px;font-size:11px;line-height:1.4;color:${PRIMARY}">${spec.keterangan_jahit || '-'}</div>
        </div>
      </td>
      <td style="width:50%;vertical-align:top;padding:0">
        <div style="border:1px solid ${BORDER};overflow:hidden">
          <div style="height:${ROW_H}px;display:flex;align-items:center;justify-content:center;background:${PRIMARY};color:#fff;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase">Font &amp; Number</div>
          <div style="min-height:60px;display:flex;align-items:center;padding:8px 12px;font-size:11px;line-height:1.4;color:${PRIMARY}">${spec.font_nomor || '-'}</div>
        </div>
      </td>
    </tr></table>
  </td>

  <!-- RIGHT 40% -->
  <td style="width:40%;vertical-align:top;padding:0">
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
      <tr>${LBL('NAMA', 'width:32%')}${VAL(wo.customer, '', `color:${ACCENT};font-weight:700`)}</tr>
      <tr>${LBL('PAKET')}${VAL(wo.paket, '', `color:${ACCENT};font-weight:700`)}</tr>
      <tr>${LBL('JUMLAH')}${VAL(`${spec.jumlah || 0} PCS`, '', `color:${ACCENT};font-weight:700`)}</tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
      <tr><td colspan="2" style="${td}background:${PRIMARY}"><div style="${flexC}color:#fff;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase">Accessories</div></td></tr>
      ${acc.map(([k,v], i) => `<tr>${LBL(k as string, `width:34%;${i % 2 === 1 ? 'background:#eef2f7' : ''}`)}${VAL((v as string) || '-', i % 2 === 1 ? 'background:#fafbfc' : '')}</tr>`).join('')}
    </table>
    <table style="width:100%;border-collapse:collapse">
      <tr>${HDR('Penanggung Jawab')}</tr>
      <tr><td style="border:1px solid ${BORDER};padding:8px 10px">
        <table style="width:100%;border-collapse:collapse">
          ${stages.map((s, i) => `<tr><td style="padding:5px 2px;font-size:10.5px;color:#1e3a8a;font-weight:500;${i < stages.length - 1 ? `border-bottom:1px dashed ${BORDER};` : ''}line-height:1.2"><span style="display:inline-block;width:24px;color:#94a3b8;font-weight:700">${String(i+1).padStart(2,'0')}</span>${s}</td></tr>`).join('')}
        </table>
      </td></tr>
    </table>
  </td>

</tr></table>


<!-- FOOTER -->
<table style="width:100%;border-collapse:separate;border-spacing:14px 0;margin-top:16px"><tr>
  <td style="vertical-align:top;width:34%;padding:0">
    ${bRows.length > 0 ? `<table style="width:100%;border-collapse:collapse">
      <tr><td colspan="2" style="${td}background:${PRIMARY}"><div style="${flexC}color:#fff;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase">Bahan</div></td></tr>
      ${bRows.map((r: Row, i: number) => `<tr>${LBL(normBagian(r.bagian), `width:50%;${i % 2 === 1 ? 'background:#eef2f7' : ''}`)}${VAL(r.bahan || '-', i % 2 === 1 ? 'background:#fafbfc' : '', `color:${ACCENT};font-weight:700`)}</tr>`).join('')}
    </table>` : `<table style="width:100%;border-collapse:collapse"><tr>${HDR('Bahan')}</tr><tr><td style="border:1px solid ${BORDER};padding:14px;text-align:center;color:#94a3b8;font-size:11px">Tidak ada data bahan</td></tr></table>`}
  </td>
  <td style="vertical-align:top;width:33%;padding:0">
    <table style="width:100%;border-collapse:collapse">
      <tr>${HDR('Approval Admin / Data')}</tr>
      <tr><td style="border:1px solid ${BORDER};padding:0"><div style="min-height:90px;display:flex;align-items:center;padding:10px 12px;font-size:11px;line-height:1.4;color:${PRIMARY}">${spec.approval_admin || '-'}</div></td></tr>
    </table>
  </td>
  <td style="vertical-align:top;width:33%;padding:0">
    <table style="width:100%;border-collapse:collapse">
      <tr>${HDR('Export & ICC')}</tr>
      <tr><td style="border:1px solid ${BORDER};padding:0"><div style="min-height:90px;display:flex;align-items:center;padding:10px 12px;font-size:11px;line-height:1.4;color:${PRIMARY}">${spec.export_icc || '-'}</div></td></tr>
    </table>
  </td>
</tr></table>

<!-- footer note -->
<div style="margin-top:18px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#94a3b8">
  <div>Ayres Apparel &middot; Lembar Spesifikasi Produksi</div>
  <div>Dicetak: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
</div>
</div>`;
  }

  async function handleDownloadPDF(specId: number) {
    const spec = specs.find((s: Row) => String(s.id) === String(specId));
    if (!spec) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;width:1400px;border:none';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument!;
      doc.open();
      doc.write(`<html><head><style>*{box-sizing:border-box;margin:0;padding:0;text-decoration:none!important;font-style:normal!important}body{background:#fff}</style></head><body>${buildSpecHtml(spec)}</body></html>`);
      doc.close();
      await new Promise(r => setTimeout(r, 1200));
      const canvas = await html2canvas(doc.body, { scale: 3, useCORS: true, backgroundColor: '#ffffff', windowWidth: 1400 });
      document.body.removeChild(iframe);
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageW = 297;
      const pageH = 210;
      const margin = 5;
      const contentW = pageW - margin * 2;
      const imgRatio = canvas.height / canvas.width;
      const contentH = Math.min(contentW * imgRatio, pageH - margin * 2);
      pdf.addImage(imgData, 'PNG', margin, margin, contentW, contentH);

      const fileName = `Spesifikasi-${wo.noWo}.pdf`;
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF Berhasil', `${fileName} telah didownload.`);
    } catch (e) { toast.error('Gagal Download PDF', String(e)); }
  }

  async function handleExportExcel(specId: number) {
    const spec = specs.find((s: Row) => String(s.id) === String(specId));
    if (!spec) return;
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Spesifikasi', {
        pageSetup: {
          paperSize: 9,
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 1,
          margins: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3, header: 0.2, footer: 0.2 },
        },
      });

      const bRows = allSpecBahan.filter((b: Row) => String(b.spesifikasi_id) === String(spec.id));
      const DEFAULT_BAGIAN = ['FRONT BODY', 'BACK BODY', 'SLEEVE', 'COMBINATION', 'COLLAR', 'SLEEVE ENDS', 'SIDE PANTS STRIPE', 'PANTS'];

      const stages = ['Approval Design', 'Approval Pattern', ...PROD_STAGES];
      const acc: [string, string][] = [
        ['TAGLINE', spec.tagline || ''],
        ['AUTHENTIC', spec.authentic || ''],
        ['SIZE', spec.info_ukuran || ''],
        ['LOGO', spec.info_logo || ''],
        ['WEBBING', spec.webbing || ''],
        ['PACKING', spec.info_packing || ''],
      ];

      const parseDataUrl = (url: string) => {
        const m = url.match(/^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/i);
        if (!m) return null;
        const ext = (m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase()) as 'png' | 'jpeg' | 'gif';
        return { base64: m[2], extension: ext };
      };

      const fetchAsDataUrl = async (url: string): Promise<string | null> => {
        try {
          const r = await fetch(url);
          if (!r.ok) return null;
          const blob = await r.blob();
          return await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch { return null; }
      };

      // Column widths (14 cols A–N) — sized so that landscape A4 fits horizontally
      const widths = [4, 22, 14, 14, 14, 2, 14, 14, 18, 18, 2, 24, 14, 18];
      ws.columns = widths.map(w => ({ width: w }));

      // Row heights — compressed body so content fits one A4 landscape page
      for (let r = 1; r <= 3; r++) ws.getRow(r).height = 22;
      ws.getRow(4).height = 20;
      for (let r = 5; r <= 32; r++) ws.getRow(r).height = 14;  // image area + right block
      for (let r = 33; r <= 38; r++) ws.getRow(r).height = 14; // Keterangan Jahit
      ws.getRow(39).height = 6;
      ws.getRow(40).height = 26; // DEADLINE
      ws.getRow(41).height = 6;
      for (let r = 42; r <= 49; r++) ws.getRow(r).height = 18;

      // Helper: load image natural dimensions via in-browser Image
      const loadImageDims = (dataUrl: string): Promise<{ w: number; h: number } | null> =>
        new Promise(resolve => {
          const img = new window.Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve(null);
          img.src = dataUrl;
        });

      // Approximate Excel cell sizes in pixels
      const colWidthPx = (w?: number) => (w ?? 8) * 7;
      const rowHeightPx = (h?: number) => (h ?? 15) * 1.333;

      const cellRangeBoxPx = (c1: number, r1: number, c2: number, r2: number) => {
        let w = 0, h = 0;
        for (let c = c1; c <= c2; c++) w += colWidthPx(ws.getColumn(c).width);
        for (let r = r1; r <= r2; r++) h += rowHeightPx(ws.getRow(r).height);
        return { w, h };
      };

      // Place an image preserving its natural aspect ratio, centered within the cell range
      const placeAspectImage = async (
        dataUrl: string,
        c1: number, r1: number, c2: number, r2: number,
      ) => {
        const dims = await loadImageDims(dataUrl);
        const p = parseDataUrl(dataUrl);
        if (!dims || !p) return;
        const { w: boxW, h: boxH } = cellRangeBoxPx(c1, r1, c2, r2);
        const ratio = dims.w / dims.h;
        let imgW = boxW, imgH = boxW / ratio;
        if (imgH > boxH) { imgH = boxH; imgW = boxH * ratio; }
        // Apply safety margin so image never overflows the cell range due to
        // the slight discrepancy between our pixel estimates and Excel rendering
        const SAFETY = 0.93;
        imgW *= SAFETY;
        imgH *= SAFETY;
        const xOff = (boxW - imgW) / 2;
        const yOff = (boxH - imgH) / 2;
        // Convert pixel offsets to fractional col/row positions
        let colF = c1 - 1, accW = 0;
        for (let c = c1; c <= c2; c++) {
          const w = colWidthPx(ws.getColumn(c).width);
          if (accW + w >= xOff) { colF = (c - 1) + (xOff - accW) / w; break; }
          accW += w;
        }
        let rowF = r1 - 1, accH = 0;
        for (let r = r1; r <= r2; r++) {
          const h = rowHeightPx(ws.getRow(r).height);
          if (accH + h >= yOff) { rowF = (r - 1) + (yOff - accH) / h; break; }
          accH += h;
        }
        const imgId = wb.addImage({ base64: p.base64, extension: p.extension });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ws.addImage(imgId, { tl: { col: colF, row: rowF }, ext: { width: imgW, height: imgH }, editAs: 'oneCell' } as any);
      };

      const thin = { style: 'thin' as const, color: { argb: 'FF000000' } };
      const medium = { style: 'medium' as const, color: { argb: 'FF000000' } };
      const allBorders = { top: thin, bottom: thin, left: thin, right: thin };

      const setBorder = (range: { r1: number; c1: number; r2: number; c2: number }) => {
        for (let r = range.r1; r <= range.r2; r++) {
          for (let c = range.c1; c <= range.c2; c++) {
            const cell = ws.getCell(r, c);
            cell.border = {
              top: r === range.r1 ? thin : cell.border?.top,
              bottom: r === range.r2 ? thin : cell.border?.bottom,
              left: c === range.c1 ? thin : cell.border?.left,
              right: c === range.c2 ? thin : cell.border?.right,
            };
          }
        }
      };

      // ─── Logo on A1:A3 ───
      const logoData = await fetchAsDataUrl(`${location.origin}/logo/new logo.png`);
      if (logoData) {
        const p = parseDataUrl(logoData);
        if (p) {
          const id = wb.addImage({ base64: p.base64, extension: p.extension });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ws.addImage(id, { tl: { col: 0.2, row: 0.4 }, br: { col: 1.7, row: 2.6 }, editAs: 'oneCell' } as any);
        }
      }

      // ─── AYRES APPAREL title B1:K3 ───
      ws.mergeCells('B1:K3');
      const title = ws.getCell('B1');
      title.value = 'AYRES APPAREL';
      title.font = { name: 'Arial', size: 26, bold: true, color: { argb: 'FF000000' } };
      title.alignment = { vertical: 'middle', horizontal: 'center' };

      // WORK ORDER NO. label L1:L3
      ws.mergeCells('L1:L3');
      const woLbl = ws.getCell('L1');
      woLbl.value = 'WORK ORDER NO.';
      woLbl.font = { name: 'Arial', size: 9, bold: true };
      woLbl.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      woLbl.border = allBorders;

      // wo.noWo M1:N3
      ws.mergeCells('M1:N3');
      const woNo = ws.getCell('M1');
      woNo.value = wo.noWo;
      woNo.font = { name: 'Arial', size: 14, bold: true };
      woNo.alignment = { vertical: 'middle', horizontal: 'center' };
      woNo.border = allBorders;

      // Header bottom thick line under cols A:N row 3
      for (let c = 1; c <= 14; c++) {
        const cell = ws.getCell(3, c);
        cell.border = { ...cell.border, bottom: medium };
      }

      // ─── Section bars row 4 ───
      ws.mergeCells('B4:E4');
      const desainBar = ws.getCell('B4');
      desainBar.value = 'DESAIN MOCK UP';
      desainBar.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      desainBar.alignment = { vertical: 'middle', horizontal: 'center' };
      desainBar.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
      desainBar.border = allBorders;

      ws.mergeCells('G4:J4');
      const patternBar = ws.getCell('G4');
      patternBar.value = 'PATTERN';
      patternBar.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      patternBar.alignment = { vertical: 'middle', horizontal: 'center' };
      patternBar.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
      patternBar.border = allBorders;

      // ─── DESAIN MOCK UP image area B5:E32 (image preserves aspect) ───
      if (spec.dokumen_desain) await placeAspectImage(spec.dokumen_desain, 2, 5, 5, 32);
      setBorder({ r1: 5, c1: 2, r2: 32, c2: 5 });

      // ─── PATTERN image area G5:J32 (same height as DESAIN, balanced) ───
      if (spec.dokumen_pattern) await placeAspectImage(spec.dokumen_pattern, 7, 5, 10, 32);
      setBorder({ r1: 5, c1: 7, r2: 32, c2: 10 });

      // ─── Keterangan Jahit B33:E38 ───
      ws.mergeCells('B33:E33');
      const kjLbl = ws.getCell('B33');
      kjLbl.value = 'Keterangan Jahit :';
      kjLbl.font = { name: 'Arial', size: 11, bold: true };
      kjLbl.alignment = { vertical: 'middle', horizontal: 'center' };

      ws.mergeCells('B34:E38');
      const kjVal = ws.getCell('B34');
      kjVal.value = spec.keterangan_jahit || '';
      kjVal.font = { name: 'Arial', size: 9 };
      kjVal.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
      kjVal.border = allBorders;

      // ─── DEADLINE B40:E40 ───
      ws.mergeCells('B40:E40');
      const dlCell = ws.getCell('B40');
      dlCell.value = 'DEADLINE :';
      dlCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFF0000' } };
      dlCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      dlCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8E0B8' } };
      dlCell.border = allBorders;

      // ─── BAHAN table — dynamic rows from DB (preserve user's order including custom bagians) ───
      const bahanItems = bRows.length > 0
        ? bRows.map((r: Row) => ({ bagian: normBagian(r.bagian), bahan: String(r.bahan || '') }))
        : DEFAULT_BAGIAN.map(b => ({ bagian: b, bahan: '' }));
      const bahanCount = Math.max(bahanItems.length, 2);
      const bahanStartRow = 42;
      const bahanEndRow = bahanStartRow + bahanCount - 1;
      for (let r = bahanStartRow; r <= bahanEndRow; r++) ws.getRow(r).height = 18;

      bahanItems.forEach((item, i) => {
        const r = bahanStartRow + i;
        const lbl = ws.getCell(r, 2);
        lbl.value = item.bagian;
        lbl.font = { name: 'Arial', size: 10, bold: true };
        lbl.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        lbl.border = allBorders;

        ws.mergeCells(r, 3, r, 5);
        const val = ws.getCell(r, 3);
        val.value = item.bahan;
        val.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFF0000' } };
        val.alignment = { vertical: 'middle', horizontal: 'center' };
        val.border = allBorders;
      });

      // ─── Font & Number G(start):I(end) — same row range as BAHAN ───
      ws.mergeCells(`G${bahanStartRow}:I${bahanStartRow}`);
      const fnLbl = ws.getCell(`G${bahanStartRow}`);
      fnLbl.value = 'Font & Number';
      fnLbl.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      fnLbl.alignment = { vertical: 'middle', horizontal: 'center' };
      fnLbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
      fnLbl.border = allBorders;

      ws.mergeCells(`G${bahanStartRow + 1}:I${bahanEndRow}`);
      const fnVal = ws.getCell(`G${bahanStartRow + 1}`);
      fnVal.value = spec.font_nomor || '';
      fnVal.font = { name: 'Arial', size: 9 };
      fnVal.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
      fnVal.border = allBorders;

      // ─── Approval Admin/Data J(start):K(end) ───
      ws.mergeCells(`J${bahanStartRow}:K${bahanStartRow}`);
      const aaLbl = ws.getCell(`J${bahanStartRow}`);
      aaLbl.value = 'Approval Admin / Data';
      aaLbl.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      aaLbl.alignment = { vertical: 'middle', horizontal: 'center' };
      aaLbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
      aaLbl.border = allBorders;

      ws.mergeCells(`J${bahanStartRow + 1}:K${bahanEndRow}`);
      const aaVal = ws.getCell(`J${bahanStartRow + 1}`);
      aaVal.value = spec.approval_admin || '';
      aaVal.font = { name: 'Arial', size: 9 };
      aaVal.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
      aaVal.border = allBorders;

      // ─── Right column: Customer block L4:N7 ───
      ws.mergeCells('L4:N4');
      const custHdr = ws.getCell('L4');
      custHdr.value = 'Customer';
      custHdr.font = { name: 'Arial', size: 10, bold: true };
      custHdr.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      custHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      custHdr.border = allBorders;

      const custFields: [string, string][] = [
        ['Nama', wo.customer || ''],
        ['Paket', wo.paket || ''],
        ['Jumlah', `${spec.jumlah || 0} PCS`],
      ];
      custFields.forEach(([k, v], i) => {
        const r = 5 + i;
        const lbl = ws.getCell(r, 12);
        lbl.value = k;
        lbl.font = { name: 'Arial', size: 9, bold: true, italic: true, underline: true };
        lbl.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        lbl.border = allBorders;
        ws.mergeCells(r, 13, r, 14);
        const val = ws.getCell(r, 13);
        val.value = v;
        val.font = { name: 'Arial', size: 9, bold: true };
        val.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        val.border = allBorders;
      });

      // ─── Accessories block L8:N14 ───
      ws.mergeCells('L8:N8');
      const accHdr = ws.getCell('L8');
      accHdr.value = 'Accessories';
      accHdr.font = { name: 'Arial', size: 10, bold: true };
      accHdr.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      accHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      accHdr.border = allBorders;

      acc.forEach(([k, v], i) => {
        const r = 9 + i;
        const lbl = ws.getCell(r, 12);
        lbl.value = k;
        lbl.font = { name: 'Arial', size: 9, bold: true, italic: true, underline: true };
        lbl.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        lbl.border = allBorders;
        ws.mergeCells(r, 13, r, 14);
        const val = ws.getCell(r, 13);
        val.value = v;
        val.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFF0000' } };
        val.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        val.border = allBorders;
      });

      // ─── PENANGGUNG JAWAB block L15:N(15+14) ───
      ws.mergeCells('L15:N15');
      const pjHdr = ws.getCell('L15');
      pjHdr.value = 'PENANGGUNG JAWAB';
      pjHdr.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      pjHdr.alignment = { vertical: 'middle', horizontal: 'center' };
      pjHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
      pjHdr.border = allBorders;

      stages.forEach((stage, i) => {
        const r = 16 + i;
        const lbl = ws.getCell(r, 12);
        lbl.value = `${i + 1}. ${stage}`;
        lbl.font = { name: 'Arial', size: 9, bold: true };
        lbl.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        lbl.border = allBorders;
        ws.mergeCells(r, 13, r, 14);
        ws.getCell(r, 13).border = allBorders;
      });

      // ─── EXPORT & ICC PRINT bottom right L(start):N(end) ───
      ws.mergeCells(`L${bahanStartRow}:L${bahanEndRow}`);
      const eiLbl = ws.getCell(`L${bahanStartRow}`);
      eiLbl.value = 'EXPORT\n& ICC\nPRINT';
      eiLbl.font = { name: 'Arial', size: 10, bold: true };
      eiLbl.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      eiLbl.border = allBorders;

      ws.mergeCells(`M${bahanStartRow}:N${bahanEndRow}`);
      const eiVal = ws.getCell(`M${bahanStartRow}`);
      eiVal.value = spec.export_icc || 'JPEG-RGB';
      eiVal.font = { name: 'Arial', size: 13, bold: true };
      eiVal.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      eiVal.border = allBorders;

      // Set print area
      ws.pageSetup.printArea = `A1:N${bahanEndRow}`;

      // Generate file
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Spesifikasi-${wo.noWo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Excel Berhasil', `Spesifikasi-${wo.noWo}.xlsx`);
    } catch (e) { toast.error('Gagal Export Excel', String(e)); }
  }

  async function openEditSpec(spec: Row) {
    try {
      // Fetch fresh data from DB
      const [freshSpecs, freshBahan, freshWos, freshOrders] = await Promise.all([
        dbGet('wo_spesifikasi'), dbGet('wo_spesifikasi_bahan'),
        dbGet('work_orders'), dbGet('orders'),
      ]);
      const fresh = freshSpecs.find((s: Row) => String(s.id) === String(spec.id)) || spec;
      const rows = freshBahan.filter((b: Row) => String(b.spesifikasi_id) === String(fresh.id));
      const freshWoData = freshWos.find((w: Row) => String(w.id) === String(wo.id));
      const freshOrder = freshWoData ? freshOrders.find((o: Row) => String(o.id) === String(freshWoData.order_id)) : null;
      if (freshWoData) {
        setFreshWo({
          ...wo,
          customer: freshWoData.customer_nama,
          paket: freshWoData.paket || '-',
          jumlah: freshWoData.jumlah || 0,
          deadline: fmtD(String(freshOrder?.estimasi_deadline || freshWoData.deadline || '')),
        });
      }

      setEditSpec(fresh);
      setNamaSpec(fresh.nama_spesifikasi || '');
      setJumlah(String(fresh.jumlah || 0));
      setTagline(fresh.tagline || '');
      setAuthentic(fresh.authentic || '');
      setInfoUkuran(fresh.info_ukuran || '');
      setInfoLogo(fresh.info_logo || '');
      setInfoPacking(fresh.info_packing || '');
      setWebbing(fresh.webbing || '');
      setFontNomor(fresh.font_nomor || '');
      setKeterangan(fresh.keterangan || '');
      setKeteranganJahit(fresh.keterangan_jahit || '');
      setApprovalAdmin(fresh.approval_admin || '');
      setDokDesain(fresh.dokumen_desain || null);
      setDokPattern(fresh.dokumen_pattern || null);
      setBahanRows(rows.length > 0 ? rows.map((b: Row) => ({ id: b.id, bagian: b.bagian, bahan: b.bahan })) : [{ id: 1, bagian: '', bahan: '' }]);
      setEditOpen(true);
    } catch (e) { toast.error('Gagal memuat data', String(e)); }
  }

  async function handleUpdateSpec() {
    if (!editSpec || !namaSpec.trim()) { toast.warning('Validasi', 'Nama Spesifikasi wajib diisi'); return; }
    setSaving(true);
    try {
      await dbUpdate('wo_spesifikasi', editSpec.id, {
        nama_spesifikasi: namaSpec,
        jumlah: Number(jumlah) || 0,
        dokumen_desain: dokDesain || null, dokumen_pattern: dokPattern || null,
        tagline, authentic, info_ukuran: infoUkuran, info_logo: infoLogo,
        info_packing: infoPacking, webbing, font_nomor: fontNomor,
        keterangan, keterangan_jahit: keteranganJahit,
        approval_admin: approvalAdmin,
      });
      // Delete old bahan rows from DB (fetch fresh to avoid stale data)
      const freshBahanAll = await dbGet('wo_spesifikasi_bahan');
      const oldBahan = freshBahanAll.filter((b: Row) => String(b.spesifikasi_id) === String(editSpec.id));
      for (const ob of oldBahan) { await dbDelete('wo_spesifikasi_bahan', Number(ob.id)); }
      for (const row of bahanRows) {
        if (row.bagian.trim()) {
          await dbCreate('wo_spesifikasi_bahan', {
            spesifikasi_id: editSpec.id, bagian: row.bagian, bahan: row.bahan, urutan: 0,
          });
        }
      }
      await refreshSpecs();
      toast.success('Diperbarui', namaSpec);
      setEditOpen(false);
      setEditSpec(null);
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  function resetForm() {
    setNamaSpec(''); setJumlah(String(wo.jumlah || 0)); setTagline(''); setAuthentic('');
    setInfoUkuran(''); setInfoLogo(''); setInfoPacking(''); setWebbing('');
    setFontNomor(''); setKeterangan(''); setKeteranganJahit(''); setApprovalAdmin('');
    setDokDesain(null); setDokPattern(null);
    setBahanRows([{ id: 1, bagian: '', bahan: '' }]);
  }

  // Form state
  const [namaSpec, setNamaSpec] = useState('');
  const [jumlah, setJumlah] = useState(String(wo.jumlah || 0));
  const [tagline, setTagline] = useState('');
  const [authentic, setAuthentic] = useState('');
  const [infoUkuran, setInfoUkuran] = useState('');
  const [infoLogo, setInfoLogo] = useState('');
  const [infoPacking, setInfoPacking] = useState('');
  const [webbing, setWebbing] = useState('');
  const [fontNomor, setFontNomor] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [keteranganJahit, setKeteranganJahit] = useState('');
  const [approvalAdmin, setApprovalAdmin] = useState('');
  const [dokDesain, setDokDesain] = useState<string | null>(null);
  const [dokPattern, setDokPattern] = useState<string | null>(null);
  const [uploadingDesain, setUploadingDesain] = useState(false);
  const [uploadingPattern, setUploadingPattern] = useState(false);
  const [bahanRows, setBahanRows] = useState([{ id: 1, bagian: '', bahan: '' }]);
  const [barangList, setBarangList] = useState<Row[]>([]);
  useEffect(() => { dbGet('barang').then(setBarangList).catch(() => {}); }, []);

  async function openCreateDrawer() {
    try {
      const all = await dbGet('order_detail_bahan');
      const rows = all.filter((d: Row) => String(d.order_id) === String(wo.order_id));
      if (rows.length > 0) {
        setBahanRows(rows.map((d: Row, i: number) => ({ id: i + 1, bagian: d.bagian, bahan: d.bahan })));
      } else {
        setBahanRows([{ id: 1, bagian: '', bahan: '' }]);
      }
    } catch {
      setBahanRows([{ id: 1, bagian: '', bahan: '' }]);
    }
    setCreateOpen(true);
  }

  async function handleUpload(file: File, setUrl: (url: string) => void, setLoading: (b: boolean) => void) {
    setLoading(true);
    try {
      const dataUrl = await compressImage(file, 1600, 0.8);
      setUrl(dataUrl);
    } catch (e) { toast.error('Upload Gagal', String(e)); }
    setLoading(false);
  }

  async function handleSaveSpec() {
    if (!namaSpec.trim()) { toast.warning('Validasi', 'Nama Spesifikasi wajib diisi'); return; }
    setSaving(true);
    try {
      const specId = await dbCreate('wo_spesifikasi', {
        work_order_id: wo.id,
        nama_spesifikasi: namaSpec,
        jumlah: Number(jumlah) || 0,
        deadline: (() => { const d = wo.deadlineRaw || wo.deadline; return d ? new Date(d).toISOString().split('T')[0] : null; })(),
        dokumen_desain: dokDesain || null, dokumen_pattern: dokPattern || null,
        tagline, authentic, info_ukuran: infoUkuran, info_logo: infoLogo,
        info_packing: infoPacking, webbing, font_nomor: fontNomor,
        keterangan, keterangan_jahit: keteranganJahit,
        approval_admin: approvalAdmin, export_icc: 'JPEG-RGB 3 PASS',
      });
      // Save bahan rows
      for (const row of bahanRows) {
        if (row.bagian.trim()) {
          await dbCreate('wo_spesifikasi_bahan', {
            spesifikasi_id: specId, bagian: row.bagian, bahan: row.bahan, urutan: 0,
          });
        }
      }
      await refreshSpecs();
      setSelectedSpecId(specId as number);
      setCreateOpen(false);
      toast.success('Lembar Spesifikasi Dibuat', namaSpec);
      resetForm();
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  const iCls = 'w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/40 transition-colors';
  const sCls = `${iCls} appearance-none cursor-pointer`;
  const lCls = 'block text-sm font-medium text-white mb-1.5';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Lembar Spesifikasi</h2>
        <button onClick={openCreateDrawer} className="flex items-center gap-2 border border-white/10 hover:bg-white/[0.04] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
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
                    <div><label className={lCls}>Nama Spesifikasi</label><input value={namaSpec} onChange={e => setNamaSpec(e.target.value)} className={iCls} placeholder="mis. Jersey Home" /></div>
                    <div><label className={lCls}>Nama Customer</label><input className={iCls} defaultValue={wo.customer} readOnly /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lCls}>Paket</label><input className={iCls} defaultValue={wo.paket} readOnly /></div>
                    <div><label className={lCls}>Jumlah</label><input value={jumlah} onChange={e => setJumlah(e.target.value)} className={iCls} readOnly /></div>
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
                    <label className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer block ${dokDesain ? 'border-emerald-500/30' : 'border-white/10 hover:border-blue-500/30'}`}>
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, setDokDesain, setUploadingDesain); }} />
                      {uploadingDesain ? (
                        <p className="text-sm font-medium text-blue-400">Mengupload...</p>
                      ) : dokDesain ? (
                        <>
                          <img src={dokDesain} alt="Desain" className="max-h-32 mx-auto rounded-lg mb-2" />
                          <p className="text-xs text-emerald-400">Klik untuk ganti gambar</p>
                        </>
                      ) : (
                        <>
                          <svg className="w-7 h-7 text-slate-500 mx-auto mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                          <p className="text-sm font-medium text-white">Upload Dokumen Desain & Pola</p>
                          <p className="text-xs text-slate-500 mt-1">Accepted types: image/*</p>
                        </>
                      )}
                    </label>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-2">Dokumen Pattern / Pecah Pola</p>
                    <label className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer block ${dokPattern ? 'border-emerald-500/30' : 'border-white/10 hover:border-blue-500/30'}`}>
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, setDokPattern, setUploadingPattern); }} />
                      {uploadingPattern ? (
                        <p className="text-sm font-medium text-blue-400">Mengupload...</p>
                      ) : dokPattern ? (
                        <>
                          <img src={dokPattern} alt="Pattern" className="max-h-32 mx-auto rounded-lg mb-2" />
                          <p className="text-xs text-emerald-400">Klik untuk ganti gambar</p>
                        </>
                      ) : (
                        <>
                          <svg className="w-7 h-7 text-slate-500 mx-auto mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                          <p className="text-sm font-medium text-white">Upload Dokumen Pattern</p>
                          <p className="text-xs text-slate-500 mt-1">Accepted types: image/*</p>
                        </>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              {/* Aksesoris & Detail */}
              <div className="border-t border-white/[0.06] pt-5">
                <h3 className="text-sm font-bold text-white mb-4">Aksesoris & Detail</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lCls}>Tagline</label><select value={tagline} onChange={e => setTagline(e.target.value)} className={sCls}><option value="">Pilih...</option><option>Ayres</option><option>polos</option><option>custom</option></select></div>
                    <div><label className={lCls}>Authentic</label><select value={authentic} onChange={e => setAuthentic(e.target.value)} className={sCls}><option value="">Pilih...</option><option>Ayress rubber</option><option>Ayress woven</option><option>Custom</option><option>Tanpa authentic</option></select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lCls}>Info Ukuran</label><select value={infoUkuran} onChange={e => setInfoUkuran(e.target.value)} className={sCls}><option value="">Pilih...</option><option>Ayres</option><option>polos</option><option>custom</option><option>reseller</option></select></div>
                    <div><label className={lCls}>Info Logo</label><input value={infoLogo} onChange={e => setInfoLogo(e.target.value)} className={iCls} placeholder="PRINT" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lCls}>Info Packing</label><select value={infoPacking} onChange={e => setInfoPacking(e.target.value)} className={sCls}><option value="">Pilih...</option><option>Ayres</option><option>polos</option><option>custom</option></select></div>
                    <div><label className={lCls}>Webbing</label><select value={webbing} onChange={e => setWebbing(e.target.value)} className={sCls}><option value="">Pilih...</option><option>Ayres</option><option>polos</option><option>custom</option></select></div>
                  </div>
                  <div><label className={lCls}>Font & Nomor</label><input value={fontNomor} onChange={e => setFontNomor(e.target.value)} className={iCls} placeholder="ARIAL" /></div>
                  <div><label className={lCls}>Keterangan</label><textarea value={keterangan} onChange={e => setKeterangan(e.target.value)} rows={3} className={`${iCls} resize-none`} /></div>
                  <div><label className={lCls}>Keterangan Jahit</label><textarea value={keteranganJahit} onChange={e => setKeteranganJahit(e.target.value)} rows={3} className={`${iCls} resize-none`} /></div>
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
                      <input className={iCls} placeholder="Nama bagian" value={r.bagian} onChange={e => setBahanRows(prev => prev.map(p => p.id === r.id ? { ...p, bagian: e.target.value } : p))} />
                      <select className={sCls} value={r.bahan} onChange={e => setBahanRows(prev => prev.map(p => p.id === r.id ? { ...p, bahan: e.target.value } : p))}>
                        <option value="">Pilih bahan...</option>
                        {barangList.map(b => <option key={b.id} value={b.nama}>{b.nama}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Persetujuan */}
              <div className="border-t border-white/[0.06] pt-5">
                <h3 className="text-sm font-bold text-white mb-3">Persetujuan</h3>
                <label className={lCls}>Data Persetujuan Admin</label>
                <input value={approvalAdmin} onChange={e => setApprovalAdmin(e.target.value)} className={iCls} />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-3 shrink-0">
              <button onClick={() => setCreateOpen(false)} className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
              <button onClick={handleSaveSpec} disabled={saving} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">{saving ? 'Menyimpan...' : 'Buat Lembar Spesifikasi'}</button>
            </div>
          </div>
        </>
      )}

      {/* ── Edit Drawer ── */}
      {editOpen && editSpec && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => { setEditOpen(false); setEditSpec(null); resetForm(); }} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] bg-[#0c1120] border-l border-white/[0.06] shadow-2xl flex flex-col animate-slide-in-right">
            <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-white">Edit Lembar Spesifikasi</h2>
              <button onClick={() => { setEditOpen(false); setEditSpec(null); resetForm(); }} className="text-slate-500 hover:text-white transition-colors p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white mb-4">Informasi Dasar</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lCls}>Nama Spesifikasi</label><input value={namaSpec} onChange={e => setNamaSpec(e.target.value)} className={iCls} /></div>
                    <div><label className={lCls}>Nama Customer</label><input className={iCls} value={freshWo.customer} readOnly /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lCls}>Paket</label><input className={iCls} value={freshWo.paket} readOnly /></div>
                    <div><label className={lCls}>Jumlah</label><input value={jumlah} onChange={e => setJumlah(e.target.value)} className={iCls} /></div>
                  </div>
                  <div><label className={lCls}>Deadline</label><input className={iCls} value={freshWo.deadline} readOnly /></div>
                </div>
              </div>
              <div className="border-t border-white/[0.06] pt-5">
                <h3 className="text-sm font-bold text-white mb-4">Gambar</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-2">Dokumen Desain & Pola</p>
                    <label className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer block ${dokDesain ? 'border-emerald-500/30' : 'border-white/10 hover:border-blue-500/30'}`}>
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, setDokDesain, setUploadingDesain); }} />
                      {uploadingDesain ? (<p className="text-sm font-medium text-blue-400">Mengupload...</p>) : dokDesain ? (<><img src={dokDesain} alt="Desain" className="max-h-32 mx-auto rounded-lg mb-2" /><p className="text-xs text-emerald-400">Klik untuk ganti gambar</p></>) : (<><svg className="w-7 h-7 text-slate-500 mx-auto mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg><p className="text-sm font-medium text-white">Upload Dokumen Desain & Pola</p></>)}
                    </label>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-2">Dokumen Pattern / Pecah Pola</p>
                    <label className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer block ${dokPattern ? 'border-emerald-500/30' : 'border-white/10 hover:border-blue-500/30'}`}>
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, setDokPattern, setUploadingPattern); }} />
                      {uploadingPattern ? (<p className="text-sm font-medium text-blue-400">Mengupload...</p>) : dokPattern ? (<><img src={dokPattern} alt="Pattern" className="max-h-32 mx-auto rounded-lg mb-2" /><p className="text-xs text-emerald-400">Klik untuk ganti gambar</p></>) : (<><svg className="w-7 h-7 text-slate-500 mx-auto mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg><p className="text-sm font-medium text-white">Upload Dokumen Pattern</p></>)}
                    </label>
                  </div>
                </div>
              </div>
              <div className="border-t border-white/[0.06] pt-5">
                <h3 className="text-sm font-bold text-white mb-4">Aksesoris & Detail</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lCls}>Tagline</label><select value={tagline} onChange={e => setTagline(e.target.value)} className={sCls}><option value="">Pilih...</option><option>Ayres</option><option>polos</option><option>custom</option></select></div>
                    <div><label className={lCls}>Authentic</label><select value={authentic} onChange={e => setAuthentic(e.target.value)} className={sCls}><option value="">Pilih...</option><option>Ayress rubber</option><option>Ayress woven</option><option>Custom</option><option>Tanpa authentic</option></select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lCls}>Info Ukuran</label><select value={infoUkuran} onChange={e => setInfoUkuran(e.target.value)} className={sCls}><option value="">Pilih...</option><option>Ayres</option><option>polos</option><option>custom</option><option>reseller</option></select></div>
                    <div><label className={lCls}>Info Logo</label><input value={infoLogo} onChange={e => setInfoLogo(e.target.value)} className={iCls} placeholder="PRINT" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lCls}>Info Packing</label><select value={infoPacking} onChange={e => setInfoPacking(e.target.value)} className={sCls}><option value="">Pilih...</option><option>Ayres</option><option>polos</option><option>custom</option></select></div>
                    <div><label className={lCls}>Webbing</label><select value={webbing} onChange={e => setWebbing(e.target.value)} className={sCls}><option value="">Pilih...</option><option>Ayres</option><option>polos</option><option>custom</option></select></div>
                  </div>
                  <div><label className={lCls}>Font & Nomor</label><input value={fontNomor} onChange={e => setFontNomor(e.target.value)} className={iCls} placeholder="ARIAL" /></div>
                  <div><label className={lCls}>Keterangan</label><textarea value={keterangan} onChange={e => setKeterangan(e.target.value)} rows={3} className={`${iCls} resize-none`} /></div>
                  <div><label className={lCls}>Keterangan Jahit</label><textarea value={keteranganJahit} onChange={e => setKeteranganJahit(e.target.value)} rows={3} className={`${iCls} resize-none`} /></div>
                </div>
              </div>
              <div className="border-t border-white/[0.06] pt-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white">Detail Bahan</h3>
                  <button onClick={() => setBahanRows(prev => [...prev, { id: Date.now(), bagian: '', bahan: '' }])} className="text-xs text-blue-400 border border-blue-500/20 px-3 py-1 rounded-lg hover:bg-blue-500/10 transition-colors">+ Tambah Baris Bahan</button>
                </div>
                <div className="space-y-2">
                  {bahanRows.map(r => (
                    <div key={r.id} className="flex gap-2 items-center">
                      <input className={`${iCls} flex-1`} placeholder="Nama bagian" value={r.bagian} onChange={e => setBahanRows(prev => prev.map(p => p.id === r.id ? { ...p, bagian: e.target.value } : p))} />
                      <select className={`${sCls} flex-1`} value={r.bahan} onChange={e => setBahanRows(prev => prev.map(p => p.id === r.id ? { ...p, bahan: e.target.value } : p))}>
                        <option value="">Pilih bahan...</option>
                        {barangList.map(b => <option key={b.id} value={b.nama}>{b.nama}</option>)}
                      </select>
                      <button onClick={() => setBahanRows(prev => prev.filter(p => p.id !== r.id))} className="text-slate-500 hover:text-red-400 transition-colors shrink-0 p-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-white/[0.06] pt-5">
                <h3 className="text-sm font-bold text-white mb-3">Persetujuan</h3>
                <label className={lCls}>Data Persetujuan Admin</label>
                <input value={approvalAdmin} onChange={e => setApprovalAdmin(e.target.value)} className={iCls} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-3 shrink-0">
              <button onClick={() => { setEditOpen(false); setEditSpec(null); resetForm(); }} className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
              <button onClick={handleUpdateSpec} disabled={saving} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
            </div>
          </div>
        </>
      )}

      {/* Content — empty state or spec cards */}
      {specs.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-white/[0.08] py-14 text-center">
          <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
          <p className="text-sm font-semibold text-white mb-1">Belum ada lembar spesifikasi</p>
          <p className="text-xs text-slate-500 mb-4">Buat lembar spesifikasi untuk mendefinisikan detail produksi.</p>
          <button onClick={openCreateDrawer} className="inline-flex items-center gap-2 border border-white/10 hover:bg-white/[0.04] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Buat Lembar Spesifikasi
          </button>
        </div>
      ) : (
        <>
          {/* Spec tabs + actions */}
          <div className="border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex">
              {specs.map((spec: Row) => (
                <button key={spec.id} onClick={() => setSelectedSpecId(spec.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${selectedSpecId === spec.id ? 'text-white border-blue-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                  {spec.nama_spesifikasi?.toUpperCase() || `SPEC ${spec.id}`}
                </button>
              ))}
            </div>
            {specs.filter((s: Row) => s.id === selectedSpecId).map((spec: Row) => (
              <div key={spec.id} className="flex items-center gap-2 pr-1">
                <button onClick={() => handleExportExcel(spec.id)} className="flex items-center gap-1.5 text-xs text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg hover:bg-emerald-500/10 transition-colors">Export Excel</button>
                <button onClick={() => handleDownloadPDF(spec.id)} className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">Download PDF</button>
                <button onClick={() => openEditSpec(spec)} className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">Edit</button>
                <button onClick={() => handleDeleteSpec(spec)} className="flex items-center gap-1.5 text-xs text-red-400 border border-red-500/20 bg-red-500/10 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors">Hapus</button>
              </div>
            ))}
          </div>
          {/* Selected spec card - displayed directly */}
          {specs.filter((spec: Row) => spec.id === selectedSpecId).map((spec: Row) => (
            <div key={spec.id}>
              <div ref={el => { printRef.current[spec.id] = el; }} className="bg-white rounded-lg p-6 text-black max-w-4xl mx-auto mt-4">
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
                    <div className="col-span-2">
                      <div className="bg-blue-900 text-white text-center text-xs font-bold py-1 mb-2">DESAIN MOCK UP & PATTERN</div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="border border-slate-200 rounded overflow-hidden">
                          {spec.dokumen_desain ? (
                            <img src={spec.dokumen_desain} alt="Desain & Pola" className="w-full h-auto object-contain" />
                          ) : (
                            <div className="h-40 bg-slate-100 grid place-items-center text-slate-400 text-xs">Desain & Pola</div>
                          )}
                        </div>
                        <div className="border border-slate-200 rounded overflow-hidden">
                          {spec.dokumen_pattern ? (
                            <img src={spec.dokumen_pattern} alt="Pattern" className="w-full h-auto object-contain" />
                          ) : (
                            <div className="h-40 bg-slate-100 grid place-items-center text-slate-400 text-xs">Pattern / Pecah Pola</div>
                          )}
                        </div>
                      </div>
                      <div className="border border-black overflow-hidden mt-2 text-xs">
                        <div className="grid grid-cols-2 border-b border-black">
                          <div className="font-bold text-center bg-black text-white py-1 border-r border-black">Nama Customer</div>
                          <div className="font-bold text-center bg-black text-white py-1">Nama Spesifikasi</div>
                        </div>
                        <div className="grid grid-cols-2">
                          <div className="text-center py-1 border-r border-black">{wo.customer}</div>
                          <div className="text-center py-1">{spec.nama_spesifikasi}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <div className="border border-black rounded p-2">
                          <p className="text-[10px] font-bold text-red-600 bg-red-50 px-1">KETERANGAN JAHIT</p>
                          <p className="text-xs mt-1">{spec.keterangan_jahit || '-'}</p>
                        </div>
                        <div className="border border-black rounded p-2">
                          <p className="text-[10px] font-bold text-center bg-blue-900 text-white px-1">FONT & NUMBER</p>
                          <p className="text-xs mt-1">{spec.font_nomor || '-'}</p>
                        </div>
                      </div>
                      <div className="mt-2 bg-green-100 text-black text-xs font-bold px-2 py-1 inline-block border border-black">
                        DEADLINE : {wo.deadline}
                      </div>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="border border-black overflow-hidden">
                        {[['NAMA', wo.customer],['PAKET', wo.paket],['JUMLAH', `${spec.jumlah || 0} PCS`]].map(([k,v]) => (
                          <div key={k} className="grid grid-cols-2 border-b border-black last:border-0">
                            <span className="font-bold px-2 py-1 border-r border-black">{k}</span>
                            <span className="px-2 py-1 text-red-600">{v}</span>
                          </div>
                        ))}
                      </div>
                      <div className="border border-black overflow-hidden">
                        <p className="text-center font-bold bg-black text-white py-1 border-b border-black">Accessories</p>
                        {[['TAGLINE',spec.tagline],['AUTHENTIC',spec.authentic],['SIZE',spec.info_ukuran],['LOGO',spec.info_logo],['PACKING',spec.info_packing],['WEBBING',spec.webbing]].map(([k,v]) => (
                          <div key={k} className="grid grid-cols-2 border-b border-black last:border-0">
                            <span className="font-bold px-2 py-0.5 border-r border-black">{k}</span>
                            <span className="px-2 py-0.5">{v || '-'}</span>
                          </div>
                        ))}
                      </div>
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
                  {/* Bottom: Bahan table + Approval + Export */}
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="border border-black overflow-hidden text-xs">
                      {(() => {
                        const rows = allSpecBahan.filter((b: Row) => String(b.spesifikasi_id) === String(spec.id));
                        return rows.length > 0 ? rows.map((b: Row, i: number) => (
                          <div key={i} className="grid grid-cols-2 border-b border-black last:border-0">
                            <span className="font-bold px-2 py-1 border-r border-black">{normBagian(b.bagian)}</span>
                            <span className="px-2 py-1 text-red-600">{b.bahan || '-'}</span>
                          </div>
                        )) : (
                          <div className="px-2 py-2 text-slate-400 text-center">Belum ada data bahan</div>
                        );
                      })()}
                    </div>
                    <div className="border border-black overflow-hidden text-xs">
                      <p className="text-center font-bold bg-black text-white py-1 border-b border-black">APPROVAL ADMIN / DATA</p>
                      <div className="p-2">
                        <p>{spec.approval_admin || '-'}</p>
                      </div>
                    </div>
                    <div className="border border-black overflow-hidden text-xs">
                      <p className="text-center font-bold bg-black text-white py-1 border-b border-black">EXPORT & ICC</p>
                      <div className="p-2">
                        <p>{spec.export_icc || '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ═══ Tab WO 2 — Form Permintaan Gudang ═══ */
function TabWO2({ wo, gudangItems, specs: propSpecs, specBahan: propSpecBahan }: { wo: Row; gudangItems: Row[]; specs: Row[]; specBahan: Row[] }) {
  type ExtraRow = { id: number; bagian: string; bahan: string; warna: string; kuantitas: number };
  const [extraAks, setExtraAks] = useState<ExtraRow[]>([]);
  const [extraMat, setExtraMat] = useState<ExtraRow[]>([{ id: 1, bagian: '', bahan: '', warna: '', kuantitas: 0 }]);
  const [autoInputs, setAutoInputs] = useState<Record<string, { warna: string; kuantitas: number }>>({});
  const [liveSpecs, setLiveSpecs] = useState(propSpecs);
  const [liveSpecBahan, setLiveSpecBahan] = useState(propSpecBahan);
  const [liveGudang, setLiveGudang] = useState<Row[]>(gudangItems);
  const [barangList, setBarangList] = useState<Row[]>([]);
  const [stokList, setStokList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  // Lookup barang by name (case-insensitive); returns barang row or null
  const findBarang = (name: string): Row | null => {
    if (!name) return null;
    const lower = name.trim().toLowerCase();
    return barangList.find((b: Row) => String(b.nama || '').trim().toLowerCase() === lower) || null;
  };
  const lookupBarangId = (name: string): number | null => {
    const b = findBarang(name);
    return b ? Number(b.id) : null;
  };
  // Get available stock for a bahan name. Returns null if no master record.
  const getStokInfo = (name: string): { qty: number; satuan: string } | null => {
    const b = findBarang(name);
    if (!b) return null;
    const s = stokList.find((st: Row) => String(st.barang_id) === String(b.id));
    return { qty: s?.qty ?? 0, satuan: b.satuan || 'PCS' };
  };
  const delIcon = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>;

  // Fetch fresh data from DB on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, sb, g, b, st] = await Promise.all([
          dbGet('wo_spesifikasi'), dbGet('wo_spesifikasi_bahan'),
          dbGet('wo_permintaan_gudang'), dbGet('barang'), dbGet('stok'),
        ]);
        setLiveSpecs(s.filter((r: Row) => String(r.work_order_id) === String(wo.id)));
        setLiveSpecBahan(sb);
        setLiveGudang(g.filter((r: Row) => String(r.work_order_id) === String(wo.id)));
        setBarangList(b);
        setStokList(st);
      } catch {}
      setLoading(false);
    })();
  }, [wo.id]);

  // Auto-generate from WO1 specs
  const { bahanUtama, aksesorisRows } = useMemo(() => {
    const bu: { bagian: string; bahan: string }[] = [];
    const ak: { bagian: string; bahan: string }[] = [];
    for (const spec of liveSpecs) {
      const rows = liveSpecBahan.filter((b: Row) => String(b.spesifikasi_id) === String(spec.id));
      for (const r of rows) bu.push({ bagian: r.bagian, bahan: r.bahan || '-' });
      if (spec.tagline) ak.push({ bagian: 'Tagline', bahan: spec.tagline });
      if (spec.authentic) ak.push({ bagian: 'Keaslian', bahan: spec.authentic });
      if (spec.info_ukuran) ak.push({ bagian: 'Info Ukuran', bahan: spec.info_ukuran });
      if (spec.info_logo) ak.push({ bagian: 'Info Logo', bahan: spec.info_logo });
      if (spec.info_packing) ak.push({ bagian: 'Info Packing', bahan: spec.info_packing });
      if (spec.webbing) ak.push({ bagian: 'Webbing', bahan: spec.webbing });
      if (spec.font_nomor) ak.push({ bagian: 'Font & Nomor', bahan: spec.font_nomor });
    }
    return { bahanUtama: bu, aksesorisRows: ak };
  }, [liveSpecs, liveSpecBahan]);
  const totalAuto = bahanUtama.length + aksesorisRows.length;
  const hasData = liveSpecs.length > 0;

  // Hydrate state from saved gudang data whenever liveGudang or auto rows change
  useEffect(() => {
    const initAuto: Record<string, { warna: string; kuantitas: number }> = {};
    const buItems = liveGudang.filter((r: Row) => r.kategori === 'BAHAN_UTAMA');
    bahanUtama.forEach((r, i) => {
      const match = buItems.find((g: Row) => g.bagian === r.bagian && g.bahan === r.bahan);
      if (match) initAuto[`bu-${i}`] = { warna: match.warna || '', kuantitas: Number(match.kuantitas) || 0 };
    });
    const akItems = liveGudang.filter((r: Row) => r.kategori === 'AKSESORIS');
    aksesorisRows.forEach((r, i) => {
      const match = akItems.find((g: Row) => g.bagian === r.bagian && g.bahan === r.bahan);
      if (match) initAuto[`ak-${i}`] = { warna: match.warna || '', kuantitas: Number(match.kuantitas) || 0 };
    });
    setAutoInputs(initAuto);

    const matchedAk = new Set(aksesorisRows.map(r => `${r.bagian}|${r.bahan}`));
    const extraAkItems = akItems.filter((g: Row) => !matchedAk.has(`${g.bagian}|${g.bahan}`));
    setExtraAks(extraAkItems.map((r: Row, i: number) => ({
      id: Date.now() + i,
      bagian: r.bagian || '', bahan: r.bahan || '',
      warna: r.warna || '', kuantitas: Number(r.kuantitas) || 0,
    })));

    const mtItems = liveGudang.filter((r: Row) => r.kategori === 'MATERIAL_TAMBAHAN');
    if (mtItems.length > 0) {
      setExtraMat(mtItems.map((r: Row, i: number) => ({
        id: Date.now() + 1000 + i,
        bagian: r.bagian || '', bahan: r.bahan || '',
        warna: r.warna || '', kuantitas: Number(r.kuantitas) || 0,
      })));
    }
  }, [liveGudang, bahanUtama, aksesorisRows]);

  const setAutoField = (key: string, field: 'warna' | 'kuantitas', value: string | number) => {
    setAutoInputs(prev => ({
      ...prev,
      [key]: { ...(prev[key] || { warna: '', kuantitas: 0 }), [field]: value },
    }));
  };
  const updateExtraAks = (id: number, field: keyof ExtraRow, value: string | number) => {
    setExtraAks(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  const updateExtraMat = (id: number, field: keyof ExtraRow, value: string | number) => {
    setExtraMat(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  async function handleSimpan() {
    setSaving(true);
    try {
      const existing = await dbGet('wo_permintaan_gudang');
      const old = existing.filter((r: Row) => String(r.work_order_id) === String(wo.id));
      for (const o of old) await dbDelete('wo_permintaan_gudang', Number(o.id));

      let urutan = 1;
      for (let i = 0; i < bahanUtama.length; i++) {
        const r = bahanUtama[i];
        const inp = autoInputs[`bu-${i}`] || { warna: '', kuantitas: 0 };
        await dbCreate('wo_permintaan_gudang', {
          work_order_id: wo.id, kategori: 'BAHAN_UTAMA', urutan: urutan++,
          bagian: r.bagian, bahan: r.bahan, barang_id: lookupBarangId(r.bahan),
          warna: inp.warna, kuantitas: Number(inp.kuantitas) || 0,
        });
      }
      for (let i = 0; i < aksesorisRows.length; i++) {
        const r = aksesorisRows[i];
        const inp = autoInputs[`ak-${i}`] || { warna: '', kuantitas: 0 };
        await dbCreate('wo_permintaan_gudang', {
          work_order_id: wo.id, kategori: 'AKSESORIS', urutan: urutan++,
          bagian: r.bagian, bahan: r.bahan, barang_id: lookupBarangId(r.bahan),
          warna: inp.warna, kuantitas: Number(inp.kuantitas) || 0,
        });
      }
      for (const r of extraAks) {
        if (r.bagian.trim() || r.bahan.trim()) {
          await dbCreate('wo_permintaan_gudang', {
            work_order_id: wo.id, kategori: 'AKSESORIS', urutan: urutan++,
            bagian: r.bagian, bahan: r.bahan, barang_id: lookupBarangId(r.bahan),
            warna: r.warna, kuantitas: Number(r.kuantitas) || 0,
          });
        }
      }
      for (const r of extraMat) {
        if (r.bagian.trim() || r.bahan.trim()) {
          await dbCreate('wo_permintaan_gudang', {
            work_order_id: wo.id, kategori: 'MATERIAL_TAMBAHAN', urutan: urutan++,
            bagian: r.bagian, bahan: r.bahan, barang_id: lookupBarangId(r.bahan),
            warna: r.warna, kuantitas: Number(r.kuantitas) || 0,
          });
        }
      }

      const refreshed = await dbGet('wo_permintaan_gudang');
      setLiveGudang(refreshed.filter((r: Row) => String(r.work_order_id) === String(wo.id)));
      toast.success('Disimpan', 'Data permintaan gudang berhasil disimpan.');
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  async function handleDownloadPdfWO2() {
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const pdf = new jsPDF('l', 'mm', 'a4');
      pdf.setFontSize(14);
      pdf.text(`FORM PERMINTAAN GUDANG - ${wo.customer?.toUpperCase()}`, 14, 18);
      pdf.setFontSize(10);
      pdf.text(`No WO: ${wo.noWo}`, 14, 26);

      const allRows: string[][] = [];
      let no = 1;
      // Bahan utama
      for (let i = 0; i < bahanUtama.length; i++) {
        const r = bahanUtama[i];
        const inp = autoInputs[`bu-${i}`] || { warna: '', kuantitas: 0 };
        allRows.push([String(no++), r.bagian, r.bahan, inp.warna || '', String(inp.kuantitas || 0)]);
      }
      // Aksesoris
      const allAks = [...aksesorisRows.map((r, i) => ({ ...r, ...(autoInputs[`ak-${i}`] || { warna: '', kuantitas: 0 }) })), ...extraAks];
      if (allAks.length > 0) {
        allRows.push([{ content: 'AKSESORIS', colSpan: 5, styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } } as unknown as string]);
        for (const r of allAks) {
          allRows.push([String(no++), r.bagian, r.bahan, r.warna || '', String(r.kuantitas || 0)]);
        }
      }
      // Material Tambahan
      const filledMat = extraMat.filter(r => r.bagian.trim() || r.bahan.trim());
      if (filledMat.length > 0) {
        allRows.push([{ content: 'MATERIAL TAMBAHAN', colSpan: 5, styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } } as unknown as string]);
        for (const r of filledMat) {
          allRows.push([String(no++), r.bagian, r.bahan, r.warna || '', String(r.kuantitas || 0)]);
        }
      }

      autoTable(pdf, {
        startY: 32,
        head: [['NO', 'BAGIAN', 'BAHAN', 'WARNA', 'KUANTITAS']],
        body: allRows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 58, 95] },
      });

      // Approval Finance box — bottom right, below table
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalY = (pdf as any).lastAutoTable?.finalY ?? 32;
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const boxW = 80;
      const boxH = 40;
      const boxX = pageW - boxW - 14;
      let boxY = finalY + 10;
      // If the box would overflow page height, push to a new page
      if (boxY + boxH > pageH - 10) {
        pdf.addPage();
        boxY = 14;
      }
      // Title bar
      pdf.setFillColor(30, 58, 95);
      pdf.rect(boxX, boxY, boxW, 8, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('APPROVAL FINANCE', boxX + boxW / 2, boxY + 5.5, { align: 'center' });
      // Signature area
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.3);
      pdf.rect(boxX, boxY + 8, boxW, boxH - 8);
      // Reset fonts/colors for any subsequent rendering
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');

      pdf.save(`Permintaan-Gudang-${wo.noWo}.pdf`);
      toast.success('PDF Berhasil', `Permintaan-Gudang-${wo.noWo}.pdf`);
    } catch (e) { toast.error('Gagal Download PDF', String(e)); }
  }

  return (
    <div className="space-y-5">
      {/* Title bar */}
      <div className="rounded-lg bg-amber-500/20 border border-amber-500/30 px-5 py-3 flex items-center justify-between">
        <span className="text-sm font-bold text-white">FORM PERMINTAAN GUDANG – CUST: {wo.customer.toUpperCase()}</span>
        <button onClick={handleDownloadPdfWO2} className="flex items-center gap-1.5 text-xs text-slate-300 border border-white/10 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors">
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
              {!hasData && extraMat.length <= 1 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">Isi WO 1 Lembar Spesifikasi terlebih dahulu</td></tr>
              )}

              {/* Bahan utama from WO1 spec bahan */}
              {bahanUtama.map((r, i) => {
                const qty = autoInputs[`bu-${i}`]?.kuantitas || 0;
                const stokInfo = getStokInfo(r.bahan);
                const insufficient = stokInfo && qty > stokInfo.qty;
                return (
                <tr key={`bu-${i}`} className="border-b border-white/[0.04]">
                  <td className="px-5 py-3.5 text-sm text-blue-400">{i + 1}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-emerald-400">{normBagian(r.bagian)}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-white">{r.bahan}</td>
                  <td className="px-5 py-3.5"><input type="text" value={autoInputs[`bu-${i}`]?.warna ?? ''} onChange={e => setAutoField(`bu-${i}`, 'warna', e.target.value)} placeholder="Warna..." className="bg-transparent text-sm text-slate-300 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-col">
                      <input type="number" min={0} placeholder="0" value={autoInputs[`bu-${i}`]?.kuantitas || ''} onChange={e => setAutoField(`bu-${i}`, 'kuantitas', Number(e.target.value) || 0)} className={`no-spin bg-transparent text-sm focus:outline-none w-16 ${insufficient ? 'text-red-400' : 'text-slate-300'} placeholder-slate-600`} />
                      {stokInfo ? (
                        <span className={`text-[10px] mt-0.5 ${insufficient ? 'text-red-400' : 'text-slate-500'}`}>Stok: {stokInfo.qty} {stokInfo.satuan}</span>
                      ) : (
                        <span className="text-[10px] text-slate-600 mt-0.5">Tidak ada di master</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5" />
                </tr>
                );
              })}

              {/* Aksesoris separator */}
              {hasData && (
                <tr><td colSpan={6} className="px-5 py-3 text-center border-b border-white/[0.06]">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">AKSESORIS</span>
                  <button onClick={() => setExtraAks(prev => [...prev, { id: Date.now(), bagian: '', bahan: '', warna: '', kuantitas: 0 }])}
                    className="text-xs text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded hover:bg-blue-500/10 transition-colors">+ Tambah</button>
                </td></tr>
              )}

              {/* Aksesoris auto-generated from WO1 spec fields */}
              {aksesorisRows.map((r, i) => {
                const qty = autoInputs[`ak-${i}`]?.kuantitas || 0;
                const stokInfo = getStokInfo(r.bahan);
                const insufficient = stokInfo && qty > stokInfo.qty;
                return (
                <tr key={`ak-${i}`} className="border-b border-white/[0.04]">
                  <td className="px-5 py-3.5 text-sm text-blue-400">{bahanUtama.length + i + 1}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-emerald-400">{normBagian(r.bagian)}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-white">{r.bahan}</td>
                  <td className="px-5 py-3.5"><input type="text" value={autoInputs[`ak-${i}`]?.warna ?? ''} onChange={e => setAutoField(`ak-${i}`, 'warna', e.target.value)} placeholder="Warna..." className="bg-transparent text-sm text-slate-300 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-col">
                      <input type="number" min={0} placeholder="0" value={autoInputs[`ak-${i}`]?.kuantitas || ''} onChange={e => setAutoField(`ak-${i}`, 'kuantitas', Number(e.target.value) || 0)} className={`no-spin bg-transparent text-sm focus:outline-none w-16 ${insufficient ? 'text-red-400' : 'text-slate-300'} placeholder-slate-600`} />
                      {stokInfo ? (
                        <span className={`text-[10px] mt-0.5 ${insufficient ? 'text-red-400' : 'text-slate-500'}`}>Stok: {stokInfo.qty} {stokInfo.satuan}</span>
                      ) : (
                        <span className="text-[10px] text-slate-600 mt-0.5">Tidak ada di master</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5" />
                </tr>
                );
              })}

              {/* Aksesoris tambahan (editable) */}
              {extraAks.map((row, i) => (
                <tr key={`ea-${row.id}`} className="border-b border-white/[0.04] bg-white/[0.01]">
                  <td className="px-5 py-2.5 text-sm text-blue-400 align-middle">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5" />
                    {bahanUtama.length + aksesorisRows.length + i + 1}
                  </td>
                  <td className="px-5 py-2.5"><input type="text" value={row.bagian} onChange={e => updateExtraAks(row.id, 'bagian', e.target.value)} placeholder="Nama bagian..." className="bg-transparent text-sm text-slate-300 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-2.5"><input type="text" value={row.bahan} onChange={e => updateExtraAks(row.id, 'bahan', e.target.value)} placeholder="Nama bahan..." className="bg-transparent text-sm text-slate-300 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-2.5"><input type="text" value={row.warna} onChange={e => updateExtraAks(row.id, 'warna', e.target.value)} placeholder="Warna..." className="bg-transparent text-sm text-slate-300 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-2.5"><input type="number" min={0} placeholder="0" value={row.kuantitas || ''} onChange={e => updateExtraAks(row.id, 'kuantitas', Number(e.target.value) || 0)} className="no-spin bg-transparent text-sm text-slate-300 placeholder-slate-600 focus:outline-none w-16" /></td>
                  <td className="px-5 py-2.5">
                    <button onClick={() => setExtraAks(prev => prev.filter(r => r.id !== row.id))} className="text-slate-600 hover:text-red-400 transition-colors">{delIcon}</button>
                  </td>
                </tr>
              ))}

              {/* Material Tambahan separator */}
              <tr><td colSpan={6} className="px-5 py-3 text-center border-b border-white/[0.06]">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">MATERIAL TAMBAHAN</span>
                <button onClick={() => setExtraMat(prev => [...prev, { id: Date.now(), bagian: '', bahan: '', warna: '', kuantitas: 0 }])}
                  className="text-xs text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded hover:bg-blue-500/10 transition-colors">+ Tambah</button>
              </td></tr>

              {/* Material tambahan rows (editable) */}
              {extraMat.map((row, i) => (
                <tr key={`em-${row.id}`} className="border-b border-white/[0.04] bg-white/[0.01]">
                  <td className="px-5 py-2.5 text-sm text-blue-400 align-middle">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5" />
                    {totalAuto + extraAks.length + i + 1}
                  </td>
                  <td className="px-5 py-2.5"><input type="text" value={row.bagian} onChange={e => updateExtraMat(row.id, 'bagian', e.target.value)} placeholder="Nama bagian..." className="bg-transparent text-sm text-slate-300 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-2.5"><input type="text" value={row.bahan} onChange={e => updateExtraMat(row.id, 'bahan', e.target.value)} placeholder="Nama bahan..." className="bg-transparent text-sm text-slate-300 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-2.5"><input type="text" value={row.warna} onChange={e => updateExtraMat(row.id, 'warna', e.target.value)} placeholder="Warna..." className="bg-transparent text-sm text-slate-300 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-2.5"><input type="number" min={0} placeholder="0" value={row.kuantitas || ''} onChange={e => updateExtraMat(row.id, 'kuantitas', Number(e.target.value) || 0)} className="no-spin bg-transparent text-sm text-slate-300 placeholder-slate-600 focus:outline-none w-16" /></td>
                  <td className="px-5 py-2.5">
                    <button onClick={() => setExtraMat(prev => prev.filter(r => r.id !== row.id))} className="text-slate-600 hover:text-red-400 transition-colors">{delIcon}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4">
          <button onClick={handleSimpan} disabled={saving} className="flex items-center gap-2 bg-blue-600/10 border border-blue-500/20 text-blue-400 text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-600/20 transition-colors disabled:opacity-50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══ Tab WO 3 — Detail Order Items ═══ */
function TabWO3({ wo, detailItems: initialItems, specs: propSpecs, specBahan: propSpecBahan }: { wo: Row; detailItems: Row[]; specs: Row[]; specBahan: Row[] }) {
  type ItemRow = { id: number; nama: string; np: string; ukuran: string; keterangan: string; penjahit: string; isNew?: boolean };
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [specs, setSpecs] = useState<Row[]>(propSpecs);
  const [specBahan, setSpecBahan] = useState<Row[]>(propSpecBahan);
  const toast = useToast();

  // Fetch fresh spec data so any changes in WO1 reflect here
  useEffect(() => {
    (async () => {
      try {
        const [s, sb] = await Promise.all([dbGet('wo_spesifikasi'), dbGet('wo_spesifikasi_bahan')]);
        setSpecs(s.filter((r: Row) => String(r.work_order_id) === String(wo.id)));
        setSpecBahan(sb);
      } catch {}
    })();
  }, [wo.id]);

  // Derive dynamic columns from WO1 spesifikasi bahan — one column per bagian
  const bagianCols = (() => {
    const specIds = new Set(specs.map(s => String(s.id)));
    const rel = specBahan.filter(b => specIds.has(String(b.spesifikasi_id)));
    const map = new Map<string, string[]>();
    for (const b of rel) {
      const bg = normBagian(b.bagian);
      const bh = String(b.bahan || '').trim();
      if (!bg) continue;
      if (!map.has(bg)) map.set(bg, []);
      const arr = map.get(bg)!;
      if (bh && !arr.includes(bh)) arr.push(bh);
    }
    const abbrev = (s: string) => s.split(/\s+/).map(w => w[0] || '').join('').toUpperCase();
    return Array.from(map.entries()).map(([bagian, bahans]) => ({
      bagian,
      header: abbrev(bagian),
      value: bahans.join(' / '),
    }));
  })();

  // Fetch fresh data from DB
  async function fetchItems() {
    setLoading(true);
    try {
      const all = await dbGet('wo_detail_items');
      const items = all.filter((r: Row) => String(r.work_order_id) === String(wo.id));
      if (items.length > 0) {
        setRows(items.map((r: Row) => ({ id: r.id, nama: r.nama || '', np: r.np || '', ukuran: r.ukuran || '', keterangan: r.keterangan || '', penjahit: r.kerah || '' })));
      } else {
        setRows(Array.from({ length: 5 }, (_, i) => ({ id: -(i + 1), nama: '', np: '', ukuran: '', keterangan: '', penjahit: '', isNew: true })));
      }
    } catch { setRows([]); }
    setLoading(false);
  }

  useEffect(() => { fetchItems(); }, []);

  function updateRow(id: number, field: keyof ItemRow, value: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>, rowId: number, field: keyof ItemRow) {
    const text = e.clipboardData.getData('text');
    if (!text) return;

    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length === 0) return;

    const parsed = lines.map(l => l.split('\t'));
    const maxCols = Math.max(...parsed.map(r => r.length));

    // Single cell paste → let default behavior fill the field normally
    if (lines.length === 1 && maxCols === 1) return;

    e.preventDefault();

    // Detect if first column is NO (all numeric) and should be skipped
    const firstColAllNum = parsed.every(r => /^\d+$/.test((r[0] || '').trim()));
    const startCol = firstColAllNum && maxCols >= 2 ? 1 : 0;

    // When pasting multiple columns, columns map to NAMA → NP → SIZE → KET
    // regardless of which field the user clicked into.
    // When pasting a single column, fill into the field the user clicked.
    const cols: (keyof ItemRow)[] = maxCols - startCol === 1
      ? [field]
      : ['nama', 'np', 'ukuran', 'keterangan'];

    const newData = parsed.map(r => {
      const data = r.slice(startCol).map(c => c.trim());
      const obj: Record<string, string> = {};
      for (let i = 0; i < cols.length && i < data.length; i++) {
        obj[cols[i] as string] = data[i];
      }
      return obj;
    });

    setRows(prev => {
      const startIdx = prev.findIndex(r => r.id === rowId);
      if (startIdx < 0) return prev;
      const next = [...prev];
      for (let i = 0; i < newData.length; i++) {
        const targetIdx = startIdx + i;
        if (targetIdx < next.length) {
          next[targetIdx] = { ...next[targetIdx], ...newData[i] };
        } else {
          next.push({
            id: -(Date.now() + i + 1),
            nama: '', np: '', ukuran: '', keterangan: '', penjahit: '',
            ...newData[i],
            isNew: true,
          } as ItemRow);
        }
      }
      return next;
    });

    toast.success('Paste Berhasil', `${newData.length} baris dimasukkan.`);
  }

  function addRow() {
    setRows(prev => [...prev, { id: -Date.now(), nama: '', np: '', ukuran: '', keterangan: '', penjahit: '', isNew: true }]);
  }

  const SIZE_ORDER: Record<string, number> = { 'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5, '2XL': 6, 'XXL': 6, '3XL': 7, 'XXXL': 7, '4XL': 8, '5XL': 9 };
  function sortBySize() {
    setRows(prev => [...prev].sort((a, b) => {
      const sa = SIZE_ORDER[a.ukuran.trim().toUpperCase()] ?? 99;
      const sb = SIZE_ORDER[b.ukuran.trim().toUpperCase()] ?? 99;
      return sa - sb;
    }));
  }

  function removeRow(id: number) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Delete all existing rows for this WO
      const existing = await dbGet('wo_detail_items');
      const oldRows = existing.filter((r: Row) => String(r.work_order_id) === String(wo.id));
      for (const old of oldRows) { await dbDelete('wo_detail_items', Number(old.id)); }
      // Insert all current rows
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.nama.trim() || r.np.trim() || r.ukuran.trim()) {
          await dbCreate('wo_detail_items', {
            work_order_id: wo.id, urutan: i + 1,
            nama: r.nama, np: r.np, ukuran: r.ukuran,
            keterangan: r.keterangan, kerah: r.penjahit,
          });
        }
      }
      toast.success('Data Tersimpan', `${rows.filter(r => r.nama.trim()).length} item berhasil disimpan.`);
      await fetchItems();
    } catch (e) { toast.error('Gagal Simpan', String(e)); }
    setSaving(false);
  }

  async function handleUploadExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const XLSX = (await import('xlsx-js-style')).default;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });

      // Prefer "Detail Order" sheet, otherwise first sheet
      const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('detail order')) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error('Sheet tidak ditemukan');

      const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });

      // Find header row (containing NAMA, NP, SIZE)
      let headerIdx = -1;
      const cols = { nama: -1, np: -1, size: -1, ket: -1 };
      for (let i = 0; i < Math.min(aoa.length, 30); i++) {
        const row = (aoa[i] || []).map(c => String(c ?? '').trim().toUpperCase());
        const namaCol = row.findIndex(c => c === 'NAMA');
        const npCol = row.findIndex(c => c === 'NP');
        const sizeCol = row.findIndex(c => c === 'SIZE');
        if (namaCol >= 0 && npCol >= 0 && sizeCol >= 0) {
          headerIdx = i;
          cols.nama = namaCol;
          cols.np = npCol;
          cols.size = sizeCol;
          cols.ket = row.findIndex(c => c === 'KET' || c === 'KETERANGAN');
          break;
        }
      }
      if (headerIdx < 0) {
        toast.error('Format Tidak Sesuai', 'Header NAMA / NP / SIZE tidak ditemukan di file.');
        return;
      }

      // Skip subheader row if it looks like one (mostly empty under NAMA/NP/SIZE)
      let startIdx = headerIdx + 1;
      const next = aoa[startIdx] || [];
      const nextNama = String(next[cols.nama] ?? '').trim();
      const nextNp = String(next[cols.np] ?? '').trim();
      const nextSize = String(next[cols.size] ?? '').trim();
      if (!nextNama && !nextNp && !nextSize && next.length > 0) startIdx++;

      const imported: ItemRow[] = [];
      for (let i = startIdx; i < aoa.length; i++) {
        const row = aoa[i] || [];
        const nama = String(row[cols.nama] ?? '').trim();
        const np = String(row[cols.np] ?? '').trim();
        const size = String(row[cols.size] ?? '').trim();
        const ket = cols.ket >= 0 ? String(row[cols.ket] ?? '').trim() : '';
        if (!nama && !np && !size && !ket) continue;
        imported.push({
          id: -(Date.now() + imported.length),
          nama, np, ukuran: size, keterangan: ket, penjahit: '', isNew: true,
        });
      }

      if (imported.length === 0) {
        toast.error('Data Kosong', 'Tidak ada baris data yang ditemukan di file.');
        return;
      }

      // If existing rows are all empty placeholders, replace them; otherwise append
      const allEmpty = rows.every(r => !r.nama.trim() && !r.np.trim() && !r.ukuran.trim() && !r.keterangan.trim() && !r.penjahit.trim());
      setRows(prev => allEmpty ? imported : [...prev, ...imported]);
      toast.success('Upload Berhasil', `${imported.length} baris dimuat. Klik Simpan Data untuk menyimpan.`);
    } catch (err) {
      toast.error('Gagal Upload', String(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Map normalized bagian → display label & optional sub-columns for PDF/Excel export
  const BAGIAN_CONFIG: Record<string, { label: string; subCols?: string[] }> = {
    'FRONT BODY': { label: 'BD' },
    'BACK BODY': { label: 'BB' },
    'COMBINATION': { label: 'VAR SAMPING', subCols: ['BD', 'BB'] },
    'SLEEVE': { label: 'LENGAN', subCols: ['KANAN', 'KIRI'] },
    'COLLAR': { label: 'KERAH' },
    'SLEEVE ENDS': { label: 'LIS LENGAN' },
    'SIDE PANTS STRIPE': { label: 'LIS CELANA' },
    'PANTS': { label: 'CELANA' },
  };

  // Build grouped header structure for bagian columns
  function buildBagianHeaders() {
    const topRow: Array<string | { content: string; colSpan?: number; rowSpan?: number }> = [];
    const subRow: string[] = [];
    const dataCols: number[] = []; // per bagian, how many data cells
    for (const col of bagianCols) {
      const cfg = BAGIAN_CONFIG[col.bagian] || { label: col.bagian };
      if (cfg.subCols && cfg.subCols.length > 0) {
        topRow.push({ content: cfg.label, colSpan: cfg.subCols.length });
        for (const sub of cfg.subCols) subRow.push(sub);
        dataCols.push(cfg.subCols.length);
      } else {
        topRow.push({ content: cfg.label, rowSpan: 2 });
        dataCols.push(1);
      }
    }
    return { topRow, subRow, dataCols };
  }

  async function handleExportExcel() {
    try {
      const XLSX = (await import('xlsx-js-style')).default;
      const { topRow, dataCols } = buildBagianHeaders();
      const totalBagianCells = dataCols.reduce((a, b) => a + b, 0);
      const totalCols = 5 + totalBagianCells + 1; // NO,NAMA,NP,SIZE,KET + bagian + PENJAHIT

      // Row 0: title (merged across all cols)
      // Row 1: customer (merged across all cols)
      // Row 2: blank spacer
      // Row 3: top header
      // Row 4: sub header
      // Row 5+: data rows
      const titleRow: (string | null)[] = [`DETAIL ORDER ITEMS — ${wo.noWo}`, ...Array(totalCols - 1).fill('')];
      const custRow: (string | null)[] = [`Customer: ${wo.customer}`, ...Array(totalCols - 1).fill('')];
      const spacerRow: string[] = Array(totalCols).fill('');

      const topHeader: string[] = ['NO', 'NAMA', 'NP', 'SIZE', 'KET'];
      const subHeader: string[] = ['', '', '', '', ''];
      for (const cell of topRow) {
        if (typeof cell === 'object' && cell.colSpan) {
          topHeader.push(cell.content);
          for (let i = 1; i < cell.colSpan; i++) topHeader.push('');
        } else {
          const txt = typeof cell === 'object' ? cell.content : cell;
          topHeader.push(txt);
        }
      }
      topHeader.push('PENJAHIT');

      for (const col of bagianCols) {
        const cfg = BAGIAN_CONFIG[col.bagian] || { label: col.bagian };
        if (cfg.subCols && cfg.subCols.length > 0) {
          for (const sub of cfg.subCols) subHeader.push(sub);
        } else {
          subHeader.push('');
        }
      }
      subHeader.push('');

      const dataRows = rows.map((r, i) => [
        i + 1, r.nama, r.np, r.ukuran, r.keterangan,
        ...Array(totalBagianCells).fill(''),
        r.penjahit,
      ]);

      const aoa: (string | number | null)[][] = [titleRow, custRow, spacerRow, topHeader, subHeader, ...dataRows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // Merges
      const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
      // Title & customer across all cols
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });
      merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } });
      // Fixed left header cols rowSpan=2 (rows 3-4)
      for (let c = 0; c < 5; c++) merges.push({ s: { r: 3, c }, e: { r: 4, c } });
      // PENJAHIT rowSpan=2
      const lastCol = 5 + totalBagianCells;
      merges.push({ s: { r: 3, c: lastCol }, e: { r: 4, c: lastCol } });
      // Grouped bagian headers
      let colOffset = 5;
      for (const col of bagianCols) {
        const cfg = BAGIAN_CONFIG[col.bagian] || { label: col.bagian };
        const span = cfg.subCols?.length || 1;
        if (cfg.subCols && cfg.subCols.length > 0) {
          merges.push({ s: { r: 3, c: colOffset }, e: { r: 3, c: colOffset + span - 1 } });
        } else {
          merges.push({ s: { r: 3, c: colOffset }, e: { r: 4, c: colOffset } });
        }
        colOffset += span;
      }
      ws['!merges'] = merges;

      ws['!cols'] = [
        { wch: 5 }, { wch: 22 }, { wch: 8 }, { wch: 8 }, { wch: 18 },
        ...Array(totalBagianCells).fill({ wch: 11 }),
        { wch: 20 },
      ];
      ws['!rows'] = [
        { hpt: 26 }, // title
        { hpt: 20 }, // customer
        { hpt: 8 },  // spacer
        { hpt: 22 }, // top header
        { hpt: 22 }, // sub header
        ...dataRows.map(() => ({ hpt: 20 })),
      ];

      // Styling
      const BORDER = { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } };
      const HEADER_FILL = { fgColor: { rgb: '1E3A5F' } };
      const HEADER_FONT = { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 };
      const HEADER_ALIGN = { horizontal: 'center', vertical: 'center', wrapText: true };

      const setCell = (addr: string, s: Record<string, unknown>) => {
        if (!ws[addr]) ws[addr] = { v: '', t: 's' };
        ws[addr].s = s;
      };

      // Title (row 0)
      setCell('A1', { font: { bold: true, sz: 14, color: { rgb: '1E3A5F' } }, alignment: { horizontal: 'left', vertical: 'center' } });
      // Customer (row 1)
      setCell('A2', { font: { bold: true, sz: 11, color: { rgb: '334155' } }, alignment: { horizontal: 'left', vertical: 'center' } });

      // Header rows (3 & 4, zero-indexed rows 3 & 4)
      for (let c = 0; c < totalCols; c++) {
        const addr3 = XLSX.utils.encode_cell({ r: 3, c });
        const addr4 = XLSX.utils.encode_cell({ r: 4, c });
        setCell(addr3, { fill: HEADER_FILL, font: HEADER_FONT, alignment: HEADER_ALIGN, border: BORDER });
        setCell(addr4, { fill: HEADER_FILL, font: HEADER_FONT, alignment: HEADER_ALIGN, border: BORDER });
      }

      // Data rows
      for (let r = 0; r < dataRows.length; r++) {
        const rowIdx = 5 + r;
        const stripe = r % 2 === 1 ? { fgColor: { rgb: 'F1F5F9' } } : undefined;
        for (let c = 0; c < totalCols; c++) {
          const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
          const isLeft = c === 1 || c === 4 || c === totalCols - 1; // NAMA, KET, PENJAHIT
          const align = { horizontal: isLeft ? 'left' : 'center', vertical: 'center', wrapText: true };
          const style: Record<string, unknown> = { border: BORDER, alignment: align, font: { sz: 10, color: { rgb: '1E293B' } } };
          if (stripe) style.fill = stripe;
          // NO column emphasis
          if (c === 0) style.font = { sz: 10, bold: true, color: { rgb: '2563EB' } };
          setCell(addr, style);
        }
      }

      // Freeze panes: first 5 rows
      ws['!freeze'] = { xSplit: 0, ySplit: 5 };
      ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 5 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Detail Order');
      XLSX.writeFile(wb, `Detail-Order-${wo.noWo}.xlsx`);
      toast.success('Export Berhasil', `Detail-Order-${wo.noWo}.xlsx`);
    } catch (e) { toast.error('Gagal Export', String(e)); }
  }

  async function handleDownloadPdfWO3() {
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const pdf = new jsPDF({ orientation: 'landscape' });
      pdf.setFontSize(14);
      pdf.text(`DETAIL ORDER ITEMS - ${wo.noWo}`, 14, 18);
      pdf.setFontSize(10);
      pdf.text(`Customer: ${wo.customer}`, 14, 26);

      const { topRow, subRow, dataCols } = buildBagianHeaders();
      const totalBagianCells = dataCols.reduce((a, b) => a + b, 0);
      const penjahitIdx = 5 + totalBagianCells;

      const headRow1: Array<string | { content: string; colSpan?: number; rowSpan?: number }> = [
        { content: 'NO', rowSpan: 2 },
        { content: 'NAMA', rowSpan: 2 },
        { content: 'NP', rowSpan: 2 },
        { content: 'SIZE', rowSpan: 2 },
        { content: 'KET', rowSpan: 2 },
        ...topRow,
        { content: 'PENJAHIT', rowSpan: 2 },
      ];
      const head = subRow.length > 0 ? [headRow1, subRow] : [headRow1];

      autoTable(pdf, {
        startY: 32,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        head: head as any,
        body: rows.map((r, i) => [
          i + 1, r.nama, r.np, r.ukuran, r.keterangan,
          ...Array(totalBagianCells).fill(''),
          r.penjahit,
        ]),
        styles: { fontSize: 7, cellPadding: 2, lineWidth: 0.3, lineColor: [0, 0, 0] },
        headStyles: { fillColor: [30, 58, 95], fontSize: 7, halign: 'center', valign: 'middle', lineWidth: 0.3, lineColor: [0, 0, 0] },
        bodyStyles: { halign: 'center' },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 28, halign: 'left' },
          2: { cellWidth: 12 },
          3: { cellWidth: 12 },
          4: { cellWidth: 20, halign: 'left' },
          [penjahitIdx]: { cellWidth: 22, halign: 'left' },
        },
      });
      pdf.save(`Detail-Order-${wo.noWo}.pdf`);
      toast.success('PDF Berhasil', `Detail-Order-${wo.noWo}.pdf`);
    } catch (e) { toast.error('Gagal Download PDF', String(e)); }
  }

  if (loading) return <div className="h-32 bg-white/[0.03] rounded-xl animate-pulse" />;

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-400">Customer: <strong className="text-white">{wo.customer}</strong></span>
        </div>
        <div className="text-lg font-bold text-white">DETAIL ORDER ITEMS</div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleUploadExcel}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Upload Excel hasil isian customer (kolom NAMA, NP, SIZE)"
            className="flex items-center gap-1.5 text-xs text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12m4.5-4.5v13.5" /></svg>
            {uploading ? 'Memproses...' : 'Upload Excel'}
          </button>
          <button onClick={handleExportExcel} className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">Export Excel</button>
          <button onClick={handleDownloadPdfWO3} className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">Download PDF</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
            {saving ? 'Menyimpan...' : 'Simpan Data'}
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead><tr className="border-b border-white/[0.06]">
              <th className="text-[11px] text-slate-500 font-medium text-left px-4 py-3 uppercase tracking-wider">NO</th>
              <th className="text-[11px] text-slate-500 font-medium text-left px-4 py-3 uppercase tracking-wider">NAMA</th>
              <th className="text-[11px] text-slate-500 font-medium text-left px-4 py-3 uppercase tracking-wider">NP</th>
              <th className="text-[11px] text-slate-500 font-medium text-left px-4 py-3 uppercase tracking-wider">
                <span className="flex items-center gap-1">
                  SIZE
                  <button onClick={sortBySize} className="text-amber-400 hover:text-amber-300 transition-colors" title="Sort by Size">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-4.5L16.5 16.5m0 0L12 12m4.5 4.5V3" /></svg>
                  </button>
                </span>
              </th>
              <th className="text-[11px] text-slate-500 font-medium text-left px-4 py-3 uppercase tracking-wider">KET</th>
              <th className="text-[11px] text-slate-500 font-medium text-left px-4 py-3 uppercase tracking-wider">PENJAHIT</th>
              <th className="text-[11px] text-slate-500 font-medium text-left px-4 py-3 uppercase tracking-wider"></th>
            </tr></thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-sm text-blue-400">{i + 1}</td>
                  <td className="px-4 py-3"><input value={p.nama} onChange={e => updateRow(p.id, 'nama', e.target.value)} onPaste={e => handlePaste(e, p.id, 'nama')} placeholder="Nama" className="bg-transparent text-sm text-emerald-400 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-4 py-3"><input value={p.np} onChange={e => updateRow(p.id, 'np', e.target.value)} onPaste={e => handlePaste(e, p.id, 'np')} placeholder="NP" className="bg-transparent text-sm text-slate-400 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-4 py-3"><input value={p.ukuran} onChange={e => updateRow(p.id, 'ukuran', e.target.value)} onPaste={e => handlePaste(e, p.id, 'ukuran')} placeholder="Size" className="bg-transparent text-sm font-bold text-white placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-4 py-3"><input value={p.keterangan} onChange={e => updateRow(p.id, 'keterangan', e.target.value)} onPaste={e => handlePaste(e, p.id, 'keterangan')} placeholder="Keterangan" className="bg-transparent text-sm text-slate-400 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-4 py-3"><input value={p.penjahit} onChange={e => updateRow(p.id, 'penjahit', e.target.value)} onPaste={e => handlePaste(e, p.id, 'penjahit')} placeholder="Penjahit" className="bg-transparent text-sm text-slate-500 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-4 py-3">
                    <button onClick={() => removeRow(p.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 flex items-center justify-between">
          <button onClick={addRow} className="flex items-center gap-2 border border-white/10 text-blue-400 text-sm font-medium px-4 py-2 rounded-lg hover:bg-white/[0.04] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Tambah Baris
          </button>
          <span className="text-xs text-slate-500">Total: {rows.length} items</span>
        </div>
      </div>
    </div>
  );
}

/* ═══ Tab WO 4 — Form Pengiriman ═══ */
function TabWO4({ wo }: { wo: Row; detailItems: Row[] }) {
  type ShipRow = { id: number; nama: string; np: string; ukuran: string; keterangan: string; bonus: string; checklist: boolean };
  const [rows, setRows] = useState<ShipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch WO3 items from DB
      const allItems = await dbGet('wo_detail_items');
      const wo3Items = allItems.filter((r: Row) => String(r.work_order_id) === String(wo.id));
      // Fetch existing WO4 pengiriman data
      const allShip = await dbGet('wo_pengiriman');
      const wo4Items = allShip.filter((r: Row) => String(r.work_order_id) === String(wo.id));

      if (wo3Items.length === 0) { setRows([]); setLoading(false); return; }

      // Build rows: merge WO3 data with existing WO4 bonus/checklist
      const shipMap: Record<string, Row> = {};
      for (const s of wo4Items) shipMap[String(s.urutan)] = s;

      setRows(wo3Items.map((item: Row, i: number) => {
        const existing = shipMap[String(i + 1)];
        return {
          id: item.id,
          nama: item.nama || '',
          np: item.np || '',
          ukuran: item.ukuran || '',
          keterangan: item.keterangan || '',
          bonus: existing?.bonus || '',
          checklist: existing?.checklist === 1 || existing?.checklist === true,
        };
      }));
    } catch { setRows([]); }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const SIZE_ORDER: Record<string, number> = { 'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5, '2XL': 6, 'XXL': 6, '3XL': 7, 'XXXL': 7, '4XL': 8, '5XL': 9 };
  function sortBySize() {
    setRows(prev => [...prev].sort((a, b) => {
      const sa = SIZE_ORDER[a.ukuran.trim().toUpperCase()] ?? 99;
      const sb = SIZE_ORDER[b.ukuran.trim().toUpperCase()] ?? 99;
      return sa - sb;
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Delete old wo_pengiriman rows
      const allShip = await dbGet('wo_pengiriman');
      const old = allShip.filter((r: Row) => String(r.work_order_id) === String(wo.id));
      for (const o of old) await dbDelete('wo_pengiriman', Number(o.id));
      // Insert new rows
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        await dbCreate('wo_pengiriman', {
          work_order_id: wo.id, detail_item_id: r.id, urutan: i + 1,
          nama: r.nama, np: r.np, ukuran: r.ukuran,
          keterangan: r.keterangan, bonus: r.bonus,
          checklist: r.checklist ? 1 : 0,
        });
      }
      toast.success('Tersimpan', 'Form pengiriman berhasil disimpan.');
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  async function handleDownloadPdf() {
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const pdf = new jsPDF('l', 'mm', 'a4');
      pdf.setFontSize(14);
      pdf.text(`FORM PENGIRIMAN ${wo.customer?.toUpperCase()} (${wo.paket})`, 14, 18);
      autoTable(pdf, {
        startY: 26,
        head: [['NO', 'NAMA', 'NP', 'SIZE', 'KET', 'BONUS', 'CHECK']],
        body: rows.map((r, i) => [i + 1, r.nama, r.np, r.ukuran, r.keterangan, r.bonus, r.checklist ? '✓' : '']),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 58, 95] },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const y = ((pdf as any).lastAutoTable?.finalY || 100) + 20;
      pdf.setFontSize(10);
      pdf.text('Dibuat Oleh,', 14, y);
      pdf.text('Dicek Oleh,', 85, y);
      pdf.text('Diterima Oleh,', 155, y);
      pdf.text('( Admin )', 14, y + 25);
      pdf.text('( QC / Packing )', 85, y + 25);
      pdf.text(`( ${wo.customer} )`, 155, y + 25);
      pdf.setFontSize(8);
      pdf.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID')}`, 155, y + 32);
      pdf.save(`Form-Pengiriman-${wo.noWo}.pdf`);
      toast.success('PDF Berhasil', `Form-Pengiriman-${wo.noWo}.pdf`);
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  function handleCetakForm() {
    const el = printRef.current;
    if (!el) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>Form Pengiriman</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:30px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:6px 10px;text-align:left;font-size:12px}th{background:#f0f0f0}input[type=checkbox]{width:16px;height:16px}.sig{display:flex;justify-content:space-between;margin-top:40px;font-size:12px}.sig div{text-align:center;width:30%}.sig div p:last-child{margin-top:50px;font-weight:bold}</style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.onload = () => { win.print(); };
  }

  if (loading) return <div className="h-32 bg-white/[0.03] rounded-xl animate-pulse" />;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] px-6 py-12 text-center">
        <p className="text-sm text-slate-400">Belum ada item detail (WO 3) untuk ditampilkan.</p>
        <p className="text-xs text-slate-500 mt-1">Silakan isi data di tab WO 3 terlebih dahulu.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white">Form Pengiriman</h2>
          <p className="text-xs text-slate-500 mt-0.5">Lengkapi checklist dan bonus item sebelum mencetak form.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
          <button onClick={handleDownloadPdf} className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            Download PDF
          </button>
          <button onClick={handleCetakForm} className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m0 0a48.159 48.159 0 018.5 0m-8.5 0V6.375c0-.621.504-1.125 1.125-1.125h6.75c.621 0 1.125.504 1.125 1.125v2.234" /></svg>
            Cetak Form
          </button>
        </div>
      </div>

      {/* Printable form */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div ref={printRef} className="bg-white text-black p-8 max-w-4xl mx-auto">
          <h3 className="text-base font-bold text-center mb-4">FORM PENGIRIMAN {wo.customer?.toUpperCase()} ({wo.paket})</h3>
          <table className="w-full border-collapse border border-black text-xs">
            <thead>
              <tr className="bg-slate-100">
                {['NO','NAMA','NP','SIZE','KET','BONUS','CHECKLIST'].map(h => (
                  <th key={h} className="border border-black px-3 py-2 text-left font-bold">
                    {h === 'SIZE' ? (
                      <span className="flex items-center gap-1">
                        {h}
                        <button onClick={sortBySize} className="text-amber-500 hover:text-amber-400 transition-colors print:hidden" title="Sort by Size">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-4.5L16.5 16.5m0 0L12 12m4.5 4.5V3" /></svg>
                        </button>
                      </span>
                    ) : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="border border-black px-3 py-2 text-blue-600 text-center">{i + 1}</td>
                  <td className="border border-black px-3 py-2">{r.nama}</td>
                  <td className="border border-black px-3 py-2">{r.np}</td>
                  <td className="border border-black px-3 py-2 text-center">{r.ukuran}</td>
                  <td className="border border-black px-3 py-2">{r.keterangan}</td>
                  <td className="border border-black px-3 py-2">
                    <input type="text" value={r.bonus} onChange={e => setRows(prev => prev.map(p => p.id === r.id ? { ...p, bonus: e.target.value } : p))} placeholder="Bonus..." className="w-full bg-transparent text-xs focus:outline-none" />
                  </td>
                  <td className="border border-black px-3 py-2 text-center">
                    <input type="checkbox" checked={r.checklist} onChange={e => setRows(prev => prev.map(p => p.id === r.id ? { ...p, checklist: e.target.checked } : p))} className="w-4 h-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Signature section */}
          <div className="flex justify-between mt-10 text-xs">
            <div className="text-center w-1/3">
              <p>Dibuat Oleh,</p>
              <div className="h-16" />
              <p className="font-bold">( Admin )</p>
            </div>
            <div className="text-center w-1/3">
              <p>Dicek Oleh,</p>
              <div className="h-16" />
              <p className="font-bold">( QC / Packing )</p>
            </div>
            <div className="text-center w-1/3">
              <p>Diterima Oleh,</p>
              <div className="h-16" />
              <p className="font-bold">( {wo.customer} )</p>
            </div>
          </div>
          <p className="text-right text-[10px] text-slate-400 mt-2 italic">Dicetak pada: {new Date().toLocaleDateString('id-ID')}</p>
        </div>
      </div>
    </div>
  );
}
