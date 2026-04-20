import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { ToastProvider } from '@/lib/toast';
import { ThemeProvider } from '@/lib/theme-context';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });

export const metadata: Metadata = {
  title: 'Produksi Manager – AYRES',
  description: 'Sistem Manajemen Produksi',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  themeColor: '#09090b',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'AYRES' },
};

// Pre-hydration theme script — prevents flash of wrong theme
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme', t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${geist.variable} antialiased`}>
        <ThemeProvider>
          <AuthProvider><ToastProvider>{children}</ToastProvider></AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
