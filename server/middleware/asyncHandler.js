// Express 4 doesn't catch a rejected Promise thrown by an async route
// handler — an unhandled rejection just hangs the request instead of
// reaching middleware/error.js. Every route handler in server/routes/ now
// awaits an async service call, so every one of them is wrapped in this
// (`r.get('/', asyncHandler(async (req, res) => {...}))`) to forward
// rejections to next() instead.
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
