import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { requireActiveStore } from '../../middlewares/storeScope.middleware';
import { cacheCatalogResponse } from '../../middlewares/catalogCache.middleware';
import { ProductsController } from './products.controller';

const router = Router();

router.use(authenticateToken);

const productReadRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'INVENTORY_STAFF', 'admin', 'manager', 'store_manager', 'inventory_staff'];
const catalogReadRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'INVENTORY_STAFF', 'CASHIER', 'admin', 'manager', 'store_manager', 'inventory_staff', 'cashier'];
const productWriteRoles = ['ADMIN', 'STORE_MANAGER', 'INVENTORY_STAFF', 'admin', 'store_manager', 'inventory_staff'];
const variantPriceRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'admin', 'manager', 'store_manager'];

/**
 * UC-M1: Product list
 * GET /api/v1/products?take=50&skip=0&q=milk
 */
router.get('/', authorizeRoles(productReadRoles), ProductsController.listProducts);

/**
 * UC-M1: Store catalog view (variants + product + store inventory)
 * GET /api/v1/products/catalog?q=milk&barcode=...&take=50&skip=0
 */
router.get('/catalog', requireActiveStore, authorizeRoles(catalogReadRoles), cacheCatalogResponse(), ProductsController.getCatalog);

/**
 * UC-M3: Variant price history for active store
 * GET /api/v1/products/variant-prices?variantId=123&take=50&skip=0
 */
router.get('/variant-prices', requireActiveStore, authorizeRoles(variantPriceRoles), ProductsController.getVariantPrices);

/**
 * UC-M3: Set new effective price for a variant in active store
 * POST /api/v1/products/variant-prices
 * Body: { variantId: number, price: number, startAt?: ISOString }
 */
router.post('/variant-prices', requireActiveStore, authorizeRoles(variantPriceRoles), ProductsController.setVariantPrice);

/**
 * UC-M3: Close the current effective price window
 * POST /api/v1/products/variant-prices/close
 * Body: { variantId: number, endAt?: ISOString }
 */
router.post('/variant-prices/close', requireActiveStore, authorizeRoles(variantPriceRoles), ProductsController.closeVariantPrice);

/**
 * UC-M1: Product details (includes variants)
 * GET /api/v1/products/:id
 */
router.get('/:id', authorizeRoles(productReadRoles), ProductsController.getProductById);

/**
 * UC-M1: Create product (optionally with variants)
 * POST /api/v1/products
 */
router.post('/', authorizeRoles(productWriteRoles), ProductsController.createProduct);

/**
 * UC-M1: Update product
 * PUT /api/v1/products/:id
 */
router.put('/:id', authorizeRoles(productWriteRoles), ProductsController.updateProduct);

/**
 * UC-M1: Create variant under a product
 * POST /api/v1/products/:id/variants
 */
router.post('/:id/variants', authorizeRoles(productWriteRoles), ProductsController.createVariant);

/**
 * UC-M1: Update variant
 * PUT /api/v1/products/variants/:variantId
 */
router.put('/variants/:variantId', authorizeRoles(productWriteRoles), ProductsController.updateVariant);

export default router;
