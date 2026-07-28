import { Request, Response } from 'express';
import { handlePersonnelAnacError } from '../../shared/utils/error.js';
import * as personnelAnacService from './personnel-anac.service.js';

export async function search(req: Request, res: Response): Promise<void> {
  try {
    const q = (req.query.q as string) ?? '';
    const result = await personnelAnacService.search(q);
    res.json({ data: result });
  } catch (error) {
    handlePersonnelAnacError(res, error);
  }
}

export async function getByEmployeeCode(req: Request, res: Response): Promise<void> {
  try {
    const employeeCode = String(req.params.employeeCode);
    const result = await personnelAnacService.getByEmployeeCode(employeeCode);
    res.json(result);
  } catch (error) {
    handlePersonnelAnacError(res, error);
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const sortBy = req.query.sortBy === 'id' ? 'id' : 'lastName';
    const order = req.query.order === 'desc' ? 'desc' : 'asc';

    const result = await personnelAnacService.list(page, limit, sortBy, order);
    res.json(result);
  } catch (error) {
    handlePersonnelAnacError(res, error);
  }
}
