
  /* ── Mobile menu toggle ── */
  (function () {
    var toggle = document.querySelector('.nav__toggle');
    var menu = document.getElementById('mobile-menu');
    if (toggle && menu) {
      toggle.addEventListener('click', function () {
        var open = document.body.classList.toggle('menu-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      });
      // close menu when a link is tapped
      menu.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          document.body.classList.remove('menu-open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.setAttribute('aria-label', 'Open menu');
        });
      });
    }
  })();

  /* ── Project Starter quiz ── */
  (function () {
    var form = document.getElementById('estimate-form');
    if (!form) return;

    var steps = form.querySelectorAll('.quiz-step');
    var backBtn = form.querySelector('.quiz__back');
    var stepNum = document.getElementById('quiz-step-num');
    var dots = form.querySelectorAll('.quiz__dot');
    var projectInput = document.getElementById('quiz-project-type');
    var current = 1;

    function showStep(n) {
      current = n;
      steps.forEach(function (step) {
        var num = parseInt(step.getAttribute('data-step'), 10);
        step.hidden = num !== n;
        step.classList.toggle('is-active', num === n);
      });
      if (stepNum) stepNum.textContent = String(n);
      dots.forEach(function (dot, i) {
        dot.classList.toggle('is-active', i < n);
        dot.classList.toggle('is-current', i === n - 1);
      });
      if (backBtn) backBtn.hidden = n === 1;
      if (n > 1) {
        var active = form.querySelector('.quiz-step[data-step="' + n + '"]');
        var focusEl = active && active.querySelector('input, button.quiz__next, .form__submit');
        if (focusEl) focusEl.focus();
      }
    }

    var otherWrap = document.getElementById('quiz-other');
    var otherInput = document.getElementById('f-other');

    form.querySelectorAll('.quiz__choice').forEach(function (btn) {
      btn.addEventListener('click', function () {
        form.querySelectorAll('.quiz__choice').forEach(function (choice) {
          choice.classList.remove('is-selected');
        });
        btn.classList.add('is-selected');
        var value = btn.getAttribute('data-value') || '';
        if (projectInput) projectInput.value = value;

        if (value === 'Other') {
          if (otherWrap) {
            otherWrap.hidden = false;
            window.setTimeout(function () { if (otherInput) otherInput.focus(); }, 180);
          }
          if (otherInput) otherInput.required = true;
          return;
        }

        if (otherWrap) otherWrap.hidden = true;
        if (otherInput) { otherInput.required = false; otherInput.value = ''; }
        window.setTimeout(function () { showStep(2); }, 180);
      });
    });

    var zipNextBtn = form.querySelector('.quiz-step[data-step="2"] .quiz__next');
    if (zipNextBtn) {
      zipNextBtn.addEventListener('click', function () {
        var zip = form.querySelector('#f-zip');
        if (zip && zip.checkValidity()) showStep(3);
        else if (zip) zip.reportValidity();
      });
    }

    var otherNextBtn = form.querySelector('.quiz__other-next');
    if (otherNextBtn) {
      otherNextBtn.addEventListener('click', function () {
        if (otherInput && otherInput.checkValidity()) showStep(2);
        else if (otherInput) otherInput.reportValidity();
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', function () {
        if (current > 1) showStep(current - 1);
      });
    }

    var zipInput = form.querySelector('#f-zip');
    if (zipInput) {
      zipInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (zipInput.checkValidity()) showStep(3);
          else zipInput.reportValidity();
        }
      });
    }

    if (otherInput) {
      otherInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (otherInput.checkValidity()) showStep(2);
          else otherInput.reportValidity();
        }
      });
    }

    // Reveal + prefill the GHL booking calendar once the lead has submitted the form.
    function revealCalendar() {
      var schedule = document.getElementById('schedule');
      if (!schedule) return;
      schedule.hidden = false;
      if (!document.getElementById('booking-embed-script')) {
        var embed = document.createElement('script');
        embed.id = 'booking-embed-script';
        embed.src = 'https://link.msgsndr.com/js/form_embed.js';
        embed.async = true;
        document.body.appendChild(embed);
      }
      var frame = document.getElementById('CMZB4BRAukTYZCgDlWkY_1783527958611');
      if (frame) {
        var val = function (id) {
          var el = form.querySelector(id);
          return el && el.value ? el.value.trim() : '';
        };
        var nameParts = val('#f-name').split(/\s+/);
        var params = [];
        var first = nameParts.shift() || '';
        var last = nameParts.join(' ');
        if (first) params.push('first_name=' + encodeURIComponent(first));
        if (last) params.push('last_name=' + encodeURIComponent(last));
        var phone = val('#f-phone');
        var email = val('#f-email');
        if (phone) params.push('phone=' + encodeURIComponent(phone));
        if (email) params.push('email=' + encodeURIComponent(email));
        var base = 'https://api.leadconnectorhq.com/widget/booking/CMZB4BRAukTYZCgDlWkY';
        frame.src = base + (params.length ? '?' + params.join('&') : '');
      }
    }

    form.noValidate = true;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (current < 3) {
        var activeStep = form.querySelector('.quiz-step[data-step="' + current + '"]');
        var next = activeStep && activeStep.querySelector('.quiz__next, .quiz__other-next');
        if (next) next.click();
        return;
      }
      var invalid = Array.from(form.querySelectorAll('input')).find(function (input) { return !input.checkValidity(); });
      if (invalid) {
        var invalidStep = invalid.closest('.quiz-step');
        if (invalidStep) showStep(Number(invalidStep.dataset.step));
        invalid.reportValidity();
        return;
      }
      if (!projectInput || !projectInput.value) {
        showStep(1);
        return;
      }
      var btn = form.querySelector('.form__submit');
      var original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      form.classList.remove('has-error');
      fetch(form.getAttribute('action'), {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new FormData(form)
      })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok && data.ok, data: data }; }); })
      .then(function (result) {
        btn.disabled = false;
        btn.textContent = original;
        if (result.ok) {
          form.classList.add('is-sent');
          revealCalendar();
          // Send the lead straight to the booking step, not the thank-you message.
          var scheduleEl = document.getElementById('schedule');
          window.requestAnimationFrame(function () {
            (scheduleEl || form).scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        } else {
          form.classList.add('has-error');
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = original;
        form.classList.add('has-error');
      });
    });
  })();
