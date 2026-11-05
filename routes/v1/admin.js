'use strict';

const express = require('express');
const { createAuthenticator, requireRole } = require('../../middleware/auth');
const { methodNotAllowed } = require('../../middleware/methodNotAllowed');

function createAdminRouter({ services, config }) {
  const router = express.Router();
  const authenticate = createAuthenticator(config.tokens);

  /**
   * @swagger
   * /admin/stats:
   *   get:
   *     tags: [Admin]
   *     summary: Business statistics (admin only)
   *     description: Demonstrates 401 (missing or invalid token) and 403 (valid token, wrong role).
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Statistics
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/AdminStatsResponse' }
   *       401: { $ref: '#/components/responses/Unauthorized' }
   *       403: { $ref: '#/components/responses/Forbidden' }
   */
  router
    .route('/admin/stats')
    .get(authenticate, requireRole('admin'), (req, res) => res.json({ success: true, data: services.invoices.stats() }))
    .all(methodNotAllowed(['GET']));

  return router;
}

module.exports = { createAdminRouter };
