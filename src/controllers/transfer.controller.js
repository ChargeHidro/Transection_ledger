import * as transferService from '../services/transfer.service.js';

export async function createTransfer(req, res) {
  const result = await transferService.createTransfer(req.validated.body);
  res.status(201).json({ data: result });
}
