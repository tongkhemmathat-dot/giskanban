// server/routes/calendar.routes.js (docs/04-api.md §12) — thin: parse, call
// service, send response. No SQL / business logic here.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { memberIdParamSchema, createConnectionSchema, eventsRangeQuerySchema } from '../schemas/calendar.schema.js';
import * as svc from '../services/calendar.service.js';

const r = Router();

r.post('/connections', validate(createConnectionSchema), asyncHandler(async (req, res) => {
  const status = await svc.addConnection(req.body.memberId, req.body.icsUrl);
  res.status(201).json(status);
}));

r.get('/connections', asyncHandler(async (req, res) => {
  res.json({ items: await svc.listConnectionStatuses() });
}));

// Manual "sync now" — CALENDAR_POLL_MINUTES's setInterval (server/index.js)
// can't run reliably on Vercel's serverless runtime (no persistent process
// to host the timer), so this gives the calendar page a way to force a
// re-sync of every active connection on demand instead of waiting on
// background polling that may never actually run there.
r.post('/sync', asyncHandler(async (req, res) => {
  res.json(await svc.pollAllConnections());
}));

r.delete('/connections/:memberId', validate(memberIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  await svc.disconnectMember(req.params.memberId);
  res.status(204).end();
}));

r.get('/events', validate(eventsRangeQuerySchema, 'query'), asyncHandler(async (req, res) => {
  res.json({ items: await svc.getMergedEvents(req.query.start, req.query.end) });
}));

// รายงานปฏิทินของแต่ละคนเป็น CSV (หัวหน้าทีมขอ — บางงานเป็นการประชุม ไม่ได้
// สร้างเป็นใบงานในระบบ จึงต้องดูจากปฏิทินโดยตรง). Registered after '/events'
// but no ordering conflict either way — there's no ':param' segment here for
// 'export' to be mistaken for, unlike cards.routes.js's '/cards/export'
// vs '/cards/:id'.
r.get('/events/export', validate(eventsRangeQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const csv = await svc.exportEventsCsv(req.query.start, req.query.end);
  res.attachment(`calendar-export-${req.query.start}_${req.query.end}.csv`);
  res.type('text/csv; charset=utf-8').send(csv);
}));

export default r;
