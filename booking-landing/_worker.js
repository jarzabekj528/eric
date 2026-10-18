const GHL_BASE = 'https://services.leadconnectorhq.com';
const LOCATION_ID = 'QS2WhwivER8LtYZ1oRfY';
const CALENDAR_ID = 'CMZB4BRAukTYZCgDlWkY';
const SCOPE_FIELD_ID = 'xvusVm25Sjd1vz9BUtY7';
const TIMEZONE = 'America/New_York';
const SLOT_DURATION_MS = 60 * 60 * 1000;
const FORM_SUBMITTED_TAG = 'booking-form-submitted';
const APPOINTMENT_REQUESTED_TAG = 'appointment requested';
const SCOPES = new Set([
  'Bathroom Remodel',
  'Kitchen Remodel',
  'Kitchen & Bathroom Remodel',
  'Something else',
  // Keep prior values valid for visitors who already opened the form.
  'Full Bathroom Remodel',
  'Shower or Tub Replacement',
  'Vanity & Sink Upgrade',
]);

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function clean(value, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function requestJson(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return null;
  if (Number(request.headers.get('content-length') || 0) > 8192) return null;
  const raw = await request.text();
  if (raw.length > 8192) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function ghl(env, path, options = {}) {
  if (!env.GHL_TOKEN) throw new Error('GHL token is not configured');
  const response = await fetch(`${GHL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.GHL_TOKEN}`,
      Version: 'v3',
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    console.error('GHL request failed', path.split('?')[0], response.status);
    throw new Error('GHL request failed');
  }
  return data;
}

async function addContactTag(env, contactId, tag) {
  return ghl(env, `/contacts/${contactId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tags: [tag] }),
  });
}

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(value) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function keyFor(env) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.GHL_TOKEN), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function signSession(env, contactId, projectScope) {
  const payload = encode(new TextEncoder().encode(JSON.stringify({
    contactId,
    projectScope,
    expires: Date.now() + 2 * 60 * 60 * 1000,
    nonce: crypto.randomUUID(),
  })));
  const signature = await crypto.subtle.sign('HMAC', await keyFor(env), new TextEncoder().encode(payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}

async function verifySession(env, token) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', await keyFor(env), new TextEncoder().encode(parts[0])));
    const supplied = decode(parts[1]);
    if (expected.length !== supplied.length) return null;
    let difference = 0;
    for (let i = 0; i < expected.length; i += 1) difference |= expected[i] ^ supplied[i];
    if (difference) return null;
    const payload = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if (payload.expires < Date.now() || !/^[a-zA-Z0-9]{10,40}$/.test(payload.contactId)) return null;
    return {
      contactId: payload.contactId,
      projectScope: SCOPES.has(payload.projectScope) ? payload.projectScope : '',
    };
  } catch { return null; }
}

async function freeSlots(env, startDate, endDate) {
  const query = new URLSearchParams({
    startDate: String(startDate),
    endDate: String(endDate),
    timezone: TIMEZONE,
  });
  return ghl(env, `/calendars/${CALENDAR_ID}/free-slots?${query}`);
}

async function verifyTurnstile(request, env, token) {
  if (!env.TURNSTILE_SECRET || typeof token !== 'string' || !token || token.length > 2048) return false;
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: env.TURNSTILE_SECRET,
      response: token,
      remoteip: request.headers.get('CF-Connecting-IP') || undefined,
    }),
  });
  if (!response.ok) throw new Error('Turnstile verification unavailable');
  const result = await response.json();
  return result.success === true && new Set([
    'booking.saywhencontracting.com',
    'say-when-booking.pages.dev',
  ]).has(result.hostname);
}

async function handleLead(request, env, context) {
  const body = await requestJson(request);
  if (!body || body.website) return respond({ error: 'Please check the form and try again.' }, 400);
  const scope = clean(body.projectScope, 80);
  const name = clean(body.name, 100).replace(/\s+/g, ' ');
  const address = clean(body.address, 160);
  const city = clean(body.city, 80);
  const postalCode = clean(body.postalCode, 12);
  const email = clean(body.email, 200).toLowerCase();
  const phoneDigits = clean(body.phone, 30).replace(/\D/g, '');
  const phone = phoneDigits.length === 10 ? `+1${phoneDigits}` : `+${phoneDigits}`;
  const contactConsent = body.contactConsent === true;

  if (!SCOPES.has(scope) || name.length < 2 || address.length < 4 || city.length < 2 ||
      !/^\d{5}$/.test(postalCode) || !/^\+1\d{10}$/.test(phone) ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || !contactConsent) {
    return respond({ error: 'Please complete your project and contact details.' }, 400);
  }
  if (!await verifyTurnstile(request, env, body.turnstileToken)) {
    return respond({ error: 'Security check failed. Please try again.' }, 403);
  }

  const attribution = body.attribution && typeof body.attribution === 'object' ? body.attribution : {};
  const utmSource = clean(attribution.utmSource, 80).toLowerCase();
  const leadSource = clean(attribution.fbclid, 300) || /^(facebook|instagram|meta|fb|ig)$/.test(utmSource)
    ? 'Facebook Ads' : 'Website';
  const contact = await ghl(env, '/contacts/upsert', {
    method: 'POST',
    body: JSON.stringify({
      locationId: LOCATION_ID,
      name,
      phone,
      ...(email ? { email } : {}),
      address1: address,
      city,
      postalCode,
      source: leadSource,
      customFields: [{ id: SCOPE_FIELD_ID, fieldValue: scope }],
    }),
  });
  const contactId = contact.contact?.id;
  if (!contactId) throw new Error('GHL did not return a contact ID');
  await addContactTag(env, contactId, FORM_SUBMITTED_TAG);
  const fields = [
    ['contact_consent', `Captured ${new Date().toISOString()}: customer agreed that Say When Contracting may call or text the submitted number about this remodeling request, including automated messages; consent is not a condition of purchase; message/data rates may apply; reply STOP to opt out.`],
    ['utm_source', attribution.utmSource],
    ['utm_medium', attribution.utmMedium],
    ['utm_campaign', attribution.utmCampaign],
    ['utm_content', attribution.utmContent],
    ['utm_term', attribution.utmTerm],
    ['fbclid', attribution.fbclid],
    ['gclid', attribution.gclid],
    ['referrer', attribution.referrer],
  ].map(([label, value]) => [label, clean(value, 300)]).filter(([, value]) => value);
  if (fields.length && context?.waitUntil) {
    context.waitUntil(ghl(env, `/contacts/${contactId}/notes`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Booking landing page consent and attribution',
        body: fields.map(([label, value]) => `${label}: ${value}`).join('\n'),
      }),
    }).catch(() => console.error('Could not save attribution note')));
  }
  return respond({
    session: await signSession(env, contactId, scope),
    eventId: crypto.randomUUID(),
  });
}

async function handleAvailability(url, env) {
  const year = Number(url.searchParams.get('year'));
  const month = Number(url.searchParams.get('month'));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return respond({ error: 'Invalid month.' }, 400);
  }
  const requested = year * 12 + month;
  const now = new Date();
  const current = now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;
  if (requested < current || requested > current + 5) return respond({ error: 'Month is outside the booking window.' }, 400);
  const start = Math.max(Date.now(), Date.UTC(year, month - 1, 1));
  const end = Date.UTC(year, month, 1) - 1;
  const slots = await freeSlots(env, start, end);
  const available = {};
  for (const [day, value] of Object.entries(slots)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Array.isArray(value?.slots)) {
      available[day] = value.slots.filter((slot) => Date.parse(slot) > Date.now());
    }
  }
  return respond({ days: available, timezone: TIMEZONE });
}

async function handleAppointment(request, env) {
  const body = await requestJson(request);
  const session = await verifySession(env, body?.session);
  if (!session) return respond({ error: 'Your booking session expired. Please complete the form again.' }, 401);
  const contactId = session.contactId;
  const slot = clean(body.slot, 60);
  const start = Date.parse(slot);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(slot) ||
      !Number.isFinite(start) || start < Date.now() || start > Date.now() + 180 * 86400000) {
    return respond({ error: 'Please choose an available time.' }, 400);
  }
  const availability = await freeSlots(env, start - 86400000, start + 86400000);
  const stillFree = Object.values(availability).some((day) =>
    Array.isArray(day?.slots) && day.slots.some((item) => Date.parse(item) === start));
  if (!stillFree) return respond({ error: 'That time was just taken. Please choose another opening.' }, 409);

  const contactData = await ghl(env, `/contacts/${contactId}`);
  const contact = contactData.contact;
  if (!contact || contact.locationId !== LOCATION_ID) return respond({ error: 'Please complete the form again.' }, 401);
  const address = [contact.address1, contact.city, contact.state, contact.postalCode].filter(Boolean).join(', ');
  const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() ||
    contact.name || contact.contactName || 'New lead';
  const projectTitle = session.projectScope === 'Kitchen Remodel' ? 'Kitchen Remodel Consultation' :
    session.projectScope === 'Kitchen & Bathroom Remodel' ? 'Kitchen & Bathroom Consultation' :
      session.projectScope && session.projectScope !== 'Something else' ? 'Bathroom Remodel Consultation' :
        'Remodeling Consultation';
  const appointment = await ghl(env, '/calendars/events/appointments', {
    method: 'POST',
    body: JSON.stringify({
      calendarId: CALENDAR_ID,
      locationId: LOCATION_ID,
      contactId,
      startTime: slot,
      endTime: new Date(start + SLOT_DURATION_MS).toISOString(),
      title: `${projectTitle} - ${contactName}`,
      ...(session.projectScope ? { description: `Project scope: ${session.projectScope}` } : {}),
      ...(address ? { address } : {}),
      appointmentStatus: 'new',
      toNotify: true,
      ignoreFreeSlotValidation: false,
    }),
  });
  if (!appointment.id) throw new Error('GHL did not return an appointment ID');
  try {
    await addContactTag(env, contactId, APPOINTMENT_REQUESTED_TAG);
  } catch {
    // The appointment exists; do not tell the visitor to retry and risk a duplicate booking.
    console.error('Appointment created but appointment requested tag failed', appointment.id);
  }
  return respond({ appointmentId: appointment.id, eventId: crypto.randomUUID() });
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      const response = await env.ASSETS.fetch(request);
      // Pages can serve the HTML fallback for an unknown asset. Never let a
      // cacheable HTML response masquerade as a script, image, or stylesheet.
      if (url.pathname.startsWith('/assets/') && response.headers.get('content-type')?.includes('text/html')) {
        return new Response('Asset not found', {
          status: 404,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      return response;
    }
    if (request.method === 'POST' && request.headers.get('origin') !== url.origin) {
      return respond({ error: 'Invalid request origin.' }, 403);
    }
    try {
      if (url.pathname === '/api/lead' && request.method === 'POST') return await handleLead(request, env, context);
      if (url.pathname === '/api/availability' && request.method === 'GET') return await handleAvailability(url, env);
      if (url.pathname === '/api/appointment' && request.method === 'POST') return await handleAppointment(request, env);
      return respond({ error: 'Not found.' }, 404);
    } catch (error) {
      console.error('Booking API error', url.pathname, error.message);
      return respond({ error: 'We could not complete that request right now. Please try again.' }, 502);
    }
  },
};
