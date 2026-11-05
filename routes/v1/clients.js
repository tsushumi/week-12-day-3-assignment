'use strict';

const express = require('express');
const { validate } = require('../../middleware/validate');
const { requireJson } = require('../../middleware/requireJson');
const { methodNotAllowed } = require('../../middleware/methodNotAllowed');
const schema = require('../../schemas/client');
const invoiceSchema = require('../../schemas/invoice');

function createClientRouter({ clients }) {
  const router = express.Router();
  const ok = (res, data, status = 200, meta) => res.status(status).json({ success: true, data, ...(meta && { meta }) });

  /**
   * @swagger
   * /clients:
   *   get:
   *     tags: [Clients]
   *     summary: List clients
   *     parameters:
   *       - $ref: '#/components/parameters/Page'
   *       - $ref: '#/components/parameters/Limit'
   *       - in: query
   *         name: q
   *         description: Case-insensitive search in name, email and company
   *         schema: { type: string }
   *       - in: query
   *         name: sort
   *         schema: { type: string, default: id, enum: [id, -id, name, -name, createdAt, -createdAt] }
   *     responses:
   *       200:
   *         description: A page of clients
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ClientList' }
   *       400: { $ref: '#/components/responses/BadRequest' }
   *       429: { $ref: '#/components/responses/TooManyRequests' }
   *   post:
   *     tags: [Clients]
   *     summary: Create a client
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/CreateClient' }
   *     responses:
   *       201:
   *         description: Created
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ClientResponse' }
   *       400: { $ref: '#/components/responses/BadRequest' }
   *       409: { $ref: '#/components/responses/Conflict' }
   *       415: { $ref: '#/components/responses/UnsupportedMediaType' }
   */
  router
    .route('/clients')
    .get(validate({ query: schema.listQuery }), (req, res) => {
      const { data, meta } = clients.list(req.valid.query);
      ok(res, data, 200, meta);
    })
    .post(requireJson, validate({ body: schema.createBody }), (req, res) => {
      const created = clients.create(req.valid.body);
      res.location(`${req.baseUrl}/clients/${created.id}`);
      ok(res, created, 201);
    })
    .all(methodNotAllowed(['GET', 'POST']));

  /**
   * @swagger
   * /clients/{id}:
   *   get:
   *     tags: [Clients]
   *     summary: Get one client
   *     parameters:
   *       - $ref: '#/components/parameters/ClientId'
   *     responses:
   *       200:
   *         description: The client
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ClientResponse' }
   *       400: { $ref: '#/components/responses/BadRequest' }
   *       404: { $ref: '#/components/responses/NotFound' }
   *   put:
   *     tags: [Clients]
   *     summary: Replace a client
   *     parameters:
   *       - $ref: '#/components/parameters/ClientId'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/CreateClient' }
   *     responses:
   *       200:
   *         description: The updated client
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ClientResponse' }
   *       400: { $ref: '#/components/responses/BadRequest' }
   *       404: { $ref: '#/components/responses/NotFound' }
   *       409: { $ref: '#/components/responses/Conflict' }
   *   patch:
   *     tags: [Clients]
   *     summary: Partially update a client
   *     parameters:
   *       - $ref: '#/components/parameters/ClientId'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/UpdateClient' }
   *     responses:
   *       200:
   *         description: The updated client
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ClientResponse' }
   *       400: { $ref: '#/components/responses/BadRequest' }
   *       404: { $ref: '#/components/responses/NotFound' }
   *       409: { $ref: '#/components/responses/Conflict' }
   *   delete:
   *     tags: [Clients]
   *     summary: Delete a client
   *     description: A client that still has invoices cannot be deleted (409).
   *     parameters:
   *       - $ref: '#/components/parameters/ClientId'
   *     responses:
   *       204:
   *         description: Deleted (no body)
   *       400: { $ref: '#/components/responses/BadRequest' }
   *       404: { $ref: '#/components/responses/NotFound' }
   *       409: { $ref: '#/components/responses/Conflict' }
   */
  router
    .route('/clients/:id')
    .get(validate({ params: schema.idParams }), (req, res) => ok(res, clients.get(req.valid.params.id)))
    .put(requireJson, validate({ params: schema.idParams, body: schema.replaceBody }), (req, res) =>
      ok(res, clients.replace(req.valid.params.id, req.valid.body))
    )
    .patch(requireJson, validate({ params: schema.idParams, body: schema.patchBody }), (req, res) =>
      ok(res, clients.patch(req.valid.params.id, req.valid.body))
    )
    .delete(validate({ params: schema.idParams }), (req, res) => {
      clients.remove(req.valid.params.id);
      res.status(204).end();
    })
    .all(methodNotAllowed(['GET', 'PUT', 'PATCH', 'DELETE']));

  /**
   * @swagger
   * /clients/{id}/invoices:
   *   get:
   *     tags: [Clients]
   *     summary: List a client's invoices
   *     parameters:
   *       - $ref: '#/components/parameters/ClientId'
   *       - $ref: '#/components/parameters/Page'
   *       - $ref: '#/components/parameters/Limit'
   *       - in: query
   *         name: status
   *         schema: { $ref: '#/components/schemas/InvoiceStatus' }
   *       - in: query
   *         name: sort
   *         schema: { type: string, default: id, enum: [id, -id, createdAt, -createdAt, dueDate, -dueDate, total, -total] }
   *     responses:
   *       200:
   *         description: A page of the client's invoices
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/InvoiceList' }
   *       400: { $ref: '#/components/responses/BadRequest' }
   *       404: { $ref: '#/components/responses/NotFound' }
   */
  router
    .route('/clients/:id/invoices')
    .get(validate({ params: schema.idParams, query: invoiceSchema.nestedListQuery }), (req, res) => {
      const { data, meta } = clients.listInvoices(req.valid.params.id, req.valid.query);
      ok(res, data, 200, meta);
    })
    .all(methodNotAllowed(['GET']));

  return router;
}

module.exports = { createClientRouter };
