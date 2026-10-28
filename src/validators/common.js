import { z } from 'zod';

export const MAX_AMOUNT = 1_000_000_000;
export const TRANSACTION_TYPES = ['credit', 'debit'];

const missingOr = (field, message) => (issue) =>
  issue.input === undefined ? `${field} is required` : message;

/** Error for when the body itself is not a JSON object (e.g. an array). */
export const bodyObjectError = (issue) =>
  issue.code === 'invalid_type' ? 'Request body must be a JSON object' : undefined;

export const uuidField = (field) => z.guid({ error: missingOr(field, `${field} must be a valid UUID`) });

export const accountIdSchema = z.guid();

export const requiredString = (field, maxLength) =>
  z
    .string({ error: missingOr(field, `${field} must be a string`) })
    .trim()
    .min(1, { error: `${field} must not be empty` })
    .max(maxLength, { error: `${field} must be at most ${maxLength} characters` });

// String(value) is exact for JSON numbers in range, unlike value * 100,
// which picks up floating-point noise.
const hasAtMostTwoDecimals = (value) => /^\d+(\.\d{1,2})?$/.test(String(value));

export const amountSchema = z
  .number({ error: missingOr('amount', 'amount must be a number') })
  .gt(0, { error: 'amount must be greater than 0' })
  .max(MAX_AMOUNT, { error: `amount must not exceed ${MAX_AMOUNT}` })
  .refine(hasAtMostTwoDecimals, { error: 'amount must have at most 2 decimal places' });

export const transactionTypeSchema = z.enum(TRANSACTION_TYPES, {
  error: missingOr('type', "type must be either 'credit' or 'debit'"),
});

export const referenceIdSchema = requiredString('reference_id', 255);

export const descriptionSchema = z
  .string({ error: 'description must be a string' })
  .trim()
  .max(500, { error: 'description must be at most 500 characters' })
  .nullish();
