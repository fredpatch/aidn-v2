import { Request, Response } from 'express';
import * as parametersService from './system-parameters.service.js';
import { handleSystemParametersError } from '../../shared/utils/error.js';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const module = req.query.module as string | undefined;
    const parameters = await parametersService.listParameters(module);
    res.json(parameters);
  } catch (error) {
    handleSystemParametersError(res, error);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { value } = req.body ?? {};
    if (value === undefined || value === null) {
      res.status(400).json({ message: 'value requis.' });
      return;
    }
    const parameter = await parametersService.updateParameter(
      req.params.key as string,
      String(value),
      req.user!.userId
    );
    res.json(parameter);
  } catch (error) {
    handleSystemParametersError(res, error);
  }
}
