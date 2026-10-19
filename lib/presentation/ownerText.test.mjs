import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {ownerText}=createRequire(import.meta.url)('./ownerText.ts');
test('saved gas alert cleanup preserves the original detection time for website and push messages',()=>{
 for (const [message,time] of [
  ['Saved gas detection at Oct 12, 2026 21:29:06 (UTC+08:00). Uploaded after the event.','Oct 12, 2026 21:29:06 (UTC+08:00)'],
  ['Saved gas detection at Oct 12, 2026 00:05:01 (UTC+08:00).','Oct 12, 2026 00:05:01 (UTC+08:00)'],
  ['Saved gas detection at Oct 12, 2026, 9:29:06 PM. Uploaded after the event; check gas history for the recorded readings.','Oct 12, 2026, 9:29:06 PM'],
  ['Odor detected at Oct 15, 2026, 3:52 PM. Check the litter box and ventilation.','Oct 15, 2026, 3:52 PM'],
 ]) {
  const result=ownerText(message);
  assert.ok(result.includes(time), `Original event time lost: ${result}`);
  assert.match(result,/^Odor detected at /);
  assert.doesNotMatch(result,/Uploaded after the event/);
 }
 assert.equal(ownerText('Odor detected near the litter box. Check the litter box and ventilation.'),'Odor detected near the litter box. Check the litter box and ventilation.');
 assert.equal(ownerText('Urine detected (saved detection)'),'Urine detected');
 assert.equal(ownerText('Other timestamp 21:29:06 (UTC+08:00).'),'Other timestamp 21:29:06 (UTC+08:00).');
});
