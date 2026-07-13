import { NextResponse } from 'next/server';
import { runMigrationsForce, getLastMigrationReport } from '@/lib/migrate';
import { query } from '@/lib/db';

// GET /api/admin/run-migrations
// Force-run any pending migrations. Useful when the auto-migration on
// instrumentation.ts didn't fire (some managed hosts skip the hook, or
// the migration promise was already resolved before a new migration
// landed). Safe to call multiple times — each migration name is only
// applied once thanks to the _migrations tracking table.
//
// Returns the list of applied filenames + orders.status column type so
// the client can confirm 024 landed.
export async function GET() {
  try {
    await runMigrationsForce();

    let applied: string[] = [];
    try {
      const rows = await query<{ filename: string }>('SELECT filename FROM _migrations ORDER BY id');
      applied = rows.map(r => r.filename);
    } catch {}

    let statusColumnType = '';
    try {
      const info = await query<{ COLUMN_TYPE: string }>(
        "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_NAME = 'orders' AND COLUMN_NAME = 'status' AND TABLE_SCHEMA = DATABASE()"
      );
      statusColumnType = String(info[0]?.COLUMN_TYPE || '');
    } catch {}

    // List columns on the tables migration 021/022 touch so we can see
    // which specific ALTER didn't land.
    async function columnsFor(table: string): Promise<string[]> {
      try {
        const rows = await query<{ COLUMN_NAME: string }>(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()",
          [table]
        );
        return rows.map(r => r.COLUMN_NAME);
      } catch { return []; }
    }
    const [ordersCols, orderItemsCols, orderPaymentsCols] = await Promise.all([
      columnsFor('orders'),
      columnsFor('order_items'),
      columnsFor('order_payments'),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Migrations run (or already applied).',
      applied,
      orders_status_column: statusColumnType,
      report: getLastMigrationReport(),
      columns: {
        orders: ordersCols,
        order_items: orderItemsCols,
        order_payments: orderPaymentsCols,
      },
    });
  } catch (err) {
    console.error('/api/admin/run-migrations error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
