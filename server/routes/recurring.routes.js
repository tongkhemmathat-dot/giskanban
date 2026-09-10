// server/routes/recurring.routes.js (docs/04-api.md §7) — thin: parse, call
// service, send response. No SQL / business logic here.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { createRecurringSchema, updateRecurringSchema } from '../schemas/recurring.schema.js';
import { idParamSchema } from '../schemas/common.schema.js';
import * as svc from '../services/recurring.service.js';

const r = Router();

r.get('/', asyncHandler(async (req, res) => {
  res.json({ items: await svc.listRecurring() });
}));

r.post('/', validate(createRecurringSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createRecurring(req.body));
}));

r.patch('/:id', validate(idParamSchema, 'params'), validate(updateRecurringSchema), asyncHandler(async (req, res) => {
  res.json(await svc.updateRecurring(req.params.id, req.body));
}));

r.delete('/:id', validate(idParamSchema, 'params'), asyncHandler(async (req, res) => {
  await svc.deleteRecurring(req.params.id);
  res.status(204).end();
}));

r.post('/:id/run-now', validate(idParamSchema, 'params'), asyncHandler(async (req, res) => {
  res.status(201).json(await svc.runRecurringNow(req.params.id));
}));

export default r;
