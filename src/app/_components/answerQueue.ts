'use client';

// Durable answer queue (input-timing #4a). The instant an answer is captured — with
// its client-measured interval and an idempotency key — it is written to
// localStorage, BEFORE any network call, so a tab close / reload never loses the
// child's work or its timing. A flusher drains entries to the idempotent ingest
// endpoint and removes them only once acknowledged; a retried batch never
// double-counts because the server dedups on idemKey (#4b).
//
// localStorage (not IndexedDB) is deliberate: the payloads are tiny, it is durable
// across reload, and it's synchronous so an enqueue can't lose a race with a fast
// tab close.

export type QueuedAnswer = {
  idemKey: string;
  playerId: string;
  kind: 'session' | 'sprint';
  context: string; // sessionId or sprintId, stringified
  code: string;
  seed: number;
  given: string | null;
  tries: number;
  intervalMs: number;
  ts: number;
};

const KEY = 'celerant.answerQueue.v1';

function read(): QueuedAnswer[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedAnswer[]) : [];
  } catch {
    return [];
  }
}

function write(q: QueuedAnswer[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    /* quota / private mode — best effort; the request-response path is the backstop */
  }
}

export function enqueueAnswer(a: QueuedAnswer): void {
  const q = read();
  if (q.some((e) => e.idemKey === a.idemKey)) return; // local dedup — enqueue is idempotent too
  q.push(a);
  write(q);
}

export function pendingAnswers(kind?: 'session' | 'sprint'): QueuedAnswer[] {
  const q = read();
  return kind ? q.filter((e) => e.kind === kind) : q;
}

// Remove acknowledged entries (server returned 2xx and recorded them).
export function ackAnswers(idemKeys: readonly string[]): void {
  if (idemKeys.length === 0) return;
  const done = new Set(idemKeys);
  write(read().filter((e) => !done.has(e.idemKey)));
}

// A unique idempotency key generated once at capture and stored with the answer, so
// it is stable across retries and reloads. Single-child device — collision-proof
// enough; the server dedups on it regardless.
export function newIdemKey(playerId: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const t = typeof performance !== 'undefined' ? Math.floor(performance.now()) : 0;
  return `${playerId}.${t}.${rand}`;
}
