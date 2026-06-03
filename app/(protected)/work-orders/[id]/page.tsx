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

        // Render cells via SheetJS — prefer the sheet whose name matches the
        // imported_file_name (set by the master importer); otherwise sheet 0.
        const sheetTarget = fileName.replace(/\.(xlsx|xls)$/i, '');
        const XLSX = (await import('xlsx-js-style')).default;
        const wb = XLSX.read(buf, { type: 'array', cellStyles: true });
        const wsName = wb.SheetNames.includes(sheetTarget) ? sheetTarget : wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        if (!ws) { if (!cancelled) setError('Sheet kosong'); return; }
        if (!cancelled) setHtml(renderExcelSheet(XLSX, ws));

        // Extract images via ExcelJS so we can overlay them on the table.
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ExcelJS = (await import('exceljs')).default as any;
          const wb2 = new ExcelJS.Workbook();
          await wb2.xlsx.load(buf);
          const sheetTarget = fileName.replace(/\.(xlsx|xls)$/i, '');
          const ws2 = wb2.getWorksheet(sheetTarget) || wb2.worksheets[0];
          if (ws2) {
            // Compute pixel offsets for each column / row index.
            const colCount = ws2.columnCount || 0;
            const rowCount = ws2.rowCount || 0;
            const colPx: number[] = [];
            for (let c = 1; c <= colCount + 50; c++) {
              const col = ws2.getColumn(c);
              colPx.push(((col?.width as number | undefined) || 10) * 7.5);
            }
            const rowPx: number[] = [];
            for (let r = 1; r <= rowCount + 50; r++) {
              const row = ws2.getRow(r);
              rowPx.push(((row?.height as number | undefined) || 15) * 1.33);
            }
            const sumPx = (arr: number[], n: number) => {
              let s = 0;
              for (let i = 0; i < n && i < arr.length; i++) s += arr[i];
              return s;
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const images: any[] = ws2.getImages ? ws2.getImages() : [];
            const next: Overlay[] = [];
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
              next.push({
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
            void colPx; void rowPx; void sumPx;
            if (!cancelled) setOverlays(next);
          }
        } catch (e) {
          console.warn('Excel image extraction failed:', e);
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

  // After the table HTML is in the DOM, look up the actual pixel bounds of the
  // anchor cells so the image overlays line up exactly with the rendered grid.
  useEffect(() => {
    if (!html || overlays.length === 0) return;
    const compute = () => {
      const root = tableWrapRef.current;
      if (!root) return;
      const tableEl = root.querySelector('table');
      if (!tableEl) return;
      const tableRect = tableEl.getBoundingClientRect();
      // Cache cell bounds by row/col with merge awareness — we look up the
      // first td whose anchored area covers a given (r,c).
      const cellAt = (row: number, col: number): DOMRect | null => {
        // Try exact match first.
        const direct = tableEl.querySelector(`td[data-r="${row}"][data-c="${col}"]`) as HTMLElement | null;
        if (direct) return direct.getBoundingClientRect();
        // Scan rows up to `row` for cells that span into (row, col) via row/colSpan.
        const tds = tableEl.querySelectorAll('td[data-r][data-c]');
        for (const td of Array.from(tds) as HTMLElement[]) {
          const r0 = Number(td.dataset.r);
          const c0 = Number(td.dataset.c);
          const rs = Number(td.getAttribute('rowspan') || '1');
          const cs = Number(td.getAttribute('colspan') || '1');
          if (row >= r0 && row < r0 + rs && col >= c0 && col < c0 + cs) {
            return td.getBoundingClientRect();
          }
        }
        return null;
      };
      const out: ResolvedOverlay[] = [];
      for (const ov of overlays) {
        const tlCell = cellAt(ov.tlRow, ov.tlCol);
        if (!tlCell) continue;
        const left = tlCell.left - tableRect.left + ov.tlOffX;
        const top = tlCell.top - tableRect.top + ov.tlOffY;
        let right: number, bottom: number;
        if (ov.brRow != null && ov.brCol != null) {
          const brCell = cellAt(ov.brRow, ov.brCol);
          if (brCell) {
            right = brCell.left - tableRect.left + (ov.brOffX || 0);
            bottom = brCell.top - tableRect.top + (ov.brOffY || 0);
          } else if (ov.extW && ov.extH) {
            right = left + ov.extW;
            bottom = top + ov.extH;
          } else {
            right = left + 100;
            bottom = top + 100;
          }
        } else if (ov.extW && ov.extH) {
          right = left + ov.extW;
          bottom = top + ov.extH;
        } else {
          right = left + 100;
          bottom = top + 100;
        }
        out.push({ url: ov.url, left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) });
      }
      setResolved(out);
    };
    // Wait one frame for layout to settle.
    const raf = requestAnimationFrame(() => compute());
    const onResize = () => compute();
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderExcelSheet(XLSX: any, ws: any): string {
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
    const c = cols[i];
    if (c?.wpx) return c.wpx;
    if (c?.wch) return Math.round(c.wch * 7.5);
    return 80;
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
    const hpx = rows[r]?.hpx || (rows[r]?.hpt ? Math.round(rows[r]!.hpt! * 1.33) : undefined);
    html += `<tr${hpx ? ` style="height:${hpx}px"` : ''}>`;
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
      const [freshSpecs, freshSpecBahan, freshGudang, freshDetail, freshShip] = await Promise.all([
        dbGet('wo_spesifikasi').then(all => all.filter((r: Row) => String(r.work_order_id) === String(wo.id))).catch(() => specs),
        dbGet('wo_spesifikasi_bahan').catch(() => specBahan),
        dbGet('wo_permintaan_gudang').then(all => all.filter((r: Row) => String(r.work_order_id) === String(wo.id))).catch(() => gudangItems),
        dbGet('wo_detail_items').then(all => all.filter((r: Row) => String(r.work_order_id) === String(wo.id))).catch(() => detailItems),
        dbGet('wo_pengiriman').then(all => all.filter((r: Row) => String(r.work_order_id) === String(wo.id))).catch(() => []),
      ]);

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

      // === WO 2: Permintaan Gudang ===
      // Structure derived from specs (same as TabWO2), warna/kuantitas merged from saved gudang data.
      const bahanUtamaRows: { bagian: string; bahan: string; warna: string; kuantitas: number }[] = [];
      const aksesorisPreset: { bagian: string; bahan: string }[] = [];
      for (const spec of freshSpecs) {
        const rows = freshSpecBahan.filter((b: Row) => String(b.spesifikasi_id) === String(spec.id));
        for (const r of rows) bahanUtamaRows.push({ bagian: r.bagian || '', bahan: r.bahan || '-', warna: '', kuantitas: 0 });
        if (spec.tagline) aksesorisPreset.push({ bagian: 'Tagline', bahan: spec.tagline });
        if (spec.authentic) aksesorisPreset.push({ bagian: 'Keaslian', bahan: spec.authentic });
        if (spec.info_ukuran) aksesorisPreset.push({ bagian: 'Info Ukuran', bahan: spec.info_ukuran });
        if (spec.info_logo) aksesorisPreset.push({ bagian: 'Info Logo', bahan: spec.info_logo });
        if (spec.info_packing) aksesorisPreset.push({ bagian: 'Info Packing', bahan: spec.info_packing });
        if (spec.webbing) aksesorisPreset.push({ bagian: 'Webbing', bahan: spec.webbing });
        if (spec.font_nomor) aksesorisPreset.push({ bagian: 'Font & Nomor', bahan: spec.font_nomor });
      }
      const savedBu = freshGudang.filter((r: Row) => r.kategori === 'BAHAN_UTAMA');
      const savedAks = freshGudang.filter((r: Row) => r.kategori === 'AKSESORIS');
      const savedMat = freshGudang.filter((r: Row) => r.kategori === 'MATERIAL_TAMBAHAN');
      // Hydrate bahan utama warna/kuantitas
      for (const row of bahanUtamaRows) {
        const m = savedBu.find((g: Row) => g.bagian === row.bagian && g.bahan === row.bahan);
        if (m) { row.warna = m.warna || ''; row.kuantitas = Number(m.kuantitas) || 0; }
      }
      // Hydrate aksesoris preset rows
      const aksesorisRows: { bagian: string; bahan: string; warna: string; kuantitas: number }[] = aksesorisPreset.map(p => {
        const m = savedAks.find((g: Row) => g.bagian === p.bagian && g.bahan === p.bahan);
        return { ...p, warna: m?.warna || '', kuantitas: Number(m?.kuantitas) || 0 };
      });
      // Extra aksesoris (saved but not in preset)
      const presetKeys = new Set(aksesorisPreset.map(r => `${r.bagian}|${r.bahan}`));
      const extraAksRows = savedAks
        .filter((g: Row) => !presetKeys.has(`${g.bagian}|${g.bahan}`))
        .map((g: Row) => ({ bagian: g.bagian || '', bahan: g.bahan || '', warna: g.warna || '', kuantitas: Number(g.kuantitas) || 0 }));
      const allAks = [...aksesorisRows, ...extraAksRows];
      const matRows = savedMat.map((g: Row) => ({ bagian: g.bagian || '', bahan: g.bahan || '', warna: g.warna || '', kuantitas: Number(g.kuantitas) || 0 }));

      const hasWo2Data = bahanUtamaRows.length > 0 || allAks.length > 0 || matRows.length > 0;
      if (hasWo2Data) {
        if (!firstPage) pdf.addPage();
        firstPage = false;
        pdf.setFontSize(14);
        pdf.text(`FORM PERMINTAAN GUDANG - ${customer.toUpperCase()}`, 14, 18);
        pdf.setFontSize(10);
        pdf.text(`No WO: ${woName}`, 14, 26);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allWo2Rows: any[] = [];
        let no = 1;
        for (const r of bahanUtamaRows) {
          allWo2Rows.push([String(no++), r.bagian, r.bahan, r.warna, String(r.kuantitas)]);
        }
        if (allAks.length > 0) {
          allWo2Rows.push([{ content: 'AKSESORIS', colSpan: 5, styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
          for (const r of allAks) {
            allWo2Rows.push([String(no++), r.bagian, r.bahan, r.warna, String(r.kuantitas)]);
          }
        }
        if (matRows.length > 0) {
          allWo2Rows.push([{ content: 'MATERIAL TAMBAHAN', colSpan: 5, styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
          for (const r of matRows) {
            allWo2Rows.push([String(no++), r.bagian, r.bahan, r.warna, String(r.kuantitas)]);
          }
        }
        autoTable(pdf, {
          startY: 32,
          head: [['NO', 'BAGIAN', 'BAHAN', 'WARNA', 'KUANTITAS']],
          body: allWo2Rows,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [30, 58, 95] },
        });
      }

      // === WO 3: Detail Order Items ===
      if (freshDetail.length > 0) {
        if (!firstPage) pdf.addPage();
        firstPage = false;
        pdf.setFontSize(14);
        pdf.text(`DETAIL ORDER ITEMS - ${woName}`, 14, 18);
        pdf.setFontSize(10);
        pdf.text(`Customer: ${customer}`, 14, 26);

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

      // === WO 4: Form Pengiriman ===
      if (freshDetail.length > 0) {
        if (!firstPage) pdf.addPage();
        firstPage = false;
        pdf.setFontSize(14);
        pdf.text(`FORM PENGIRIMAN ${customer.toUpperCase()} (${paket})`, 14, 18);

        const shipMap: Record<string, Row> = {};
        for (const s of freshShip) shipMap[String(s.urutan)] = s;

        autoTable(pdf, {
          startY: 26,
          head: [['NO', 'NAMA', 'NP', 'SIZE', 'KET', 'BONUS', 'CHECK']],
          body: freshDetail.map((item: Row, i: number) => {
            const existing = shipMap[String(i + 1)];
            const kets = parseKets(item.keterangan).filter(k => k.trim()).join(' | ');
            return [i + 1, item.nama || '', item.np || '', item.ukuran || '', kets, existing?.bonus || '', (existing?.checklist === 1 || existing?.checklist === true) ? 'v' : ''];
          }),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [30, 58, 95] },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const finalY = ((pdf as any).lastAutoTable?.finalY || 100) + 20;
        pdf.setFontSize(10);
        pdf.text('Dibuat Oleh,', 14, finalY);
        pdf.text('Dicek Oleh,', 85, finalY);
        pdf.text('Diterima Oleh,', 155, finalY);
        pdf.text('( Admin )', 14, finalY + 25);
        pdf.text('( QC / Packing )', 85, finalY + 25);
        pdf.text(`( ${customer} )`, 155, finalY + 25);
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
          <input ref={masterFileRef} type="file" accept=".xlsx,.xls" onChange={handleImportMaster} className="hidden" />
          <button
            onClick={() => masterFileRef.current?.click()}
            disabled={importingMaster}
            title="Upload satu Excel — sheets W1.x → WO 1 (multi spec), W2/W3/W4 → tab masing-masing"
            className="flex items-center gap-1.5 text-xs text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 rounded-full hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12m4.5-4.5v13.5" /></svg>
            {importingMaster ? 'Mengimport...' : 'Import Master Excel'}
          </button>
          <button
            onClick={handleDownloadAllPDF}
            disabled={downloadingAll}
            title="Download satu PDF gabungan WO 1 - WO 4"
            className="flex items-center gap-1.5 text-xs text-blue-400 border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 rounded-full hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            {downloadingAll ? 'Menyiapkan...' : 'Download All'}
          </button>
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
        paket: paket || null,
        jumlah: Number(jumlah) || 0,
        dokumen_desain: dokDesain || null, dokumen_pattern: dokPattern || null,
        tagline, authentic, info_ukuran: infoUkuran, info_logo: infoLogo,
        info_packing: infoPacking, webbing, font_nomor: fontNomor,
        keterangan, keterangan_jahit: keteranganJahit,
        approval_admin: approvalAdmin,
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
    setBahanRows([{ id: 1, bagian: '', bahan: '' }]);
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
  useEffect(() => { dbGet('barang').then(setBarangList).catch(() => {}); }, []);

  async function openCreateDrawer() {
    // Pre-fill paket from the WO's first paket value (user can change via dropdown)
    setPaket(String(wo.paket || '').split(',')[0].trim());
    setJumlah('');
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
        paket: paket || null,
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
        <input ref={importFileRef} type="file" accept=".pdf,application/pdf" onChange={handleImportSpec} className="hidden" />
        <button
          onClick={() => importFileRef.current?.click()}
          disabled={importing}
          className="flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12m4.5-4.5v13.5" /></svg>
          {importing ? 'Mengimport...' : 'Import Spec (PDF)'}
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
          <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12m4.5-4.5v13.5" /></svg>
          <p className="text-sm font-semibold text-white mb-1">Belum ada lembar spesifikasi</p>
          <p className="text-xs text-slate-500 mb-4">Import file PDF untuk memulai.</p>
          <button
            onClick={() => importFileRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {importing ? 'Mengimport...' : 'Import Spec'}
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
          {/* Selected spec card - displayed directly */}
          {specs.filter((spec: Row) => spec.id === selectedSpecId).map((spec: Row) => spec.imported_file ? (
            <ImportedSpecViewer key={spec.id} spec={spec} />
          ) : (
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
                          <p className="text-xs mt-1 min-h-[140px]"></p>
                        </div>
                        <div className="border border-black rounded p-2">
                          <p className="text-[10px] font-bold text-center bg-blue-900 text-white px-1">FONT & NUMBER</p>
                          <p className="text-xs mt-1 min-h-[140px]">{spec.font_nomor || '-'}</p>
                        </div>
                      </div>
                      <div className="mt-2 bg-green-100 text-black text-xs font-bold px-2 py-1 inline-block border border-black min-w-[260px]">
                        DEADLINE :&nbsp;
                      </div>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="border border-black overflow-hidden">
                        {[['NAMA', wo.customer],['PAKET', spec.paket || wo.paket],['JUMLAH', `${spec.jumlah || 0} PCS`]].map(([k,v]) => (
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
  return <WoImportTab wo={wo} section="wo2" accept=".xlsx,.xls,.pdf" title="Permintaan Gudang" helper="Import file Excel (.xlsx) atau PDF — preview muncul otomatis setelah upload." />;
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
  return <WoImportTab wo={wo} section="wo3" accept=".xlsx,.xls,.pdf" title="Detail Order Items" helper="Import file Excel (.xlsx) atau PDF — preview muncul otomatis setelah upload." />;
}

/* ═══ Tab WO 4 — Form Pengiriman ═══ */
function TabWO4({ wo }: { wo: Row; detailItems: Row[] }) {
  return <WoImportTab wo={wo} section="wo4" accept=".xlsx,.xls,.pdf" title="Form Pengiriman" helper="Import file Excel (.xlsx) atau PDF — preview muncul otomatis setelah upload." />;
}
