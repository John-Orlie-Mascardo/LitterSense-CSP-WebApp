import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {ownerText}=createRequire(import.meta.url)('./ownerText.ts');
test('legacy saved detection timestamps display AM/PM without changing event date or other text',()=>{
 assert.equal(ownerText('Saved gas detection at Oct 12, 2026 21:29:06 (UTC+08:00). Uploaded after the event.'),'Odor detected at Oct 12, 2026, 9:29 PM. Check the litter box and ventilation.');
 assert.equal(ownerText('Saved gas detection at Oct 12, 2026 00:05:01 (UTC+08:00).'),'Odor detected at Oct 12, 2026, 12:05 AM. Check the litter box and ventilation.');
 assert.equal(ownerText('Saved gas detection at Oct 12, 2026, 9:29:06 PM. Uploaded after the event; check gas history for the recorded readings.'),'Odor detected at Oct 12, 2026, 9:29 PM. Check the litter box and ventilation.');
 assert.equal(ownerText('Urine detected (saved detection)'),'Urine detected');
 assert.equal(ownerText('Other timestamp 21:29:06 (UTC+08:00).'),'Other timestamp 21:29:06 (UTC+08:00).');
});
