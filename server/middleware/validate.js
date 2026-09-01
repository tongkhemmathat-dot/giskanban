// zod-based request validation (docs/10-conventions.md §2/§5).
// validate(schema, source) parses req[source] and, on success, REPLACES
// req[source] with the parsed/coerced/defaulted value — so routes and
// services only ever see clean data (defaults applied, unknown keys
// stripped, query strings coerced to numbers, etc). On failure it hands a
// VALIDATION_ERROR AppError to next() so middleware/error.js can render it.
import { AppError } from '../utils/AppError.js';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      const message = result.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง';
      next(new AppError('VALIDATION_ERROR', message, 400, details));
      return;
    }
    req[source] = result.data;
    next();
  };
}
