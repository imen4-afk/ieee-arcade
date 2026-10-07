/*
 * IEEE Arcade – phone leaderboard (leaderboard.html)
 * Top 50 players; tap a row to see the score per activity. Auto-refresh every 20 s.
 */
(function () {
  "use strict";

  var Arcade = window.IEEEArcade;
  var REFRESH_MS = 20000;
  var SHOW_TOP = 50;

  var list = document.getElementById("lb-list");
  var status = document.getElementById("lb-status");
  var refreshBtn = document.getElementById("lb-refresh");
  var me = Arcade.getNickname().toLowerCase();
  var expanded = {};     // nickname -> true, kept across refreshes
  var loading = false;

  // Supabase column name for an activity id: "game-2048" -> "game_2048"
  function column(activityId) { return activityId.replace(/-/g, "_"); }

  function medal(rank) {
    return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : String(rank);
  }

  function render(rows) {
    list.innerHTML = "";
    if (rows.length === 0) {
      var empty = document.createElement("li");
      empty.className = "lb-empty";
      empty.textContent = "No players yet. Be the first!";
      list.appendChild(empty);
      return;
    }

    rows.slice(0, SHOW_TOP).forEach(function (row, i) {
      var name = String(row.nickname);
      var key = name.toLowerCase();
      var li = document.createElement("li");
      li.className = "lb-row" + (key === me ? " me" : "") + (i < 3 ? " top" + (i + 1) : "");

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lb-main";
      btn.setAttribute("aria-expanded", expanded[key] ? "true" : "false");

      var rank = document.createElement("span");
      rank.className = "lb-rank";
      rank.textContent = medal(i + 1);
      var nick = document.createElement("span");
      nick.className = "lb-name";
      nick.textContent = name + (key === me ? " (you)" : "");
      var total = document.createElement("span");
      total.className = "lb-total";
      total.textContent = Number(row.total) || 0;

      btn.appendChild(rank);
      btn.appendChild(nick);
      btn.appendChild(total);

      var details = document.createElement("dl");
      details.className = "lb-details";
      details.hidden = !expanded[key];
      Arcade.ACTIVITIES.forEach(function (a) {
        var dt = document.createElement("dt");
        dt.textContent = a.icon + " " + a.title;
        var dd = document.createElement("dd");
        var v = row[column(a.id)];
        dd.textContent = v === null || v === undefined ? "–" : v;
        details.appendChild(dt);
        details.appendChild(dd);
      });

      btn.addEventListener("click", function () {
        expanded[key] = !expanded[key];
        details.hidden = !expanded[key];
        btn.setAttribute("aria-expanded", expanded[key] ? "true" : "false");
      });

      li.appendChild(btn);
      li.appendChild(details);
      list.appendChild(li);
    });
  }

  function refresh() {
    if (loading) return;
    loading = true;
    refreshBtn.disabled = true;
    Arcade.getLeaderboard().then(function (result) {
      loading = false;
      refreshBtn.disabled = false;
      if (!result.ok) {
        status.textContent = "⚠️ " + result.error;
        return;
      }
      render(result.rows);
      status.textContent = result.rows.length + " player" + (result.rows.length === 1 ? "" : "s") +
        " · updated " + new Date().toLocaleTimeString();
    });
  }

  refreshBtn.addEventListener("click", refresh);
  setInterval(function () {
    if (!document.hidden) refresh();
  }, REFRESH_MS);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refresh();
  });

  refresh();
})();
