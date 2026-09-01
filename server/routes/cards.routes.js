// server/routes/cards.routes.js (docs/04-api.md §4) — thin: parse, call
// service, send response. No SQL / business logic here.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  createCardSchema,
  updateCardSchema,
  moveCardSchema,
  addAssigneeSchema,
  listCardsQuerySchema,
} from '../schemas/card.schema.js';
import { idParamSchema, cardMemberParamsSchema, actorQuerySchema } from '../schemas/common.schema.js';
import * as svc from '../services/card.service.js';

const r = Router();

r.get('/', validate(listCardsQuerySchema, 'query'), (req, res) => {
  res.json({ items: svc.listCards(req.query) });
});

r.get('/:id', validate(idParamSchema, 'params'), (req, res) => {
  res.json(svc.getCardById(req.params.id));
});

r.post('/', validate(createCardSchema), (req, res) => {
  res.status(201).json(svc.createCard(req.body));
});

r.patch('/:id', validate(idParamSchema, 'params'), validate(updateCardSchema), (req, res) => {
  const { actorName, ...fields } = req.body;
  res.json(svc.updateCard(req.params.id, fields, actorName));
});

r.patch('/:id/move', validate(idParamSchema, 'params'), validate(moveCardSchema), (req, res) => {
  const { actorName, ...move } = req.body;
  res.json(svc.moveCard(req.params.id, move, actorName));
});

r.delete('/:id', validate(idParamSchema, 'params'), validate(actorQuerySchema, 'query'), (req, res) => {
  svc.deleteCard(req.params.id, req.query.actorName);
  res.status(204).end();
});

r.post('/:id/assignees', validate(idParamSchema, 'params'), validate(addAssigneeSchema), (req, res) => {
  const { memberName, actorName } = req.body;
  const assignees = svc.addAssignee(req.params.id, memberName, actorName);
  res.status(201).json({ assignees });
});

r.delete(
  '/:id/assignees/:memberId',
  validate(cardMemberParamsSchema, 'params'),
  validate(actorQuerySchema, 'query'),
  (req, res) => {
    const assignees = svc.removeAssignee(req.params.id, req.params.memberId, req.query.actorName);
    res.json({ assignees });
  },
);

export default r;
