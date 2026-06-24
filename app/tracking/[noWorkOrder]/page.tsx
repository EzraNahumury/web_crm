'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';

interface StageInfo {
  id: number;
  urutan: number;
  nama: string;
  status: 'BELUM' | 'TERSEDIA' | 'SEDANG' | 'SELESAI';
  started_at: string | null;
  completed_at: string | null;
}

interface TrackingData {
  no_wo: string;
  no_order: string;
  customer_nama: string;
  customer_phone: string;
  paket: string;
  bahan: string;
  jumlah: number;
  keterangan: string;
  tanggal_order: string;
  deadline: string;
  status: string;
  progressPercent: number;
  currentStageName: string;
  stages: StageInfo[];
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Menunggu',
  PROSES_PRODUKSI: 'Proses Produksi',
  SELESAI: 'Selesai',
  TERLAMBAT: 'Terlambat',
};

function fmtDate(d: string) {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return d; }
}

function fmtDateTime(d: string | null) {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return d; }
}

export default function TrackingPage() {
  const params = useParams<{ noWorkOrder: string }>();
  const rawNoWorkOrder = Array.isArray(params?.noWorkOrder) ? params.noWorkOrder[0] : params?.noWorkOrder;
  const noWorkOrder = decodeURIComponent(rawNoWorkOrder || '');

  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTracking = useCallback(async () => {
    if (!noWorkOrder) { setError('No. Work Order tidak valid'); setLoading(false); return; }
    try {
      const res = await fetch(`/api/tracking?no_wo=${encodeURIComponent(noWorkOrder)}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        setError('');
      } else {
        setError(json.error || 'Order tidak ditemukan');
      }
    } catch {
      setError('Gagal memuat data tracking');
    } finally {
      setLoading(false);
    }
  }, [noWorkOrder]);

  useEffect(() => { fetchTracking(); }, [fetchTracking]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchTracking, 30000);
    return () => clearInterval(interval);
  }, [fetchTracking]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f1ea] px-3 sm:px-4 py-6 sm:py-8 text-slate-600">
        <div className="mx-auto max-w-3xl rounded-[20px] border border-white/60 bg-white/70 p-6 sm:p-8 shadow-sm text-center">
          Memuat detail order...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#f5f1ea] px-3 sm:px-4 py-6 sm:py-8">
        <div className="mx-auto max-w-3xl rounded-[20px] border border-white/60 bg-white/80 p-6 sm:p-8 shadow-sm text-center">
          <h1 className="text-2xl font-semibold text-slate-800">Tracking Order</h1>
          <p className="mt-3 text-sm text-red-600">{error || 'Data order tidak ditemukan'}</p>
          <Link href="/" className="mt-6 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white">
            Kembali
          </Link>
        </div>
      </div>
    );
  }

  const pct = data.progressPercent;
  const isComplete = pct >= 100;

  return (
    <div className="min-h-screen bg-[#f5f1ea] px-3 sm:px-4 py-6 sm:py-8 text-slate-700">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-5 sm:mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm uppercase tracking-[0.18em] text-slate-400">Tracking Pesanan</p>
            <h1 className="text-xl sm:text-3xl font-semibold text-slate-900 truncate">{data.customer_nama}</h1>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isComplete ? 'bg-green-50 text-green-700 border border-green-200'
            : data.status === 'TERLAMBAT' ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {isComplete ? 'Selesai' : STATUS_LABELS[data.status] || data.status}
          </span>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
          {/* Left column */}
          <div className="space-y-5">
            {/* Progress overview */}
            <section className="rounded-[20px] sm:rounded-[24px] border border-white/70 bg-white/85 p-4 sm:p-5 shadow-sm">
              <p className="text-sm sm:text-base font-semibold text-slate-800">Status Produksi</p>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-500">Progress produksi pesanan Anda saat ini.</p>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Total progress</span>
                  <span className="font-semibold text-slate-800">{pct}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-400 via-orange-500 to-emerald-500'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[20px] border border-slate-100 bg-[#fcfbf8] p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Tahap Saat Ini</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{data.currentStageName}</p>
                </div>
                <div className="rounded-[20px] border border-slate-100 bg-[#fcfbf8] p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Estimasi Selesai</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{fmtDate(data.deadline)}</p>
                </div>
              </div>
            </section>

            {/* Stage timeline */}
            <section className="rounded-[20px] sm:rounded-[24px] border border-white/70 bg-white/85 p-4 sm:p-5 shadow-sm">
              <p className="text-sm sm:text-base font-semibold text-slate-800">Tahapan Produksi</p>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-500 mb-5">Detail setiap tahap produksi pesanan Anda.</p>

              <div className="space-y-0">
                {data.stages.map((stage, idx) => {
                  const isDone = stage.status === 'SELESAI';
                  const isActive = stage.status === 'SEDANG' || stage.status === 'TERSEDIA';
                  const isLast = idx === data.stages.length - 1;

                  return (
                    <div key={stage.id} className="flex gap-3">
                      {/* Timeline line + dot */}
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isDone ? 'bg-emerald-500 text-white'
                          : isActive ? 'bg-amber-400 text-white ring-4 ring-amber-100'
                          : 'bg-slate-200 text-slate-400'
                        }`}>
                          {isDone ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <span className="text-xs font-bold">{stage.urutan}</span>
                          )}
                        </div>
                        {!isLast && (
                          <div className={`w-0.5 flex-1 min-h-[24px] ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                        )}
                      </div>

                      {/* Content */}
                      <div className={`pb-5 flex-1 ${isLast ? 'pb-0' : ''}`}>
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-semibold ${isDone ? 'text-slate-800' : isActive ? 'text-amber-700' : 'text-slate-400'}`}>
                            {stage.nama}
                          </p>
                          {isActive && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Sedang dikerjakan</span>
                          )}
                        </div>
                        {isDone && stage.completed_at && (
                          <p className="text-xs text-slate-400 mt-0.5">Selesai: {fmtDateTime(stage.completed_at)}</p>
                        )}
                        {isActive && stage.started_at && (
                          <p className="text-xs text-slate-400 mt-0.5">Dimulai: {fmtDateTime(stage.started_at)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Right column */}
          <div className="space-y-5">
            <SideCard title="Informasi Order" rows={[
              ['No. Work Order', data.no_wo],
              ['No. Order', data.no_order || '-'],
              ['Tanggal Order', fmtDate(data.tanggal_order)],
              ['Estimasi Selesai', fmtDate(data.deadline)],
            ]} />

            <SideCard title="Detail Pesanan" rows={[
              ['Paket', data.paket],
              ['Bahan', data.bahan || '-'],
              ['Jumlah', `${data.jumlah} pcs`],
              ['Keterangan', data.keterangan || '-'],
            ]} />

            <SideCard title="Ringkasan Produksi" rows={[
              ['Progress', `${pct}%`],
              ['Tahap Saat Ini', data.currentStageName],
              ['Tahap Selesai', `${data.stages.filter(s => s.status === 'SELESAI').length} / ${data.stages.length}`],
            ]} highlightRow="Progress" />

            <div className="rounded-[20px] sm:rounded-[24px] border border-white/70 bg-white/85 p-4 sm:p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Butuh bantuan?</p>
                  <p className="mt-1 text-xs leading-6 text-slate-500">
                    Hubungi admin atau customer service untuk konfirmasi lebih lanjut.
                  </p>
                  {data.customer_phone && (
                    <a href={`https://wa.me/${data.customer_phone.replace(/^0/, '62')}`} target="_blank" rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      Hubungi via WhatsApp
                    </a>
                  )}
                  <p className="mt-1.5 text-xs text-slate-400">Ref: {data.no_wo}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">Data diperbarui otomatis setiap 30 detik</p>
      </div>
    </div>
  );
}

function SideCard({ title, rows, highlightRow }: { title: string; rows: [string, string][]; highlightRow?: string }) {
  return (
    <section className="rounded-[20px] sm:rounded-[24px] border border-white/70 bg-white/85 p-4 sm:p-5 shadow-sm">
      <p className="text-base font-semibold text-slate-800">{title}</p>
      <div className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3 border-b border-dashed border-slate-100 pb-3 last:border-b-0 last:pb-0">
            <span className="text-sm text-slate-500">{label}</span>
            <span className={`text-right text-sm ${highlightRow === label ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
