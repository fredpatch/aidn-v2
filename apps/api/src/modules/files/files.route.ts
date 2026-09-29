import { Router } from 'express';
import * as filesController from './files.controller.js';

// STORAGE-0A - the only way to read a stored file. Authentication is done
// inside the controller (file-specific actor resolution, grant-only content).
const router = Router();

router.get('/:id', filesController.get);
router.post('/:id/access', filesController.access);
router.get('/:id/content', filesController.content);

export default router;
