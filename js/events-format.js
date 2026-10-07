/*
 * IEEE Arcade – event date formatting (one place for every page)
 * --------------------------------------------------------------
 * Used by events.html (cards), the hub ("Next: …") and dashboard.html ("Next event").
 * Everything is shown in the Africa/Tunis time zone.
 *
 * Event fields used: starts_at, ends_at (may be null), all_day (true/false).
 * All-day events are saved as first day 00:00 → last day 23:59 (Tunis time).
 *
 *   IEEEEventFormat.dateBlock(ev)   -> { day: "30–31", month: "OCT", weekday: "Fri–Sat" }
 *   IEEEEventFormat.whenText(ev)    -> "Fri 30 – Sat 31 October" / "Tuesday 20 October · 14:00–17:00"
 *   IEEEEventFormat.shortText(ev)   -> one line for "Next event: …"
 *   IEEEEventFormat.label(ev)       -> "Happening now" / "Today" / "Tomorrow" / "This week" / ""
 *   IEEEEventFormat.googleCalendarUrl(ev)
 */
(function () {
  "use strict";

  var TZ = "Africa/Tunis";

  var partsFormatter = null;
  try {
    partsFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    });
  } catch (e) { partsFormatter = null; }

  // { year, month, day, hour, minute } of a date in Tunis
  function parts(date) {
    var d = new Date(date);
    if (!partsFormatter) return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
    var out = {};
    partsFormatter.formatToParts(d).forEach(function (p) { out[p.type] = p.value; });
    return { year: +out.year, month: +out.month, day: +out.day, hour: (+out.hour) % 24, minute: +out.minute };
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
  function time(date) { var p = parts(date); return pad(p.hour) + ":" + pad(p.minute); }
  function dayNum(date) { return parts(date).day; }
  function monthShort(date) { return format(date, { month: "short" }).toUpperCase(); }
  function monthLong(date) { return format(date, { month: "long" }); }
  function weekdayShort(date) { return format(date, { weekday: "short" }); }
  function longDate(date) { return format(date, { weekday: "long", day: "numeric", month: "long" }); }
  function monthLabel(date) { return format(date, { month: "long", year: "numeric" }); }

  // Tunis calendar day as "days since 1970" (to compare days)
  function dayIndex(date) {
    var p = parts(date);
    return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86400000);
  }

  function sameMonth(a, b) {
    var pa = parts(a), pb = parts(b);
    return pa.year === pb.year && pa.month === pb.month;
  }

  function isAllDay(ev) { return ev && ev.all_day === true; }

  // Last moment of the event (all-day without ends_at = end of its first day)
  function endOf(ev) {
    if (ev.ends_at) return new Date(ev.ends_at);
    return null;
  }

  // Last calendar day of an all-day event
  function lastDay(ev) { return ev.ends_at || ev.starts_at; }

  function isMultiDay(ev) { return dayIndex(lastDay(ev)) > dayIndex(ev.starts_at); }

  // ---------- Date block on the card ----------
  function dateBlock(ev) {
    var start = ev.starts_at;
    if (isMultiDay(ev)) {
      var end = lastDay(ev);
      var sameM = sameMonth(start, end);
      return {
        day: dayNum(start) + "–" + dayNum(end),
        month: sameM ? monthShort(start) : monthShort(start) + "–" + monthShort(end),
        weekday: weekdayShort(start) + "–" + weekdayShort(end)
      };
    }
    return { day: String(dayNum(start)), month: monthShort(start), weekday: weekdayShort(start) };
  }

  // "Fri 30 – Sat 31 October" (same month) or "Fri 30 October – Mon 2 November"
  function rangeText(start, end) {
    if (sameMonth(start, end)) {
      return weekdayShort(start) + " " + dayNum(start) + " – " + weekdayShort(end) + " " + dayNum(end) + " " + monthLong(end);
    }
    return weekdayShort(start) + " " + dayNum(start) + " " + monthLong(start) + " – " +
      weekdayShort(end) + " " + dayNum(end) + " " + monthLong(end);
  }

  // ---------- Full date/time line on the card ----------
  function whenText(ev) {
    if (isAllDay(ev)) {
      return isMultiDay(ev) ? rangeText(ev.starts_at, lastDay(ev)) : longDate(ev.starts_at) + " · All day";
    }
    if (ev.ends_at && isMultiDay(ev)) {
      return rangeText(ev.starts_at, ev.ends_at) + " · " + time(ev.starts_at) + "–" + time(ev.ends_at);
    }
    return longDate(ev.starts_at) + " · " + time(ev.starts_at) + (ev.ends_at ? "–" + time(ev.ends_at) : "");
  }

  // ---------- One line for "Next event: …" (hub, dashboard) ----------
  function shortText(ev) {
    if (isAllDay(ev)) {
      return isMultiDay(ev) ? rangeText(ev.starts_at, lastDay(ev)) : longDate(ev.starts_at) + " (all day)";
    }
    return longDate(ev.starts_at) + ", " + time(ev.starts_at);
  }

  // ---------- "Happening now" / "Today" / "Tomorrow" / "This week" ----------
  function label(ev, now) {
    now = now || new Date();
    var start = new Date(ev.starts_at);
    var end = endOf(ev);
    if (end && now > end) return "";                                  // already over
    if (end && start <= now && now <= end) return "Happening now";
    var d = dayIndex(start) - dayIndex(now);
    if (d <= 0) return "Today";
    if (d === 1) return "Tomorrow";
    if (d < 7) return "This week";
    return "";
  }

  // ---------- Google Calendar ----------
  function utcStamp(date) {
    // YYYYMMDDTHHMMSSZ
    return new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  function dateStamp(year, month, day) {
    // YYYYMMDD (normalises overflow, e.g. 31 + 1 → next month)
    var d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
  }

  function googleCalendarUrl(ev) {
    var dates;
    if (isAllDay(ev)) {
      // all-day: date-only, end = the day AFTER the last day (Google's rule)
      var s = parts(ev.starts_at), e = parts(lastDay(ev));
      dates = dateStamp(s.year, s.month, s.day) + "/" + dateStamp(e.year, e.month, e.day + 1);
    } else {
      var start = new Date(ev.starts_at);
      var end = ev.ends_at ? new Date(ev.ends_at) : new Date(start.getTime() + 60 * 60000); // 1 h by default
      dates = utcStamp(start) + "/" + utcStamp(end);
    }
    var details = ev.description || "";
    if (ev.register_url) details += (details ? "\n\n" : "") + "Register: " + ev.register_url;
    details += (details ? "\n\n" : "") + "IEEE ISIMA Student Branch";
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(ev.title || "IEEE ISIMA SB event") +
      "&dates=" + dates +
      "&details=" + encodeURIComponent(details) +
      "&location=" + encodeURIComponent(ev.location || "") +
      "&ctz=" + encodeURIComponent(TZ);
  }

  window.IEEEEventFormat = {
    TZ: TZ,
    parts: parts,
    time: time,
    longDate: longDate,
    monthLabel: monthLabel,
    sameMonth: sameMonth,
    isAllDay: isAllDay,
    isMultiDay: isMultiDay,
    dateBlock: dateBlock,
    whenText: whenText,
    shortText: shortText,
    label: label,
    googleCalendarUrl: googleCalendarUrl
  };
})();
