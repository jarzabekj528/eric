# Say When Contracting booking funnel

Lightweight three-page funnel hosted on Cloudflare Pages at `booking.saywhencontracting.com`.

## Pages

- `/` — opt-in quiz
- `/booking/` — live GHL calendar availability and booking
- `/thank-you/` — confirmation, owner video, project carousel, and visit expectations

## Integrations

- The native quiz calls `/api/lead`, which validates the form and upserts the contact in GHL.
- After the contact is accepted, the lead route adds the `booking-form-submitted` contact tag. Set the GHL persistence workflow trigger to **Contact Tag Added** for that tag, then retain its five-minute wait.
- Cloudflare Turnstile checks the final form submission before any contact is created. The private verification key is stored as the encrypted Pages secret `TURNSTILE_SECRET`.
- `/api/availability` reads open slots from the GHL calendar. `/api/appointment` rechecks the selected slot and creates the visit.
- Only after GHL confirms an appointment does the booking route add the `appointment requested` contact tag. The workflow's post-wait branch should check for that tag and text only contacts without it. If GHL rejects the tag after creating an appointment, the booking still returns success rather than inviting a duplicate booking; check Worker logs for the tag error.
- The GHL private integration token is stored as the encrypted Cloudflare Pages secret `GHL_TOKEN` and is never sent to the browser.
- Meta Pixel ID `915999720840147` fires `PageView` on each page, `Lead` on the booking page after the contact is accepted by GHL, and the standard `Schedule` event on the thank-you page after GHL creates an appointment.
- The contact step requires affirmative call/text consent and links to `/privacy/`. The worker rejects requests without consent and records the consent copy and timestamp in a GHL contact note.
- Project scope is saved in the existing GHL custom field. Address, city, ZIP, name, phone and email use GHL's standard contact fields. Facebook/Instagram UTM sources or `fbclid` set the GHL contact source to `Facebook Ads`; otherwise it is `Website`, matching CloseRate's source mappings. UTM parameters and click IDs are also saved to a contact note when available.
- The owner video is a compressed, self-hosted MP4 with a lightweight poster image, deferred loading, and English captions. The recording mentions a bathroom specifically, so replace it with a generic version before using it for kitchen leads. Meta Conversions API and other analytics are not configured.
- The opt-in and booking pages inline their CSS to avoid a render-blocking stylesheet request. When changing shared styles, update both inline copies and `assets/styles-v2.css` for the thank-you page.
- The mobile hero and logo are compressed, versioned files. On opt-in, Meta PageView is queued immediately while the large Pixel library waits until the hero paints, the visitor interacts, or a three-second safety timeout. On booking and thank-you the Pixel loads immediately to protect the Lead and Schedule events.
- The thank-you gallery loads each optimized image only when its slide is about to be viewed. The video file still uses `preload="none"`.

## Local preview

For a static visual preview, run a static server from this directory, for example:

```sh
npx serve . -l 4173
```

Then open `http://localhost:4173/`. GHL API routes require a Pages Functions runtime and the `GHL_TOKEN` secret.

## Deployment

The `_worker.js` file is deployed with the static assets. Deploy from this directory with Wrangler:

```sh
npx wrangler pages deploy . --project-name say-when-booking
```

The Cloudflare zone may cache assets even after a deployment and has served mixed old/new assets during rollout. Publish a new physical asset filename first and wait for it to appear on the custom domain before deploying HTML that references it. A request for a not-yet-propagated asset can cache the HTML fallback at that URL for days. Query-string-only cache busting was not reliable on the custom domain.

Run `node ../scripts/test-booking-worker.mjs` from this directory to verify the API flow with mocked GHL responses. Do not put GHL tokens into source files or browser code.
