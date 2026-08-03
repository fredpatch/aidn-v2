import { Request, Response } from 'express';
import {
  generateReport,
  getReport,
  listReports,
  parseGenerateReportInput,
} from './reports.service.js';

export async function list(_req: Request, res: Response): Promise<void> {
  res.json(await listReports());
}

export async function generate(req: Request, res: Response): Promise<void> {
  try {
    const input = parseGenerateReportInput(req.body ?? {}, req.user!.userId);
    const report = await generateReport(input);
    res.status(201).json(report);
  } catch (error) {
    if (error instanceof Error && error.message === 'REPORT_KEY_INVALID') {
      res.status(400).json({ message: 'Type de rapport invalide.' });
      return;
    }
    if (error instanceof Error && error.message === 'REPORT_FORMAT_INVALID') {
      res.status(400).json({ message: 'Format de rapport invalide.' });
      return;
    }
    console.error('[reports/generate]', error);
    res.status(500).json({ message: 'Generation du rapport impossible.' });
  }
}

export async function download(req: Request, res: Response): Promise<void> {
  const reportId = Number(req.params.id);
  if (!Number.isInteger(reportId)) {
    res.status(400).json({ message: 'Identifiant de rapport invalide.' });
    return;
  }

  const report = await getReport(reportId);
  if (!report || !report.fileUrl) {
    res.status(404).json({ message: 'Rapport introuvable.' });
    return;
  }

  res.redirect(report.fileUrl);
}
