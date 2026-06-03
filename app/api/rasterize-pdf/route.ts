import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import path from 'path';

// Lazy-rasterize a previously-uploaded PDF whose pages were never generated.
// Called from the spec viewer when imported_file_pages is missing.
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string' || !url.startsWith('/uploads/')) {
      return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
    }
    const filePath = path.join(process.cwd(), 'public', url);
    const buf = await readFile(filePath);
    const baseName = path.basename(url, path.extname(url));
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    const pages: string[] = [];
    try {
      const { pdf } = await import('pdf-to-img');
      const doc = await pdf(filePath, { scale: 3 });
      let i = 1;
      for await (const img of doc) {
        const pageName = `${baseName}-p${i}.png`;
        await writeFile(path.join(uploadsDir, pageName), img);
        pages.push(`/uploads/${pageName}`);
        i++;
      }
    } catch (e) {
      console.warn('Lazy rasterization failed:', e);
    }
    void buf;
    return NextResponse.json({ pages });
  } catch (e) {
    console.error('Rasterize error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
