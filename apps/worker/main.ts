import { Store } from '../../packages/core/store.js';
import { tick } from '../../packages/core/runner.js';
import { resolve } from 'node:path';
if (process.env.NODE_ENV === 'production')
  throw new Error('Configure the PostgreSQL production adapter before deploying this worker.');
const store = new Store(process.env.DATABASE_FILE ?? resolve('data/truemarketing.sqlite'));
const timer = setInterval(() => {
  try {
    tick(store);
  } catch (e) {
    console.error(
      JSON.stringify({ level: 'error', message: e instanceof Error ? e.message : 'Worker failed' }),
    );
  }
}, 1000);
process.on('SIGTERM', () => {
  clearInterval(timer);
  store.close();
  process.exit(0);
});
process.on('SIGINT', () => {
  clearInterval(timer);
  store.close();
  process.exit(0);
});
console.log('TrueMarketing sample worker started.');
