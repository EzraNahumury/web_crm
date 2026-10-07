import { NextRequest, NextResponse } from 'next/server';
import { query, execute, insert, queryOne } from '@/lib/db';
import { pengeluaranSig, type SigRow } from '@/lib/pengeluaran-sig';

// Finance "Pekerjaan Pesanan" → "Finalisasi".
//
// Payload: { wo_id: number, action: 'finalize' | 'unfinalize', by?: string }
//
// finalize   : tandai WO sudah diinput finance ke Accurate (checklist).
//              revisi_count++, catat checklist_json, finalized=1, simpan
//              pengeluaran_sig = signature isi pengeluaran saat ini. WO akan
//              pindah ke menu Finalisasi. Butuh wo_pengeluaran_bahan ada isinya.
// unfinalize : batalkan finalisasi secara manual → finalized=0 (balik ke
//              Pekerjaan Pesanan). revisi_count & riwayat checklist dipertahankan.

interface FinanceRow {
  id: number;
  revisi_count: number;
  checklist_json: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const woId = Number(body.wo_id);
    const action = String(body.action || '');
    const by: string | null = body.by ? String(body.by).slice(0, 100) : null;
    if (!woId) return NextResponse.json({ success: false, error: 'wo_id required' }, { status: 400 });
    if (action !== 'finalize' && action !== 'unfinalize') {
      return NextResponse.json({ success: false, error: 'action tidak valid' }, { status: 400 });
    }

    const existing = await queryOne<FinanceRow>(
      'SELECT id, revisi_count, checklist_json FROM wo_finance WHERE work_order_id = ? LIMIT 1',
      [woId]
    );

    if (action === 'unfinalize') {
      if (existing) {
        await execute('UPDATE wo_finance SET finalized = 0 WHERE id = ?', [existing.id]);
      }
      return NextResponse.json({ success: true });
    }

    // ─── finalize ───
    const detailRows = await query<SigRow>(
      'SELECT bahan, warna, kuantitas FROM wo_pengeluaran_bahan WHERE work_order_id = ?',
      [woId]
    );
    const hasData = detailRows.some(r => String(r.bahan ?? '').trim() && (Number(r.kuantitas) || 0) > 0);
    if (!hasData) {
      return NextResponse.json(
        { success: false, error: 'Belum ada Real Pengeluaran Bahan untuk WO ini.' },
        { status: 400 }
      );
    }
    const sig = pengeluaranSig(detailRows);

    let history: { ke: number; at: string; by: string | null }[] = [];
    if (existing?.checklist_json) {
      try {
        const parsed = JSON.parse(existing.checklist_json);
        if (Array.isArray(parsed)) history = parsed;
      } catch { history = []; }
    }
    const nextCount = (existing ? Number(existing.revisi_count) || 0 : 0) + 1;
    history.push({ ke: nextCount, at: new Date().toISOString(), by });
    const historyJson = JSON.stringify(history);

    if (existing) {
      await execute(
        'UPDATE wo_finance SET finalized = 1, revisi_count = ?, checklist_json = ?, pengeluaran_sig = ?, finalized_at = CURRENT_TIMESTAMP, finalized_by = ? WHERE id = ?',
        [nextCount, historyJson, sig, by, existing.id]
      );
    } else {
      await insert(
        'INSERT INTO wo_finance (work_order_id, finalized, revisi_count, checklist_json, pengeluaran_sig, finalized_at, finalized_by) VALUES (?, 1, ?, ?, ?, CURRENT_TIMESTAMP, ?)',
        [woId, nextCount, historyJson, sig, by]
      );
    }

    return NextResponse.json({ success: true, revisi_count: nextCount });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
