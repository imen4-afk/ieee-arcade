/*
 * IEEE Arcade – hub page (index.html)
 * Shows the name form on the first visit, then the passport, the game/quiz cards
 * and the reward screen. All data comes from js/passport.js (window.IEEEArcade).
 */
(function () {
  "use strict";

  var Arcade = window.IEEEArcade;
  var RESET_HOLD_MS = 3000; // long-press duration on the logo for the staff reset

  function $(id) { return document.getElementById(id); }

  // ---------- Rendering ----------

  function render() {
    var name = Arcade.getName();
    $("welcome").hidden = !!name;
    $("hub").hidden = !name;
    if (!name) return;

    $("visitor-name").textContent = name;
    renderPassport();
    renderCards("games-list", "game");
    renderCards("quizzes-list", "quiz");
  }

  function renderPassport() {
    var total = Arcade.BADGES.length;
    var count = Arcade.getBadgeCount();
    var needed = Arcade.REWARD_THRESHOLD;

    $("progress-fill").style.width = Math.round((count / total) * 100) + "%";
    $("progress").setAttribute("aria-valuemax", total);
    $("progress").setAttribute("aria-valuenow", count);
    $("progress-text").textContent = count + " / " + total + " badges";

    var hint;
    if (count >= total) {
      hint = "Wow, you collected every badge! 🏆";
    } else if (count >= needed) {
      hint = "Reward unlocked! Keep playing to beat your scores.";
    } else {
      var left = needed - count;
      hint = "Earn " + left + " more badge" + (left > 1 ? "s" : "") + " to unlock your reward.";
    }
    $("progress-hint").textContent = hint;
    $("claim-btn").disabled = !Arcade.canClaimReward();
  }

  function renderCards(containerId, type) {
    var container = $(containerId);
    var badges = Arcade.getBadges();
    container.innerHTML = "";

    Arcade.BADGES.filter(function (b) { return b.type === type; }).forEach(function (b) {
      var earned = badges[b.id];

      var card = document.createElement("a");
      card.className = "activity" + (earned ? " done" : "");
      card.href = b.url;

      var icon = document.createElement("span");
      icon.className = "activity-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = b.icon;

      var text = document.createElement("span");
      text.className = "activity-text";
      var title = document.createElement("strong");
      title.textContent = b.title;
      var sub = document.createElement("span");
      sub.textContent = earned ? "Best score: " + earned.score : b.subtitle;
      text.appendChild(title);
      text.appendChild(sub);

      var status = document.createElement("span");
      status.className = "activity-status";
      status.textContent = earned ? "✓" : "›";
      status.setAttribute("aria-label", earned ? "Badge earned" : "Not played yet");

      card.appendChild(icon);
      card.appendChild(text);
      card.appendChild(status);
      container.appendChild(card);
    });
  }

  // ---------- Reward screen ----------

  var clockTimer = null;

  function updateClock() {
    // A live clock shows staff that this is the real page, not an old screenshot.
    $("reward-clock").textContent = new Date().toLocaleTimeString();
  }

  function openReward() {
    if (!Arcade.canClaimReward()) return;
    var badges = Arcade.getBadges();

    $("reward-name").textContent = Arcade.getName();
    $("reward-count").textContent = Arcade.getBadgeCount() + " / " + Arcade.BADGES.length;
    $("reward-score").textContent = Arcade.getTotalScore();

    var list = $("reward-badges");
    list.innerHTML = "";
    Arcade.BADGES.forEach(function (b) {
      if (!badges[b.id]) return;
      var li = document.createElement("li");
      li.textContent = b.icon + " " + b.title;
      list.appendChild(li);
    });

    updateClock();
    clockTimer = setInterval(updateClock, 1000);
    $("reward").hidden = false;
    document.body.style.overflow = "hidden";
    $("reward-close").focus();
  }

  function closeReward() {
    clearInterval(clockTimer);
    $("reward").hidden = true;
    document.body.style.overflow = "";
  }

  // ---------- Hidden staff reset: long-press the logo for 3 seconds ----------

  function setupStaffReset() {
    var logo = $("logo");
    var timer = null;

    function start(e) {
      if (e.button !== undefined && e.button !== 0) return; // left mouse / touch only
      cancel();
      logo.classList.add("pressing");
      timer = setTimeout(function () {
        timer = null;
        logo.classList.remove("pressing");
        if (window.confirm("Staff reset: clear this visitor's name and all badges?")) {
          Arcade.reset();
          closeReward();
          $("name-input").value = "";
          render();
          window.scrollTo(0, 0);
        }
      }, RESET_HOLD_MS);
    }

    function cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      logo.classList.remove("pressing");
    }

    logo.addEventListener("pointerdown", start);
    logo.addEventListener("pointerup", cancel);
    logo.addEventListener("pointerleave", cancel);
    logo.addEventListener("pointercancel", cancel);
    // Stop the phone's own long-press menu from appearing.
    logo.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  // ---------- Events ----------

  $("name-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("name-input").value.trim();
    if (!name) return;
    Arcade.setName(name);
    render();
    window.scrollTo(0, 0);
  });

  $("claim-btn").addEventListener("click", openReward);
  $("reward-close").addEventListener("click", closeReward);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("reward").hidden) closeReward();
  });

  // When the visitor comes back from a game with the browser's Back button,
  // the page may be restored from cache: refresh the badges.
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) render();
  });

  setupStaffReset();
  render();
})();
