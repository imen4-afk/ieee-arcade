/*
 * IEEE Arcade – big-screen dashboard (dashboard.html)
 * Top 10 with podium colors, best quiz master / best gamer, live stats.
 * Refreshes every 10 s; rows slide to their new place when ranks change,
 * and new players get a short glow.
 */
(function () {
  "use strict";

  var Arcade = window.IEEEArcade;
  var REFRESH_MS = 10000;
  var TOP = 10;
  var PUBLIC_URL = "ieee-arcade.vercel.app"; // shown under the QR code

  function $(id) { return document.getElementById(id); }
  function num(v) { return Number(v) || 0; }
  function fmt(n) { return num(n).toLocaleString("en-US"); }

  var knownPlayers = null;  // nicknames seen in the previous refresh (null = first load)
  var loading = false;

  // ---------- Top 10 with FLIP animation ----------

  function renderBoard(rows) {
    var list = $("dash-list");
    var top = rows.slice(0, TOP);
    $("dash-empty").hidden = top.length > 0;

    // 1. remember where each row was
    var before = {};
    Array.prototype.forEach.call(list.children, function (li) {
      before[li.dataset.key] = { y: li.getBoundingClientRect().top, rank: Number(li.dataset.rank) };
    });

    // 2. rebuild the list
    list.innerHTML = "";
    top.forEach(function (row, i) {
      var key = String(row.nickname).toLowerCase();
      var li = document.createElement("li");
      li.className = "dash-row rank-" + (i + 1);
      li.dataset.key = key;
      li.dataset.rank = i + 1;

      addCell(li, "c-rank", i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1);
      addCell(li, "c-name", row.nickname);
      // Totals per type (from js/activities.js), so the table fits however many games there are
      addCell(li, "c-sum", fmt(Arcade.totalOfType(row, "quiz")));
      addCell(li, "c-sum", fmt(Arcade.totalOfType(row, "game")));
      addCell(li, "c-total", fmt(row.total));

      if (knownPlayers && !knownPlayers[key]) li.classList.add("is-new");
      list.appendChild(li);
    });

    // 3. slide rows from their old position to the new one
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    Array.prototype.forEach.call(list.children, function (li) {
      var old = before[li.dataset.key];
      if (!old) return;
      var dy = old.y - li.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      if (Number(li.dataset.rank) < old.rank) {
        li.classList.add("moved-up");
        setTimeout(function () { li.classList.remove("moved-up"); }, 4000);
      }
      li.style.transition = "none";
      li.style.transform = "translateY(" + dy + "px)";
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          li.style.transition = "transform 0.7s cubic-bezier(.2,.8,.2,1)";
          li.style.transform = "";
        });
      });
    });
  }

  function addCell(row, className, text) {
    var span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    row.appendChild(span);
  }

  // ---------- Side panels ----------

  // Highest sum of one type ("quiz" or "game") of scores
  function best(rows, type) {
    var winner = null;
    var bestSum = 0;
    rows.forEach(function (row) {
      var sum = Arcade.totalOfType(row, type);
      if (sum > bestSum) { bestSum = sum; winner = row.nickname; }
    });
    return { name: winner, points: bestSum };
  }

  function renderAwards(rows) {
    var quiz = best(rows, "quiz");
    $("best-quiz").textContent = quiz.name || "–";
    $("best-quiz-score").textContent = quiz.name ? fmt(quiz.points) + " quiz points" : "Waiting for the first quiz…";

    var gamer = best(rows, "game");
    $("best-gamer").textContent = gamer.name || "–";
    $("best-gamer-score").textContent = gamer.name ? fmt(gamer.points) + " game points" : "Waiting for the first game…";
  }

  function renderStats(rows) {
    Arcade.getStats().then(function (s) {
      if (s.ok) {
        $("stat-players").textContent = fmt(s.players);
        $("stat-points").textContent = fmt(s.totalPoints);
      } else {
        // fallback: what the top 100 tells us
        $("stat-players").textContent = fmt(rows.length) + (rows.length >= 100 ? "+" : "");
        $("stat-points").textContent = fmt(rows.reduce(function (s, r) { return s + num(r.total); }, 0));
      }
    });
  }

  // ---------- Refresh loop ----------

  function refresh() {
    if (loading) return;
    loading = true;
    Arcade.getLeaderboard().then(function (result) {
      loading = false;
      var status = $("dash-status");
      if (!result.ok) {
        status.textContent = "⚠️ Offline, retrying…";
        status.classList.add("offline");
        return;
      }
      var rows = result.rows;
      renderBoard(rows);
      renderAwards(rows);
      renderStats(rows);

      var seen = {};
      rows.forEach(function (r) { seen[String(r.nickname).toLowerCase()] = true; });
      knownPlayers = seen;

      status.classList.remove("offline");
      status.textContent = "Live · updated " + new Date().toLocaleTimeString();
    });
  }

  // ---------- Fullscreen ----------

  var fsBtn = $("dash-fullscreen");
  var root = document.documentElement;
  var canFullscreen = !!(root.requestFullscreen || root.webkitRequestFullscreen);
  fsBtn.hidden = !canFullscreen;

  fsBtn.addEventListener("click", function () {
    try {
      var isFull = document.fullscreenElement || document.webkitFullscreenElement;
      if (isFull) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
    } catch (e) { /* fullscreen refused: ignore */ }
  });
  document.addEventListener("fullscreenchange", function () {
    fsBtn.style.opacity = document.fullscreenElement ? "0.25" : "1";
  });

  // ---------- Next event (from data/events.json) ----------

  function refreshNextEvent() {
    if (!window.IEEEEvents || !window.IEEEEventFormat) return;
    window.IEEEEvents.loadUpcoming().then(function (r) { // from data/events.json
      var ev = r.ok && r.events[0];
      $("dash-next").hidden = !ev;
      if (ev) {
        // same date formatting as the event cards (js/events-format.js)
        $("dash-next-text").textContent = ev.title + " · " + window.IEEEEventFormat.shortText(ev);
      }
    });
  }

  $("dash-url").textContent = PUBLIC_URL;
  refresh();
  setInterval(refresh, REFRESH_MS);
  refreshNextEvent();
  setInterval(refreshNextEvent, 5 * 60 * 1000);
})();
