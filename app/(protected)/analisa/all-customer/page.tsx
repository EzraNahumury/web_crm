'use client';
import { useEffect, useMemo, useState } from 'react';

type Item = { paket: string; qty: number };
type Row = {
  id: number;
  no_order: string;
  customer_id: number | null;
  customer_nama: string;
  customer_phone: string;
  customer_alamat: string;
  customer_desa: string;
  customer_kecamatan: string;
  customer_kabupaten: string;
  customer_provinsi: string;
  nominal_order: number;
  dp_desain: number;
  dp_produksi: number;
  kekurangan: number;
  tanggal_order: string;
  items: Item[];
};

const PAGE_SIZE = 25;

const rupiah = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;
const fmtDate = (d: string) => (d ? d.slice(0, 10) : '');

export default function AllCustomerPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/analisa/all-customer');
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.error || 'Gagal memuat data');
        setRows(json.data || []);
        setError('');
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.customer_nama.toLowerCase().includes(q)
      || r.customer_phone.toLowerCase().includes(q)
      || r.customer_provinsi.toLowerCase().includes(q)
      || r.customer_kabupaten.toLowerCase().includes(q)
      || r.customer_kecamatan.toLowerCase().includes(q)
      || r.customer_desa.toLowerCase().includes(q)
      || r.customer_alamat.toLowerCase().includes(q)
      || r.no_order.toLowerCase().includes(q)
      || r.items.some(i => i.paket.toLowerCase().includes(q))
    );
  }, [rows, search]);

  useEffect(() => { setPage(1); }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function handleDownload() {
    if (filtered.length === 0) return;
    setDownloading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const XLSX = (await import('xlsx-js-style')).default as any;
      const sheetData: (string | number)[][] = [];
      sheetData.push([
        'No Order', 'Tanggal Order',
        'Nama Customer', 'No HP',
        'Alamat Lengkap', 'Desa/Kelurahan', 'Kecamatan', 'Kabupaten/Kota', 'Provinsi',
        'Items', 'Total Qty',
        'Nominal Order',
      ]);
      for (const r of filtered) {
        const itemsStr = r.items.map(i => `${i.paket} x ${i.qty}`).join('; ');
        const totalQty = r.items.reduce((s, i) => s + i.qty, 0);
        sheetData.push([
          r.no_order,
          fmtDate(r.tanggal_order),
          r.customer_nama,
          r.customer_phone,
          r.customer_alamat,
          r.customer_desa,
          r.customer_kecamatan,
          r.customer_kabupaten,
          r.customer_provinsi,
          itemsStr,
          totalQty,
          r.nominal_order,
        ]);
      }
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1f2937' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      };
      for (let c = 0; c < sheetData[0].length; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[addr]) ws[addr].s = headerStyle;
      }
      ws['!cols'] = [
        { wch: 12 }, { wch: 12 },
        { wch: 28 }, { wch: 16 },
        { wch: 38 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 22 },
        { wch: 40 }, { wch: 10 },
        { wch: 16 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'All Customer');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `all-customer-${stamp}.xlsx`);
    } catch (e) {
      console.error('Excel download failed:', e);
      alert('Gagal mengunduh Excel: ' + String(e));
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-10 bg-white/[0.03] rounded-lg animate-pulse" />
      <div className="h-12 bg-white/[0.03] rounded-xl animate-pulse" />
      <div className="h-96 bg-white/[0.03] rounded-xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-cyan-500/[0.14] via-blue-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/25 to-cyan-500/5 border border-cyan-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">All Customer</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Data lengkap semua customer yang tercatat di order · Total <strong className="text-white">{rows.length}</strong> order.
              </p>
            </div>
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading || filtered.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {downloading ? 'Menyiapkan...' : `Excel (${filtered.length})`}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <svg className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari nama, no HP, wilayah, no order, paket..."
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#111827] border border-white/[0.06] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1500 }}>
            <thead className="bg-white/[0.02]">
              <tr>
                <Th>No Order</Th>
                <Th>Tanggal</Th>
                <Th>Nama Customer</Th>
                <Th>No HP</Th>
                <Th>Alamat Lengkap</Th>
                <Th>Desa</Th>
                <Th>Kecamatan</Th>
                <Th>Kabupaten/Kota</Th>
                <Th>Provinsi</Th>
                <Th>Items</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Nominal Order</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center">
                    <svg className="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                    <p className="text-sm text-slate-500">
                      {search ? 'Tidak ada hasil untuk pencarian ini.' : 'Belum ada data customer.'}
                    </p>
                  </td>
                </tr>
              ) : (
                pageRows.map(row => {
                  const totalQty = row.items.reduce((s, i) => s + i.qty, 0);
                  return (
                    <tr key={row.id} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors align-top">
                      <Td>
                        <span className="font-mono text-xs text-slate-300">{row.no_order || `ORD-${row.id}`}</span>
                      </Td>
                      <Td>
                        <span className="text-xs text-slate-400 whitespace-nowrap">{fmtDate(row.tanggal_order) || '—'}</span>
                      </Td>
                      <Td>
                        <span className="font-medium text-white">{row.customer_nama || '—'}</span>
                      </Td>
                      <Td>
                        <span className="text-slate-300 whitespace-nowrap">{row.customer_phone || '—'}</span>
                      </Td>
                      <Td>
                        <span className="text-slate-300 block max-w-[280px] line-clamp-2" title={row.customer_alamat}>
                          {row.customer_alamat || '—'}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-slate-300 whitespace-nowrap">{row.customer_desa || '—'}</span>
                      </Td>
                      <Td>
                        <span className="text-slate-300 whitespace-nowrap">{row.customer_kecamatan || '—'}</span>
                      </Td>
                      <Td>
                        <span className="text-slate-300 whitespace-nowrap">{row.customer_kabupaten || '—'}</span>
                      </Td>
                      <Td>
                        <span className="text-slate-300 whitespace-nowrap">{row.customer_provinsi || '—'}</span>
                      </Td>
                      <Td>
                        {row.items.length === 0 ? (
                          <span className="text-slate-500 italic">—</span>
                        ) : (
                          <div className="flex flex-col gap-0.5 max-w-[260px]">
                            {row.items.map((it, i) => (
                              <span key={i} className="text-xs">
                                <span className="text-blue-400 font-medium">{it.paket}</span>
                                <span className="text-slate-400"> × </span>
                                <span className="text-white font-semibold">{it.qty}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </Td>
                      <Td align="right">
                        <span className="text-white font-semibold">{totalQty}</span>
                      </Td>
                      <Td align="right">
                        <span className="text-white whitespace-nowrap">{rupiah(row.nominal_order)}</span>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between flex-wrap gap-3 px-6 py-4 border-t border-white/[0.06]">
            <p className="text-xs text-slate-500">
              Menampilkan {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} dari {filtered.length}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <PageBtn disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</PageBtn>
                {buildPageRange(safePage, totalPages).map((p, i) =>
                  p === '…' ? (
                    <span key={`gap-${i}`} className="px-2 text-slate-600">…</span>
                  ) : (
                    <PageBtn key={p} active={p === safePage} onClick={() => setPage(p as number)}>{p}</PageBtn>
                  )
                )}
                <PageBtn disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</PageBtn>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th className={`text-[11px] text-slate-500 font-medium ${alignCls} px-4 py-3.5 uppercase tracking-wider whitespace-nowrap`}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return <td className={`px-4 py-3 ${alignCls}`}>{children}</td>;
}

function PageBtn({ children, onClick, disabled, active }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[34px] h-[34px] px-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-slate-400 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400'
      }`}
    >
      {children}
    </button>
  );
}

function buildPageRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  if (current > 3) out.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) out.push(p);
  if (current < total - 2) out.push('…');
  out.push(total);
  return out;
}
