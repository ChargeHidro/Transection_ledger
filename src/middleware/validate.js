import { InvalidAccountIdError, ValidationError } from '../errors/index.js';
import { accountIdSchema } from '../validators/common.js';

const SOURCES = ['params', 'query', 'body'];

/** Turns Zod issues into `{ field, message }` pairs for the error response. */
function formatIssues(issues, source) {
  return issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        field: [...issue.path, key].join('.'),
        message: `Unknown field '${key}' is not allowed`,
      }));
    }
    return [{ field: issue.path.length ? issue.path.join('.') : source, message: issue.message }];
  });
}

/**
 * Validates request parts against Zod schemas, e.g. `validate({ body, query })`.
 * Parsed (trimmed, coerced, defaulted) values are placed on `req.validated`.
 * Issues from every part are collected into a single 400 response.
 */
export const validate = (schemas) => (req, res, next) => {
  const validated = {};
  const issues = [];

  for (const source of SOURCES) {
    const schema = schemas[source];
    if (!schema) continue;

    const result = schema.safeParse(req[source]);
    if (result.success) {
      validated[source] = result.data;
    } else {
      issues.push(...formatIssues(result.error.issues, source));
    }
  }

  if (issues.length > 0) return next(new ValidationError(issues));

  req.validated = validated;
  next();
};

/** `router.param` handler: rejects malformed account IDs before any route runs. */
export function validateAccountId(req, res, next, accountId) {
  if (!accountIdSchema.safeParse(accountId).success) {
    return next(new InvalidAccountIdError(accountId));
  }
  next();
}
