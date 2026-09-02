// server/routes/templates.routes.js (docs/04-api.md §6) — thin: parse, call
// service, send response. No SQL / business logic here.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { createTemplateSchema, updateTemplateSchema } from '../schemas/template.schema.js';
import { idParamSchema } from '../schemas/common.schema.js';
import * as svc from '../services/template.service.js';

const r = Router();

r.get('/', (req, res) => {
  res.json({ items: svc.listTemplates() });
});

r.post('/', validate(createTemplateSchema), (req, res) => {
  res.status(201).json(svc.createTemplate(req.body));
});

r.patch('/:id', validate(idParamSchema, 'params'), validate(updateTemplateSchema), (req, res) => {
  res.json(svc.updateTemplate(req.params.id, req.body));
});

r.delete('/:id', validate(idParamSchema, 'params'), (req, res) => {
  svc.deleteTemplate(req.params.id);
  res.status(204).end();
});

export default r;
