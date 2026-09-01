import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // server/db/connection.js opens its default connection eagerly at
    // module-load time (before any test gets a chance to call __setTestDb).
    // Setting DB_PATH here keeps that eager connection in-memory too, so
    // no test run ever touches the real data/jobcard.db file.
    env: {
      DB_PATH: ':memory:',
    },
  },
});
