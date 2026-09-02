// server/routes/timelogs.routes.js (docs/04-api.md §7) — thin: parse, call
// service, send response. No SQL / business logic here. Mounted at '/api'
// since its endpoints span two prefixes ('/cards/:id/time-logs' and
// '/time-logs/:tid'), same as subtasks.routes.js.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { createTimeLogSchema } from '../schemas/timelog.schema.js';
import { idParamSchema, tidParamSchema } from '../schemas/common.schema.js';
import * as svc from '../services/timelog.service.js';

const r = Router();

r.post('/cards/:id/time-logs', validate(idParamSchema, 'params'), validate(createTimeLogSchema), (req, res) => {
  res.status(201).json(svc.createTimeLog(req.params.id, req.body));
});

r.delete('/time-logs/:tid', validate(tidParamSchema, 'params'), (req, res) => {
  svc.deleteTimeLog(req.params.tid);
  res.status(204).end();
});

export default r;
