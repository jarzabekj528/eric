import assert from 'node:assert/strict';
import bookingWorker from '../booking-landing/_worker.js';

const origin = 'https://booking.saywhencontracting.com';
const slot = new Date(Date.now() + 2 * 86400000).toISOString().replace(/\.\d{3}Z$/, '+00:00');
const dateKey = slot.slice(0, 10);
const requests = [];
const backgroundWork = [];
const contactId = 'abcdefghijklmnopqrst';
let appointmentShouldFail = false;
const env = {
  GHL_TOKEN: 'test-only-token',
  TURNSTILE_SECRET: 'test-only-turnstile-secret',
  ASSETS: { fetch: () => new Response('asset served') },
};

globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname;
  requests.push({ path, options });
  if (path === '/turnstile/v0/siteverify') {
    const body = JSON.parse(options.body);
    return Response.json({ success: body.response === 'valid-test-token', hostname: 'booking.saywhencontracting.com' });
  }
  if (path.endsWith('/free-slots')) return Response.json({ [dateKey]: { slots: [slot] } });
  if (path === '/contacts/upsert') return Response.json({ contact: { id: contactId } });
  if (path === `/contacts/${contactId}/tags`) return Response.json({ tags: JSON.parse(options.body).tags });
  if (path === `/contacts/${contactId}/notes`) return Response.json({ note: { id: 'test-note' } });
  if (path === `/contacts/${contactId}`) {
    return Response.json({ contact: {
      id: contactId,
      locationId: 'QS2WhwivER8LtYZ1oRfY',
      firstName: 'Test', lastName: 'Person', address1: '1 Test Street', city: 'Test City', postalCode: '49001',
    } });
  }
  if (path === '/calendars/events/appointments') {
    return appointmentShouldFail ? Response.json({ message: 'Booking failed' }, { status: 500 }) :
      Response.json({ id: 'test-appointment-id' });
  }
  throw new Error(`Unexpected GHL request: ${path}`);
};

const post = (path, body) => bookingWorker.fetch(new Request(`${origin}${path}`, {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}), env, { waitUntil: (promise) => backgroundWork.push(promise) });

const originalAssets = env.ASSETS;
env.ASSETS = { fetch: () => new Response('<html>fallback</html>', { headers: { 'Content-Type': 'text/html' } }) };
const missingAsset = await bookingWorker.fetch(new Request(`${origin}/assets/missing.js`), env);
assert.equal(missingAsset.status, 404);
assert.equal(missingAsset.headers.get('Cache-Control'), 'no-store');
env.ASSETS = originalAssets;

const invalid = await post('/api/lead', { name: 'Test Person' });
assert.equal(invalid.status, 400);
assert.equal(requests.length, 0);

const validLead = {
  projectScope: 'Bathroom Remodel',
  name: 'Test Person', phone: '269 339 2545', email: 'test@example.com',
  address: '1 Test Street', city: 'Test City', postalCode: '49001', website: '',
  contactConsent: true,
  attribution: { utmSource: 'facebook', fbclid: 'test-click-id' },
};
const bot = await post('/api/lead', validLead);
assert.equal(bot.status, 403);
assert.equal(requests.length, 0);

const missingConsent = await post('/api/lead', {
  ...validLead,
  contactConsent: false,
  turnstileToken: 'valid-test-token',
});
assert.equal(missingConsent.status, 400);
assert.equal(requests.length, 0);

const lead = await post('/api/lead', {
  ...validLead,
  turnstileToken: 'valid-test-token',
});
assert.equal(lead.status, 200);
const leadResult = await lead.json();
assert.ok(leadResult.session);
assert.ok(leadResult.eventId);
const upsert = JSON.parse(requests.find((item) => item.path === '/contacts/upsert').options.body);
assert.equal(upsert.phone, '+12693392545');
assert.equal(upsert.address1, '1 Test Street');
assert.equal(upsert.source, 'Facebook Ads');
assert.equal(upsert.customFields[0].fieldValue, 'Bathroom Remodel');
const leadTagRequest = requests.find((item) => item.path === `/contacts/${contactId}/tags`);
assert.deepEqual(JSON.parse(leadTagRequest.options.body), { tags: ['booking-form-submitted'] });
await Promise.all(backgroundWork);
const note = JSON.parse(requests.find((item) => item.path === `/contacts/${contactId}/notes`).options.body);
assert.match(note.body, /utm_source: facebook/);
assert.match(note.body, /contact_consent: Captured/);

const kitchenLead = await post('/api/lead', { ...validLead, projectScope: 'Kitchen Remodel', turnstileToken: 'valid-test-token' });
assert.equal(kitchenLead.status, 200);
const kitchenResult = await kitchenLead.json();
const kitchenUpsert = JSON.parse(requests.filter((item) => item.path === '/contacts/upsert').at(-1).options.body);
assert.equal(kitchenUpsert.customFields[0].fieldValue, 'Kitchen Remodel');

const availability = await bookingWorker.fetch(new Request(`${origin}/api/availability?year=${new Date().getUTCFullYear()}&month=${new Date().getUTCMonth() + 1}`), env);
assert.equal(availability.status, 200);
assert.ok((await availability.json()).days[dateKey]);

const forged = await post('/api/appointment', { session: `${leadResult.session}x`, slot });
assert.equal(forged.status, 401);
assert.equal(requests.filter((item) => item.path === `/contacts/${contactId}/tags` &&
  JSON.parse(item.options.body).tags.includes('appointment requested')).length, 0);

appointmentShouldFail = true;
const failedAppointment = await post('/api/appointment', { session: kitchenResult.session, slot });
assert.equal(failedAppointment.status, 502);
assert.equal(requests.filter((item) => item.path === `/contacts/${contactId}/tags` &&
  JSON.parse(item.options.body).tags.includes('appointment requested')).length, 0);
appointmentShouldFail = false;

const appointment = await post('/api/appointment', { session: kitchenResult.session, slot });
assert.equal(appointment.status, 200);
assert.equal((await appointment.json()).appointmentId, 'test-appointment-id');
const submitted = JSON.parse(requests.find((item) => item.path === '/calendars/events/appointments').options.body);
assert.equal(submitted.contactId, contactId);
assert.equal(submitted.ignoreFreeSlotValidation, false);
assert.equal(submitted.appointmentStatus, 'new');
assert.equal(submitted.title, 'Kitchen Remodel Consultation - Test Person');
assert.equal(submitted.description, 'Project scope: Kitchen Remodel');
const bookingTagRequest = requests.find((item) => item.path === `/contacts/${contactId}/tags` &&
  JSON.parse(item.options.body).tags.includes('appointment requested'));
assert.deepEqual(JSON.parse(bookingTagRequest.options.body), { tags: ['appointment requested'] });
assert.ok(requests.indexOf(bookingTagRequest) > requests.findLastIndex((item) => item.path === '/calendars/events/appointments'));

console.log('Booking API mock flow passed');
