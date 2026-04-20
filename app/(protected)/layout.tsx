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
    ? 'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors'
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
    href: '/orders', label: 'Orders',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  },
  {
    href: '/work-orders', label: 'Work Orders',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  },
  {
    href: '/produksi', label: 'Produksi',
    icon: <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93s.844.083 1.18-.166l.715-.533a1.125 1.125 0 011.587.141l.773.773a1.125 1.125 0 01.141 1.587l-.533.715c-.249.336-.295.784-.166 1.18.13.396.506.71.93.78l.894.15c.542.09.94.56.94 1.109v1.094c0 .55-.398 1.02-.94 1.11l-.894.149c-.424.07-.764.384-.93.78s-.083.844.166 1.18l.533.715a1.125 1.125 0 01-.141 1.587l-.773.773a1.125 1.125 0 01-1.587.141l-.715-.533a1.125 1.125 0 00-1.18-.166c-.396.13-.71.506-.78.93l-.15.894c-.09.542-.56.94-1.109.94h-1.094c-.55 0-1.02-.398-1.11-.94l-.148-.894a1.125 1.125 0 00-.93-.78 1.125 1.125 0 00-1.18.166l-.715.533a1.125 1.125 0 01-1.587-.141l-.773-.773a1.125 1.125 0 01-.141-1.587l.533-.715c.249-.336.295-.784.166-1.18a1.125 1.125 0 00-.78-.93l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.764-.383.93-.78.13-.395.083-.843-.166-1.18l-.533-.715a1.125 1.125 0 01.141-1.587l.773-.773a1.125 1.125 0 011.587-.141l.715.533c.336.249.784.295 1.18.166.396-.13.71-.506.78-.93l.149-.894zM15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
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
];

/* ═══════════════════════════════════════════════════════════
   ADMIN SIDEBAR LAYOUT
   ═══════════════════════════════════════════════════════════ */

// Map menu names to sidebar hrefs for filtering
const MENU_HREF_MAP: Record<string, string[]> = {
  'Dashboard': ['/dashboard'],
  'Orders': ['/orders'],
  'Work Orders': ['/work-orders'],
  'Produksi': ['/produksi'],
  'Laporan': ['/laporan/produksi', '/laporan/penggunaan-bahan'],
  'Stok': ['/stok'],
  'Settings': ['/setting'],
  'Master Data': ['/master'],
};

function AdminLayout({ user, logout, children }: {
  user: { username: string; role: Role; nama?: string; menuAccess?: string[] };
  logout: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [laporanOpen, setLaporanOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (pathname.startsWith('/laporan')) setLaporanOpen(true);
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
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-[230px] bg-[#0c1120] border-r border-white/[0.06] flex flex-col shrink-0 transform transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className="px-5 h-20 flex items-center justify-center border-b border-white/[0.06] shrink-0">
          <img src="/logo/new logo.png" alt="AYRES" className="h-14 brightness-0 invert" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {filteredNav.map((item) => {
            if (item.children) {
              const childActive = item.children.some(c => pathname === c.href);
              return (
                <div key={item.label}>
                  <button
                    onClick={() => setLaporanOpen(v => !v)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${childActive ? 'text-white bg-white/[0.06]' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'}`}
                  >
                    <span className="shrink-0 opacity-70">{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    <svg className={`w-4 h-4 transition-transform duration-200 opacity-50 ${laporanOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {laporanOpen && (
                    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/[0.06] pl-3">
                      {item.children.map(child => (
                        <Link key={child.href} href={child.href}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${isActive(child.href) ? 'text-white bg-blue-600/80' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <Link key={item.href} href={item.href!}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${isActive(item.href!) ? 'text-white bg-blue-600' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'}`}>
                <span className="shrink-0 opacity-70">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <div className="px-3 py-2 border-t border-white/[0.06] shrink-0">
          <ThemeToggle />
        </div>

        {/* User info */}
        <div className="px-4 py-4 border-t border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-600 grid place-items-center text-white text-[11px] font-bold shrink-0">
              {(user.nama || user.username).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white font-medium truncate">{user.nama || user.username}</p>
              <p className="text-[11px] text-slate-500 capitalize">{user.role}</p>
            </div>
            <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 transition-colors p-1" title="Keluar">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="shrink-0 h-14 flex items-center justify-between px-6 border-b border-white/[0.06] bg-[#0a0e17]">
          <button className="lg:hidden text-slate-400 hover:text-white transition-colors" onClick={() => setMobileOpen(true)}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400 font-medium hidden sm:block">{user.nama || user.username}</span>
            <button className="text-slate-500 hover:text-slate-300 transition-colors p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
            </button>
            <button onClick={handleLogout} className="text-slate-500 hover:text-slate-300 transition-colors p-1" title="Keluar">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" /></svg>
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
