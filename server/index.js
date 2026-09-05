// server/index.js — express app setup (docs/02-architecture.md §3).
// Exports the app (unstarted) so tests/api/*.test.js can drive it with
// supertest; only starts listening when this file is run directly
// (`npm run dev` / `node server/index.js`), never on import.
import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import db from './db/connection.js';
import { AppError } from './utils/AppError.js';
import { errorHandler } from './middleware/error.js';
import bootstrapRouter from './routes/bootstrap.routes.js';
import membersRouter from './routes/members.routes.js';
import cardsRouter from './routes/cards.routes.js';
import subtasksRouter from './routes/subtasks.routes.js';
import templatesRouter from './routes/templates.routes.js';
import commentsRouter from './routes/comments.routes.js';
import attachmentsRouter from './routes/attachments.routes.js';
import timelogsRouter from './routes/timelogs.routes.js';
import labelsRouter from './routes/labels.routes.js';
import reportsRouter from './routes/reports.routes.js';
import recurringRouter from './routes/recurring.routes.js';
import { sendSlaDigest } from './services/notify.service.js';
import { runDueRecurring } from './services/recurring.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const START_TIME = Date.now();
const VERSION = '1.0.0';

export const app = express();

app.use(express.json());

app.get('/api/health', (req, res) => {
  let dbConnected = true;
  try {
    db.prepare('SELECT 1').get();
  } catch {
    dbConnected = false;
  }
  // 503 (not 200) when the DB is unreachable — docker-compose.yml's
  // healthcheck runs `wget -qO- .../api/health`, and wget treats any non-2xx
  // response as a failed check, which is what actually lets Docker detect and
  // report an unhealthy container (docs/07-roadmap.md 6.5). A 200 here no
  // matter what would make that healthcheck always pass.
  res.status(dbConnected ? 200 : 503).json({
    ok: dbConnected,
    db: dbConnected ? 'connected' : 'error',
    version: VERSION,
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
  });
});

// Mount one router per resource. Later agents (subtasks/templates/comments/
// attachments/time-logs/labels/reports) only need to add one more
// `app.use('/api/...', someRouter)` line here — nothing else to restructure.
app.use('/api/bootstrap', bootstrapRouter);
app.use('/api/members', membersRouter);
app.use('/api/cards', cardsRouter);
app.use('/api', subtasksRouter); // spans /api/cards/:id/subtasks... and /api/subtasks/:sid...
app.use('/api/templates', templatesRouter);
app.use('/api', commentsRouter); // spans /api/cards/:id/comments and /api/comments/:cid
app.use('/api', attachmentsRouter); // spans /api/cards/:id/attachments and /api/attachments/:aid...
app.use('/api', timelogsRouter); // spans /api/cards/:id/time-logs and /api/time-logs/:tid
app.use('/api/labels', labelsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/recurring-cards', recurringRouter);

app.use(express.static(PUBLIC_DIR));

app.use((req, res, next) => {
  next(new AppError('NOT_FOUND', 'ไม่พบ endpoint นี้', 404));
});

// Must be the last middleware registered (docs/10-conventions.md §4).
app.use(errorHandler);

// Run directly via `npm run dev` / `node server/index.js` — importing this
// module (e.g. from tests) never starts a listener.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.warn(`JobCard Pro API listening on :${port}`);
  });

  // SLA-risk email digest (backlog: replaces the discontinued LINE Notify).
  // Off by default (NOTIFY_ENABLED) since it needs real SMTP creds — checks
  // once/minute and fires at most once per calendar day at NOTIFY_HOUR. Only
  // meaningful under a persistent process (Docker), not the stateless Vercel
  // demo deploy, which is why this lives here and not in a serverless route.
  if (process.env.NOTIFY_ENABLED === 'true') {
    const notifyHour = Number(process.env.NOTIFY_HOUR ?? 8);
    let lastSentDate = null;
    setInterval(() => {
      const now = new Date();
      const today = now.toDateString();
      if (now.getHours() !== notifyHour || lastSentDate === today) return;
      lastSentDate = today;
      sendSlaDigest()
        .then(({ sentCount }) => console.warn(`SLA digest sent (${sentCount} รายการ)`))
        .catch((err) => console.error('ส่ง SLA digest ไม่สำเร็จ:', err));
    }, 60_000);
  }

  // ใบงานประจำ (recurring cards for PM work, docs/07-roadmap.md backlog).
  // Always on (unlike the opt-in email digest above, which needs real SMTP
  // creds) — checks every 5 minutes for any active rule whose next_run_at
  // has passed and creates that card via recurring.service.js's
  // runDueRecurring(). Same "only meaningful under a persistent process"
  // caveat: no-op under a stateless serverless deploy.
  setInterval(() => {
    try {
      const created = runDueRecurring();
      if (created.length) console.warn(`สร้างใบงานประจำอัตโนมัติ ${created.length} ใบ`);
    } catch (err) {
      console.error('สร้างใบงานประจำไม่สำเร็จ:', err);
    }
  }, 5 * 60_000);
}

export default app;
