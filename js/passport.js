/*
 * IEEE Arcade – Passport
 * ----------------------
 * Small shared module that stores the visitor's name and badges in localStorage.
 * Every page (hub, quizzes, games) includes this file and uses window.IEEEArcade.
 *
 *   IEEEArcade.getName()              -> "Imen" or ""
 *   IEEEArcade.setName("Imen")
 *   IEEEArcade.award("game-2048", 1234) -> true if this is a NEW badge
 *   IEEEArcade.hasBadge("quiz-ieee")  -> true / false
 *   IEEEArcade.getBadges()            -> { "game-2048": { score: 1234, earnedAt: "..." }, ... }
 *   IEEEArcade.reset()                -> clears everything (staff only)
 *
 * To add a new game or quiz: add one entry to BADGES below. The hub builds its
 * cards from this list automatically.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "ieeeArcade.v1";

  // Number of badges needed to unlock the "Claim your reward" screen.
  var REWARD_THRESHOLD = 3;

  // All badges. "url" is relative to the site root (index.html).
  var BADGES = [
    { id: "game-2048",   type: "game", icon: "🧩", title: "IEEE Journey",    subtitle: "2048 – from Curious to IEEE Hero", url: "games/2048/index.html" },
    { id: "game-trex",   type: "game", icon: "🐞", title: "Bug Runner",      subtitle: "Dodge the bugs, tap to jump",       url: "games/t-rex/index.html" },
    { id: "game-memory", type: "game", icon: "🃏", title: "Tech Memory",     subtitle: "Find all 8 pairs",                  url: "games/memory/index.html" },
    { id: "quiz-ieee",   type: "quiz", icon: "🌍", title: "IEEE Quiz",       subtitle: "How well do you know IEEE?",        url: "quiz.html?set=quiz-ieee" },
    { id: "quiz-sb",     type: "quiz", icon: "🎓", title: "Our Branch Quiz", subtitle: "Meet the ISIMA Student Branch",     url: "quiz.html?set=quiz-sb" }
  ];

  // ---------- storage helpers (never crash if localStorage is blocked) ----------

  function emptyState() {
    return { name: "", badges: {} };
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return emptyState();
      if (typeof data.name !== "string") data.name = "";
      if (!data.badges || typeof data.badges !== "object") data.badges = {};
      return data;
    } catch (e) {
      return emptyState();
    }
  }

  function save(data) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false; // private mode / storage full: the game still works, progress just isn't saved
    }
  }

  // ---------- public API ----------

  function getName() {
    return load().name;
  }

  function setName(name) {
    var data = load();
    data.name = String(name || "").trim().slice(0, 30);
    save(data);
    return data.name;
  }

  // Awards a badge (or improves its best score). Returns true if the badge is new.
  function award(badgeId, score) {
    var data = load();
    var value = Math.max(0, Math.round(Number(score) || 0));
    var existing = data.badges[badgeId];
    if (existing) {
      if (value > existing.score) {
        existing.score = value;
        save(data);
      }
      return false;
    }
    data.badges[badgeId] = { score: value, earnedAt: new Date().toISOString() };
    save(data);
    return true;
  }

  function hasBadge(badgeId) {
    return Object.prototype.hasOwnProperty.call(load().badges, badgeId);
  }

  function getBadges() {
    return load().badges;
  }

  function getBadgeCount() {
    var badges = load().badges;
    // Only count badges that are still in the BADGES list.
    return BADGES.filter(function (b) { return badges[b.id]; }).length;
  }

  function getTotalScore() {
    var badges = load().badges;
    return BADGES.reduce(function (sum, b) {
      return sum + (badges[b.id] ? badges[b.id].score : 0);
    }, 0);
  }

  function canClaimReward() {
    return getBadgeCount() >= REWARD_THRESHOLD;
  }

  function reset() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
  }

  window.IEEEArcade = {
    BADGES: BADGES,
    REWARD_THRESHOLD: REWARD_THRESHOLD,
    getName: getName,
    setName: setName,
    award: award,
    hasBadge: hasBadge,
    getBadges: getBadges,
    getBadgeCount: getBadgeCount,
    getTotalScore: getTotalScore,
    canClaimReward: canClaimReward,
    reset: reset
  };
})();
