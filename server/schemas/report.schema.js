// server/schemas/report.schema.js (docs/10-conventions.md §5, docs/04-api.md §9).
import { z } from 'zod';

export const throughputQuerySchema = z
  .object({
    weeks: z.coerce.number().int().positive().max(52).default(8),
  })
  .strip();
