'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { invalidateCache } from '@/lib/cache';
import { useToast } from '@/lib/toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fmtRp(n: number) {
  if (!n) return '-';
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtRpPlain(n: number) {
  return new Intl.NumberFormat('id-ID').format(n);
}
function parseRp(s: string): number {
  return parseInt(s.replace(/\D/g, ''), 10) || 0;
}
function fmtDateID(iso: string): string {
  if (!iso) return '';
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return `${parseInt(m[3], 10)} ${BULAN[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

interface ItemLine { id: number; nama: string; qty: number; harga: number }
interface DpLine { tanggal: string; tunai: number; trf: number; existingId?: number; tipe?: string; urutan?: number }

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  // Optional order to pre-fill from CS Selling handoff. If omitted, users can
  // pick from a dropdown inside the modal.
  seedOrderId?: number | null;
}

export default function PembayaranModal({ open, onClose, onSaved, seedOrderId }: Props) {
  const toast = useToast();
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Bootstrap data
  const [orders, setOrders] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [leads, setLeads] = useState<Row[]>([]);
  const [pickedOrderId, setPickedOrderId] = useState<string>('');

  // Header
  const [nama, setNama] = useState('');
  const [alamat, setAlamat] = useState('');
  const [leadId, setLeadId] = useState<string>('');
  const [pembayTunai, setPembayTunai] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'bank' | ''>('');

  // Item lines
  const [itemLines, setItemLines] = useState<ItemLine[]>([]);

  // Ekspedisi
  const [ekspNama, setEkspNama] = useState('');
  const [ekspKg, setEkspKg] = useState<string>('');
  const [ekspBiaya, setEkspBiaya] = useState(0);

  // DP schedule (4 slots)
  const [dpLines, setDpLines] = useState<DpLine[]>([
    { tanggal: '', tunai: 0, trf: 0 },
    { tanggal: '', tunai: 0, trf: 0 },
    { tanggal: '', tunai: 0, trf: 0 },
    { tanggal: '', tunai: 0, trf: 0 },
  ]);

  // NB
  const [nb, setNb] = useState('');
  // DP Produksi percentage override (default 70)
  const [dpProdPct, setDpProdPct] = useState(70);

  const fetchAll = useCallback(async () => {
    try {
      const [o, p, i, l] = await Promise.all([
        dbGet('orders').catch(() => []),
        dbGet('order_payments').catch(() => []),
        dbGet('order_items').catch(() => []),
        dbGet('leads').catch(() => []),
      ]);
      setOrders(o);
      setPayments(p);
      setItems(i);
      setLeads(l);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { if (open) fetchAll(); }, [open, fetchAll]);
  useEffect(() => { if (open && seedOrderId) setPickedOrderId(String(seedOrderId)); }, [open, seedOrderId]);

  // Prefill from the picked order
  useEffect(() => {
    if (!pickedOrderId) return;
    const o = orders.find(x => String(x.id) === pickedOrderId);
    if (!o) return;
    setNama(String(o.customer_nama || ''));
    const addrParts = [o.customer_alamat, o.customer_kecamatan, o.customer_kabupaten, o.customer_provinsi]
      .filter(Boolean).join(', ');
    setAlamat(addrParts);
    setLeadId(o.lead_id ? String(o.lead_id) : '');
    setEkspNama(String(o.ekspedisi_nama || ''));
    setEkspKg(o.ekspedisi_kg ? String(o.ekspedisi_kg) : '');
    setEkspBiaya(Number(o.ekspedisi_biaya) || 0);
    setNb(String(o.keterangan || ''));

    // Load item lines
    const orderItems = items.filter(it => Number(it.order_id) === Number(o.id));
    if (orderItems.length > 0) {
      setItemLines(orderItems.map((it, idx) => ({
        id: idx + 1,
        nama: String(it.paket_nama || ''),
        qty: Number(it.qty) || 0,
        harga: Number(it.harga) || 0,
      })));
    } else {
      setItemLines([{ id: 1, nama: '', qty: 0, harga: 0 }]);
    }

    // Load DP schedule from order_payments
    const orderPays = payments
      .filter(pp => Number(pp.order_id) === Number(o.id))
      .sort((a, b) => {
        const rank = (t: string) => t === 'dp_desain' ? 0 : t === 'dp_produksi' ? 1 : 2;
        const ra = rank(String(a.tipe)); const rb = rank(String(b.tipe));
        if (ra !== rb) return ra - rb;
        return (Number(a.urutan) || 0) - (Number(b.urutan) || 0);
      });

    const dpArr: DpLine[] = [
      { tanggal: '', tunai: 0, trf: 0 },
      { tanggal: '', tunai: 0, trf: 0 },
      { tanggal: '', tunai: 0, trf: 0 },
      { tanggal: '', tunai: 0, trf: 0 },
    ];
    orderPays.slice(0, 4).forEach((pp, idx) => {
      dpArr[idx] = {
        tanggal: String(pp.tanggal || '').slice(0, 10),
        tunai: Number(pp.tunai) || 0,
        trf: Number(pp.trf) || Number(pp.amount) || 0,
        existingId: Number(pp.id),
        tipe: String(pp.tipe),
        urutan: Number(pp.urutan) || 1,
      };
    });
    setDpLines(dpArr);
  }, [pickedOrderId, orders, items, payments]);

  // ─── Derived totals ───
  const totalPembelian = useMemo(
    () => itemLines.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.harga) || 0), 0),
    [itemLines]
  );
  const totalWithEksp = totalPembelian + (Number(ekspBiaya) || 0);
  const dpTotal = useMemo(
    () => dpLines.reduce((s, r) => s + (Number(r.tunai) || 0) + (Number(r.trf) || 0), 0),
    [dpLines]
  );
  const dpTunai = useMemo(
    () => dpLines.reduce((s, r) => s + (Number(r.tunai) || 0), 0),
    [dpLines]
  );
  const sisaTagihan = totalWithEksp - dpTotal;
  const dpProduksi = Math.round((sisaTagihan * dpProdPct) / 100);

  // ─── Helpers ───
  function addItemLine() {
    setItemLines(rs => [...rs, { id: (rs[rs.length - 1]?.id || 0) + 1, nama: '', qty: 0, harga: 0 }]);
  }
  function removeItemLine(idx: number) {
    setItemLines(rs => rs.filter((_, i) => i !== idx));
  }
  function updateItemLine(idx: number, k: keyof ItemLine, v: string | number) {
    setItemLines(rs => rs.map((r, i) => i === idx ? { ...r, [k]: v } : r));
  }
  function updateDpLine(idx: number, k: keyof DpLine, v: string | number) {
    setDpLines(rs => rs.map((r, i) => i === idx ? { ...r, [k]: v } : r));
  }

  const orderPickerOptions = useMemo(
    () => orders
      .filter(o => ['SELLING', 'PENDING'].includes(String(o.status || '').toUpperCase()))
      .sort((a, b) => Number(b.id) - Number(a.id))
      .map(o => ({
        id: o.id,
        label: `${o.no_order} · ${o.customer_nama || '-'}`,
        status: String(o.status),
      })),
    [orders]
  );

  const leadName = leads.find(l => String(l.id) === leadId)?.nama || '';

  async function handleDownload() {
    if (!invoiceRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(invoiceRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `pembayaran-${nama.replace(/\s+/g, '-') || 'ayres'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      toast.error('Gagal Download', String(e));
    }
    setDownloading(false);
  }

  async function handleSave() {
    if (!pickedOrderId) {
      toast.warning('Pilih Order', 'Pilih order yang akan diisi pembayarannya.');
      return;
    }
    if (!nama.trim()) {
      toast.warning('Wajib Diisi', 'Nama customer belum diisi.');
      return;
    }
    setSaving(true);
    try {
      const orderId = Number(pickedOrderId);
      // Update the order shell with header fields + ekspedisi + note.
      // Ekspedisi columns may not exist yet on legacy DBs → try/catch.
      try {
        await dbUpdate('orders', orderId, {
          customer_nama: nama.trim(),
          customer_alamat: alamat,
          lead_id: leadId ? Number(leadId) : null,
          keterangan: nb,
          ekspedisi_nama: ekspNama || null,
          ekspedisi_kg: ekspKg ? Number(ekspKg) : null,
          ekspedisi_biaya: ekspBiaya || null,
          nominal_order: totalWithEksp,
          status: 'PENDING', // promoted from SELLING
        });
      } catch (err) {
        // Fallback without new columns
        console.warn('order update with ekspedisi failed, retrying without:', err);
        await dbUpdate('orders', orderId, {
          customer_nama: nama.trim(),
          customer_alamat: alamat,
          lead_id: leadId ? Number(leadId) : null,
          keterangan: nb,
          nominal_order: totalWithEksp,
          status: 'PENDING',
        });
      }

      // Sync order_items: delete all existing then insert current lines
      const existingItems = items.filter(it => Number(it.order_id) === orderId);
      for (const it of existingItems) {
        try { await dbDelete('order_items', Number(it.id)); } catch {}
      }
      for (const line of itemLines) {
        if (!line.nama.trim() && !line.qty && !line.harga) continue;
        try {
          await dbCreate('order_items', {
            order_id: orderId,
            paket_nama: line.nama.trim() || '-',
            bahan_kain: '',
            qty: line.qty || 0,
            harga: line.harga || 0,
          });
        } catch (err) {
          // Fallback without harga if migration 022 hasn't landed
          console.warn('order_items insert with harga failed:', err);
          await dbCreate('order_items', {
            order_id: orderId,
            paket_nama: line.nama.trim() || '-',
            bahan_kain: '',
            qty: line.qty || 0,
          });
        }
      }

      // Sync DP schedule: update existing where possible, create new otherwise
      // Row 0 = dp_desain, rows 1..3 = dp_produksi urutan 1..3
      for (let i = 0; i < dpLines.length; i++) {
        const d = dpLines[i];
        const rowAmount = (Number(d.tunai) || 0) + (Number(d.trf) || 0);
        if (rowAmount === 0 && !d.tanggal && !d.existingId) continue;

        const tipe = i === 0 ? 'dp_desain' : 'dp_produksi';
        const urutan = i === 0 ? 1 : i;
        const payload: Row = {
          amount: rowAmount,
          tanggal: d.tanggal || null,
          tunai: d.tunai || null,
          trf: d.trf || null,
          tipe,
          urutan,
        };

        if (d.existingId) {
          try {
            await dbUpdate('order_payments', d.existingId, payload);
          } catch (err) {
            console.warn('payment update failed, retrying minimal:', err);
            try {
              await dbUpdate('order_payments', d.existingId, {
                amount: rowAmount, tipe, urutan,
              });
            } catch {}
          }
        } else if (rowAmount > 0) {
          try {
            await dbCreate('order_payments', { order_id: orderId, ...payload });
          } catch (err) {
            console.warn('payment create failed, retrying minimal:', err);
            try {
              await dbCreate('order_payments', {
                order_id: orderId, tipe, urutan, amount: rowAmount,
              });
            } catch {}
          }
        }
      }

      // Refresh scalar dp_produksi total on orders for the stat cards
      const totalDpProduksi = dpLines.slice(1).reduce((s, r) => s + (r.tunai || 0) + (r.trf || 0), 0);
      try {
        await dbUpdate('orders', orderId, {
          dp_produksi: totalDpProduksi,
          kekurangan: sisaTagihan,
        });
      } catch {}

      invalidateCache('wp_orders', 'wp_dashboard');
      toast.success('Pembayaran Tersimpan', 'Order berhasil dilengkapi dari CS Order.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error('Gagal Menyimpan', String(e));
    }
    setSaving(false);
  }

  if (!open) return null;

  const cellCls = 'border border-slate-700 px-2 py-1.5 text-sm';
  const inputCls = 'w-full bg-transparent focus:outline-none text-slate-900 text-sm px-1';
  const smInputCls = 'w-full bg-transparent focus:outline-none text-slate-900 text-sm text-right px-1 tabular-nums';

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 overflow-y-auto">
        <div className="w-full max-w-5xl bg-white border border-white/[0.06] rounded-xl shadow-2xl shadow-black/50 my-8 flex flex-col max-h-[92vh]">
          {/* Top bar: picker + actions (screen only) */}
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-wrap shrink-0">
            <div className="flex items-center gap-3 flex-1">
              <label className="text-xs font-medium text-slate-600 shrink-0">Order:</label>
              <select value={pickedOrderId} onChange={e => setPickedOrderId(e.target.value)}
                className="flex-1 max-w-xs bg-white border border-slate-300 text-slate-900 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-blue-500">
                <option value="">— Pilih order —</option>
                {orderPickerOptions.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.label} {o.status === 'SELLING' ? '(dari CS Selling)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleDownload} disabled={downloading || !nama}
                className="text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-100 px-3 py-1.5 rounded transition-colors disabled:opacity-40">
                {downloading ? 'Menyiapkan...' : 'Download PNG'}
              </button>
              <button onClick={handleSave} disabled={saving || !pickedOrderId}
                className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded transition-colors disabled:opacity-40">
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
              <button onClick={onClose} className="text-slate-500 hover:text-slate-800 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Invoice — this is what gets exported */}
          <div className="overflow-y-auto flex-1 bg-slate-100 p-4">
            <div ref={invoiceRef} className="bg-white text-slate-900 mx-auto max-w-4xl p-8" style={{ fontFamily: '"Helvetica","Arial",sans-serif' }}>
              {/* Header with logo + title */}
              <div className="flex items-center justify-between mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo/new logo.png" alt="AYRES" className="h-10 opacity-90" />
                <h1 className="text-2xl font-bold tracking-wide text-slate-900">PEMBAYARAN AYRES</h1>
                <div className="w-24 text-right text-[10px] text-slate-500">Invoice</div>
              </div>

              {/* Info table */}
              <table className="w-full border-collapse mb-3 text-sm">
                <tbody>
                  <tr>
                    <td className={`${cellCls} bg-slate-100 font-semibold w-32`}>NAMA</td>
                    <td className={`${cellCls} w-4 text-center`}>:</td>
                    <td className={`${cellCls}`}>
                      <input type="text" value={nama} onChange={e => setNama(e.target.value)}
                        placeholder="Nama customer" className={inputCls} />
                    </td>
                  </tr>
                  <tr>
                    <td className={`${cellCls} bg-slate-100 font-semibold`}>ALAMAT</td>
                    <td className={`${cellCls} text-center`}>:</td>
                    <td className={`${cellCls}`}>
                      <input type="text" value={alamat} onChange={e => setAlamat(e.target.value)}
                        placeholder="Alamat lengkap" className={inputCls} />
                    </td>
                  </tr>
                  <tr>
                    <td className={`${cellCls} bg-slate-100 font-semibold`}>PILIHAN LEADS</td>
                    <td className={`${cellCls} text-center`}>:</td>
                    <td className={`${cellCls}`}>
                      <select value={leadId} onChange={e => setLeadId(e.target.value)}
                        className={`${inputCls} appearance-none cursor-pointer`}>
                        <option value="">— Pilih leads —</option>
                        {leads.map((l: Row) => (
                          <option key={l.id} value={l.id}>{l.nama}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td className={`${cellCls} bg-slate-100 font-semibold`}>PEMBAY. TUNAI</td>
                    <td className={`${cellCls} text-center`}>:</td>
                    <td className={`${cellCls}`}>
                      <div className="flex items-center gap-4">
                        <input type="text" value={pembayTunai} onChange={e => setPembayTunai(e.target.value)}
                          placeholder="Catatan tunai" className={`${inputCls} flex-1`} />
                        <label className="flex items-center gap-1 text-xs">
                          <input type="radio" name="payMethod" checked={payMethod === 'cash'} onChange={() => setPayMethod('cash')} />
                          <span>Cash</span>
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="radio" name="payMethod" checked={payMethod === 'bank'} onChange={() => setPayMethod('bank')} />
                          <span>Bank</span>
                        </label>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Item table */}
              <table className="w-full border-collapse mb-3 text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="border border-slate-700 px-2 py-1.5 text-left">NAMA BARANG</th>
                    <th className="border border-slate-700 px-2 py-1.5 w-20">QTY</th>
                    <th className="border border-slate-700 px-2 py-1.5 w-40">HARGA</th>
                    <th className="border border-slate-700 px-2 py-1.5 w-40">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {itemLines.map((line, idx) => {
                    const total = (line.qty || 0) * (line.harga || 0);
                    return (
                      <tr key={line.id}>
                        <td className={cellCls}>
                          <div className="flex items-center gap-2">
                            <input type="text" value={line.nama}
                              onChange={e => updateItemLine(idx, 'nama', e.target.value)}
                              placeholder="Nama barang" className={inputCls} />
                            {itemLines.length > 1 && (
                              <button onClick={() => removeItemLine(idx)} title="Hapus"
                                className="text-slate-400 hover:text-rose-500 shrink-0 text-lg leading-none px-1">×</button>
                            )}
                          </div>
                        </td>
                        <td className={cellCls}>
                          <input type="number" value={line.qty || ''}
                            onChange={e => updateItemLine(idx, 'qty', Number(e.target.value) || 0)}
                            className={smInputCls} />
                        </td>
                        <td className={cellCls}>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500">Rp</span>
                            <input type="text" value={line.harga ? fmtRpPlain(line.harga) : ''}
                              onChange={e => updateItemLine(idx, 'harga', parseRp(e.target.value))}
                              className={smInputCls} />
                          </div>
                        </td>
                        <td className={`${cellCls} bg-slate-50`}>
                          <div className="flex items-center justify-end gap-1 tabular-nums">
                            <span className="text-xs text-slate-500">Rp</span>
                            <span>{total > 0 ? fmtRp(total) : '-'}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Padding rows to always show 8 rows like the printed form */}
                  {Array.from({ length: Math.max(0, 4 - itemLines.length) }).map((_, i) => (
                    <tr key={`pad-${i}`}>
                      <td className={cellCls}>&nbsp;</td>
                      <td className={cellCls}>&nbsp;</td>
                      <td className={cellCls}>&nbsp;</td>
                      <td className={`${cellCls} bg-slate-50 text-right text-slate-400`}>Rp -</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} className={`${cellCls} bg-slate-100 font-bold text-right`}>TOTAL PEMBELIAN</td>
                    <td className={`${cellCls} bg-slate-100 font-bold text-right tabular-nums`}>
                      Rp {fmtRp(totalPembelian)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="mb-3 flex justify-start">
                <button onClick={addItemLine}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 px-2 py-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Tambah Item
                </button>
              </div>

              {/* Ekspedisi */}
              <table className="w-full border-collapse mb-3 text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="border border-slate-700 px-2 py-1.5 text-left">EKSPEDISI</th>
                    <th className="border border-slate-700 px-2 py-1.5 w-20">KG</th>
                    <th className="border border-slate-700 px-2 py-1.5 w-40">HARGA</th>
                    <th className="border border-slate-700 px-2 py-1.5 w-40">BIAYA</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={cellCls}>
                      <input type="text" value={ekspNama} onChange={e => setEkspNama(e.target.value)}
                        placeholder="Nama ekspedisi (contoh: JNE JTR 4-5 HARI)" className={inputCls} />
                    </td>
                    <td className={cellCls}>
                      <input type="text" value={ekspKg} onChange={e => setEkspKg(e.target.value)}
                        className={smInputCls} />
                    </td>
                    <td className={cellCls}>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-500">Rp</span>
                        <input type="text" value={ekspBiaya ? fmtRpPlain(ekspBiaya) : ''}
                          onChange={e => setEkspBiaya(parseRp(e.target.value))}
                          className={smInputCls} />
                      </div>
                    </td>
                    <td className={`${cellCls} bg-slate-50 text-right tabular-nums`}>
                      Rp {fmtRp(ekspBiaya)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} className={`${cellCls} bg-slate-100 font-bold text-right`}>TOTAL</td>
                    <td className={`${cellCls} bg-slate-100 font-bold text-right tabular-nums`}>
                      Rp {fmtRp(totalWithEksp)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* DP Schedule */}
              <table className="w-full border-collapse mb-3 text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-800">
                    <th colSpan={5} className="border border-slate-700 px-2 py-1.5 font-bold text-left">PEMBAYARAN DP</th>
                  </tr>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-700 px-2 py-1.5 w-36">TANGGAL</th>
                    <th className="border border-slate-700 px-2 py-1.5 w-16">DP KE</th>
                    <th className="border border-slate-700 px-2 py-1.5">TUNAI</th>
                    <th className="border border-slate-700 px-2 py-1.5">TRF</th>
                    <th className="border border-slate-700 px-2 py-1.5">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {dpLines.map((line, idx) => {
                    const label = ['I', 'II', 'III', 'IV'][idx];
                    const rowTotal = (line.tunai || 0) + (line.trf || 0);
                    return (
                      <tr key={idx}>
                        <td className={cellCls}>
                          <input type="date" value={line.tanggal}
                            onChange={e => updateDpLine(idx, 'tanggal', e.target.value)}
                            className={inputCls} />
                          {line.tanggal && (
                            <div className="text-[10px] text-slate-500 mt-0.5">{fmtDateID(line.tanggal)}</div>
                          )}
                        </td>
                        <td className={`${cellCls} text-center font-semibold`}>{label}</td>
                        <td className={cellCls}>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500">Rp</span>
                            <input type="text" value={line.tunai ? fmtRpPlain(line.tunai) : ''}
                              onChange={e => updateDpLine(idx, 'tunai', parseRp(e.target.value))}
                              className={smInputCls} />
                          </div>
                        </td>
                        <td className={cellCls}>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500">Rp</span>
                            <input type="text" value={line.trf ? fmtRpPlain(line.trf) : ''}
                              onChange={e => updateDpLine(idx, 'trf', parseRp(e.target.value))}
                              className={smInputCls} />
                          </div>
                        </td>
                        <td className={`${cellCls} bg-slate-50 text-right tabular-nums`}>
                          Rp {fmtRp(rowTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* NB + Summary */}
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <div className="text-sm font-bold mb-1">NB:</div>
                  <textarea value={nb} onChange={e => setNb(e.target.value)}
                    rows={6}
                    placeholder="Catatan bahan, promo, size dsb..."
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 resize-none" />
                </div>
                <table className="w-full border-collapse text-sm h-fit">
                  <tbody>
                    <tr>
                      <td className={`${cellCls} bg-slate-100 font-bold w-24`}>Tunai</td>
                      <td className={`${cellCls} text-right tabular-nums`}>Rp {fmtRp(dpTunai)}</td>
                    </tr>
                    <tr>
                      <td className={`${cellCls} bg-slate-100 font-bold`}>DP</td>
                      <td className={`${cellCls} text-right tabular-nums`}>Rp {fmtRp(dpTotal)}</td>
                    </tr>
                    <tr>
                      <td className={`${cellCls} bg-slate-100 font-bold`}>SISA TAGIHAN</td>
                      <td className={`${cellCls} text-right tabular-nums font-bold`}>Rp {fmtRp(sisaTagihan)}</td>
                    </tr>
                    <tr>
                      <td className={`${cellCls} bg-slate-100 font-bold`}>
                        DP PRODUKSI
                        <input type="number" min={0} max={100} value={dpProdPct}
                          onChange={e => setDpProdPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                          className="w-12 mx-1 border border-slate-300 rounded text-center text-xs" />%
                      </td>
                      <td className={`${cellCls} text-right tabular-nums font-bold text-blue-700`}>Rp {fmtRp(dpProduksi)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="text-[10px] text-slate-400 text-center mt-6 pt-3 border-t border-slate-200">
                Diterbitkan oleh AYRES · {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
