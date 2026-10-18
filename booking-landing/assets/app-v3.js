(() => {
  const quiz = document.querySelector('#remodel-quiz');
  if (quiz) {
    const steps = [...quiz.querySelectorAll('.quiz-step')];
    const next = quiz.querySelector('.quiz-card__next');
    const back = quiz.querySelector('.quiz-card__back');
    const count = quiz.querySelector('.quiz-card__count strong');
    const buttonLabel = next.querySelector('.button-label');
    const feedback = quiz.querySelector('#quiz-feedback');
    const turnstileSitekey = '0x4AAAAAAFAZUXYFEEOqjRoK';
    let turnstileLoad;
    let turnstileWidget;
    let challengeResolve;
    let challengeReject;
    let current = 1;

    const loadTurnstile = () => {
      if (turnstileLoad) return turnstileLoad;
      turnstileLoad = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.onload = () => {
          try {
            turnstileWidget = window.turnstile.render('#turnstile-widget', {
              sitekey: turnstileSitekey,
              appearance: 'interaction-only',
              execution: 'execute',
              size: 'flexible',
              callback: (token) => challengeResolve?.(token),
              'error-callback': () => challengeReject?.(new Error('Security check failed. Please try again.')),
              'expired-callback': () => challengeReject?.(new Error('Security check expired. Please try again.')),
            });
            resolve();
          } catch (failure) { turnstileLoad = null; reject(failure); }
        };
        script.onerror = () => {
          script.remove();
          turnstileLoad = null;
          reject(new Error('Could not load the security check. Please try again.'));
        };
        document.head.append(script);
      });
      return turnstileLoad;
    };

    const getTurnstileToken = async () => {
      await loadTurnstile();
      return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Security check timed out. Please try again.')), 120000);
        challengeResolve = (token) => { window.clearTimeout(timeout); resolve(token); };
        challengeReject = (failure) => { window.clearTimeout(timeout); reject(failure); };
        window.turnstile.execute(turnstileWidget);
      });
    };

    const error = (message) => {
      feedback.textContent = message;
      feedback.hidden = !message;
    };

    const showStep = (step) => {
      error('');
      current = step;
      steps.forEach((item) => {
        const active = Number(item.dataset.step) === current;
        item.hidden = !active;
        item.classList.toggle('is-active', active);
      });
      count.textContent = String(current);
      back.hidden = current === 1;
      buttonLabel.textContent = current === steps.length ? 'See times' : 'Next';
      next.querySelector('[aria-hidden="true"]').textContent = '→';
      if (current === steps.length) loadTurnstile().catch(() => {});
      const firstField = steps[current - 1].querySelector('input');
      if (current > 1 && firstField) firstField.focus({ preventScroll: true });
    };

    const validateCurrent = () => {
      const step = steps[current - 1];
      const fields = [...step.querySelectorAll('input')];
      fields.forEach((field) => field.classList.remove('is-invalid'));

      if (current === 1) {
        const selected = step.querySelector('input[type="radio"]:checked');
        if (!selected) {
          error('Choose the type of project to continue.');
          return false;
        }
      }

      const invalid = fields.find((field) => {
        if (field.required && (field.type === 'checkbox' || field.type === 'radio') && !field.checked) return true;
        if (field.required && !field.value.trim()) return true;
        if (field.name === 'postal_code' && !/^\d{5}$/.test(field.value.trim())) return true;
        if (field.name === 'phone' && !/^(1)?\d{10}$/.test(field.value.replace(/\D/g, ''))) return true;
        if (field.name === 'email' && field.value.trim() && !field.validity.valid) return true;
        return false;
      });
      if (invalid) {
        invalid.classList.add('is-invalid');
        invalid.focus();
        error(invalid.name === 'postal_code' ? 'Enter a 5-digit ZIP code.' :
          invalid.name === 'phone' ? 'Enter a 10-digit US phone number.' :
          invalid.name === 'email' ? 'Enter a valid email address.' :
          invalid.name === 'contact_consent' ? 'Please agree to the call and text consent to continue.' :
          'Complete this field to continue.');
        return false;
      }
      error('');
      return true;
    };

    const advance = async () => {
      if (!validateCurrent()) return;
      if (current < steps.length) {
        showStep(current + 1);
        return;
      }
      next.disabled = true;
      buttonLabel.textContent = 'Sending';
      try {
        const turnstileToken = await getTurnstileToken();
        const fields = new FormData(quiz);
        const params = new URLSearchParams(window.location.search);
        const response = await fetch('/api/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectScope: fields.get('project_scope'),
            address: fields.get('address'),
            city: fields.get('city'),
            postalCode: fields.get('postal_code'),
            name: fields.get('name'),
            phone: fields.get('phone'),
            email: fields.get('email'),
            contactConsent: fields.get('contact_consent') === 'yes',
            website: fields.get('website'),
            turnstileToken,
            attribution: {
              utmSource: params.get('utm_source'),
              utmMedium: params.get('utm_medium'),
              utmCampaign: params.get('utm_campaign'),
              utmContent: params.get('utm_content'),
              utmTerm: params.get('utm_term'),
              fbclid: params.get('fbclid'),
              gclid: params.get('gclid'),
              referrer: document.referrer,
            },
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.session) throw new Error(result.error || 'Please try again.');
        sessionStorage.setItem('booking-session', result.session);
        sessionStorage.setItem('booking-lead-event', result.eventId);
        window.location.assign('/booking/');
      } catch (failure) {
        if (turnstileWidget !== undefined) window.turnstile?.reset(turnstileWidget);
        challengeResolve = null;
        challengeReject = null;
        error(failure.message || 'We could not send your details. Please try again.');
        next.disabled = false;
        buttonLabel.textContent = 'See times';
      }
    };
    back.addEventListener('click', () => showStep(Math.max(1, current - 1)));
    quiz.addEventListener('submit', (event) => {
      event.preventDefault();
      advance();
    });
  }

  const calendarGrid = document.querySelector('[data-calendar-grid]');
  if (calendarGrid) {
    const heading = document.querySelector('[data-calendar-heading]');
    const times = document.querySelector('[data-time-slots]');
    const book = document.querySelector('[data-book-appointment]');
    const feedback = document.querySelector('.booking-feedback');
    const prev = document.querySelector('[data-calendar-prev]');
    const next = document.querySelector('[data-calendar-next]');
    const today = new Date();
    const firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    let cursor = new Date(firstMonth);
    let available = {};
    let selectedSlot = '';
    let requestNumber = 0;

    const message = (value) => {
      feedback.textContent = value;
      feedback.hidden = !value;
    };

    const emptyTimes = (value) => {
      times.replaceChildren();
      const paragraph = document.createElement('p');
      paragraph.textContent = value;
      times.append(paragraph);
      selectedSlot = '';
      book.hidden = true;
    };

    const showTimes = (dateKey) => {
      message('');
      emptyTimes('No times are available for this date.');
      const slots = available[dateKey] || [];
      if (!slots.length) return;
      times.replaceChildren();
      slots.forEach((slot) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'time-slot';
        button.setAttribute('aria-pressed', 'false');
        button.textContent = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
        }).format(new Date(slot));
        button.addEventListener('click', () => {
          times.querySelectorAll('.is-selected').forEach((item) => {
            item.classList.remove('is-selected');
            item.setAttribute('aria-pressed', 'false');
          });
          button.classList.add('is-selected');
          button.setAttribute('aria-pressed', 'true');
          selectedSlot = slot;
          book.hidden = false;
        });
        times.append(button);
      });
    };

    const renderCalendar = () => {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const days = new Date(year, month + 1, 0).getDate();
      heading.textContent = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      prev.disabled = cursor <= firstMonth;
      next.disabled = cursor >= new Date(firstMonth.getFullYear(), firstMonth.getMonth() + 5, 1);
      calendarGrid.replaceChildren();

      for (let blank = 0; blank < firstDay; blank += 1) {
        const spacer = document.createElement('span');
        spacer.className = 'calendar-day';
        calendarGrid.append(spacer);
      }

      for (let day = 1; day <= days; day += 1) {
        const date = new Date(year, month, day);
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const button = document.createElement('button');
        const isAvailable = (available[dateKey] || []).length > 0;
        button.type = 'button';
        button.className = `calendar-day${isAvailable ? ' is-available' : ''}`;
        button.textContent = String(day);
        button.disabled = !isAvailable;
        button.setAttribute('aria-label', date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
        if (isAvailable) {
          button.addEventListener('click', () => {
            calendarGrid.querySelectorAll('.is-selected').forEach((item) => item.classList.remove('is-selected'));
            button.classList.add('is-selected');
            showTimes(dateKey);
          });
        }
        calendarGrid.append(button);
      }
    };

    const loadCalendar = async () => {
      const currentRequest = ++requestNumber;
      available = {};
      emptyTimes('Loading available dates…');
      renderCalendar();
      try {
        const params = new URLSearchParams({ year: String(cursor.getFullYear()), month: String(cursor.getMonth() + 1) });
        const response = await fetch(`/api/availability?${params}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load available dates.');
        if (currentRequest !== requestNumber) return;
        available = result.days || {};
        renderCalendar();
        emptyTimes(Object.values(available).some((slots) => slots.length) ?
          'Select a date to see available times.' : 'No openings this month. Try the next month.');
      } catch (failure) {
        if (currentRequest === requestNumber) emptyTimes(failure.message || 'Could not load available dates.');
      }
    };

    prev.addEventListener('click', () => {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
      loadCalendar();
    });
    next.addEventListener('click', () => {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      loadCalendar();
    });

    book.addEventListener('click', async () => {
      if (!selectedSlot) return;
      book.disabled = true;
      book.textContent = 'Booking…';
      message('');
      try {
        const response = await fetch('/api/appointment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session: sessionStorage.getItem('booking-session'), slot: selectedSlot }),
        });
        const result = await response.json();
        if (!response.ok || !result.appointmentId) throw new Error(result.error || 'Could not book your visit.');
        sessionStorage.removeItem('booking-session');
        sessionStorage.setItem('booking-appointment-event', result.eventId);
        window.location.assign('/thank-you/');
      } catch (failure) {
        message(failure.message || 'Could not book your visit. Please try again.');
        book.disabled = false;
        book.textContent = 'Book this visit →';
        if (/taken/i.test(failure.message || '')) loadCalendar();
      }
    });

    if (!sessionStorage.getItem('booking-session')) {
      document.querySelector('.calendar-card').hidden = true;
      document.querySelector('.booking-gate').hidden = false;
    } else {
      loadCalendar();
    }
  }

  const carousel = document.querySelector('[data-carousel]');
  if (carousel) {
    const track = carousel.querySelector('[data-carousel-track]');
    const slides = [...track.children];
    const dotsWrap = carousel.querySelector('[data-carousel-dots]');
    let index = 0;
    let requestNumber = 0;

    const loadSlide = (slideIndex) => {
      const image = slides[slideIndex].querySelector('img[data-src]');
      if (!image) return Promise.resolve();
      image.src = image.dataset.src;
      delete image.dataset.src;
      return image.decode ? image.decode().catch(() => {}) : Promise.resolve();
    };

    const activate = (slideIndex) => {
      index = slideIndex;
      track.style.transform = `translateX(${-100 * index}%)`;
      [...dotsWrap.children].forEach((dot, dotIndex) => {
        dot.classList.toggle('is-active', dotIndex === index);
        dot.setAttribute('aria-current', dotIndex === index ? 'true' : 'false');
      });
    };

    const show = async (nextIndex) => {
      const slideIndex = (nextIndex + slides.length) % slides.length;
      const currentRequest = ++requestNumber;
      await loadSlide(slideIndex);
      if (currentRequest === requestNumber) activate(slideIndex);
    };

    slides.forEach((_, dotIndex) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel__dot';
      dot.setAttribute('aria-label', `Show project ${dotIndex + 1}`);
      dot.addEventListener('click', () => show(dotIndex));
      dotsWrap.append(dot);
    });
    carousel.querySelector('[data-carousel-prev]').addEventListener('click', () => show(index - 1));
    carousel.querySelector('[data-carousel-next]').addEventListener('click', () => show(index + 1));
    activate(0);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        loadSlide(index);
        observer.disconnect();
      }, { rootMargin: '100px' });
      observer.observe(carousel);
    } else {
      loadSlide(0);
    }
  }

})();
