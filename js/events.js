/*
 * IEEE Arcade – public events data (events.html, hub, dashboard)
 * --------------------------------------------------------------
 * Needs js/config.js. Reads only PUBLISHED events with the public anon key
 * (the database rules hide drafts from the public). Dates are formatted by
 * js/events-format.js.
 *
 *   IEEEEvents.fetchUpcoming(limit) -> Promise<{ ok: true, events: [...] } | { ok: false }>
 *     events that haven't ended yet (so an event happening right now stays visible)
 *   IEEEEvents.CHAPTERS             -> { SB: { name, logo }, CS: …, CIS: …, RAS: …, WIE: … }
 *   IEEEEvents.isSafeUrl(url)       -> true for https:// links only
 */
(function () {
  "use strict";

  var config = window.ARCADE_CONFIG || {};

  var CHAPTERS = {
    SB:  { name: "IEEE ISIMA SB", logo: "assets/img/sb-logo-white.png" },
    CS:  { name: "Computer Society", logo: "assets/img/chapters/cs.png" },
    CIS: { name: "Computational Intelligence", logo: "assets/img/chapters/cis.png" },
    RAS: { name: "Robotics & Automation", logo: "assets/img/chapters/ras.png" },
    WIE: { name: "Women in Engineering", logo: "assets/img/chapters/wie.png" }
  };

  function isSafeUrl(url) {
    return typeof url === "string" && /^https:\/\/[^\s]+$/i.test(url);
  }

  function fetchUpcoming(limit) {
    var base = String(config.SUPABASE_URL || "").replace(/\/+$/, "");
    var key = config.SUPABASE_ANON_KEY;
    if (!/^https:\/\//.test(base) || !key) return Promise.resolve({ ok: false });

    // Not ended yet: ends_at >= now, or (no end time and starts_at >= now)
    var now = encodeURIComponent(new Date().toISOString());
    var url = base + "/rest/v1/events?select=*&published=eq.true" +
      "&or=(ends_at.gte." + now + ",and(ends_at.is.null,starts_at.gte." + now + "))" +
      "&order=starts_at.asc&limit=" + (limit || 100);
    try {
      return fetch(url, { headers: { apikey: key, Authorization: "Bearer " + key } })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) { return Array.isArray(data) ? { ok: true, events: data } : { ok: false }; })
        .catch(function () { return { ok: false }; });
    } catch (e) {
      return Promise.resolve({ ok: false });
    }
  }

  window.IEEEEvents = {
    CHAPTERS: CHAPTERS,
    isSafeUrl: isSafeUrl,
    fetchUpcoming: fetchUpcoming
  };
})();
