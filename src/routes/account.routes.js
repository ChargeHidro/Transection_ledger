import { Router } from 'express';
import { createAccount, getBalance } from '../controllers/account.controller.js';
import { createTransaction, listTransactions } from '../controllers/transaction.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireJson } from '../middleware/requireJson.js';
import { validate, validateAccountId } from '../middleware/validate.js';
import { createAccountSchema } from '../validators/account.validator.js';
import {
  createTransactionSchema,
  listTransactionsSchema,
} from '../validators/transaction.validator.js';

const router = Router();

router.param('accountId', validateAccountId);

router.post('/', requireJson, validate(createAccountSchema), asyncHandler(createAccount));
router.get('/:accountId/balance', asyncHandler(getBalance));
router.post(
  '/:accountId/transactions',
  requireJson,
  validate(createTransactionSchema),
  asyncHandler(createTransaction),
);
router.get(
  '/:accountId/transactions',
  validate(listTransactionsSchema),
  asyncHandler(listTransactions),
);

export default router;
