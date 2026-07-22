// Next.js server-boot hook (runs once when the server starts). Opening the DB here
// forces the schema + every idempotent migration and one-off to run ON DEPLOY, so
// "deployed" and "live" are the same state.
//
// Why this exists: migrations previously ran lazily inside getDb(), on the first
// request that actually touched the DB. Between deploys with no authenticated
// traffic that left real changes pending in prod invisibly — the θ-scoring rebuild
// sat un-applied after a deploy until a child next played, and a local replay
// "verifying" it proved only that the code was right, not that the world had changed.
// Boot-time init makes every post-deploy verification a claim about the running
// server, not about the next user's session.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { getDb } = await import('@/db');
      getDb(); // opens the connection → applies SCHEMA + MIGRATIONS + one-off placements
    } catch {
      // Never let a migration hiccup block server boot: the connection isn't cached
      // on failure, so the first real request retries the same init (the old lazy path).
    }
  }
}
