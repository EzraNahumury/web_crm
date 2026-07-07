import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { insert, execute } from '@/lib/db';
import { getUploadDir, publicUrlFor } from '@/lib/upload-dir';

// Master Excel import → per-sheet PNG preview.
// For each W-prefixed sheet we:
//   1. Use ExcelJS to clone the master workbook and keep only that sheet
//      (preserving embedded images, fills, merged cells).
//   2. Convert the single-sheet .xlsx to PDF — local: LibreOffice,
//      production fallback: CloudConvert API (also LibreOffice backend,
//      so output is identical).
//   3. Rasterize the PDF to PNG pages via pdf-to-img.
//   4. Save PNG URLs to imported_file_pages so the viewer shows the page
//      images exactly like Excel's print preview.
//   W1.x → wo_spesifikasi (multi specs)
//   W2/3/4 → wo_section_imports (first wins)

// CloudConvert fallback for production (Hostinger managed has no LibreOffice).
// Uses the v2 REST API directly — no SDK needed. Free tier: 25/day.
async function convertViaCloudConvert(buffer: Buffer, filename: string, apiKey: string): Promise<Buffer> {
  const base = 'https://api.cloudconvert.com/v2';
  const auth = { Authorization: `Bearer ${apiKey}` };

  const createRes = await fetch(`${base}/jobs`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tasks: {
        upload: { operation: 'import/upload' },
        convert: {
          operation: 'convert',
          input: 'upload',
          input_format: 'xlsx',
          output_format: 'pdf',
          engine: 'libreoffice',
          pdf_a: false,
        },
        export: { operation: 'export/url', input: 'convert' },
      },
    }),
  });
  if (!createRes.ok) throw new Error(`CloudConvert job create failed: ${await createRes.text()}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job: any = (await createRes.json()).data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploadTask: any = job.tasks.find((t: { name: string }) => t.name === 'upload');
  const form = new FormData();
  for (const [k, v] of Object.entries(uploadTask.result.form.parameters)) {
    form.append(k, String(v));
  }
  form.append('file', new Blob([new Uint8Array(buffer)]), filename);
  const upRes = await fetch(uploadTask.result.form.url, { method: 'POST', body: form });
  if (!upRes.ok && upRes.status !== 201 && upRes.status !== 204) {
    throw new Error(`CloudConvert upload failed: ${upRes.status} ${await upRes.text()}`);
  }

  const waitRes = await fetch(`${base}/jobs/${job.id}/wait`, { headers: auth });
  if (!waitRes.ok) throw new Error(`CloudConvert wait failed: ${await waitRes.text()}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalJob: any = (await waitRes.json()).data;
  if (finalJob.status !== 'finished') {
    throw new Error(`CloudConvert job ${finalJob.status}: ${JSON.stringify(finalJob.tasks?.map((t: { name: string; status: string; message?: string }) => ({ name: t.name, status: t.status, message: t.message })))}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exportTask: any = finalJob.tasks.find((t: { name: string }) => t.name === 'export');
  const fileUrl = exportTask?.result?.files?.[0]?.url;
  if (!fileUrl) throw new Error('CloudConvert export URL missing');
  const pdfRes = await fetch(fileUrl);
  if (!pdfRes.ok) throw new Error(`CloudConvert PDF download failed: ${pdfRes.status}`);
  return Buffer.from(await pdfRes.arrayBuffer());
}
export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const file = fd.get('file') as File | null;
    const workOrderId = String(fd.get('work_order_id') || '');
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
    if (!workOrderId) return NextResponse.json({ error: 'work_order_id required' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadsDir = getUploadDir();
    await mkdir(uploadsDir, { recursive: true });

    const baseName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const masterFileName = `${baseName}.xlsx`;
    const masterUrl = publicUrlFor(masterFileName);
    await writeFile(path.join(uploadsDir, masterFileName), buffer);

    // Discover sheet names via SheetJS (lightweight)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const XLSX = (await import('xlsx-js-style')).default as any;
    const wbProbe = XLSX.read(buffer, { type: 'buffer', bookSheets: true });
    const sheetNames: string[] = wbProbe.SheetNames;

    // Load LibreOffice + pdf-to-img once
    let convertAsync: ((b: Buffer, ext: string) => Promise<Buffer>) | null = null;
    try {
      const libreofficeConvert = await import('libreoffice-convert');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lib = libreofficeConvert as any;
      convertAsync = lib.convertAsync || ((b: Buffer, ext: string) => new Promise((resolve, reject) => {
        lib.convert(b, ext, undefined, (err: Error | null, out: Buffer) => err ? reject(err) : resolve(out));
      }));
    } catch (e) {
      console.warn('libreoffice-convert not available:', e);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ExcelJS = (await import('exceljs')).default as any;

    // Replace prior imports for this WO
    await execute('DELETE FROM `wo_section_imports` WHERE `work_order_id` = ?', [workOrderId]);
    await execute('DELETE FROM `wo_spesifikasi` WHERE `work_order_id` = ? AND `imported_file` IS NOT NULL', [workOrderId]);
    // Remember the master file so "Download All" can return the original upload
    await execute('UPDATE `work_orders` SET `master_import_file` = ?, `master_import_file_name` = ? WHERE `id` = ?', [masterUrl, file.name, workOrderId]);

    type SheetResult = { sheetName: string; target: 'wo1' | 'wo2' | 'wo3' | 'wo4'; pages: number };
    const results: SheetResult[] = [];
    const usedSections = new Set<string>();

    for (const sheetName of sheetNames) {
      const m = String(sheetName).trim().match(/^W([1-4])/i);
      if (!m) continue;
      const woNum = m[1] as '1' | '2' | '3' | '4';
      const target = `wo${woNum}` as 'wo1' | 'wo2' | 'wo3' | 'wo4';
      if (target !== 'wo1' && usedSections.has(target)) continue;

      const safeSheet = String(sheetName).replace(/[^\w.-]/g, '_');

      // Clone master via ExcelJS and remove all sheets except the target one —
      // ExcelJS preserves images/styles/merges through this operation.
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sheetsToRemove = wb.worksheets.filter((ws: any) => ws.name !== sheetName);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const ws of sheetsToRemove) wb.removeWorksheet(ws.id);
      // Force landscape + fit-to-page so the WO 1 spec fits on one PDF page
      // (the layout is too wide for portrait A4).
      if (target === 'wo1') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wsTarget: any = wb.worksheets[0];
        if (wsTarget) {
          wsTarget.pageSetup = {
            ...(wsTarget.pageSetup || {}),
            orientation: 'landscape',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 1,
            paperSize: 9, // A4
            margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 },
          };
        }
      }
      const subBuffer = Buffer.from(await wb.xlsx.writeBuffer());
      const subXlsxName = `${baseName}-${safeSheet}.xlsx`;
      await writeFile(path.join(uploadsDir, subXlsxName), subBuffer);

      // Only WO 1 sheets go through Excel → PDF → PNG rasterization
      // (the WO 1 viewer expects PNG pages for full visual fidelity).
      // WO 2/3/4 sheets stay as plain .xlsx — those tabs render via SheetJS.
      const pages: string[] = [];
      if (target === 'wo1') {
        let pdfBuf: Buffer | null = null;

        // Try local LibreOffice first (dev machine)
        if (convertAsync) {
          try {
            pdfBuf = await convertAsync(subBuffer, '.pdf');
          } catch (e) {
            console.warn(`[wo-import] LibreOffice failed for ${sheetName}:`, e);
          }
        }

        // Fallback to CloudConvert (production where LibreOffice is unavailable)
        if (!pdfBuf && process.env.CLOUDCONVERT_API_KEY) {
          try {
            pdfBuf = await convertViaCloudConvert(subBuffer, `${sheetName}.xlsx`, process.env.CLOUDCONVERT_API_KEY);
          } catch (e) {
            console.warn(`[wo-import] CloudConvert failed for ${sheetName}:`, e);
          }
        }

        if (pdfBuf) {
          try {
            const pdfPath = path.join(uploadsDir, `${baseName}-${safeSheet}.pdf`);
            await writeFile(pdfPath, pdfBuf);
            const { pdf } = await import('pdf-to-img');
            const doc = await pdf(pdfPath, { scale: 3 });
            let i = 1;
            for await (const img of doc) {
              const pageName = `${baseName}-${safeSheet}-p${i}.png`;
              await writeFile(path.join(uploadsDir, pageName), img);
              pages.push(publicUrlFor(pageName));
              i++;
            }
          } catch (e) {
            console.warn(`[wo-import] PDF rasterize failed for ${sheetName}:`, e);
          }
        }
      }

      const sheetUrl = publicUrlFor(subXlsxName);
      const pagesJson = pages.length > 0 ? JSON.stringify(pages) : null;

      if (target === 'wo1') {
        await insert(
          'INSERT INTO `wo_spesifikasi` (`work_order_id`, `nama_spesifikasi`, `imported_file`, `imported_file_name`, `imported_file_pages`) VALUES (?, ?, ?, ?, ?)',
          [workOrderId, String(sheetName), sheetUrl, `${sheetName}.xlsx`, pagesJson]
        );
      } else {
        await insert(
          'INSERT INTO `wo_section_imports` (`work_order_id`, `section`, `imported_file`, `imported_file_name`, `imported_file_pages`) VALUES (?, ?, ?, ?, ?)',
          [workOrderId, target, sheetUrl, `${sheetName}.xlsx`, pagesJson]
        );
        usedSections.add(target);
      }

      results.push({ sheetName: String(sheetName), target, pages: pages.length });
    }

    return NextResponse.json({
      success: true,
      master: masterUrl,
      results,
      converter: convertAsync
        ? 'libreoffice'
        : (process.env.CLOUDCONVERT_API_KEY ? 'cloudconvert' : 'none'),
    });
  } catch (e) {
    console.error('Master import error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
