// Central error handler (docs/10-conventions.md §4) — must be the last
// middleware registered in server/index.js. Every route/service throws
// AppError (or lets an unexpected error bubble up) and this is the only
// place that turns it into the standard response body.
export function errorHandler(err, req, res, _next) {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: {
      code: err.code ?? 'INTERNAL_ERROR',
      message: err.message ?? 'เกิดข้อผิดพลาดภายในระบบ',
      ...(err.details && { details: err.details }),
    },
  });
}
