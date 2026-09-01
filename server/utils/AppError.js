// Standard application error (docs/10-conventions.md §4).
// Thrown anywhere in services/middleware and caught by middleware/error.js,
// which turns it into the standard `{ error: { code, message, details? } }` body.
export class AppError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
