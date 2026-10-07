/*
 * IEEE Arcade – event date formatting (one place for every page)
 * --------------------------------------------------------------
 * Used by events.html (cards), the hub ("Next: …") and dashboard.html ("Next event: …").
 * Events come from data/events.json (see js/events.js). Dates are plain calendar
 * days ("YYYY-MM-DD") in Tunis: they are compared day by day, never by UTC time.
 *
 *   IEEEEventFormat.dateBlock(ev)  -> { day: "30–31", month: "OCT", weekday: "Fri–Sat" }
 *   IEEEEventFormat.whenText(ev)   -> "Fri 30 – Sat 31 October · All day"
 *   IEEEEventFormat.shortText(ev)  -> one line for "Next event: …"
 *   IEEEEventFormat.label(ev)      -> "Happening now" / "Today" / "Tomorrow" / "This week" / ""
 *   IEEEEventFormat.googleCalendarUrl(ev)
 *
 * "ev" is a normalised event from IEEEEvents (startDay / endDay = day numbers).
 */
(function () {
  "use strict";

  var TZ = "Africa/Tunis";
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // ---------- Calendar days ----------
  // A "day number" = days since 1 Jan 1970 for a calendar date (no time zone involved).

  function dayFromString(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var date = new Date(Date.UTC(y, mo - 1, d));
    // reject impossible dates like 2026-02-31
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
    return Math.floor(date.getTime() / 86400000);
  }

  function dayParts(dayNum) {
    var d = new Date(dayNum * 86400000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() };
  }

  // Today's calendar day in Tunis
  function today() {
    try {
      var out = {};
      new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(new Date()).forEach(function (p) { out[p.type] = p.value; });
      return Math.floor(Date.UTC(+out.year, +out.month - 1, +out.day) / 86400000);
    } catch (e) {
      var n = new Date();
      return Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86400000);
    }
  }

  // First and last day numbers of the month containing dayNum
  function monthRange(dayNum) {
    var p = dayParts(dayNum);
    return {
      first: Math.floor(Date.UTC(p.year, p.month - 1, 1) / 86400000),
      last: Math.floor(Date.UTC(p.year, p.month, 0) / 86400000)
    };
  }

  function monthLabel(dayNum) { var p = dayParts(dayNum); return MONTHS[p.month - 1] + " " + p.year; }

  // ---------- Text pieces ----------
  function shortMonth(p) { return MONTHS[p.month - 1].slice(0, 3).toUpperCase(); }
  function shortWeekday(p) { return WEEKDAYS[p.weekday].slice(0, 3); }
  function longDate(p) { return WEEKDAYS[p.weekday] + " " + p.day + " " + MONTHS[p.month - 1]; }

  function isMultiDay(ev) { return ev.endDay > ev.startDay; }
  function isAllDay(ev) { return !ev.time; }

  // ---------- Date block on the card ----------
  // "17 / OCT / Sat", "30–31 / OCT / Fri–Sat", "30 OCT – 2 NOV" across months
  function dateBlock(ev) {
    var s = dayParts(ev.startDay), e = dayParts(ev.endDay);
    if (!isMultiDay(ev)) return { day: String(s.day), month: shortMonth(s), weekday: shortWeekday(s) };
    var sameMonth = s.year === e.year && s.month === e.month;
    if (sameMonth) return { day: s.day + "–" + e.day, month: shortMonth(s), weekday: shortWeekday(s) + "–" + shortWeekday(e) };
    return { day: s.day + " " + shortMonth(s) + " –", month: e.day + " " + shortMonth(e), weekday: shortWeekday(s) + "–" + shortWeekday(e) };
  }

  // "Fri 30 – Sat 31 October" or "Fri 30 October – Mon 2 November"
  function rangeText(ev) {
    var s = dayParts(ev.startDay), e = dayParts(ev.endDay);
    if (s.year === e.year && s.month === e.month) {
      return shortWeekday(s) + " " + s.day + " – " + shortWeekday(e) + " " + e.day + " " + MONTHS[e.month - 1];
    }
    return shortWeekday(s) + " " + s.day + " " + MONTHS[s.month - 1] + " – " + shortWeekday(e) + " " + e.day + " " + MONTHS[e.month - 1];
  }

  // ---------- Full date line on the card ----------
  function whenText(ev) {
    var dates = isMultiDay(ev) ? rangeText(ev) : longDate(dayParts(ev.startDay));
    return dates + " · " + (isAllDay(ev) ? "All day" : ev.time);
  }

  // ---------- One line for "Next event: …" ----------
  function shortText(ev) {
    var dates = isMultiDay(ev) ? rangeText(ev) : longDate(dayParts(ev.startDay));
    return dates + (isAllDay(ev) ? " (all day)" : ", " + ev.time);
  }

  // ---------- Labels ----------
  function label(ev, todayNum) {
    var t = todayNum === undefined ? today() : todayNum;
    if (t > ev.endDay) return "";                                         // already over
    if (ev.startDay <= t && (isMultiDay(ev) || isAllDay(ev))) return "Happening now";
    var d = ev.startDay - t;
    if (d <= 0) return "Today";
    if (d === 1) return "Tomorrow";
    if (d < 7) return "This week";
    return "";
  }

  // ---------- Google Calendar ----------
  function stamp(dayNum) { var p = dayParts(dayNum); return p.year + pad(p.month) + pad(p.day); }

  // "14:00–17:00", "14:00 - 17:00", "9:30" → { start: "1400", end: "1700" } (or null)
  function parseTime(text) {
    var m = /^(\d{1,2})[:h.](\d{2})\s*(?:[-–—to]+\s*(\d{1,2})[:h.](\d{2}))?$/i.exec(String(text || "").trim());
    if (!m) return null;
    var h1 = +m[1], m1 = +m[2], h2 = m[3] !== undefined ? +m[3] : h1 + 1, m2 = m[4] !== undefined ? +m[4] : m1;
    if (h1 > 23 || m1 > 59 || h2 > 23 || m2 > 59) return null;
    return { start: pad(h1) + pad(m1) + "00", end: pad(h2) + pad(m2) + "00" };
  }

  function googleCalendarUrl(ev) {
    var t = isAllDay(ev) ? null : parseTime(ev.time);
    var dates;
    if (t) {
      // local Tunis times (no "Z"), interpreted with ctz=Africa/Tunis
      dates = stamp(ev.startDay) + "T" + t.start + "/" + stamp(ev.endDay) + "T" + t.end;
    } else {
      // all-day: date only, the end is the day AFTER the last day (Google's rule)
      dates = stamp(ev.startDay) + "/" + stamp(ev.endDay + 1);
    }
    var details = ev.description || "";
    if (ev.time && !t) details = "Time: " + ev.time + (details ? "\n\n" + details : "");
    if (ev.link) details += (details ? "\n\n" : "") + "Register: " + ev.link;
    details += (details ? "\n\n" : "") + "IEEE ISIMA Student Branch";
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(ev.title) +
      "&dates=" + dates +
      "&details=" + encodeURIComponent(details) +
      "&location=" + encodeURIComponent(ev.location || "") +
      "&ctz=" + encodeURIComponent(TZ);
  }

  window.IEEEEventFormat = {
    TZ: TZ,
    dayFromString: dayFromString,
    today: today,
    monthRange: monthRange,
    monthLabel: monthLabel,
    isMultiDay: isMultiDay,
    isAllDay: isAllDay,
    dateBlock: dateBlock,
    whenText: whenText,
    shortText: shortText,
    label: label,
    googleCalendarUrl: googleCalendarUrl
  };
})();
