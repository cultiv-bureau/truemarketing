import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, tenantContext } from '../dist/packages/core/store.js';
import { hydrate, snapshot, beginState, commitState } from '../dist/packages/core/hosted-state.js';
import { AuthVault } from '../dist/packages/core/totp.js';

test('hosted state preserves tenants and sessions across cold starts', () => {
  const store = new Store(':memory:');
  for (const companyId of ['bureau', 'mazeed']) tenantContext.run({companyId,userId:'owner',membershipId:'owner',permissions:[]}, () => store.put('segment',{id:companyId+'-segment',name:companyId}));
  store.globalPut('user',{id:'owner',name:'Owner'});
  store.db.prepare('INSERT INTO sessions(hash,user_id,company_id,csrf,expires_at) VALUES(?,?,?,?,?)').run('hash','owner','mazeed','csrf',Date.now()+60000);
  const restored = hydrate(snapshot(store));
  tenantContext.run({companyId:'mazeed',userId:'owner',membershipId:'owner',permissions:[]}, () => {
    assert.equal(restored.list('segment').length,1);
    assert.throws(()=>restored.get('segment','bureau-segment'));
  });
  assert.equal(restored.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,1);
  restored.close(); store.close();
});

test('hosted state encrypts challenges and commits before acknowledging a request', async () => {
  const previousKey = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32,7).toString('base64');
  try {
    const vault = new AuthVault('unused');
    const store = new Store(':memory:');
    const state = snapshot(store);
    state.challenges = [['hashed-token',{secret:'private-totp',expires:Date.now()+60000}]];
    let saved = '';
    const calls: string[]=[];
    const client = {query:async(sql:string,params?:any[])=> {
      calls.push(sql);
      if(sql.startsWith('INSERT INTO')) saved=params![0];
      return {rows:sql.startsWith('SELECT payload') ? [{payload:saved}] : []};
    }};
    await commitState(client as any,vault,state);
    assert.ok(!saved.includes('private-totp'));
    const read = await beginState(client as any,vault);
    assert.deepEqual(read.challenges,state.challenges);
    assert.ok(calls.some(sql=>sql.includes('FOR UPDATE')));
    assert.ok(calls.some(sql=>sql.includes('pg_advisory_xact_lock')));
    store.close();
  } finally {
    if(previousKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = previousKey;
  }
});
