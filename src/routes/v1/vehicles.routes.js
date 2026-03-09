// backend/src/routes/v1/vehicles.routes.js
import express from 'express';
import { verifyAuth } from '../../middlewares/verifyAuth.js';
import { listVehicles, createVehicle, deleteVehicle } from '../../controllers/vehicles.controller.js';

const router = express.Router();

router.get('/',    verifyAuth, listVehicles);
router.post('/',   verifyAuth, createVehicle);
router.delete('/:id', verifyAuth, deleteVehicle);

export default router;
