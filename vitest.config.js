import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '.claude/worktrees/**'],
    // server/db/connection.js opens its default connection eagerly at
    // module-load time (before any test gets a chance to call __setTestDb).
    // Setting DB_PATH here keeps that eager connection in-memory too, so
    // no test run ever touches the real data/jobcard.db file. Same reasoning
    // for UPLOAD_DIR: server/services/attachment.service.js mkdirSync's it
    // at module load, so tests/api/attachments.test.js must never touch the
    // real data/uploads directory either.
    env: {
      DB_PATH: ':memory:',
      UPLOAD_DIR: './data/test-uploads',
      // Small on purpose so tests/api/attachments.test.js's oversized-file
      // case can trigger 413 with a cheap ~2MB buffer instead of a real 10MB+ one.
      MAX_UPLOAD_MB: '1',
    },
  },
});
