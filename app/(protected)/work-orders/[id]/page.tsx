'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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

// 14 stages sesuai template Excel AYRES APPAREL (image #454). Dipakai
// untuk form input Penanggung Jawab per stage di WO1 dan render di
// spec card sidebar kanan.
const WO_PJ_STAGES = [
  'Approval Design', 'Approval Pattern', 'Proofing',
  'Printing Layout', 'Approval Layout', 'Printing Process',
  'Sublim Press', 'QC panel Process', 'Fabric Cutting',
  'QC Cutting', 'Sewing', 'QC Jersey', 'Finishing', 'Shipment',
];

const pjKey = (stage: string) => stage.toLowerCase().replace(/\s+/g, '_');
function emptyPj(): Record<string, string> {
  const o: Record<string, string> = {};
  for (const s of WO_PJ_STAGES) o[pjKey(s)] = '';
  return o;
}
function parsePj(json: string | null | undefined): Record<string, string> {
  if (!json) return emptyPj();
  try {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    const merged = emptyPj();
    for (const k of Object.keys(merged)) {
      if (parsed && typeof parsed[k] === 'string') merged[k] = parsed[k];
    }
    return merged;
  } catch { return emptyPj(); }
}

// Section bahan body — 8 baris fixed sesuai template Excel AYRES.
const WO_BAHAN_ROWS = [
  'FRONT BODY', 'BACK BODY', 'SLEEVE', 'COMBINATION',
  'COLLAR', 'SLEEVE ENDS', 'SIDE PANTS STRIPE', 'PANTS',
];

// Module-level — used by per-spec PDF download (TabWO1) and combined Download All PDF (parent).
function buildWoSpecHtml(spec: Row, wo: Row, allSpecBahan: Row[]) {
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

  const td = `border:1px solid ${BORDER};padding:0;height:${ROW_H}px;`;
  const flexL = `display:flex;align-items:center;height:${ROW_H}px;padding:0 12px;line-height:1.2;`;
  const flexC = `display:flex;align-items:center;justify-content:center;height:${ROW_H}px;padding:0 12px;line-height:1.2;`;
  const HDR = (txt: string, extraTd = '') => `<td style="${td}background:${PRIMARY};${extraTd}"><div style="${flexC}color:#fff;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase">${txt}</div></td>`;
  const LBL = (txt: string, extraTd = '') => `<td style="${td}background:${SOFT};${extraTd}"><div style="${flexL}color:${PRIMARY};font-size:11px;font-weight:700">${txt}</div></td>`;
  const VAL = (txt: string, extraTd = '', innerExtra = '') => `<td style="${td}${extraTd}"><div style="${flexL}color:${PRIMARY};font-size:11px;${innerExtra}">${txt}</div></td>`;
  const VALc = (txt: string, extraTd = '', innerExtra = '') => `<td style="${td}${extraTd}"><div style="${flexC}color:${PRIMARY};font-size:11px;${innerExtra}">${txt}</div></td>`;

  return `<div style="background:#fff;padding:30px 36px;font-family:Arial,Helvetica,sans-serif;color:${PRIMARY};width:1400px;-webkit-font-smoothing:antialiased">
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
<table style="width:100%;border-collapse:separate;border-spacing:14px 0"><tr>
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
    <table style="width:100%;border-collapse:separate;border-spacing:10px 0;margin-top:10px"><tr>
      <td style="width:50%;vertical-align:top;padding:0">
        <div style="border:1px solid ${BORDER};overflow:hidden">
          <div style="height:${ROW_H}px;display:flex;align-items:center;justify-content:center;color:${ACCENT};font-size:11px;font-weight:700;letter-spacing:0.6px;background:#fef2f2;border-bottom:1px solid ${BORDER};text-transform:uppercase">Keterangan Jahit</div>
          <div style="min-height:160px;padding:8px 12px;font-size:11px;line-height:1.4;color:${PRIMARY}"></div>
        </div>
      </td>
      <td style="width:50%;vertical-align:top;padding:0">
        <div style="border:1px solid ${BORDER};overflow:hidden">
          <div style="height:${ROW_H}px;display:flex;align-items:center;justify-content:center;background:${PRIMARY};color:#fff;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase">Font &amp; Number</div>
          <div style="min-height:160px;padding:8px 12px;font-size:11px;line-height:1.4;color:${PRIMARY}">${spec.font_nomor || '-'}</div>
        </div>
      </td>
    </tr></table>
  </td>
  <td style="width:40%;vertical-align:top;padding:0">
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
      <tr>${LBL('NAMA', 'width:32%')}${VAL(wo.customer, '', `color:${ACCENT};font-weight:700`)}</tr>
      <tr>${LBL('PAKET')}${VAL(spec.paket || wo.paket, '', `color:${ACCENT};font-weight:700`)}</tr>
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
<div style="margin-top:18px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#94a3b8">
  <div>Ayres Apparel &middot; Lembar Spesifikasi Produksi</div>
  <div>Dicetak: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
</div>
</div>`;
}

// For legacy specs uploaded before server-side rasterization existed:
// trigger the conversion on view, save the resulting pages back to the spec,
// then display them. Shows a loading state until conversion finishes.
function LazyPdfPagesViewer({ fileUrl, spec }: { fileUrl: string; spec: Row }) {
  const initial = (() => {
    try {
      const raw = spec.imported_file_pages;
      if (typeof raw === 'string' && raw.trim()) return JSON.parse(raw) as string[];
      if (Array.isArray(raw)) return raw as string[];
    } catch {}
    return [] as string[];
  })();
  const [pages, setPages] = useState<string[]>(initial);
  const [tried, setTried] = useState(initial.length > 0);

  useEffect(() => {
    if (tried || pages.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/rasterize-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: fileUrl }),
        });
        const json = await res.json();
        if (cancelled) return;
        const newPages: string[] = Array.isArray(json.pages) ? json.pages : [];
        if (newPages.length > 0) {
          setPages(newPages);
          try {
            await dbUpdate('wo_spesifikasi', Number(spec.id), { imported_file_pages: JSON.stringify(newPages) });
          } catch {}
        }
      } catch {}
      if (!cancelled) setTried(true);
    })();
    return () => { cancelled = true; };
  }, [tried, pages.length, fileUrl, spec.id]);

  if (pages.length > 0) {
    return <PdfImagesViewer pages={pages} />;
  }
  if (!tried) {
    return (
      <div className="bg-white mt-4 max-w-5xl mx-auto py-12 text-center text-slate-500 text-sm">
        Menyiapkan preview...
      </div>
    );
  }
  return (
    <div className="bg-white mt-4 max-w-5xl mx-auto py-12 text-center text-slate-600 text-sm">
      Preview tidak tersedia. Klik <strong>Download File</strong> untuk membuka PDF aslinya.
    </div>
  );
}

// Picks the right viewer (PDF images, Excel HTML, or fallback) based on the
// imported file's extension. For PDFs that haven't been rasterized yet, lazily
// trigger /api/rasterize-pdf so we still end up with PNG pages.
function ImportContentViewer({ fileUrl, fileName, pages, onPagesUpdated }: {
  fileUrl: string; fileName: string; pages: string[]; rowId: number;
  onPagesUpdated: (pages: string[]) => Promise<void> | void;
}) {
  const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] || fileUrl.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  const [livePages, setLivePages] = useState<string[]>(pages);
  const [tried, setTried] = useState(pages.length > 0);

  useEffect(() => { setLivePages(pages); setTried(pages.length > 0); }, [pages]);

  useEffect(() => {
    if (ext !== 'pdf') return;
    if (tried || livePages.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/rasterize-pdf', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: fileUrl }),
        });
        const json = await res.json();
        if (cancelled) return;
        const np: string[] = Array.isArray(json.pages) ? json.pages : [];
        if (np.length > 0) {
          setLivePages(np);
          await onPagesUpdated(np);
        }
      } catch {}
      if (!cancelled) setTried(true);
    })();
    return () => { cancelled = true; };
  }, [ext, tried, livePages.length, fileUrl, onPagesUpdated]);

  if (livePages.length > 0) {
    return <PdfImagesViewer pages={livePages} />;
  }
  if (ext === 'xlsx' || ext === 'xls') {
    // Prefer Microsoft Office Online viewer in production (renders embedded
    // images identically to Excel). Falls back to inline ExcelViewer on
    // localhost (Microsoft can't reach a local URL) and for data: URLs.
    if (
      typeof window !== 'undefined'
      && !/^(localhost|127\.|0\.0\.0\.0|::1|\[::1\])/.test(window.location.hostname)
      && !fileUrl.startsWith('data:')
    ) {
      return <OfficeOnlineExcelViewer fileUrl={fileUrl} />;
    }
    return <ExcelViewer fileUrl={fileUrl} fileName={fileName} />;
  }
  if (ext === 'pdf' && !tried) {
    return <div className="bg-white mt-4 max-w-5xl mx-auto py-12 text-center text-slate-500 text-sm">Menyiapkan preview...</div>;
  }
  return (
    <div className="bg-white mt-4 max-w-5xl mx-auto py-12 text-center text-slate-600 text-sm">
      Preview tidak tersedia. Klik <strong>Download File</strong> untuk membuka file aslinya.
    </div>
  );
}

// Microsoft Office Online embed — full-fidelity Excel rendering with embedded
// images, served by Microsoft. Requires the file URL to be publicly reachable
// (the MS viewer fetches the file from the internet), so we only use it on
// production. The file is hosted under /uploads/ which Next.js serves
// publicly.
function OfficeOnlineExcelViewer({ fileUrl }: { fileUrl: string }) {
  const [absoluteUrl, setAbsoluteUrl] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (fileUrl.startsWith('http')) setAbsoluteUrl(fileUrl);
    else if (fileUrl.startsWith('/')) setAbsoluteUrl(`${window.location.origin}${fileUrl}`);
    else setAbsoluteUrl(fileUrl);
  }, [fileUrl]);

  if (!absoluteUrl) {
    return <div className="bg-white mt-4 max-w-6xl mx-auto py-12 text-center text-slate-500 text-sm">Memuat preview...</div>;
  }

  const embedSrc = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteUrl)}`;

  return (
    <div className="bg-white mt-4 max-w-6xl mx-auto">
      <iframe
        src={embedSrc}
        width="100%"
        height="800"
        style={{ border: 0, display: 'block', minHeight: 720 }}
        className="w-full"
        title="Excel Preview"
      />
    </div>
  );
}

// Excel viewer — renders the first sheet of an .xlsx as a styled HTML table
// using SheetJS. Used when server-side rasterization isn't available.
type Overlay = {
  url: string;
  tlRow: number; tlCol: number; tlOffX: number; tlOffY: number;
  brRow?: number; brCol?: number; brOffX?: number; brOffY?: number;
  extW: number; extH: number;
};
type ResolvedOverlay = { url: string; left: number; top: number; width: number; height: number };

function ExcelViewer({ fileUrl, fileName }: { fileUrl: string; fileName: string }) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [resolved, setResolved] = useState<ResolvedOverlay[]>([]);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch file once
        let buf: ArrayBuffer;
        if (fileUrl.startsWith('data:')) {
          const base64 = fileUrl.split(',').pop() || '';
          const bin = atob(base64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          buf = arr.buffer;
        } else {
          const res = await fetch(fileUrl);
          buf = await res.arrayBuffer();
        }

        const sheetTarget = fileName.replace(/\.(xlsx|xls)$/i, '');

        // Read column widths + row heights + images FIRST via ExcelJS (more
        // reliable than SheetJS for these fields — SheetJS often drops `!cols`
        // when files come from non-Excel writers).
        const colWidthsFromXljs: Record<number, number> = {};
        const rowHeightsFromXljs: Record<number, number> = {};
        const overlaysList: Overlay[] = [];
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ExcelJS = (await import('exceljs')).default as any;
          const wb2 = new ExcelJS.Workbook();
          await wb2.xlsx.load(buf);
          const ws2 = wb2.getWorksheet(sheetTarget) || wb2.worksheets[0];
          if (ws2) {
            const colCount = Math.max(ws2.columnCount || 0, 30);
            const rowCount = Math.max(ws2.rowCount || 0, 30);
            for (let c = 1; c <= colCount + 5; c++) {
              const col = ws2.getColumn(c);
              const cw = col?.width as number | undefined;
              if (cw != null) {
                // Excel pixel width formula: round(width * 7 + 5) for Calibri 11pt.
                colWidthsFromXljs[c - 1] = Math.max(2, Math.round(cw * 7 + 5));
              }
            }
            for (let r = 1; r <= rowCount + 5; r++) {
              const row = ws2.getRow(r);
              const rh = row?.height as number | undefined;
              if (rh != null) {
                // Points → pixels (1 pt = 1.333 px at 96 dpi).
                rowHeightsFromXljs[r - 1] = Math.max(2, Math.round(rh * 1.333));
              }
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const images: any[] = ws2.getImages ? ws2.getImages() : [];
            for (const img of images) {
              const data = wb2.getImage(img.imageId);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const raw: any = data.buffer;
              const bytes = raw instanceof Uint8Array
                ? raw
                : raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(0);
              const arr = new Uint8Array(bytes.byteLength);
              arr.set(bytes);
              const blob = new Blob([arr.buffer], { type: `image/${data.extension || 'png'}` });
              const url = URL.createObjectURL(blob);
              objectUrls.current.push(url);
              const tl = img.range?.tl;
              const br = img.range?.br;
              if (!tl) continue;
              overlaysList.push({
                url,
                tlRow: tl.row, tlCol: tl.col,
                tlOffX: (tl.nativeColOff || 0) / 9525,
                tlOffY: (tl.nativeRowOff || 0) / 9525,
                brRow: br?.row ?? tl.row + 1,
                brCol: br?.col ?? tl.col + 1,
                brOffX: (br?.nativeColOff || 0) / 9525,
                brOffY: (br?.nativeRowOff || 0) / 9525,
                extW: (img.range?.ext?.width || 0) / 9525,
                extH: (img.range?.ext?.height || 0) / 9525,
              });
            }
          }
        } catch (e) {
          console.warn('Excel image extraction failed:', e);
        }

        // Now render cells via SheetJS, using ExcelJS widths/heights when present.
        const XLSX = (await import('xlsx-js-style')).default;
        const wb = XLSX.read(buf, { type: 'array', cellStyles: true });
        const wsName = wb.SheetNames.includes(sheetTarget) ? sheetTarget : wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        if (!ws) { if (!cancelled) setError('Sheet kosong'); return; }
        if (!cancelled) {
          setHtml(renderExcelSheet(XLSX, ws, colWidthsFromXljs, rowHeightsFromXljs));
          setOverlays(overlaysList);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
      objectUrls.current.forEach(u => URL.revokeObjectURL(u));
      objectUrls.current = [];
    };
  }, [fileUrl, fileName]);

  // After the table HTML is in the DOM, build per-row / per-column cumulative
  // offsets from the actual rendered grid. Using <col> and <tr> bounds avoids
  // the merge-cell problem where cellAt() returns the merged region's rect
  // instead of the specific (row,col) position — that bug made image overlays
  // collapse to thin strips when their anchor pointed into a merged area.
  useEffect(() => {
    if (!html || overlays.length === 0) return;
    const compute = () => {
      const root = tableWrapRef.current;
      if (!root) return;
      const tableEl = root.querySelector('table');
      if (!tableEl) return;
      const tableRect = tableEl.getBoundingClientRect();

      // Column boundaries from <colgroup><col style="width:Xpx"> — fixed-layout
      // tables honor these exactly.
      const cumColLeft: number[] = [0];
      const cols = tableEl.querySelectorAll('colgroup col');
      let cx = 0;
      cols.forEach((col) => {
        const w = parseFloat((col as HTMLElement).style.width) || 80;
        cx += w;
        cumColLeft.push(cx);
      });

      // Row boundaries from actual <tr> bounding rects — handles auto-sized
      // rows correctly. Empty rows that collapse to 0 height fall back to
      // the declared style height.
      const cumRowTop: number[] = [0];
      const trs = tableEl.querySelectorAll('tr');
      const tableTop = tableRect.top;
      let lastBottom = 0;
      trs.forEach((tr) => {
        const trEl = tr as HTMLElement;
        const r = trEl.getBoundingClientRect();
        let h = r.height;
        if (!h) {
          const styled = parseFloat(trEl.style.height);
          if (!Number.isNaN(styled) && styled > 0) h = styled;
        }
        const top = r.top - tableTop;
        // Some empty rows report top=0 — only use measured top when reasonable.
        if (top > lastBottom - 1 && top < lastBottom + 5000) {
          cumRowTop.push(top + h);
        } else {
          cumRowTop.push(lastBottom + h);
        }
        lastBottom = cumRowTop[cumRowTop.length - 1];
      });

      const colLeftAt = (c: number) => cumColLeft[Math.max(0, Math.min(c, cumColLeft.length - 1))] || 0;
      const rowTopAt = (r: number) => cumRowTop[Math.max(0, Math.min(r, cumRowTop.length - 1))] || 0;

      const out: ResolvedOverlay[] = [];
      for (const ov of overlays) {
        const left = colLeftAt(ov.tlCol) + ov.tlOffX;
        const top = rowTopAt(ov.tlRow) + ov.tlOffY;
        let right: number, bottom: number;
        if (ov.brRow != null && ov.brCol != null) {
          right = colLeftAt(ov.brCol) + (ov.brOffX || 0);
          bottom = rowTopAt(ov.brRow) + (ov.brOffY || 0);
        } else if (ov.extW && ov.extH) {
          right = left + ov.extW;
          bottom = top + ov.extH;
        } else {
          right = left + 100;
          bottom = top + 100;
        }
        out.push({
          url: ov.url,
          left,
          top,
          width: Math.max(1, right - left),
          height: Math.max(1, bottom - top),
        });
      }
      setResolved(out);
    };
    // Two RAFs — first to paint, second to allow image-induced reflow.
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => compute());
      (window as unknown as { __raf2?: number }).__raf2 = raf2;
    });
    const onResize = () => compute();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf1);
      const w = window as unknown as { __raf2?: number };
      if (w.__raf2) cancelAnimationFrame(w.__raf2);
      window.removeEventListener('resize', onResize);
    };
  }, [html, overlays]);

  if (error) {
    return (
      <div className="bg-white rounded-lg p-6 max-w-4xl mx-auto mt-4 text-center text-red-600 text-sm">
        Gagal menampilkan Excel: {error}
      </div>
    );
  }

  return (
    <div className="bg-white mt-4 max-w-6xl mx-auto p-4 overflow-x-auto">
      {html ? (
        <div ref={tableWrapRef} className="text-xs relative inline-block">
          <div dangerouslySetInnerHTML={{ __html: html }} />
          {resolved.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={img.url}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                left: `${img.left}px`,
                top: `${img.top}px`,
                width: `${img.width}px`,
                height: `${img.height}px`,
                pointerEvents: 'none',
                objectFit: 'fill',
              }}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500 text-center py-8">Memuat preview {fileName}...</p>
      )}
    </div>
  );
}

function renderExcelSheet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  XLSX: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
  externalColWidths?: Record<number, number>,
  externalRowHeights?: Record<number, number>,
): string {
  const ref = ws['!ref'];
  if (!ref) return '';
  const range = XLSX.utils.decode_range(ref);
  const cols: { wch?: number; wpx?: number }[] = ws['!cols'] || [];
  const rows: { hpt?: number; hpx?: number }[] = ws['!rows'] || [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = ws['!merges'] || [];

  const skip = new Set<string>();
  const mergeAt = new Map<string, { rowSpan: number; colSpan: number }>();
  for (const m of merges) {
    mergeAt.set(`${m.s.r},${m.s.c}`, { rowSpan: m.e.r - m.s.r + 1, colSpan: m.e.c - m.s.c + 1 });
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        skip.add(`${r},${c}`);
      }
    }
  }

  // Trim trailing rows that have no cell objects at all (preserves rows that
  // are empty but still styled / bordered — common in Excel form layouts).
  let lastRow = range.s.r;
  for (let r = range.e.r; r >= range.s.r; r--) {
    let any = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell !== undefined) { any = true; break; }
    }
    if (any) { lastRow = r; break; }
  }

  const colWpx = (i: number) => {
    if (externalColWidths && externalColWidths[i] != null) return externalColWidths[i];
    const c = cols[i];
    if (c?.wpx) return c.wpx;
    if (c?.wch) return Math.round(c.wch * 7.5);
    return 80;
  };
  const rowHpx = (i: number): number => {
    if (externalRowHeights && externalRowHeights[i] != null) return externalRowHeights[i];
    if (rows[i]?.hpx) return rows[i].hpx!;
    if (rows[i]?.hpt) return Math.round(rows[i].hpt! * 1.33);
    return 20; // Excel default row height in px (~15pt) — always set so empty rows reserve vertical space for image overlays.
  };

  const isLight = (rgb: string) => {
    const r = parseInt(rgb.slice(0, 2), 16);
    const g = parseInt(rgb.slice(2, 4), 16);
    const b = parseInt(rgb.slice(4, 6), 16);
    return (r + g + b) / 3 > 200;
  };
  const isWhiteish = (rgb: string) => {
    const r = parseInt(rgb.slice(0, 2), 16);
    const g = parseInt(rgb.slice(2, 4), 16);
    const b = parseInt(rgb.slice(4, 6), 16);
    return r > 240 && g > 240 && b > 240;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const styleFor = (cell: any): string => {
    if (!cell?.s) return 'color:#0f172a';
    const s = cell.s;
    const out: string[] = [];
    if (s.font?.bold) out.push('font-weight:700');
    if (s.font?.italic) out.push('font-style:italic');
    const fontRgb: string | undefined = s.font?.color?.rgb;
    if (fontRgb && !isLight(fontRgb)) out.push(`color:#${fontRgb}`);
    else out.push('color:#0f172a');
    if (s.font?.sz) out.push(`font-size:${Math.round(Number(s.font.sz))}px`);
    // Background fills — skip near-white so we don't paint over the page bg.
    const bgRgb: string | undefined = s.fill?.fgColor?.rgb;
    if (bgRgb && !isWhiteish(bgRgb)) out.push(`background:#${bgRgb}`);
    if (s.alignment?.horizontal) out.push(`text-align:${s.alignment.horizontal}`);
    const vmap: Record<string, string> = { center: 'middle', top: 'top', bottom: 'bottom' };
    if (s.alignment?.vertical) out.push(`vertical-align:${vmap[s.alignment.vertical] || s.alignment.vertical}`);
    if (s.alignment?.wrapText) out.push('white-space:normal;word-break:break-word');
    return out.join(';');
  };

  let html = '<table style="border-collapse:collapse;table-layout:fixed;font-family:Arial,Helvetica,sans-serif;background:#fff;margin:0 auto;font-size:12px"><colgroup>';
  for (let c = range.s.c; c <= range.e.c; c++) html += `<col style="width:${colWpx(c)}px">`;
  html += '</colgroup>';

  for (let r = range.s.r; r <= lastRow; r++) {
    const hpx = rowHpx(r);
    html += `<tr style="height:${hpx}px">`;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const key = `${r},${c}`;
      if (skip.has(key) && !mergeAt.has(key)) continue;
      const merge = mergeAt.get(key);
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const rs = merge ? ` rowspan="${merge.rowSpan}"` : '';
      const cs = merge ? ` colspan="${merge.colSpan}"` : '';
      const value = cell?.w ?? (cell?.v ?? '');
      const userStyle = styleFor(cell);
      // Solid black borders to match the look of Excel print preview.
      const baseStyle = 'border:1px solid #1f2937;padding:4px 8px;font-size:12px;vertical-align:middle;overflow:hidden;text-align:center';
      html += `<td data-r="${r}" data-c="${c}"${rs}${cs} style="${baseStyle};${userStyle}">${String(value).replace(/</g, '&lt;')}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

// Block Ctrl+Scroll zoom and touchscreen pinch-zoom inside the spec viewer.
function PdfImagesViewer({ pages }: { pages: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    const onGesture = (e: Event) => e.preventDefault();
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGesture);
    el.addEventListener('gesturechange', onGesture);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGesture);
      el.removeEventListener('gesturechange', onGesture);
    };
  }, []);
  return (
    <div
      ref={ref}
      className="bg-white mt-4 max-w-5xl mx-auto"
      style={{ touchAction: 'pan-x pan-y' }}
    >
      {pages.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt={`Halaman ${i + 1}`}
          className="block w-full bg-white select-none"
          draggable={false}
        />
      ))}
    </div>
  );
}

// PDF preview SmallPDF-style: pages are rasterized server-side (pdf-to-img),
// then shown as static images in white cards on a light gray surface.
// Falls back to a clean iframe if the server-side rasterization is missing.
function PdfPagesViewer({ fileUrl, pages }: { fileUrl: string; pages?: string[] }) {
  if (pages && pages.length > 0) {
    return <PdfImagesViewer pages={pages} />;
  }
  // Fallback: legacy specs without rasterized pages, or rasterization failed.
  const src = `${fileUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
  return (
    <div className="bg-white mt-4 max-w-5xl mx-auto">
      <iframe src={src} title="Spec PDF" className="block w-full" style={{ border: 'none', height: '90vh', background: '#fff' }} />
    </div>
  );
}

// Spec card for imported (Excel / PDF) specs — embeds PDF via pdf.js canvas
// rendering or renders an Excel sheet via SheetJS sheet_to_html.
function ImportedSpecViewer({ spec }: { spec: Row }) {
  const fileUrl = String(spec.imported_file || '');
  const fileName = String(spec.imported_file_name || spec.nama_spesifikasi || '');
  const initialPages = (() => {
    try {
      const raw = spec.imported_file_pages;
      if (typeof raw === 'string' && raw.trim()) return JSON.parse(raw) as string[];
      if (Array.isArray(raw)) return raw as string[];
    } catch {}
    return [] as string[];
  })();
  return (
    <ImportContentViewer
      fileUrl={fileUrl}
      fileName={fileName}
      pages={initialPages}
      rowId={Number(spec.id)}
      onPagesUpdated={async (newPages) => {
        try {
          await dbUpdate('wo_spesifikasi', Number(spec.id), { imported_file_pages: JSON.stringify(newPages) });
        } catch {}
      }}
    />
  );
}

// Render an HTML string into an off-screen iframe and capture as canvas.
async function renderHtmlToImage(html: string, width = 1400): Promise<{ data: string; w: number; h: number }> {
  const html2canvas = (await import('html2canvas')).default;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `position:fixed;left:-9999px;width:${width}px;border:none`;
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<html><head><style>*{box-sizing:border-box;margin:0;padding:0;text-decoration:none!important;font-style:normal!important}body{background:#fff}</style></head><body>${html}</body></html>`);
  doc.close();
  await new Promise(r => setTimeout(r, 1000));
  const canvas = await html2canvas(doc.body, { scale: 2.5, useCORS: true, backgroundColor: '#ffffff', windowWidth: width });
  document.body.removeChild(iframe);
  return { data: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
}

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
  const [downloadingAll, setDownloadingAll] = useState(false);
  const toast = useToast();

  const [importingMaster, setImportingMaster] = useState(false);
  const masterFileRef = useRef<HTMLInputElement>(null);

  async function handleImportMaster(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !wo) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File Terlalu Besar', 'Maksimum 50MB.');
      if (masterFileRef.current) masterFileRef.current.value = '';
      return;
    }
    setImportingMaster(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('work_order_id', String(wo.id));
      const res = await fetch('/api/wo-import-master', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Import gagal');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = Array.isArray(json.results) ? json.results : [];
      const wo1 = results.filter(r => r.target === 'wo1').length;
      const wo2 = results.filter(r => r.target === 'wo2').length;
      const wo3 = results.filter(r => r.target === 'wo3').length;
      const wo4 = results.filter(r => r.target === 'wo4').length;
      toast.success('Import Berhasil', `WO 1: ${wo1} spec • WO 2: ${wo2} • WO 3: ${wo3} • WO 4: ${wo4}`);
      window.location.reload();
    } catch (err) {
      toast.error('Gagal Import', String(err));
    } finally {
      setImportingMaster(false);
      if (masterFileRef.current) masterFileRef.current.value = '';
    }
  }

  const [deletingAll, setDeletingAll] = useState(false);

  async function handleDeleteAllImports() {
    if (!wo) return;
    const yes = await toast.confirm({
      title: 'Hapus Semua Import?',
      message: 'Semua file di WO 1 - WO 4 akan dihapus. Aksi ini tidak bisa dibatalkan.',
      type: 'danger',
      confirmText: 'Ya, Hapus Semua',
    });
    if (!yes) return;
    setDeletingAll(true);
    try {
      const [specs, sections] = await Promise.all([
        dbGet<Row>('wo_spesifikasi', undefined, { work_order_id: wo.id }),
        dbGet<Row>('wo_section_imports', undefined, { work_order_id: wo.id }),
      ]);
      const importedSpecs = specs.filter((s: Row) => s.imported_file);
      await Promise.all([
        ...importedSpecs.map((s: Row) => dbDelete('wo_spesifikasi', Number(s.id))),
        ...sections.map((s: Row) => dbDelete('wo_section_imports', Number(s.id))),
        dbUpdate('work_orders', Number(wo.id), { master_import_file: null, master_import_file_name: null }),
      ]);
      toast.deleted('Dihapus', `${importedSpecs.length + sections.length} file dihapus dari WO 1 - WO 4.`);
      window.location.reload();
    } catch (e) {
      toast.error('Gagal Hapus', String(e));
    } finally {
      setDeletingAll(false);
    }
  }

  useEffect(() => {
    (async () => {
      const woId = params.id;
      try {
        // Fetch the WO first (single-row, fast) so we know its order_id
        const wos = await dbGet<Row>('work_orders', undefined, { id: woId as string });
        const found = wos[0];
        if (!found) { setLoading(false); return; }

        // Fan out all related fetches in parallel using server-side filters.
        // wo_spesifikasi_bahan can only be filtered by spesifikasi_id, so it's
        // fetched after specs in a follow-up parallel step.
        const [orders, orderItemsArr, gudang, detail, specRows] = await Promise.all([
          dbGet<Row>('orders', undefined, { id: found.order_id as number }),
          dbGet<Row>('order_items', undefined, { order_id: found.order_id as number }),
          dbGet<Row>('wo_permintaan_gudang', undefined, { work_order_id: found.id as number }),
          dbGet<Row>('wo_detail_items', undefined, { work_order_id: found.id as number }),
          dbGet<Row>('wo_spesifikasi', undefined, { work_order_id: found.id as number }),
        ]);

        const ord = orders[0] || null;
        setOrder(ord);
        if (orderItemsArr.length > 0) {
          found.paket = orderItemsArr.map((i: Row) => String(i.paket_nama || '')).filter(Boolean).join(', ') || found.paket;
          found.bahan = orderItemsArr.map((i: Row) => String(i.bahan_kain || '')).filter(Boolean).join(', ') || found.bahan;
        }
        setWo(found);
        setGudangItems(gudang);
        setDetailItems(detail);
        setSpecs(specRows);

        // Fetch spec_bahan for the specs we just found (filtered per spec_id, then merged).
        if (specRows.length > 0) {
          const bahanBatches = await Promise.all(
            specRows.map((s: Row) => dbGet('wo_spesifikasi_bahan', undefined, { spesifikasi_id: s.id }))
          );
          setSpecBahan(bahanBatches.flat());
        } else {
          setSpecBahan([]);
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

  async function handleDownloadAllPDF() {
    if (!wo) return;
    setDownloadingAll(true);
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      // Refetch fresh data so unsaved-then-saved changes show up immediately
      const [freshSpecs, freshSpecBahan, freshGudang, freshShip, freshUkuran, freshWoArr] = await Promise.all([
        dbGet('wo_spesifikasi').then(all => all.filter((r: Row) => String(r.work_order_id) === String(wo.id))).catch(() => specs),
        dbGet('wo_spesifikasi_bahan').catch(() => specBahan),
        dbGet('wo_permintaan_gudang').then(all => all.filter((r: Row) => String(r.work_order_id) === String(wo.id))).catch(() => gudangItems),
        dbGet('wo_pengiriman').then(all => all.filter((r: Row) => String(r.work_order_id) === String(wo.id))).catch(() => []),
        dbGet('wo_ukuran_tim').then(all => all.filter((r: Row) => String(r.work_order_id) === String(wo.id))).catch(() => []),
        dbGet('work_orders', undefined, { id: wo.id }).catch(() => []),
      ]);
      const freshWoData = (freshWoArr as Row[])[0] || {};

      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageW = 297, pageH = 210, margin = 5;
      let firstPage = true;

      const woName = wo.no_wo;
      const customer = wo.customer_nama || '';
      const paket = wo.paket || '';

      // === WO 1: Spec sheets (image-based, one page per spec) ===
      for (const spec of freshSpecs) {
        if (!firstPage) pdf.addPage();
        firstPage = false;
        const html = buildWoSpecHtml(spec, woData, freshSpecBahan);
        const { data: imgData, w, h } = await renderHtmlToImage(html, 1400);
        const contentW = pageW - margin * 2;
        const imgRatio = h / w;
        const contentH = Math.min(contentW * imgRatio, pageH - margin * 2);
        pdf.addImage(imgData, 'PNG', margin, margin, contentW, contentH);
      }

      // === WO 2: Detail Ukuran Tim ===
      if (freshUkuran.length > 0) {
        if (!firstPage) pdf.addPage();
        firstPage = false;
        pdf.setFontSize(14);
        pdf.text(`DETAIL UKURAN TIM - ${customer.toUpperCase()}`, 14, 18);
        pdf.setFontSize(10);
        pdf.text(`No WO: ${woName}`, 14, 26);

        // Load kolom config dari work_orders (atau default).
        const kolom = parseWo2Kolom(freshWoData.wo2_kolom_json as string);
        const hasGrpChildren = kolom.some((k: Wo2Col) => k.children && k.children.length > 0);
        // Build head — row 1 parent, row 2 children (kalau ada grouped).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const headRow1: any[] = [{ content: 'NO', rowSpan: hasGrpChildren ? 2 : 1 }];
        const headRow2: string[] = [];
        for (const k of kolom) {
          if (k.children && k.children.length > 0) {
            headRow1.push({ content: k.label, colSpan: k.children.length });
            for (const c of k.children) headRow2.push(c.label);
          } else {
            headRow1.push({ content: k.label, rowSpan: hasGrpChildren ? 2 : 1 });
          }
        }
        const head = hasGrpChildren ? [headRow1, headRow2] : [headRow1];
        // Flatten leaf keys (id) untuk map value per row.
        const leafIds: string[] = [];
        for (const k of kolom) {
          if (k.children && k.children.length > 0) for (const c of k.children) leafIds.push(c.id);
          else leafIds.push(k.id);
        }
        const body = freshUkuran.sort((a: Row, b: Row) => Number(a.urutan) - Number(b.urutan)).map((r: Row, i: number) => {
          let dj: Record<string, string> = {};
          if (r.data_json) { try { dj = JSON.parse(String(r.data_json)) || {}; } catch {} }
          // Merge legacy + data_json (data_json wins).
          const legacy: Record<string, string> = {
            nama: String(r.nama || ''), np: String(r.np || ''), size: String(r.size || ''),
            ket1: String(r.ket1 || ''), ket2: String(r.ket2 || ''),
            bd: String(r.bd || ''), bb: String(r.bb || ''),
            lengan_kanan: String(r.lengan_kanan || ''), lengan_kiri: String(r.lengan_kiri || ''),
            lis_lengan_kanan: String(r.lis_lengan_kanan || ''), lis_lengan_kiri: String(r.lis_lengan_kiri || ''),
            var_kerah: String(r.var_kerah || ''), kerah: String(r.kerah || ''),
            penjahit: String(r.penjahit || ''),
          };
          const merged = { ...legacy, ...dj };
          return [String(i + 1), ...leafIds.map(k => merged[k] || '')];
        });
        autoTable(pdf, {
          startY: 32,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          head: head as any,
          body,
          styles: { fontSize: 8, cellPadding: 2, lineWidth: 0.3, lineColor: [0, 0, 0] },
          headStyles: { fillColor: [6, 95, 70], halign: 'center', valign: 'middle', textColor: 255, lineWidth: 0.3, lineColor: [0, 0, 0] },
          bodyStyles: { halign: 'center' },
        });
      }

      // === WO 3 LEGACY (dead code — WO3 sekarang Form Pengiriman, handled below).
      // Block ini di-disable via `false` supaya kompilasi tetap jalan tanpa
      // dead-code warning, sekaligus jaga logic legacy kalau nanti perlu
      // di-restore. Bisa dihapus setelah verifikasi produksi.
      if (false as boolean) {
        const freshDetail: Row[] = [];
        // Build bagian columns from spec_bahan
        const specIdSet = new Set(freshSpecs.map((s: Row) => String(s.id)));
        const rel = freshSpecBahan.filter((b: Row) => specIdSet.has(String(b.spesifikasi_id)));
        const bagianMap = new Map<string, string[]>();
        for (const b of rel) {
          const bg = normBagian(b.bagian);
          const bh = String(b.bahan || '').trim();
          if (!bg) continue;
          if (!bagianMap.has(bg)) bagianMap.set(bg, []);
          const arr = bagianMap.get(bg)!;
          if (bh && !arr.includes(bh)) arr.push(bh);
        }
        const rawBagianList = Array.from(bagianMap.keys());

        const parsedRows = freshDetail.map((item: Row) => ({
          nama: item.nama || '',
          np: item.np || '',
          ukuran: item.ukuran || '',
          kets: parseKets(item.keterangan),
          penjahit: item.kerah || '',
        }));

        // Read user customizations from localStorage (set by TabWO3)
        let ketNamesMap: Record<number, string> = {};
        let savedColOrder: string[] = [];
        let savedHiddenBagians: string[] = [];
        let savedCustomParents: { id: string; parent: string; subs: [string, string] }[] = [];
        try {
          const raw = localStorage.getItem(`wo3_ket_names_${wo.id}`);
          if (raw) ketNamesMap = JSON.parse(raw);
        } catch {}
        try {
          const raw = localStorage.getItem(`wo3_col_order_${wo.id}`);
          if (raw) savedColOrder = JSON.parse(raw);
        } catch {}
        try {
          const raw = localStorage.getItem(`wo3_hidden_bagians_${wo.id}`);
          if (raw) savedHiddenBagians = JSON.parse(raw);
        } catch {}
        try {
          const raw = localStorage.getItem(`wo3_custom_parents_${wo.id}`);
          if (raw) savedCustomParents = JSON.parse(raw);
        } catch {}
        const hiddenBagianSet = new Set(savedHiddenBagians);
        const visibleBagianList = rawBagianList.filter(b => !hiddenBagianSet.has(b));
        const parentMapP = new Map(savedCustomParents.map(p => [p.id, p]));

        const ketNameKeys = Object.keys(ketNamesMap).map(Number).filter(n => !isNaN(n));
        const fromNames = ketNameKeys.length > 0 ? Math.max(...ketNameKeys) + 1 : 1;
        const fromRows = Math.max(1, ...parsedRows.map(r => r.kets.length));
        const numKetCols = Math.max(fromRows, fromNames);
        const ketName = (i: number) => i === 0 ? 'KET' : (ketNamesMap[i] ?? 'unknown');

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

        // Build the unified effective column list (KET 2+, bagian, parent), respecting savedColOrder
        type ColRefP =
          | { kind: 'ket'; idx: number }
          | { kind: 'bagian'; bagian: string }
          | { kind: 'parent'; id: string };
        const naturalCols: ColRefP[] = [
          ...Array.from({ length: numKetCols }, (_, i) => i).filter(i => i > 0).map(i => ({ kind: 'ket' as const, idx: i })),
          ...visibleBagianList.map(b => ({ kind: 'bagian' as const, bagian: b })),
          ...savedCustomParents.map(p => ({ kind: 'parent' as const, id: p.id })),
        ];
        const keyOfP = (r: ColRefP): string => {
          if (r.kind === 'ket') return `ket:${r.idx}`;
          if (r.kind === 'bagian') return `bagian:${r.bagian}`;
          return `parent:${r.id}`;
        };
        const effective: ColRefP[] = savedColOrder.length === 0
          ? naturalCols
          : (() => {
              const ordMap = new Map(savedColOrder.map((k, i) => [k, i]));
              return naturalCols.slice().sort((a, b) => (ordMap.get(keyOfP(a)) ?? Number.MAX_SAFE_INTEGER) - (ordMap.get(keyOfP(b)) ?? Number.MAX_SAFE_INTEGER));
            })();

        // Build head/body in effective order
        const headTop: Array<string | { content: string; colSpan?: number; rowSpan?: number }> = [
          { content: 'NO', rowSpan: 2 },
          { content: 'NAMA', rowSpan: 2 },
          { content: 'NP', rowSpan: 2 },
          { content: 'SIZE', rowSpan: 2 },
          { content: 'KET', rowSpan: 2 },
        ];
        const headSub: string[] = [];
        let dataCount = 0;
        let hasSubRow = false;
        for (const ref of effective) {
          if (ref.kind === 'ket') {
            headTop.push({ content: ketName(ref.idx), rowSpan: 2 });
            dataCount += 1;
          } else if (ref.kind === 'parent') {
            const p = parentMapP.get(ref.id);
            const label = p?.parent || 'PARENT';
            const subs = p?.subs || ['', ''];
            headTop.push({ content: label, colSpan: 2 });
            headSub.push(subs[0], subs[1]);
            dataCount += 2;
            hasSubRow = true;
          } else {
            const cfg = BAGIAN_CONFIG[ref.bagian] || { label: ref.bagian };
            if (cfg.subCols && cfg.subCols.length > 0) {
              headTop.push({ content: cfg.label, colSpan: cfg.subCols.length });
              for (const sub of cfg.subCols) headSub.push(sub);
              dataCount += cfg.subCols.length;
              hasSubRow = true;
            } else {
              headTop.push({ content: cfg.label, rowSpan: 2 });
              dataCount += 1;
            }
          }
        }
        headTop.push({ content: 'PENJAHIT', rowSpan: 2 });
        const head = hasSubRow ? [headTop, headSub] : [headTop];
        const fixedLeft = 5;
        const penjahitIdx = fixedLeft + dataCount;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const columnStyles: Record<number, any> = {
          0: { cellWidth: 10 },
          1: { cellWidth: 28, halign: 'left' },
          2: { cellWidth: 12 },
          3: { cellWidth: 12 },
          4: { cellWidth: 20, halign: 'left' },
          [penjahitIdx]: { cellWidth: 22, halign: 'left' },
        };
        {
          let idx = fixedLeft;
          for (const ref of effective) {
            if (ref.kind === 'ket') {
              columnStyles[idx] = { cellWidth: 20, halign: 'left' };
              idx += 1;
            } else if (ref.kind === 'parent') {
              idx += 2;
            } else {
              const cfg = BAGIAN_CONFIG[ref.bagian] || { label: ref.bagian };
              idx += cfg.subCols?.length || 1;
            }
          }
        }

        autoTable(pdf, {
          startY: 32,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          head: head as any,
          body: parsedRows.map((r, i) => {
            const cells: (string | number)[] = [
              i + 1, r.nama, r.np, r.ukuran, r.kets[0] ?? '',
            ];
            for (const ref of effective) {
              if (ref.kind === 'ket') {
                cells.push(r.kets[ref.idx] ?? '');
              } else if (ref.kind === 'parent') {
                cells.push('', '');
              } else {
                const cfg = BAGIAN_CONFIG[ref.bagian] || { label: ref.bagian };
                const count = cfg.subCols?.length || 1;
                for (let j = 0; j < count; j++) cells.push('');
              }
            }
            cells.push(r.penjahit);
            return cells;
          }),
          styles: { fontSize: 7, cellPadding: 2, lineWidth: 0.3, lineColor: [0, 0, 0] },
          headStyles: { fillColor: [30, 58, 95], fontSize: 7, halign: 'center', valign: 'middle', lineWidth: 0.3, lineColor: [0, 0, 0] },
          bodyStyles: { halign: 'center' },
          columnStyles,
        });
      }

      // === WO 3: Form Pengiriman + PROMO/BONUS ===
      if (freshShip.length > 0 || freshWoData.pengiriman_promo || freshWoData.pengiriman_bonus) {
        if (!firstPage) pdf.addPage();
        firstPage = false;
        pdf.setFontSize(14);
        pdf.text(`FORM PENGIRIMAN - ${customer.toUpperCase()}`, 14, 18);
        pdf.setFontSize(10);
        pdf.text(`No WO: ${woName} · Paket: ${paket}`, 14, 26);

        autoTable(pdf, {
          startY: 32,
          head: [['NO', 'NAMA', 'NP', 'SIZE', 'KET', 'CHECK']],
          body: freshShip.sort((a: Row, b: Row) => Number(a.urutan) - Number(b.urutan)).map((r: Row, i: number) => [
            String(i + 1),
            String(r.nama || ''),
            String(r.np || ''),
            String(r.ukuran || ''),
            String(r.keterangan || ''),
            (r.checklist === 1 || r.checklist === true) ? 'v' : '',
          ]),
          styles: { fontSize: 9, cellPadding: 2, lineWidth: 0.3, lineColor: [0, 0, 0] },
          headStyles: { fillColor: [6, 95, 70], textColor: 255, halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0] },
          bodyStyles: { halign: 'center' },
          columnStyles: { 1: { halign: 'left' }, 4: { halign: 'left' } },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let curY = ((pdf as any).lastAutoTable?.finalY || 40) + 8;
        // PROMO + BONUS boxes side by side (di bawah tabel).
        const promo = String(freshWoData.pengiriman_promo || '');
        const bonus = String(freshWoData.pengiriman_bonus || '');
        if (promo || bonus) {
          const boxW = (pageW - margin * 2 - 4) / 2;
          const boxH = 40;
          // PROMO
          pdf.setFillColor(59, 130, 246);
          pdf.rect(margin, curY, boxW, 7, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(10);
          pdf.text('PROMO', margin + boxW / 2, curY + 5, { align: 'center' });
          pdf.setDrawColor(0);
          pdf.rect(margin, curY + 7, boxW, boxH);
          pdf.setTextColor(0);
          pdf.setFontSize(9);
          const promoLines = pdf.splitTextToSize(promo || '-', boxW - 4);
          pdf.text(promoLines, margin + 2, curY + 12);
          // BONUS
          const bx = margin + boxW + 4;
          pdf.setFillColor(59, 130, 246);
          pdf.rect(bx, curY, boxW, 7, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(10);
          pdf.text('BONUS', bx + boxW / 2, curY + 5, { align: 'center' });
          pdf.setDrawColor(0);
          pdf.rect(bx, curY + 7, boxW, boxH);
          pdf.setTextColor(0);
          pdf.setFontSize(9);
          const bonusLines = pdf.splitTextToSize(bonus || '-', boxW - 4);
          pdf.text(bonusLines, bx + 2, curY + 12);
          curY += boxH + 20;
        } else {
          curY += 20;
        }
        // Tanda tangan
        pdf.setFontSize(10);
        pdf.text('Dibuat Oleh,', 14, curY);
        pdf.text('Dicek Oleh,', 85, curY);
        pdf.text('Diterima Oleh,', 155, curY);
        pdf.text('( Admin )', 14, curY + 25);
        pdf.text('( QC / Packing )', 85, curY + 25);
        pdf.text(`( ${customer} )`, 155, curY + 25);
      }

      // === WO 4: Form Permintaan Gudang ===
      if (freshGudang.length > 0) {
        if (!firstPage) pdf.addPage();
        firstPage = false;
        pdf.setFontSize(14);
        pdf.text(`FORM PERMINTAAN GUDANG - ${customer.toUpperCase()}`, 14, 18);
        pdf.setFontSize(10);
        pdf.text(`No WO: ${woName}`, 14, 26);

        autoTable(pdf, {
          startY: 32,
          head: [['NO', 'ITEM', 'BAHAN', 'WARNA', 'KUANTITAS']],
          body: freshGudang.sort((a: Row, b: Row) => Number(a.urutan) - Number(b.urutan)).map((r: Row, i: number) => [
            String(i + 1),
            String(r.bagian || ''),
            String(r.bahan || ''),
            String(r.warna || ''),
            String(r.kuantitas || 0),
          ]),
          styles: { fontSize: 9, cellPadding: 2, lineWidth: 0.3, lineColor: [0, 0, 0] },
          headStyles: { fillColor: [245, 158, 11], textColor: [15, 23, 42], halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0] },
          bodyStyles: { halign: 'left' },
          columnStyles: {
            0: { cellWidth: 15, halign: 'center' },
            3: { cellWidth: 30 },
            4: { cellWidth: 25, halign: 'right' },
          },
        });
      }

      if (firstPage) {
        toast.error('Data Kosong', 'Tidak ada data WO untuk di-download.');
        return;
      }

      pdf.save(`WorkOrder-${woName}.pdf`);
      toast.success('PDF Berhasil', `WorkOrder-${woName}.pdf`);
    } catch (e) {
      toast.error('Gagal Download All PDF', String(e));
    } finally {
      setDownloadingAll(false);
    }
  }

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
        <div className="flex flex-col items-end gap-2">
          <span className={`text-xs font-medium border px-3 py-1.5 rounded-full ${st.cls}`}>{st.label}</span>
          {/* Tombol 'Import Master Excel' dihilangkan — WO1-W4 sekarang
              di-input langsung via web form. Handler + ref masih ada
              untuk backward-compat kalau legacy data perlu re-import,
              tapi UI trigger sudah tidak ditampilkan. */}
          <input ref={masterFileRef} type="file" accept=".xlsx,.xls" onChange={handleImportMaster} className="hidden" />
          {wo?.master_import_file ? (
            <a
              href={String(wo.master_import_file)}
              download={String(wo.master_import_file_name || 'master.xlsx')}
              title="Download file Excel master yang sebelumnya di-upload"
              className="flex items-center gap-1.5 text-xs text-blue-400 border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 rounded-full hover:bg-blue-500/20 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Download All
            </a>
          ) : (
            <button
              onClick={handleDownloadAllPDF}
              disabled={downloadingAll}
              title="Download satu PDF gabungan WO 1 - WO 4"
              className="flex items-center gap-1.5 text-xs text-blue-400 border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 rounded-full hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              {downloadingAll ? 'Menyiapkan...' : 'Download All'}
            </button>
          )}
          <button
            onClick={handleDeleteAllImports}
            disabled={deletingAll}
            title="Hapus semua file imported di WO 1 - WO 4"
            className="flex items-center gap-1.5 text-xs text-red-400 border border-red-500/30 bg-red-500/10 px-3 py-1.5 rounded-full hover:bg-red-500/20 disabled:opacity-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            {deletingAll ? 'Menghapus...' : 'Delete All'}
          </button>
        </div>
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

/* Searchable dropdown untuk pilih bahan. Berbeda dari native <select>,
   membolehkan search cepat via keyboard — dipakai untuk field bahan
   di form WO1 supaya operator gampang cari di list panjang. */
function SearchableBahanSelect({
  value, options, placeholder = 'Pilih bahan...', onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedLabel = useMemo(
    () => options.find(o => o.value === value)?.label ?? '',
    [options, value]
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full bg-[#0d1117] border border-white/10 text-white text-left focus:border-blue-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-sm transition-colors cursor-pointer flex items-center justify-between gap-2"
      >
        <span className={selectedLabel ? 'text-white' : 'text-slate-500'}>{selectedLabel || placeholder}</span>
        <svg className={`w-4 h-4 text-slate-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-[#0d1117] border border-white/10 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-white/10">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari bahan..."
              className="w-full bg-[#0a0e17] border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div style={{ maxHeight: 240 }} className="overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-500">Tidak ada hasil</div>
            ) : filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${o.value === value ? 'bg-blue-600/20 text-blue-300' : 'text-slate-300 hover:bg-white/[0.04]'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
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
  const [paketList, setPaketList] = useState<Row[]>([]);
  const printRef = useRef<Record<number, HTMLDivElement | null>>({});
  const toast = useToast();

  useEffect(() => { dbGet('paket').then(setPaketList).catch(() => {}); }, []);

  async function refreshSpecs() {
    const filtered = await dbGet<Row>('wo_spesifikasi', undefined, { work_order_id: wo.id });
    setSpecs(filtered);
    // Fetch spec_bahan filtered per spec in parallel (much smaller than full-table scan)
    if (filtered.length > 0) {
      const batches = await Promise.all(
        filtered.map((s: Row) => dbGet<Row>('wo_spesifikasi_bahan', undefined, { spesifikasi_id: s.id }))
      );
      setAllSpecBahan(batches.flat());
    } else {
      setAllSpecBahan([]);
    }
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
    return buildWoSpecHtml(spec, wo, allSpecBahan);
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
      ws.getRow(33).height = 18; // Keterangan Jahit label
      for (let r = 34; r <= 38; r++) ws.getRow(r).height = 26; // Keterangan Jahit value (taller for handwriting)
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
      kjVal.value = '';
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
        ['Paket', String(spec.paket || wo.paket || '')],
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
      // Fetch fresh data using server-side filters (much faster than full-table scans).
      // Use the parent's known order_id so all four fetches run in parallel.
      const [freshSpecsArr, freshBahan, freshWosArr, freshOrdersArr] = await Promise.all([
        dbGet<Row>('wo_spesifikasi', undefined, { id: spec.id }),
        dbGet<Row>('wo_spesifikasi_bahan', undefined, { spesifikasi_id: spec.id }),
        dbGet<Row>('work_orders', undefined, { id: wo.id }),
        wo.order_id
          ? dbGet<Row>('orders', undefined, { id: wo.order_id as number })
          : Promise.resolve([] as Row[]),
      ]);
      const fresh = freshSpecsArr[0] || spec;
      const rows = freshBahan;
      const freshWoData = freshWosArr[0];
      const freshOrder = freshOrdersArr[0] || null;
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
      setPaket(String(fresh.paket || freshWoData?.paket || wo.paket || '').split(',')[0].trim());
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
      // Bahan section = 8 baris FIXED. Lookup existing bahan dari
      // wo_spesifikasi_bahan by bagian name (case-insensitive, via normBagian).
      const bahanMap: Record<string, string> = {};
      for (const r of rows) {
        const key = normBagian(String(r.bagian)).toUpperCase();
        bahanMap[key] = String(r.bahan || '');
      }
      setBahanRows(WO_BAHAN_ROWS.map((bagian, i) => ({
        id: i + 1,
        bagian,
        bahan: bahanMap[bagian.toUpperCase()] || '',
      })));
      setPj(parsePj(fresh.penanggung_jawab_json));
      setEditOpen(true);
    } catch (e) { toast.error('Gagal memuat data', String(e)); }
  }

  async function handleUpdateSpec() {
    if (!editSpec || !namaSpec.trim()) { toast.warning('Validasi', 'Nama Spesifikasi wajib diisi'); return; }
    setSaving(true);
    try {
      await dbUpdate('wo_spesifikasi', editSpec.id, {
        nama_spesifikasi: namaSpec,
        paket: paket || null,
        jumlah: Number(jumlah) || 0,
        dokumen_desain: dokDesain || null, dokumen_pattern: dokPattern || null,
        tagline, authentic, info_ukuran: infoUkuran, info_logo: infoLogo,
        info_packing: infoPacking, webbing, font_nomor: fontNomor,
        keterangan, keterangan_jahit: keteranganJahit,
        approval_admin: approvalAdmin,
        penanggung_jawab_json: JSON.stringify(pj),
      });
      // Delete old bahan rows for this spec (filtered server-side)
      const oldBahan = await dbGet<Row>('wo_spesifikasi_bahan', undefined, { spesifikasi_id: editSpec.id });
      await Promise.all(oldBahan.map((ob: Row) => dbDelete('wo_spesifikasi_bahan', Number(ob.id))));
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
    setNamaSpec(''); setPaket(''); setJumlah(''); setTagline(''); setAuthentic('');
    setInfoUkuran(''); setInfoLogo(''); setInfoPacking(''); setWebbing('');
    setFontNomor(''); setKeterangan(''); setKeteranganJahit(''); setApprovalAdmin('');
    setDokDesain(null); setDokPattern(null);
    setBahanRows(WO_BAHAN_ROWS.map((bagian, i) => ({ id: i + 1, bagian, bahan: '' })));
    setPj(emptyPj());
  }

  // Form state
  const [namaSpec, setNamaSpec] = useState('');
  const [paket, setPaket] = useState('');
  const [jumlah, setJumlah] = useState('');
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
  const [pj, setPj] = useState<Record<string, string>>(emptyPj);
  useEffect(() => { dbGet('barang').then(setBarangList).catch(() => {}); }, []);

  async function openCreateDrawer() {
    // Pre-fill paket from the WO's first paket value (user can change via dropdown)
    setPaket(String(wo.paket || '').split(',')[0].trim());
    setJumlah('');
    // Bahan section = 8 baris FIXED sesuai template Excel AYRES. Lookup
    // bahan dari order_detail_bahan by bagian name (case-insensitive)
    // sebagai pre-fill; kalau tidak match, biarkan kosong.
    let orderBahan: Row[] = [];
    try {
      const all = await dbGet('order_detail_bahan');
      orderBahan = all.filter((d: Row) => String(d.order_id) === String(wo.order_id));
    } catch {}
    const lookupBahan = (target: string) => {
      const t = target.toLowerCase();
      const match = orderBahan.find(d => String(d.bagian || '').toLowerCase() === t);
      return match ? String(match.bahan || '') : '';
    };
    setBahanRows(WO_BAHAN_ROWS.map((bagian, i) => ({
      id: i + 1,
      bagian,
      bahan: lookupBahan(bagian),
    })));
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
        paket: paket || null,
        jumlah: Number(jumlah) || 0,
        deadline: (() => { const d = wo.deadlineRaw || wo.deadline; return d ? new Date(d).toISOString().split('T')[0] : null; })(),
        dokumen_desain: dokDesain || null, dokumen_pattern: dokPattern || null,
        tagline, authentic, info_ukuran: infoUkuran, info_logo: infoLogo,
        info_packing: infoPacking, webbing, font_nomor: fontNomor,
        keterangan, keterangan_jahit: keteranganJahit,
        approval_admin: approvalAdmin, export_icc: 'JPEG-RGB 3 PASS',
        penanggung_jawab_json: JSON.stringify(pj),
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

  const importFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const [renameSpec, setRenameSpec] = useState<Row | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  function openRenameModal(spec: Row) {
    setRenameSpec(spec);
    setRenameValue(String(spec.nama_spesifikasi || ''));
  }
  async function saveRenameSpec() {
    if (!renameSpec) return;
    const trimmed = renameValue.trim();
    if (!trimmed) { toast.warning('Validasi', 'Nama wajib diisi'); return; }
    if (trimmed === String(renameSpec.nama_spesifikasi || '')) { setRenameSpec(null); return; }
    setRenaming(true);
    try {
      await dbUpdate('wo_spesifikasi', renameSpec.id, { nama_spesifikasi: trimmed });
      await refreshSpecs();
      toast.success('Tersimpan', trimmed);
      setRenameSpec(null);
    } catch (e) {
      toast.error('Gagal Rename', String(e));
    }
    setRenaming(false);
  }

  async function handleImportSpec(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File Terlalu Besar', 'Maksimum 50MB.');
      if (importFileRef.current) importFileRef.current.value = '';
      return;
    }
    setImporting(true);
    try {
      // Upload via multipart so we don't blow the JSON body-size limit on /api/db.
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || 'Upload gagal');

      const name = file.name.replace(/\.pdf$/i, '');
      const pages = Array.isArray(json.pages) ? json.pages : [];
      if (json.rasterizeError) {
        console.warn('[handleImportSpec] rasterize error from server:', json.rasterizeError);
      }
      const specId = await dbCreate('wo_spesifikasi', {
        work_order_id: wo.id,
        nama_spesifikasi: name,
        imported_file: json.url,
        imported_file_name: file.name,
        imported_file_pages: pages.length > 0 ? JSON.stringify(pages) : null,
      });
      await refreshSpecs();
      setSelectedSpecId(specId as number);
      toast.success('Import Berhasil', file.name);
    } catch (err) {
      toast.error('Gagal Import', String(err));
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Lembar Spesifikasi</h2>
        {/* Tombol Import Spec (PDF) dihilangkan — WO1 sekarang input
            langsung via form web. Handler + hidden file input dipertahankan
            untuk backward-compat kalau legacy PDF perlu re-import. */}
        <input ref={importFileRef} type="file" accept=".pdf,application/pdf" onChange={handleImportSpec} className="hidden" />
        <button
          onClick={openCreateDrawer}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors shadow-lg shadow-blue-500/20"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Tambah Spec
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
                    <div>
                      <label className={lCls}>Paket</label>
                      <select value={paket} onChange={e => setPaket(e.target.value)} className={sCls}>
                        <option value="">Pilih paket</option>
                        {paketList.map(p => <option key={p.id as number} value={p.nama as string}>{p.nama as string}</option>)}
                      </select>
                    </div>
                    <div><label className={lCls}>Jumlah</label><input type="number" min={0} value={jumlah} onChange={e => setJumlah(e.target.value)} className={iCls} placeholder="0" /></div>
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
                    <div><label className={lCls}>Tagline</label><select value={tagline} onChange={e => setTagline(e.target.value)} className={sCls}><option value="">Pilih...</option><option>Ayres</option><option>Ayres Pattern Lab</option><option>polos</option><option>custom</option></select></div>
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

              {/* Detail Bahan — 8 baris fixed sesuai template + bisa tambah
                  baris extra kalau operator perlu (contoh: variasi khusus). */}
              <div className="border-t border-white/[0.06] pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Detail Bahan</h3>
                    <p className="text-[11px] text-slate-500">8 baris template + bisa tambah baris extra.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBahanRows(prev => [...prev, { id: Date.now(), bagian: '', bahan: '' }])}
                    className="text-xs text-blue-400 border border-blue-500/25 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    + Tambah Baris
                  </button>
                </div>
                <div className="space-y-2">
                  {bahanRows.map((r, idx) => {
                    const isFixed = idx < WO_BAHAN_ROWS.length && r.bagian === WO_BAHAN_ROWS[idx];
                    return (
                      <div key={r.id} className="grid grid-cols-[140px_1fr_28px] gap-2 items-center">
                        {isFixed ? (
                          <label className="text-xs text-slate-300 font-medium truncate" title={r.bagian}>{r.bagian}</label>
                        ) : (
                          <input
                            className="w-full bg-[#0d1117] border border-white/10 text-white text-xs rounded-lg px-2 py-2 focus:outline-none focus:border-blue-500/40 placeholder-slate-500"
                            placeholder="Nama bagian"
                            value={r.bagian}
                            onChange={e => setBahanRows(prev => prev.map(p => p.id === r.id ? { ...p, bagian: e.target.value } : p))}
                          />
                        )}
                        <SearchableBahanSelect
                          value={r.bahan}
                          options={barangList.map(b => ({ value: String(b.nama), label: String(b.nama) }))}
                          onChange={v => setBahanRows(prev => prev.map(p => p.id === r.id ? { ...p, bahan: v } : p))}
                        />
                        {isFixed ? (
                          <span />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setBahanRows(prev => prev.filter(p => p.id !== r.id))}
                            title="Hapus baris"
                            className="text-rose-500 hover:text-rose-300 p-1.5 rounded hover:bg-rose-500/10"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Persetujuan */}
              <div className="border-t border-white/[0.06] pt-5">
                <h3 className="text-sm font-bold text-white mb-3">Persetujuan</h3>
                <label className={lCls}>Data Persetujuan Admin</label>
                <input value={approvalAdmin} onChange={e => setApprovalAdmin(e.target.value)} className={iCls} />
              </div>

              {/* Section Penanggung Jawab dihilangkan dari form —
                  kolomnya di spec card render tetap ada tapi biasanya
                  kosong. State `pj` tetap di-load/save untuk backward-compat
                  dengan legacy data yang punya nama PJ. */}
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
                    <div>
                      <label className={lCls}>Paket</label>
                      <select value={paket} onChange={e => setPaket(e.target.value)} className={sCls}>
                        <option value="">Pilih paket</option>
                        {paketList.map(p => <option key={p.id as number} value={p.nama as string}>{p.nama as string}</option>)}
                      </select>
                    </div>
                    <div><label className={lCls}>Jumlah</label><input type="number" min={0} value={jumlah} onChange={e => setJumlah(e.target.value)} className={iCls} placeholder="0" /></div>
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
                    <div><label className={lCls}>Tagline</label><select value={tagline} onChange={e => setTagline(e.target.value)} className={sCls}><option value="">Pilih...</option><option>Ayres</option><option>Ayres Pattern Lab</option><option>polos</option><option>custom</option></select></div>
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

              {/* Section Penanggung Jawab dihilangkan dari form —
                  kolomnya di spec card render tetap ada tapi biasanya
                  kosong. State `pj` tetap di-load/save untuk backward-compat
                  dengan legacy data yang punya nama PJ. */}
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
          <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm font-semibold text-white mb-1">Belum ada lembar spesifikasi</p>
          <p className="text-xs text-slate-500 mb-4">Klik tombol di bawah untuk mulai input.</p>
          <button
            onClick={openCreateDrawer}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-blue-500/20"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Tambah Spec
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
            {specs.filter((s: Row) => s.id === selectedSpecId).map((spec: Row) => {
              const isImported = !!spec.imported_file;
              return (
                <div key={spec.id} className="flex items-center gap-2 pr-1">
                  {isImported ? (
                    <>
                      <button onClick={() => openRenameModal(spec)} className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">Rename</button>
                      <a
                        href={spec.imported_file}
                        download={spec.imported_file_name || `${spec.nama_spesifikasi}.bin`}
                        className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors"
                      >
                        Download File
                      </a>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleExportExcel(spec.id)} className="flex items-center gap-1.5 text-xs text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg hover:bg-emerald-500/10 transition-colors">Export Excel</button>
                      <button onClick={() => handleDownloadPDF(spec.id)} className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">Download PDF</button>
                      <button onClick={() => openEditSpec(spec)} className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">Edit</button>
                    </>
                  )}
                  <button onClick={() => handleDeleteSpec(spec)} className="flex items-center gap-1.5 text-xs text-red-400 border border-red-500/20 bg-red-500/10 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors">Hapus</button>
                </div>
              );
            })}
          </div>
          {/* Selected spec card — mirror Excel template AYRES APPAREL (image #454). */}
          {specs.filter((spec: Row) => spec.id === selectedSpecId).map((spec: Row) => spec.imported_file ? (
            <ImportedSpecViewer key={spec.id} spec={spec} />
          ) : (() => {
            const bahanBySpec = allSpecBahan.filter((b: Row) => String(b.spesifikasi_id) === String(spec.id));
            const bahanMap: Record<string, string> = {};
            for (const b of bahanBySpec) bahanMap[normBagian(String(b.bagian)).toUpperCase()] = String(b.bahan || '');
            const pjData = parsePj(spec.penanggung_jawab_json);
            const deadlineStr = spec.deadline
              ? new Date(String(spec.deadline)).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
              : (wo.deadline || '-');
            return (
              <div key={spec.id}>
                <div ref={el => { printRef.current[spec.id] = el; }} className="bg-white rounded-lg p-4 text-black max-w-6xl mx-auto mt-4 border border-black">
                  {/* Top bar: AYRES APPAREL | WORK ORDER NO */}
                  <div className="flex items-stretch border-2 border-black">
                    <div className="flex items-center gap-3 flex-1 px-4 py-2 border-r-2 border-black">
                      <img src="/logo/new logo.png" alt="AYRES" className="h-7" style={{ filter: 'brightness(0)' }} />
                      <h3 className="text-2xl font-black tracking-wide">AYRES APPAREL</h3>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 min-w-[240px]">
                      <span className="text-xs font-bold">WORK ORDER NO.</span>
                      <span className="text-sm font-bold flex-1 text-right">{wo.noWo}</span>
                    </div>
                  </div>

                  {/* Main 3-column grid — persis layout Excel */}
                  <div className="grid grid-cols-[220px_1fr_240px] border-2 border-black border-t-0">
                    {/* ─── LEFT COLUMN ─── */}
                    <div className="border-r-2 border-black flex flex-col">
                      <div className="bg-emerald-800 text-center text-[11px] font-bold py-1 border-b-2 border-black" style={{ color: '#fff' }}>DESAIN MOCK UP</div>
                      <div className="border-b-2 border-black bg-white" style={{ minHeight: 220 }}>
                        {spec.dokumen_desain ? (
                          <img src={spec.dokumen_desain} alt="Desain Mockup" className="w-full h-full object-contain" style={{ maxHeight: 300 }} />
                        ) : (
                          <div className="h-[220px] grid place-items-center text-slate-300 text-xs">— gambar desain —</div>
                        )}
                      </div>
                      <div className="border-b-2 border-black p-2" style={{ minHeight: 90 }}>
                        <p className="text-[10px] font-bold">Keterangan Jahit :</p>
                        <p className="text-[11px] mt-1 whitespace-pre-wrap">{spec.keterangan_jahit || ''}</p>
                      </div>
                      <div className="bg-green-200 border-b-2 border-black px-2 py-1.5">
                        <p className="text-red-600 font-black text-sm">DEADLINE :</p>
                        <p className="text-[11px] font-bold mt-0.5">{deadlineStr}</p>
                      </div>
                      {/* Bahan table — 8 baris fixed sesuai template */}
                      <div className="text-[10px]">
                        {WO_BAHAN_ROWS.map((bagian, i) => (
                          <div key={bagian} className={`grid grid-cols-[110px_1fr] ${i < WO_BAHAN_ROWS.length - 1 ? 'border-b border-black' : ''}`}>
                            <span className="font-bold px-1.5 py-1 border-r border-black">{bagian}</span>
                            <span className="px-1.5 py-1">{bahanMap[bagian] || ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ─── MIDDLE COLUMN ─── */}
                    <div className="border-r-2 border-black flex flex-col">
                      <div className="bg-black text-center text-[11px] font-bold py-1 border-b-2 border-black" style={{ color: '#fff' }}>PATTERN</div>
                      <div className="border-b-2 border-black bg-white flex-1" style={{ minHeight: 380 }}>
                        {spec.dokumen_pattern ? (
                          <img src={spec.dokumen_pattern} alt="Pattern" className="w-full h-full object-contain" style={{ maxHeight: 480 }} />
                        ) : (
                          <div className="h-[380px] grid place-items-center text-slate-300 text-xs">— gambar pattern —</div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 border-b-2 border-black">
                        <div className="border-r-2 border-black">
                          <div className="bg-black text-center text-[11px] font-bold py-1 border-b-2 border-black" style={{ color: '#fff' }}>Font &amp; Number</div>
                          <div className="p-2 text-[11px] min-h-[70px] whitespace-pre-wrap">{spec.font_nomor || ''}</div>
                        </div>
                        <div>
                          <div className="bg-black text-center text-[11px] font-bold py-1 border-b-2 border-black" style={{ color: '#fff' }}>Approval Admin / Data</div>
                          <div className="p-2 text-[11px] min-h-[70px] whitespace-pre-wrap">{spec.approval_admin || ''}</div>
                        </div>
                      </div>
                    </div>

                    {/* ─── RIGHT COLUMN ─── */}
                    <div className="flex flex-col text-[11px]">
                      {/* Customer info */}
                      <div className="border-b-2 border-black">
                        <p className="font-bold border-b border-black px-2 py-1">Customer</p>
                        {[['Nama', wo.customer],['Paket', spec.paket || wo.paket],['Jumlah', `${spec.jumlah || 0}`]].map(([k, v]) => (
                          <div key={k} className="grid grid-cols-[70px_1fr] border-b border-black last:border-0">
                            <span className="font-semibold px-2 py-0.5">{k}</span>
                            <span className="px-2 py-0.5 border-l border-black">{v || ''}</span>
                          </div>
                        ))}
                      </div>
                      {/* Accessories */}
                      <div className="border-b-2 border-black">
                        <p className="font-bold border-b border-black px-2 py-1">Accessories</p>
                        {[
                          ['Tagline', spec.tagline, 'text-red-600'],
                          ['Authentic', spec.authentic, 'font-bold'],
                          ['Size', spec.info_ukuran, ''],
                          ['Logo', spec.info_logo, ''],
                          ['Webing', spec.webbing, ''],
                          ['Packing', spec.info_packing, ''],
                        ].map(([k, v, cls]) => (
                          <div key={String(k)} className="grid grid-cols-[70px_1fr] border-b border-black last:border-0">
                            <span className={`px-2 py-0.5 ${cls}`}>{k}</span>
                            <span className="px-2 py-0.5 border-l border-black">{v || ''}</span>
                          </div>
                        ))}
                      </div>
                      {/* PENANGGUNG JAWAB — 14 stages */}
                      <div className="border-b-2 border-black flex-1">
                        <p className="font-bold text-center bg-white border-b-2 border-black py-1">PENANGGUNG JAWAB</p>
                        <div>
                          {WO_PJ_STAGES.map((stage, i) => {
                            const nama = pjData[pjKey(stage)] || '';
                            return (
                              <div key={stage} className={`px-2 py-1 text-[10px] ${i < WO_PJ_STAGES.length - 1 ? 'border-b border-black' : ''}`}>
                                <div className="font-semibold">{i + 1}. {stage}</div>
                                {nama && <div className="text-slate-700 pl-3">{nama}</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {/* EXPORT & ICC PRINT */}
                      <div className="grid grid-cols-2">
                        <div className="text-center border-r-2 border-black px-2 py-2 text-[10px] font-bold">
                          EXPORT<br />&amp; ICC<br />PRINT
                        </div>
                        <div className="grid place-items-center px-2 py-2 text-[11px] font-bold">
                          {spec.export_icc || 'JPEG - RGB'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })())}
        </>
      )}

      {renameSpec && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => !renaming && setRenameSpec(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[#0c1120] border border-white/[0.06] rounded-xl shadow-2xl">
            <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Rename Spec</h2>
              <button onClick={() => !renaming && setRenameSpec(null)} className="text-slate-500 hover:text-white transition-colors p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Nama Spec</label>
              <input
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveRenameSpec(); if (e.key === 'Escape') setRenameSpec(null); }}
                placeholder="mis. Jersey Player"
                autoFocus
                className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/40"
              />
            </div>
            <div className="px-6 py-4 border-t border-white/[0.06] flex justify-end gap-2">
              <button onClick={() => setRenameSpec(null)} disabled={renaming} className="px-4 py-2 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-50">Batal</button>
              <button onClick={saveRenameSpec} disabled={renaming} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {renaming ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Shows pre-existing rows from the legacy WO 2 / WO 3 / WO 4 tables
// (wo_permintaan_gudang, wo_detail_items, wo_pengiriman) when no imported
// file exists yet. Read-only — importing a file will supersede the view.
function LegacySectionView({ wo, section, helper }: { wo: Row; section: 'wo2' | 'wo3' | 'wo4'; helper: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const table = section === 'wo2' ? 'wo_permintaan_gudang' : section === 'wo3' ? 'wo_detail_items' : 'wo_pengiriman';
        const r = await dbGet<Row>(table, undefined, { work_order_id: wo.id });
        if (!cancelled) setRows(r);
      } catch {
        if (!cancelled) setRows([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [wo.id, section]);

  if (loading) return <div className="h-32 bg-white/[0.03] rounded-xl animate-pulse" />;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-white/[0.08] py-14 text-center">
        <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12m4.5-4.5v13.5" /></svg>
        <p className="text-sm font-semibold text-white mb-1">Belum ada file ter-import</p>
        <p className="text-xs text-slate-500">{helper}</p>
      </div>
    );
  }

  // Section-specific column layout
  if (section === 'wo2') {
    const grouped: Record<string, Row[]> = { BAHAN_UTAMA: [], AKSESORIS: [], MATERIAL_TAMBAHAN: [] };
    for (const r of rows) {
      const k = String(r.kategori || 'BAHAN_UTAMA');
      if (grouped[k]) grouped[k].push(r);
      else grouped.BAHAN_UTAMA.push(r);
    }
    return (
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <span className="text-xs text-slate-400">Data lama dari sebelum sistem import. Read-only — upload file baru untuk menggantikan.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/[0.06] text-[11px] text-slate-500 uppercase tracking-wider">
              <th className="text-left px-4 py-2 w-12">NO</th>
              <th className="text-left px-4 py-2">BAGIAN</th>
              <th className="text-left px-4 py-2">BAHAN</th>
              <th className="text-left px-4 py-2">WARNA</th>
              <th className="text-right px-4 py-2 w-24">KUANTITAS</th>
            </tr></thead>
            <tbody>
              {(['BAHAN_UTAMA','AKSESORIS','MATERIAL_TAMBAHAN'] as const).flatMap((kat, gi) => {
                const list = grouped[kat] || [];
                if (list.length === 0) return [];
                return [
                  <tr key={`h-${kat}`} className="bg-white/[0.02]">
                    <td colSpan={5} className="px-4 py-2 text-[11px] font-bold text-slate-300 uppercase tracking-wider">{kat.replace('_', ' ')}</td>
                  </tr>,
                  ...list.map((r, i) => (
                    <tr key={`${gi}-${r.id}`} className="border-b border-white/[0.04]">
                      <td className="px-4 py-2 text-blue-400">{i + 1}</td>
                      <td className="px-4 py-2 text-slate-300">{String(r.bagian || '')}</td>
                      <td className="px-4 py-2 text-white">{String(r.bahan || '')}</td>
                      <td className="px-4 py-2 text-slate-400">{String(r.warna || '')}</td>
                      <td className="px-4 py-2 text-right text-slate-300">{Number(r.kuantitas) || 0}</td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (section === 'wo3') {
    return (
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.06]">
          <span className="text-xs text-slate-400">Data lama dari sebelum sistem import. Read-only — upload file baru untuk menggantikan.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/[0.06] text-[11px] text-slate-500 uppercase tracking-wider">
              <th className="text-left px-4 py-2 w-12">NO</th>
              <th className="text-left px-4 py-2">NAMA</th>
              <th className="text-left px-4 py-2">NP</th>
              <th className="text-left px-4 py-2">SIZE</th>
              <th className="text-left px-4 py-2">KET</th>
              <th className="text-left px-4 py-2">PENJAHIT</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={String(r.id)} className="border-b border-white/[0.04]">
                  <td className="px-4 py-2 text-blue-400">{i + 1}</td>
                  <td className="px-4 py-2 text-emerald-400">{String(r.nama || '')}</td>
                  <td className="px-4 py-2 text-slate-400">{String(r.np || '')}</td>
                  <td className="px-4 py-2 font-bold text-white">{String(r.ukuran || '')}</td>
                  <td className="px-4 py-2 text-slate-400">{String(r.keterangan || '')}</td>
                  <td className="px-4 py-2 text-slate-500">{String(r.kerah || '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // wo4
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <div className="px-5 py-3 border-b border-white/[0.06]">
        <span className="text-xs text-slate-400">Data lama dari sebelum sistem import. Read-only — upload file baru untuk menggantikan.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-white/[0.06] text-[11px] text-slate-500 uppercase tracking-wider">
            <th className="text-left px-4 py-2 w-12">NO</th>
            <th className="text-left px-4 py-2">NAMA</th>
            <th className="text-left px-4 py-2">NP</th>
            <th className="text-left px-4 py-2">SIZE</th>
            <th className="text-left px-4 py-2">KET</th>
            <th className="text-left px-4 py-2">BONUS</th>
            <th className="text-center px-4 py-2 w-20">CHECK</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={String(r.id)} className="border-b border-white/[0.04]">
                <td className="px-4 py-2 text-blue-400">{i + 1}</td>
                <td className="px-4 py-2 text-emerald-400">{String(r.nama || '')}</td>
                <td className="px-4 py-2 text-slate-400">{String(r.np || '')}</td>
                <td className="px-4 py-2 font-bold text-white">{String(r.ukuran || '')}</td>
                <td className="px-4 py-2 text-slate-400">{String(r.keterangan || '')}</td>
                <td className="px-4 py-2 text-slate-300">{String(r.bonus || '')}</td>
                <td className="px-4 py-2 text-center">{(r.checklist === 1 || r.checklist === true) ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══ Tab WO 2 — Import Permintaan Gudang ═══ */
// Generic per-section import tab (also reused by WO 3 / WO 4).
function WoImportTab({ wo, section, accept, title, helper }: {
  wo: Row;
  section: 'wo2' | 'wo3' | 'wo4';
  accept: string;
  title: string;
  helper: string;
}) {
  const [importing, setImporting] = useState(false);
  const [importRow, setImportRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function refresh() {
    setLoading(true);
    try {
      const rows = await dbGet<Row>('wo_section_imports', undefined, { work_order_id: wo.id, section });
      setImportRow(rows[0] || null);
    } catch {
      setImportRow(null);
    }
    setLoading(false);
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [wo.id, section]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File Terlalu Besar', 'Maksimum 50MB.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || 'Upload gagal');
      const pages = Array.isArray(json.pages) ? json.pages : [];

      // Replace any existing row for this WO + section (UNIQUE key would conflict otherwise).
      if (importRow) {
        await dbDelete('wo_section_imports', Number(importRow.id));
      }
      await dbCreate('wo_section_imports', {
        work_order_id: wo.id,
        section,
        imported_file: json.url,
        imported_file_name: file.name,
        imported_file_pages: pages.length > 0 ? JSON.stringify(pages) : null,
      });
      await refresh();
      toast.success('Import Berhasil', file.name);
    } catch (err) {
      toast.error('Gagal Import', String(err));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onDelete() {
    if (!importRow) return;
    const ok = await toast.confirm({
      title: `Hapus ${title}?`,
      message: 'File yang diimport akan dihapus dari WO ini.',
      type: 'danger',
      confirmText: 'Ya, Hapus',
    });
    if (!ok) return;
    try {
      await dbDelete('wo_section_imports', Number(importRow.id));
      await refresh();
      toast.deleted('Dihapus', importRow.imported_file_name || '');
    } catch (e) {
      toast.error('Gagal Hapus', String(e));
    }
  }

  if (loading) return <div className="h-32 bg-white/[0.03] rounded-xl animate-pulse" />;

  if (!importRow) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <input ref={fileRef} type="file" accept={accept} onChange={onPickFile} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12m4.5-4.5v13.5" /></svg>
            {importing ? 'Mengimport...' : `Import ${title}`}
          </button>
        </div>
        <LegacySectionView wo={wo} section={section} helper={helper} />
      </div>
    );
  }

  let pages: string[] = [];
  try {
    const raw = importRow.imported_file_pages;
    if (typeof raw === 'string' && raw.trim()) pages = JSON.parse(raw);
    else if (Array.isArray(raw)) pages = raw;
  } catch {}

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[640px]">{String(importRow.imported_file_name || '')}</p>
        </div>
        <input ref={fileRef} type="file" accept={accept} onChange={onPickFile} className="hidden" />
        <div className="flex items-center gap-2">
          <a
            href={String(importRow.imported_file || '')}
            download={String(importRow.imported_file_name || '')}
            className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            Download File
          </a>
          <button onClick={() => fileRef.current?.click()} disabled={importing} className="flex items-center gap-1.5 text-xs text-amber-300 border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors disabled:opacity-50">
            {importing ? 'Mengimport...' : 'Ganti File'}
          </button>
          <button onClick={onDelete} className="flex items-center gap-1.5 text-xs text-red-400 border border-red-500/20 bg-red-500/10 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors">
            Hapus
          </button>
        </div>
      </div>
      <ImportContentViewer
        fileUrl={String(importRow.imported_file || '')}
        fileName={String(importRow.imported_file_name || '')}
        pages={pages}
        rowId={Number(importRow.id)}
        onPagesUpdated={async (newPages) => {
          try {
            await dbUpdate('wo_section_imports', Number(importRow.id), { imported_file_pages: JSON.stringify(newPages) });
            await refresh();
          } catch {}
        }}
      />
    </div>
  );
}

function TabWO2({ wo }: { wo: Row; gudangItems: Row[]; specs: Row[]; specBahan: Row[] }) {
  return <TabDetailUkuranTim wo={wo} />;
}

/* ═══ Tab WO 2 — Detail Ukuran Tim (image #464) — kolom dynamic ═══ */
type Wo2Col = {
  id: string; label: string; urutan: number;
  children?: { id: string; label: string; urutan: number }[];
};

// Kolom default = 13 kolom sesuai template Excel AYRES. id nya match
// nama kolom legacy di wo_ukuran_tim supaya value existing tetap ke-read.
const DEFAULT_WO2_KOLOM: Wo2Col[] = [
  { id: 'nama', label: 'NAMA', urutan: 1 },
  { id: 'np', label: 'NP', urutan: 2 },
  { id: 'size', label: 'SIZE', urutan: 3 },
  { id: 'ket1', label: 'KET', urutan: 4 },
  { id: 'ket2', label: 'KET', urutan: 5 },
  { id: 'bd', label: 'BD', urutan: 6 },
  { id: 'bb', label: 'BB', urutan: 7 },
  { id: 'lengan', label: 'LENGAN', urutan: 8, children: [
    { id: 'lengan_kanan', label: 'KANAN', urutan: 1 },
    { id: 'lengan_kiri', label: 'KIRI', urutan: 2 },
  ]},
  { id: 'lis_lengan', label: 'LIS LENGAN', urutan: 9, children: [
    { id: 'lis_lengan_kanan', label: 'KANAN', urutan: 1 },
    { id: 'lis_lengan_kiri', label: 'KIRI', urutan: 2 },
  ]},
  { id: 'var_kerah', label: 'VAR KERAH', urutan: 10 },
  { id: 'kerah', label: 'KERAH', urutan: 11 },
  { id: 'penjahit', label: 'PENJAHIT', urutan: 12 },
];

type UkuranRow = { id: number | null; urutan: number; data: Record<string, string> };

function parseWo2Kolom(raw: string | null | undefined): Wo2Col[] {
  if (!raw) return DEFAULT_WO2_KOLOM.slice();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as Wo2Col[];
  } catch {}
  return DEFAULT_WO2_KOLOM.slice();
}

// Flatten config jadi list leaf keys (untuk header row 2 dan tbody cells).
function flatLeafKeys(kolom: Wo2Col[]): { id: string; label: string; parent?: string }[] {
  const out: { id: string; label: string; parent?: string }[] = [];
  for (const k of kolom) {
    if (k.children && k.children.length > 0) {
      for (const c of k.children) out.push({ id: c.id, label: c.label, parent: k.label });
    } else {
      out.push({ id: k.id, label: k.label });
    }
  }
  return out;
}

function TabDetailUkuranTim({ wo }: { wo: Row }) {
  const toast = useToast();
  const [rows, setRows] = useState<UkuranRow[]>([]);
  const [kolom, setKolom] = useState<Wo2Col[]>(DEFAULT_WO2_KOLOM);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addHeaderOpen, setAddHeaderOpen] = useState(false);
  const [deleteHeader, setDeleteHeader] = useState<{ colId: string; label: string } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [data, woFresh] = await Promise.all([
        dbGet<Row>('wo_ukuran_tim', undefined, { work_order_id: wo.id }),
        dbGet<Row>('work_orders', undefined, { id: wo.id }),
      ]);
      const fresh = woFresh[0];
      setKolom(parseWo2Kolom(fresh?.wo2_kolom_json as string));
      const sorted = data.slice().sort((a, b) => Number(a.urutan) - Number(b.urutan));
      if (sorted.length > 0) {
        setRows(sorted.map((r) => {
          // Merge legacy columns + data_json. data_json wins kalau ada.
          const legacy: Record<string, string> = {
            nama: String(r.nama || ''), np: String(r.np || ''), size: String(r.size || ''),
            ket1: String(r.ket1 || ''), ket2: String(r.ket2 || ''),
            bd: String(r.bd || ''), bb: String(r.bb || ''),
            lengan_kanan: String(r.lengan_kanan || ''), lengan_kiri: String(r.lengan_kiri || ''),
            lis_lengan_kanan: String(r.lis_lengan_kanan || ''), lis_lengan_kiri: String(r.lis_lengan_kiri || ''),
            var_kerah: String(r.var_kerah || ''), kerah: String(r.kerah || ''),
            penjahit: String(r.penjahit || ''),
          };
          let dj: Record<string, string> = {};
          if (r.data_json) {
            try { dj = JSON.parse(String(r.data_json)) || {}; } catch {}
          }
          return {
            id: Number(r.id), urutan: Number(r.urutan) || 0,
            data: { ...legacy, ...dj },
          };
        }));
      } else {
        setRows(Array.from({ length: 5 }, (_, i) => ({ id: null, urutan: i + 1, data: {} })));
      }
    } catch (e) { toast.error('Gagal Muat', String(e)); }
    setLoading(false);
  }, [wo.id, toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const leafKeys = useMemo(() => flatLeafKeys(kolom), [kolom]);

  function setCell(idx: number, key: string, val: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, data: { ...r.data, [key]: val } } : r));
  }
  function addRow() {
    setRows(prev => [...prev, { id: null, urutan: prev.length + 1, data: {} }]);
  }
  async function removeRow(idx: number) {
    const row = rows[idx];
    if (row.id) {
      try { await dbDelete('wo_ukuran_tim', row.id); } catch (e) { toast.error('Gagal', String(e)); return; }
    }
    setRows(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, urutan: i + 1 })));
  }
  function handleAddKolom(newCol: Wo2Col) {
    setKolom(prev => {
      const maxUrutan = prev.reduce((mx, k) => Math.max(mx, k.urutan), 0);
      return [...prev, { ...newCol, urutan: maxUrutan + 1 }];
    });
  }
  function handleDeleteKolom(colId: string) {
    setKolom(prev => {
      // Case 1: colId adalah parent (top-level) → drop parent + semua child.
      if (prev.some(k => k.id === colId)) {
        return prev.filter(k => k.id !== colId);
      }
      // Case 2: colId adalah child → cari parent yang punya, drop child itu.
      // Kalau setelah drop parent-nya jadi kosong (0 children), drop parent juga.
      return prev.map(k => {
        if (k.children && k.children.some(c => c.id === colId)) {
          const remaining = k.children.filter(c => c.id !== colId);
          if (remaining.length === 0) return null;
          return { ...k, children: remaining };
        }
        return k;
      }).filter((k): k is Wo2Col => k !== null);
    });
    setDeleteHeader(null);
  }
  async function saveAll() {
    setSaving(true);
    try {
      await dbUpdate('work_orders', wo.id, {
        wo2_kolom_json: JSON.stringify(kolom),
      });
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        // Pull known legacy fields from data ke old columns (backward compat)
        // + save data_json full snapshot.
        const payload: Row = {
          work_order_id: wo.id, urutan: i + 1,
          nama: r.data.nama || '', np: r.data.np || '', size: r.data.size || '',
          ket1: r.data.ket1 || '', ket2: r.data.ket2 || '',
          bd: r.data.bd || '', bb: r.data.bb || '',
          lengan_kanan: r.data.lengan_kanan || '', lengan_kiri: r.data.lengan_kiri || '',
          lis_lengan_kanan: r.data.lis_lengan_kanan || '', lis_lengan_kiri: r.data.lis_lengan_kiri || '',
          var_kerah: r.data.var_kerah || '', kerah: r.data.kerah || '',
          penjahit: r.data.penjahit || '',
          data_json: JSON.stringify(r.data),
        };
        if (r.id) await dbUpdate('wo_ukuran_tim', r.id, payload);
        else {
          const newId = await dbCreate('wo_ukuran_tim', payload);
          setRows(prev => prev.map((row, idx) => idx === i ? { ...row, id: Number(newId) } : row));
        }
      }
      toast.success('Tersimpan', 'Detail ukuran tim disimpan.');
      await fetchAll();
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  if (loading) return <div className="h-64 bg-white/[0.03] rounded-xl animate-pulse" />;

  const cellCls = 'w-full bg-transparent focus:bg-white/[0.03] focus:outline-none px-2 py-1.5 text-xs text-white placeholder-slate-600';
  const hasChildren = kolom.some(k => k.children && k.children.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Detail Ukuran Tim</h2>
          <p className="text-xs text-slate-500 mt-0.5">Customer: <span className="text-slate-300 font-medium">{wo.customer_nama || '-'}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAddHeaderOpen(true)} className="text-xs font-medium text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors">+ Tambah Header</button>
          <button onClick={addRow} className="text-xs font-medium text-blue-300 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">+ Tambah Baris</button>
          <button onClick={saveAll} disabled={saving} className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors shadow-lg shadow-emerald-500/20">
            {saving ? 'Menyimpan...' : 'Simpan Semua'}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-slate-500">Tip: klik header di tabel untuk hapus kolom itu.</p>

      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#111827]">
        <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr className="text-slate-200 font-bold text-center" style={{ background: '#065f46' }}>
              <th rowSpan={hasChildren ? 2 : 1} className="border border-white/10 px-2 py-2 w-10">NO</th>
              {kolom.map(k => {
                const cn = k.children && k.children.length > 0;
                return (
                  <th
                    key={k.id}
                    colSpan={cn ? k.children!.length : 1}
                    rowSpan={cn ? 1 : (hasChildren ? 2 : 1)}
                    onClick={() => setDeleteHeader({ colId: k.id, label: k.label })}
                    title="Klik untuk hapus kolom ini"
                    className="border border-white/10 px-2 py-2 cursor-pointer hover:bg-emerald-900/40 transition-colors min-w-[80px]"
                  >
                    {k.label}
                  </th>
                );
              })}
              <th rowSpan={hasChildren ? 2 : 1} className="border border-white/10 px-1 py-2 w-8"></th>
            </tr>
            {hasChildren && (
              <tr className="text-slate-200 font-semibold text-center" style={{ background: '#047857' }}>
                {kolom.flatMap(k => (
                  k.children && k.children.length > 0
                    ? k.children.map(c => (
                        <th
                          key={c.id}
                          onClick={() => setDeleteHeader({ colId: c.id, label: `${k.label} → ${c.label}` })}
                          title="Klik untuk hapus sub-kolom"
                          className="border border-white/10 px-2 py-1 w-16 cursor-pointer hover:bg-emerald-800/60 transition-colors"
                        >{c.label}</th>
                      ))
                    : []
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                <td className="border border-white/10 text-center text-slate-500 px-2 py-1">{i + 1}</td>
                {leafKeys.map(lk => (
                  <td key={lk.id} className="border border-white/10">
                    <input
                      className={cellCls}
                      value={r.data[lk.id] || ''}
                      onChange={e => setCell(i, lk.id, e.target.value)}
                      placeholder={lk.label.toLowerCase()}
                    />
                  </td>
                ))}
                <td className="border border-white/10 text-center">
                  <button onClick={() => removeRow(i)} title="Hapus baris" className="text-rose-500 hover:text-rose-300 p-1 rounded hover:bg-rose-500/10">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addHeaderOpen && (
        <AddHeaderModal onCancel={() => setAddHeaderOpen(false)} onAdd={(col) => { handleAddKolom(col); setAddHeaderOpen(false); }} />
      )}

      {deleteHeader && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteHeader(null)} />
          <div className="relative bg-[#1a1f35] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <h3 className="text-lg font-bold text-white">Hapus Kolom?</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-300">Kolom <span className="font-bold text-white">{deleteHeader.label}</span> dan semua data di kolom ini akan dihapus. Aksi ini tidak bisa di-undo setelah Simpan Semua.</p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06]">
              <button onClick={() => setDeleteHeader(null)} className="px-5 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04]">Batal</button>
              <button onClick={() => handleDeleteKolom(deleteHeader.colId)} className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold">Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddHeaderModal({ onCancel, onAdd }: {
  onCancel: () => void;
  onAdd: (col: Wo2Col) => void;
}) {
  const [mode, setMode] = useState<'single' | 'group'>('single');
  const [label, setLabel] = useState('');
  const [subLabels, setSubLabels] = useState<string[]>(['KANAN', 'KIRI']);

  function slug(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || `col_${Date.now()}`;
  }
  function handleApply() {
    if (!label.trim()) return;
    if (mode === 'single') {
      onAdd({ id: slug(label) + '_' + Date.now().toString(36).slice(-4), label: label.trim(), urutan: 0 });
    } else {
      const valid = subLabels.filter(s => s.trim());
      if (valid.length < 2) return;
      const parentId = slug(label) + '_' + Date.now().toString(36).slice(-4);
      onAdd({
        id: parentId,
        label: label.trim(),
        urutan: 0,
        children: valid.map((s, i) => ({ id: parentId + '_' + slug(s), label: s.trim(), urutan: i + 1 })),
      });
    }
  }
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-[#1a1f35] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Tambah Header</h3>
          <button onClick={onCancel} className="text-slate-500 hover:text-white p-1.5 hover:bg-white/[0.05] rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode('single')} className={`px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${mode === 'single' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white/[0.04] text-slate-400 hover:text-white'}`}>
              Header Tunggal
            </button>
            <button type="button" onClick={() => setMode('group')} className={`px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${mode === 'group' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white/[0.04] text-slate-400 hover:text-white'}`}>
              Dengan Sub-Kolom
            </button>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">{mode === 'single' ? 'Nama Header' : 'Nama Header Induk'} *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder={mode === 'single' ? 'Contoh: PANJANG' : 'Contoh: LENGAN'} className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500/40" />
          </div>
          {mode === 'group' && (
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Sub-Kolom (minimal 2)</label>
              <div className="space-y-2">
                {subLabels.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={s} onChange={e => setSubLabels(prev => prev.map((v, j) => j === i ? e.target.value : v))} placeholder={`Sub-kolom ${i + 1}`} className="flex-1 bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500/40" />
                    {subLabels.length > 2 && (
                      <button type="button" onClick={() => setSubLabels(prev => prev.filter((_, j) => j !== i))} className="text-rose-500 hover:text-rose-300 p-2 rounded hover:bg-rose-500/10">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setSubLabels(prev => [...prev, ''])} className="text-xs text-blue-400 border border-blue-500/25 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors font-medium">
                  + Tambah sub-kolom
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06]">
          <button onClick={onCancel} className="px-5 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04]">Batal</button>
          <button onClick={handleApply} disabled={!label.trim()} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold">Apply</button>
        </div>
      </div>
    </div>
  );
}

/* ═══ Tab WO 3 — Detail Order Items ═══ */
// Keterangan can be a single plain string (legacy) or a JSON array of strings (multi-ket).
function parseKets(raw: unknown): string[] {
  if (raw == null) return [''];
  const s = String(raw);
  const trimmed = s.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        const out = arr.map(v => String(v ?? ''));
        return out.length > 0 ? out : [''];
      }
    } catch {}
  }
  return [s];
}
function serializeKets(kets: string[]): string {
  if (!kets || kets.length === 0) return '';
  if (kets.length === 1) return kets[0] || '';
  return JSON.stringify(kets.map(k => k ?? ''));
}

function TabWO3({ wo }: { wo: Row; detailItems: Row[]; specs: Row[]; specBahan: Row[] }) {
  return <TabFormPengiriman wo={wo} />;
}

/* ═══ Tab WO 3 — Form Pengiriman + Promo/Bonus (image #465) ═══ */
type PengirimanRow = {
  id: number | null; urutan: number;
  nama: string; np: string; ukuran: string; keterangan: string; checklist: number;
};

function TabFormPengiriman({ wo }: { wo: Row }) {
  const toast = useToast();
  const [rows, setRows] = useState<PengirimanRow[]>([]);
  const [promo, setPromo] = useState('');
  const [bonus, setBonus] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [items, woFresh] = await Promise.all([
        dbGet<Row>('wo_pengiriman', undefined, { work_order_id: wo.id }),
        dbGet<Row>('work_orders', undefined, { id: wo.id }),
      ]);
      const sorted = items.slice().sort((a, b) => Number(a.urutan) - Number(b.urutan));
      setRows(sorted.length > 0
        ? sorted.map(r => ({
            id: Number(r.id), urutan: Number(r.urutan) || 0,
            nama: String(r.nama || ''), np: String(r.np || ''),
            ukuran: String(r.ukuran || ''), keterangan: String(r.keterangan || ''),
            checklist: Number(r.checklist) || 0,
          }))
        : Array.from({ length: 5 }, (_, i) => ({ id: null, urutan: i + 1, nama: '', np: '', ukuran: '', keterangan: '', checklist: 0 })));
      const fresh = woFresh[0];
      if (fresh) {
        setPromo(String(fresh.pengiriman_promo || ''));
        setBonus(String(fresh.pengiriman_bonus || ''));
      }
    } catch (e) { toast.error('Gagal Muat', String(e)); }
    setLoading(false);
  }, [wo.id, toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function setField(idx: number, field: keyof PengirimanRow, val: string | number) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }
  function addRow() {
    setRows(prev => [...prev, { id: null, urutan: prev.length + 1, nama: '', np: '', ukuran: '', keterangan: '', checklist: 0 }]);
  }
  async function removeRow(idx: number) {
    const row = rows[idx];
    if (row.id) {
      try { await dbDelete('wo_pengiriman', row.id); } catch (e) { toast.error('Gagal', String(e)); return; }
    }
    setRows(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, urutan: i + 1 })));
  }
  async function saveAll() {
    setSaving(true);
    try {
      // Save WO-level promo/bonus
      await dbUpdate('work_orders', wo.id, {
        pengiriman_promo: promo || null,
        pengiriman_bonus: bonus || null,
      });
      // Save rows
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const payload = {
          work_order_id: wo.id, urutan: i + 1,
          nama: r.nama || '', np: r.np, ukuran: r.ukuran || '',
          keterangan: r.keterangan, checklist: r.checklist,
        };
        if (r.id) await dbUpdate('wo_pengiriman', r.id, payload);
        else {
          const newId = await dbCreate('wo_pengiriman', payload);
          setRows(prev => prev.map((row, idx) => idx === i ? { ...row, id: Number(newId) } : row));
        }
      }
      toast.success('Tersimpan', 'Form pengiriman disimpan.');
      await fetchAll();
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  if (loading) return <div className="h-64 bg-white/[0.03] rounded-xl animate-pulse" />;

  const cellCls = 'w-full bg-transparent focus:bg-white/[0.03] focus:outline-none px-2 py-1.5 text-xs text-white placeholder-slate-600';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Form Pengiriman</h2>
        <div className="flex items-center gap-2">
          <button onClick={addRow} className="text-xs font-medium text-blue-300 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">+ Tambah Baris</button>
          <button onClick={saveAll} disabled={saving} className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors shadow-lg shadow-emerald-500/20">
            {saving ? 'Menyimpan...' : 'Simpan Semua'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="rounded-xl border border-white/[0.08] bg-[#111827] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-200 font-bold text-center" style={{ background: '#065f46' }}>
                <th className="border border-white/10 px-2 py-2 w-10">NO</th>
                <th className="border border-white/10 px-2 py-2 min-w-[160px]">NAMA</th>
                <th className="border border-white/10 px-2 py-2 w-20">NP</th>
                <th className="border border-white/10 px-2 py-2 w-20">SIZE</th>
                <th className="border border-white/10 px-2 py-2 min-w-[140px]">KET</th>
                <th className="border border-white/10 px-2 py-2 w-24">CHECKLIST</th>
                <th className="border border-white/10 px-1 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="border border-white/10 text-center text-slate-500 px-2 py-1">{i + 1}</td>
                  <td className="border border-white/10"><input className={cellCls} value={r.nama} onChange={e => setField(i, 'nama', e.target.value)} placeholder="Nama..." /></td>
                  <td className="border border-white/10"><input className={cellCls} value={r.np} onChange={e => setField(i, 'np', e.target.value)} /></td>
                  <td className="border border-white/10"><input className={cellCls} value={r.ukuran} onChange={e => setField(i, 'ukuran', e.target.value)} /></td>
                  <td className="border border-white/10"><input className={cellCls} value={r.keterangan} onChange={e => setField(i, 'keterangan', e.target.value)} /></td>
                  <td className="border border-white/10 text-center">
                    <input type="checkbox" checked={r.checklist === 1} onChange={e => setField(i, 'checklist', e.target.checked ? 1 : 0)} className="w-4 h-4 accent-emerald-500 cursor-pointer" />
                  </td>
                  <td className="border border-white/10 text-center">
                    <button onClick={() => removeRow(i)} title="Hapus baris" className="text-rose-500 hover:text-rose-300 p-1 rounded hover:bg-rose-500/10">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-[#111827] overflow-hidden">
            <div className="text-slate-200 font-bold text-center py-2 text-xs" style={{ background: '#3b82f6' }}>PROMO</div>
            <textarea value={promo} onChange={e => setPromo(e.target.value)} placeholder="Catat promo aktif..." className="w-full min-h-[140px] bg-transparent text-white text-xs px-3 py-2 focus:outline-none resize-none" />
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#111827] overflow-hidden">
            <div className="text-slate-200 font-bold text-center py-2 text-xs" style={{ background: '#3b82f6' }}>BONUS</div>
            <textarea value={bonus} onChange={e => setBonus(e.target.value)} placeholder="Catat bonus (jersey extra, ongkir, dll)..." className="w-full min-h-[140px] bg-transparent text-white text-xs px-3 py-2 focus:outline-none resize-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ Tab WO 4 — Form Permintaan Gudang (image #466) ═══ */
const WO4_ITEMS = [
  'FULL BODY', 'FRONT BODY', 'BACK BODY', 'SLEEVE', 'COMBINATION',
  'COLLAR', 'SLEEVE ENDS', 'SIDE PANTS STRIPE', 'PANTS',
  'AUTENTIC', 'WEBBING', 'WASHTAG', 'ELASTIC PANTS',
  'DTF SPONSOR', 'POLIFLEX', 'DTF SIZE',
];
const WO4_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];

type GudangRow = {
  id: number | null; urutan: number;
  kategori: string; bagian: string; bahan: string; warna: string; kuantitas: number;
  isFixed?: boolean;
};

function TabWO4({ wo }: { wo: Row; detailItems: Row[] }) {
  return <TabFormPermintaanGudang wo={wo} />;
}

function TabFormPermintaanGudang({ wo }: { wo: Row }) {
  const toast = useToast();
  const [rows, setRows] = useState<GudangRow[]>([]);
  const [barangList, setBarangList] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { dbGet('barang').then(setBarangList).catch(() => {}); }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const items = await dbGet<Row>('wo_permintaan_gudang', undefined, { work_order_id: wo.id });
      const sorted = items.slice().sort((a, b) => Number(a.urutan) - Number(b.urutan));
      const byBagian: Record<string, Row> = {};
      for (const r of sorted) byBagian[String(r.bagian || '').toUpperCase()] = r;
      // Assemble: 16 fixed items + 6 fixed sizes + extras
      const assembled: GudangRow[] = [];
      let idx = 1;
      for (const it of WO4_ITEMS) {
        const found = byBagian[it];
        assembled.push({
          id: found ? Number(found.id) : null,
          urutan: idx++, kategori: 'BAHAN_UTAMA',
          bagian: it, bahan: String(found?.bahan || ''),
          warna: String(found?.warna || ''), kuantitas: Number(found?.kuantitas) || 0,
          isFixed: true,
        });
      }
      for (const sz of WO4_SIZES) {
        const found = byBagian[sz];
        assembled.push({
          id: found ? Number(found.id) : null,
          urutan: idx++, kategori: 'MATERIAL_TAMBAHAN',
          bagian: sz, bahan: String(found?.bahan || ''),
          warna: String(found?.warna || ''), kuantitas: Number(found?.kuantitas) || 0,
          isFixed: true,
        });
      }
      // Extras: any items in DB not in the fixed list
      const fixedSet = new Set([...WO4_ITEMS, ...WO4_SIZES].map(s => s.toUpperCase()));
      for (const r of sorted) {
        const b = String(r.bagian || '').toUpperCase();
        if (!fixedSet.has(b)) {
          assembled.push({
            id: Number(r.id), urutan: idx++, kategori: String(r.kategori || 'BAHAN_UTAMA'),
            bagian: String(r.bagian || ''), bahan: String(r.bahan || ''),
            warna: String(r.warna || ''), kuantitas: Number(r.kuantitas) || 0,
            isFixed: false,
          });
        }
      }
      setRows(assembled);
    } catch (e) { toast.error('Gagal Muat', String(e)); }
    setLoading(false);
  }, [wo.id, toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function setField(idx: number, field: keyof GudangRow, val: string | number) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }
  function addRow() {
    setRows(prev => [...prev, { id: null, urutan: prev.length + 1, kategori: 'BAHAN_UTAMA', bagian: '', bahan: '', warna: '', kuantitas: 0, isFixed: false }]);
  }
  async function removeRow(idx: number) {
    const row = rows[idx];
    if (row.isFixed) return;
    if (row.id) {
      try { await dbDelete('wo_permintaan_gudang', row.id); } catch (e) { toast.error('Gagal', String(e)); return; }
    }
    setRows(prev => prev.filter((_, i) => i !== idx));
  }
  async function saveAll() {
    setSaving(true);
    try {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        // Skip fixed rows that have no data (empty bahan/warna/kuantitas)
        if (r.isFixed && !r.bahan && !r.warna && !r.kuantitas && !r.id) continue;
        const payload = {
          work_order_id: wo.id, urutan: i + 1,
          kategori: r.kategori || 'BAHAN_UTAMA',
          bagian: r.bagian || '', bahan: r.bahan || '',
          warna: r.warna || null, kuantitas: Number(r.kuantitas) || 0,
        };
        if (r.id) await dbUpdate('wo_permintaan_gudang', r.id, payload);
        else {
          const newId = await dbCreate('wo_permintaan_gudang', payload);
          setRows(prev => prev.map((row, idx) => idx === i ? { ...row, id: Number(newId) } : row));
        }
      }
      toast.success('Tersimpan', 'Form permintaan gudang disimpan.');
      await fetchAll();
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  if (loading) return <div className="h-64 bg-white/[0.03] rounded-xl animate-pulse" />;

  const cellCls = 'w-full bg-transparent focus:bg-white/[0.03] focus:outline-none px-2 py-1.5 text-xs text-white placeholder-slate-600';
  const bahanOptions = barangList.map(b => ({ value: String(b.nama), label: String(b.nama) }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Form Permintaan Gudang</h2>
        <div className="flex items-center gap-2">
          <button onClick={addRow} className="text-xs font-medium text-blue-300 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors">+ Tambah Baris</button>
          <button onClick={saveAll} disabled={saving} className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors shadow-lg shadow-emerald-500/20">
            {saving ? 'Menyimpan...' : 'Simpan Semua'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-[#111827] overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-200 font-bold text-center" style={{ background: '#f59e0b' }}>
              <th className="border border-white/10 px-2 py-2 w-10" style={{ color: '#0f172a' }}>NO</th>
              <th className="border border-white/10 px-2 py-2 min-w-[180px]" style={{ color: '#0f172a' }}>ITEM</th>
              <th className="border border-white/10 px-2 py-2 min-w-[200px]" style={{ color: '#0f172a' }}>BAHAN</th>
              <th className="border border-white/10 px-2 py-2 min-w-[120px]" style={{ color: '#0f172a' }}>WARNA</th>
              <th className="border border-white/10 px-2 py-2 w-24" style={{ color: '#0f172a' }}>KUANTITAS</th>
              <th className="border border-white/10 px-1 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-white/[0.04] hover:bg-white/[0.02] ${!r.isFixed ? 'bg-blue-500/[0.03]' : ''}`}>
                <td className="border border-white/10 text-center text-slate-500 px-2 py-1">{i + 1}</td>
                <td className="border border-white/10">
                  {r.isFixed ? (
                    <span className="block px-2 py-1.5 text-xs text-slate-200 font-semibold">{r.bagian}</span>
                  ) : (
                    <input className={cellCls} value={r.bagian} onChange={e => setField(i, 'bagian', e.target.value)} placeholder="Nama item extra..." />
                  )}
                </td>
                <td className="border border-white/10 p-1">
                  <SearchableBahanSelect
                    value={r.bahan}
                    options={bahanOptions}
                    onChange={v => setField(i, 'bahan', v)}
                    placeholder="Pilih bahan..."
                  />
                </td>
                <td className="border border-white/10"><input className={cellCls} value={r.warna} onChange={e => setField(i, 'warna', e.target.value)} placeholder="Warna..." /></td>
                <td className="border border-white/10"><input type="text" inputMode="numeric" className={cellCls + ' text-right tabular-nums'} value={r.kuantitas || ''} onChange={e => setField(i, 'kuantitas', Number(e.target.value.replace(/\D/g, '')) || 0)} /></td>
                <td className="border border-white/10 text-center">
                  {!r.isFixed && (
                    <button onClick={() => removeRow(i)} title="Hapus baris" className="text-rose-500 hover:text-rose-300 p-1 rounded hover:bg-rose-500/10">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">* Baris dengan background biru = row extra yang bisa dihapus. Baris fixed (template) tidak bisa dihapus.</p>
    </div>
  );
}
