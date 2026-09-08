// server/routes/calendar.routes.js (docs/04-api.md §12) — thin: parse, call
// service, send response. No SQL / business logic here.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { memberIdParamSchema, createConnectionSchema, eventsRangeQuerySchema } from '../schemas/calendar.schema.js';
import * as svc from '../services/calendar.service.js';

const r = Router();

// The only async route handler in this codebase — Express 4 doesn't
// auto-forward a rejected promise to error middleware (unlike sync throws,
// which it does catch automatically), so this needs an explicit try/catch
// unlike every other handler in *.routes.js.
r.post('/connections', validate(createConnectionSchema), async (req, res, next) => {
  try {
    const status = await svc.addConnection(req.body.memberId, req.body.icsUrl);
    res.status(201).json(status);
  } catch (err) {
    next(err);
  }
});

r.get('/connections', (req, res) => {
  res.json({ items: svc.listConnectionStatuses() });
});

r.delete('/connections/:memberId', validate(memberIdParamSchema, 'params'), (req, res) => {
  svc.disconnectMember(req.params.memberId);
  res.status(204).end();
});

r.get('/events', validate(eventsRangeQuerySchema, 'query'), (req, res) => {
  res.json({ items: svc.getMergedEvents(req.query.start, req.query.end) });
});

export default r;
