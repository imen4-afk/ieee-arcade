/*
 * IEEE Arcade – event reminders (email + consent), used by the login flow
 * and by unsubscribe.html.
 * ----------------------------------------------------------------------
 * Needs js/config.js.
 *
 *   IEEESubscribe.subscribe(email, nickname) -> Promise<{ ok } | { ok: false, error }>
 *   IEEESubscribe.unsubscribe(email)         -> Promise<{ ok } | { ok: false, error }>
 *   IEEESubscribe.isValidEmail(email)
 *   IEEESubscribe.isSubscribed(nickname)     -> this nickname already subscribed on this phone
 *
 * Privacy: the email is only sent to the Supabase subscribe_email() function.
 * It is never stored on the phone (only "subscribed:{nickname}" = true) and never logged.
 */
(function () {
  "use strict";

  var config = window.ARCADE_CONFIG || {};
  var FLAG_PREFIX = "ieeeArcade.subscribed:";
  var MESSAGES = {
    invalid: "Please enter a valid email address.",
    network: "No connection. Check your Wi-Fi and try again.",
    other: "Something went wrong. Please try again."
  };

  function isValidEmail(email) {
    var s = String(email || "").trim();
    return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
  }

  function flagKey(nickname) { return FLAG_PREFIX + String(nickname || "").trim().toLowerCase(); }

  function isSubscribed(nickname) {
    if (!nickname) return false;
    try { return window.localStorage.getItem(flagKey(nickname)) === "true"; } catch (e) { return false; }
  }

  function markSubscribed(nickname) {
    try { window.localStorage.setItem(flagKey(nickname), "true"); } catch (e) { /* storage blocked: ignore */ }
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

  function subscribe(email, nickname) {
    email = String(email || "").trim();
    if (!isValidEmail(email)) return Promise.resolve({ ok: false, error: MESSAGES.invalid });
    return rpc("subscribe_email", { p_email: email, p_nickname: nickname || null }).then(function (r) {
      var result = toResult(r);
      if (result.ok && nickname) markSubscribed(nickname);
      return result;
    });
  }

  function unsubscribe(email) {
    email = String(email || "").trim();
    if (!isValidEmail(email)) return Promise.resolve({ ok: false, error: MESSAGES.invalid });
    return rpc("unsubscribe_email", { p_email: email }).then(toResult);
  }

  window.IEEESubscribe = {
    MESSAGES: MESSAGES,
    isValidEmail: isValidEmail,
    isSubscribed: isSubscribed,
    subscribe: subscribe,
    unsubscribe: unsubscribe
  };
})();
