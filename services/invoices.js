'use strict';

const { AppError } = require('../errors/AppError');
const { paginate, sortRows } = require('../utils/pagination');

// Business rules for status changes. PAID is final.
const TRANSITIONS = {
  DRAFT: ['SENT'],
  SENT: ['PAID', 'OVERDUE'],
  OVERDUE: ['PAID'],
  PAID: [],
};

const clone = (value) => structuredClone(value);

// Totals are computed in cents so 3 x 0.10 is 0.30, not 0.30000000000000004.
function computeTotal(items) {
  return Math.round(items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice * 100), 0)) / 100;
}

function createInvoiceService(store) {
  const { invoices, clients } = store;

  function findOrThrow(id) {
    const invoice = invoices.get(id);
    if (!invoice) throw AppError.notFound('Invoice', id);
    return invoice;
  }

  // A body that points at a client that does not exist is a bad request body
  // (the invoice collection itself exists), reported against the field.
  function requireClient(clientId) {
    if (!clients.get(clientId)) {
      throw AppError.validation([{ field: 'clientId', message: `Client with ID ${clientId} does not exist` }]);
    }
  }

  const numberTaken = (number) => invoices.all().some((invoice) => invoice.invoiceNumber === number);

  // INV-<year>-<sequence>, continuing after the highest number used this year.
  function nextInvoiceNumber() {
    const prefix = `INV-${store.now().getUTCFullYear()}-`;
    let highest = 0;
    for (const invoice of invoices.all()) {
      if (invoice.invoiceNumber.startsWith(prefix)) {
        highest = Math.max(highest, Number.parseInt(invoice.invoiceNumber.slice(prefix.length), 10) || 0);
      }
    }
    let candidate;
    do {
      highest += 1;
      candidate = `${prefix}${String(highest).padStart(3, '0')}`;
    } while (numberTaken(candidate));
    return candidate;
  }

  function list({ page, limit, status, clientId, sort }) {
    let rows = invoices.all();
    if (status) rows = rows.filter((invoice) => invoice.status === status);
    if (clientId !== undefined) rows = rows.filter((invoice) => invoice.clientId === clientId);
    const result = paginate(sortRows(rows, sort), { page, limit });
    return { data: clone(result.data), meta: result.meta };
  }

  const get = (id) => clone(findOrThrow(id));

  function create(body) {
    requireClient(body.clientId);
    let invoiceNumber = body.invoiceNumber;
    if (invoiceNumber === undefined) {
      invoiceNumber = nextInvoiceNumber();
    } else if (numberTaken(invoiceNumber)) {
      throw AppError.conflict(`Invoice number ${invoiceNumber} already exists`);
    }
    const timestamp = store.now().toISOString();
    const record = invoices.insert({
      invoiceNumber,
      clientId: body.clientId,
      status: body.status ?? 'DRAFT',
      items: clone(body.items),
      total: computeTotal(body.items),
      dueDate: body.dueDate,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return clone(record);
  }

  // Shared by PUT (every writable field present) and PATCH (a subset).
  function update(id, changes) {
    const existing = findOrThrow(id);
    if (existing.status === 'PAID') {
      throw AppError.conflict(`Invoice ${id} is PAID and can no longer be modified`);
    }
    if (changes.clientId !== undefined) requireClient(changes.clientId);
    if (changes.status !== undefined && changes.status !== existing.status) {
      const allowed = TRANSITIONS[existing.status];
      if (!allowed.includes(changes.status)) {
        throw AppError.conflict(`Cannot change invoice status from ${existing.status} to ${changes.status}`, {
          from: existing.status,
          to: changes.status,
          allowed,
        });
      }
    }
    const next = { ...existing };
    for (const key of ['clientId', 'dueDate', 'status']) {
      if (changes[key] !== undefined) next[key] = changes[key];
    }
    if (changes.items !== undefined) {
      next.items = clone(changes.items);
      next.total = computeTotal(next.items);
    }
    next.updatedAt = store.now().toISOString();
    return clone(invoices.save(next));
  }

  function remove(id) {
    const existing = findOrThrow(id);
    if (existing.status === 'PAID') {
      throw AppError.conflict(`Invoice ${id} is PAID and cannot be deleted`);
    }
    invoices.remove(id);
  }

  const countForClient = (clientId) => invoices.all().filter((invoice) => invoice.clientId === clientId).length;

  // Summary for the admin endpoint.
  function stats() {
    const all = invoices.all();
    const byStatus = { DRAFT: 0, SENT: 0, PAID: 0, OVERDUE: 0 };
    const sums = { PAID: 0, SENT: 0, OVERDUE: 0, DRAFT: 0 };
    for (const invoice of all) {
      byStatus[invoice.status] += 1;
      sums[invoice.status] += Math.round(invoice.total * 100);
    }
    return {
      clients: clients.all().length,
      invoices: all.length,
      invoicesByStatus: byStatus,
      revenueCollected: sums.PAID / 100,
      outstanding: (sums.SENT + sums.OVERDUE) / 100,
      currency: 'KES',
    };
  }

  return { list, get, create, update, remove, countForClient, stats };
}

module.exports = { createInvoiceService, TRANSITIONS, computeTotal };
