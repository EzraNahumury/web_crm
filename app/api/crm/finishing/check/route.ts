import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';

// POST /api/crm/finishing/check
// Body: { order_id: number, keterangan?: string | null, completed?: boolean }
//
// Upserts a crm_finishing row for the order. If `completed` is provided:
//   true  → set completed_at = NOW (moves the row to History Finishing)
//   false → NULL out completed_at (uncheck from history back to the board)
// If only `keterangan` is provided, only that column is written.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = Number(body?.order_id);
    if (!orderId) return NextResponse.json({ success: false, error: 'order_id required' }, { status: 400 });

    const hasKeterangan = 'keterangan' in body;
    const hasCompleted = 'completed' in body;
    if (!hasKeterangan && !hasCompleted) {
      return NextResponse.json({ success: false, error: 'nothing to update' }, { status: 400 });
    }

    const ket: string | null = hasKeterangan ? (body.keterangan == null ? null : String(body.keterangan)) : null;
    const completedAt: string | null = hasCompleted ? (body.completed ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null) : null;

    // Build the ON DUPLICATE KEY UPDATE clause conditionally so we don't
    // overwrite fields that weren't in the request.
    const insertCols = ['order_id'];
    const insertPlaceholders = ['?'];
    const insertValues: (string | number | null)[] = [orderId];
    const updateSet: string[] = [];

    if (hasKeterangan) {
      insertCols.push('keterangan');
      insertPlaceholders.push('?');
      insertValues.push(ket);
      updateSet.push('`keterangan` = VALUES(`keterangan`)');
    }
    if (hasCompleted) {
      insertCols.push('completed_at');
      insertPlaceholders.push('?');
      insertValues.push(completedAt);
      updateSet.push('`completed_at` = VALUES(`completed_at`)');
    }

    const sql =
      `INSERT INTO \`crm_finishing\` (${insertCols.map(c => `\`${c}\``).join(', ')}) ` +
      `VALUES (${insertPlaceholders.join(', ')}) ` +
      `ON DUPLICATE KEY UPDATE ${updateSet.join(', ')}`;

    await execute(sql, insertValues);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/crm/finishing/check error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
