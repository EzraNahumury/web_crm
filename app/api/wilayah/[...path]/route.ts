import { NextResponse } from 'next/server';

// Proxy ke wilayah.id (sumber data 38 provinsi, ter-update Kepmendagri).
// WAJIB lewat server: wilayah.id di-host di Netlify dan TIDAK mengirim header
// Access-Control-Allow-Origin, jadi fetch langsung dari browser diblokir CORS
// (dropdown wilayah jadi kosong). Di sini di-fetch server-side (bebas CORS),
// lalu dikembalikan same-origin ke browser. Sekaligus di-cache 24 jam karena
// data wilayah sangat jarang berubah.
const UPSTREAM = 'https://wilayah.id/api';
const ALLOWED_LEVELS = new Set(['provinces', 'regencies', 'districts', 'villages']);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const segs = Array.isArray(path) ? path : [];

  // Validasi ketat supaya tidak jadi open-proxy: segmen pertama harus level
  // wilayah yang dikenal, dan (kalau ada) segmen kedua harus kode wilayah
  // (digit + titik) berakhiran .json — mis. 11.json, 11.01.json.
  const first = String(segs[0] || '').replace(/\.json$/i, '');
  if (!ALLOWED_LEVELS.has(first) || segs.length > 2) {
    return NextResponse.json({ data: [] }, { status: 400 });
  }
  if (segs.length === 2 && !/^[0-9]+(\.[0-9]+)*\.json$/i.test(segs[1])) {
    return NextResponse.json({ data: [] }, { status: 400 });
  }

  try {
    const res = await fetch(`${UPSTREAM}/${segs.join('/')}`, {
      // ISR data cache: cache respons upstream 24 jam.
      next: { revalidate: 86400 },
    });
    if (!res.ok) return NextResponse.json({ data: [] });
    const json = await res.json();
    return NextResponse.json(json, {
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
    });
  } catch {
    // Upstream down → kembalikan kosong (dropdown kosong, tidak crash).
    return NextResponse.json({ data: [] });
  }
}
