'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet, dbCreate, dbDelete } from '@/lib/api-db';
import { useToast } from '@/lib/toast';

interface Lead {
  id: number;
  nama: string;
  jenis_cs?: string;
}

interface FormLeadsRow {
  id: number;
  lead_id: number;
  tanggal: string;
  jumlah_leads: number;
  jumlah_closingan: number;
  created_at?: string;
}

const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDayShort(iso: string): string {
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!m || !d) return iso;
  return `${d} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][m - 1]}`;
}

export default function FormLeadsPage() {
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [rows, setRows] = useState<FormLeadsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(currentYm());

  // Form state.
  const [leadId, setLeadId] = useState('');
  const [tanggal, setTanggal] = useState(todayIsoLocal());
  const [jumlahLeads, setJumlahLeads] = useState('');
  const [jumlahClosingan, setJumlahClosingan] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ls, rs] = await Promise.all([
        dbGet('leads').catch(() => []),
        dbGet('cs_form_leads').catch(() => []),
      ]);
      setLeads(ls as Lead[]);
      const sorted = (rs as FormLeadsRow[]).slice().sort((a, b) =>
        String(b.tanggal).localeCompare(String(a.tanggal)) || Number(b.id) - Number(a.id)
      );
      setRows(sorted);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const leadNameById: Record<number, string> = {};
  for (const l of leads) leadNameById[l.id] = l.nama;

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return `${BULAN_ID[m - 1] || ''} ${y}`;
  }, [month]);

  // Filter rows by month + group by tanggal (untuk rowSpan seperti Line Jahit).
  const filteredRows = useMemo(() => {
    return rows.filter(r =>
      String(r.tanggal || '').slice(0, 7) === month
    );
  }, [rows, month]);

  const groupedByDate = useMemo(() => {
    const g: Record<string, FormLeadsRow[]> = {};
    for (const r of filteredRows) {
      const key = String(r.tanggal).slice(0, 10);
      (g[key] ||= []).push(r);
    }
    return g;
  }, [filteredRows]);

  async function submit() {
    if (!leadId) { toast.warning('Validasi', 'Pilih leads dulu.'); return; }
    if (!tanggal) { toast.warning('Validasi', 'Isi tanggal.'); return; }
    const nL = Number(jumlahLeads) || 0;
    const nC = Number(jumlahClosingan) || 0;
    if (nL === 0 && nC === 0) {
      toast.warning('Validasi', 'Isi setidaknya salah satu jumlah (leads atau closingan).');
      return;
    }
    setSaving(true);
    try {
      await dbCreate('cs_form_leads', {
        lead_id: Number(leadId),
        tanggal,
        jumlah_leads: nL,
        jumlah_closingan: nC,
      });
      setLeadId('');
      setJumlahLeads('');
      setJumlahClosingan('');
      // Keep date supaya operator bisa cepat input beberapa lead di hari yang sama.
      await fetchAll();
      toast.success('Tercatat', `${nL} leads, ${nC} closingan.`);
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  async function handleDelete(r: FormLeadsRow) {
    const nama = leadNameById[r.lead_id] || `#${r.lead_id}`;
    const yes = await toast.confirm({
      title: 'Hapus catatan?',
      message: `${nama} tanggal ${fmtDayShort(r.tanggal)} akan dihapus.`,
      type: 'danger',
      confirmText: 'Ya, Hapus',
    });
    if (!yes) return;
    try {
      await dbDelete('cs_form_leads', r.id);
      await fetchAll();
      toast.deleted('Catatan Dihapus');
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  const totalLeadsAll = filteredRows.reduce((s, r) => s + (Number(r.jumlah_leads) || 0), 0);
  const totalClosinganAll = filteredRows.reduce((s, r) => s + (Number(r.jumlah_closingan) || 0), 0);
  const conversion = totalLeadsAll > 0
    ? Math.round((totalClosinganAll / totalLeadsAll) * 1000) / 10
    : 0;

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
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
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Form Leads CS · {monthLabel}</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Input harian jumlah leads masuk + closingan yang berhasil, per source (leads).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:block">Bulan</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="bg-[#111827] border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500/40 date-input"
            />
            <button
              onClick={() => setMonth(currentYm())}
              className="text-xs font-medium text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-white/10 bg-[#111827] hover:bg-white/[0.04] transition-colors"
            >
              Bulan Ini
            </button>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-transparent bg-[#111827] border border-blue-500/25 p-4">
          <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Total Leads Masuk</p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-white">{totalLeadsAll.toLocaleString('id-ID')}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-transparent bg-[#111827] border border-emerald-500/25 p-4">
          <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Total Closingan</p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-white">{totalClosinganAll.toLocaleString('id-ID')}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-amber-500/10 to-transparent bg-[#111827] border border-amber-500/25 p-4">
          <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">% Konversi</p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-white">{conversion}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[400px_minmax(0,1fr)] gap-5 items-start">
        {/* Form input */}
        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/25 grid place-items-center">
              <svg className="w-4 h-4 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-white">Input Leads Harian</p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Leads *</label>
            <select
              value={leadId}
              onChange={e => setLeadId(e.target.value)}
              className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/40"
            >
              <option value="">— Pilih Leads —</option>
              {leads.map(l => (
                <option key={l.id} value={l.id}>{l.nama}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Tanggal *</label>
            <input
              type="date"
              value={tanggal}
              onChange={e => setTanggal(e.target.value)}
              className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/40 date-input"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Jumlah Leads Masuk</label>
            <input
              type="text"
              inputMode="numeric"
              value={jumlahLeads}
              onChange={e => setJumlahLeads(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/40 tabular-nums"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Jumlah Closingan</label>
            <input
              type="text"
              inputMode="numeric"
              value={jumlahClosingan}
              onChange={e => setJumlahClosingan(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/40 tabular-nums"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setLeadId(''); setJumlahLeads(''); setJumlahClosingan(''); }}
              disabled={saving}
              className="text-sm font-medium text-slate-400 hover:text-white border border-white/10 hover:bg-white/[0.04] disabled:opacity-40 px-4 py-2 rounded-lg transition-colors"
            >
              Reset
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-cyan-500/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {saving ? 'Menyimpan...' : 'Catat'}
            </button>
          </div>
        </div>

        {/* History table — grouped by tanggal (rowSpan) */}
        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <p className="text-sm font-semibold text-white">History Catatan · {monthLabel}</p>
            <p className="text-[11px] text-slate-500">{filteredRows.length} catatan bulan ini</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider border-b border-white/[0.06]">
                  <th className="text-left px-4 py-2.5 w-24">Tanggal</th>
                  <th className="text-left px-4 py-2.5">Leads</th>
                  <th className="text-right px-4 py-2.5">Leads Masuk</th>
                  <th className="text-right px-4 py-2.5">Closingan</th>
                  <th className="text-right px-4 py-2.5">% Konv</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(groupedByDate).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                      Belum ada catatan untuk bulan ini. Isi form di sebelah kiri.
                    </td>
                  </tr>
                ) : (
                  Object.entries(groupedByDate).map(([date, group]) => (
                    group.map((r, i) => {
                      const nL = Number(r.jumlah_leads) || 0;
                      const nC = Number(r.jumlah_closingan) || 0;
                      const pct = nL > 0 ? Math.round((nC / nL) * 1000) / 10 : 0;
                      return (
                        <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                          {i === 0 && (
                            <td rowSpan={group.length} className="px-4 py-2.5 text-slate-300 font-medium align-middle border-r border-white/[0.04]">
                              {fmtDayShort(date)}
                            </td>
                          )}
                          <td className="px-4 py-2.5 text-white">{leadNameById[r.lead_id] || `#${r.lead_id}`}</td>
                          <td className="px-4 py-2.5 text-right text-blue-300 tabular-nums font-semibold">{nL > 0 ? nL : <span className="text-slate-500 font-normal">—</span>}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-300 tabular-nums font-semibold">{nC > 0 ? nC : <span className="text-slate-500 font-normal">—</span>}</td>
                          <td className="px-4 py-2.5 text-right text-amber-300 tabular-nums">{nL > 0 ? `${pct}%` : <span className="text-slate-500">—</span>}</td>
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => handleDelete(r)}
                              title="Hapus catatan"
                              className="text-rose-500 hover:text-rose-300 p-1.5 rounded hover:bg-rose-500/10"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
