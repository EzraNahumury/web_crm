'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { useToast } from '@/lib/toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const PROD_STAGES = [
  'Proofing','Layout Printing','Approval Layout','Proses Printing','Sublim Press',
  'QC Panel','Potong Kain','QC Cutting','Jahit','QC Jersey','Finishing','Pengiriman',
];

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
      {tab === 'wo3' && <TabWO3 wo={woData} detailItems={detailItems} />}
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

        {/* Detail Bahan */}
        {detailBahan.length > 0 && (
          <div className="border-t border-white/[0.06] pt-4">
            <p className="text-[11px] text-blue-400 font-medium uppercase tracking-wider mb-3">DETAIL BAHAN</p>
            <div className="rounded-lg border border-white/[0.06] overflow-hidden">
              {detailBahan.map((d, idx) => (
                <div key={d.id} className={`flex items-center ${idx !== 0 ? 'border-t border-white/[0.06]' : ''}`}>
                  <span className="text-xs font-medium text-slate-400 w-[140px] shrink-0 px-3 py-2 bg-white/[0.02] uppercase">{d.bagian}</span>
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
    const desainImg = spec.dokumen_desain ? `<img src="${spec.dokumen_desain}" style="width:100%;height:100%;object-fit:cover;display:block"/>` : `<div style="height:100%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:12px">Desain</div>`;
    const patternImg = spec.dokumen_pattern ? `<img src="${spec.dokumen_pattern}" style="width:100%;height:100%;object-fit:cover;display:block"/>` : `<div style="height:100%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:12px">Pattern</div>`;
    // Style tokens
    const bdr = '#d1d5db';
    const B = `border:1px solid ${bdr};`;
    const hdr = `${B}background:#1e293b;color:#fff;font-weight:700;padding:1px 10px 11px;font-size:10px;text-align:center;vertical-align:middle;letter-spacing:0.3px;`;
    const lbl = `${B}font-weight:700;padding:1px 10px 11px;font-size:10px;background:#f8fafc;`;
    const val = `${B}padding:1px 10px 11px;font-size:10px;`;
    return `<div style="background:#fff;padding:32px 40px;font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1e293b;width:1200px;line-height:1.45;-webkit-font-smoothing:antialiased">
<!-- ═══ HEADER ═══ -->
<table style="width:100%;margin-bottom:18px"><tr>
  <td style="vertical-align:bottom">
    <div style="display:flex;align-items:center;gap:10px">
      <img src="${location.origin}/logo/new logo.png" style="height:26px" onerror="this.style.display='none'"/>
      <span style="font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">AYRES APPAREL</span>
    </div>
    <div style="height:2px;background:#1e293b;margin-top:10px"></div>
  </td>
  <td style="vertical-align:bottom;text-align:right;width:180px">
    <div style="font-size:8px;color:#64748b;font-weight:600;letter-spacing:1px;text-transform:uppercase">Work Order No.</div>
    <div style="font-size:17px;font-weight:800;color:#0f172a;border:2px solid #1e293b;padding:1px 18px 11px;display:inline-block;margin-top:4px">${wo.noWo}</div>
  </td>
</tr></table>

<!-- ═══ MAIN 2-COL ═══ -->
<table style="width:100%;border-collapse:separate;border-spacing:12px 0"><tr>

  <!-- LEFT 58% -->
  <td style="width:58%;vertical-align:top;padding:0">
    <div style="background:#1e293b;color:#fff;text-align:center;font-size:10px;font-weight:700;padding:1px 0 11px;letter-spacing:1.5px;text-transform:uppercase">Desain Mock Up & Pattern</div>
    <div style="display:flex;gap:8px;height:300px;margin-top:6px">
      <div style="flex:1;border:1px solid ${bdr};overflow:hidden">${desainImg}</div>
      <div style="flex:1;border:1px solid ${bdr};overflow:hidden">${patternImg}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:8px">
      <tr>
        <td style="${hdr}width:50%">Nama Customer</td>
        <td style="${hdr}">Nama Spesifikasi</td>
      </tr>
      <tr>
        <td style="${B}text-align:center;padding:1px 10px 11px;font-weight:600">${wo.customer}</td>
        <td style="${B}text-align:center;padding:1px 10px 11px;font-weight:600">${spec.nama_spesifikasi}</td>
      </tr>
    </table>
    <!-- Keterangan Jahit + Font & Number -->
    <table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin-top:8px"><tr>
      <td style="width:50%;vertical-align:top;padding:0">
        <div style="${B}overflow:hidden">
          <div style="padding:1px 10px 11px;font-weight:700;color:#dc2626;font-size:10px;letter-spacing:0.3px;border-bottom:1px solid ${bdr};background:#fef2f2;text-align:center">KETERANGAN JAHIT</div>
          <div style="padding:1px 10px 11px;font-size:10px">${spec.keterangan_jahit || '-'}</div>
        </div>
      </td>
      <td style="width:50%;vertical-align:top;padding:0">
        <div style="${B}overflow:hidden">
          <div style="background:#1e293b;color:#fff;font-weight:700;text-align:center;padding:1px 10px 11px;font-size:10px;letter-spacing:0.3px">FONT & NUMBER</div>
          <div style="padding:1px 10px 11px;font-size:10px">${spec.font_nomor || '-'}</div>
        </div>
      </td>
    </tr></table>
  </td>

  <!-- RIGHT 42% -->
  <td style="width:42%;vertical-align:top;padding:0">
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px">
      <tr><td style="${lbl}width:32%">NAMA</td><td style="${val}color:#dc2626;font-weight:600">${wo.customer}</td></tr>
      <tr><td style="${lbl}">PAKET</td><td style="${val}color:#dc2626;font-weight:600">${wo.paket}</td></tr>
      <tr><td style="${lbl}">JUMLAH</td><td style="${val}color:#dc2626;font-weight:600">${spec.jumlah || 0} PCS</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px">
      <tr><td colspan="2" style="${hdr}">Accessories</td></tr>
      ${acc.map(([k,v]) => `<tr><td style="${lbl}width:34%">${k}</td><td style="${val}">${v || '-'}</td></tr>`).join('')}
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:10px">
      <tr><td style="${hdr}">Penanggung Jawab</td></tr>
      <tr><td style="${B}padding:6px 10px">
        ${stages.map((s, i) => `<div style="border-bottom:1px solid ${bdr};padding:1px 0 11px;color:#2563eb;font-size:10px">${i+1}. ${s}</div>`).join('')}
      </td></tr>
    </table>
  </td>

</tr></table>


<!-- ═══ FOOTER ═══ -->
<table style="width:100%;border-collapse:separate;border-spacing:12px 0;margin-top:14px"><tr>
  <td style="vertical-align:top;width:30%;padding:0">
    ${bRows.length > 0 ? `<table style="width:100%;border-collapse:collapse;font-size:10px">
      ${bRows.map((r: Row) => `<tr><td style="${lbl}width:50%">${r.bagian}</td><td style="${val}color:#dc2626;font-weight:600">${r.bahan || '-'}</td></tr>`).join('')}
    </table>` : ''}
  </td>
  <td style="vertical-align:top;width:35%;padding:0">
    <table style="width:100%;border-collapse:collapse;font-size:10px">
      <tr><td style="${hdr}">APPROVAL ADMIN / DATA</td></tr>
      <tr><td style="${B}padding:1px 10px 11px;font-size:10px">${spec.approval_admin || '-'}</td></tr>
    </table>
  </td>
  <td style="vertical-align:top;width:35%;padding:0">
    <table style="width:100%;border-collapse:collapse;font-size:10px">
      <tr><td style="${hdr}">EXPORT & ICC</td></tr>
      <tr><td style="${B}padding:1px 10px 11px;font-size:10px">${spec.export_icc || '-'}</td></tr>
    </table>
  </td>
</tr></table>
</div>`;
  }

  async function handleDownloadPDF(specId: number) {
    const spec = specs.find((s: Row) => String(s.id) === String(specId));
    if (!spec) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;width:1200px;border:none';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument!;
      doc.open();
      doc.write(`<html><head><style>*{box-sizing:border-box;margin:0;padding:0;text-decoration:none!important;font-style:normal!important}body{background:#fff}</style></head><body>${buildSpecHtml(spec)}</body></html>`);
      doc.close();
      await new Promise(r => setTimeout(r, 1200));
      const canvas = await html2canvas(doc.body, { scale: 3, useCORS: true, backgroundColor: '#ffffff', windowWidth: 1200 });
      document.body.removeChild(iframe);
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = 210;
      const pageH = 297;
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
      setBahanRows(rows.length > 0 ? rows.map((b: Row) => ({ id: b.id, bagian: b.bagian, bahan: b.bahan })) : [{ id: 1, bagian: 'FRONT BODY', bahan: '' }]);
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
    // Re-fetch detail bahan from order
    if (wo.order_id) {
      dbGet('order_detail_bahan').then(all => {
        const rows = all.filter((d: Row) => String(d.order_id) === String(wo.order_id));
        setBahanRows(rows.length > 0 ? rows.map((d: Row, i: number) => ({ id: i + 1, bagian: d.bagian, bahan: d.bahan })) : [{ id: 1, bagian: 'FRONT BODY', bahan: '' }]);
      }).catch(() => setBahanRows([{ id: 1, bagian: 'FRONT BODY', bahan: '' }]));
    } else {
      setBahanRows([{ id: 1, bagian: 'FRONT BODY', bahan: '' }]);
    }
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
  const [bahanRows, setBahanRows] = useState([{ id: 1, bagian: 'FRONT BODY', bahan: '' }]);

  // Auto-fill detail bahan from order when opening create form
  useEffect(() => {
    if (createOpen && wo.order_id) {
      dbGet('order_detail_bahan').then(all => {
        const rows = all.filter((d: Row) => String(d.order_id) === String(wo.order_id));
        if (rows.length > 0) {
          setBahanRows(rows.map((d: Row, i: number) => ({ id: i + 1, bagian: d.bagian, bahan: d.bahan })));
        }
      }).catch(() => {});
    }
  }, [createOpen, wo.order_id]);

  async function handleUpload(file: File, setUrl: (url: string) => void, setLoading: (b: boolean) => void) {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.url) setUrl(data.url);
      else toast.error('Upload Gagal', data.error || 'Unknown error');
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
        deadline: wo.deadlineRaw || wo.deadline,
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
                    <div><label className={lCls}>Info Ukuran</label><select value={infoUkuran} onChange={e => setInfoUkuran(e.target.value)} className={sCls}><option value="">Pilih...</option><option>Ayres</option><option>polos</option><option>custom</option></select></div>
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
                      <input className={iCls} placeholder="Pilih atau ketik nama bahan" value={r.bahan} onChange={e => setBahanRows(prev => prev.map(p => p.id === r.id ? { ...p, bahan: e.target.value } : p))} />
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
                    <div><label className={lCls}>Info Ukuran</label><select value={infoUkuran} onChange={e => setInfoUkuran(e.target.value)} className={sCls}><option value="">Pilih...</option><option>Ayres</option><option>polos</option><option>custom</option></select></div>
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
                      <input className={`${iCls} flex-1`} placeholder="Nama bahan" value={r.bahan} onChange={e => setBahanRows(prev => prev.map(p => p.id === r.id ? { ...p, bahan: e.target.value } : p))} />
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
          <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 border border-white/10 hover:bg-white/[0.04] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
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
                            <span className="font-bold px-2 py-1 border-r border-black">{b.bagian}</span>
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
  const [extraAks, setExtraAks] = useState<{ id: number }[]>([]);
  const [extraMat, setExtraMat] = useState<{ id: number }[]>([{ id: 1 }]);
  const [liveSpecs, setLiveSpecs] = useState(propSpecs);
  const [liveSpecBahan, setLiveSpecBahan] = useState(propSpecBahan);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const delIcon = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>;

  // Fetch fresh data from DB on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, sb] = await Promise.all([dbGet('wo_spesifikasi'), dbGet('wo_spesifikasi_bahan')]);
        setLiveSpecs(s.filter((r: Row) => String(r.work_order_id) === String(wo.id)));
        setLiveSpecBahan(sb);
      } catch {}
      setLoading(false);
    })();
  }, [wo.id]);

  // Auto-generate from WO1 specs
  const bahanUtama: { bagian: string; bahan: string }[] = [];
  const aksesorisRows: { bagian: string; bahan: string }[] = [];
  for (const spec of liveSpecs) {
    const rows = liveSpecBahan.filter((b: Row) => String(b.spesifikasi_id) === String(spec.id));
    for (const r of rows) bahanUtama.push({ bagian: r.bagian, bahan: r.bahan || '-' });
    if (spec.tagline) aksesorisRows.push({ bagian: 'Tagline', bahan: spec.tagline });
    if (spec.authentic) aksesorisRows.push({ bagian: 'Keaslian', bahan: spec.authentic });
    if (spec.info_ukuran) aksesorisRows.push({ bagian: 'Info Ukuran', bahan: spec.info_ukuran });
    if (spec.info_logo) aksesorisRows.push({ bagian: 'Info Logo', bahan: spec.info_logo });
    if (spec.info_packing) aksesorisRows.push({ bagian: 'Info Packing', bahan: spec.info_packing });
    if (spec.webbing) aksesorisRows.push({ bagian: 'Webbing', bahan: spec.webbing });
    if (spec.font_nomor) aksesorisRows.push({ bagian: 'Font & Nomor', bahan: spec.font_nomor });
  }
  const totalAuto = bahanUtama.length + aksesorisRows.length;
  const hasData = liveSpecs.length > 0;

  // Also include saved gudang items that were manually added
  const savedGudang = gudangItems.filter((r: Row) => r.kategori === 'MATERIAL_TAMBAHAN');

  async function handleSimpan() {
    try {
      toast.success('Disimpan', 'Data permintaan gudang berhasil disimpan.');
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  async function handleDownloadPdfWO2() {
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const pdf = new jsPDF();
      pdf.setFontSize(14);
      pdf.text(`FORM PERMINTAAN GUDANG - ${wo.customer?.toUpperCase()}`, 14, 18);
      pdf.setFontSize(10);
      pdf.text(`No WO: ${wo.noWo}`, 14, 26);

      const allRows: string[][] = [];
      let no = 1;
      // Bahan utama
      for (const r of bahanUtama) {
        allRows.push([String(no++), r.bagian, r.bahan, '', '0']);
      }
      // Aksesoris
      if (aksesorisRows.length > 0) {
        allRows.push([{ content: 'AKSESORIS', colSpan: 5, styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } } as unknown as string]);
        for (const r of aksesorisRows) {
          allRows.push([String(no++), r.bagian, r.bahan, '', '0']);
        }
      }

      autoTable(pdf, {
        startY: 32,
        head: [['NO', 'BAGIAN', 'BAHAN', 'WARNA', 'KUANTITAS']],
        body: allRows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 58, 95] },
      });
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
              {bahanUtama.map((r, i) => (
                <tr key={`bu-${i}`} className="border-b border-white/[0.04]">
                  <td className="px-5 py-3.5 text-sm text-blue-400">{i + 1}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-emerald-400">{r.bagian}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-white">{r.bahan}</td>
                  <td className="px-5 py-3.5"><input type="text" placeholder="Warna..." className="bg-transparent text-sm text-slate-500 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-3.5"><input type="number" defaultValue={0} className="bg-transparent text-sm text-slate-400 focus:outline-none w-16" /></td>
                  <td className="px-5 py-3.5" />
                </tr>
              ))}

              {/* Aksesoris separator */}
              {hasData && (
                <tr><td colSpan={6} className="px-5 py-3 text-center border-b border-white/[0.06]">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">AKSESORIS</span>
                  <button onClick={() => setExtraAks(prev => [...prev, { id: Date.now() }])}
                    className="text-xs text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded hover:bg-blue-500/10 transition-colors">+ Tambah</button>
                </td></tr>
              )}

              {/* Aksesoris auto-generated from WO1 spec fields */}
              {aksesorisRows.map((r, i) => (
                <tr key={`ak-${i}`} className="border-b border-white/[0.04]">
                  <td className="px-5 py-3.5 text-sm text-blue-400">{bahanUtama.length + i + 1}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-emerald-400">{r.bagian}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-white">{r.bahan}</td>
                  <td className="px-5 py-3.5"><input type="text" placeholder="Warna..." className="bg-transparent text-sm text-slate-500 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-3.5"><input type="number" defaultValue={0} className="bg-transparent text-sm text-slate-400 focus:outline-none w-16" /></td>
                  <td className="px-5 py-3.5" />
                </tr>
              ))}

              {/* Aksesoris tambahan (editable) */}
              {extraAks.map((row, i) => (
                <tr key={`ea-${row.id}`} className="border-b border-white/[0.04] bg-white/[0.01]">
                  <td className="px-5 py-2.5 text-sm text-blue-400 align-middle">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5" />
                    {bahanUtama.length + aksesorisRows.length + i + 1}
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

              {/* Saved material tambahan */}
              {savedGudang.map((r, i) => (
                <tr key={`sg-${i}`} className="border-b border-white/[0.04]">
                  <td className="px-5 py-3.5 text-sm text-blue-400">{totalAuto + extraAks.length + i + 1}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-emerald-400">{r.bagian}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-white">{r.bahan}</td>
                  <td className="px-5 py-3.5"><input type="text" defaultValue={r.warna || ''} placeholder="Warna..." className="bg-transparent text-sm text-slate-500 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-5 py-3.5"><input type="number" defaultValue={r.kuantitas || 0} className="bg-transparent text-sm text-slate-400 focus:outline-none w-16" /></td>
                  <td className="px-5 py-3.5" />
                </tr>
              ))}

              {/* Material tambahan rows (editable) */}
              {extraMat.map((row, i) => (
                <tr key={`em-${row.id}`} className="border-b border-white/[0.04] bg-white/[0.01]">
                  <td className="px-5 py-2.5 text-sm text-blue-400 align-middle">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5" />
                    {totalAuto + extraAks.length + savedGudang.length + i + 1}
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
          <button onClick={handleSimpan} className="flex items-center gap-2 bg-blue-600/10 border border-blue-500/20 text-blue-400 text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-600/20 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══ Tab WO 3 — Detail Order Items ═══ */
function TabWO3({ wo, detailItems: initialItems }: { wo: Row; detailItems: Row[] }) {
  type ItemRow = { id: number; nama: string; np: string; ukuran: string; keterangan: string; penjahit: string; isNew?: boolean };
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

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

  async function handleExportExcel() {
    try {
      const XLSX = await import('xlsx');
      const header1 = ['NO', 'NAMA', 'NP', 'SIZE', 'KET', 'BD', 'BB', 'VAR SAMPING', '', 'LENGAN', '', 'KERAH', 'TAGLINE', 'LIS CELANA', 'PENJAHIT'];
      const header2 = ['', '', '', '', '', '', '', 'BD', 'BB', 'KANAN', 'KIRI', '', '', '', ''];
      const data = rows.map((r, i) => [
        i + 1, r.nama, r.np, r.ukuran, r.keterangan,
        '', '', '', '', '', '', '', '', '', r.penjahit,
      ]);
      const ws = XLSX.utils.aoa_to_sheet([header1, header2, ...data]);
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },  // NO
        { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },  // NAMA
        { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },  // NP
        { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },  // SIZE
        { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } },  // KET
        { s: { r: 0, c: 5 }, e: { r: 1, c: 5 } },  // BD
        { s: { r: 0, c: 6 }, e: { r: 1, c: 6 } },  // BB
        { s: { r: 0, c: 7 }, e: { r: 0, c: 8 } },  // VAR SAMPING
        { s: { r: 0, c: 9 }, e: { r: 0, c: 10 } }, // LENGAN
        { s: { r: 0, c: 11 }, e: { r: 1, c: 11 } }, // KERAH
        { s: { r: 0, c: 12 }, e: { r: 1, c: 12 } }, // TAGLINE
        { s: { r: 0, c: 13 }, e: { r: 1, c: 13 } }, // LIS CELANA
        { s: { r: 0, c: 14 }, e: { r: 1, c: 14 } }, // PENJAHIT
      ];
      ws['!cols'] = [
        { wch: 5 }, { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 15 },
        { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
        { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 18 },
      ];
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
      autoTable(pdf, {
        startY: 32,
        head: [[
          { content: 'NO', rowSpan: 2 },
          { content: 'NAMA', rowSpan: 2 },
          { content: 'NP', rowSpan: 2 },
          { content: 'SIZE', rowSpan: 2 },
          { content: 'KET', rowSpan: 2 },
          { content: 'BD', rowSpan: 2 },
          { content: 'BB', rowSpan: 2 },
          { content: 'VAR SAMPING', colSpan: 2 },
          { content: 'LENGAN', colSpan: 2 },
          { content: 'KERAH', rowSpan: 2 },
          { content: 'TAGLINE', rowSpan: 2 },
          { content: 'LIS CELANA', rowSpan: 2 },
          { content: 'PENJAHIT', rowSpan: 2 },
        ], [
          'BD', 'BB', 'KANAN', 'KIRI',
        ]],
        body: rows.map((r, i) => [
          i + 1, r.nama, r.np, r.ukuran, r.keterangan,
          '', '', '', '', '', '', '', '', r.penjahit,
        ]),
        styles: { fontSize: 7, cellPadding: 2, lineWidth: 0.3, lineColor: [0, 0, 0] },
        headStyles: { fillColor: [30, 58, 95], fontSize: 7, halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0] },
        bodyStyles: { halign: 'center' },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 28, halign: 'left' },
          2: { cellWidth: 12 },
          3: { cellWidth: 12 },
          4: { cellWidth: 25, halign: 'left' },
          13: { cellWidth: 25, halign: 'left' },
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
              {['NO','NAMA','NP','SIZE','KET','PENJAHIT',''].map(h => (
                <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-4 py-3 uppercase tracking-wider">
                  {h === 'SIZE' ? (
                    <span className="flex items-center gap-1">
                      {h}
                      <button onClick={sortBySize} className="text-amber-400 hover:text-amber-300 transition-colors" title="Sort by Size">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-4.5L16.5 16.5m0 0L12 12m4.5 4.5V3" /></svg>
                      </button>
                    </span>
                  ) : h}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-sm text-blue-400">{i + 1}</td>
                  <td className="px-4 py-3"><input value={p.nama} onChange={e => updateRow(p.id, 'nama', e.target.value)} placeholder="Nama" className="bg-transparent text-sm text-emerald-400 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-4 py-3"><input value={p.np} onChange={e => updateRow(p.id, 'np', e.target.value)} placeholder="NP" className="bg-transparent text-sm text-slate-400 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-4 py-3"><input value={p.ukuran} onChange={e => updateRow(p.id, 'ukuran', e.target.value)} placeholder="Size" className="bg-transparent text-sm font-bold text-white placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-4 py-3"><input value={p.keterangan} onChange={e => updateRow(p.id, 'keterangan', e.target.value)} placeholder="Keterangan" className="bg-transparent text-sm text-slate-400 placeholder-slate-600 focus:outline-none w-full" /></td>
                  <td className="px-4 py-3"><input value={p.penjahit} onChange={e => updateRow(p.id, 'penjahit', e.target.value)} placeholder="Penjahit" className="bg-transparent text-sm text-slate-500 placeholder-slate-600 focus:outline-none w-full" /></td>
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
      const pdf = new jsPDF();
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
