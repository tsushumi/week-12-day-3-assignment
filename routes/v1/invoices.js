'use strict';

const express = require('express');
const { validate } = require('../../middleware/validate');
const { requireJson } = require('../../middleware/requireJson');
const { methodNotAllowed } = require('../../middleware/methodNotAllowed');
const schema = require('../../schemas/invoice');

function createInvoiceRouter({ invoices }) {
  const router = express.Router();
  const ok = (res, data, status = 200, meta) => res.status(status).json({ success: true, data, ...(meta && { meta }) });

  /**
   * @swagger
   * /invoices:
   *   get:
   *     tags: [Invoices]
   *     summary: List invoices
   *     description: Paginated list. Filter by status or client, sort with `sort` (prefix `-` for descending).
   *     parameters:
   *       - $ref: '#/components/parameters/Page'
   *       - $ref: '#/components/parameters/Limit'
   *       - in: query
   *         name: status
   *         schema: { $ref: '#/components/schemas/InvoiceStatus' }
   *       - in: query
   *         name: clientId
   *         schema: { type: integer, minimum: 1 }
   *       - in: query
   *         name: sort
   *         schema: { type: string, default: id, enum: [id, -id, createdAt, -createdAt, dueDate, -dueDate, total, -total] }
   *     responses:
   *       200:
   *         description: A page of invoices
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/InvoiceList' }
   *       400: { $ref: '#/components/responses/BadRequest' }
   *       429: { $ref: '#/components/responses/TooManyRequests' }
   *       500: { $ref: '#/components/responses/InternalError' }
   *   post:
   *     tags: [Invoices]
   *     summary: Create an invoice
   *     description: The total is computed by the server. `invoiceNumber` is generated when omitted.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/CreateInvoice' }
   *     responses:
   *       201:
   *         description: Created (Location header points at the new invoice)
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/InvoiceResponse' }
   *       400: { $ref: '#/components/responses/BadRequest' }
   *       409: { $ref: '#/components/responses/Conflict' }
   *       415: { $ref: '#/components/responses/UnsupportedMediaType' }
   *       429: { $ref: '#/components/responses/TooManyRequests' }
   *       500: { $ref: '#/components/responses/InternalError' }
   */
  router
    .route('/invoices')
    .get(validate({ query: schema.listQuery }), (req, res) => {
      const { data, meta } = invoices.list(req.valid.query);
      ok(res, data, 200, meta);
    })
    .post(requireJson, validate({ body: schema.createBody }), (req, res) => {
      const created = invoices.create(req.valid.body);
      res.location(`${req.baseUrl}/invoices/${created.id}`);
      ok(res, created, 201);
    })
    .all(methodNotAllowed(['GET', 'POST']));

  /**
   * @swagger
   * /invoices/{id}:
   *   get:
   *     tags: [Invoices]
   *     summary: Get one invoice
   *     parameters:
   *       - $ref: '#/components/parameters/InvoiceId'
   *     responses:
   *       200:
   *         description: The invoice
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/InvoiceResponse' }
   *       400: { $ref: '#/components/responses/BadRequest' }
   *       404: { $ref: '#/components/responses/NotFound' }
   *       429: { $ref: '#/components/responses/TooManyRequests' }
   *   put:
   *     tags: [Invoices]
   *     summary: Replace an invoice
   *     description: Full replace of the writable fields (clientId, items, dueDate, status). PAID invoices are immutable.
   *     parameters:
   *       - $ref: '#/components/parameters/InvoiceId'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/ReplaceInvoice' }
   *     responses:
   *       200:
   *         description: The updated invoice
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/InvoiceResponse' }
   *       400: { $ref: '#/components/responses/BadRequest' }
   *       404: { $ref: '#/components/responses/NotFound' }
   *       409: { $ref: '#/components/responses/Conflict' }
   *       415: { $ref: '#/components/responses/UnsupportedMediaType' }
   *   patch:
   *     tags: [Invoices]
   *     summary: Partially update an invoice
   *     description: |
   *       Send only the fields to change. Status changes follow DRAFT -> SENT -> PAID/OVERDUE, OVERDUE -> PAID;
   *       anything else is a 409.
   *     parameters:
   *       - $ref: '#/components/parameters/InvoiceId'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/UpdateInvoice' }
   *     responses:
   *       200:
   *         description: The updated invoice
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/InvoiceResponse' }
   *       400: { $ref: '#/components/responses/BadRequest' }
   *       404: { $ref: '#/components/responses/NotFound' }
   *       409: { $ref: '#/components/responses/Conflict' }
   *       415: { $ref: '#/components/responses/UnsupportedMediaType' }
   *   delete:
   *     tags: [Invoices]
   *     summary: Delete an invoice
   *     description: PAID invoices cannot be deleted.
   *     parameters:
   *       - $ref: '#/components/parameters/InvoiceId'
   *     responses:
   *       204:
   *         description: Deleted (no body)
   *       400: { $ref: '#/components/responses/BadRequest' }
   *       404: { $ref: '#/components/responses/NotFound' }
   *       409: { $ref: '#/components/responses/Conflict' }
   */
  router
    .route('/invoices/:id')
    .get(validate({ params: schema.idParams }), (req, res) => ok(res, invoices.get(req.valid.params.id)))
    .put(requireJson, validate({ params: schema.idParams, body: schema.replaceBody }), (req, res) =>
      ok(res, invoices.update(req.valid.params.id, req.valid.body))
    )
    .patch(requireJson, validate({ params: schema.idParams, body: schema.patchBody }), (req, res) =>
      ok(res, invoices.update(req.valid.params.id, req.valid.body))
    )
    .delete(validate({ params: schema.idParams }), (req, res) => {
      invoices.remove(req.valid.params.id);
      res.status(204).end();
    })
    .all(methodNotAllowed(['GET', 'PUT', 'PATCH', 'DELETE']));

  return router;
}

module.exports = { createInvoiceRouter };
