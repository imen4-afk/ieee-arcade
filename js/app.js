/*
 * IEEE Arcade – hub page (index.html)
 * Account screen (Create account / Log in) → hub with points, rank and the quiz/game cards.
 * All data and network calls go through js/arcade.js (window.IEEEArcade).
 */
(function () {
  "use strict";

  var Arcade = window.IEEEArcade;
  var CHECK_DELAY_MS = 400; // wait this long after typing before checking the nickname online

  function $(id) { return document.getElementById(id); }

  // ======================================================================
  // Screens
  // ======================================================================

  function render() {
    var nickname = Arcade.getNickname();
    $("auth").hidden = !!nickname;
    $("hub").hidden = !nickname;
    $("logout-btn").hidden = !nickname;
    $("menu-user").hidden = !nickname;
    $("menu-user").textContent = nickname ? "Logged in as " + nickname : "";
    placeEventCards(nickname);
    if (nickname) renderHub(nickname);
  }

  // "Upcoming events" card right under the visible panel: the player panel, or the account screen.
  function placeEventCards(nickname) {
    var eventsCard = $("events-card");
    var anchor = nickname ? $("player-panel") : $("auth");
    anchor.parentNode.insertBefore(eventsCard, anchor.nextSibling);
  }

  function loadNextEvent() {
    if (!window.IEEEEvents || !window.IEEEEventFormat) return;
    window.IEEEEvents.loadUpcoming().then(function (r) {
      if (!r.ok || !r.events.length) return;
      var ev = r.events[0];
      $("events-card-next").textContent = "Next: " + ev.title + " · " + window.IEEEEventFormat.shortText(ev);
    });
  }

  function renderHub(nickname) {
    $("player-name").textContent = nickname;
    $("player-total").textContent = Arcade.getLocalTotal();
    renderSections();
    updatePendingNotice();
    loadRank(nickname);
  }

  // One section per category of js/activities.js, with a card per ready activity
  function renderSections() {
    var Registry = window.IEEEActivities;
    var box = $("activity-sections");
    var bests = Arcade.getLocalBests();
    box.innerHTML = "";

    Registry.CATEGORIES.forEach(function (cat) {
      var items = Registry.ready().filter(function (a) { return a.category === cat.id; });
      if (!items.length) return;

      var title = el("h2", "section-title", cat.id + " ");
      title.appendChild(el("span", "small", "· " + cat.note));
      box.appendChild(title);
      var grid = el("div", "activity-grid");
      items.forEach(function (a) { grid.appendChild(activityCard(a, bests[a.id])); });
      box.appendChild(grid);
    });
  }

  function activityCard(a, best) {
    var played = best !== undefined;

    var card = document.createElement("a");
    card.className = "activity " + a.type + (played ? " done" : "");
    card.href = a.url;

    var icon = el("span", "activity-icon", a.icon);
    icon.setAttribute("aria-hidden", "true");

    var text = el("span", "activity-text");
    text.appendChild(el("strong", "", a.name));
    text.appendChild(el("span", "activity-sub", a.description));
    text.appendChild(el("span", "activity-max", played ? "Best: " + best + " / " + a.maxPoints : "Up to " + a.maxPoints + " pts"));

    var status = el("span", "activity-status", played ? "✓" : "›");
    status.setAttribute("aria-label", played ? "Played" : "Not played yet");

    card.appendChild(icon);
    card.appendChild(text);
    card.appendChild(status);
    return card;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Rank comes from the online leaderboard (top 100).
  function loadRank(nickname) {
    Arcade.getLeaderboard().then(function (result) {
      if (!result.ok) {
        $("player-rank").textContent = "–";
        $("player-rank-label").textContent = "Rank (offline)";
        return;
      }
      var rows = result.rows;
      var index = -1;
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].nickname).toLowerCase() === nickname.toLowerCase()) { index = i; break; }
      }
      var players = rows.length >= 100 ? "100+" : rows.length;
      if (index === -1) {
        $("player-rank").textContent = rows.length >= 100 ? "100+" : "–";
        $("player-rank-label").textContent = "Rank";
      } else {
        $("player-rank").textContent = "#" + (index + 1);
        $("player-rank-label").textContent = "of " + players + " players";
        var serverTotal = Number(rows[index].total) || 0;
        if (serverTotal > Arcade.getLocalTotal()) $("player-total").textContent = serverTotal;
      }
    });
  }

  function updatePendingNotice() {
    $("pending-notice").hidden = !Arcade.hasPendingScores();
  }

  // ======================================================================
  // Account screen: two tabs sharing one form
  // ======================================================================

  var mode = "create"; // or "login"
  var nickInput = $("auth-nickname");
  var pwInput = $("auth-password");
  var submitBtn = $("auth-submit");
  var checkTimer = null;
  var checkId = 0; // ignores answers to old checks if the visitor kept typing

  var NICK_HELP = "3–16 characters: letters, numbers or _ only.";
  var PW_HELP = "At least " + Arcade.MIN_PASSWORD + " characters.";

  function setHint(id, input, text, state) {
    var hint = $(id);
    hint.textContent = text;
    hint.className = "field-hint" + (state ? " " + state : "");
    input.classList.toggle("is-error", state === "error");
    input.classList.toggle("is-ok", state === "ok");
  }

  function showError(text) {
    $("auth-error").textContent = text || "";
    $("auth-error").hidden = !text;
  }

  function setMode(newMode) {
    mode = newMode;
    var create = mode === "create";
    $("tab-create").setAttribute("aria-selected", create ? "true" : "false");
    $("tab-login").setAttribute("aria-selected", create ? "false" : "true");
    $("tab-create").tabIndex = create ? 0 : -1;
    $("tab-login").tabIndex = create ? -1 : 0;
    $("auth-form").setAttribute("aria-labelledby", create ? "tab-create" : "tab-login");
    // lets password managers save a new password / fill a saved one
    pwInput.setAttribute("autocomplete", create ? "new-password" : "current-password");
    submitBtn.textContent = create ? "Create my account" : "Log in";    showError("");
    checkNickname();
    checkPassword();
  }

  function checkNickname() {
    clearTimeout(checkTimer);
    checkId++;
    var nickname = nickInput.value.trim();
    if (!nickname) { setHint("nickname-hint", nickInput, NICK_HELP, ""); return; }

    var problem = Arcade.validateNickname(nickname);
    if (problem) { setHint("nickname-hint", nickInput, problem, "error"); return; }

    if (mode === "login") { setHint("nickname-hint", nickInput, NICK_HELP, "ok"); return; }

    // Create account: tell right away if the nickname is free
    setHint("nickname-hint", nickInput, "Checking…", "");
    var myId = checkId;
    checkTimer = setTimeout(function () {
      Arcade.isNicknameAvailable(nickname).then(function (r) {
        if (myId !== checkId) return; // outdated answer
        if (!r.ok) setHint("nickname-hint", nickInput, NICK_HELP, "ok");
        else if (r.available) setHint("nickname-hint", nickInput, "✓ " + nickname + " is available!", "ok");
        else setHint("nickname-hint", nickInput, "This nickname is already taken. If it's yours, use Log in.", "error");
      });
    }, CHECK_DELAY_MS);
  }

  function checkPassword() {
    var pw = pwInput.value;
    if (!pw) { setHint("password-hint", pwInput, PW_HELP, ""); return; }
    if (Arcade.validatePassword(pw)) setHint("password-hint", pwInput, PW_HELP + " (" + pw.length + "/" + Arcade.MIN_PASSWORD + ")", "error");
    else setHint("password-hint", pwInput, "✓ Password OK", "ok");
  }

  nickInput.addEventListener("input", function () { showError(""); checkNickname(); });
  pwInput.addEventListener("input", function () { showError(""); checkPassword(); });

  $("tab-create").addEventListener("click", function () { setMode("create"); });
  $("tab-login").addEventListener("click", function () { setMode("login"); });
  // arrow keys move between the two tabs
  $("auth").querySelector("[role=tablist]").addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    setMode(mode === "create" ? "login" : "create");
    $(mode === "create" ? "tab-create" : "tab-login").focus();
  });

  // Show / hide the password
  $("pw-toggle").addEventListener("click", function () {
    var show = pwInput.type === "password";
    pwInput.type = show ? "text" : "password";
    this.setAttribute("aria-pressed", show ? "true" : "false");
    this.setAttribute("aria-label", show ? "Hide password" : "Show password");
    this.textContent = show ? "🙈" : "👁️";
  });

  $("auth-form").addEventListener("submit", function (e) {
    e.preventDefault();
    clearTimeout(checkTimer);
    checkId++;
    var nickname = nickInput.value.trim();
    var password = pwInput.value;

    var problem = Arcade.validateNickname(nickname) || Arcade.validatePassword(password);
    if (problem) { showError(problem); return; }

    var label = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = mode === "create" ? "Creating…" : "Logging in…";
    var action = mode === "create" ? Arcade.register : Arcade.login;

    action(nickname, password).then(function (r) {
      submitBtn.disabled = false;
      submitBtn.textContent = label;
      if (r.ok) {
        pwInput.value = "";
        $("auth-notice").hidden = true;
        render();
        window.scrollTo(0, 0);
      } else {
        showError(r.error);
        (/password/i.test(r.error) ? pwInput : nickInput).focus();
      }
    });
  });

  // ======================================================================
  // Header menu + log out
  // ======================================================================

  var menuBtn = $("menu-btn");
  var menu = $("nav-menu");

  function closeMenu() {
    menu.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
  }

  menuBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
  });
  document.addEventListener("click", function (e) {
    if (!menu.hidden && !menu.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !menu.hidden) { closeMenu(); menuBtn.focus(); }
  });

  function showLoginScreen(message) {
    closeMenu();
    nickInput.value = "";
    pwInput.value = "";
    render();
    setMode("login");
    $("auth-notice").textContent = message || "";
    $("auth-notice").hidden = !message;
    window.scrollTo(0, 0);
  }

  $("logout-btn").addEventListener("click", function () {
    if (!window.confirm("Log out? You can log back in any time with your nickname and password.")) return;
    Arcade.logout();
    showLoginScreen("You're logged out. See you soon!");
  });

  // The server refused the saved token (js/arcade.js already logged out).
  window.addEventListener("ieeearcade:loggedout", function () {
    showLoginScreen("Please log in again.");
  });

  // ======================================================================
  // Start
  // ======================================================================

  // Staff shortcut: long-press the SB logo for 3 s = log out this phone
  Arcade.enableStaffReset($("sb-logo"), function () { showLoginScreen(""); });

  loadNextEvent();

  // Coming back from a game with the browser's Back button may restore this
  // page from cache: refresh the scores.
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) render();
  });

  // Hide the "waiting for connection" notice once queued scores are sent.
  setInterval(function () {
    if (!$("hub").hidden) updatePendingNotice();
  }, 5000);

  render();

  // index.html?login=1 (sent here after the server refused the token on another page)
  var params = new URLSearchParams(window.location.search);
  if (params.get("login") === "1" && !Arcade.getNickname()) {
    showLoginScreen("Please log in again.");
    try { window.history.replaceState(null, "", window.location.pathname); } catch (e) { /* ignore */ }
  } else if (!Arcade.getNickname()) {
    setMode("create");
  }
})();
