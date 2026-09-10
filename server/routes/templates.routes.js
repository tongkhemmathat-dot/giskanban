// server/routes/templates.routes.js (docs/04-api.md §6) — thin: parse, call
// service, send response. No SQL / business logic here.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { createTemplateSchema, updateTemplateSchema } from '../schemas/template.schema.js';
import { idParamSchema } from '../schemas/common.schema.js';
import * as svc from '../services/template.service.js';

const r = Router();

r.get('/', asyncHandler(async (req, res) => {
  res.json({ items: await svc.listTemplates() });
}));

r.post('/', validate(createTemplateSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createTemplate(req.body));
}));

r.patch('/:id', validate(idParamSchema, 'params'), validate(updateTemplateSchema), asyncHandler(async (req, res) => {
  res.json(await svc.updateTemplate(req.params.id, req.body));
}));

r.delete('/:id', validate(idParamSchema, 'params'), asyncHandler(async (req, res) => {
  await svc.deleteTemplate(req.params.id);
  res.status(204).end();
}));

export default r;
