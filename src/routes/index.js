import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import accountRoutes from './account.routes.js';
import transferRoutes from './transfer.routes.js';

const router = Router();

router.get(
  '/health',
  asyncHandler(async (req, res) => {
    await query('SELECT 1');
    res.json({ data: { status: 'ok' } });
  }),
);

router.use('/accounts', accountRoutes);
router.use('/transfers', transferRoutes);

export default router;
