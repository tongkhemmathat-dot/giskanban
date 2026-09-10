// server/routes/labels.routes.js (docs/04-api.md) — thin: parse, call
// service, send response. No SQL / business logic here.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { createLabelSchema, updateLabelSchema } from '../schemas/label.schema.js';
import { idParamSchema } from '../schemas/common.schema.js';
import * as svc from '../services/label.service.js';

const r = Router();

r.get('/', asyncHandler(async (req, res) => {
  res.json({ items: await svc.listLabels() });
}));

r.post('/', validate(createLabelSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createLabel(req.body));
}));

r.patch('/:id', validate(idParamSchema, 'params'), validate(updateLabelSchema), asyncHandler(async (req, res) => {
  res.json(await svc.updateLabel(req.params.id, req.body));
}));

r.delete('/:id', validate(idParamSchema, 'params'), asyncHandler(async (req, res) => {
  await svc.deleteLabel(req.params.id);
  res.status(204).end();
}));

export default r;
