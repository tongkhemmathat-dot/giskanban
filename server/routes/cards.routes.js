// server/routes/cards.routes.js (docs/04-api.md §4) — thin: parse, call
// service, send response. No SQL / business logic here.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  createCardSchema,
  updateCardSchema,
  moveCardSchema,
  addAssigneeSchema,
  listCardsQuerySchema,
} from '../schemas/card.schema.js';
import { attachLabelSchema } from '../schemas/label.schema.js';
import { idParamSchema, cardMemberParamsSchema, cardLabelParamsSchema, actorQuerySchema } from '../schemas/common.schema.js';
import * as svc from '../services/card.service.js';
import * as labelSvc from '../services/label.service.js';

const r = Router();

r.get('/', validate(listCardsQuerySchema, 'query'), asyncHandler(async (req, res) => {
  res.json({ items: await svc.listCards(req.query) });
}));

// Registered before GET /:id so "export" can never be mistaken for an id.
r.get('/export', validate(listCardsQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const csv = await svc.exportCardsCsv(req.query);
  const date = new Date().toISOString().slice(0, 10);
  res.attachment(`jobcard-export-${date}.csv`);
  res.type('text/csv; charset=utf-8').send(csv);
}));

r.get('/:id', validate(idParamSchema, 'params'), asyncHandler(async (req, res) => {
  res.json(await svc.getCardById(req.params.id));
}));

r.post('/', validate(createCardSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createCard(req.body));
}));

r.patch('/:id', validate(idParamSchema, 'params'), validate(updateCardSchema), asyncHandler(async (req, res) => {
  const { actorName, ...fields } = req.body;
  res.json(await svc.updateCard(req.params.id, fields, actorName));
}));

r.patch('/:id/move', validate(idParamSchema, 'params'), validate(moveCardSchema), asyncHandler(async (req, res) => {
  const { actorName, ...move } = req.body;
  res.json(await svc.moveCard(req.params.id, move, actorName));
}));

r.delete('/:id', validate(idParamSchema, 'params'), validate(actorQuerySchema, 'query'), asyncHandler(async (req, res) => {
  await svc.deleteCard(req.params.id, req.query.actorName);
  res.status(204).end();
}));

r.post('/:id/assignees', validate(idParamSchema, 'params'), validate(addAssigneeSchema), asyncHandler(async (req, res) => {
  const { memberName, actorName } = req.body;
  const assignees = await svc.addAssignee(req.params.id, memberName, actorName);
  res.status(201).json({ assignees });
}));

r.delete(
  '/:id/assignees/:memberId',
  validate(cardMemberParamsSchema, 'params'),
  validate(actorQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const assignees = await svc.removeAssignee(req.params.id, req.params.memberId, req.query.actorName);
    res.json({ assignees });
  }),
);

r.post('/:id/labels', validate(idParamSchema, 'params'), validate(attachLabelSchema), asyncHandler(async (req, res) => {
  const labels = await labelSvc.attachLabel(req.params.id, req.body.labelId);
  res.status(201).json({ labels });
}));

r.delete('/:id/labels/:labelId', validate(cardLabelParamsSchema, 'params'), asyncHandler(async (req, res) => {
  const labels = await labelSvc.detachLabel(req.params.id, req.params.labelId);
  res.json({ labels });
}));

export default r;
