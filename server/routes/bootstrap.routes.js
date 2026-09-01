// server/routes/bootstrap.routes.js (docs/04-api.md §2) — request/response only.
import { Router } from 'express';
import { getBootstrap } from '../services/bootstrap.service.js';

const r = Router();

r.get('/', (req, res) => {
  res.json(getBootstrap());
});

export default r;
