import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { ownerText } = createRequire(import.meta.url)('./ownerText.ts');

test('legacy alerts and session labels display friendly wording without changing other text', () => {
  assert.equal(ownerText('Ammonia (NH3) detected'), 'Urine detected');
  assert.equal(ownerText('Hydrogen sulfide (H2S): 12 ppm'), 'Stool: 12');
  assert.equal(ownerText('RFID Session / RFID sessions'), 'Litter Box Session / Litter Box Sessions');
  assert.equal(ownerText('Zeno left the box'), 'Zeno left the box');
});
