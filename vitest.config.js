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
      // Fixed test-only values for the Outlook calendar sync feature
      // (server/services/calendar.service.js, tests/api/calendar.test.js) —
      // never real Azure AD credentials, just enough for hand-rolled OAuth
      // URL-building/token-request code to run against a mocked `fetch`.
      CALENDAR_ENCRYPTION_KEY: 'TWegV3PMoGm2alWn82BEU7Oa0795h+m5LOu6+wwAwyg=',
      CALENDAR_STATE_SECRET: 'test-state-secret',
      MS_TENANT_ID: 'test-tenant-id',
      MS_CLIENT_ID: 'test-client-id',
      MS_CLIENT_SECRET: 'test-client-secret',
      PUBLIC_BASE_URL: 'https://jobcard.test.local',
    },
  },
});
