import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
test('measured hours replace the day, and zero clears it', () => {
  const db = openDb(':memory:'), day = '2026-10-12';
  db.recordHours('U', day, 2); db.recordHours('U', day, 1.5);
  assert.deepEqual(db.getEntry('U', day), { hours: 1.5, note: null });
  db.recordHours('U', day, 0);
  assert.equal(db.getEntry('U', day), null);
  db.close();
});
