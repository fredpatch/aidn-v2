import { Request, Response } from 'express';
import * as phasesService from './phases.service.js';
import { handlePhasesError } from '../../shared/utils/error.js';

export async function startPreliminaryPhase(req: Request, res: Response): Promise<void> {
  try {
    const phase = await phasesService.openPreliminaryPhase(
      Number(req.params.requestId),
      req.user!.userId
    );
    res.status(201).json(phase);
  } catch (error) {
    handlePhasesError(res, error);
  }
}

export async function get(req: Request, res: Response): Promise<void> {
  try {
    const phase = await phasesService.getPhase(Number(req.params.id));
    res.json(phase);
  } catch (error) {
    handlePhasesError(res, error);
  }
}

export async function getForRequest(req: Request, res: Response): Promise<void> {
  try {
    const code = req.query.phaseCode as 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | undefined;
    if (!code) {
      res.status(400).json({ message: 'phaseCode requis en query string.' });
      return;
    }
    const phase = await phasesService.getPhaseByRequestAndCode(Number(req.params.requestId), code);
    if (!phase) {
      res.status(404).json({ message: 'Phase introuvable pour cette demande.' });
      return;
    }
    res.json(phase);
  } catch (error) {
    handlePhasesError(res, error);
  }
}

export async function close(req: Request, res: Response): Promise<void> {
  try {
    const { closureDocumentUrl, closureDocumentMimeType, closureNote } = req.body ?? {};
    const phase = await phasesService.closePhase(Number(req.params.id), req.user!.userId, {
      closureDocumentUrl,
      closureDocumentMimeType,
      closureNote,
    });
    res.json(phase);
  } catch (error) {
    handlePhasesError(res, error);
  }
}
