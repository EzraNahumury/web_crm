import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getUploadDir, publicUrlFor } from '@/lib/upload-dir';

// Lazy-rasterize a previously-uploaded PDF whose PNG pages were never
// generated. Called from the spec viewer when imported_file_pages is empty.
//
// Accepts URLs in either of two formats:
//   - /api/files/{name}    (new — served by /api/files/[...path])
//   - /uploads/{name}      (legacy — used to be served from public/uploads)
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
    }

    // Extract just the filename from either URL format.
    let fileName = '';
    if (url.startsWith('/api/files/')) {
      fileName = decodeURIComponent(url.slice('/api/files/'.length));
    } else if (url.startsWith('/uploads/')) {
      fileName = url.slice('/uploads/'.length);
    } else {
      return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
    }
    if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return NextResponse.json({ error: 'Bad path' }, { status: 400 });
    }

    // Try the persistent upload dir first, then the legacy public/uploads path.
    const uploadsDir = getUploadDir();
    await mkdir(uploadsDir, { recursive: true });
    const primaryPath = path.join(uploadsDir, fileName);
    const legacyPath = path.join(process.cwd(), 'public', 'uploads', fileName);

    let filePath = primaryPath;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _stat = await import('fs/promises').then(m => m.stat(primaryPath));
      void _stat;
    } catch {
      filePath = legacyPath;
    }

    const baseName = path.basename(fileName, path.extname(fileName));

    const pages: string[] = [];
    try {
      const { pdf } = await import('pdf-to-img');
      const doc = await pdf(filePath, { scale: 3 });
      let i = 1;
      for await (const img of doc) {
        const pageName = `${baseName}-p${i}.png`;
        // Always write new pages to the persistent upload dir.
        await writeFile(path.join(uploadsDir, pageName), img);
        pages.push(publicUrlFor(pageName));
        i++;
      }
    } catch (e) {
      console.warn('Lazy rasterization failed:', e);
    }
    return NextResponse.json({ pages });
  } catch (e) {
    console.error('Rasterize error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
