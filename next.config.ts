import type { NextConfig } from "next";

// Allow larger request bodies for spec file imports (Excel / PDF up to 50 MB).
// In Next.js 16.x the body-size limit on the dev/server proxy is read from
// `experimental.proxyClientMaxBodySize` — the error message and public docs
// still reference `middlewareClientMaxBodySize`, but that key is unused; the
// runtime check is in next-server.js against the experimental key.
const LARGE_BODY = '80mb';

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
