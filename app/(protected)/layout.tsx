'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Role } from '@/lib/types';

const NAV: Record<Role, { href: string; label: string }[]> = {
  admin: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/orders', label: 'Order' },
    { href: '/kapasitas', label: 'Kapasitas' },
  ],
  cs: [
    { href: '/orders', label: 'Order' },
    { href: '/orders/new', label: 'Input Order' },
    { href: '/kapasitas', label: 'Kapasitas' },
  ],
  produksi: [
    { href: '/production', label: 'Work Board' },
    { href: '/orders', label: 'Order' },
  ],
};

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
        {/* Sliding pill */}
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

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { if (!loading && !user) router.replace('/'); }, [user, loading, router]);

  if (loading || !user) return (
    <div className="min-h-screen grid place-items-center bg-[#09090b]">
      <svg className="animate-spin w-5 h-5 text-zinc-700" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
    </div>
  );

  const items = NAV[user.role];

  return (
    <div className="flex flex-col h-screen bg-[#09090b]">
      {/* Navbar */}
      <header className="shrink-0 relative z-20 border-b border-zinc-800/50">
        <div className="h-14 flex items-center px-6 relative">
          {/* Logo */}
          <Link href={items[0].href} className="shrink-0 ml-2">
            <img src="/logo/new logo.png" alt="AYRES" className="h-11 brightness-0 invert" />
          </Link>

          {/* Center nav — sliding pill */}
          <SlidingNav items={items} pathname={pathname} />

          <div className="flex-1" />

          {/* User */}
          <div className="relative shrink-0">
            <button onClick={() => setOpen(v => !v)}
              className="flex items-center gap-2.5 py-1 pl-1 pr-3 rounded-full hover:bg-zinc-800/60 transition-colors duration-150"
            >
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
                        <p className="text-[11px] text-zinc-500">{user.role === 'admin' ? 'Administrator' : user.role === 'cs' ? 'Customer Service' : 'Produksi'}</p>
                      </div>
                    </div>
                    <div className="p-1">
                      <button onClick={async () => { setOpen(false); await logout(); }}
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

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
