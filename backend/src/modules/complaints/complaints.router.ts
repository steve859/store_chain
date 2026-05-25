import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { requireActiveStoreUnlessAdmin } from '../../middlewares/storeScope.middleware';
import { ComplaintsController } from './complaints.controller';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveStoreUnlessAdmin);

const complaintListRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'admin', 'district_manager', 'manager', 'store_manager'];
const complaintSubmitRoles = ['ADMIN', 'STORE_MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'admin', 'manager', 'store_manager', 'cashier', 'inventory_staff'];
const complaintDetailRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'admin', 'district_manager', 'manager', 'store_manager'];
const complaintStatusRoles = ['ADMIN', 'STORE_MANAGER', 'admin', 'manager', 'store_manager'];
const complaintDeleteRoles = ['ADMIN', 'admin'];

// GET /api/v1/complaints?take&skip&q&status&employeeName
router.get('/', authorizeRoles(complaintListRoles), ComplaintsController.listComplaints);

// GET /api/v1/complaints/my?employeeName=...
router.get('/my', authorizeRoles(complaintSubmitRoles), ComplaintsController.listMyComplaints);

// GET /api/v1/complaints/:id
router.get('/:id', authorizeRoles(complaintDetailRoles), ComplaintsController.getComplaint);

// POST /api/v1/complaints
router.post('/', authorizeRoles(complaintSubmitRoles), ComplaintsController.createComplaint);

// PATCH /api/v1/complaints/:id/status
router.patch('/:id/status', authorizeRoles(complaintStatusRoles), ComplaintsController.updateComplaintStatus);

// DELETE /api/v1/complaints/:id
router.delete('/:id', authorizeRoles(complaintDeleteRoles), ComplaintsController.deleteComplaint);

export default router;
