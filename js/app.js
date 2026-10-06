/*
 * IEEE Arcade – hub page (index.html)
 * Join screen (nickname) → hub with points, rank and the quiz/game cards.
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
    $("join").hidden = !!nickname;
    $("hub").hidden = !nickname;
    if (nickname) renderHub(nickname);
  }

  function renderHub(nickname) {
    $("player-name").textContent = nickname;
    $("player-total").textContent = Arcade.getLocalTotal();
    renderCards("quiz-list", "quiz");
    renderCards("game-list", "game");
    updatePendingNotice();
    loadRank(nickname);
  }

  function renderCards(containerId, type) {
    var container = $(containerId);
    var bests = Arcade.getLocalBests();
    container.innerHTML = "";

    Arcade.ACTIVITIES.filter(function (a) { return a.type === type; }).forEach(function (a) {
      var best = bests[a.id];
      var played = best !== undefined;
      var max = Arcade.maxPointsFor(a.id);

      var card = document.createElement("a");
      card.className = "activity " + a.type + (played ? " done" : "");
      card.href = a.url;

      var icon = el("span", "activity-icon", a.icon);
      icon.setAttribute("aria-hidden", "true");

      var text = el("span", "activity-text");
      text.appendChild(el("strong", "", a.title));
      text.appendChild(el("span", "activity-sub", a.subtitle));
      text.appendChild(el("span", "activity-max", played ? "Best: " + best + " / " + max : "Up to " + max + " pts"));

      var status = el("span", "activity-status", played ? "✓" : "›");
      status.setAttribute("aria-label", played ? "Played" : "Not played yet");

      card.appendChild(icon);
      card.appendChild(text);
      card.appendChild(status);
      container.appendChild(card);
    });
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
        // The server total can be ahead of this phone (e.g. after a staff reset).
        var serverTotal = Number(rows[index].total) || 0;
        if (serverTotal > Arcade.getLocalTotal()) $("player-total").textContent = serverTotal;
      }
    });
  }

  function updatePendingNotice() {
    $("pending-notice").hidden = !Arcade.hasPendingScores();
  }

  // ======================================================================
  // Join form with live validation
  // ======================================================================

  var input = $("nickname-input");
  var hint = $("nickname-hint");
  var joinBtn = $("join-btn");
  var checkTimer = null;
  var checkId = 0; // ignores answers to old checks if the visitor kept typing

  function setHint(text, state) {
    hint.textContent = text;
    hint.className = "field-hint" + (state ? " " + state : "");
    input.classList.toggle("is-error", state === "error");
    input.classList.toggle("is-ok", state === "ok");
  }

  input.addEventListener("input", function () {
    clearTimeout(checkTimer);
    checkId++;
    var nickname = input.value.trim();

    if (!nickname) {
      setHint("3–16 characters: letters, numbers and _", "");
      return;
    }
    var problem = Arcade.validateNickname(nickname);
    if (problem) {
      setHint(problem, "error");
      return;
    }

    setHint("Checking…", "");
    var myId = checkId;
    checkTimer = setTimeout(function () {
      Arcade.isNicknameAvailable(nickname).then(function (r) {
        if (myId !== checkId) return; // outdated answer
        if (!r.ok) setHint(r.error, "error");
        else if (r.available) setHint("✓ " + nickname + " is available!", "ok");
        else setHint("This nickname is taken, try another one.", "error");
      });
    }, CHECK_DELAY_MS);
  });

  $("join-form").addEventListener("submit", function (e) {
    e.preventDefault();
    clearTimeout(checkTimer);
    checkId++;
    var nickname = input.value.trim();

    joinBtn.disabled = true;
    joinBtn.textContent = "Joining…";
    Arcade.join(nickname).then(function (r) {
      joinBtn.disabled = false;
      joinBtn.textContent = "Join the Arcade";
      if (r.ok) {
        render();
        window.scrollTo(0, 0);
      } else {
        setHint(r.error, "error");
        input.focus();
      }
    });
  });

  // ======================================================================
  // Start
  // ======================================================================

  Arcade.enableStaffReset($("sb-logo"), function () {
    input.value = "";
    setHint("3–16 characters: letters, numbers and _", "");
    render();
    window.scrollTo(0, 0);
  });

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
})();
