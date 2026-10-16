import { api } from '../axios';
import type { FinanceQueueResponse } from './payments.types';

export async function fetchFinanceQueue(): Promise<FinanceQueueResponse> {
  const { data } = await api.get('/payments/finance-queue');
  return data;
}
