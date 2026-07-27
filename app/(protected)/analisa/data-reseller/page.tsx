'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResellerRow = Record<string, any>;

// Kolom yang biasanya ada di detail expand. Kalau ada field di DB
// dengan nama beda, tampil di section "Field Lain" biar tidak hilang.
const MAIN_FIELDS = ['email', 'provinsi', 'wilayah_pemasaran', 'alamat_lengkap',
  'alamat', 'nama_usaha', 'nama_toko', 'status_reseller_ayres',
  'status_reseller', 'jenis_reseller', 'media_penjualan',
  'instagram', 'tiktok', 'instagram_tiktok'];

const IMG_FIELDS = ['foto_ktp', 'foto_profil', 'foto_logo', 'foto_usaha', 'logo_usaha'];

const CHECK_FIELDS = ['data_benar', 'setuju_sk', 'setuju_syarat',
  'bersedia_promo', 'setuju_promo', 'terima_promo'];

const TABLE_FIELDS = new Set([
  'id', 'tanggal', 'created_at', 'nama', 'whatsapp', 'no_hp', 'no_wa',
  'kota', 'status_usaha', 'password', 'updated_at',
  ...MAIN_FIELDS, ...IMG_FIELDS, ...CHECK_FIELDS,
]);

// Kalau path relatif (dimulai /), asumsikan di-host di ayreslab.id.
function fullImgUrl(v: unknown): string {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^https?:\/\//.test(s)) return s;
  if (s.startsWith('/')) return 'https://ayreslab.id' + s;
  return 'https://ayreslab.id/' + s;
}

function fmtDate(v: unknown): string {
  const s = String(v || '');
  if (!s) return '-';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

function pick(row: ResellerRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v);
  }
  return '';
}

function statusBadgeCls(s: string): string {
  const t = s.toLowerCase();
  if (t.includes('sudah') || t.includes('berjualan') || t.includes('aktif')) {
    return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/40';
  }
  if (t.includes('belum')) {
    return 'text-slate-300 bg-slate-500/10 border-slate-500/40';
  }
  return 'text-blue-300 bg-blue-500/10 border-blue-500/40';
}

export default function DataResellerPage() {
  const [rows, setRows] = useState<ResellerRow[]>([]);
  const [tableName, setTableName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errHint, setErrHint] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    setErrHint('');
    try {
      const res = await fetch('/api/reseller/pendaftar');
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Gagal memuat');
        setErrHint(json.hint || '');
      } else {
        setRows(json.data.rows || []);
        setTableName(json.data.table || '');
      }
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      String(r.nama || '').toLowerCase().includes(q)
      || String(pick(r, ['whatsapp', 'no_hp', 'no_wa']) || '').toLowerCase().includes(q)
      || String(r.kota || '').toLowerCase().includes(q)
      || String(r.email || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-rose-500/[0.14] via-red-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500/25 to-rose-500/5 border border-rose-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Data Pendaftar Reseller</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Live dari database <span className="font-mono text-rose-300">ayreslab.id</span> · {rows.length} pendaftar
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-[#111827] px-4 py-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total Pendaftar</p>
              <p className="text-xl font-bold text-white tabular-nums">{rows.length}</p>
            </div>
            <button
              onClick={fetchData}
              className="text-xs font-medium text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-white/10 bg-[#111827] hover:bg-white/[0.04] transition-colors"
              title="Refresh dari DB reseller"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 px-5 py-4 text-sm text-rose-200 space-y-2">
          <p className="font-semibold">Gagal ambil data reseller</p>
          <p className="text-xs font-mono text-rose-300 break-all">{error}</p>
          {errHint && <p className="text-xs text-rose-300/80">{errHint}</p>}
        </div>
      )}

      {!error && (
        <>
          {/* Search */}
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-4">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama / whatsapp / kota / email..."
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-rose-500/40"
              />
            </div>
            {tableName && <p className="text-[10px] text-slate-500 mt-2">Tabel sumber: <span className="font-mono text-slate-400">{tableName}</span></p>}
          </div>

          {/* Table */}
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider border-b border-white/[0.06]">
                    <th className="text-left px-4 py-3 w-16">#</th>
                    <th className="text-left px-4 py-3 w-40">Tanggal</th>
                    <th className="text-left px-4 py-3 min-w-[180px]">Nama</th>
                    <th className="text-left px-4 py-3 min-w-[140px]">Whatsapp</th>
                    <th className="text-left px-4 py-3 min-w-[140px]">Kota</th>
                    <th className="text-left px-4 py-3 min-w-[160px]">Status Usaha</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                        {rows.length === 0 ? 'Belum ada pendaftar.' : 'Tidak ada hasil untuk pencarian tersebut.'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r, idx) => {
                      const id = r.id ?? idx;
                      const isExpanded = expandedId === id;
                      const status = String(r.status_usaha || '');
                      const wa = pick(r, ['whatsapp', 'no_hp', 'no_wa']);
                      return (
                        <React.Fragment key={String(id)}>
                          <tr
                            onClick={() => setExpandedId(isExpanded ? null : id)}
                            className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3 text-slate-500 tabular-nums">{r.id ?? idx + 1}</td>
                            <td className="px-4 py-3 text-slate-400 tabular-nums text-xs">{fmtDate(r.tanggal || r.created_at)}</td>
                            <td className="px-4 py-3 text-white font-medium">{r.nama || '-'}</td>
                            <td className="px-4 py-3 text-slate-300 tabular-nums">{wa || '-'}</td>
                            <td className="px-4 py-3 text-slate-300">{r.kota || '-'}</td>
                            <td className="px-4 py-3">
                              {status ? (
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border ${statusBadgeCls(status)}`}>
                                  {status}
                                </span>
                              ) : <span className="text-slate-500">-</span>}
                            </td>
                            <td className="px-2 py-3 text-slate-500">
                              <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </td>
                          </tr>
                          {isExpanded && <DetailRow row={r} />}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Wrapper import React di top — needed for React.Fragment.
import React from 'react';

function DetailRow({ row }: { row: ResellerRow }) {
  const email = String(row.email || '');
  const provinsi = String(row.provinsi || '');
  const wilayah = String(row.wilayah_pemasaran || '');
  const alamat = pick(row, ['alamat_lengkap', 'alamat']);
  const namaUsaha = pick(row, ['nama_usaha', 'nama_toko']);
  const statusReseller = pick(row, ['status_reseller_ayres', 'status_reseller']);
  const jenisReseller = String(row.jenis_reseller || '');
  const media = String(row.media_penjualan || '');
  const igTt = pick(row, ['instagram_tiktok', 'instagram']);
  const ig = String(row.instagram || '');
  const tt = String(row.tiktok || '');
  const igTtDisplay = igTt || [ig, tt].filter(Boolean).join(' / ') || '';

  const fotoKtp = pick(row, ['foto_ktp']);
  const fotoLogo = pick(row, ['foto_profil', 'foto_logo', 'logo_usaha', 'foto_usaha']);

  const dataBenar = Number(row.data_benar) === 1 || row.data_benar === true;
  const setujuSk = Number(pick(row, ['setuju_sk', 'setuju_syarat']) || 0) === 1 || row.setuju_sk === true || row.setuju_syarat === true;
  const bersediaPromo = Number(pick(row, ['bersedia_promo', 'setuju_promo', 'terima_promo']) || 0) === 1
    || row.bersedia_promo === true || row.setuju_promo === true || row.terima_promo === true;

  // Field yang belum di-render, biar operator bisa lihat data lain kalau ada.
  const otherFields: [string, unknown][] = Object.entries(row).filter(([k, v]) => {
    if (TABLE_FIELDS.has(k)) return false;
    if (v == null || v === '') return false;
    return true;
  });

  return (
    <tr className="border-b border-white/[0.04] bg-white/[0.015]">
      <td colSpan={7} className="px-6 py-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4">
          <Field label="Email" value={email} />
          <Field label="Provinsi" value={provinsi} />
          <Field label="Wilayah Pemasaran" value={wilayah} />
          <Field label="Alamat Lengkap" value={alamat} span={3} />
          <Field label="Nama Usaha/Toko" value={namaUsaha} />
          <Field label="Status Reseller AYRES" value={statusReseller} />
          <Field label="Jenis Reseller" value={jenisReseller} />
          <Field label="Media Penjualan" value={media} />
          <Field label="Instagram / TikTok" value={igTtDisplay} />
          <ImgField label="Foto KTP" value={fotoKtp} />
        </div>

        {fotoLogo && (
          <div className="mt-4">
            <ImgField label="Foto Profil/Logo Usaha" value={fotoLogo} />
          </div>
        )}

        {(dataBenar || setujuSk || bersediaPromo) && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Persetujuan</p>
            <div className="flex flex-wrap gap-3 text-xs">
              {dataBenar && <span className="text-emerald-300">✓ Data benar</span>}
              {setujuSk && <span className="text-emerald-300">✓ Setuju S&amp;K</span>}
              {bersediaPromo && <span className="text-emerald-300">✓ Bersedia terima promo</span>}
            </div>
          </div>
        )}

        {otherFields.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">Field lain ({otherFields.length}) — klik untuk lihat</summary>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-2 text-xs">
              {otherFields.map(([k, v]) => (
                <div key={k}>
                  <p className="text-slate-500 uppercase tracking-wider text-[10px]">{k}</p>
                  <p className="text-slate-300 break-words">{String(v)}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </td>
    </tr>
  );
}

function Field({ label, value, span = 1 }: { label: string; value: string; span?: number }) {
  return (
    <div className={span === 3 ? 'md:col-span-3' : ''}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="text-sm text-white mt-0.5 break-words">{value || <span className="text-slate-500">—</span>}</p>
    </div>
  );
}

function ImgField({ label, value }: { label: string; value: string }) {
  if (!value) return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="text-sm text-slate-500 mt-0.5">—</p>
    </div>
  );
  const url = fullImgUrl(value);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">{label}</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={url} alt={label} className="max-h-32 rounded-lg border border-white/10 object-contain bg-white/[0.02] hover:border-white/20 transition-colors" />
      </a>
    </div>
  );
}
