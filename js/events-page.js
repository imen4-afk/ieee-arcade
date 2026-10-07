/*
 * IEEE Arcade – events.html
 * Events of the current month (Africa/Tunis) that haven't ended yet + the next 3 after it.
 * Dates come from js/events-format.js (shared with the hub and the dashboard).
 * Every text from the database is inserted with textContent (never innerHTML).
 */
(function () {
  "use strict";

  var Events = window.IEEEEvents;
  var Format = window.IEEEEventFormat;
  var LATER_COUNT = 3;

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function chapterBadge(code) {
    var known = !!Events.CHAPTERS[code];
    var chapter = Events.CHAPTERS[known ? code : "SB"];
    var badge = el("span", "chapter-badge");
    var tile = el("span", "chapter-badge-logo");
    var img = document.createElement("img");
    img.src = chapter.logo;
    img.alt = "";
    img.addEventListener("error", function () { img.hidden = true; });
    tile.appendChild(img);
    badge.appendChild(tile);
    badge.appendChild(el("span", "", (known ? code : "SB") + " · " + chapter.name));
    return badge;
  }

  function eventCard(ev) {
    var card = el("article", "card event-card");

    // Date block: "17 / OCT / Sat" or "30–31 / OCT / Fri–Sat"
    var block = Format.dateBlock(ev);
    var date = el("div", "event-date" + (Format.isMultiDay(ev) ? " range" : ""));
    date.setAttribute("aria-hidden", "true");
    date.appendChild(el("span", "event-day", block.day));
    date.appendChild(el("span", "event-month", block.month));
    date.appendChild(el("span", "event-weekday", block.weekday));
    card.appendChild(date);

    var body = el("div", "event-body");
    var label = Format.label(ev);
    if (label) {
      var cls = label === "Happening now" ? " now" : label === "Today" ? " today" : "";
      body.appendChild(el("span", "when-label" + cls, label));
    }
    body.appendChild(el("h3", "event-title", ev.title));

    var meta = el("p", "event-meta");
    meta.appendChild(el("span", "", "🗓️ " + Format.whenText(ev)));
    if (ev.location && String(ev.location).trim()) meta.appendChild(el("span", "", "📍 " + ev.location));
    body.appendChild(meta);

    body.appendChild(chapterBadge(ev.chapter));
    if (ev.description) body.appendChild(el("p", "event-desc", ev.description));

    var actions = el("div", "btn-row event-actions");
    if (Events.isSafeUrl(ev.register_url)) {
      var reg = el("a", "btn btn-primary", "Register ↗");
      reg.href = ev.register_url;
      reg.target = "_blank";
      reg.rel = "noopener";
      actions.appendChild(reg);
    }
    var cal = el("a", "btn btn-ghost", "📆 Add to Google Calendar");
    cal.href = Format.googleCalendarUrl(ev);
    cal.target = "_blank";
    cal.rel = "noopener";
    actions.appendChild(cal);
    body.appendChild(actions);

    card.appendChild(body);
    return card;
  }

  function render(events) {
    var now = new Date();
    // "This month" = starts this month, or already started and still running (e.g. a multi-day event)
    var inMonth = function (ev) { return Format.sameMonth(ev.starts_at, now) || new Date(ev.starts_at) <= now; };
    var thisMonth = events.filter(inMonth);
    var later = events.filter(function (ev) { return !inMonth(ev); }).slice(0, LATER_COUNT);

    var list = $("events-month");
    list.innerHTML = "";
    thisMonth.forEach(function (ev) { list.appendChild(eventCard(ev)); });
    $("events-empty").hidden = thisMonth.length > 0;

    var laterList = $("events-later");
    laterList.innerHTML = "";
    later.forEach(function (ev) { laterList.appendChild(eventCard(ev)); });
    $("later-section").hidden = later.length === 0;
  }

  $("month-label").textContent = Format.monthLabel(new Date());

  Events.fetchUpcoming(100).then(function (result) {
    if (!result.ok) {
      $("events-status").textContent = "⚠️ Events couldn't be loaded. Check your connection and try again.";
      return;
    }
    $("events-status").hidden = true;
    render(result.events);
  });
})();
