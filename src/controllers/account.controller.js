import * as accountService from '../services/account.service.js';

export async function createAccount(req, res) {
  const account = await accountService.createAccount(req.validated.body);
  res.status(201).json({ data: account });
}

export async function getBalance(req, res) {
  const balance = await accountService.getBalance(req.params.accountId);
  res.json({ data: balance });
}
