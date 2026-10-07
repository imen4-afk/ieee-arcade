/*
 * IEEE Arcade – admin space (admin/index.html)
 * ============================================
 * Completely separate from the player pages: it does NOT use js/arcade.js.
 * It only reads js/config.js for the Supabase URL and the PUBLIC anon key.
 *
 * Security model:
 *   - Admins log in with Supabase Auth (email + password, sign-ups disabled).
 *   - Every data call is sent with the admin's access token; the database rules
 *     (RLS + the admins table) decide what an admin may read or change.
 *   - The service_role key is NEVER used here (or anywhere in the site).
 *   - The session lives in sessionStorage only (gone when the tab closes),
 *     is refreshed before it expires, and ends after 30 minutes of inactivity.
 */
(function () {
  "use strict";

  var config = window.ARCADE_CONFIG || {};
  var BASE = String(config.SUPABASE_URL || "").replace(/\/+$/, "");
  var KEY = config.SUPABASE_ANON_KEY;

  var TZ = "Africa/Tunis";
  var SESSION_KEY = "ieeeAdmin.session";
  var IDLE_LIMIT_MS = 30 * 60 * 1000;
  var PAST_DAYS = 60;
  var SITE_URL = "https://ieee-arcade.vercel.app";
  var CHAPTERS = ["SB", "CS", "CIS", "RAS", "WIE"];
  var CHAPTER_NAMES = { SB: "IEEE ISIMA SB", CS: "Computer Society", CIS: "Computational Intelligence", RAS: "Robotics & Automation", WIE: "Women in Engineering" };

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  // ======================================================================
  // Toast
  // ======================================================================

  var toastTimer = null;
  function toast(text, isError) {
    var t = $("toast");
    t.textContent = text;
    t.className = "toast" + (isError ? " error" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  // ======================================================================
  // Dates in Africa/Tunis
  // ======================================================================

  var fmtParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });

  function tzParts(date) {
    var out = {};
    fmtParts.formatToParts(new Date(date)).forEach(function (p) { out[p.type] = p.value; });
    return { year: +out.year, month: +out.month, day: +out.day, hour: (+out.hour) % 24, minute: +out.minute };
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // "2026-10-20" + "14:00" (Tunis time) -> "2026-10-20T13:00:00.000Z"
  function tunisToISO(dateStr, timeStr) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    var t = /^(\d{2}):(\d{2})$/.exec(timeStr);
    if (!d || !t) return null;
    var wanted = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
    var guess = wanted;
    for (var i = 0; i < 2; i++) {          // two passes are enough (Tunis has a fixed offset)
      var p = tzParts(guess);
      var shownAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
      guess = wanted - (shownAsUtc - guess);
    }
    return new Date(guess).toISOString();
  }

  function isoToInputs(iso) {
    var p = tzParts(iso);
    return { date: p.year + "-" + pad(p.month) + "-" + pad(p.day), time: pad(p.hour) + ":" + pad(p.minute) };
  }

  function fmt(iso, options) {
    options.timeZone = TZ;
    return new Intl.DateTimeFormat("en-GB", options).format(new Date(iso));
  }
  function longDate(iso) { return fmt(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  function shortDate(iso) { return fmt(iso, { weekday: "short", day: "numeric", month: "short" }); }
  function timeOf(iso) { var p = tzParts(iso); return pad(p.hour) + ":" + pad(p.minute); }
  function sameMonth(a, b) { var pa = tzParts(a), pb = tzParts(b); return pa.year === pb.year && pa.month === pb.month; }

  // ======================================================================
  // Session (sessionStorage only)
  // ======================================================================

  var session = null;
  var refreshTimer = null;

  function loadSession() {
    try {
      var s = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null");
      return s && s.access_token && s.refresh_token ? s : null;
    } catch (e) { return null; }
  }

  function saveSession(s) {
    session = s;
    try {
      if (s) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else window.sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* storage blocked: the session just won't survive a reload */ }
  }

  function fromAuthResponse(data) {
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      email: data.user && data.user.email ? String(data.user.email) : ""
    };
  }

  // Raw call to Supabase. Never throws: { ok, status, data }.
  function call(method, path, body, headers) {
    var h = { apikey: KEY, "Content-Type": "application/json" };
    for (var k in headers) h[k] = headers[k];
    try {
      return fetch(BASE + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
        .then(function (res) {
          return res.text().then(function (text) {
            var data = null;
            try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .catch(function () { return { ok: false, status: 0, data: null }; });
    } catch (e) {
      return Promise.resolve({ ok: false, status: 0, data: null });
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (!session) return;
    var wait = Math.max(5000, session.expires_at - Date.now() - 60000); // 1 minute before expiry
    refreshTimer = setTimeout(function () { refreshSession(); }, wait);
  }

  function refreshSession() {
    if (!session) return Promise.resolve(false);
    return call("POST", "/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token })
      .then(function (r) {
        if (r.ok && r.data && r.data.access_token) {
          var email = session.email;
          saveSession(fromAuthResponse(r.data));
          if (!session.email) session.email = email;
          scheduleRefresh();
          return true;
        }
        return false;
      });
  }

  // Authenticated data call (admin token). Refreshes once on 401, else logs out.
  function api(method, path, body, extraHeaders) {
    if (!session) return Promise.resolve({ ok: false, status: 401, data: null });
    var ready = session.expires_at - Date.now() < 60000 ? refreshSession() : Promise.resolve(true);
    return ready.then(function () {
      var headers = { Authorization: "Bearer " + (session ? session.access_token : "") };
      for (var k in extraHeaders) headers[k] = extraHeaders[k];
      return call(method, path, body, headers).then(function (r) {
        if (r.status !== 401) return r;
        return refreshSession().then(function (ok) {
          if (!ok) { logout("Your session expired. Please log in again."); return r; }
          headers.Authorization = "Bearer " + session.access_token;
          return call(method, path, body, headers).then(function (r2) {
            if (r2.status === 401) logout("Your session expired. Please log in again.");
            return r2;
          });
        });
      });
    });
  }

  function errorText(r) {
    if (r.status === 0) return "No connection.";
    var msg = r.data && (r.data.message || r.data.msg || r.data.error_description);
    return msg ? String(msg) : "Error " + r.status;
  }

  // ======================================================================
  // Login / logout / inactivity
  // ======================================================================

  function showView(name) {
    $("login-view").hidden = name !== "login";
    $("app-view").hidden = name !== "app";
    $("checking").hidden = name !== "checking";
    $("logout-btn").hidden = name !== "app";
    $("admin-user").hidden = name !== "app";
  }

  function showLogin(notice) {
    showView("login");
    $("login-notice").textContent = notice || "";
    $("login-notice").hidden = !notice;
    $("login-password").value = "";
  }

  function checkAdmin() {
    return api("POST", "/rest/v1/rpc/is_admin", {}).then(function (r) { return r.ok && r.data === true; });
  }

  function enterApp() {
    $("admin-user").textContent = session.email;
    showView("app");
    lastActivity = Date.now();
    scheduleRefresh();
    loadEvents();
    loadSubscribers();
  }

  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("login-email").value.trim();
    var password = $("login-password").value;
    var errorBox = $("login-error");
    errorBox.hidden = true;
    if (!email || !password) { errorBox.textContent = "Wrong email or password"; errorBox.hidden = false; return; }

    $("login-btn").disabled = true;
    call("POST", "/auth/v1/token?grant_type=password", { email: email, password: password }).then(function (r) {
      if (!r.ok || !r.data || !r.data.access_token) {
        $("login-btn").disabled = false;
        // Same message whatever was wrong (don't reveal if the email exists)
        errorBox.textContent = r.status === 0 ? "No connection. Try again." : "Wrong email or password";
        errorBox.hidden = false;
        return;
      }
      saveSession(fromAuthResponse(r.data));
      return checkAdmin().then(function (isAdmin) {
        $("login-btn").disabled = false;
        if (!isAdmin) { logout("This account isn't an admin"); return; }
        $("login-password").value = "";
        enterApp();
      });
    });
  });

  function logout(notice) {
    clearTimeout(refreshTimer);
    var token = session && session.access_token;
    saveSession(null);
    eventsCache = [];
    subscribersCache = [];
    $("list-month").innerHTML = "";
    $("list-later").innerHTML = "";
    $("list-past").innerHTML = "";
    $("subs-body").innerHTML = "";
    if (token) call("POST", "/auth/v1/logout", {}, { Authorization: "Bearer " + token });
    showLogin(notice);
  }

  $("logout-btn").addEventListener("click", function () { logout("You're logged out."); });

  // Auto-logout after 30 minutes without any activity
  var lastActivity = Date.now();
  ["pointerdown", "keydown", "input", "scroll"].forEach(function (type) {
    window.addEventListener(type, function () { lastActivity = Date.now(); }, { passive: true });
  });
  setInterval(function () {
    if (session && Date.now() - lastActivity > IDLE_LIMIT_MS) {
      logout("Logged out after 30 minutes of inactivity.");
    }
  }, 20000);

  // ======================================================================
  // Tabs
  // ======================================================================

  var TABS = ["events", "subscribers", "reminders"];
  function selectTab(name) {
    TABS.forEach(function (t) {
      var active = t === name;
      $("tab-" + t).setAttribute("aria-selected", active ? "true" : "false");
      $("tab-" + t).tabIndex = active ? 0 : -1;
      $("panel-" + t).hidden = !active;
    });
    if (name === "reminders") renderReminderOptions();
  }
  TABS.forEach(function (t) {
    $("tab-" + t).addEventListener("click", function () { selectTab(t); });
  });

  // ======================================================================
  // A) Events
  // ======================================================================

  var eventsCache = [];

  function loadEvents() {
    $("events-status").textContent = "Loading…";
    var since = new Date(Date.now() - PAST_DAYS * 86400000).toISOString();
    return api("GET", "/rest/v1/events?select=*&starts_at=gte." + encodeURIComponent(since) + "&order=starts_at.asc&limit=500")
      .then(function (r) {
        if (!r.ok || !Array.isArray(r.data)) {
          $("events-status").textContent = "⚠️ Couldn't load events: " + errorText(r);
          return;
        }
        eventsCache = r.data;
        $("events-status").textContent = eventsCache.length + " event(s) in the list.";
        renderEvents();
        renderReminderOptions();
      });
  }

  function renderEvents() {
    var now = new Date();
    var groups = { month: [], later: [], past: [] };
    eventsCache.forEach(function (ev) {
      var start = new Date(ev.starts_at);
      if (start < now) groups.past.push(ev);
      else if (sameMonth(start, now)) groups.month.push(ev);
      else groups.later.push(ev);
    });
    groups.past.reverse(); // most recent first
    fillList("list-month", groups.month, "No upcoming events this month.");
    fillList("list-later", groups.later, "No events after this month yet.");
    fillList("list-past", groups.past, "No past events in the last 60 days.");
  }

  function fillList(id, events, emptyText) {
    var box = $(id);
    box.innerHTML = "";
    if (!events.length) { box.appendChild(el("p", "admin-empty", emptyText)); return; }
    events.forEach(function (ev) { box.appendChild(eventRow(ev)); });
  }

  function eventRow(ev) {
    var row = el("div", "card admin-event");
    var main = el("div", "admin-event-main");
    var badgeLine = el("span");
    badgeLine.appendChild(el("span", "badge " + (ev.published ? "published" : "draft"), ev.published ? "Published" : "Draft"));
    badgeLine.appendChild(document.createTextNode(ev.chapter || "SB"));
    main.appendChild(badgeLine);
    main.appendChild(el("strong", "", ev.title));
    main.appendChild(el("span", "", shortDate(ev.starts_at) + " · " + timeOf(ev.starts_at) +
      (ev.ends_at ? "–" + timeOf(ev.ends_at) : "") + (ev.location ? " · " + ev.location : "")));
    row.appendChild(main);

    var edit = el("button", "btn btn-ghost", "Edit");
    edit.type = "button";
    edit.addEventListener("click", function () { fillForm(ev, false); });
    var dup = el("button", "btn btn-ghost", "Duplicate");
    dup.type = "button";
    dup.addEventListener("click", function () { fillForm(ev, true); });
    var del = el("button", "btn btn-ghost", "Delete");
    del.type = "button";
    del.addEventListener("click", function () { deleteEvent(ev); });
    row.appendChild(edit);
    row.appendChild(dup);
    row.appendChild(del);
    return row;
  }

  function resetForm() {
    $("event-form").reset();
    $("ev-id").value = "";
    $("ev-published").checked = true;
    $("ev-chapter").value = "SB";
    $("event-form-title").textContent = "New event";
    $("event-save").textContent = "Create event";
    $("event-cancel").textContent = "Clear form";
    $("event-error").hidden = true;
  }

  // Edit an event, or copy it into the form as a new one ("Duplicate")
  function fillForm(ev, asCopy) {
    var start = isoToInputs(ev.starts_at);
    $("ev-id").value = asCopy ? "" : ev.id;
    $("ev-title").value = ev.title || "";
    $("ev-description").value = ev.description || "";
    $("ev-date").value = start.date;
    $("ev-start").value = start.time;
    $("ev-end").value = ev.ends_at ? isoToInputs(ev.ends_at).time : "";
    $("ev-location").value = ev.location || "";
    $("ev-chapter").value = CHAPTERS.indexOf(ev.chapter) !== -1 ? ev.chapter : "SB";
    $("ev-url").value = ev.register_url || "";
    $("ev-published").checked = asCopy ? false : !!ev.published;
    $("event-form-title").textContent = asCopy ? "New event (copy — check the date!)" : "Edit event";
    $("event-save").textContent = asCopy ? "Create event" : "Save changes";
    $("event-cancel").textContent = asCopy ? "Clear form" : "Cancel edit";
    $("event-error").hidden = true;
    $("event-form").scrollIntoView({ behavior: "smooth", block: "start" });
    $("ev-title").focus({ preventScroll: true });
  }

  // Returns { data } or { error }
  function readForm() {
    var title = $("ev-title").value.trim();
    var description = $("ev-description").value.trim();
    var date = $("ev-date").value;
    var start = $("ev-start").value;
    var end = $("ev-end").value;
    var location = $("ev-location").value.trim();
    var chapter = $("ev-chapter").value;
    var url = $("ev-url").value.trim();

    if (!title) return { error: "Please enter a title." };
    if (title.length > 150) return { error: "The title is too long (150 characters max)." };
    if (description.length > 3000) return { error: "The description is too long (3000 characters max)." };
    if (!date) return { error: "Please choose a date." };
    if (!start) return { error: "Please choose a start time." };
    if (end && end <= start) return { error: "The end time must be after the start time." };
    if (CHAPTERS.indexOf(chapter) === -1) return { error: "Please choose a chapter." };
    if (url) {
      var okUrl = /^https:\/\/\S+$/i.test(url) && url.length <= 500;
      try { okUrl = okUrl && new URL(url).protocol === "https:"; } catch (e) { okUrl = false; }
      if (!okUrl) return { error: "The registration link must be a full link starting with https://" };
    }

    var startsAt = tunisToISO(date, start);
    var endsAt = end ? tunisToISO(date, end) : null;
    if (!startsAt) return { error: "Please check the date and time." };

    return {
      data: {
        title: title,
        description: description || null,
        starts_at: startsAt,
        ends_at: endsAt,
        location: location || null,
        chapter: chapter,
        register_url: url || null,
        published: $("ev-published").checked
      }
    };
  }

  $("event-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = readForm();
    var errorBox = $("event-error");
    if (form.error) { errorBox.textContent = form.error; errorBox.hidden = false; return; }
    errorBox.hidden = true;

    var id = $("ev-id").value;
    var request = id
      ? api("PATCH", "/rest/v1/events?id=eq." + encodeURIComponent(id), form.data, { Prefer: "return=representation" })
      : api("POST", "/rest/v1/events", form.data, { Prefer: "return=representation" });

    $("event-save").disabled = true;
    request.then(function (r) {
      $("event-save").disabled = false;
      // RLS can silently change 0 rows: an empty answer means "not saved".
      if (!r.ok || !Array.isArray(r.data) || r.data.length === 0) {
        errorBox.textContent = "Not saved: " + (r.ok ? "no permission (are you still an admin?)" : errorText(r));
        errorBox.hidden = false;
        return;
      }
      toast(id ? "✅ Event updated" : "✅ Event created");
      resetForm();
      loadEvents();
    });
  });

  $("event-cancel").addEventListener("click", resetForm);
  $("events-refresh").addEventListener("click", loadEvents);

  function deleteEvent(ev) {
    if (!window.confirm('Delete the event "' + ev.title + '"?\nThis cannot be undone.')) return;
    api("DELETE", "/rest/v1/events?id=eq." + encodeURIComponent(ev.id), undefined, { Prefer: "return=representation" })
      .then(function (r) {
        if (!r.ok || !Array.isArray(r.data) || r.data.length === 0) {
          toast("Not deleted: " + (r.ok ? "no permission" : errorText(r)), true);
          return;
        }
        if ($("ev-id").value === String(ev.id)) resetForm();
        toast("🗑️ Event deleted");
        loadEvents();
      });
  }

  // ======================================================================
  // B) Subscribers
  // ======================================================================

  var subscribersCache = [];

  function loadSubscribers() {
    $("subs-status").textContent = "Loading…";
    return api("GET", "/rest/v1/subscribers?select=*&order=updated_at.desc&limit=10000").then(function (r) {
      if (!r.ok || !Array.isArray(r.data)) {
        $("subs-status").textContent = "⚠️ Couldn't load subscribers: " + errorText(r);
        return;
      }
      subscribersCache = r.data;
      renderSubscribers();
    });
  }

  function activeEmails() {
    return subscribersCache.filter(function (s) { return s.subscribed; }).map(function (s) { return s.email; });
  }

  function renderSubscribers() {
    var active = activeEmails().length;
    $("count-active").textContent = active;
    $("count-unsub").textContent = subscribersCache.length - active;

    var q = $("subs-search").value.trim().toLowerCase();
    var rows = subscribersCache.filter(function (s) {
      return !q || String(s.email).toLowerCase().indexOf(q) !== -1 || String(s.nickname || "").toLowerCase().indexOf(q) !== -1;
    });
    $("subs-status").textContent = rows.length + " shown";

    var body = $("subs-body");
    body.innerHTML = "";
    rows.forEach(function (s) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "", s.email));
      tr.appendChild(el("td", "", s.nickname || "–"));
      tr.appendChild(el("td", "", s.subscribed ? "✅ Yes" : "No"));
      var when = s.consent_at || s.updated_at;
      tr.appendChild(el("td", "", when ? fmt(when, { day: "numeric", month: "short", year: "numeric" }) : "–"));
      var td = document.createElement("td");
      var rm = el("button", "btn btn-ghost", "Remove");
      rm.type = "button";
      rm.addEventListener("click", function () { removeSubscriber(s.email); });
      td.appendChild(rm);
      tr.appendChild(td);
      body.appendChild(tr);
    });
  }

  function removeSubscriber(email) {
    if (!window.confirm("Remove " + email + " from the subscribers list?")) return;
    api("DELETE", "/rest/v1/subscribers?email=eq." + encodeURIComponent(email), undefined, { Prefer: "return=representation" })
      .then(function (r) {
        if (!r.ok || !Array.isArray(r.data) || r.data.length === 0) {
          toast("Not removed: " + (r.ok ? "no permission" : errorText(r)), true);
          return;
        }
        toast("Subscriber removed");
        loadSubscribers();
      });
  }

  $("subs-search").addEventListener("input", renderSubscribers);
  $("subs-refresh").addEventListener("click", loadSubscribers);

  function copyText(text, doneMessage) {
    function fallback() {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(area);
      toast(ok ? doneMessage : "Couldn't copy: select the text and copy it by hand.", !ok);
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { toast(doneMessage); }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
  }

  $("copy-emails").addEventListener("click", function () {
    var emails = activeEmails();
    if (!emails.length) { toast("No active subscribers yet.", true); return; }
    copyText(emails.join(", "), "📋 " + emails.length + " email(s) copied — paste them in BCC");
  });

  // CSV cell: quoted, and protected against spreadsheet formulas (=, +, -, @)
  function csvCell(value) {
    var s = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  $("export-csv").addEventListener("click", function () {
    var active = subscribersCache.filter(function (s) { return s.subscribed; });
    if (!active.length) { toast("No active subscribers yet.", true); return; }
    var lines = ["email,nickname,consent_at"];
    active.forEach(function (s) { lines.push([csvCell(s.email), csvCell(s.nickname), csvCell(s.consent_at)].join(",")); });
    try {
      var blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var p = tzParts(new Date());
      a.href = url;
      a.download = "ieee-arcade-subscribers-" + p.year + "-" + pad(p.month) + "-" + pad(p.day) + ".csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast("⬇️ CSV exported (" + active.length + " active)");
    } catch (e) {
      toast("Export failed in this browser.", true);
    }
  });

  // ======================================================================
  // C) Reminders
  // ======================================================================

  function upcomingEvents() {
    var now = new Date();
    return eventsCache.filter(function (ev) { return new Date(ev.starts_at) >= now; });
  }

  function renderReminderOptions() {
    var select = $("reminder-event");
    var current = select.value;
    var events = upcomingEvents();
    select.innerHTML = "";
    if (!events.length) {
      var none = el("option", "", "No upcoming events");
      none.value = "";
      select.appendChild(none);
    }
    events.forEach(function (ev) {
      var o = el("option", "", shortDate(ev.starts_at) + " — " + ev.title + (ev.published ? "" : " (draft)"));
      o.value = String(ev.id);
      select.appendChild(o);
    });
    if (current && events.some(function (ev) { return String(ev.id) === current; })) select.value = current;
    buildReminder();
  }

  function buildReminder() {
    var id = $("reminder-event").value;
    var ev = null;
    eventsCache.forEach(function (e) { if (String(e.id) === id) ev = e; });
    if (!ev) {
      $("reminder-subject").value = "";
      $("reminder-body").value = "";
      $("open-gmail").href = "#";
      $("reminder-status").textContent = "";
      return;
    }
    var date = longDate(ev.starts_at);
    var subject = "Reminder: " + ev.title + " — " + date;
    var lines = [
      "Hello!",
      "",
      "This is a friendly reminder from the IEEE ISIMA Student Branch about our upcoming event:",
      "",
      "📌 " + ev.title,
      "📅 Date: " + date,
      "⏰ Time: " + timeOf(ev.starts_at) + (ev.ends_at ? "–" + timeOf(ev.ends_at) : "") + " (Tunis time)"
    ];
    if (ev.location) lines.push("📍 Location: " + ev.location);
    lines.push("👥 Organized by: " + (CHAPTER_NAMES[ev.chapter] || CHAPTER_NAMES.SB));
    if (ev.description) lines.push("", ev.description);
    if (ev.register_url) lines.push("", "Register here: " + ev.register_url);
    lines.push("", "See you there!", "IEEE ISIMA Student Branch", "",
      "Don't want these reminders? Unsubscribe: " + SITE_URL + "/unsubscribe.html");
    var body = lines.join("\n");

    $("reminder-subject").value = subject;
    $("reminder-body").value = body;
    // The subscribers' emails are NEVER put in this link (paste them in BCC yourself).
    $("open-gmail").href = "https://mail.google.com/mail/?view=cm&fs=1&su=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
    $("reminder-status").textContent = ev.published ? "" : "⚠️ This event is still a draft (not visible on the public page).";
  }

  $("reminder-event").addEventListener("change", buildReminder);
  $("copy-subject").addEventListener("click", function () {
    if ($("reminder-subject").value) copyText($("reminder-subject").value, "📋 Subject copied");
  });
  $("copy-body").addEventListener("click", function () {
    if ($("reminder-body").value) copyText($("reminder-body").value, "📋 Body copied");
  });
  $("copy-bcc").addEventListener("click", function () {
    var emails = activeEmails();
    if (!emails.length) { toast("No active subscribers yet.", true); return; }
    copyText(emails.join(", "), "📋 " + emails.length + " email(s) copied — paste them in BCC");
  });
  $("open-gmail").addEventListener("click", function (e) {
    if ($("open-gmail").getAttribute("href") === "#") { e.preventDefault(); toast("Choose an event first.", true); }
  });

  // ======================================================================
  // Start
  // ======================================================================

  if (!/^https:\/\//.test(BASE) || !KEY) {
    showLogin("Missing Supabase settings in js/config.js.");
    return;
  }

  session = loadSession();
  if (!session) {
    showLogin("");
  } else {
    showView("checking");
    var ready = session.expires_at - Date.now() < 60000 ? refreshSession() : Promise.resolve(true);
    ready.then(function (ok) {
      if (!ok) { saveSession(null); showLogin("Please log in again."); return; }
      return checkAdmin().then(function (isAdmin) {
        if (isAdmin) enterApp();
        else logout("This account isn't an admin");
      });
    });
  }
})();
