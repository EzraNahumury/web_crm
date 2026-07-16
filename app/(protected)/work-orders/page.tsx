'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { invalidateCache } from '@/lib/cache';
import { useToast } from '@/lib/toast';
import { normBagian } from '@/lib/utils';
import { Pagination, paginate } from '@/lib/pagination';
import { sha256Hex } from '@/lib/hash';
import { isVisibleTanggalOrder } from '@/lib/data-cutoff';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;


function fmtDate(d: string) {
  if (!d) return '-';
  const m = String(d).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try { return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; }
}

export default function WorkOrdersPage() {
  const [woList, setWoList] = useState<Row[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editWo, setEditWo] = useState<Row | null>(null);
  const [editCustomer, setEditCustomer] = useState('');
  const [editJumlah, setEditJumlah] = useState('');
  const [editPaket, setEditPaket] = useState('');
  const [editDetailBahan, setEditDetailBahan] = useState<Row[]>([]);
  const [editDeadline, setEditDeadline] = useState('');
  const [editKeterangan, setEditKeterangan] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [page, setPage] = useState(1);
  const router = useRouter();
  const toast = useToast();

  // Filter pending orders by no_order OR customer nama for the picker search
  const filteredPending = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return pendingOrders;
    return pendingOrders.filter((o: Row) =>
      String(o.no_order || '').toLowerCase().includes(q)
      || String(o.customer_nama || '').toLowerCase().includes(q)
    );
  }, [pendingOrders, orderSearch]);

  // Reset picker state whenever the modal closes
  useEffect(() => {
    if (!modalOpen) {
      setOrderSearch('');
      setSelectedOrderId('');
    }
  }, [modalOpen]);

  // Keep a valid selection so "Buat Work Order" is enabled. A single-option
  // native <select> never fires onChange for its lone item, so selectedOrderId
  // would stay '' and the button stays disabled. Default to the first match.
  useEffect(() => {
    if (!modalOpen || filteredPending.length === 0) return;
    if (!filteredPending.some((o: Row) => String(o.id) === selectedOrderId)) {
      setSelectedOrderId(String(filteredPending[0].id));
    }
  }, [modalOpen, filteredPending, selectedOrderId]);

  async function fetchData() {
    setLoading(true);
    try {
      const [wos, orders, items] = await Promise.all([
        dbGet('work_orders'),
        dbGet('orders'),
        dbGet('order_items'),
      ]);
      // Index orders by id
      const orderMap: Record<string, Row> = {};
      for (const o of orders) orderMap[String(o.id)] = o;
      // Group items by order_id
      const itemsByOrder: Record<string, { paket: string[]; bahan: string[]; qty: number }> = {};
      for (const it of items) {
        const key = String(it.order_id);
        if (!itemsByOrder[key]) itemsByOrder[key] = { paket: [], bahan: [], qty: 0 };
        if (it.paket_nama) itemsByOrder[key].paket.push(String(it.paket_nama));
        if (it.bahan_kain) itemsByOrder[key].bahan.push(String(it.bahan_kain));
        itemsByOrder[key].qty += Number(it.qty) || 0;
      }
      // Merge real-time data from orders + order_items
      const merged = wos
        // Sembunyikan shadow WO (wo_confirmed=0) — WO placeholder yang
        // auto-terbentuk pas Bukti Pembayaran, belum di-acknowledge oleh
        // admin lewat modal "Buat WO dari Order". Muncul di daftar
        // pending modal, bukan di tabel utama.
        .filter((w: Row) => Number(w.wo_confirmed) === 1)
        .map((w: Row) => {
          const ord = orderMap[String(w.order_id)];
          const oi = itemsByOrder[String(w.order_id)];
          return {
            ...w,
            customer_nama: ord?.customer_nama || w.customer_nama,
            paket: oi ? oi.paket.join(', ') : w.paket || '-',
            qty: oi ? oi.qty : (Number(w.jumlah) || 0),
            bahan: oi ? oi.bahan.join(', ') : w.bahan || '-',
            deadline: ord?.estimasi_deadline || w.deadline,
            keterangan: ord?.keterangan || w.keterangan,
            tanggal_order: ord?.tanggal_order || w.created_at,
          };
        })
        // Hide legacy data (order sebelum cutoff). Data tetap ada di DB,
        // cuma tidak muncul di tabel. Lihat lib/data-cutoff.ts.
        .filter((w: Row) => isVisibleTanggalOrder(w.tanggal_order));
      setWoList(merged);
    } catch { setWoList([]); }
    setLoading(false);
  }

  async function fetchPendingOrders() {
    try {
      const allOrders = await dbGet('orders');
      const wos = await dbGet('work_orders');
      // Set order_id yang sudah punya WO CONFIRMED (wo_confirmed=1).
      // Shadow WO (wo_confirmed=0) tidak dihitung "sudah punya WO",
      // karena admin masih perlu confirm lewat modal ini.
      const confirmedOrderIds = new Set(
        (wos as Row[])
          .filter(w => Number(w.wo_confirmed) === 1)
          .map(w => w.order_id)
      );
      // Filter:
      //   • order dengan WO confirmed → hide (sudah masuk tabel Work Order)
      //   • status=SELLING → belum siap (CS Order belum isi Rincian Order)
      //   • status=DONE → sudah selesai
      //   • bukti_uploaded harus =1 → baru pantas WO-nya di-confirm
      // Sisanya (shadow WO belum di-confirm, atau order legacy tanpa WO
      // sama sekali) muncul supaya admin bisa acknowledge / buat WO.
      setPendingOrders(
        allOrders.filter((o: Row) => {
          if (confirmedOrderIds.has(o.id)) return false;
          const st = String(o.status || '').toUpperCase();
          if (st === 'SELLING' || st === 'DONE') return false;
          if (Number(o.bukti_uploaded) !== 1) return false;
          if (!isVisibleTanggalOrder(o.tanggal_order)) return false;
          return true;
        })
      );
    } catch { setPendingOrders([]); }
  }

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (modalOpen) fetchPendingOrders(); }, [modalOpen]);

  async function handleCreateWO() {
    if (!selectedOrderId) { alert('Pilih order dulu'); return; }
    setCreating(true);
    try {
      const order = pendingOrders.find((o: Row) => String(o.id) === selectedOrderId);
      if (!order) throw new Error('Order tidak ditemukan');

      // Fetch order items for paket & bahan & qty (dipakai di kedua cabang)
      let paketNama: string = '-';
      let bahanNama: string = '-';
      let totalQty = 0;
      try {
        const items = await dbGet('order_items');
        const orderItems = items.filter((i: Row) => String(i.order_id) === String(order.id));
        if (orderItems.length > 0) {
          paketNama = orderItems.map((i: Row) => String(i.paket_nama || '')).filter(Boolean).join(', ') || '-';
          bahanNama = orderItems.map((i: Row) => String(i.bahan_kain || '')).filter(Boolean).join(', ') || '-';
          totalQty = orderItems.reduce((sum: number, i: Row) => sum + (Number(i.qty) || 0), 0);
        }
      } catch {}

      // Kalau shadow WO sudah ada (auto-terbuat pas Bukti Pembayaran),
      // cukup acknowledge — flip wo_confirmed=1 dan refresh paket/bahan/qty
      // dari order_items terbaru. WO progres row + no_wo + tracking_hash
      // sudah ada, jangan disentuh.
      const wos = await dbGet('work_orders');
      const shadowWo = (wos as Row[]).find(w =>
        Number(w.order_id) === Number(order.id) && Number(w.wo_confirmed) !== 1
      );

      let woNoForToast = '';
      if (shadowWo) {
        await dbUpdate('work_orders', Number(shadowWo.id), {
          paket: paketNama,
          bahan: bahanNama,
          jumlah: totalQty,
          deadline: order.estimasi_deadline
            ? new Date(order.estimasi_deadline).toISOString().split('T')[0]
            : shadowWo.deadline,
          keterangan: order.keterangan || shadowWo.keterangan || '',
          wo_confirmed: 1,
        });
        await dbUpdate('orders', order.id, { status: 'IN_PROGRESS' });
        woNoForToast = String(shadowWo.no_wo || '');
      } else {
        // Tidak ada shadow WO (order legacy atau bukti_uploaded=0 kasus edge).
        // Buat WO baru manual dengan wo_confirmed=1 langsung.
        const now = new Date();
        const prefix = `WO${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const suffixRe = new RegExp(`^${prefix}-(\\d+)$`);
        const maxNum = (wos as Row[]).reduce((max: number, w: Row) => {
          const m = String(w.no_wo || '').match(suffixRe);
          return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        const noWo = `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;

        const stages = await dbGet('production_stages');
        const sortedStages = stages.sort((a: Row, b: Row) => (a.urutan || 0) - (b.urutan || 0));
        const firstStageId = sortedStages.length > 0 ? sortedStages[0].id : null;

        const trackingHash = await sha256Hex(noWo);

        const woId = await dbCreate('work_orders', {
          no_wo: noWo,
          tracking_hash: trackingHash,
          order_id: order.id,
          customer_nama: order.customer_nama,
          paket: paketNama,
          bahan: bahanNama,
          jumlah: totalQty,
          deadline: order.estimasi_deadline ? new Date(order.estimasi_deadline).toISOString().split('T')[0] : null,
          keterangan: order.keterangan || '',
          status: 'PROSES_PRODUKSI',
          current_stage_id: firstStageId,
          wo_confirmed: 1,
        });

        for (const stage of sortedStages) {
          await dbCreate('wo_progress', {
            work_order_id: woId,
            stage_id: stage.id,
            status: stage.id === firstStageId ? 'TERSEDIA' : 'BELUM',
          });
        }

        await dbUpdate('orders', order.id, {
          tracking_link: `/tracking/${trackingHash}`,
          status: 'IN_PROGRESS',
        });
        woNoForToast = noWo;
      }

      invalidateCache('wp_orders', 'wp_dashboard');
      setModalOpen(false);
      setSelectedOrderId('');
      toast.success('Work Order Dibuat', `${woNoForToast} berhasil dibuat dari ${order.no_order}.`);
      fetchData();
    } catch (e) { toast.error('Gagal Membuat WO', String(e)); }
    setCreating(false);
  }

  async function openEditModal(wo: Row) {
    setEditWo(wo);
    setEditCustomer(wo.customer_nama || '');
    setEditJumlah(String(wo.jumlah || 0));
    setEditPaket(wo.paket || '');
    setEditDeadline(wo.deadline ? new Date(wo.deadline).toISOString().split('T')[0] : '');
    setEditKeterangan(wo.keterangan || '');
    setEditModalOpen(true);
    // Fetch detail bahan from order
    try {
      const db = await dbGet('order_detail_bahan');
      setEditDetailBahan(db.filter((d: Row) => String(d.order_id) === String(wo.order_id)));
    } catch { setEditDetailBahan([]); }
  }

  async function handleSaveEdit() {
    if (!editWo) return;
    setEditSaving(true);
    try {
      await dbUpdate('work_orders', editWo.id, {
        customer_nama: editCustomer,
        jumlah: Number(editJumlah) || 0,
        paket: editPaket,
        deadline: editDeadline,
        keterangan: editKeterangan,
        // Saving details from the WO edit modal counts as confirming the
        // WO, which unlocks the Proofing → Approval WO step in produksi.
        wo_confirmed: 1,
      });
      invalidateCache('wp_orders', 'wp_dashboard');
      toast.success('Work Order Diperbarui', `${editWo.no_wo} berhasil diperbarui.`);
      setEditModalOpen(false);
      setEditWo(null);
      fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
    setEditSaving(false);
  }

  const customers = useMemo(() => {
    const set = new Set(woList.map((w: Row) => w.customer_nama));
    return Array.from(set).sort();
  }, [woList]);

  const filtered = useMemo(() => {
    return woList.filter((w: Row) => {
      const matchSearch = !search ||
        w.no_wo?.toLowerCase().includes(search.toLowerCase()) ||
        w.customer_nama?.toLowerCase().includes(search.toLowerCase());
      const matchCustomer = customerFilter === 'ALL' || w.customer_nama === customerFilter;
      return matchSearch && matchCustomer;
    });
  }, [woList, search, customerFilter]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, customerFilter]);
  const paged = paginate(filtered, page);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-10 bg-white/[0.03] rounded-lg animate-pulse" />
      <div className="h-12 bg-white/[0.03] rounded-lg animate-pulse" />
      {[1,2,3].map(i => <div key={i} className="h-16 bg-white/[0.03] rounded-lg animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Work Order</h1>
          <p className="text-sm text-slate-400 mt-1">Lacak semua perintah kerja dan progres produksi.</p>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 border border-white/10 hover:bg-white/[0.04] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Buat WO dari Order
        </button>
      </div>

      {/* Search & Filter */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-4">
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cari berdasarkan No WO atau Customer..."
              className="w-full bg-transparent border-0 text-white placeholder-slate-500 pl-10 pr-4 py-2.5 text-sm focus:outline-none" />
          </div>
          <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
            className="bg-transparent border border-white/10 text-slate-300 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer pr-8 shrink-0">
            <option value="ALL">Semua Customer</option>
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['NO WO','CUSTOMER','PAKET','QTY','TGL ORDER','DEADLINE','STATUS','AKSI'].map(h => (
                  /* BAHAN column hidden, data still fetched */
                  <th key={h} className={`text-[11px] text-slate-500 font-medium ${h === 'QTY' ? 'text-right' : 'text-left'} px-5 py-3.5 uppercase tracking-wider`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-5 py-12 text-center text-sm text-slate-500">Tidak ada work order ditemukan</td></tr>
              ) : (
                paged.slice.map((wo: Row) => {
                  const deadline = wo.deadline ? new Date(wo.deadline) : null;
                  const today = new Date(); today.setHours(0,0,0,0);
                  const daysLeft = deadline ? Math.floor((deadline.getTime() - today.getTime()) / 86400000) : null;
                  const isOverdue = daysLeft !== null && daysLeft < 0 && wo.status !== 'SELESAI';
                  const statusMap: Record<string, { label: string; cls: string }> = {
                    PENDING: { label: 'Pending', cls: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
                    PROSES_PRODUKSI: { label: 'Proses Produksi', cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
                    SELESAI: { label: 'Selesai', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                    TERLAMBAT: { label: 'Terlambat', cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
                  };
                  const st = isOverdue ? statusMap.TERLAMBAT : (statusMap[wo.status] || statusMap.PENDING);
                  return (
                    <tr key={wo.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4">
                        <span className="text-sm text-blue-400 font-medium">{wo.no_wo}</span>
                        {isOverdue && (
                          <svg className="inline-block w-3.5 h-3.5 text-amber-400 ml-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-300">{wo.customer_nama}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">{wo.paket || '-'}</td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-sm text-slate-300 font-semibold tabular-nums">{wo.qty > 0 ? wo.qty : '-'}</span>
                        {wo.qty > 0 && <span className="text-slate-500 text-[11px] ml-1">pcs</span>}
                      </td>
                      {/* BAHAN hidden: wo.bahan still available in data */}
                      <td className="px-5 py-4 text-sm text-slate-400">{fmtDate(wo.tanggal_order)}</td>
                      <td className={`px-5 py-4 text-sm font-medium ${isOverdue ? 'text-red-400' : 'text-slate-400'}`}>
                        {fmtDate(wo.deadline)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap ${st.cls}`}>{st.label}</span>
                          {(wo.wo_confirmed === 0 || wo.wo_confirmed === false) && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-amber-500/30 text-amber-400 bg-amber-500/10 whitespace-nowrap" title="WO belum dikonfirmasi — klik Edit untuk lengkapi detail dan buka gate Approval WO">
                              Belum Konfirmasi
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => router.push(`/work-orders/${wo.id}`)} className="text-slate-500 hover:text-blue-400 transition-colors p-1" title="Lihat">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </button>
                          <button onClick={() => openEditModal(wo)} className="text-slate-500 hover:text-amber-400 transition-colors p-1" title="Edit">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                          </button>
                          <button onClick={async () => {
                            const yes = await toast.confirm({ title: 'Hapus Work Order?', message: `${wo.no_wo} akan dihapus permanen.`, type: 'danger', confirmText: 'Ya, Hapus' });
                            if (!yes) return;
                            try {
                              // Reset order status back to PENDING and remove tracking link
                              await dbUpdate('orders', wo.order_id, { status: 'PENDING', tracking_link: '' });
                              await dbDelete('work_orders', wo.id);
                              invalidateCache('wp_orders', 'wp_dashboard');
                              toast.deleted('Work Order Dihapus', `${wo.no_wo} berhasil dihapus.`);
                              fetchData();
                            } catch (e) { toast.error('Gagal', String(e)); }
                          }} className="text-slate-500 hover:text-red-400 transition-colors p-1" title="Hapus">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination current={paged.current} total={paged.total} count={paged.count} onChange={setPage} />
      </div>

      {/* Modal Buat WO */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-[#141a2e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-bold text-white">Buat Work Order dari Order</h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-6">Pilih order yang akan dikonversi menjadi Work Order dan upload dokumen pendukung (opsional).</p>

            {/* Search box */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-white mb-2">Cari Order</label>
              <div className="relative">
                <svg className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  value={orderSearch}
                  onChange={e => setOrderSearch(e.target.value)}
                  placeholder="Ketik nomor order atau nama customer..."
                  autoComplete="off"
                  autoFocus
                  className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 pl-10 pr-4 py-2.5 rounded-lg text-sm focus:outline-none focus:border-blue-500/40 transition-colors"
                />
              </div>
              {orderSearch && (
                <p className="mt-1.5 text-xs text-slate-500">
                  {filteredPending.length} dari {pendingOrders.length} order cocok
                </p>
              )}
            </div>

            {/* Dropdown (filtered, always-open listbox) */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">Pilih Order</label>
              {pendingOrders.length === 0 ? (
                <div className="w-full bg-[#0d1117] border border-white/10 text-slate-500 rounded-lg px-4 py-6 text-sm text-center">
                  Tidak ada order pending
                </div>
              ) : filteredPending.length === 0 ? (
                <div className="w-full bg-[#0d1117] border border-white/10 text-slate-500 rounded-lg px-4 py-6 text-sm text-center">
                  Tidak ada order yang cocok dengan pencarian
                </div>
              ) : (
                <select
                  value={selectedOrderId}
                  onChange={e => setSelectedOrderId(e.target.value)}
                  size={Math.min(10, filteredPending.length)}
                  className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-blue-500/40 cursor-pointer"
                >
                  {filteredPending.map((o: Row) => (
                    <option key={o.id} value={o.id} className="px-2 py-1">
                      {o.no_order} — {o.customer_nama}
                    </option>
                  ))}
                </select>
              )}
              {selectedOrderId && (
                <p className="mt-2 text-xs text-blue-400">
                  Order dipilih. Klik &quot;Buat Work Order&quot; untuk lanjut.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 mt-8">
              <button onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">
                Batal
              </button>
              <button onClick={handleCreateWO} disabled={creating || !selectedOrderId}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
                {creating ? 'Membuat...' : 'Buat Work Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit WO */}
      {editModalOpen && editWo && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditModalOpen(false)}>
          <div className="bg-[#141a2e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Edit Work Order</h3>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Customer Name</label>
                <input className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/40 transition-colors" value={editCustomer} onChange={e => setEditCustomer(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Jumlah</label>
                <input type="number" className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/40 transition-colors" value={editJumlah} onChange={e => setEditJumlah(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Paket</label>
                <input className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/40 transition-colors" value={editPaket} onChange={e => setEditPaket(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Detail Bahan</label>
                {editDetailBahan.length > 0 ? (
                  <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                    {editDetailBahan.map((d, idx) => (
                      <div key={d.id} className={`flex items-center ${idx !== 0 ? 'border-t border-white/[0.06]' : ''}`}>
                        <span className="text-xs font-medium text-slate-400 w-[140px] shrink-0 px-3 py-2 bg-white/[0.02]">{normBagian(d.bagian)}</span>
                        <span className="flex-1 text-sm text-white px-3 py-2 border-l border-white/[0.06]">{d.bahan}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 py-2">Tidak ada detail bahan dari order.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Deadline</label>
                <input type="date" className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/40 transition-colors" value={editDeadline} onChange={e => setEditDeadline(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Keterangan (Optional)</label>
                <textarea className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/40 transition-colors resize-none" rows={3} value={editKeterangan} onChange={e => setEditKeterangan(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setEditModalOpen(false)}
                className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={editSaving}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {editSaving ? 'Menyimpan...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
