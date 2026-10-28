import * as transactionService from '../services/transaction.service.js';

export async function createTransaction(req, res) {
  const result = await transactionService.createTransaction(
    req.params.accountId,
    req.validated.body,
  );
  res.status(201).json({ data: result });
}

export async function listTransactions(req, res) {
  const { transactions, pagination } = await transactionService.listTransactions(
    req.params.accountId,
    req.validated.query,
  );
  res.json({ data: transactions, pagination });
}
