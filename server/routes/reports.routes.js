// server/routes/reports.routes.js (docs/04-api.md §9) — thin: parse, call
// service, send response. No SQL / business logic here.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { throughputQuerySchema } from '../schemas/report.schema.js';
import * as svc from '../services/report.service.js';

const r = Router();

r.get('/summary', asyncHandler(async (req, res) => {
  res.json(await svc.getSummary());
}));

r.get('/workload', asyncHandler(async (req, res) => {
  res.json(await svc.getWorkload());
}));

r.get('/overdue', asyncHandler(async (req, res) => {
  res.json(await svc.getOverdueCards());
}));

r.get('/throughput', validate(throughputQuerySchema, 'query'), asyncHandler(async (req, res) => {
  res.json(await svc.getThroughput(req.query.weeks));
}));

r.get('/by-creator', asyncHandler(async (req, res) => {
  res.json(await svc.getByCreator());
}));

export default r;
