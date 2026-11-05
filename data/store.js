'use strict';

/**
 * In-memory "database": 12 clients and 24 invoices (amounts in KES).
 * createStore() returns a fresh, independent copy every time, so tests and the
 * running server never share state.
 */

const SEED_CLIENTS = [
  ['Wanjiru Kamau', 'wanjiru@savannahcoffee.example', '+254 712 345 678', 'Savannah Coffee Traders'],
  ['Otieno Odhiambo', 'otieno@kisumuboats.example', '+254 722 111 222', 'Kisumu Boat Works'],
  ['Amina Hassan', 'amina@mombasaspice.example', '+254 733 456 789', 'Mombasa Spice Co.'],
  ['Kipchoge Rotich', 'kipchoge@riftdairy.example', '+254 701 234 567', 'Rift Valley Dairy'],
  ['Njeri Mwangi', 'njeri@nairobifresh.example', '+254 711 987 654', 'Nairobi Fresh Produce'],
  ['Barasa Wekesa', 'barasa@westernbricks.example', '+254 720 555 010', 'Western Bricks Ltd'],
  ['Achieng Ouma', 'achieng@lakesidehotel.example', '+254 734 600 700', 'Lakeside Hotel'],
  ['Mutua Kioko', 'mutua@machakoshardware.example', '+254 710 808 909', 'Machakos Hardware'],
  ['Fatuma Ali', 'fatuma@lamudhow.example', '+254 723 321 654', 'Lamu Dhow Tours'],
  ['Kamau Njoroge', 'kamau@thikatextiles.example', '+254 705 432 109', 'Thika Textile Mills'],
  ['Chebet Korir', 'chebet@eldoretgrain.example', '+254 726 765 432', 'Eldoret Grain Store'],
  ['Mwende Musyoka', 'mwende@kitusolar.example', '+254 741 222 333', 'Kitui Solar Solutions'],
];

const ITEM_SETS = [
  [{ description: 'Website design', quantity: 1, unitPrice: 85000 }, { description: 'Hosting (per month)', quantity: 12, unitPrice: 2500 }],
  [{ description: 'Consulting (per hour)', quantity: 10, unitPrice: 4500 }],
  [{ description: 'Mobile app development', quantity: 1, unitPrice: 250000 }, { description: 'QA testing', quantity: 1, unitPrice: 40000 }],
  [{ description: 'M-Pesa integration', quantity: 1, unitPrice: 60000 }],
  [{ description: 'Brand identity package', quantity: 1, unitPrice: 35000 }, { description: 'Social media templates', quantity: 5, unitPrice: 3000 }],
  [{ description: 'SEO audit', quantity: 1, unitPrice: 28000 }, { description: 'Content writing (per article)', quantity: 8, unitPrice: 3500 }],
];

// Invoice 1 is INV-2026-001 (the number the assignment's 409 example uses).
// Invoice 5 is a DRAFT, so the DELETE /invoices/5 and PUT /invoices/5 examples work.
const SEED_STATUSES = [
  'SENT', 'PAID', 'DRAFT', 'OVERDUE', 'DRAFT', 'PAID', 'SENT', 'OVERDUE',
  'PAID', 'DRAFT', 'SENT', 'PAID', 'OVERDUE', 'DRAFT', 'SENT', 'PAID',
  'DRAFT', 'SENT', 'OVERDUE', 'PAID', 'SENT', 'DRAFT', 'PAID', 'OVERDUE',
];

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

function createStore({ now = () => new Date() } = {}) {
  const state = { nextClientId: 1, nextInvoiceId: 1 };
  const clientMap = new Map();
  const invoiceMap = new Map();

  function collection(map, counter) {
    return {
      all: () => [...map.values()],
      get: (id) => map.get(id),
      insert(fields) {
        const record = { id: state[counter]++, ...fields };
        map.set(record.id, record);
        return record;
      },
      save(record) {
        map.set(record.id, record);
        return record;
      },
      remove: (id) => map.delete(id),
    };
  }

  const clients = collection(clientMap, 'nextClientId');
  const invoices = collection(invoiceMap, 'nextInvoiceId');

  const clientBase = Date.UTC(2026, 7, 1, 8, 0, 0);
  SEED_CLIENTS.forEach(([name, email, phone, company], index) => {
    const createdAt = new Date(clientBase + index * 3 * DAY_MS).toISOString();
    clients.insert({ name, email, phone, company, createdAt, updatedAt: createdAt });
  });

  const invoiceBase = Date.UTC(2026, 8, 1, 9, 0, 0);
  SEED_STATUSES.forEach((status, index) => {
    const number = index + 1;
    const createdMs = invoiceBase + number * 2 * DAY_MS;
    const items = ITEM_SETS[number % ITEM_SETS.length].map((item) => ({ ...item }));
    const total = Math.round(items.reduce((sum, item) => sum + item.quantity * item.unitPrice * 100, 0)) / 100;
    const createdAt = new Date(createdMs).toISOString();
    invoices.insert({
      invoiceNumber: `INV-2026-${String(number).padStart(3, '0')}`,
      clientId: ((number * 7) % 10) + 1, // spreads invoices over clients 1-10; clients 11 and 12 have none
      status,
      items,
      total,
      dueDate: isoDay(createdMs + (status === 'OVERDUE' ? 14 : 30) * DAY_MS),
      createdAt,
      updatedAt: createdAt,
    });
  });

  return { now, clients, invoices };
}

module.exports = { createStore };
