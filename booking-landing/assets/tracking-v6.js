(() => {
  const PIXEL_ID = '915999720840147';
  if (!window.fbq) {
    const fbq = function (...args) {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, args);
      else fbq.queue.push(args);
    };
    window.fbq = fbq;
    window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    let pixelRequested = false;
    const requestPixel = () => {
      if (pixelRequested) return;
      pixelRequested = true;
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.append(script);
    };
    // Queue events immediately, but keep Meta's large script off the hero's
    // critical rendering path. Interaction or a short safety timeout wins.
    if (location.pathname === '/' || location.pathname === '/optin-page') {
      const afterHeroPaint = async () => {
        try { await document.querySelector('.funnel-hero__media img')?.decode(); } catch {}
        requestAnimationFrame(() => requestAnimationFrame(requestPixel));
      };
      if (document.readyState === 'complete') afterHeroPaint();
      else window.addEventListener('load', afterHeroPaint, { once: true });
      window.addEventListener('pointerdown', requestPixel, { once: true, passive: true });
      window.addEventListener('keydown', requestPixel, { once: true });
      window.setTimeout(requestPixel, 3000);
    } else {
      requestPixel();
    }
  }
  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');

  window.sayWhenTrack = (eventName, eventId) => {
    window.fbq('track', eventName, {}, eventId ? { eventID: eventId } : undefined);
  };

  if (location.pathname.startsWith('/booking')) {
    const eventId = sessionStorage.getItem('booking-lead-event');
    if (eventId) {
      sessionStorage.removeItem('booking-lead-event');
      window.sayWhenTrack('Lead', eventId);
    }
  }

  if (location.pathname.startsWith('/thank-you')) {
    const eventId = sessionStorage.getItem('booking-appointment-event');
    if (eventId) {
      sessionStorage.removeItem('booking-appointment-event');
      window.sayWhenTrack('Schedule', eventId);
    }
  }
})();
