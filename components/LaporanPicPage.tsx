'use client';

// Halaman Laporan PIC — form input manual harian (per tanggal) untuk 4 jenis
// laporan. PIC isi angka + catatan, disimpan per (jenis, tanggal) di tabel
// laporan_pic (upsert). Kanan menampilkan preview mirip kartu WhatsApp.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet, dbCreate, dbUpdate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export type PicField = { key: string; label: string; kind: 'number' | 'text'; suffix?: string; placeholder?: string };
export type PicSection = { title: string; fields: PicField[]; computed?: (d: Record<string, string>) => { label: string; value: string }[] };

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtTanggalID(iso: string): string {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${BULAN[m - 1]} ${y}`;
}
export function parsePicNum(v: unknown): number {
  return Number(String(v ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) || 0;
}
export function fmtPicNum(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString('id-ID', { maximumFractionDigits: 1 });
}

export default function LaporanPicPage({ jenis, title, sections }: { jenis: string; title: string; sections: PicSection[] }) {
  const toast = useToast();
  const [tanggal, setTanggal] = useState(todayISO());
  const [data, setData] = useState<Record<string, string>>({});
  const [rowId, setRowId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await dbGet<Row>('laporan_pic', undefined, { jenis, tanggal });
      const row = rows[0];
      if (row) {
        setRowId(Number(row.id));
        let parsed: Record<string, string> = {};
        try { parsed = JSON.parse(String(row.data_json || '{}')) || {}; } catch { parsed = {}; }
        setData(parsed);
      } else { setRowId(null); setData({}); }
    } catch { setRowId(null); setData({}); }
    setLoading(false);
  }, [jenis, tanggal]);
  useEffect(() => { load(); }, [load]);

  const setField = (k: string, v: string) => setData(prev => ({ ...prev, [k]: v }));

  async function handleSave() {
    setSaving(true);
    try {
      const payload = { jenis, tanggal, data_json: JSON.stringify(data) };
      if (rowId) {
        await dbUpdate('laporan_pic', rowId, payload);
      } else {
        // Cek sekali lagi (hindari duplikat kalau baris dibuat berbarengan).
        const existing = await dbGet<Row>('laporan_pic', undefined, { jenis, tanggal }).catch(() => []);
        if (existing[0]) { setRowId(Number(existing[0].id)); await dbUpdate('laporan_pic', Number(existing[0].id), payload); }
        else { const id = await dbCreate('laporan_pic', payload); setRowId(id); }
      }
      toast.success('Tersimpan', `Laporan ${fmtTanggalID(tanggal)} berhasil disimpan.`);
    } catch (e) { toast.error('Gagal Simpan', String(e)); }
    setSaving(false);
  }

  const hasAny = useMemo(() => Object.values(data).some(v => String(v || '').trim() !== ''), [data]);

  const inputCls = 'w-full bg-[#0b0f1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50';
  const labelCls = 'text-[11px] font-semibold text-slate-400 mb-1 block';

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-emerald-500/[0.14] via-emerald-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border border-emerald-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{title}</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">Laporan PIC harian — diisi manual per tanggal.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 bg-[#111827] border border-white/10 rounded-xl px-4 py-2.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Tanggal</span>
            <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="bg-transparent text-white text-sm focus:outline-none" style={{ colorScheme: 'dark' }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Form */}
        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5 space-y-5">
          {loading ? (
            <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-16 bg-white/[0.03] rounded-lg animate-pulse" />)}</div>
          ) : (
            <>
              {sections.map((s, si) => (
                <div key={si} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-emerald-300 uppercase tracking-wide">{s.title}</span>
                    <div className="flex-1 h-px bg-white/[0.06]" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {s.fields.map(f => (
                      <div key={f.key} className={f.kind === 'text' ? 'sm:col-span-2' : ''}>
                        <label className={labelCls}>{f.label}{f.suffix ? <span className="text-slate-600"> ({f.suffix})</span> : null}</label>
                        {f.kind === 'text' ? (
                          <textarea value={data[f.key] || ''} onChange={e => setField(f.key, e.target.value)} rows={2} placeholder={f.placeholder || '—'} className={`${inputCls} resize-y`} />
                        ) : (
                          <input type="text" inputMode="decimal" value={data[f.key] || ''} onChange={e => setField(f.key, e.target.value)} placeholder={f.placeholder || '0'} className={`${inputCls} tabular-nums`} />
                        )}
                      </div>
                    ))}
                  </div>
                  {s.computed && (
                    <div className="flex flex-wrap gap-4 pt-1">
                      {s.computed(data).map((c, ci) => (
                        <div key={ci} className="flex items-baseline gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-400 uppercase">{c.label}</span>
                          <span className="text-sm font-bold text-cyan-300 tabular-nums">{c.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex justify-end pt-2">
                <button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-lg shadow-emerald-500/20 transition-colors">
                  {saving ? 'Menyimpan…' : rowId ? 'Simpan Perubahan' : 'Simpan Laporan'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Preview (mirip kartu WA) */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#0e1f18] p-5">
          <div className="rounded-xl bg-[#0b2a1e] border border-emerald-900/40 p-4 text-slate-100" style={{ backgroundImage: 'radial-gradient(circle at 20% 0%, rgba(16,185,129,0.06), transparent 60%)' }}>
            <h2 className="text-base font-extrabold text-white">Total {title}</h2>
            <p className="text-sm text-slate-300 mt-1">Tgl : {fmtTanggalID(tanggal)}</p>
            <div className="mt-3 space-y-3">
              {sections.map((s, si) => (
                <div key={si}>
                  <p className="text-sm font-extrabold text-emerald-300">{s.title}</p>
                  <div className="mt-0.5 space-y-0.5">
                    {s.fields.map(f => (
                      <p key={f.key} className="text-sm text-slate-200">
                        {f.label} : <span className="font-semibold">{String(data[f.key] || '').trim() || '-'}</span>{f.suffix && String(data[f.key] || '').trim() ? ` ${f.suffix}` : ''}
                      </p>
                    ))}
                    {s.computed && s.computed(data).map((c, ci) => (
                      <p key={`c${ci}`} className="text-sm text-slate-200">{c.label} : <span className="font-semibold text-cyan-300">{c.value}</span></p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {!hasAny && <p className="text-xs text-slate-500 italic mt-3">Belum ada data untuk tanggal ini.</p>}
          </div>
          <p className="text-[11px] text-slate-500 mt-3">Ganti tanggal di atas untuk lihat / edit laporan hari lain.</p>
        </div>
      </div>
    </div>
  );
}
