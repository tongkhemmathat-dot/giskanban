// server/routes/members.routes.js (docs/04-api.md §3) — thin: parse, call
// service, send response. No SQL / business logic here.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { listMembersQuerySchema, upsertMemberSchema, updateMemberSchema } from '../schemas/member.schema.js';
import { idParamSchema } from '../schemas/common.schema.js';
import * as svc from '../services/member.service.js';

const r = Router();

r.get('/', validate(listMembersQuerySchema, 'query'), (req, res) => {
  res.json({ items: svc.listMembers(req.query) });
});

// upsert by name (docs/05-business-rules.md §3.2) — existing name -> 200 the
// existing row, brand-new name -> 201 the newly-created one.
r.post('/', validate(upsertMemberSchema), (req, res) => {
  const { member, created } = svc.upsertMember(req.body.name);
  res.status(created ? 201 : 200).json(member);
});

r.patch('/:id', validate(idParamSchema, 'params'), validate(updateMemberSchema), (req, res) => {
  res.json(svc.updateMember(req.params.id, req.body));
});

// Not explicitly listed in docs/04-api.md's Members table, but required for
// docs/05-business-rules.md §3.5 ("cannot delete a member who is still a
// card's creator -> 409 CONFLICT") and docs/08-testing.md's M3. See this
// agent's final summary for the doc update this implies.
r.delete('/:id', validate(idParamSchema, 'params'), (req, res) => {
  svc.deleteMember(req.params.id);
  res.status(204).end();
});

export default r;
