import path from 'path';

// Resolve the physical folder where uploaded files (master xlsx, PNG pages,
// PDF specs) are stored. On production we want this OUTSIDE the repo
// checkout so files survive a Git-triggered redeploy that would otherwise
// blow away `public/uploads/`.
//
// Set the `UPLOAD_DIR` env var in Hostinger (hPanel → Advanced → Node.js →
// Environment Variables) to a persistent absolute path, e.g.
//   UPLOAD_DIR=/home/u768480753/uploads-crm
// Then create that folder once and chmod 755.
//
// Fallback is `<repo>/public/uploads/` — fine for local dev.
export function getUploadDir(): string {
  const custom = process.env.UPLOAD_DIR?.trim();
  if (custom) return custom;
  return path.join(process.cwd(), 'public', 'uploads');
}

// Public URL that maps back to a file inside the upload dir. Served by
// `/api/files/[...path]/route.ts` which reads UPLOAD_DIR at request time.
export function publicUrlFor(fileName: string): string {
  return `/api/files/${encodeURIComponent(fileName)}`;
}
