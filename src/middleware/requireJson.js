import { UnsupportedMediaTypeError } from '../errors/index.js';

/** Rejects request bodies that aren't sent as application/json. */
export function requireJson(req, res, next) {
  if (req.is('application/json')) return next();
  next(new UnsupportedMediaTypeError());
}
