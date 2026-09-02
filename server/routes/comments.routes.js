// server/routes/comments.routes.js (docs/04-api.md §7) — thin: parse, call
// service, send response. No SQL / business logic here. Mounted at '/api'
// since its endpoints span two prefixes ('/cards/:id/comments' and
// '/comments/:cid'), same as subtasks.routes.js.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { createCommentSchema } from '../schemas/comment.schema.js';
import { idParamSchema, cidParamSchema } from '../schemas/common.schema.js';
import * as svc from '../services/comment.service.js';

const r = Router();

r.post('/cards/:id/comments', validate(idParamSchema, 'params'), validate(createCommentSchema), (req, res) => {
  const { authorName, body } = req.body;
  res.status(201).json(svc.createComment(req.params.id, authorName, body));
});

r.delete('/comments/:cid', validate(cidParamSchema, 'params'), (req, res) => {
  svc.deleteComment(req.params.cid);
  res.status(204).end();
});

export default r;
