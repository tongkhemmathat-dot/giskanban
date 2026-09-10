// server/routes/subtasks.routes.js (docs/02-architecture.md §3, docs/04-api.md
// §5) — thin: parse, call service, send response. No SQL / business logic
// here. Mounted at '/api' in server/index.js since its endpoints span two
// path prefixes ('/cards/:id/subtasks...' and '/subtasks/:sid...').
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  bulkCreateSubtasksSchema,
  updateSubtaskSchema,
  toggleSubtaskSchema,
  reorderSubtasksSchema,
  applyTemplateSchema,
} from '../schemas/subtask.schema.js';
import { idParamSchema, sidParamSchema } from '../schemas/common.schema.js';
import * as svc from '../services/subtask.service.js';

const r = Router();

r.post('/cards/:id/subtasks', validate(idParamSchema, 'params'), validate(bulkCreateSubtasksSchema), asyncHandler(async (req, res) => {
  const { titles, actorName } = req.body;
  res.status(201).json(await svc.createSubtasks(req.params.id, titles, actorName));
}));

r.patch('/subtasks/:sid', validate(sidParamSchema, 'params'), validate(updateSubtaskSchema), asyncHandler(async (req, res) => {
  res.json(await svc.updateSubtask(req.params.sid, req.body));
}));

r.patch('/subtasks/:sid/toggle', validate(sidParamSchema, 'params'), validate(toggleSubtaskSchema), asyncHandler(async (req, res) => {
  res.json(await svc.toggleSubtask(req.params.sid, req.body.actorName));
}));

r.delete('/subtasks/:sid', validate(sidParamSchema, 'params'), asyncHandler(async (req, res) => {
  res.json(await svc.deleteSubtask(req.params.sid));
}));

r.patch(
  '/cards/:id/subtasks/reorder',
  validate(idParamSchema, 'params'),
  validate(reorderSubtasksSchema),
  asyncHandler(async (req, res) => {
    res.json(await svc.reorderSubtasks(req.params.id, req.body.orderedIds));
  }),
);

r.post(
  '/cards/:id/subtasks/apply-template',
  validate(idParamSchema, 'params'),
  validate(applyTemplateSchema),
  asyncHandler(async (req, res) => {
    const { templateSlug, actorName } = req.body;
    res.status(201).json(await svc.applyTemplate(req.params.id, templateSlug, actorName));
  }),
);

export default r;
