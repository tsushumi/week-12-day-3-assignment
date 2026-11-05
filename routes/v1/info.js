'use strict';

const express = require('express');
const { methodNotAllowed } = require('../../middleware/methodNotAllowed');

function createInfoRouter({ config }) {
  const router = express.Router();

  /**
   * @swagger
   * /info:
   *   get:
   *     tags: [Meta]
   *     summary: API version information
   *     responses:
   *       200:
   *         description: Version and URL prefix
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ApiInfo' }
   *       429: { $ref: '#/components/responses/TooManyRequests' }
   */
  router
    .route('/info')
    .get((req, res) => res.json({ version: config.version, prefix: config.prefix }))
    .all(methodNotAllowed(['GET']));

  return router;
}

module.exports = { createInfoRouter };
