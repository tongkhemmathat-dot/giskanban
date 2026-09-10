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

export default r;
