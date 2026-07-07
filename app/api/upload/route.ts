import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getUploadDir, publicUrlFor } from '@/lib/upload-dir';

// Save uploaded files to the persistent upload dir (UPLOAD_DIR env, or
// `<repo>/public/uploads/` for local dev) and return the public URL served
// by /api/files/[...path]/. PDFs are rasterized to PNG pages via pdf-to-img
// so the WO viewer can preview them.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadsDir = getUploadDir();
    await mkdir(uploadsDir, { recursive: true });

    const ext = (path.extname(file.name) || '').toLowerCase();
    const baseName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const safeName = `${baseName}${ext}`;
    const fullPath = path.join(uploadsDir, safeName);

    await writeFile(fullPath, buffer);

    let pages: string[] = [];
    let rasterizeError: string | null = null;
    if (ext === '.pdf') {
      try {
        const { pdf } = await import('pdf-to-img');
        const doc = await pdf(fullPath, { scale: 3 });
        let i = 1;
        for await (const img of doc) {
          const pageName = `${baseName}-p${i}.png`;
          await writeFile(path.join(uploadsDir, pageName), img);
          pages.push(publicUrlFor(pageName));
          i++;
        }
      } catch (e) {
        const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
        console.error('PDF rasterization failed:', msg);
        rasterizeError = msg;
        pages = [];
      }
    }

    return NextResponse.json({
      url: publicUrlFor(safeName),
      originalName: file.name,
      pages,
      rasterizeError,
    });
  } catch (e) {
    console.error('Upload error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
