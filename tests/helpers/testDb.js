// Shared API-test helper. See server/db/connection.js's __setTestDb comment
// for why this is needed: services all do `import db from '../db/connection.js'`
// once and hold that reference forever, so per-test isolation has to happen
// by swapping what the *shared* connection points at, not by re-importing.
//
// Usage (Agent 3 / Agent 6: follow this exact pattern in your own tests/api/*.test.js):
//
//   import app from '../../server/index.js';
//   import { useTestDb } from '../helpers/testDb.js';
//
//   describe('Something API', () => {
//     const getDb = useTestDb(); // fresh, seeded, isolated db before every test
//     it('...', async () => {
//       const res = await request(app).get('/api/...');
//       // getDb() also lets a test inspect rows directly when there's no
//       // read endpoint yet for something (e.g. subtasks after DELETE /cards/:id).
//     });
//   });
//
// Pass { seed: false } to start from an empty (but migrated) schema instead.
import { beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../setup.js';
import { __setTestDb } from '../../server/db/connection.js';

export function useTestDb({ seed = true } = {}) {
  let current;
  beforeEach(() => {
    current = createTestDb({ seed });
    __setTestDb(current);
  });
  afterEach(() => {
    current.close();
  });
  return () => current;
}
