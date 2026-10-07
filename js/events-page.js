/*
 * IEEE Arcade – events.html
 * Upcoming events of the current month (Africa/Tunis) + the next 3 after it.
 * Every text from the database is inserted with textContent (never innerHTML).
 */
(function () {
  "use strict";

  var Events = window.IEEEEvents;
  var LATER_COUNT = 3;

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function whenLabel(ev) {
    var d = Events.daysFromToday(ev.starts_at);
    if (d <= 0) return "Today";
    if (d === 1) return "Tomorrow";
    if (d < 7) return "This week";
    return "";
  }

  function chapterBadge(code) {
    var chapter = Events.CHAPTERS[code] || Events.CHAPTERS.SB;
    var badge = el("span", "chapter-badge");
    var tile = el("span", "chapter-badge-logo");
    var img = document.createElement("img");
    img.src = chapter.logo;
    img.alt = "";
    img.addEventListener("error", function () { img.hidden = true; });
    tile.appendChild(img);
    badge.appendChild(tile);
    badge.appendChild(el("span", "", (Events.CHAPTERS[code] ? code : "SB") + " · " + chapter.name));
    return badge;
  }

  function eventCard(ev) {
    var card = el("article", "card event-card");

    // Date block: day number, short month, weekday
    var date = el("div", "event-date");
    date.setAttribute("aria-hidden", "true");
    date.appendChild(el("span", "event-day", String(Events.parts(ev.starts_at).day)));
    date.appendChild(el("span", "event-month", Events.shortMonth(ev.starts_at)));
    date.appendChild(el("span", "event-weekday", Events.weekday(ev.starts_at)));
    card.appendChild(date);

    var body = el("div", "event-body");
    var label = whenLabel(ev);
    if (label) body.appendChild(el("span", "when-label" + (label === "Today" ? " today" : ""), label));
    body.appendChild(el("h3", "event-title", ev.title));

    var timeText = Events.time(ev.starts_at) + (ev.ends_at ? "–" + Events.time(ev.ends_at) : "");
    var meta = el("p", "event-meta");
    meta.appendChild(el("span", "", "🗓️ " + Events.longDate(ev.starts_at) + " · " + timeText));
    if (ev.location) meta.appendChild(el("span", "", "📍 " + ev.location));
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
    cal.href = Events.googleCalendarUrl(ev);
    cal.target = "_blank";
    cal.rel = "noopener";
    actions.appendChild(cal);
    body.appendChild(actions);

    card.appendChild(body);
    return card;
  }

  function render(events) {
    var now = new Date();
    var thisMonth = events.filter(function (ev) { return Events.sameMonth(ev.starts_at, now); });
    var later = events.filter(function (ev) { return !Events.sameMonth(ev.starts_at, now); }).slice(0, LATER_COUNT);

    var list = $("events-month");
    list.innerHTML = "";
    thisMonth.forEach(function (ev) { list.appendChild(eventCard(ev)); });
    $("events-empty").hidden = thisMonth.length > 0;

    var laterList = $("events-later");
    laterList.innerHTML = "";
    later.forEach(function (ev) { laterList.appendChild(eventCard(ev)); });
    $("later-section").hidden = later.length === 0;
  }

  $("month-label").textContent = Events.monthLabel(new Date());

  Events.fetchUpcoming(100).then(function (result) {
    if (!result.ok) {
      $("events-status").textContent = "⚠️ Events couldn't be loaded. Check your connection and try again.";
      return;
    }
    $("events-status").hidden = true;
    render(result.events);
  });

  window.IEEESubscribe.mount($("subscribe-box"));
})();
