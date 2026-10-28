import { Router } from 'express';
import { createTransfer } from '../controllers/transfer.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireJson } from '../middleware/requireJson.js';
import { validate } from '../middleware/validate.js';
import { createTransferSchema } from '../validators/transfer.validator.js';

const router = Router();

router.post('/', requireJson, validate(createTransferSchema), asyncHandler(createTransfer));

export default router;
