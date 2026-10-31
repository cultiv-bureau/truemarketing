import 'reflect-metadata';
import express from 'express';
import { Pool } from 'pg';
import { AppService } from './service.js';
import { AuthVault } from '../../packages/core/totp.js';
import { beginState, commitState, hydrate, snapshot } from '../../packages/core/hosted-state.js';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({limit:'256kb'}));
let pool: Pool | undefined;
app.use(async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  let client;
  let service: AppService | undefined;
  try {
    const connectionString = process.env.TM_DATABASE_DATABASE_URL_POOLED ?? process.env.TM_DATABASE_POSTGRES_URL ?? process.env.TM_DATABASE_DATABASE_URL ?? process.env.TM_DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
    if (!connectionString?.startsWith('postgres')) throw new Error('Direct PostgreSQL connection is required');
    const databaseUrl = new URL(connectionString);
    databaseUrl.searchParams.set('sslmode', 'verify-full');
    const vault = new AuthVault('/tmp/unused-auth-key');
    pool ??= new Pool({connectionString: databaseUrl.toString(), max:2, connectionTimeoutMillis:10000, idleTimeoutMillis:10000});
    client = await pool.connect();
    const state = await beginState(client, vault);
    const store = hydrate(state);
    service = new AppService(store);
    service.challenges = new Map(state.challenges);
    service.limiter = new Map(state.limiter.filter(([,v]) => v.reset > Date.now()));
    // Buffer responses until PostgreSQL commits: never acknowledge an unsaved login.
    let result: any;
    const originalJson = res.json.bind(res);
    res.json = ((body: any) => { result=body; return res; }) as typeof res.json;
    await service.handle(req,res);
    const next = snapshot(store);
    next.challenges = [...service.challenges];
    next.limiter = [...service.limiter];
    await commitState(client,vault,next);
    originalJson(result);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    console.error('Hosted request failed', error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]') : 'Unknown error');
    if (!res.headersSent) {
      res.removeHeader('Set-Cookie');
      res.status(503).end(JSON.stringify({error:'Service is temporarily unavailable. Please try again.'}));
    }
  } finally {
    service?.onModuleDestroy();
    client?.release();
  }
});
export default app;

