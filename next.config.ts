import type { NextConfig } from "next";

// Allow larger request bodies untuk import spec Excel/PDF + bukti TF
// base64 saat /api/upload fallback. Di-bump ke 200 MB supaya kasus
// foto TF resolusi tinggi (10+ MB base64) juga aman lewat proxy.
// Di Next.js 16.x, key yang dibaca proxy dev server adalah
// `experimental.proxyClientMaxBodySize` (bukan `middlewareClientMaxBodySize`
// yang sering muncul di error message — key tersebut sudah tidak dipakai).
const LARGE_BODY = '200mb';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nextConfig: NextConfig & Record<string, any> = {
  // pdf-to-img / pdfjs-dist load a worker file from disk. When Next.js bundles
  // them into .next chunks the worker path breaks, so opt these packages out
  // of bundling and load them straight from node_modules.
  serverExternalPackages: ['pdf-to-img', 'pdfjs-dist', 'libreoffice-convert'],
  experimental: {
    proxyClientMaxBodySize: LARGE_BODY,
    serverActions: {
      bodySizeLimit: LARGE_BODY,
    },
  },
};

export default nextConfig;
