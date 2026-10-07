/*
 * IEEE Arcade – event reminders sign-up (optional, with clear consent)
 * -------------------------------------------------------------------
 * Needs js/config.js (and js/arcade.js if the nickname should be sent).
 *
 *   IEEESubscribe.mount(element, { onDone })   builds the form inside element
 *   IEEESubscribe.subscribe(email, nickname)   -> Promise<{ ok } | { ok: false, error }>
 *   IEEESubscribe.unsubscribe(email)           -> Promise<{ ok } | { ok: false, error }>
 *   IEEESubscribe.isValidEmail(email)
 *
 * Privacy: the email is only sent to the Supabase subscribe_email() function.
 * It is never stored on the phone (only a "subscribed" flag) and never logged.
 */
(function () {
  "use strict";

  var config = window.ARCADE_CONFIG || {};
  var KEY_SUBSCRIBED = "ieeeArcade.remindersSubscribed";
  var KEY_DISMISSED = "ieeeArcade.remindersDismissed";
  var CONSENT_TEXT = "I agree that IEEE ISIMA SB may email me reminders about its upcoming events. I can unsubscribe at any time.";
  var MESSAGES = {
    done: "You're in! We'll remind you about upcoming events.",
    invalid: "Please enter a valid email address.",
    consent: "Please tick the box to agree to receive reminders.",
    network: "No connection. Check your Wi-Fi and try again.",
    other: "Something went wrong. Please try again."
  };
  var counter = 0;

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim()) && String(email).length <= 254;
  }

  function flag(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key) === "1";
      window.localStorage.setItem(key, "1");
    } catch (e) { /* storage blocked: ignore */ }
    return false;
  }

  function rpc(name, body) {
    var base = String(config.SUPABASE_URL || "").replace(/\/+$/, "");
    var key = config.SUPABASE_ANON_KEY;
    if (!/^https:\/\//.test(base) || !key) return Promise.resolve({ ok: false, status: 0 });
    try {
      return fetch(base + "/rest/v1/rpc/" + name, {
        method: "POST",
        headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
          return { ok: res.ok, status: res.status, message: data && data.message };
        });
      }).catch(function () { return { ok: false, status: 0 }; });
    } catch (e) {
      return Promise.resolve({ ok: false, status: 0 });
    }
  }

  function toResult(r) {
    if (r.ok) return { ok: true };
    if (r.message === "invalid_email") return { ok: false, error: MESSAGES.invalid };
    return { ok: false, error: r.status === 0 ? MESSAGES.network : MESSAGES.other };
  }

  function currentNickname() {
    try { return window.IEEEArcade ? window.IEEEArcade.getNickname() || null : null; } catch (e) { return null; }
  }

  function subscribe(email, nickname) {
    email = String(email || "").trim();
    if (!isValidEmail(email)) return Promise.resolve({ ok: false, error: MESSAGES.invalid });
    return rpc("subscribe_email", { p_email: email, p_nickname: nickname || null }).then(function (r) {
      var result = toResult(r);
      if (result.ok) flag(KEY_SUBSCRIBED, true);
      return result;
    });
  }

  function unsubscribe(email) {
    email = String(email || "").trim();
    if (!isValidEmail(email)) return Promise.resolve({ ok: false, error: MESSAGES.invalid });
    return rpc("unsubscribe_email", { p_email: email }).then(toResult);
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Consent checkbox + label (also used on the account creation screen)
  function consentField(id) {
    var wrap = el("label", { "class": "consent", "for": id });
    var box = el("input", { type: "checkbox", id: id });
    wrap.appendChild(box);
    wrap.appendChild(el("span", {}, CONSENT_TEXT));
    return { wrap: wrap, box: box };
  }

  function mount(container, options) {
    if (!container) return;
    options = options || {};
    var n = ++counter;
    container.innerHTML = "";

    var form = el("form", { "class": "subscribe-form", novalidate: "" });
    form.appendChild(el("label", { "for": "sub-email-" + n }, "Your email"));
    var input = el("input", { type: "email", id: "sub-email-" + n, autocomplete: "email", inputmode: "email",
      placeholder: "you@example.com", maxlength: "254", autocapitalize: "off", spellcheck: "false" });
    form.appendChild(input);
    var consent = consentField("sub-consent-" + n);
    form.appendChild(consent.wrap);
    var msg = el("p", { "class": "subscribe-msg", role: "status", "aria-live": "polite" });
    msg.hidden = true;
    form.appendChild(msg);
    var btn = el("button", { type: "submit", "class": "btn btn-primary btn-block" }, "Remind me");
    form.appendChild(btn);
    container.appendChild(form);

    function show(text, ok) {
      msg.textContent = text;
      msg.className = "subscribe-msg " + (ok ? "ok" : "error");
      msg.hidden = false;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!isValidEmail(input.value)) { show(MESSAGES.invalid, false); input.focus(); return; }
      if (!consent.box.checked) { show(MESSAGES.consent, false); consent.box.focus(); return; }
      btn.disabled = true;
      btn.textContent = "Saving…";
      subscribe(input.value, currentNickname()).then(function (r) {
        btn.disabled = false;
        btn.textContent = "Remind me";
        if (r.ok) {
          show(MESSAGES.done, true);
          input.value = "";
          consent.box.checked = false;
          if (options.onDone) options.onDone();
        } else {
          show(r.error, false);
        }
      });
    });
  }

  window.IEEESubscribe = {
    CONSENT_TEXT: CONSENT_TEXT,
    MESSAGES: MESSAGES,
    KEY_SUBSCRIBED: KEY_SUBSCRIBED,
    KEY_DISMISSED: KEY_DISMISSED,
    isValidEmail: isValidEmail,
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    mount: mount,
    consentField: consentField,
    isSubscribed: function () { return flag(KEY_SUBSCRIBED); },
    isDismissed: function () { return flag(KEY_DISMISSED); },
    dismiss: function () { flag(KEY_DISMISSED, true); }
  };
})();
