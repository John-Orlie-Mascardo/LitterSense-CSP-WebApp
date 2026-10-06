const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAlertMessage, ALERT_REASONS } = require('./smsTemplates.ts');

test('each real alert has one ASCII message, real Manila time, and no raw placeholders', () => {
  for (const reason of ALERT_REASONS) {
    const message = buildAlertMessage(reason, { catName: 'Zeno', occurredAt: '2026-10-05T08:05:00Z', visitCount: 7, durationSecs: 301 });
    assert.match(message, /^LitterSense:/);
    assert.ok(message.length <= 160, `${reason}: ${message.length}`);
    assert.match(message, /^[\x20-\x7e]+$/);
    assert.doesNotMatch(message, /\[(Cat Name|Time|Alert Type)\]/);
    assert.doesNotMatch(message, /ammonia|hydrogen sulfide|NH3|H2S|ppm/i);
    if (reason !== 'Test SMS') assert.match(message, /4:05 PM/);
  }
});

test('long or non-ASCII names do not turn an SMS into Unicode or remove its action', () => {
  const message = buildAlertMessage('Extended duration', { catName: 'Zoë🐈'.repeat(30), occurredAt: '2026-10-05T08:05:00Z', durationSecs: 600 });
  assert.match(message, /^[\x20-\x7e]+$/);
  assert.ok(message.length <= 160);
  assert.match(message, /Contact a vet if straining\.$/);
});
