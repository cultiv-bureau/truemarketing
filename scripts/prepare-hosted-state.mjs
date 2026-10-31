import { readFileSync, writeFileSync } from 'node:fs';
import { Store } from '../dist/packages/core/store.js';
import { AuthVault } from '../dist/packages/core/totp.js';
import { snapshot } from '../dist/packages/core/hosted-state.js';
const store = new Store('data/truemarketing.sqlite');
const companies = store.globalList('company');
if (companies.length !== 2 || companies.some(c=>!['Cultiv Bureau','Mazeed'].includes(c.name))) throw new Error('Review company list before migration');
const state = snapshot(store);
if(state.entities.some(r=>!['role','member','audit'].includes(r.kind))) throw new Error('Review operational records before migration');
state.sessions=[];
const vault = new AuthVault('data/auth-key.bin');
const env = {
  TOKEN_ENCRYPTION_KEY:readFileSync('data/auth-key.bin').toString('base64'),
  TM_BOOTSTRAP_STATE:vault.encrypt(JSON.stringify(state)),
};
writeFileSync('data/hosted-env.json',JSON.stringify(env),{mode:0o600});
store.close();
console.log(JSON.stringify({companies:companies.map(c=>c.name),entities:state.entities.length,bytes:env.TM_BOOTSTRAP_STATE.length}));
