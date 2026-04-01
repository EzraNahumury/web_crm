'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiGetOrders } from '@/lib/api';
import { Order } from '@/lib/types';
import { formatDate } from '@/lib/utils';

function fmtMoney(v: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 }).format(v || 0);
}

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetOrders().then(res => {
      if (res.success && res.data) {
        const found = res.data.find(o => String(o.rowIndex) === String(params.id));
        if (found) setOrder(found);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [params.id]);

  if (loading) return (
    <div className="space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-32 bg-white/[0.03] rounded-xl animate-pulse" />)}
    </div>
  );

  if (!order) return (
    <div className="text-center py-20">
      <p className="text-slate-500">Order tidak ditemukan</p>
      <button onClick={() => router.push('/orders')} className="mt-4 text-blue-400 text-sm">Kembali ke Orders</button>
    </div>
  );

  const statusLabel = order.status === 'DONE' ? 'Completed' : order.status === 'IN_PROGRESS' ? 'Confirmed' : 'Pending';
  const statusCls = order.status === 'DONE' ? 'text-emerald-400 bg-emerald-500/10' : order.status === 'IN_PROGRESS' ? 'text-blue-400 bg-blue-500/10' : 'text-amber-400 bg-amber-500/10';
  const trackingUrl = order.trackingLink ? (typeof window !== 'undefined' ? new URL(order.trackingLink, window.location.origin).toString() : order.trackingLink) : '';

  const lbl = 'text-[11px] text-blue-400/70 font-medium uppercase tracking-wider mb-0.5';
  const val = 'text-sm font-medium text-white';

  return (
    <div className="space-y-0 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push('/orders')} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          Kembali ke Orders
        </button>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
            Edit Order
          </button>
          <button className="flex items-center gap-1.5 text-xs text-red-400 border border-red-500/20 bg-red-500/10 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            Hapus Order
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold text-white">Order Details – ORD{String(order.no).padStart(3, '0')}</h1>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusCls}`}>{statusLabel}</span>
      </div>

      {/* Data Customer */}
      <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 mb-4">
        <h2 className="text-base font-bold text-white mb-5">Data Customer</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <div><p className={lbl}>Nama Customer</p><p className={val}>{order.customer}</p></div>
          <div><p className={lbl}>No HP</p><p className={val}>{order.customerPhone || '-'}</p></div>
          <div className="col-span-2"><p className={lbl}>Alamat Lengkap</p><p className={val}>-</p></div>
          <div><p className={lbl}>Desa/Kelurahan</p><p className={val}>-</p></div>
          <div><p className={lbl}>Kecamatan</p><p className={val}>-</p></div>
          <div><p className={lbl}>Kabupaten/Kota</p><p className={val}>-</p></div>
          <div><p className={lbl}>Provinsi</p><p className={val}>-</p></div>
        </div>
      </section>

      {/* Data Order */}
      <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 mb-4">
        <h2 className="text-base font-bold text-white mb-5">Data Order</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <div><p className={lbl}>No Order</p><p className={val}>ORD{String(order.no).padStart(3, '0')}</p></div>
          <div><p className={lbl}>Tanggal Order</p><p className={val}>{formatDate(order.dpProduksi)}</p></div>
          <div><p className={lbl}>No WO</p><p className={val}>{order.noWorkOrder || '-'}</p></div>
          <div>
            <p className={lbl}>Status</p>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusCls}`}>{statusLabel}</span>
          </div>
          <div><p className={lbl}>Nama Tim</p><p className={val}>-</p></div>
          <div><p className={lbl}>Estimasi Deadline</p><p className={val}>{formatDate(order.tglSelesai || order.dlCust)}</p></div>
          <div className="col-span-2"><p className={lbl}>Promo yang Diambil</p><p className={val}>-</p></div>
          <div className="col-span-2"><p className={lbl}>Keterangan</p><p className={val}>{order.keterangan || '-'}</p></div>
        </div>
      </section>

      {/* Items */}
      <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 mb-4">
        <h2 className="text-base font-bold text-white mb-5">Items</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-white/[0.06]">
              <th className="text-[11px] text-slate-500 font-medium text-left pb-3 uppercase tracking-wider">Paket</th>
              <th className="text-[11px] text-slate-500 font-medium text-left pb-3 uppercase tracking-wider">Bahan Kain</th>
            </tr></thead>
            <tbody>
              <tr className="border-b border-white/[0.04]">
                <td className="py-3 text-sm text-blue-400 font-medium">{order.paket1} {order.paket2}</td>
                <td className="py-3 text-sm text-white font-medium">{order.bahan || '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Pembayaran */}
      <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 mb-4">
        <h2 className="text-base font-bold text-white mb-5">Pembayaran</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <div><p className={lbl}>Nominal Order</p><p className={val}>{fmtMoney(order.sallaryProduct)}</p></div>
          <div><p className={lbl}>DP Desain</p><p className={val}>{fmtMoney(0)}</p></div>
          <div><p className={lbl}>DP Produksi</p><p className={val}>{fmtMoney(0)}</p></div>
          <div><p className={lbl}>Kekurangan</p><p className={val}>{fmtMoney(order.sallaryProduct)}</p></div>
        </div>
      </section>

      {/* Link Tracking */}
      <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6">
        <h2 className="text-base font-bold text-white mb-5">Link Tracking</h2>
        {trackingUrl ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-[#0d1117] border border-white/[0.06] px-4 py-3 text-sm text-slate-400 break-all">{trackingUrl}</div>
            <div className="flex gap-2">
              <button onClick={() => { navigator.clipboard.writeText(trackingUrl); }}
                className="flex items-center gap-1.5 text-xs text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded-lg hover:bg-blue-500/10 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                Copy Link
              </button>
              <a href={trackingUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                Buka Tracking
              </a>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Belum ada link tracking untuk order ini.</p>
        )}
      </section>
    </div>
  );
}
