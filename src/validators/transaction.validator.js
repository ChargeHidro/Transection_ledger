import { z } from 'zod';
import config from '../config/index.js';
import {
  amountSchema,
  bodyObjectError,
  descriptionSchema,
  referenceIdSchema,
  transactionTypeSchema,
} from './common.js';

const { defaultPage, defaultLimit, maxLimit } = config.pagination;

export const createTransactionSchema = {
  body: z.strictObject(
    {
      type: transactionTypeSchema,
      amount: amountSchema,
      description: descriptionSchema,
      reference_id: referenceIdSchema,
    },
    { error: bodyObjectError },
  ),
};

// Query values arrive as strings, so page and limit are coerced to numbers.
export const listTransactionsSchema = {
  query: z.object({
    type: transactionTypeSchema.optional(),
    page: z.coerce
      .number({ error: 'page must be a number' })
      .int({ error: 'page must be an integer' })
      .min(1, { error: 'page must be at least 1' })
      .default(defaultPage),
    limit: z.coerce
      .number({ error: 'limit must be a number' })
      .int({ error: 'limit must be an integer' })
      .min(1, { error: 'limit must be at least 1' })
      .max(maxLimit, { error: `limit must be at most ${maxLimit}` })
      .default(defaultLimit),
  }),
};
