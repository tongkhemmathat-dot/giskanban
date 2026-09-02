// Central error handler (docs/10-conventions.md §4) — must be the last
// middleware registered in server/index.js. Every route/service throws
// AppError (or lets an unexpected error bubble up) and this is the only
// place that turns it into the standard response body.
export function errorHandler(err, req, res, _next) {
  // multer throws MulterError (not AppError) for an oversized upload — map it
  // to the documented 413 code (docs/04-api.md §1) before the generic fallback.
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'ไฟล์มีขนาดใหญ่เกินกำหนด' } });
    return;
  }

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
