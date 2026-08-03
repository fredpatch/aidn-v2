import { api } from '../axios';
import type { GenerateReportInput, GeneratedReport } from './reports.types';

export async function fetchGeneratedReports(): Promise<GeneratedReport[]> {
  const { data } = await api.get<GeneratedReport[]>('/reports');
  return data;
}

export async function generateReport(input: GenerateReportInput): Promise<GeneratedReport> {
  const { data } = await api.post<GeneratedReport>('/reports/generate', input);
  return data;
}
