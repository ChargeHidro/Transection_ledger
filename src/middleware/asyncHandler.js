/**
 * Express 4 doesn't catch rejected promises from route handlers. This forwards
 * them to the error-handling middleware.
 */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
