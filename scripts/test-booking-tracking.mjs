import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../booking-landing/assets/tracking-v6.js', import.meta.url), 'utf8');

async function checkPage(pathname, storedEvent, expectedEvent) {
  const resources = [];
  const listeners = new Map();
  const frames = [];
  const session = new Map(storedEvent ? [[storedEvent, 'event-123']] : []);
  const window = {
    addEventListener: (event, handler) => listeners.set(event, handler),
    setTimeout: () => 1,
  };
  const document = {
    readyState: 'loading',
    querySelector: () => ({ decode: async () => {} }),
    createElement: () => ({}),
    head: { append: (script) => resources.push(script.src) },
  };
  const sessionStorage = {
    getItem: (key) => session.get(key) || null,
    removeItem: (key) => session.delete(key),
  };

  runInNewContext(source, {
    window, document, sessionStorage, location: { pathname },
    requestAnimationFrame: (callback) => frames.push(callback),
  });

  const events = window.fbq.queue.filter((item) => item[0] === 'track');
  assert.deepEqual(Array.from(events, (item) => item[1]), expectedEvent ? ['PageView', expectedEvent] : ['PageView']);
  if (storedEvent) {
    assert.equal(events[1][3].eventID, 'event-123');
    assert.equal(session.has(storedEvent), false);
  }

  if (pathname !== '/') {
    assert.equal(resources.length, 1, 'Conversion tracking should load immediately');
  } else {
    assert.equal(resources.length, 0, 'The hero should get first rendering priority');
    listeners.get('load')();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.equal(resources.length, 1, 'Pixel should load after the hero paints');
  }
}

await checkPage('/', null, null);
await checkPage('/booking/', 'booking-lead-event', 'Lead');
await checkPage('/thank-you/', 'booking-appointment-event', 'Schedule');
console.log('Meta PageView, Lead, and Schedule tracking flow passed');
