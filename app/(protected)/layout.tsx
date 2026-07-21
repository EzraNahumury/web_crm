'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { Role } from '@/lib/types';

function ThemeToggle({ variant = 'sidebar' }: { variant?: 'sidebar' | 'topbar' }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Mode Terang' : 'Mode Gelap';
  const cls = variant === 'sidebar'
    ? 'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[12.5px] font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors border border-white/[0.04] hover:border-white/[0.08]'
    : 'text-slate-500 hover:text-slate-300 transition-colors p-1';
  return (
    <button onClick={toggle} className={cls} title={label} aria-label={label}>
      {isDark ? (
        <svg className={variant === 'sidebar' ? 'w-[18px] h-[18px]' : 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      ) : (
        <svg className={variant === 'sidebar' ? 'w-[18px] h-[18px]' : 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
        </svg>
      )}
      {variant === 'sidebar' && <span>{label}</span>}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
   NON-ADMIN NAV (cs / produksi) — kept from original
   ═══════════════════════════════════════════════════════════ */

const NAV: Record<'cs' | 'produksi', { href: string; label: string }[]> = {
  cs: [
    { href: '/orders', label: 'Order' },
  ],
  produksi: [
    { href: '/orders', label: 'Order' },
  ],
};

/* ═══════════════════════════════════════════════════════════
   ADMIN SIDEBAR NAV
   ═══════════════════════════════════════════════════════════ */

interface SideNavItem {
  href?: string;
  label: string;
  icon: React.ReactNode;
  children?: { href: string; label: string }[];
}

const ICON_CLS = 'w-[18px] h-[18px]';

const ADMIN_NAV: SideNavItem[] = [
  {
    href: '/dashboard', label: 'Dashboard',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  },
  {
    href: '/cs-selling', label: 'CS Selling',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>,
  },
  {
    href: '/antrian-design', label: 'Antrian Design',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" /></svg>,
  },
  {
    href: '/approval-finance', label: 'Approval Finance',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>,
  },
  {
    label: 'CS Order',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
    children: [
      { href: '/orders', label: 'Rincian Order' },
      { href: '/orders/bukti-pembayaran', label: 'Bukti Pembayaran' },
    ],
  },
  {
    href: '/produksi', label: 'Produksi',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93s.844.083 1.18-.166l.715-.533a1.125 1.125 0 011.587.141l.773.773a1.125 1.125 0 01.141 1.587l-.533.715c-.249.336-.295.784-.166 1.18.13.396.506.71.93.78l.894.15c.542.09.94.56.94 1.109v1.094c0 .55-.398 1.02-.94 1.11l-.894.149c-.424.07-.764.384-.93.78s-.083.844.166 1.18l.533.715a1.125 1.125 0 01-.141 1.587l-.773.773a1.125 1.125 0 01-1.587.141l-.715-.533a1.125 1.125 0 00-1.18-.166c-.396.13-.71.506-.78.93l-.15.894c-.09.542-.56.94-1.109.94h-1.094c-.55 0-1.02-.398-1.11-.94l-.148-.894a1.125 1.125 0 00-.93-.78 1.125 1.125 0 00-1.18.166l-.715.533a1.125 1.125 0 01-1.587-.141l-.773-.773a1.125 1.125 0 01-.141-1.587l.533-.715c.249-.336.295-.784.166-1.18a1.125 1.125 0 00-.78-.93l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.764-.383.93-.78.13-.395.083-.843-.166-1.18l-.533-.715a1.125 1.125 0 01.141-1.587l.773-.773a1.125 1.125 0 011.587-.141l.715.533c.336.249.784.295 1.18.166.396-.13.71-.506.78-.93l.149-.894zM15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
  {
    href: '/work-orders', label: 'Work Orders',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  },
  {
    label: 'Monitoring Produksi',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" /></svg>,
    children: [
      { href: '/monitoring-produksi', label: 'Monitoring' },
      { href: '/monitoring-produksi/history', label: 'History Monitoring' },
    ],
  },
  {
    href: '/approval-gudang', label: 'Approval Gudang',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>,
  },
  {
    href: '/crm-deadline-lock', label: 'CRM Deadline Lock',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>,
  },
  {
    label: 'CRM Finishing',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" /></svg>,
    children: [
      { href: '/crm-finishing', label: 'Papan Finishing' },
      { href: '/crm-finishing/history', label: 'History Finishing' },
    ],
  },
  {
    label: 'Laporan',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
    children: [
      { href: '/laporan/produksi', label: 'Produksi' },
      { href: '/laporan/penggunaan-bahan', label: 'Penggunaan Bahan' },
    ],
  },
  {
    href: '/stok', label: 'Stok',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  },
  {
    href: '/setting', label: 'Setting',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
  {
    href: '/master', label: 'Master',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>,
  },
  {
    label: 'Analisa',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" /></svg>,
    children: [
      { href: '/analisa/grafik', label: 'Grafik' },
      { href: '/analisa/all-customer', label: 'All Customer' },
      { href: '/analisa/grafik-cs', label: 'Grafik CS' },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════
   ADMIN SIDEBAR LAYOUT
   ═══════════════════════════════════════════════════════════ */

// Map menu names to sidebar hrefs for filtering
const MENU_HREF_MAP: Record<string, string[]> = {
  'Dashboard': ['/dashboard'],
  'CS Selling': ['/cs-selling'],
  'Antrian Design': ['/antrian-design'],
  'Approval Finance': ['/approval-finance'],
  'CS Order': ['/orders', '/orders/bukti-pembayaran'],
  'Work Orders': ['/work-orders'],
  'Produksi': ['/produksi'],
  'Monitoring Produksi': ['/monitoring-produksi', '/monitoring-produksi/history'],
  'Approval Gudang': ['/approval-gudang'],
  'CRM Deadline Lock': ['/crm-deadline-lock'],
  'CRM Finishing': ['/crm-finishing', '/crm-finishing/history'],
  'Laporan': ['/laporan/produksi', '/laporan/penggunaan-bahan'],
  'Stok': ['/stok'],
  'Settings': ['/setting'],
  'Master Data': ['/master'],
  'Analisa': ['/analisa/grafik', '/analisa/all-customer', '/analisa/grafik-cs'],
};

function AdminLayout({ user, logout, children }: {
  user: { username: string; role: Role; nama?: string; menuAccess?: string[] };
  logout: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [mobileOpen, setMobileOpen] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);

  const toggleMenu = (label: string) =>
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));

  // Auto-expand a parent menu when any of its children matches the current path.
  useEffect(() => {
    setOpenMenus(prev => {
      const next = { ...prev };
      for (const item of ADMIN_NAV) {
        if (!item.children) continue;
        if (item.children.some(c => pathname.startsWith(c.href))) {
          next[item.label] = true;
        }
      }
      return next;
    });
  }, [pathname]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const isActive = (href: string) => pathname === href;

  const handleLogout = async () => { await logout(); router.replace('/'); };

  // Filter nav items based on menuAccess (undefined/empty = full access)
  const hasMenuAccess = (item: SideNavItem): boolean => {
    if (!user.menuAccess || user.menuAccess.length === 0) return true;
    if (item.href) {
      return Object.entries(MENU_HREF_MAP).some(([menu, hrefs]) =>
        user.menuAccess!.includes(menu) && hrefs.includes(item.href!)
      );
    }
    if (item.children) {
      return item.children.some(child =>
        Object.entries(MENU_HREF_MAP).some(([menu, hrefs]) =>
          user.menuAccess!.includes(menu) && hrefs.includes(child.href)
        )
      );
    }
    return false;
  };

  const filteredNav = ADMIN_NAV.filter(hasMenuAccess);

  return (
    <div className="flex h-screen bg-[#0a0e17]">
      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-[244px] bg-[#0c1120] border-r border-white/[0.06] flex flex-col shrink-0 transform transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo — versi baru: logo + wordmark side-by-side, halus,
            tidak ada border pembatas yang berat. */}
        <div className="px-5 h-[72px] flex items-center gap-2 shrink-0">
          <img src="/logo/new logo.png" alt="AYRES" className="h-9 brightness-0 invert opacity-90" />
          <div className="flex flex-col leading-tight">
            <span className="text-[13px] font-bold text-white tracking-tight">AYRES CRM</span>
            <span className="text-[10px] text-slate-500 tracking-wider uppercase">Production</span>
          </div>
        </div>

        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

        {/* Navigation — spacing lebih longgar, active state pakai
            gradient tipis + indicator kiri, hover state halus. */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          <p className="px-3 pb-2 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Menu</p>
          {filteredNav.map((item) => {
            if (item.children) {
              const childActive = item.children.some(c => pathname === c.href);
              const open = !!openMenus[item.label];
              return (
                <div key={item.label}>
                  <button
                    onClick={() => toggleMenu(item.label)}
                    className={`w-full relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                      childActive
                        ? 'text-white bg-white/[0.04]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className={`shrink-0 transition-colors ${childActive ? 'text-blue-400' : 'opacity-70'}`}>{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    <svg className={`w-3.5 h-3.5 transition-transform duration-200 opacity-50 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {open && (
                    <div className="mt-0.5 ml-6 pl-3 border-l border-white/[0.06] space-y-0.5 py-0.5">
                      {item.children.map(child => {
                        const active = isActive(child.href);
                        return (
                          <Link key={child.href} href={child.href}
                            className={`relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[12.5px] font-medium transition-colors ${
                              active
                                ? 'text-blue-300 bg-blue-500/10'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                            }`}>
                            <span className={`w-1.5 h-1.5 rounded-full transition-colors ${active ? 'bg-blue-400' : 'bg-slate-600'}`} />
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            const active = isActive(item.href!);
            return (
              <Link key={item.href} href={item.href!}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                  active
                    ? 'text-white bg-gradient-to-r from-blue-500/20 to-blue-500/[0.02] shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                }`}>
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-blue-400" />}
                <span className={`shrink-0 transition-colors ${active ? 'text-blue-400' : 'opacity-70'}`}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <div className="px-3 pb-2 shrink-0">
          <ThemeToggle />
        </div>

        {/* User card — versi lebih clean, avatar bulat dengan ring
            tipis, chip role kapital kecil di bawah nama. */}
        <div className="mx-3 mb-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 grid place-items-center text-white text-sm font-bold ring-2 ring-emerald-500/20">
                {(user.nama || user.username).charAt(0).toUpperCase()}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0c1120]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-white font-semibold truncate leading-tight">{user.nama || user.username}</p>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-0.5">{user.role}</p>
            </div>
            <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors p-1.5" title="Keluar">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar — sticky, kompak, hanya menampilkan trigger mobile
            dan user chip. Nama page tidak duplicate — heading page-level
            sudah ada di masing-masing route. */}
        <header className="shrink-0 h-14 flex items-center justify-between px-6 border-b border-white/[0.06] bg-[#0a0e17] sticky top-0 z-30 backdrop-blur">
          <button
            className="lg:hidden text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors p-1.5 rounded-lg"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 pr-3 border-r border-white/[0.06]">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 grid place-items-center text-white text-[11px] font-bold">
                {(user.nama || user.username).charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-slate-300 font-medium">{user.nama || user.username}</span>
            </div>
            <button
              onClick={() => setChangePwOpen(true)}
              className="text-slate-500 hover:text-blue-300 hover:bg-blue-500/10 transition-colors p-1.5 rounded-lg"
              title="Ganti Password"
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </button>
            <button
              onClick={handleLogout}
              className="text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors p-1.5 rounded-lg"
              title="Keluar"
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto px-6 py-6 animate-fade-in">
            {children}
          </div>
        </main>
      </div>

      {changePwOpen && (
        <ChangePasswordModal
          userLabel={user.nama || user.username}
          onClose={() => setChangePwOpen(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CHANGE PASSWORD MODAL
   ═══════════════════════════════════════════════════════════ */

function ChangePasswordModal({ userLabel, onClose }: { userLabel: string; onClose: () => void }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  async function handleSave() {
    setMessage(null);
    if (!oldPw || !newPw || !confirmPw) {
      setMessage({ type: 'error', text: 'Semua field wajib diisi.' });
      return;
    }
    if (newPw.length < 6) {
      setMessage({ type: 'error', text: 'Password baru minimal 6 karakter.' });
      return;
    }
    if (newPw !== confirmPw) {
      setMessage({ type: 'error', text: 'Konfirmasi password tidak cocok.' });
      return;
    }
    if (oldPw === newPw) {
      setMessage({ type: 'error', text: 'Password baru harus berbeda dari password lama.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      });
      const json = await res.json();
      if (!json.success) {
        setMessage({ type: 'error', text: json.error || 'Gagal mengganti password.' });
      } else {
        setMessage({ type: 'success', text: 'Password berhasil diganti. Gunakan password baru saat login berikutnya.' });
        setOldPw(''); setNewPw(''); setConfirmPw('');
        setTimeout(() => onClose(), 1800);
      }
    } catch (e) {
      setMessage({ type: 'error', text: String(e) });
    }
    setSaving(false);
  }

  const inputCls = 'w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:border-blue-500/40';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative bg-[#1a1f35] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-toast-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-gradient-to-r from-blue-500/[0.10] to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/25 grid place-items-center">
              <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Ganti Password</h3>
              <p className="text-xs text-slate-500 mt-0.5">Akun: <strong className="text-slate-300">{userLabel}</strong></p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="text-slate-500 hover:text-white transition-colors p-1.5 hover:bg-white/[0.05] rounded-lg disabled:opacity-50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <PwField label="Password Lama *" value={oldPw} setValue={setOldPw} show={showOld} setShow={setShowOld} cls={inputCls} disabled={saving} />
          <PwField label="Password Baru *" value={newPw} setValue={setNewPw} show={showNew} setShow={setShowNew} cls={inputCls} disabled={saving} hint="Minimal 6 karakter." />
          <PwField label="Konfirmasi Password Baru *" value={confirmPw} setValue={setConfirmPw} show={showConfirm} setShow={setShowConfirm} cls={inputCls} disabled={saving} />

          {message && (
            <div className={`text-sm rounded-lg px-3 py-2 border ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                : 'bg-red-500/10 border-red-500/25 text-red-200'
            }`}>
              {message.text}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06] bg-white/[0.015]">
          <button onClick={onClose} disabled={saving}
            className="px-5 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-50">
            Batal
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-500/20">
            {saving ? 'Menyimpan...' : 'Simpan Password Baru'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PwField({
  label, value, setValue, show, setShow, cls, disabled, hint,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
  cls: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-white mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => setValue(e.target.value)}
          disabled={disabled}
          className={cls}
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          tabIndex={-1}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-white transition-colors"
          title={show ? 'Sembunyikan' : 'Tampilkan'}
        >
          {show ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </button>
      </div>
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DEFAULT NAVBAR LAYOUT (cs / produksi) — kept from original
   ═══════════════════════════════════════════════════════════ */

function SlidingNav({ items, pathname }: { items: { href: string; label: string }[]; pathname: string }) {
  const linksRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ x: 0, w: 0, ready: false });

  useEffect(() => {
    if (!linksRef.current) return;
    const links = linksRef.current.querySelectorAll<HTMLElement>('[data-nav]');
    const idx = items.findIndex(i => i.href === pathname);
    const el = links[idx];
    if (!el) return;
    setPill({ x: el.offsetLeft, w: el.offsetWidth, ready: true });
  }, [pathname, items]);

  return (
    <div className="absolute left-1/2 -translate-x-1/2 flex items-center h-full">
      <div ref={linksRef} className="relative flex items-center gap-0.5">
        {pill.ready && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-8 rounded-full bg-zinc-800 border border-zinc-700/50 transition-all duration-300 ease-[cubic-bezier(.4,0,.2,1)]"
            style={{ left: pill.x, width: pill.w }}
          />
        )}
        {items.map(item => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} data-nav
              className={`relative z-10 h-8 flex items-center px-4 rounded-full text-[13px] font-medium transition-colors duration-200
                ${active ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function DefaultLayout({ user, logout, children }: {
  user: { username: string; role: Role };
  logout: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = NAV[user.role as 'cs' | 'produksi'] || NAV.cs;

  const handleLogout = async () => { await logout(); router.replace('/'); };

  return (
    <div className="flex flex-col h-screen bg-[#09090b]">
      <header className="shrink-0 relative z-20 border-b border-zinc-800/50">
        <div className="h-14 flex items-center px-6 relative">
          <Link href={items[0].href} className="shrink-0 ml-2">
            <img src="/logo/new logo.png" alt="AYRES" className="h-11 brightness-0 invert" />
          </Link>
          <SlidingNav items={items} pathname={pathname} />
          <div className="flex-1" />
          <div className="relative shrink-0">
            <button onClick={() => setOpen(v => !v)}
              className="flex items-center gap-2.5 py-1 pl-1 pr-3 rounded-full hover:bg-zinc-800/60 transition-colors duration-150">
              <div className="w-7 h-7 rounded-full bg-indigo-600 grid place-items-center text-white text-[11px] font-semibold">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <span className="text-[13px] text-zinc-400 font-medium">{user.username}</span>
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-40" style={{ animation: 'popIn .15s ease-out' }}>
                  <div className="w-52 rounded-xl bg-[#161618] border border-zinc-800/80 shadow-xl shadow-black/50 overflow-hidden">
                    <div className="p-3 flex items-center gap-3 border-b border-zinc-800/50">
                      <div className="w-9 h-9 rounded-full bg-indigo-600 grid place-items-center text-white text-sm font-semibold shrink-0">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] text-white font-medium truncate">{user.username}</p>
                        <p className="text-[11px] text-zinc-500">{user.role === 'cs' ? 'Customer Service' : 'Produksi'}</p>
                      </div>
                    </div>
                    <div className="p-1">
                      <button onClick={() => { setOpen(false); handleLogout(); }}
                        className="w-full text-left px-3 py-2 rounded-lg text-[13px] text-zinc-500 hover:text-red-400 hover:bg-zinc-800/50 transition-colors">
                        Keluar
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN LAYOUT — delegates by role
   ═══════════════════════════════════════════════════════════ */

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => { if (!loading && !user) router.replace('/'); }, [user, loading, router]);

  if (loading || !user) return (
    <div className="min-h-screen grid place-items-center bg-[#09090b]">
      <svg className="animate-spin w-5 h-5 text-zinc-700" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );

  // Use AdminLayout for all users — sidebar items filtered by menuAccess
  return <AdminLayout user={user} logout={logout}>{children}</AdminLayout>;
}
