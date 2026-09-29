import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeParameterValue, validateParameterValue } from '@aidn/shared';

describe('validateParameterValue', () => {
  it('accepts whole numbers from 1 to 3650', () => {
    for (const valid of ['1', '5', ' 12 ', '007', '3650']) {
      assert.equal(validateParameterValue('integer', valid), null, valid);
    }
    for (const invalid of ['', ' ', '0', '-2', '1.5', 'abc', '1e2', '3651']) {
      assert.notEqual(validateParameterValue('integer', invalid), null, invalid);
    }
  });

  it('accepts only true or false for booleans', () => {
    assert.equal(validateParameterValue('boolean', 'true'), null);
    assert.equal(validateParameterValue('boolean', 'false'), null);
    assert.notEqual(validateParameterValue('boolean', 'yes'), null);
  });

  it('requires non-blank text of at most 500 characters', () => {
    assert.equal(validateParameterValue('text', 'Nom Prénom'), null);
    assert.notEqual(validateParameterValue('text', '   '), null);
    assert.equal(validateParameterValue('text', 'x'.repeat(500)), null);
    assert.notEqual(validateParameterValue('text', 'x'.repeat(501)), null);
  });

  it('lets public_holidays be empty but rejects invalid dates, naming them', () => {
    assert.equal(validateParameterValue('text', '', 'public_holidays'), null);
    assert.equal(validateParameterValue('text', '2026-04-06, 08-17', 'public_holidays'), null);
    const message = validateParameterValue('text', '2026-04-06, 2026-02-30', 'public_holidays');
    assert.ok(message?.includes('2026-02-30'), message ?? 'expected an error');
  });
});

describe('normalizeParameterValue', () => {
  it('stores integers without spaces or leading zeros', () => {
    assert.equal(normalizeParameterValue('integer', ' 007 '), '7');
  });

  it('stores text trimmed', () => {
    assert.equal(normalizeParameterValue('text', '  Nom  '), 'Nom');
  });

  it('stores public holidays deduplicated, in entry order, comma-separated', () => {
    assert.equal(
      normalizeParameterValue('text', ' 2026-04-06\n08-17; 2026-04-06 ', 'public_holidays'),
      '2026-04-06, 08-17'
    );
    assert.equal(normalizeParameterValue('text', '  ', 'public_holidays'), '');
  });
});
