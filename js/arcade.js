/*
 * IEEE Arcade – shared module (used by every page)
 * ------------------------------------------------
 * Needs js/config.js to be loaded first.
 *
 *   IEEEArcade.getNickname()                    -> "Imen_44" or "" (not logged in)
 *   IEEEArcade.register("Imen_44", "pass")      -> Promise<{ ok: true } | { ok: false, error: "..." }>
 *   IEEEArcade.login("Imen_44", "pass")         -> Promise<{ ok: true } | { ok: false, error: "..." }>
 *   IEEEArcade.logout()                         -> forgets the account and local data on this phone
 *   IEEEArcade.submitScore("game-2048", 340)    -> { points: 340, best: 410, isNewBest: false }
 *                                                  (saved locally at once, sent to Supabase in the background)
 *   IEEEArcade.getLocalBests()                  -> { "game-2048": 410, "quiz-ieee": 1200, ... }
 *   IEEEArcade.getLeaderboard()                 -> Promise<{ ok: true, rows: [...] } | { ok: false, error: "..." }>
 *
 * The session { nickname, token } comes from the Supabase register_player / login_player
 * functions. Every score is sent with the token. Scores that can't be sent (bad Wi-Fi)
 * are queued in localStorage together with their token, and retried on every page load,
 * every 30 seconds, and when the phone comes back online.
 * If the server says the token is no longer valid, the player is logged out and the
 * "ieeearcade:loggedout" event is fired (js/layout.js then shows the login screen).
 */
(function () {
  "use strict";

  // ======================================================================
  // Activities. "url" is relative to the site root (index.html).
  // The id must match the ids used in the Supabase submit_score() function.
  // ======================================================================
  var ACTIVITIES = [
    { id: "quiz-ieee",   type: "quiz", icon: "🌍", title: "IEEE 101",                      subtitle: "How well do you know IEEE?",        url: "quiz.html?set=quiz-ieee" },
    { id: "quiz-cs",     type: "quiz", icon: "💻", title: "Tech Basics",                   subtitle: "Easy tech questions for beginners", url: "quiz.html?set=quiz-cs" },
    { id: "quiz-sb",     type: "quiz", icon: "🎓", title: "Our Student Branch & Chapters", subtitle: "CS, CIS, RAS, WIE and our events",  url: "quiz.html?set=quiz-sb" },
    { id: "game-2048",   type: "game", icon: "🧩", title: "IEEE Journey",                  subtitle: "2048 – from Curious to IEEE Hero",  url: "games/2048/index.html" },
    { id: "game-trex",   type: "game", icon: "🐞", title: "Ezzdin 101",                    subtitle: "Help Ezzdin dodge the bugs!",      url: "games/t-rex/index.html" },
    { id: "game-memory", type: "game", icon: "🃏", title: "Tech Match",                    subtitle: "Match our chapter & partner logos", url: "games/memory/index.html" }
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

    // One quiz answer: 100 points + up to 50 bonus, proportional to the time left. Wrong or timeout = 0.
    quizAnswer: function (isCorrect, secondsLeft, secondsTotal) {
      if (!isCorrect) return 0;
      var ratio = secondsTotal > 0 ? Math.max(0, Math.min(1, secondsLeft / secondsTotal)) : 0;
      return SCORING.QUIZ_POINTS_PER_CORRECT + Math.round(SCORING.QUIZ_MAX_SPEED_BONUS * ratio);
    },

    // 2048: the original game score divided by 20.
    game2048: function (gameScore) {
      return Math.min(MAX_POINTS.game, Math.floor(gameScore / 20));
    },

    // Ezzdin 101 (t-rex runner): the distance score divided by 2.
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
  var KEY_SESSION = "ieeeArcade.session";     // { nickname, token }
  var KEY_BESTS = "ieeeArcade.bests";         // { activityId: best points }
  var KEY_QUEUE = "ieeeArcade.queue";         // { activityId: { score, nickname, token } }
  var LEGACY_KEYS = ["ieeeArcade.nickname"];  // from the version without passwords
  var GAME_KEYS = ["bestScore", "gameState"]; // saved by the original 2048 game
  // "already subscribed / dismissed" flags of js/subscribe.js (never the email itself)
  var REMINDER_KEYS = ["ieeeArcade.remindersSubscribed", "ieeeArcade.remindersDismissed"];
  var RETRY_EVERY_MS = 30000;
  var REQUEST_TIMEOUT_MS = 8000;
  var NICKNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
  var MIN_PASSWORD = 4;

  // Server error codes (the "message" of an HTTP 400) → friendly text
  var ERROR_TEXT = {
    nickname_taken: "This nickname is already taken. If it's yours, use Log in.",
    invalid_nickname: "3–16 characters: letters, numbers or _ only.",
    weak_password: "Password must be at least 4 characters.",
    invalid_login: "Wrong nickname or password.",
    unknown_activity: "This game isn't on the scoreboard."
  };

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

  function removeKeys(keys) {
    keys.forEach(function (key) {
      try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
    });
  }

  // ---------- Supabase REST helper (never throws) ----------

  function isConfigured() {
    return /^https:\/\//.test(config.SUPABASE_URL || "") &&
      !!config.SUPABASE_ANON_KEY && config.SUPABASE_ANON_KEY !== "PASTE_ANON_KEY";
  }

  // Returns { ok, status, data, headers } or { ok: false, status: 0 } when the network fails.
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
          return { ok: res.ok, status: res.status, data: data, headers: res.headers };
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

  // The error code sent by our SQL functions, e.g. "nickname_taken" (or "").
  function errorCode(result) {
    var message = result && result.data && typeof result.data === "object" ? result.data.message : "";
    return typeof message === "string" ? message : "";
  }

  function friendlyError(result) {
    if (result.notConfigured) return "The scoreboard isn't set up yet (missing js/config.js values).";
    if (result.status === 0) return "No connection. Check your Wi-Fi and try again.";
    return ERROR_TEXT[errorCode(result)] || "Something went wrong. Please try again.";
  }

  // ---------- Session (nickname + token) ----------

  function getSession() {
    var s = readJSON(KEY_SESSION, null);
    return s && typeof s.nickname === "string" && typeof s.token === "string" && s.nickname && s.token ? s : null;
  }

  function getNickname() {
    var s = getSession();
    return s ? s.nickname : "";
  }

  function isLoggedIn() {
    return !!getSession();
  }

  // Returns "" if the nickname is valid, otherwise a friendly message.
  function validateNickname(nickname) {
    nickname = String(nickname || "").trim();
    if (!NICKNAME_PATTERN.test(nickname)) return ERROR_TEXT.invalid_nickname;
    return "";
  }

  function validatePassword(password) {
    return String(password || "").length >= MIN_PASSWORD ? "" : ERROR_TEXT.weak_password;
  }

  // Live check while typing on "Create account". Resolves { ok, available } or { ok: false }.
  function isNicknameAvailable(nickname) {
    nickname = String(nickname || "").trim();
    // "_" is a wildcard in ilike, so escape it to match it literally.
    var pattern = nickname.replace(/_/g, "\\_");
    return request("GET", "/rest/v1/players?select=nickname&nickname=ilike." + encodeURIComponent(pattern))
      .then(function (r) {
        if (!r.ok || !Array.isArray(r.data)) return { ok: false };
        return { ok: true, available: r.data.length === 0 };
      });
  }

  // register_player / login_player share the same answer: [{ nickname, token }]
  function authenticate(rpc, nickname, password) {
    nickname = String(nickname || "").trim();
    var problem = validateNickname(nickname) || validatePassword(password);
    if (problem) return Promise.resolve({ ok: false, error: problem });

    return request("POST", "/rest/v1/rpc/" + rpc, { p_nickname: nickname, p_password: String(password) })
      .then(function (r) {
        var row = Array.isArray(r.data) ? r.data[0] : r.data;
        if (!r.ok || !row || !row.token) return { ok: false, error: friendlyError(r) };

        // Start clean on this phone: forget another account's local data.
        clearLocalData();
        writeJSON(KEY_SESSION, { nickname: String(row.nickname || nickname), token: String(row.token) });
        return syncBestsFromServer().then(function () { return { ok: true }; });
      });
  }

  function register(nickname, password) { return authenticate("register_player", nickname, password); }
  function login(nickname, password) { return authenticate("login_player", nickname, password); }

  function clearLocalData() {
    removeKeys([KEY_SESSION, KEY_BESTS, KEY_QUEUE].concat(LEGACY_KEYS, GAME_KEYS, REMINDER_KEYS));
  }

  // Log out: forget the nickname, token and local scores on this phone.
  // (Scores already on the scoreboard stay there.)
  function logout() {
    clearLocalData();
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

  // After logging in (e.g. on a new phone): copy the player's best scores from the scoreboard.
  function syncBestsFromServer() {
    var nickname = getNickname();
    if (!nickname) return Promise.resolve();
    return getLeaderboard().then(function (result) {
      if (!result.ok) return;
      var row = null;
      result.rows.forEach(function (r) {
        if (String(r.nickname).toLowerCase() === nickname.toLowerCase()) row = r;
      });
      if (!row) return;
      var bests = getLocalBests();
      ACTIVITIES.forEach(function (a) {
        var server = Number(row[a.id.replace(/-/g, "_")]) || 0;
        if (server > (bests[a.id] || 0)) bests[a.id] = server;
      });
      writeJSON(KEY_BESTS, bests);
    });
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

    var session = getSession();
    if (max && points > 0 && session) {
      var queue = readJSON(KEY_QUEUE, {});
      var pending = queue[activityId];
      // keep only the best pending score per activity (for this account)
      if (!pending || pending.token !== session.token || points > pending.score) {
        queue[activityId] = { score: points, nickname: session.nickname, token: session.token };
        writeJSON(KEY_QUEUE, queue);
      }
      flushQueue();
    }

    return { points: points, best: Math.max(points, previous), isNewBest: isNewBest };
  }

  // Sends every queued score. Scores stay queued if the network fails.
  var flushing = false;
  var flushAgain = false;
  // Status codes meaning "the server refused this score for good".
  var DROP_STATUSES = [400, 404, 409, 422];

  function isValidEntry(entry) {
    return entry && typeof entry === "object" && typeof entry.token === "string" &&
      typeof entry.nickname === "string" && typeof entry.score === "number";
  }

  function flushQueue() {
    if (flushing) { flushAgain = true; return Promise.resolve(); }
    var queue = readJSON(KEY_QUEUE, {});
    var ids = Object.keys(queue);
    if (ids.length === 0) return Promise.resolve();
    flushing = true;

    var chain = Promise.resolve();
    ids.forEach(function (id) {
      var entry = queue[id];
      chain = chain.then(function () {
        if (!isValidEntry(entry)) { removeFromQueue(id, entry); return; } // old format without token
        return request("POST", "/rest/v1/rpc/submit_score", {
          p_nickname: entry.nickname, p_token: entry.token, p_activity: id, p_score: entry.score
        }).then(function (r) {
          if (!r.ok && errorCode(r) === "invalid_login") {
            handleInvalidToken(entry.token);
            return;
          }
          // Sent, or refused for good: remove it. Network error or server down: keep it for later.
          if (r.ok || DROP_STATUSES.indexOf(r.status) !== -1) removeFromQueue(id, entry);
        });
      });
    });

    function done() {
      flushing = false;
      if (flushAgain) { flushAgain = false; flushQueue(); }
    }
    return chain.then(done, done);
  }

  function removeFromQueue(id, entry) {
    var current = readJSON(KEY_QUEUE, {});
    // unless a better score was queued meanwhile
    if (JSON.stringify(current[id]) === JSON.stringify(entry)) delete current[id];
    writeJSON(KEY_QUEUE, current);
  }

  // The server doesn't accept this token any more (password reset, player deleted…).
  function handleInvalidToken(token) {
    var queue = readJSON(KEY_QUEUE, {});
    Object.keys(queue).forEach(function (id) {
      if (!queue[id] || queue[id].token === token) delete queue[id];
    });
    writeJSON(KEY_QUEUE, queue);

    var session = getSession();
    if (session && session.token === token) {
      logout();
      try {
        window.dispatchEvent(new CustomEvent("ieeearcade:loggedout", { detail: { reason: "invalid_login" } }));
      } catch (e) { /* very old browser: the next page load shows the login screen anyway */ }
    }
  }

  function hasPendingScores() {
    return Object.keys(readJSON(KEY_QUEUE, {})).length > 0;
  }

  // ---------- Leaderboard ----------

  // rows: [{ nickname, total, game_2048, game_trex, game_memory, quiz_ieee, quiz_cs, quiz_sb }]
  function getLeaderboard() {
    return request("POST", "/rest/v1/rpc/get_leaderboard", {}).then(function (r) {
      if (!r.ok || !Array.isArray(r.data)) return { ok: false, error: friendlyError(r) };
      return { ok: true, rows: r.data };
    });
  }

  // Global stats for the dashboard (the leaderboard only returns the top 100).
  // Resolves { ok, players, totalPoints } or { ok: false, error }.
  function getStats() {
    var PAGE = 1000;

    var countPlayers = request("GET", "/rest/v1/players?select=nickname&limit=1", undefined, { Prefer: "count=exact" })
      .then(function (r) {
        if (!r.ok) return null;
        // Content-Range looks like "0-0/42": the number after "/" is the total.
        var range = (r.headers && r.headers.get("Content-Range")) || "";
        var total = parseInt(range.split("/")[1], 10);
        return isNaN(total) ? null : total;
      });

    function sumScores(offset, sum) {
      return request("GET", "/rest/v1/scores?select=score&order=nickname,activity&limit=" + PAGE + "&offset=" + offset)
        .then(function (r) {
          if (!r.ok || !Array.isArray(r.data)) return null;
          r.data.forEach(function (row) { sum += Number(row.score) || 0; });
          return r.data.length === PAGE ? sumScores(offset + PAGE, sum) : sum;
        });
    }

    return Promise.all([countPlayers, sumScores(0, 0)]).then(function (results) {
      if (results[0] === null || results[1] === null) return { ok: false, error: "Stats unavailable" };
      return { ok: true, players: results[0], totalPoints: results[1] };
    });
  }

  // ---------- Staff shortcut: long-press the SB logo for 3 s = log out ----------

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
        if (window.confirm("Staff: log out this phone and clear its local data?\n(Scores already on the scoreboard stay there.)")) {
          logout();
          if (onReset) onReset();
        }
      }, HOLD_MS);
    });
    element.addEventListener("pointerup", cancel);
    element.addEventListener("pointerleave", cancel);
    element.addEventListener("pointercancel", cancel);
    element.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  // ---------- Start ----------

  // The version without passwords stored only a nickname: that player must log in now.
  if (!getSession()) removeKeys(LEGACY_KEYS);

  flushQueue();
  setInterval(flushQueue, RETRY_EVERY_MS);
  window.addEventListener("online", flushQueue);

  window.IEEEArcade = {
    ACTIVITIES: ACTIVITIES,
    MAX_POINTS: MAX_POINTS,
    SCORING: SCORING,
    MIN_PASSWORD: MIN_PASSWORD,
    isConfigured: isConfigured,
    getNickname: getNickname,
    isLoggedIn: isLoggedIn,
    validateNickname: validateNickname,
    validatePassword: validatePassword,
    isNicknameAvailable: isNicknameAvailable,
    register: register,
    login: login,
    logout: logout,
    reset: logout,
    submitScore: submitScore,
    getLocalBests: getLocalBests,
    getLocalTotal: getLocalTotal,
    syncBestsFromServer: syncBestsFromServer,
    maxPointsFor: maxPointsFor,
    hasPendingScores: hasPendingScores,
    flushQueue: flushQueue,
    getLeaderboard: getLeaderboard,
    getStats: getStats,
    enableStaffReset: enableStaffReset
  };
})();
