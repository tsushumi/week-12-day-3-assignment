'use strict';

const { AppError } = require('../errors/AppError');
const { paginate, sortRows } = require('../utils/pagination');

const clone = (value) => structuredClone(value);

function createClientService(store, invoiceService) {
  const { clients } = store;

  function findOrThrow(id) {
    const client = clients.get(id);
    if (!client) throw AppError.notFound('Client', id);
    return client;
  }

  function assertEmailFree(email, exceptId) {
    const owner = clients.all().find((client) => client.email === email && client.id !== exceptId);
    if (owner) throw AppError.conflict(`A client with email ${email} already exists`);
  }

  function list({ page, limit, q, sort }) {
    let rows = clients.all();
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((client) =>
        [client.name, client.email, client.company].some((value) => value && value.toLowerCase().includes(needle))
      );
    }
    const result = paginate(sortRows(rows, sort), { page, limit });
    return { data: clone(result.data), meta: result.meta };
  }

  const get = (id) => clone(findOrThrow(id));

  function create(body) {
    assertEmailFree(body.email);
    const timestamp = store.now().toISOString();
    return clone(
      clients.insert({
        name: body.name,
        email: body.email,
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.company !== undefined && { company: body.company }),
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    );
  }

  // PUT: replaces every writable field, so optional fields that are not sent are removed.
  function replace(id, body) {
    const existing = findOrThrow(id);
    assertEmailFree(body.email, id);
    return clone(
      clients.save({
        id,
        name: body.name,
        email: body.email,
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.company !== undefined && { company: body.company }),
        createdAt: existing.createdAt,
        updatedAt: store.now().toISOString(),
      })
    );
  }

  // PATCH: only the fields that are sent change.
  function patch(id, changes) {
    const existing = findOrThrow(id);
    if (changes.email !== undefined) assertEmailFree(changes.email, id);
    return clone(clients.save({ ...existing, ...changes, updatedAt: store.now().toISOString() }));
  }

  function remove(id) {
    findOrThrow(id);
    const count = invoiceService.countForClient(id);
    if (count > 0) {
      throw AppError.conflict(`Client ${id} has ${count} invoice${count === 1 ? '' : 's'} and cannot be deleted`, {
        invoiceCount: count,
      });
    }
    clients.remove(id);
  }

  // GET /clients/:id/invoices
  function listInvoices(id, query) {
    findOrThrow(id); // unknown client -> 404, not an empty list
    return invoiceService.list({ ...query, clientId: id });
  }

  return { list, get, create, replace, patch, remove, listInvoices };
}

module.exports = { createClientService };
