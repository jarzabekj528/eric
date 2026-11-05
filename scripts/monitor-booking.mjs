import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const base = 'https://booking.saywhencontracting.com';
const results = [];
const request = async (path, options = {}) => {
  const response = await fetch(new URL(path, base), { ...options, signal: AbortSignal.timeout(20000) });
  return { response, text: await response.text() };
};
async function check(name, test) {
  let failure;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await test(); results.push({ name, ok: true }); return; }
    catch (error) { failure = error.message; }
    if (!attempt) await new Promise(resolve => setTimeout(resolve, 15000));
  }
  results.push({ name, ok: false, error: failure });
}
for (const service of ['bathroom', 'kitchen']) {
  await check(`${service} page and assets`, async () => {
    const { response, text } = await request(`/${service}/`);
    assert.equal(response.status, 200);
    assert.ok(text.includes('id="remodel-quiz"'), 'Lead form is missing');
    assert.ok(text.includes('contact_consent'), 'Consent field is missing');
    assert.ok(!text.includes('TEST MODE'), 'Test mode is enabled');
    assert.match(text, new RegExp(service, 'i'));
    const sources = [...text.matchAll(/(?:src|srcset)="(\/assets\/[^" ]+)"/g)].map(match => match[1]);
    assert.ok(sources.some(source => source.includes('tracking-')), 'Pixel script is missing');
    for (const source of new Set(sources)) {
      const asset = await request(source);
      assert.equal(asset.response.status, 200, `Asset failed: ${source}`);
      assert.ok(!asset.response.headers.get('content-type')?.includes('text/html'), `Asset returned HTML: ${source}`);
      if (source.includes('tracking-')) {
        assert.ok(asset.text.includes('915999720840147'), 'Wrong Pixel ID');
        for (const event of ['PageView', 'Lead', 'Schedule']) assert.ok(asset.text.includes(event), `Missing ${event} event`);
      }
    }
  });
}
await check('Live calendar has bookable appointments', async () => {
  let count = 0;
  for (let offset = 0; offset < 2; offset++) {
    const month = new Date();
    month.setUTCDate(1);
    month.setUTCMonth(month.getUTCMonth() + offset);
    const { response, text } = await request(`/api/availability?year=${month.getUTCFullYear()}&month=${month.getUTCMonth() + 1}`);
    assert.equal(response.status, 200, 'Calendar API failed');
    const data = JSON.parse(text);
    assert.ok(data.days && typeof data.days === 'object', 'Invalid calendar response');
    count += Object.values(data.days).flat().filter(slot => Date.parse(slot) > Date.now()).length;
  }
  assert.ok(count > 0, 'No future bookable slots this month or next month; check calendar capacity');
});
await check('Live form rejects invalid submissions without creating leads', async () => {
  const { response } = await request('/api/lead', {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(response.status, 400, 'Validation failed or test mode remains active');
});
await check('Live booking rejects unsigned sessions without creating appointments', async () => {
  const { response } = await request('/api/appointment', {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(response.status, 401, 'Booking session protection failed or test mode is active');
});
const report = { checkedAt: new Date().toISOString(), ok: results.every(result => result.ok), results,
  limitations: 'Non-destructive checks: do not prove GHL contact writes, SMS/email delivery, Meta receipt, workflow enrollment, or real browser interaction. GitHub schedules may be delayed.' };
writeFileSync('booking-monitor-result.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
