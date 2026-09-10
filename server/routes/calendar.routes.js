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

r.delete('/connections/:memberId', validate(memberIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  await svc.disconnectMember(req.params.memberId);
  res.status(204).end();
}));

r.get('/events', validate(eventsRangeQuerySchema, 'query'), asyncHandler(async (req, res) => {
  res.json({ items: await svc.getMergedEvents(req.query.start, req.query.end) });
}));

export default r;
