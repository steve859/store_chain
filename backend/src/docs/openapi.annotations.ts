/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     description: Simple liveness endpoint.
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */

/**
 * @openapi
 * /api/v1/sales:
 *   get:
 *     summary: List POS sales orders
 *     tags:
 *       - Sales
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search by id/store/user/payment method
 *       - in: query
 *         name: storeCode
 *         schema:
 *           type: string
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Sales list
 */

/**
 * @openapi
 * /api/v1/sales/{id}:
 *   get:
 *     summary: Get POS sale details
 *     tags:
 *       - Sales
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sale detail
 *       404:
 *         description: Not found
 */

/**
 * @openapi
 * /api/v1/sales/catalog:
 *   get:
 *     summary: POS catalog (SKUs + stock)
 *     tags:
 *       - Sales
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: barcode
 *         schema:
 *           type: string
 *       - in: query
 *         name: storeId
 *         schema:
 *           type: string
 *           description: Store UUID
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Catalog list
 */

/**
 * @openapi
 * /api/v1/sales/checkout:
 *   post:
 *     summary: POS checkout (create sale + line items)
 *     tags:
 *       - Sales
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             storeId: "1"
 *             cashierId: "1"
 *             paymentMethod: cash
 *             paidAmount: 100000
 *             totalAmount: 95000
 *             items:
 *               - skuId: "SKU-001"
 *                 quantity: 2
 *                 price: 35000
 *               - skuId: "SKU-002"
 *                 quantity: 1
 *                 price: 12000
 *           schema:
 *             type: object
 *             required:
 *               - paymentMethod
 *               - items
 *             properties:
 *               storeId:
 *                 type: string
 *               cashierId:
 *                 type: string
 *               paymentMethod:
 *                 type: string
 *                 example: cash
 *               paidAmount:
 *                 type: number
 *               totalAmount:
 *                 type: number
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - skuId
 *                     - quantity
 *                   properties:
 *                     skuId:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *                     price:
 *                       type: number
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad request
 */

/**
 * @openapi
 * /api/v1/users/meta:
 *   get:
 *     summary: Users metadata (roles + active stores)
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: Metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       name: { type: string, example: cashier }
 *                       description: { type: string, example: Nhân viên thu ngân }
 *                 stores:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       code: { type: string, example: SHP-001 }
 *                       name: { type: string, example: Cửa hàng Demo }
 */

/**
 * @openapi
 * /api/v1/users:
 *   get:
 *     summary: List users
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: Users list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   username: { type: string }
 *                   full_name: { type: string, nullable: true }
 *                   email: { type: string, nullable: true }
 *                   phone: { type: string, nullable: true }
 *                   role_id: { type: integer, nullable: true }
 *                   store_id: { type: integer, nullable: true }
 *                   is_active: { type: boolean }
 *                   roles:
 *                     type: object
 *                     nullable: true
 *                     properties:
 *                       id: { type: integer }
 *                       name: { type: string }
 *                       description: { type: string, nullable: true }
 *                   stores:
 *                     type: object
 *                     nullable: true
 *                     properties:
 *                       id: { type: integer }
 *                       code: { type: string }
 *                       name: { type: string }
 *   post:
 *     summary: Create user
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             email: cashier01@store.com
 *             password: cashier123
 *             roleId: 4
 *             name: Lê Văn A
 *             username: cashier01
 *             storeId: 1
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - roleId
 *             properties:
 *               email: { type: string, example: cashier01@store.com }
 *               password: { type: string, example: cashier123 }
 *               roleId: { type: integer, example: 2 }
 *               name: { type: string, example: Lê Văn A }
 *               username: { type: string, example: cashier01 }
 *               storeId:
 *                 type: integer
 *                 nullable: true
 *                 example: 1
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad request
 */

/**
 * @openapi
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get user by id
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User
 *       404:
 *         description: Not found
 *   put:
 *     summary: Update user
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             email: cashier01@store.com
 *             username: cashier01
 *             name: Lê Văn A (Updated)
 *             phone: "0909000001"
 *             roleId: 4
 *             storeId: 1
 *             isActive: true
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *               username: { type: string }
 *               name: { type: string }
 *               phone: { type: string }
 *               password: { type: string, description: Optional; if present updates password }
 *               roleId: { type: integer }
 *               storeId: { type: integer, nullable: true }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated
 *       400:
 *         description: Bad request
 *   delete:
 *     summary: Soft delete user (set inactive)
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deleted (soft)
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *     Pagination:
 *       type: object
 *       properties:
 *         total: { type: integer }
 *         take: { type: integer }
 *         skip: { type: integer }
 */

/**
 * @openapi
 * /api/v1/products/catalog:
 *   get:
 *     summary: Store catalog view (variants + product + store inventory)
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-store-id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Active store id
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: barcode
 *         schema:
 *           type: string
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Catalog list
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Bad request
 */

/**
 * @openapi
 * /api/v1/products/variant-prices:
 *   get:
 *     summary: Variant price history for active store
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-store-id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: variantId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Price history
 *       403:
 *         description: Forbidden
 *       400:
 *         description: Bad request
 *   post:
 *     summary: Set new effective store price for a variant
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-store-id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             variantId: 1
 *             price: 12000
 *             startAt: 2026-01-22T08:00:00.000Z
 *           schema:
 *             type: object
 *             required: [variantId, price]
 *             properties:
 *               variantId: { type: integer }
 *               price: { type: number, example: 12000 }
 *               startAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 description: Optional start time; defaults to now
 *     responses:
 *       201:
 *         description: Created
 *       403:
 *         description: Forbidden
 *       400:
 *         description: Bad request
 */

/**
 * @openapi
 * /api/v1/products/variant-prices/close:
 *   post:
 *     summary: Close the current effective price window for a variant
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-store-id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             variantId: 1
 *             endAt: 2026-01-22T18:00:00.000Z
 *           schema:
 *             type: object
 *             required: [variantId]
 *             properties:
 *               variantId: { type: integer }
 *               endAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 description: Optional end time; defaults to now
 *     responses:
 *       200:
 *         description: Closed
 *       403:
 *         description: Forbidden
 *       400:
 *         description: Bad request
 */

/**
 * @openapi
 * /api/v1/returns/invoices:
 *   get:
 *     summary: Search invoices for returns (active store)
 *     tags:
 *       - Returns
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-store-id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search invoice by id/number
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Invoice list
 *       401:
 *         description: Unauthorized
 */

/**
 * @openapi
 * /api/v1/returns/invoices/{id}:
 *   get:
 *     summary: Invoice details + returnable quantities
 *     tags:
 *       - Returns
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-store-id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Invoice + returnable items
 *       404:
 *         description: Not found
 */

/**
 * @openapi
 * /api/v1/returns:
 *   get:
 *     summary: List returns (active store)
 *     tags:
 *       - Returns
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-store-id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Returns list
 *   post:
 *     summary: Create a return (and optionally restock)
 *     tags:
 *       - Returns
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-store-id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             invoiceId: 1
 *             refundMethod: cash
 *             restock: true
 *             reason: "Lỗi sản phẩm"
 *             note: "Khách đổi hàng trong ngày"
 *             items:
 *               - invoiceItemId: 10
 *                 quantity: 1
 *                 reason: "Vỏ hộp móp"
 *           schema:
 *             type: object
 *             required: [invoiceId, items]
 *             properties:
 *               invoiceId: { type: integer }
 *               refundMethod:
 *                 type: string
 *                 example: cash
 *                 description: cash|card|other
 *               restock:
 *                 type: boolean
 *                 default: true
 *               reason:
 *                 type: string
 *                 nullable: true
 *               note:
 *                 type: string
 *                 nullable: true
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [invoiceItemId, quantity]
 *                   properties:
 *                     invoiceItemId: { type: integer }
 *                     quantity: { type: number, example: 1 }
 *                     reason: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden (e.g. large refund requires approval)
 */

/**
 * @openapi
 * /api/v1/returns/{id}:
 *   get:
 *     summary: Return details
 *     tags:
 *       - Returns
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-store-id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Return detail
 *       404:
 *         description: Not found
 */
