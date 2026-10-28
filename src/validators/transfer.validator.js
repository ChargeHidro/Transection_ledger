import { z } from 'zod';
import {
  amountSchema,
  bodyObjectError,
  descriptionSchema,
  referenceIdSchema,
  uuidField,
} from './common.js';

export const createTransferSchema = {
  body: z
    .strictObject(
      {
        from_account_id: uuidField('from_account_id'),
        to_account_id: uuidField('to_account_id'),
        amount: amountSchema,
        reference_id: referenceIdSchema,
        description: descriptionSchema,
      },
      { error: bodyObjectError },
    )
    .refine((body) => body.from_account_id.toLowerCase() !== body.to_account_id.toLowerCase(), {
      error: 'to_account_id must be different from from_account_id',
      path: ['to_account_id'],
    }),
};
