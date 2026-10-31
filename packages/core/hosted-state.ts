import type { PoolClient } from 'pg';
import { Store } from './store.js';
import { AuthVault } from './totp.js';

// Transitional, low-volume deployment adapter. PostgreSQL is authoritative.
// A row lock serializes requests across instances; SQLite is an in-memory query
// engine only. No application data is written to Vercel's ephemeral filesystem.
// Replace with normalized PostgreSQL repositories before high-volume campaigns.
export type HostedState = {
  version: 1;
  entities: any[];
  globals: any[];
  sessions: any[];
  challenges: [string, any][];
  limiter: [string, any][];
};
export function snapshot(store: Store): HostedState {
  return {
    version: 1,
    entities: store.db.prepare('SELECT * FROM entities ORDER BY rowid').all(),
    globals: store.db.prepare('SELECT * FROM global_entities').all(),
    sessions: store.db.prepare('SELECT * FROM sessions').all(),
    challenges: [], limiter: [],
  };
}
export function hydrate(state: HostedState): Store {
  if (state.version !== 1) throw new Error('Unsupported hosted state version');
  const store = new Store(':memory:');
  store.transaction(() => {
    for (const r of state.entities) store.db.prepare('INSERT INTO entities(id,company_id,kind,data,created_at) VALUES(?,?,?,?,?)').run(r.id,r.company_id,r.kind,r.data,r.created_at);
    for (const r of state.globals) store.db.prepare('INSERT INTO global_entities(id,kind,data) VALUES(?,?,?)').run(r.id,r.kind,r.data);
    for (const r of state.sessions) store.db.prepare('INSERT INTO sessions(hash,user_id,company_id,csrf,expires_at,impersonation) VALUES(?,?,?,?,?,?)').run(r.hash,r.user_id,r.company_id,r.csrf,r.expires_at,r.impersonation);
  });
  return store;
}
export async function beginState(client: PoolClient, vault: AuthVault) {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '12s'");
  await client.query("SET LOCAL statement_timeout = '20s'");
  // Fixed namespace never touches another application's public tables.
  await client.query('SELECT pg_advisory_xact_lock(842113097)');
  await client.query('CREATE SCHEMA IF NOT EXISTS truemarketing');
  await client.query('CREATE TABLE IF NOT EXISTS truemarketing.runtime_state (id integer PRIMARY KEY CHECK(id=1), payload text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
  const row = await client.query('SELECT payload FROM truemarketing.runtime_state WHERE id=1 FOR UPDATE');
  const payload = row.rows[0]?.payload ?? process.env.TM_BOOTSTRAP_STATE;
  if (!payload) throw new Error('Initial company state must be provisioned before first startup');
  return JSON.parse(vault.decrypt(payload)) as HostedState;
}
export async function commitState(client: PoolClient, vault: AuthVault, state: HostedState) {
  await client.query('INSERT INTO truemarketing.runtime_state(id,payload) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=now()', [vault.encrypt(JSON.stringify(state))]);
  await client.query('COMMIT');
}
