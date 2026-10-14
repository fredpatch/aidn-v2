import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/guards/auth.middleware.js';
import * as controller from './dn-annotation.controller.js';

const router = Router();

// Least privilege: only Assistante DN (and SU as operational fallback). Réception /
// Assistant DG and the DN agents have no access to this physical circuit.
router.use(authenticate, requireRole('assistant_dn', 'SU'));

router.get('/', controller.list);
router.post('/:taskId/send-to-director', controller.sendToDirector);
router.post('/:taskId/return-annotated', controller.returnAnnotated);

export default router;
