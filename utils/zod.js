'use strict';

const { z } = require('zod');

// Fields a client may see in a response but can never set.
const READ_ONLY_FIELDS = new Set(['id', 'total', 'createdAt', 'updatedAt', 'invoiceNumber']);

const receivedType = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

let configured = false;

// Zod 4 words type errors as "Invalid input: expected number, received string".
// The API contract uses "Expected number, received string" / "Required", so
// those messages are rewritten once, globally. Everything else keeps Zod's text.
function configureZod() {
  if (configured) return;
  configured = true;
  z.config({
    customError: (issue) => {
      if (issue.code === 'invalid_type') {
        if (issue.input === undefined) return 'Required';
        if (issue.expected === 'int') return 'Must be an integer';
        return `Expected ${issue.expected}, received ${receivedType(issue.input)}`;
      }
      if (issue.code === 'invalid_value' && Array.isArray(issue.values)) {
        return `Must be one of: ${issue.values.join(', ')}`;
      }
      return undefined;
    },
  });
}

// ["items", 0, "quantity"] -> "items[0].quantity"
function pathToField(path, rootField) {
  if (path.length === 0) return rootField;
  return path.reduce((field, segment) => {
    if (typeof segment === 'number') return `${field}[${segment}]`;
    return field ? `${field}.${String(segment)}` : String(segment);
  }, '');
}

// Zod issues -> [{ field, message }]
function formatIssues(error, rootField = 'body') {
  const details = [];
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        details.push({
          field: pathToField([...issue.path, key], rootField),
          message: READ_ONLY_FIELDS.has(key) ? 'This field is read-only' : 'Unrecognized field',
        });
      }
    } else {
      details.push({ field: pathToField(issue.path, rootField), message: issue.message });
    }
  }
  return details;
}

configureZod();

module.exports = { z, configureZod, formatIssues, READ_ONLY_FIELDS };
