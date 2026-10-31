import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { id, DomainError, type RecordData } from './domain.js';
export type TenantContext = {
  companyId: string;
  userId: string;
  membershipId: string;
  permissions: string[];
  ownOnly?: boolean;
  impersonation?: string;
  readOnly?: boolean;
};
export const tenantContext = new AsyncLocalStorage<TenantContext>();
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS entities(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE INDEX IF NOT EXISTS idx_entities_tenant ON entities(company_id,kind);
      CREATE TABLE IF NOT EXISTS global_entities(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_global_kind ON global_entities(kind);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,company_id TEXT,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL,impersonation TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS unique_campaign_code ON entities(company_id,json_extract(data,'$.code')) WHERE kind='campaign';
      CREATE UNIQUE INDEX IF NOT EXISTS unique_run_deal ON entities(company_id,json_extract(data,'$.runId'),json_extract(data,'$.dealId')) WHERE kind='item';
      CREATE UNIQUE INDEX IF NOT EXISTS unique_occurrence ON entities(company_id,json_extract(data,'$.campaignId'),json_extract(data,'$.occurrenceAt')) WHERE kind='run';
      CREATE UNIQUE INDEX IF NOT EXISTS unique_enrollment ON entities(company_id,json_extract(data,'$.campaignId'),json_extract(data,'$.keyHash')) WHERE kind='enrollment';`);
  }
  context() {
    const ctx = tenantContext.getStore();
    if (!ctx) throw new DomainError(500, 'Tenant context is required.');
    return ctx;
  }
  list(kind: string): RecordData[] {
    return this.rawList(kind, this.context().companyId);
  }
  get(kind: string, entityId: string): RecordData {
    const ctx = this.context();
    const row = this.db
      .prepare('SELECT data FROM entities WHERE id=? AND company_id=? AND kind=?')
      .get(entityId, ctx.companyId, kind) as any;
    if (!row) throw new DomainError(404, 'This record was not found.');
    return JSON.parse(row.data);
  }
  put(kind: string, data: Record<string, any>): RecordData {
    const ctx = this.context();
    if (ctx.readOnly) throw new DomainError(403, 'This support session is read-only.');
    const value = { ...data, id: data.id ?? id(), companyId: ctx.companyId };
    const existing = this.db
      .prepare('SELECT company_id,kind FROM entities WHERE id=?')
      .get(value.id) as any;
    if (existing && (existing.company_id !== ctx.companyId || existing.kind !== kind))
      throw new DomainError(404, 'This record was not found.');
    this.db
      .prepare(
        'INSERT INTO entities(id,company_id,kind,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(value.id, ctx.companyId, kind, JSON.stringify(value));
    return value;
  }
  remove(kind: string, entityId: string) {
    if (this.context().readOnly) throw new DomainError(403, 'This support session is read-only.');
    this.get(kind, entityId);
    this.db
      .prepare('DELETE FROM entities WHERE id=? AND company_id=? AND kind=?')
      .run(entityId, this.context().companyId, kind);
  }
  rawList(kind: string, companyId: string): RecordData[] {
    return (
      this.db
        .prepare(
          'SELECT data FROM entities WHERE company_id=? AND kind=? ORDER BY created_at DESC,rowid DESC',
        )
        .all(companyId, kind) as any[]
    ).map((r) => JSON.parse(r.data));
  }
  globalList(kind: string): any[] {
    return (
      this.db.prepare('SELECT data FROM global_entities WHERE kind=?').all(kind) as any[]
    ).map((r) => JSON.parse(r.data));
  }
  globalGet(kind: string, entityId: string): any {
    const row = this.db
      .prepare('SELECT data FROM global_entities WHERE id=? AND kind=?')
      .get(entityId, kind) as any;
    if (!row) throw new DomainError(404, 'This record was not found.');
    return JSON.parse(row.data);
  }
  globalPut(kind: string, data: any) {
    const value = { ...data, id: data.id ?? id() };
    this.db
      .prepare(
        'INSERT INTO global_entities(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(value.id, kind, JSON.stringify(value));
    return value;
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  audit(action: string, target?: string, data?: any) {
    const ctx = this.context();
    const entry = {
      id: id(),
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action,
      target,
      data,
      at: new Date().toISOString(),
      impersonation: ctx.impersonation,
    };
    this.db
      .prepare('INSERT INTO entities(id,company_id,kind,data) VALUES(?,?,?,?)')
      .run(entry.id, ctx.companyId, 'audit', JSON.stringify(entry));
  }
  close() {
    this.db.close();
  }
}
