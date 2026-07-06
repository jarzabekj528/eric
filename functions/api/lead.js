// Cloudflare Pages Function: receives the estimate form submission and
// upserts the lead into the client's GoHighLevel subaccount via the v2 API.
// Required env vars (set in Cloudflare Pages > Settings > Environment variables):
//   GHL_API_TOKEN            Private Integration token, scopes: contacts.write, locations/customFields.readonly
//   GHL_LOCATION_ID          Sub-account (location) id
// Optional env vars (only sent if the field exists in GHL and the id is set):
//   GHL_FIELD_ID_PROJECT_TYPE
//   GHL_FIELD_ID_ZIP
//   GHL_FIELD_ID_DETAILS
//   GHL_LEAD_TAG             Tag applied to the contact (defaults to "website-lead")

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try {
    const form = await request.formData();
    data = Object.fromEntries(form.entries());
  } catch (err) {
    return jsonResponse({ ok: false, error: 'invalid_form_data' }, 400);
  }

  // Honeypot: silently drop bot submissions without hitting the GHL API.
  if (data._honey) {
    console.log('Honeypot triggered, skipping GHL', { honeyValue: data._honey });
    return jsonResponse({ ok: true });
  }

  const fullName = (data['Name'] || '').trim();
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || fullName || 'Website';
  const lastName = nameParts.slice(1).join(' ');

  const customFields = buildCustomFields(data, env);

  const upsertBody = {
    locationId: env.GHL_LOCATION_ID,
    firstName: firstName,
    lastName: lastName,
    name: fullName || undefined,
    phone: data['Phone'] || undefined,
    email: data['Email'] || undefined,
    country: 'US',
    source: 'saywhencontracting.com — Estimate Form',
    customFields: customFields.length ? customFields : undefined,
  };

  try {
    const upsertRes = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
      method: 'POST',
      headers: ghlHeaders(env),
      body: JSON.stringify(upsertBody),
    });

    if (!upsertRes.ok) {
      console.error('GHL upsert failed', upsertRes.status, await upsertRes.text());
      return jsonResponse({ ok: false, error: 'ghl_upsert_failed' }, 502);
    }

    const upsertJson = await upsertRes.json();
    const contactId = upsertJson.contact && upsertJson.contact.id;

    if (contactId) {
      const tag = env.GHL_LEAD_TAG || 'website-lead';
      const tagRes = await fetch(`${GHL_API_BASE}/contacts/${contactId}/tags`, {
        method: 'POST',
        headers: ghlHeaders(env),
        body: JSON.stringify({ tags: [tag] }),
      });
      if (!tagRes.ok) {
        // Non-fatal: the contact was still created/updated in GHL.
        console.error('GHL add-tag failed', tagRes.status, await tagRes.text());
      }
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('GHL request threw', err);
    return jsonResponse({ ok: false, error: 'network_error' }, 502);
  }
}

function ghlHeaders(env) {
  return {
    'Authorization': `Bearer ${env.GHL_API_TOKEN}`,
    'Version': GHL_API_VERSION,
    'Content-Type': 'application/json',
  };
}

function buildCustomFields(data, env) {
  const fields = [];
  const map = [
    ['Project Type', env.GHL_FIELD_ID_PROJECT_TYPE],
    ['Zip Code', env.GHL_FIELD_ID_ZIP],
    ['Project Details', env.GHL_FIELD_ID_DETAILS],
  ];
  for (const [formKey, fieldId] of map) {
    if (data[formKey] && fieldId) {
      fields.push({ id: fieldId, field_value: data[formKey] });
    }
  }
  return fields;
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
