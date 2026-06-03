// Next.js instrumentation hook — runs once when the Node runtime starts.
// We use it to apply pending database migrations so production deploys are
// self-healing (no need to open phpMyAdmin after a push).

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { runMigrationsOnce } = await import('./lib/migrate');
    await runMigrationsOnce();
  } catch (err) {
    console.error('[instrumentation] migration error:', err);
  }
}
