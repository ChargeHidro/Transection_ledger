import { z } from 'zod';
import { bodyObjectError, requiredString } from './common.js';

// Strict: unknown fields such as `balance` are rejected, so a client can
// never set the initial balance.
export const createAccountSchema = {
  body: z.strictObject({ name: requiredString('name', 255) }, { error: bodyObjectError }),
};
