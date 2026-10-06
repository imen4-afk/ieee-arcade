/*
 * IEEE Arcade – shared module (used by every page)
 * ------------------------------------------------
 * Needs js/config.js to be loaded first.
 *
 *   IEEEArcade.getNickname()                 -> "Imen_44" or ""
 *   IEEEArcade.join("Imen_44")               -> Promise<{ ok: true } | { ok: false, error: "..." }>
 *   IEEEArcade.submitScore("game-2048", 340) -> { points: 340, best: 410, isNewBest: false }
 *                                               (saved locally at once, sent to Supabase in the background)
 *   IEEEArcade.getLocalBests()               -> { "game-2048": 410, "quiz-ieee": 1200, ... }
 *   IEEEArcade.getLeaderboard()              -> Promise<{ ok: true, rows: [...] } | { ok: false, error: "..." }>
 *   IEEEArcade.reset()                       -> clears this phone (staff only)
 *
 * Scores that can't be sent (bad Wi-Fi) are queued in localStorage and retried
 * on every page load, every 30 seconds, and when the phone comes back online.
 */
(function () {
  "use strict";

  // ======================================================================
  // Activities. "url" is relative to the site root (index.html).
  // The id must match the ids used in the Supabase submit_score() function.
  // ======================================================================
  var ACTIVITIES = [
    { id: "quiz-ieee",   type: "quiz", icon: "🌍", title: "IEEE 101",                     subtitle: "How well do you know IEEE?",     url: "quiz.html?set=quiz-ieee" },
    { id: "quiz-cs",     type: "quiz", icon: "💻", title: "Computer Society & Standards", subtitle: "Wi-Fi, Ethernet, floating point…", url: "quiz.html?set=quiz-cs" },
    { id: "quiz-sb",     type: "quiz", icon: "🎓", title: "Our Student Branch",           subtitle: "Meet the ISIMA Student Branch",   url: "quiz.html?set=quiz-sb" },
    { id: "game-2048",   type: "game", icon: "🧩", title: "IEEE Journey",                 subtitle: "2048 – from Curious to IEEE Hero", url: "games/2048/index.html" },
    { id: "game-trex",   type: "game", icon: "🐞", title: "Bug Runner",                   subtitle: "Dodge the bugs, tap to jump",      url: "games/t-rex/index.html" },
    { id: "game-memory", type: "game", icon: "🃏", title: "Tech Match",                   subtitle: "Find the 8 tech pairs",            url: "games/memory/index.html" }
  ];

  // ======================================================================
  // SCORING – every formula lives here so it's easy to tune.
  // Keep MAX_POINTS in sync with the caps in the Supabase submit_score() function.
  // ======================================================================
  var MAX_POINTS = { quiz: 1500, game: 500 };

  var SCORING = {
    QUIZ_QUESTIONS_PER_RUN: 10,
    QUIZ_POINTS_PER_CORRECT: 100,
    QUIZ_MAX_SPEED_BONUS: 50,

    // One quiz answer: 100 points + up to 50 bonus for answering fast. Wrong or timeout = 0.
    quizAnswer: function (isCorrect, secondsLeft, secondsTotal) {
      if (!isCorrect) return 0;
      var ratio = secondsTotal > 0 ? Math.max(0, Math.min(1, secondsLeft / secondsTotal)) : 0;
      return SCORING.QUIZ_POINTS_PER_CORRECT + Math.round(SCORING.QUIZ_MAX_SPEED_BONUS * ratio);
    },

    // 2048: the original game score divided by 20.
    game2048: function (gameScore) {
      return Math.min(MAX_POINTS.game, Math.floor(gameScore / 20));
    },

    // Bug Runner (t-rex): the distance score divided by 2.
    trex: function (distanceScore) {
      return Math.min(MAX_POINTS.game, Math.floor(distanceScore / 2));
    },

    // Tech Match: fewer moves and less time = more points (minimum 50 for finishing).
    memory: function (moves, seconds) {
      return Math.min(MAX_POINTS.game, Math.max(50, 500 - moves * 8 - seconds));
    }
  };

  // ======================================================================
  // Settings
  // ======================================================================
  var KEY_NICKNAME = "ieeeArcade.nickname";
  var KEY_BESTS = "ieeeArcade.bests";
  var KEY_QUEUE = "ieeeArcade.queue";
  var RETRY_EVERY_MS = 30000;
  var REQUEST_TIMEOUT_MS = 8000;
  var NICKNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

  var config = window.ARCADE_CONFIG || {};

  // ---------- localStorage helpers (never crash) ----------

  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      var value = JSON.parse(raw);
      return value && typeof value === "object" ? value : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage blocked or full: ignore */ }
  }

  function readText(key) {
    try {
      return window.localStorage.getItem(key) || "";
    } catch (e) {
      return "";
    }
  }

  function writeText(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) { /* ignore */ }
  }

  // ---------- Supabase REST helper (never throws) ----------

  function isConfigured() {
    return /^https:\/\//.test(config.SUPABASE_URL || "") &&
      !!config.SUPABASE_ANON_KEY && config.SUPABASE_ANON_KEY !== "PASTE_ANON_KEY";
  }

  // Returns { ok, status, data } or { ok: false, status: 0 } when the network fails.
  function request(method, path, body, extraHeaders) {
    if (!isConfigured()) return Promise.resolve({ ok: false, status: 0, notConfigured: true });

    var headers = {
      apikey: config.SUPABASE_ANON_KEY,
      Authorization: "Bearer " + config.SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    };
    for (var h in extraHeaders) headers[h] = extraHeaders[h];

    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;

    try {
      return fetch(config.SUPABASE_URL.replace(/\/+$/, "") + path, {
        method: method,
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller ? controller.signal : undefined
      }).then(function (res) {
        clearTimeout(timer);
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
          return { ok: res.ok, status: res.status, data: data };
        });
      }).catch(function () {
        clearTimeout(timer);
        return { ok: false, status: 0 };
      });
    } catch (e) {
      clearTimeout(timer);
      return Promise.resolve({ ok: false, status: 0 });
    }
  }

  function networkError(result) {
    if (result.notConfigured) return "The scoreboard isn't set up yet (missing js/config.js values).";
    return "No connection. Check your Wi-Fi and try again.";
  }

  // ---------- Nickname ----------

  function getNickname() {
    return readText(KEY_NICKNAME);
  }

  // Returns "" if the nickname is valid, otherwise a friendly message.
  function validateNickname(nickname) {
    nickname = String(nickname || "").trim();
    if (nickname.length < 3) return "At least 3 characters, please.";
    if (nickname.length > 16) return "16 characters maximum.";
    if (!NICKNAME_PATTERN.test(nickname)) return "Only letters, numbers and _ (no spaces or accents).";
    return "";
  }

  // Live check while typing. Resolves { ok, available } or { ok: false, error }.
  function isNicknameAvailable(nickname) {
    nickname = String(nickname || "").trim();
    // "_" is a wildcard in ilike, so escape it to match it literally.
    var pattern = nickname.replace(/_/g, "\\_");
    return request("GET", "/rest/v1/players?select=nickname&nickname=ilike." + encodeURIComponent(pattern))
      .then(function (r) {
        if (!r.ok) return { ok: false, error: networkError(r) };
        return { ok: true, available: !(Array.isArray(r.data) && r.data.length > 0) };
      });
  }

  // Registers the nickname on Supabase, then saves it on this phone.
  function join(nickname) {
    nickname = String(nickname || "").trim();
    var invalid = validateNickname(nickname);
    if (invalid) return Promise.resolve({ ok: false, error: invalid });
    if (getNickname()) return Promise.resolve({ ok: false, error: "You already joined as " + getNickname() + "." });

    return request("POST", "/rest/v1/players", { nickname: nickname }, { Prefer: "return=minimal" })
      .then(function (r) {
        if (r.ok) {
          writeText(KEY_NICKNAME, nickname);
          return { ok: true };
        }
        if (r.status === 409) return { ok: false, error: "This nickname is taken, try another one." };
        if (r.status === 0) return { ok: false, error: networkError(r) };
        return { ok: false, error: "That nickname wasn't accepted. Try another one." };
      });
  }

  // ---------- Scores ----------

  function findActivity(id) {
    for (var i = 0; i < ACTIVITIES.length; i++) {
      if (ACTIVITIES[i].id === id) return ACTIVITIES[i];
    }
    return null;
  }

  function maxPointsFor(activityId) {
    var activity = findActivity(activityId);
    return activity ? MAX_POINTS[activity.type] : 0;
  }

  function getLocalBests() {
    return readJSON(KEY_BESTS, {});
  }

  function getLocalTotal() {
    var bests = getLocalBests();
    return ACTIVITIES.reduce(function (sum, a) { return sum + (bests[a.id] || 0); }, 0);
  }

  // Saves the score locally right away and sends it in the background.
  // Returns { points, best, isNewBest } so the page can show "+340 points! Best: 410".
  function submitScore(activityId, score) {
    var max = maxPointsFor(activityId);
    var points = Math.max(0, Math.min(max, Math.round(Number(score) || 0)));

    var bests = getLocalBests();
    var previous = bests[activityId] || 0;
    var isNewBest = points > previous;
    if (isNewBest) {
      bests[activityId] = points;
      writeJSON(KEY_BESTS, bests);
    }

    if (max && points > 0 && getNickname()) {
      var queue = readJSON(KEY_QUEUE, {});
      queue[activityId] = Math.max(queue[activityId] || 0, points); // keep only the best pending score
      writeJSON(KEY_QUEUE, queue);
      flushQueue();
    }

    return { points: points, best: Math.max(points, previous), isNewBest: isNewBest };
  }

  // Sends every queued score. Scores stay queued if the network fails.
  var flushing = false;
  var flushAgain = false;
  // Status codes meaning "the server refused this score for good" (bad data, player deleted…).
  var DROP_STATUSES = [400, 404, 409, 422];

  function flushQueue() {
    var nickname = getNickname();
    var queue = readJSON(KEY_QUEUE, {});
    var ids = Object.keys(queue);
    if (flushing) { flushAgain = true; return Promise.resolve(); }
    if (!nickname || ids.length === 0) return Promise.resolve();
    flushing = true;

    var chain = Promise.resolve();
    ids.forEach(function (id) {
      chain = chain.then(function () {
        return request("POST", "/rest/v1/rpc/submit_score", {
          p_nickname: nickname, p_activity: id, p_score: queue[id]
        }).then(function (r) {
          // Sent, or refused for good (e.g. player deleted by staff): remove it from the queue.
          // Network error, wrong key or server down: keep it for the next retry.
          if (r.ok || DROP_STATUSES.indexOf(r.status) !== -1) {
            var current = readJSON(KEY_QUEUE, {});
            if (current[id] === queue[id]) delete current[id]; // unless a better score was queued meanwhile
            writeJSON(KEY_QUEUE, current);
          }
        });
      });
    });

    function done() {
      flushing = false;
      if (flushAgain) { flushAgain = false; flushQueue(); }
    }
    return chain.then(done, done);
  }

  function hasPendingScores() {
    return Object.keys(readJSON(KEY_QUEUE, {})).length > 0;
  }

  // ---------- Leaderboard ----------

  // rows: [{ nickname, total, game_2048, game_trex, game_memory, quiz_ieee, quiz_cs, quiz_sb }]
  function getLeaderboard() {
    return request("POST", "/rest/v1/rpc/get_leaderboard", {}).then(function (r) {
      if (!r.ok || !Array.isArray(r.data)) return { ok: false, error: networkError(r) };
      return { ok: true, rows: r.data };
    });
  }

  // ---------- Staff reset ----------

  function reset() {
    try {
      window.localStorage.removeItem(KEY_NICKNAME);
      window.localStorage.removeItem(KEY_BESTS);
      window.localStorage.removeItem(KEY_QUEUE);
    } catch (e) { /* ignore */ }
  }

  // Long-press an element for 3 s → confirm → reset → callback. Used on the SB logo.
  function enableStaffReset(element, onReset) {
    if (!element) return;
    var HOLD_MS = 3000;
    var timer = null;

    function cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      element.classList.remove("pressing");
    }

    element.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      cancel();
      element.classList.add("pressing");
      timer = setTimeout(function () {
        timer = null;
        element.classList.remove("pressing");
        if (window.confirm("Staff reset: forget this phone's nickname and scores?\n(Scores already on the scoreboard stay there.)")) {
          reset();
          if (onReset) onReset();
        }
      }, HOLD_MS);
    });
    element.addEventListener("pointerup", cancel);
    element.addEventListener("pointerleave", cancel);
    element.addEventListener("pointercancel", cancel);
    element.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  // ---------- Background retry of queued scores ----------

  flushQueue();
  setInterval(flushQueue, RETRY_EVERY_MS);
  window.addEventListener("online", flushQueue);

  window.IEEEArcade = {
    ACTIVITIES: ACTIVITIES,
    MAX_POINTS: MAX_POINTS,
    SCORING: SCORING,
    isConfigured: isConfigured,
    getNickname: getNickname,
    validateNickname: validateNickname,
    isNicknameAvailable: isNicknameAvailable,
    join: join,
    submitScore: submitScore,
    getLocalBests: getLocalBests,
    getLocalTotal: getLocalTotal,
    maxPointsFor: maxPointsFor,
    hasPendingScores: hasPendingScores,
    flushQueue: flushQueue,
    getLeaderboard: getLeaderboard,
    enableStaffReset: enableStaffReset,
    reset: reset
  };
})();
