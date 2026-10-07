/*
 * IEEE Arcade – events from data/events.json (edited by hand, no database)
 * ------------------------------------------------------------------------
 * Used by events.html, the hub and dashboard.html. Needs js/events-format.js.
 *
 *   IEEEEvents.loadUpcoming() -> Promise<{ ok: true, events: [...] } | { ok: false, error: "..." }>
 *     events whose end date is today or later (Tunis), sorted by start date
 *   IEEEEvents.CHAPTERS       -> { SB: { name, logo }, CS: …, CIS: …, RAS: …, WIE: … }
 *
 * See README.md ("Events") for the fields of data/events.json.
 */
(function () {
  "use strict";

  var DATA_URL = "data/events.json";
  var Format = window.IEEEEventFormat;

  var CHAPTERS = {
    SB:  { name: "IEEE ISIMA SB", logo: "assets/img/sb-logo-white.png" },
    CS:  { name: "Computer Society", logo: "assets/img/chapters/cs.png" },
    CIS: { name: "Computational Intelligence", logo: "assets/img/chapters/cis.png" },
    RAS: { name: "Robotics & Automation", logo: "assets/img/chapters/ras.png" },
    WIE: { name: "Women in Engineering", logo: "assets/img/chapters/wie.png" }
  };

  function text(value) { return typeof value === "string" ? value.trim() : ""; }

  // Checks one event from the JSON file. Returns a clean object, or null (with a warning) if unusable.
  function normalise(raw, index) {
    var where = "data/events.json: event #" + (index + 1);
    if (!raw || typeof raw !== "object") { console.warn(where + " is not an object, skipped."); return null; }
    var title = text(raw.title);
    var startDay = Format.dayFromString(raw.start);
    var endDay = text(raw.end) ? Format.dayFromString(raw.end) : startDay;
    if (!title) { console.warn(where + " has no title, skipped."); return null; }
    if (startDay === null) { console.warn(where + ' ("' + title + '") needs "start" as YYYY-MM-DD, skipped.'); return null; }
    if (endDay === null || endDay < startDay) {
      console.warn(where + ' ("' + title + '"): invalid "end", using the start date.');
      endDay = startDay;
    }
    var link = text(raw.link);
    if (link && !/^https:\/\/\S+$/i.test(link)) {
      console.warn(where + ' ("' + title + '"): "link" must start with https:// — link hidden.');
      link = "";
    }
    var chapter = text(raw.chapter).toUpperCase();
    return {
      title: title,
      startDay: startDay,
      endDay: endDay,
      time: text(raw.time),
      location: text(raw.location),
      chapter: CHAPTERS[chapter] ? chapter : "SB",
      description: text(raw.description),
      link: link
    };
  }

  function loadUpcoming() {
    var request;
    try {
      // "?v=…" skips the browser cache, so edits to the file show up immediately
      request = fetch(DATA_URL + "?v=" + Date.now(), { cache: "no-store" });
    } catch (e) {
      request = Promise.reject(e);
    }
    return request
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " while loading " + DATA_URL);
        return res.json(); // throws if the JSON is invalid
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.events)) throw new Error(DATA_URL + ' must contain { "events": [ ... ] }');
        var today = Format.today();
        var events = data.events
          .map(normalise)
          .filter(function (ev) { return ev && ev.endDay >= today; })
          .sort(function (a, b) { return a.startDay - b.startDay || a.endDay - b.endDay; });
        return { ok: true, events: events };
      })
      .catch(function (err) {
        console.error("Events could not be loaded:", err && err.message ? err.message : err);
        return { ok: false, error: String(err && err.message ? err.message : err) };
      });
  }

  window.IEEEEvents = {
    CHAPTERS: CHAPTERS,
    loadUpcoming: loadUpcoming
  };
})();
