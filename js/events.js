/*
 * IEEE Arcade – public events helper (events.html, hub, dashboard)
 * ----------------------------------------------------------------
 * Needs js/config.js. Reads only PUBLISHED events with the public anon key
 * (the database rules hide drafts from the public).
 *
 *   IEEEEvents.fetchUpcoming(limit)  -> Promise<{ ok: true, events: [...] } | { ok: false }>
 *   IEEEEvents.parts(date)           -> { year, month, day, weekday, hour, minute } in Africa/Tunis
 *   IEEEEvents.daysFromToday(date)   -> 0 today, 1 tomorrow, ... (Tunis calendar days)
 *   IEEEEvents.googleCalendarUrl(ev) -> "https://calendar.google.com/calendar/render?..."
 */
(function () {
  "use strict";

  var TZ = "Africa/Tunis";
  var config = window.ARCADE_CONFIG || {};

  var CHAPTERS = {
    SB:  { name: "IEEE ISIMA SB", logo: "assets/img/sb-logo-white.png" },
    CS:  { name: "Computer Society", logo: "assets/img/chapters/cs.png" },
    CIS: { name: "Computational Intelligence", logo: "assets/img/chapters/cis.png" },
    RAS: { name: "Robotics & Automation", logo: "assets/img/chapters/ras.png" },
    WIE: { name: "Women in Engineering", logo: "assets/img/chapters/wie.png" }
  };

  // ---------- Dates in Africa/Tunis ----------

  var partsFormatter = null;
  try {
    partsFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short"
    });
  } catch (e) { partsFormatter = null; }

  function parts(date) {
    var d = new Date(date);
    if (!partsFormatter) {
      return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), weekday: "" };
    }
    var out = {};
    partsFormatter.formatToParts(d).forEach(function (p) { out[p.type] = p.value; });
    return {
      year: Number(out.year), month: Number(out.month), day: Number(out.day),
      hour: Number(out.hour) % 24, minute: Number(out.minute), weekday: out.weekday
    };
  }

  function format(date, options) {
    try {
      options.timeZone = TZ;
      return new Intl.DateTimeFormat("en-GB", options).format(new Date(date));
    } catch (e) {
      return new Date(date).toDateString();
    }
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // "Monday 20 October", "14:00", "October 2026"
  function longDate(date) { return format(date, { weekday: "long", day: "numeric", month: "long" }); }
  function time(date) { var p = parts(date); return pad(p.hour) + ":" + pad(p.minute); }
  function monthLabel(date) { return format(date, { month: "long", year: "numeric" }); }
  function shortMonth(date) { return format(date, { month: "short" }); }
  function weekday(date) { return format(date, { weekday: "short" }); }

  // Tunis calendar day as a number of days since 1970 (to compare days)
  function dayNumber(date) {
    var p = parts(date);
    return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86400000);
  }

  function daysFromToday(date) {
    return dayNumber(date) - dayNumber(new Date());
  }

  function sameMonth(a, b) {
    var pa = parts(a), pb = parts(b);
    return pa.year === pb.year && pa.month === pb.month;
  }

  // Midnight today in Tunis, as an ISO string (UTC). Today's events stay visible all day.
  function startOfTodayISO() {
    var now = new Date();
    var p = parts(now);
    var minutesSinceMidnight = p.hour * 60 + p.minute;
    var start = new Date(now.getTime() - minutesSinceMidnight * 60000);
    start.setUTCSeconds(0, 0);
    return start.toISOString();
  }

  // ---------- Google Calendar link ----------

  function calendarStamp(date) {
    // YYYYMMDDTHHMMSSZ in UTC
    return new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  function googleCalendarUrl(ev) {
    var start = new Date(ev.starts_at);
    var end = ev.ends_at ? new Date(ev.ends_at) : new Date(start.getTime() + 60 * 60000); // 1 h by default
    var details = (ev.description || "");
    if (ev.register_url) details += (details ? "\n\n" : "") + "Register: " + ev.register_url;
    details += (details ? "\n\n" : "") + "IEEE ISIMA Student Branch";
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(ev.title || "IEEE ISIMA SB event") +
      "&dates=" + calendarStamp(start) + "/" + calendarStamp(end) +
      "&details=" + encodeURIComponent(details) +
      "&location=" + encodeURIComponent(ev.location || "") +
      "&ctz=" + encodeURIComponent(TZ);
  }

  function isSafeUrl(url) {
    return typeof url === "string" && /^https:\/\/[^\s]+$/i.test(url);
  }

  // ---------- Fetch (public, published events only) ----------

  function fetchUpcoming(limit) {
    var base = String(config.SUPABASE_URL || "").replace(/\/+$/, "");
    var key = config.SUPABASE_ANON_KEY;
    if (!/^https:\/\//.test(base) || !key) return Promise.resolve({ ok: false });

    var url = base + "/rest/v1/events?select=*&published=eq.true" +
      "&starts_at=gte." + encodeURIComponent(startOfTodayISO()) +
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
    TZ: TZ,
    CHAPTERS: CHAPTERS,
    parts: parts,
    longDate: longDate,
    time: time,
    monthLabel: monthLabel,
    shortMonth: shortMonth,
    weekday: weekday,
    daysFromToday: daysFromToday,
    sameMonth: sameMonth,
    googleCalendarUrl: googleCalendarUrl,
    isSafeUrl: isSafeUrl,
    fetchUpcoming: fetchUpcoming
  };
})();
