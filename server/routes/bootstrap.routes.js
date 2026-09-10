// server/routes/bootstrap.routes.js (docs/04-api.md §2) — request/response only.
import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getBootstrap } from '../services/bootstrap.service.js';

const r = Router();

r.get('/', asyncHandler(async (req, res) => {
  res.json(await getBootstrap());
}));

export default r;
