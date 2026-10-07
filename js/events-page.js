/*
 * IEEE Arcade – events.html
 * Events from data/events.json: "This month" (events overlapping the current month)
 * and "Coming later" (the next 3 after this month). Dates: js/events-format.js.
 * Every text from the JSON file is inserted with textContent (never innerHTML).
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
    var chapter = Events.CHAPTERS[code];
    var badge = el("span", "chapter-badge");
    var tile = el("span", "chapter-badge-logo");
    var img = document.createElement("img");
    img.src = chapter.logo;
    img.alt = "";
    img.addEventListener("error", function () { img.hidden = true; });
    tile.appendChild(img);
    badge.appendChild(tile);
    badge.appendChild(el("span", "", code + " · " + chapter.name));
    return badge;
  }

  function eventCard(ev) {
    var card = el("article", "card event-card");

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
    if (ev.location) meta.appendChild(el("span", "", "📍 " + ev.location));
    body.appendChild(meta);

    body.appendChild(chapterBadge(ev.chapter));
    if (ev.description) body.appendChild(el("p", "event-desc", ev.description));

    var actions = el("div", "btn-row event-actions");
    if (ev.link) {
      var reg = el("a", "btn btn-primary", "Register ↗");
      reg.href = ev.link;
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
    var month = Format.monthRange(Format.today());
    // overlapping the current month (events are already "end today or later")
    var thisMonth = events.filter(function (ev) { return ev.startDay <= month.last && ev.endDay >= month.first; });
    var later = events.filter(function (ev) { return ev.startDay > month.last; }).slice(0, LATER_COUNT);

    var list = $("events-month");
    list.innerHTML = "";
    thisMonth.forEach(function (ev) { list.appendChild(eventCard(ev)); });
    $("events-empty").hidden = thisMonth.length > 0;

    var laterList = $("events-later");
    laterList.innerHTML = "";
    later.forEach(function (ev) { laterList.appendChild(eventCard(ev)); });
    $("later-section").hidden = later.length === 0;
  }

  $("month-title").textContent = "Upcoming events — " + Format.monthLabel(Format.today());

  Events.loadUpcoming().then(function (result) {
    if (!result.ok) {
      $("events-status").textContent = "⚠️ Sorry, the events couldn't be loaded right now. Please try again later.";
      $("events-status").classList.add("events-error");
      return;
    }
    $("events-status").hidden = true;
    render(result.events);
  });
})();
