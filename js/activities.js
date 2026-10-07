/*
 * IEEE Arcade – the ONE list of every quiz and game
 * --------------------------------------------------
 * The hub, the leaderboard, the dashboard and the games all read names, lists and
 * score formulas from here. Load it before js/arcade.js:
 *   <script src="js/activities.js"></script>   (or ../../js/activities.js from a game folder)
 *
 * To add a new game:
 *   1. add an entry to LIST below (id, name, description, icon, type, category, url, ready: true)
 *      and its score formula to FORMULAS;
 *   2. in Supabase run:  insert into activities (id, max_points) values ('game-xxx', 500);
 *
 * "ready: false" hides a game that isn't built yet (its card doesn't appear on the hub).
 * maxPoints must match max_points in the Supabase "activities" table.
 */
(function () {
  "use strict";

  var QUIZ_MAX = 1500;
  var GAME_MAX = 500;

  // Order of the sections on the hub
  var CATEGORIES = [
    { id: "Quizzes", note: "up to 1500 pts each" },
    { id: "Arcade classics", note: "up to 500 pts each" },
    { id: "Brain games", note: "up to 500 pts each" }
  ];

  // url is relative to the site root (index.html)
  var LIST = [
    // ---- Quizzes ----
    { id: "quiz-ieee", name: "IEEE 101", description: "How well do you know IEEE?", icon: "🌍",
      type: "quiz", category: "Quizzes", url: "quiz.html?set=quiz-ieee", maxPoints: QUIZ_MAX, ready: true },
    { id: "quiz-cs", name: "Tech Basics", description: "Easy tech questions for beginners", icon: "💻",
      type: "quiz", category: "Quizzes", url: "quiz.html?set=quiz-cs", maxPoints: QUIZ_MAX, ready: true },
    { id: "quiz-sb", name: "Our Student Branch & Chapters", description: "CS, CIS, RAS, WIE and our events", icon: "🎓",
      type: "quiz", category: "Quizzes", url: "quiz.html?set=quiz-sb", maxPoints: QUIZ_MAX, ready: true },

    // ---- Arcade classics ----
    { id: "game-2048", name: "IEEE Journey", description: "2048 – from Curious to IEEE Hero", icon: "🧩",
      type: "game", category: "Arcade classics", url: "games/2048/index.html", maxPoints: GAME_MAX, ready: true },
    { id: "game-trex", name: "Ezzdin 101", description: "Help Ezzdin dodge the bugs!", icon: "🐞",
      type: "game", category: "Arcade classics", url: "games/t-rex/index.html", maxPoints: GAME_MAX, ready: true },
    { id: "game-whack", name: "Whack-a-Bug", description: "Squash the bugs, spare the features", icon: "🐛",
      type: "game", category: "Arcade classics", url: "games/whack/index.html", maxPoints: GAME_MAX, ready: true },
    { id: "game-flappy", name: "Flappy Ezzdin", description: "Fly Ezzdin through the firewalls", icon: "🪽",
      type: "game", category: "Arcade classics", url: "games/flappy/index.html", maxPoints: GAME_MAX, ready: true },
    { id: "game-hextris", name: "Hextris", description: "Match colors on the spinning hexagon", icon: "⬡",
      type: "game", category: "Arcade classics", url: "games/hextris/index.html", maxPoints: GAME_MAX, ready: true },
    { id: "game-tetris", name: "Tetris", description: "Stack the blocks, clear the lines", icon: "🧱",
      type: "game", category: "Arcade classics", url: "games/tetris/index.html", maxPoints: GAME_MAX, ready: true },

    // ---- Brain games ----
    { id: "game-memory", name: "Tech Match", description: "Match our chapter & partner logos", icon: "🃏",
      type: "game", category: "Brain games", url: "games/memory/index.html", maxPoints: GAME_MAX, ready: true },
    { id: "game-binary", name: "Binary Blitz", description: "Flip the bits to hit the number", icon: "🔢",
      type: "game", category: "Brain games", url: "games/binary/index.html", maxPoints: GAME_MAX, ready: true },
    { id: "game-logic", name: "Logic Gates", description: "AND, OR, NOT… what comes out?", icon: "🔌",
      type: "game", category: "Brain games", url: "games/logic/index.html", maxPoints: GAME_MAX, ready: true }
  ];

  // ======================================================================
  // SCORE FORMULAS – tune them here. Every result is capped at the activity's maxPoints.
  // ======================================================================
  var FORMULAS = {
    // Quizzes: 10 questions, 100 points per correct answer + up to 50 for speed
    QUIZ_QUESTIONS_PER_RUN: 10,
    QUIZ_POINTS_PER_CORRECT: 100,
    QUIZ_MAX_SPEED_BONUS: 50,
    quizAnswer: function (isCorrect, secondsLeft, secondsTotal) {
      if (!isCorrect) return 0;
      var ratio = secondsTotal > 0 ? Math.max(0, Math.min(1, secondsLeft / secondsTotal)) : 0;
      return FORMULAS.QUIZ_POINTS_PER_CORRECT + Math.round(FORMULAS.QUIZ_MAX_SPEED_BONUS * ratio);
    },

    // IEEE Journey (2048): game score / 20
    game2048: function (gameScore) { return cap(Math.floor(gameScore / 20)); },

    // Ezzdin 101 (t-rex runner): distance / 2
    trex: function (distance) { return cap(Math.floor(distance / 2)); },

    // Tech Match: fewer moves and less time = more points (minimum 50 for finishing)
    memory: function (moves, seconds) { return cap(Math.max(50, 500 - moves * 8 - seconds)); },

    // Whack-a-Bug: the round score itself
    whack: function (roundScore) { return cap(Math.max(0, roundScore)); },

    // Flappy Ezzdin: 20 points per firewall passed
    flappy: function (pipesPassed) { return cap(pipesPassed * 20); },

    // Binary Blitz: 25 points per correct number
    binary: function (correct) { return cap(correct * 25); },

    // Logic Gates: 20 per correct answer + 5 per answer in the best streak
    logic: function (correct, bestStreak) { return cap(correct * 20 + bestStreak * 5); },

    // Hextris and Tetris: their own game score divided by a divisor
    // n blocks cleared = n² × combo; a decent 2-min game ≈ 800–1200 → ≈ 270–400 points
    HEXTRIS_DIVISOR: 3,
    hextris: function (score) { return cap(Math.floor(score / FORMULAS.HEXTRIS_DIVISOR)); },
    // 10 per piece + 100/200/400/800 per 1/2/3/4 lines; a decent 2–3 min game ≈ 2500–4000 → ≈ 250–400 points
    TETRIS_DIVISOR: 10,
    tetris: function (score) { return cap(Math.floor(score / FORMULAS.TETRIS_DIVISOR)); }
  };

  function cap(points) { return Math.max(0, Math.min(GAME_MAX, Math.round(Number(points) || 0))); }

  function byId(id) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
    return null;
  }

  window.IEEEActivities = {
    CATEGORIES: CATEGORIES,
    LIST: LIST,
    FORMULAS: FORMULAS,
    byId: byId,
    ready: function () { return LIST.filter(function (a) { return a.ready; }); },
    ofType: function (type) { return LIST.filter(function (a) { return a.type === type; }); },
    name: function (id) { var a = byId(id); return a ? a.name : id; }
  };
})();
