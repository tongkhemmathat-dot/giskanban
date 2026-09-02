// server/routes/reports.routes.js (docs/04-api.md §9) — thin: parse, call
// service, send response. No SQL / business logic here.
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { throughputQuerySchema } from '../schemas/report.schema.js';
import * as svc from '../services/report.service.js';

const r = Router();

r.get('/summary', (req, res) => {
  res.json(svc.getSummary());
});

r.get('/workload', (req, res) => {
  res.json(svc.getWorkload());
});

r.get('/overdue', (req, res) => {
  res.json(svc.getOverdueCards());
});

r.get('/throughput', validate(throughputQuerySchema, 'query'), (req, res) => {
  res.json(svc.getThroughput(req.query.weeks));
});

r.get('/by-creator', (req, res) => {
  res.json(svc.getByCreator());
});

export default r;
