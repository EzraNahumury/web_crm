import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { getUploadDir } from '@/lib/upload-dir';

// Public file server. Reads from UPLOAD_DIR (which lives outside the app
// bundle in production so files survive redeploys). Matches the URL scheme
// `/api/files/<name>` produced by publicUrlFor().
//
// Public by design — the tracking page + Microsoft Office Online iframe
// need to fetch these without a session, and the filename is a random
// nonce (`Date.now()-{6 chars}`) so URLs aren't guessable.

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: parts } = await ctx.params;

    // Reject traversal / absolute segments before touching the filesystem.
    for (const seg of parts) {
      if (!seg || seg.includes('..') || seg.startsWith('/') || seg.includes('\\')) {
        return new NextResponse('Bad path', { status: 400 });
      }
    }

    const uploadDir = getUploadDir();
    const rootResolved = path.resolve(uploadDir);
    const fileResolved = path.resolve(uploadDir, ...parts);

    // Belt-and-braces: after resolution the file must still be under the root.
    if (fileResolved !== rootResolved && !fileResolved.startsWith(rootResolved + path.sep)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const s = await stat(fileResolved);
    if (!s.isFile()) return new NextResponse('Not found', { status: 404 });

    const buf = await readFile(fileResolved);
    const ext = path.extname(fileResolved).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': String(s.size),
      },
    });
  } catch (err) {
    // ENOENT etc. => 404. Any other unexpected error also becomes 404 so we
    // don't leak paths.
    if (err && typeof err === 'object' && 'code' in err && err.code !== 'ENOENT') {
      console.error('/api/files error:', err);
    }
    return new NextResponse('Not found', { status: 404 });
  }
}
