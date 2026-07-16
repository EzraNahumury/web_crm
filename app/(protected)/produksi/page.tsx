'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { dbGet, dbUpdate, dbCreate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth-context';
import { GUDANG_FORM_ITEMS } from '@/lib/gudang-form-items';
import { isVisibleTanggalOrder } from '@/lib/data-cutoff';
import {
  computeStageTargets,
  totalDurasiHariKerja,
  classifyLate,
  STAGE_DURATIONS,
} from '@/lib/produksi-durasi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// Only this account gets the "Kembalikan" (roll back a stage) button.
// Gated by email straight off the session so it works without re-login.
const ROLLBACK_EMAIL = 'admin@gmail.com';

// Stages shown in the produksi tabs, ordered exactly as the flow runs.
// Order + Waiting List → auto-created on order save (WO.wo_confirmed=0).
// At Proofing, the "Selesai & Lanjut" is gated until wo.wo_confirmed=1
// (marked when the WO is detailed via the Work Orders menu).
// QC Panel Process + Sewing get an extra Reject button.
const PROD_STAGES = [
  'Waiting List', 'Approval Design', 'Approval Pattern', 'Proofing',
  'Approval WO', 'Printing Layout', 'Approval Layout', 'Printing Process',
  'Sublim Press', 'Fabric Cutting', 'QC Panel Process', 'Sewing',
  'QC Jersey', 'Steam Jersey', 'Finishing', 'QC Final dan Packing',
  'Shipment',
];

// Stages that offer the Reject flow. QC Panel Process, Sewing, and
// QC Final dan Packing semua branch pada pass/fail decision.
const REJECT_STAGES = new Set(['QC Panel Process', 'Sewing', 'QC Final dan Packing']);

// Format ISO YYYY-MM-DD → "12 Sep 2026" untuk label short.
function fmtDateLabel(iso: string): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const B = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${d} ${B[m - 1]} ${y}`;
}

// "3 hari lalu" / "hari ini" — dipakai di note warning kalau sudah lewat SLA.
function daysBetweenLabel(fromISO: string, toISO: string): string {
  if (!fromISO || !toISO) return '';
  const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1).getTime(); };
  const diff = Math.round((parse(toISO) - parse(fromISO)) / 86400000);
  if (diff <= 0) return 'hari ini';
  return `terlambat ${diff} hari kalender`;
}

export default function ProduksiPage() {
  const { user } = useAuth();
  const [activeStage, setActiveStage] = useState(PROD_STAGES[0]);
  const [stages, setStages] = useState<Row[]>([]);
  const [progress, setProgress] = useState<Row[]>([]);
  const [wos, setWos] = useState<Row[]>([]);
  const [ordersById, setOrdersById] = useState<Record<number, Row>>({});
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Reset the search box whenever CS switches to a different stage tab.
  useEffect(() => { setSearch(''); }, [activeStage]);
  const toast = useToast();

  // Reject flow: modal state + form fields.
  // For Dengan Penambahan Bahan the form is the "Form Permintaan Gudang" —
  // a structured table where each predefined item row can carry bahan,
  // warna, and kuantitas. Only rows with any value are persisted.
  interface RejectRow { item: string; bahan: string; warna: string; kuantitas: string; isSize?: boolean; color?: string }
  const [rejectItem, setRejectItem] = useState<Row | null>(null);
  const [rejectTipe, setRejectTipe] = useState<'WITH_BAHAN' | 'WITHOUT_BAHAN'>('WITHOUT_BAHAN');
  const [rejectKeterangan, setRejectKeterangan] = useState('');
  const [rejectRows, setRejectRows] = useState<RejectRow[]>([]);
  const [rejectSaving, setRejectSaving] = useState(false);
  const [rejects, setRejects] = useState<Row[]>([]);

  // Pelunasan flow state — pop-up modal saat operator klik Selesai
  // & Lanjut di stage QC Final dan Packing.
  const [pelunasanItem, setPelunasanItem] = useState<Row | null>(null);
  const [pelunasanFile, setPelunasanFile] = useState<File | null>(null);
  const [pelunasanBukti, setPelunasanBukti] = useState<string | null>(null);
  const [pelunasanBuktiName, setPelunasanBuktiName] = useState('');
  const [pelunasanUploading, setPelunasanUploading] = useState(false);
  const [pelunasanSaving, setPelunasanSaving] = useState(false);
  const [pelunasanDragOver, setPelunasanDragOver] = useState(false);

  function makeInitialRejectRows(): RejectRow[] {
    return GUDANG_FORM_ITEMS.map(it => ({
      item: it.item, bahan: '', warna: '', kuantitas: '', isSize: it.isSize, color: it.color,
    }));
  }

  function openRejectModal(item: Row) {
    setRejectItem(item);
    setRejectTipe('WITHOUT_BAHAN');
    setRejectKeterangan('');
    setRejectRows(makeInitialRejectRows());
  }
  function closeRejectModal() {
    setRejectItem(null);
    setRejectKeterangan('');
    setRejectRows([]);
    setRejectSaving(false);
  }
  function updateRejectRow(idx: number, key: 'bahan'|'warna'|'kuantitas', val: string) {
    setRejectRows(rs => rs.map((r, i) => i === idx ? { ...r, [key]: val } : r));
  }
  function addCustomRejectRow() {
    setRejectRows(rs => [...rs, { item: '', bahan: '', warna: '', kuantitas: '' }]);
  }
  function removeRejectRow(idx: number) {
    setRejectRows(rs => rs.filter((_, i) => i !== idx));
  }
  function updateCustomItemName(idx: number, val: string) {
    setRejectRows(rs => rs.map((r, i) => i === idx ? { ...r, item: val } : r));
  }

  async function submitReject() {
    if (!rejectItem) return;
    if (!rejectKeterangan.trim()) {
      toast.error('Keterangan Wajib', 'Isi keterangan alasan reject.');
      return;
    }
    const filledRows = rejectRows.filter(r =>
      r.item.trim() && (r.bahan.trim() || r.warna.trim() || r.kuantitas.trim())
    );
    if (rejectTipe === 'WITH_BAHAN' && filledRows.length === 0) {
      toast.error('Form Kosong', 'Isi minimal satu baris Bahan / Warna / Kuantitas untuk permintaan gudang.');
      return;
    }
    setRejectSaving(true);
    try {
      const rejectId = await dbCreate('stage_rejects', {
        work_order_id: rejectItem.work_order_id,
        stage_id: rejectItem.stage_id,
        tipe: rejectTipe,
        keterangan: rejectKeterangan.trim(),
        // Legacy free-text field kept as JSON summary for older readers.
        bahan_request: rejectTipe === 'WITH_BAHAN' ? JSON.stringify(filledRows) : null,
        status: rejectTipe === 'WITH_BAHAN' ? 'PENDING' : 'RETURNED',
      });

      if (rejectTipe === 'WITH_BAHAN') {
        // Persist structured rows so the gudang UI can render them
        // as the exact same form.
        for (let i = 0; i < filledRows.length; i++) {
          const r = filledRows[i];
          try {
            await dbCreate('stage_reject_items', {
              reject_id: rejectId,
              urutan: i + 1,
              item: r.item.trim(),
              bahan: r.bahan.trim() || null,
              warna: r.warna.trim() || null,
              kuantitas: r.kuantitas.trim() || null,
            });
          } catch (err) {
            console.warn('stage_reject_items insert failed:', err);
          }
        }
      }
      toast.success(
        rejectTipe === 'WITH_BAHAN' ? 'Form Dikirim ke Gudang' : 'Reject Tercatat',
        rejectTipe === 'WITH_BAHAN'
          ? 'Form permintaan gudang tersimpan. Menunggu approval gudang.'
          : 'Barang dikembalikan ke proses produksi, tidak butuh bahan baru.'
      );
      closeRejectModal();
      await fetchData();
    } catch (e) {
      toast.error('Gagal Simpan Reject', String(e));
    }
    setRejectSaving(false);
  }

  // Cancel a pending reject (before gudang acts on it) so the WO can
  // proceed without waiting. Only makes sense for WITH_BAHAN rejects
  // that are still PENDING. Marks the reject as CANCELLED.
  async function cancelReject(rejectId: number) {
    const yes = await toast.confirm({
      title: 'Batalkan Permintaan Gudang?',
      message: 'Permintaan bahan ini akan dibatalkan. WO bisa dilanjutkan tanpa bahan baru.',
      type: 'warning',
      confirmText: 'Ya, Batalkan',
    });
    if (!yes) return;
    try {
      await dbUpdate('stage_rejects', rejectId, { status: 'CANCELLED' });
      toast.success('Dibatalkan', 'Permintaan gudang dibatalkan.');
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  // Determine if user has full access (admin/super admin) or limited stage access
  const isFullAccess = !user?.stageAccess || user.stageAccess.length === 0;

  // Check if user can manage a specific stage (has write access)
  const canManageStage = useCallback((stageId: number) => {
    if (isFullAccess) return true;
    return user?.stageAccess?.includes(stageId) || false;
  }, [isFullAccess, user?.stageAccess]);

  const fetchData = useCallback(async () => {
    try {
      const [s, p, w, r, o, hol] = await Promise.all([
        dbGet('production_stages'),
        dbGet('wo_progress'),
        dbGet('work_orders'),
        // stage_rejects may not exist yet if migration 018 hasn't run,
        // swallow the error so the page still loads.
        dbGet('stage_rejects').catch(() => []),
        // orders — needed for the Waiting List → next-stage finance gate.
        dbGet('orders').catch(() => []),
        // libur_nasional — dipakai untuk hitung target durasi produksi.
        dbGet('libur_nasional').catch(() => []),
      ]);
      setRejects(r);
      const ordersMap: Record<number, Row> = {};
      for (const row of o as Row[]) ordersMap[Number(row.id)] = row;
      setOrdersById(ordersMap);
      // Rebuild holiday set. Kolom tanggal biasanya DATE atau
      // TIMESTAMP; ambil 10 char pertama supaya cocok dengan format
      // ISO yang dipakai addBusinessDays.
      const holSet = new Set<string>(
        (hol as Row[]).map((r: Row) => String(r.tanggal || '').slice(0, 10)).filter(Boolean)
      );
      setHolidays(holSet);
      // Filter out inactive stages (QC Cutting retired in migration 016)
      const sortedStages = s
        .filter((r: Row) => r.active === undefined || r.active === 1 || r.active === true)
        .sort((a: Row, b: Row) => (a.urutan || 0) - (b.urutan || 0));
      let updatedProgress: Row[] = p;

      // Auto-create missing wo_progress rows for active WOs. This has
      // to run for EVERY stage on EVERY active WO (not just when a WO
      // has zero rows) because new stages introduced later (e.g.
      // Approval WO, QC Final dan Packing di migration 016) tidak
      // otomatis nempel ke WO yang sudah lebih tua — sehingga saat
      // stage sebelumnya klik Selesai & Lanjut, tidak ada row target
      // untuk di-set TERSEDIA dan WO seolah hilang dari tab
      // berikutnya. Backfill di sini menutup gap itu.
      const activeWos = w.filter((wo: Row) => wo.status === 'PROSES_PRODUKSI');
      let didBackfill = false;
      for (const wo of activeWos) {
        const woProgressStages = new Set(
          p.filter((pr: Row) => pr.work_order_id === wo.id).map((pr: Row) => Number(pr.stage_id))
        );
        const missing = sortedStages.filter(s => !woProgressStages.has(Number(s.id)));
        if (missing.length === 0) continue;

        const startingStage = sortedStages[0];
        const woHasAnyProgress = woProgressStages.size > 0;

        for (const stage of missing) {
          // Fresh WO (no rows at all yet) → first stage starts TERSEDIA.
          // Existing WO getting a backfill of a newly-added stage →
          // default status BELUM; transition code will bump to TERSEDIA
          // when the previous stage's Selesai runs.
          const isFresh = !woHasAnyProgress && Number(stage.id) === Number(startingStage.id);
          try {
            await dbCreate('wo_progress', {
              work_order_id: wo.id,
              stage_id: stage.id,
              status: isFresh ? 'TERSEDIA' : 'BELUM',
            });
            didBackfill = true;
          } catch (err) { console.warn('wo_progress backfill failed:', err); }
        }

        if (!wo.current_stage_id && startingStage) {
          try {
            await dbUpdate('work_orders', Number(wo.id), { current_stage_id: startingStage.id });
          } catch {}
        }
      }
      if (didBackfill) updatedProgress = await dbGet('wo_progress');

      setStages(sortedStages);
      setProgress(updatedProgress);
      // Sembunyikan WO yang order-nya legacy (sebelum cutoff). Data tidak
      // dihapus — cuma tidak muncul di UI Produksi. Lihat lib/data-cutoff.ts.
      const filteredWos = (w as Row[]).filter((wo: Row) => {
        const ord = ordersMap[Number(wo.order_id)];
        return isVisibleTanggalOrder(ord?.tanggal_order);
      });
      setWos(filteredWos);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Find stage record by name
  const activeStageRow = stages.find((s: Row) => s.nama === activeStage);
  const activeStageId = activeStageRow?.id;
  const activeStageCanManage = activeStageId ? canManageStage(activeStageId) : false;

  // Set WO id yang lolos cutoff. Dipakai buat filter row wo_progress
  // saat menghitung badge tab supaya count sinkron dengan antrian.
  const visibleWoIds = new Set(wos.map((w: Row) => Number(w.id)));
  const visibleProgress = progress.filter((p: Row) => visibleWoIds.has(Number(p.work_order_id)));

  // Hari ini dalam format ISO — dipakai untuk klasifikasi telat vs target.
  const todayISO = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // Map work_order_id → { startISO, targetsByStage, targetSelesai }.
  // startISO = tanggal Approval Design mulai (wo_progress.started_at).
  // Fallback ke wo.created_at kalau row Approval Design belum dimulai.
  const woTargets = useMemo(() => {
    const stagesByName: Record<string, number> = {};
    for (const s of stages) stagesByName[String(s.nama)] = Number(s.id);
    const adId = stagesByName['Approval Design'];
    const out: Record<number, { startISO: string; targets: Record<string, string>; targetSelesai: string }> = {};
    for (const wo of wos) {
      const adProgress = adId
        ? progress.find(p => Number(p.work_order_id) === Number(wo.id) && Number(p.stage_id) === Number(adId))
        : undefined;
      // Prefer started_at (tanggal admin klik "Selesai Konfirmasi" dan
      // Approval Design terbuka). Fallback ke wo.created_at kalau row
      // Approval Design belum di-set started_at (auto-created saat WO
      // baru dibentuk).
      const start = String(adProgress?.started_at || adProgress?.created_at || wo.created_at || '').slice(0, 10);
      if (!start) continue;
      const targets = computeStageTargets(start, holidays);
      out[Number(wo.id)] = {
        startISO: start,
        targets,
        targetSelesai: targets['QC Final dan Packing'] || '',
      };
    }
    return out;
  }, [wos, progress, stages, holidays]);

  // Show actionable WOs at this stage. Includes legacy SEDANG rows so any
  // in-flight work from the old two-click flow still shows here and can be
  // advanced with a single click.
  const tersediaItems = progress.filter((p: Row) =>
    p.stage_id === activeStageId && (p.status === 'TERSEDIA' || p.status === 'SEDANG')
  );

  // Merge with WO data
  function getWoForProgress(items: Row[]): Row[] {
    return items.map((p: Row) => {
      const wo = wos.find((w: Row) => w.id === p.work_order_id);
      return { ...p, wo };
    }).filter(item => item.wo);
  }

  const tersediaWosRaw = getWoForProgress(tersediaItems);
  const tersediaWos = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return tersediaWosRaw;
    return tersediaWosRaw.filter(item => {
      const wo = item.wo;
      return String(wo?.no_wo || '').toLowerCase().includes(q)
        || String(wo?.customer_nama || '').toLowerCase().includes(q)
        || String(wo?.paket || '').toLowerCase().includes(q);
    });
  })();
  const tersediaQty = tersediaWos.reduce((sum, item) => sum + (item.wo?.jumlah || 0), 0);

  // Gate for Proofing → Approval WO: the WO must be confirmed (details
  // filled in via Work Orders menu) before the customer flow can proceed
  // past Proofing. Existing legacy WOs default wo_confirmed=1 so they're
  // never blocked.
  function isProofingGated(item: Row): boolean {
    if (activeStage !== 'Proofing') return false;
    const conf = item.wo?.wo_confirmed;
    return !(conf === 1 || conf === true || conf === undefined);
  }

  // Gate for Waiting List → Approval Design. Two-step CS Order flow:
  //   1. CS Order fills Rincian Order → WO auto-created here, but
  //      bukti_uploaded is still 0 (user hasn't uploaded proofs yet).
  //   2. CS Order fills Bukti Pembayaran → bukti_uploaded=1 and
  //      finance_status resets to NULL so Finance can review the
  //      full invoice.
  //   3. Finance approves → finance_status='APPROVED'. Only now is
  //      the Waiting List row cleared to move on.
  // Legacy CS_ORDER rows never touched this flow, so they aren't gated.
  function isWaitingListGated(item: Row): boolean {
    if (activeStage !== 'Waiting List') return false;
    const ord = ordersById[Number(item.wo?.order_id)];
    if (!ord) return false;
    const via = String(ord.created_via || '').toUpperCase();
    if (via !== 'CS_SELLING') return false;
    const fs = String(ord.finance_status || '').toUpperCase();
    const buktiDone = Number(ord.bukti_uploaded) === 1;
    return !(fs === 'APPROVED' && buktiDone);
  }

  // Return the most recent non-terminal reject for a given WO at the
  // current stage, or null. Non-terminal = PENDING (waiting gudang) or
  // RETURNED (rework in place). APPROVED / GUDANG_REJECTED / CANCELLED
  // are considered resolved and no longer block progression.
  function getActiveReject(workOrderId: number, stageId: number): Row | null {
    const list = rejects
      .filter((rj: Row) => rj.work_order_id === workOrderId && rj.stage_id === stageId)
      .sort((a: Row, b: Row) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const latest = list[0];
    if (!latest) return null;
    const s = String(latest.status || '').toUpperCase();
    if (s === 'PENDING' || s === 'RETURNED') return latest;
    return null;
  }

  // A pending WITH_BAHAN reject blocks the "Selesai & Lanjut" button
  // until gudang either approves it or produksi cancels the request.
  // WITHOUT_BAHAN (RETURNED) doesn't block — the operator just clicks
  // Selesai once the rework is done.
  function isRejectGated(item: Row): boolean {
    const active = getActiveReject(item.work_order_id, item.stage_id);
    if (!active) return false;
    return String(active.tipe) === 'WITH_BAHAN' && String(active.status).toUpperCase() === 'PENDING';
  }

  // Pelunasan gate: sudah submit bukti dan menunggu Finance approve.
  // Selama PENDING, tombol Submit Pelunasan di Shipment terkunci
  // dengan label 'Menunggu Finance'. Pelunasan sekarang di stage
  // Shipment — waktu Finance approve, WO ditandai selesai (bukan
  // pindah stage lagi karena Shipment adalah stage terakhir).
  function isPelunasanPending(item: Row): boolean {
    if (activeStage !== 'Shipment') return false;
    const ord = ordersById[Number(item.wo?.order_id)];
    if (!ord) return false;
    return String(ord.pelunasan_status || '').toUpperCase() === 'PENDING';
  }

  function openPelunasanModal(item: Row) {
    setPelunasanItem(item);
    setPelunasanFile(null);
    setPelunasanBukti(null);
    setPelunasanBuktiName('');
    setPelunasanDragOver(false);
  }
  function closePelunasanModal() {
    setPelunasanItem(null);
    setPelunasanFile(null);
    setPelunasanBukti(null);
    setPelunasanBuktiName('');
    setPelunasanUploading(false);
    setPelunasanSaving(false);
    setPelunasanDragOver(false);
  }

  async function handlePelunasanFile(f: File) {
    if (!(f.type.startsWith('image/') || f.type === 'application/pdf')) {
      toast.error('Tipe File Tidak Didukung', 'Hanya gambar (PNG/JPG) atau PDF yang bisa diupload sebagai bukti pelunasan.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error('File Terlalu Besar', 'Ukuran maksimal 5 MB. Kompres foto TF-nya dulu.');
      return;
    }
    setPelunasanUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = await res.json();
      if (res.ok && j?.url) {
        setPelunasanFile(f);
        setPelunasanBukti(String(j.url));
        setPelunasanBuktiName(String(j.originalName || f.name));
      } else {
        throw new Error(j?.error || 'Upload gagal');
      }
    } catch (err) {
      console.warn('pelunasan upload failed, using base64:', err);
      const reader = new FileReader();
      reader.onload = () => {
        setPelunasanFile(f);
        setPelunasanBukti(String(reader.result || ''));
        setPelunasanBuktiName(f.name);
      };
      reader.readAsDataURL(f);
    }
    setPelunasanUploading(false);
  }

  async function submitPelunasan() {
    if (!pelunasanItem) return;
    if (!pelunasanBukti) {
      toast.error('Bukti Belum Diupload', 'Upload bukti pelunasan dulu sebelum submit.');
      return;
    }
    setPelunasanSaving(true);
    try {
      const orderId = Number(pelunasanItem.wo?.order_id);
      await dbUpdate('orders', orderId, {
        pelunasan_bukti_tf: pelunasanBukti,
        pelunasan_bukti_tf_name: pelunasanBuktiName || null,
        pelunasan_status: 'PENDING',
        pelunasan_notes: null,
      });
      toast.success('Bukti Pelunasan Terkirim', 'Order dikirim ke Approval Finance untuk review pelunasan.');
      closePelunasanModal();
      await fetchData();
    } catch (e) {
      toast.error('Gagal Submit', String(e));
    }
    setPelunasanSaving(false);
  }

  // Single-click handler: marks the current stage SELESAI (with both started_at
  // and completed_at) and advances the next stage to TERSEDIA in one shot.
  async function handleSelesai(progressRow: Row) {
    if (isWaitingListGated(progressRow)) {
      const ord = ordersById[Number(progressRow.wo?.order_id)];
      const buktiPending = ord && Number(ord.bukti_uploaded) !== 1;
      toast.error(
        buktiPending ? 'Bukti Pembayaran Belum Lengkap' : 'Menunggu Approval Finance',
        buktiPending
          ? 'CS Order belum upload bukti pembayaran DP Produksi di menu Bukti Pembayaran.'
          : 'Finance belum menyetujui invoice. Buka menu Approval Finance untuk review.'
      );
      return;
    }
    if (isProofingGated(progressRow)) {
      toast.error('WO Belum Dikonfirmasi', 'Buat/konfirmasi Work Order di Menu Work Orders terlebih dahulu.');
      return;
    }
    if (isRejectGated(progressRow)) {
      toast.error('Menunggu Approval Gudang', 'Permintaan bahan reject masih menunggu approval gudang.');
      return;
    }

    // Special-case Shipment: stage terakhir. Sebelum mark SELESAI,
    // minta operator upload bukti pelunasan dan tunggu Finance approve.
    // Finance approve → WO ditandai SELESAI (bukan advance karena
    // Shipment stage terakhir).
    const currentStage = stages.find((s: Row) => s.id === progressRow.stage_id);
    if (currentStage?.nama === 'Shipment') {
      if (isPelunasanPending(progressRow)) {
        toast.error('Menunggu Approval Finance', 'Bukti pelunasan sudah dikirim, tunggu Finance review di menu Approval Finance.');
        return;
      }
      openPelunasanModal(progressRow);
      return;
    }

    try {
      const now = new Date().toISOString();
      const startedAt = progressRow.started_at || now;
      await dbUpdate('wo_progress', progressRow.id, { status: 'SELESAI', started_at: startedAt, completed_at: now });

      // Auto-deduct stok ketika tahap "Fabric Cutting" diselesaikan
      const currentStage = stages.find((s: Row) => s.id === progressRow.stage_id);
      if (currentStage?.nama === 'Fabric Cutting') {
        try {
          const res = await fetch('/api/wo/deduct-stok', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wo_id: progressRow.work_order_id }),
          });
          const data = await res.json();
          if (!res.ok && data.error === 'Stok tidak cukup' && Array.isArray(data.insufficient)) {
            // Rollback progress status — stok tidak cukup, batalkan SELESAI
            await dbUpdate('wo_progress', progressRow.id, { status: 'TERSEDIA', completed_at: null });
            const detail = data.insufficient
              .map((i: { bahan: string; available: number; needed: number }) => `${i.bahan}: butuh ${i.needed}, tersedia ${i.available}`)
              .join(' • ');
            toast.error('Stok Tidak Cukup', `Tidak bisa selesaikan Fabric Cutting. ${detail}`);
            await fetchData();
            return;
          }
          if (data.success && data.deducted > 0) {
            toast.success('Stok Dipotong', `${data.deducted} item dipotong dari stok${data.skipped ? ` (${data.skipped} di-skip karena tidak ada di master barang)` : ''}.`);
          } else if (data.success && data.skipped > 0) {
            toast.warning('Stok Tidak Dipotong', `${data.skipped} item di-skip karena nama bahan tidak cocok dengan master barang.`);
          }
        } catch (e) { console.error('Deduct stok failed', e); }
      }

      const currentStageIdx = stages.findIndex((s: Row) => s.id === progressRow.stage_id);
      if (currentStageIdx < stages.length - 1) {
        const nextStage = stages[currentStageIdx + 1];
        const nextProgress = progress.find((p: Row) => p.work_order_id === progressRow.work_order_id && p.stage_id === nextStage.id);
        if (nextProgress) {
          await dbUpdate('wo_progress', nextProgress.id, { status: 'TERSEDIA' });
        } else {
          // Row belum ada (kasus WO lama yang lahir sebelum stage
          // berikutnya di-tambah lewat migrasi). Bikin langsung di
          // status TERSEDIA supaya tab stage berikutnya langsung
          // menerima WO ini.
          try {
            await dbCreate('wo_progress', {
              work_order_id: progressRow.work_order_id,
              stage_id: nextStage.id,
              status: 'TERSEDIA',
            });
          } catch (err) { console.warn('advance: create next wo_progress failed:', err); }
        }
        await dbUpdate('work_orders', progressRow.work_order_id, { current_stage_id: nextStage.id });
        toast.success('Selesai', `Dipindahkan ke ${nextStage.nama}.`);
      } else {
        await dbUpdate('work_orders', progressRow.work_order_id, { status: 'SELESAI' });
        toast.success('Selesai', 'Work Order telah selesai semua tahap.');
      }
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  // Super-admin-only: roll a WO back to the previous stage. Fixes accidental
  // "Selesai & Lanjut" clicks on work that wasn't actually finished. Reopens
  // the previous stage (TERSEDIA, timestamps cleared) and resets the current
  // stage to BELUM. Does not restore deducted stock — that's a physical action.
  async function handleKembalikan(progressRow: Row) {
    const idx = stages.findIndex((s: Row) => s.id === progressRow.stage_id);
    if (idx <= 0) { toast.error('Tidak Bisa', 'Sudah di tahap pertama, tidak ada tahap sebelumnya.'); return; }
    const prevStage = stages[idx - 1];
    const yes = await toast.confirm({
      title: 'Kembalikan ke Tahap Sebelumnya?',
      message: `WO ${progressRow.wo?.no_wo || ''} akan dikembalikan dari ${activeStage} ke ${prevStage.nama}.`,
      type: 'warning',
      confirmText: 'Ya, Kembalikan',
    });
    if (!yes) return;
    try {
      const prevProgress = progress.find((p: Row) => p.work_order_id === progressRow.work_order_id && p.stage_id === prevStage.id);
      if (prevProgress) {
        await dbUpdate('wo_progress', prevProgress.id, { status: 'TERSEDIA', completed_at: null });
      }
      await dbUpdate('wo_progress', progressRow.id, { status: 'BELUM', started_at: null, completed_at: null });
      await dbUpdate('work_orders', progressRow.work_order_id, { current_stage_id: prevStage.id, status: 'PROSES_PRODUKSI' });
      toast.success('Dikembalikan', `WO dikembalikan ke ${prevStage.nama}.`);
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-12 bg-white/[0.03] rounded-lg animate-pulse" />
      {[1,2].map(i => <div key={i} className="h-32 bg-white/[0.03] rounded-xl animate-pulse" />)}
    </div>
  );

  function WoCard({ item, actions }: { item: Row; actions: React.ReactNode }) {
    const wo = item.wo;
    const activeReject = getActiveReject(item.work_order_id, item.stage_id);
    const rejectPending = activeReject && String(activeReject.status).toUpperCase() === 'PENDING';
    const rejectReturned = activeReject && String(activeReject.status).toUpperCase() === 'RETURNED';
    const pelunasanPending = isPelunasanPending(item);
    // Target selesai per WO (QC Final dan Packing). Kalau tanggal
    // Approval Design belum tercatat, targetInfo tidak muncul.
    const targetInfo = woTargets[Number(wo.id)];
    const targetSelesaiStage = targetInfo?.targets?.[activeStage] || '';
    const targetSelesaiFinal = targetInfo?.targetSelesai || '';
    // Status telat untuk stage aktif: kalau hari ini > target stage ini,
    // artinya sudah lewat SLA yang dijanjikan untuk lanjut ke stage berikut.
    const lateStatus = targetSelesaiStage ? classifyLate(targetSelesaiStage, todayISO) : 'aman';
    const finalLateStatus = targetSelesaiFinal ? classifyLate(targetSelesaiFinal, todayISO) : 'aman';
    return (
      <div className="flex flex-col gap-2 px-6 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-blue-400 whitespace-nowrap">{wo.no_wo}</span>
              <span className="text-sm font-semibold text-white">{wo.customer_nama}</span>
              {lateStatus === 'terlambat' && (
                <span
                  title={`Target stage ini ${fmtDateLabel(targetSelesaiStage)} — sudah lewat`}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-red-500/40 text-red-300 bg-red-500/15 whitespace-nowrap"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                  Terlambat SLA
                </span>
              )}
              {lateStatus === 'warning' && (
                <span
                  title={`Target stage ini ${fmtDateLabel(targetSelesaiStage)} — hari ini deadline`}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-300 bg-amber-500/15 whitespace-nowrap"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Hari-H
                </span>
              )}
              {rejectPending && (
                <span
                  title={String(activeReject.keterangan || '')}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-rose-500/40 text-rose-300 bg-rose-500/15 whitespace-nowrap"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  Reject: Menunggu Gudang
                </span>
              )}
              {rejectReturned && (
                <span
                  title={String(activeReject.keterangan || '')}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-300 bg-amber-500/15 whitespace-nowrap"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Reject: Perbaiki di Tempat
                </span>
              )}
              {pelunasanPending && (
                <span
                  title="Bukti pelunasan sudah dikirim, menunggu Finance approve"
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-fuchsia-500/40 text-fuchsia-300 bg-fuchsia-500/15 whitespace-nowrap"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400" />
                  Menunggu Review Finance
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-xs">
              <span className="text-slate-300 font-medium">{wo.paket}</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">{wo.jumlah} pcs</span>
              {targetSelesaiFinal && (
                <>
                  <span className="text-slate-600">|</span>
                  <span className={`inline-flex items-center gap-1 ${finalLateStatus === 'terlambat' ? 'text-red-300' : finalLateStatus === 'warning' ? 'text-amber-300' : 'text-slate-400'}`}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                    Target selesai: <strong className="font-semibold">{fmtDateLabel(targetSelesaiFinal)}</strong>
                  </span>
                </>
              )}
            </div>
            {lateStatus === 'terlambat' && (
              <div className="mt-1.5 text-[11px] leading-snug max-w-2xl bg-red-500/10 border border-red-500/20 text-red-200 rounded-lg px-2.5 py-1.5">
                ⚠ Stage <strong>{activeStage}</strong> harusnya selesai di <strong>{fmtDateLabel(targetSelesaiStage)}</strong> ({daysBetweenLabel(targetSelesaiStage, todayISO)}).
              </div>
            )}
            {activeReject && activeReject.keterangan && (
              <div className="mt-1.5 text-[11px] text-slate-500 leading-snug max-w-2xl">
                <span className="text-slate-600">Keterangan:</span> {String(activeReject.keterangan)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        </div>
        {rejectPending && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-500">Menunggu approval gudang.</span>
            <button
              onClick={() => cancelReject(Number(activeReject.id))}
              className="text-slate-400 hover:text-white underline underline-offset-2"
            >
              Batalkan permintaan
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-emerald-500/[0.12] via-teal-500/[0.05] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border border-emerald-500/25 grid place-items-center shrink-0">
            <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Produksi</h1>
            <p className="text-[13px] text-slate-300 mt-0.5">
              Antrian per tahap produksi. Klik <strong className="text-white">Selesai & Lanjut</strong> untuk memindahkan WO ke tahap berikutnya.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 shrink-0 bg-[#111827] border border-white/10 rounded-xl px-4 py-2.5">
            <svg className="w-4 h-4 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-[10px] font-semibold text-emerald-300/70 uppercase tracking-widest">Total Durasi SLA</p>
              <p className="text-sm font-bold text-white leading-tight">{totalDurasiHariKerja()} hari kerja</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stage Tabs — pill style, indicator biru di bawah */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-x-auto">
        <div className="flex gap-0 min-w-max px-2 py-2">
          {PROD_STAGES.map(stage => {
            const stageRow = stages.find((s: Row) => s.nama === stage);
            const stageId = stageRow?.id;
            const count = visibleProgress.filter((p: Row) => p.stage_id === stageId && (p.status === 'TERSEDIA' || p.status === 'SEDANG')).length;
            const hasAccess = stageId ? canManageStage(stageId) : false;
            const isActiveTab = activeStage === stage;
            return (
              <button key={stage} onClick={() => setActiveStage(stage)}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium whitespace-nowrap transition-all ${
                  isActiveTab
                    ? 'text-white bg-gradient-to-b from-blue-500/25 to-blue-500/10 border border-blue-500/30 shadow-inner'
                    : hasAccess
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent'
                      : 'text-slate-600 hover:text-slate-500 border border-transparent'
                }`}>
                {stage}
                {!hasAccess && !isFullAccess && (
                  <svg className="w-3 h-3 text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                )}
                {count > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full ${
                    isActiveTab ? 'bg-white/20 text-white' : 'bg-blue-500/20 text-blue-300'
                  }`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Read-only banner for non-permitted stages */}
      {!activeStageCanManage && !isFullAccess && (
        <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm text-amber-400">Mode hanya lihat — Anda tidak memiliki akses untuk mengelola tahap <strong>{activeStage}</strong>.</p>
        </div>
      )}

      <div className="space-y-4 pt-6">
        {/* Antrian Section (one-click finish + advance) */}
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-white">Antrian {activeStage}</h2>
              <div className="flex items-center gap-4 mt-1 flex-wrap">
                <span className="text-xs text-slate-500">Total Qty: <strong className="text-white">{tersediaQty}</strong></span>
                <span className="text-xs text-slate-500">
                  Jumlah WO: <strong className="text-white">{tersediaWos.length}</strong>
                  {search && tersediaWosRaw.length !== tersediaWos.length && (
                    <span className="text-slate-500"> / {tersediaWosRaw.length}</span>
                  )}
                </span>
                {STAGE_DURATIONS[activeStage] !== undefined && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Durasi SLA:
                    {STAGE_DURATIONS[activeStage] === 0
                      ? <strong>hari yang sama</strong>
                      : <strong>+{STAGE_DURATIONS[activeStage]} hari kerja</strong>}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Per-stage search di baris sendiri supaya tidak kepotong /
              ke-wrap tersembunyi pas ruang antrian sempit atau role
              dengan sidebar yang lebih lebar. Selalu terlihat untuk
              semua role (super admin, proofing, produksi, dsb). */}
          <div className="relative w-full">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari WO, customer, paket..."
              className="w-full bg-[#0d1117] border border-white/10 text-white text-sm placeholder-slate-500 rounded-lg pl-9 pr-8 py-2 focus:outline-none focus:border-blue-500/40"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                title="Clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          {tersediaWos.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-slate-500">
                {search
                  ? `Tidak ada perintah kerja yang cocok dengan "${search}".`
                  : 'Tidak ada perintah kerja yang tersedia untuk tahap ini.'}
              </p>
            </div>
          ) : (
            tersediaWos.map(item => {
              const gatedWaiting = isWaitingListGated(item);
              const gatedProof = isProofingGated(item);
              const gatedReject = isRejectGated(item);
              const gatedPelunasan = isPelunasanPending(item);
              const gated = gatedWaiting || gatedProof || gatedReject || gatedPelunasan;
              // Differentiate whether the block is at the Bukti step or
              // the Finance approve step so the operator knows who
              // needs to act.
              const waitingOrd = gatedWaiting ? ordersById[Number(item.wo?.order_id)] : null;
              const buktiPending = waitingOrd && Number(waitingOrd.bukti_uploaded) !== 1;
              // At Shipment (stage terakhir), tombol utamanya label
              // 'Submit Pelunasan' — buka upload modal, bukan straight
              // advance. Setelah Finance approve, WO ditandai SELESAI.
              const isShipmentStage = activeStage === 'Shipment';
              const gateLabel = gatedPelunasan
                ? 'Menunggu Finance'
                : gatedWaiting
                  ? (buktiPending ? 'Menunggu Bukti' : 'Menunggu Finance')
                  : gatedProof
                    ? 'Menunggu WO'
                    : gatedReject
                      ? 'Menunggu Gudang'
                      : isShipmentStage
                        ? 'Submit Pelunasan'
                        : 'Selesai & Lanjut';
              const gateTitle = gatedPelunasan
                ? 'Bukti pelunasan sudah dikirim, tunggu Finance review'
                : gatedWaiting
                  ? (buktiPending
                      ? 'CS Order belum upload bukti pembayaran DP Produksi'
                      : 'Finance belum approve invoice — buka menu Approval Finance')
                  : gatedProof
                    ? 'Buat/konfirmasi WO di Menu Work Orders dulu'
                    : gatedReject
                      ? 'Permintaan bahan reject masih menunggu approval gudang'
                      : isShipmentStage
                        ? 'Upload bukti pelunasan → dikirim ke Finance untuk review; setelah approve WO selesai'
                        : undefined;
              return (
              <WoCard key={item.id} item={item} actions={
                activeStageCanManage || isFullAccess ? (
                  <>
                    {user?.username === ROLLBACK_EMAIL && stages.findIndex((s: Row) => s.id === item.stage_id) > 0 && (
                      <button onClick={() => handleKembalikan(item)}
                        className="text-xs font-medium text-amber-400 border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors flex items-center gap-1.5"
                        title="Kembalikan ke tahap sebelumnya">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                        Kembalikan
                      </button>
                    )}
                    {REJECT_STAGES.has(activeStage) && (
                      <button onClick={() => openRejectModal(item)}
                        className="text-xs font-medium text-rose-400 border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 rounded-lg hover:bg-rose-500/20 transition-colors">
                        Reject
                      </button>
                    )}
                    <button onClick={() => handleSelesai(item)}
                      disabled={gated}
                      title={gateTitle}
                      className={`text-xs font-medium border px-3 py-1.5 rounded-lg transition-colors ${
                        gated
                          ? 'text-slate-500 border-white/[0.06] bg-white/[0.02] cursor-not-allowed'
                          : 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20'
                      }`}>
                      {gateLabel}
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-slate-600 italic">Read only</span>
                )
              } />
              );
            })
          )}
        </div>
      </div>

      {rejectItem && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={closeRejectModal} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className={`w-full ${rejectTipe === 'WITH_BAHAN' ? 'max-w-4xl' : 'max-w-md'} bg-[#111827] border border-white/[0.06] rounded-xl shadow-2xl shadow-black/50 flex flex-col max-h-[92vh]`}>
              <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-base font-semibold text-white">Reject di Tahap {activeStage}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    WO {rejectItem.wo?.no_wo} · {rejectItem.wo?.customer_nama}
                  </p>
                </div>
                <button onClick={closeRejectModal} className="text-slate-500 hover:text-white p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="px-6 py-5 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Jenis Reject</label>
                  <div className="grid grid-cols-1 gap-2">
                    <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${rejectTipe === 'WITHOUT_BAHAN' ? 'border-rose-500/40 bg-rose-500/10' : 'border-white/10 bg-[#0d1117] hover:border-white/20'}`}>
                      <input type="radio" name="rejectTipe" checked={rejectTipe === 'WITHOUT_BAHAN'} onChange={() => setRejectTipe('WITHOUT_BAHAN')} className="mt-1 accent-rose-500" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white">Tanpa Penambahan Bahan</div>
                        <div className="text-xs text-slate-500 mt-0.5">Barang dikembalikan ke proses untuk diperbaiki, tidak butuh bahan baru dari gudang.</div>
                      </div>
                    </label>
                    <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${rejectTipe === 'WITH_BAHAN' ? 'border-rose-500/40 bg-rose-500/10' : 'border-white/10 bg-[#0d1117] hover:border-white/20'}`}>
                      <input type="radio" name="rejectTipe" checked={rejectTipe === 'WITH_BAHAN'} onChange={() => setRejectTipe('WITH_BAHAN')} className="mt-1 accent-rose-500" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white">Dengan Penambahan Bahan</div>
                        <div className="text-xs text-slate-500 mt-0.5">Kirim form permintaan bahan ke gudang; produksi lanjut setelah bahan siap.</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Keterangan Reject <span className="text-rose-400">*</span></label>
                  <textarea
                    value={rejectKeterangan}
                    onChange={e => setRejectKeterangan(e.target.value)}
                    rows={3}
                    placeholder="Contoh: jahitan lepas di bagian bahu, warna tidak sesuai proofing..."
                    className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                {rejectTipe === 'WITH_BAHAN' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-white">
                        Form Permintaan Gudang <span className="text-rose-400">*</span>
                      </label>
                      <span className="text-[11px] text-slate-500">
                        CUST = <span className="text-slate-300">{rejectItem.wo?.customer_nama || '-'}</span>
                      </span>
                    </div>
                    <div className="border border-white/10 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto max-h-[52vh] overflow-y-auto">
                        <table className="w-full min-w-[640px] text-xs">
                          <thead className="sticky top-0 bg-[#0d1117] z-10">
                            <tr className="border-b border-white/10">
                              <th className="w-10 px-2 py-2 text-slate-400 font-medium text-center">NO</th>
                              <th className="text-left px-3 py-2 text-slate-400 font-medium">ITEM</th>
                              <th className="text-left px-3 py-2 text-slate-400 font-medium">BAHAN</th>
                              <th className="text-left px-3 py-2 text-slate-400 font-medium">WARNA</th>
                              <th className="text-left px-3 py-2 text-slate-400 font-medium">KUANTITAS</th>
                              <th className="w-8" />
                            </tr>
                          </thead>
                          <tbody>
                            {rejectRows.map((row, idx) => {
                              const colorTint: Record<string, string> = {
                                gray: 'bg-slate-500/10',
                                peach: 'bg-orange-500/10',
                                blue: 'bg-blue-500/10',
                                green: 'bg-emerald-500/10',
                                yellow: 'bg-yellow-500/10',
                                red: 'bg-rose-500/15',
                              };
                              const rowBg = row.color ? colorTint[row.color] : (row.isSize ? 'bg-white/[0.02]' : '');
                              const isPredefined = idx < GUDANG_FORM_ITEMS.length;
                              return (
                                <tr key={idx} className={`border-b border-white/[0.04] ${rowBg}`}>
                                  <td className="text-center text-slate-500 tabular-nums px-2 py-1.5">{idx + 1}</td>
                                  <td className={`px-3 py-1.5 ${row.isSize ? 'pl-8 text-slate-400 font-semibold' : 'text-slate-200 font-medium'}`}>
                                    {isPredefined ? (
                                      row.item
                                    ) : (
                                      <input
                                        type="text"
                                        value={row.item}
                                        onChange={e => updateCustomItemName(idx, e.target.value)}
                                        placeholder="Nama item"
                                        className="w-full bg-transparent border-b border-white/10 text-slate-200 px-1 py-0.5 focus:outline-none focus:border-blue-500/50"
                                      />
                                    )}
                                  </td>
                                  <td className="px-1.5 py-1">
                                    <input type="text" value={row.bahan}
                                      onChange={e => updateRejectRow(idx, 'bahan', e.target.value)}
                                      className="w-full bg-transparent border-b border-white/10 text-slate-200 px-2 py-1 focus:outline-none focus:border-blue-500/50" />
                                  </td>
                                  <td className="px-1.5 py-1">
                                    <input type="text" value={row.warna}
                                      onChange={e => updateRejectRow(idx, 'warna', e.target.value)}
                                      className="w-full bg-transparent border-b border-white/10 text-slate-200 px-2 py-1 focus:outline-none focus:border-blue-500/50" />
                                  </td>
                                  <td className="px-1.5 py-1">
                                    <input type="text" value={row.kuantitas}
                                      onChange={e => updateRejectRow(idx, 'kuantitas', e.target.value)}
                                      className="w-full bg-transparent border-b border-white/10 text-slate-200 px-2 py-1 focus:outline-none focus:border-blue-500/50" />
                                  </td>
                                  <td className="px-1">
                                    {!isPredefined && (
                                      <button onClick={() => removeRejectRow(idx)} title="Hapus baris"
                                        className="text-slate-600 hover:text-rose-400 p-1">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <button onClick={addCustomRejectRow}
                        className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        Tambah baris custom
                      </button>
                      <p className="text-[11px] text-slate-500">Isi kolom Bahan / Warna / Kuantitas hanya untuk baris yang diperlukan.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-2 shrink-0">
                <button onClick={closeRejectModal} disabled={rejectSaving}
                  className="text-sm font-medium text-slate-400 hover:text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                  Batal
                </button>
                <button onClick={submitReject} disabled={rejectSaving}
                  className="text-sm font-medium text-white bg-rose-600 hover:bg-rose-500 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                  {rejectSaving ? 'Menyimpan...' : 'Simpan Reject'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {pelunasanItem && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={pelunasanSaving ? undefined : closePelunasanModal} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[#111827] border border-white/[0.06] rounded-xl shadow-2xl shadow-black/50 flex flex-col max-h-[92vh]">
              <div className="px-6 py-4 border-b border-white/[0.06] flex items-start justify-between shrink-0">
                <div>
                  <h3 className="text-base font-semibold text-white">Upload Bukti Pelunasan</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    WO {pelunasanItem.wo?.no_wo} · {pelunasanItem.wo?.customer_nama}
                  </p>
                </div>
                <button onClick={closePelunasanModal} disabled={pelunasanSaving}
                  className="text-slate-500 hover:text-white p-1 disabled:opacity-50">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="px-6 py-5 space-y-4 overflow-y-auto">
                <div className="text-[11px] text-slate-500 border border-white/[0.06] bg-white/[0.02] rounded-lg p-3 leading-relaxed">
                  Upload bukti transfer pelunasan customer. Setelah submit, order dikirim ke <strong className="text-white">Approval Finance</strong> untuk review. WO tetap di stage Shipment dengan status <em>menunggu review Finance</em>. Setelah Finance approve, order otomatis dinyatakan <strong className="text-white">SELESAI</strong>.
                </div>

                {!pelunasanBukti ? (
                  <label
                    onDragEnter={(e) => { e.preventDefault(); if (!pelunasanUploading) setPelunasanDragOver(true); }}
                    onDragOver={(e) => { e.preventDefault(); if (!pelunasanUploading) setPelunasanDragOver(true); }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                      setPelunasanDragOver(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setPelunasanDragOver(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f && !pelunasanUploading) handlePelunasanFile(f);
                    }}
                    className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-8 cursor-pointer transition-colors ${
                      pelunasanUploading
                        ? 'border-white/10 opacity-60 cursor-wait'
                        : pelunasanDragOver
                          ? 'border-blue-500/60 bg-blue-500/10'
                          : 'border-white/10 hover:border-blue-500/40 hover:bg-white/[0.02]'
                    }`}
                  >
                    {pelunasanUploading ? (
                      <>
                        <svg className="w-8 h-8 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="text-sm text-slate-300">Mengupload...</span>
                      </>
                    ) : (
                      <>
                        <svg className={`w-8 h-8 ${pelunasanDragOver ? 'text-blue-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        <span className={`text-sm ${pelunasanDragOver ? 'text-blue-300' : 'text-slate-300'}`}>
                          {pelunasanDragOver ? 'Lepaskan file di sini' : 'Klik atau drop file untuk upload'}
                        </span>
                        <span className="text-[11px] text-slate-500">PNG, JPG, PDF · max 5 MB · drag dari WhatsApp / folder OK</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePelunasanFile(f);
                      }}
                      disabled={pelunasanUploading}
                    />
                  </label>
                ) : (
                  <div className="border border-white/10 rounded-lg p-3 space-y-2 bg-[#0d1117]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-xs text-slate-300 truncate">{pelunasanBuktiName || pelunasanFile?.name || 'bukti.tf'}</span>
                      </div>
                      <button
                        onClick={() => { setPelunasanFile(null); setPelunasanBukti(null); setPelunasanBuktiName(''); }}
                        className="text-xs text-slate-500 hover:text-rose-400 shrink-0"
                      >
                        Ganti
                      </button>
                    </div>
                    {(pelunasanBukti.startsWith('data:image')
                      || /\.(png|jpe?g|gif|webp)$/i.test(pelunasanBuktiName)
                      || pelunasanBukti.startsWith('/api/files/')) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pelunasanBukti} alt="Bukti Pelunasan" className="max-h-64 rounded border border-white/10 mx-auto" />
                    )}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-2 shrink-0">
                <button onClick={closePelunasanModal} disabled={pelunasanSaving}
                  className="text-sm font-medium text-slate-400 hover:text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                  Batal
                </button>
                <button onClick={submitPelunasan} disabled={pelunasanSaving || pelunasanUploading || !pelunasanBukti}
                  className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-lg transition-colors disabled:opacity-40">
                  {pelunasanSaving ? 'Menyimpan...' : 'Submit ke Finance'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
