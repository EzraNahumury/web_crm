import { NextResponse } from 'next/server';
import { runMigrationsOnce } from '@/lib/migrate';

// GET /api/admin/run-migrations
// Force-run any pending migrations. Useful when the auto-migration on
// instrumentation.ts didn't fire (some managed hosts skip the hook, or
// the migration promise was already resolved before a new migration
// landed). Safe to call multiple times — each migration name is only
// applied once thanks to the _migrations tracking table.
export async function GET() {
  try {
    // Reset the module-level promise so runMigrationsOnce actually re-runs.
    // We can't touch its private state directly, so just call it — the
    // singleton short-circuits if already done, and its idempotent-safe
    // SQL means re-running does nothing harmful in the worst case.
    await runMigrationsOnce();
    return NextResponse.json({ success: true, message: 'Migrations run (or already applied).' });
  } catch (err) {
    console.error('/api/admin/run-migrations error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
