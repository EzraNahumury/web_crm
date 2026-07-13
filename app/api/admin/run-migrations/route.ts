import { NextResponse } from 'next/server';
import { runMigrationsForce } from '@/lib/migrate';

// GET /api/admin/run-migrations
// Force-run any pending migrations. Useful when the auto-migration on
// instrumentation.ts didn't fire (some managed hosts skip the hook, or
// the migration promise was already resolved before a new migration
// landed). Safe to call multiple times — each migration name is only
// applied once thanks to the _migrations tracking table.
export async function GET() {
  try {
    // Force-reset the singleton so any migrations added since the last
    // server start actually run. The DB-side _migrations table still
    // guards each entry so applied ones are skipped inside runMigrations.
    await runMigrationsForce();
    return NextResponse.json({ success: true, message: 'Migrations run (or already applied).' });
  } catch (err) {
    console.error('/api/admin/run-migrations error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
