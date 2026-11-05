'use strict';

const { createInvoiceService } = require('./invoices');
const { createClientService } = require('./clients');

function createServices(store) {
  const invoices = createInvoiceService(store);
  const clients = createClientService(store, invoices);
  return { invoices, clients };
}

module.exports = { createServices };
