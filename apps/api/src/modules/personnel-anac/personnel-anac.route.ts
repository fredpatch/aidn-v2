import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as personnelAnacController from './personnel-anac.controller.js';

const router = Router();

router.use(authenticate, requireRole('SU'));

router.get('/', personnelAnacController.list);
router.get('/search', personnelAnacController.search);
router.get('/matricule/:employeeCode', personnelAnacController.getByEmployeeCode);

export default router;

