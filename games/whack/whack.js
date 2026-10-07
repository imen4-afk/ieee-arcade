/*
 * Whack-a-Bug (game-whack) – tap the bugs, spare the features.
 * 🐛 +10 · 🪲 golden +30 (rare) · ✅ feature −15. 30-second round.
 * Arcade points: GameKit.formulas.whack(score) in js/activities.js.
 */
(function () {
  "use strict";

  var ROUND_SECONDS = 30;
  var HOLES = 9;
  var POINTS = { bug: 10, golden: 30, feature: -15 };
  var EMOJI = { bug: "🐛", golden: "🪲", feature: "✅" };
  var CHANCE_GOLDEN = 0.08;
  var CHANCE_FEATURE = 0.17;
  var COMBO_WINDOW = 0.8;   // seconds between two hits to keep the combo going

  // Difficulty goes from START to END during the round
  var STAY_START = 1.15, STAY_END = 0.55;     // how long an item stays up (s)
  var SPAWN_START = 0.75, SPAWN_END = 0.38;   // time between two pop-ups (s)

  function $(id) { return document.getElementById(id); }
  function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  var board = $("wb-board");
  var holes = [];
  var loop = null;
  var state = null;

  // ---------- Board ----------
  for (var i = 0; i < HOLES; i++) {
    var hole = document.createElement("button");
    hole.type = "button";
    hole.className = "wb-hole";
    hole.setAttribute("aria-label", "Empty socket");
    var item = document.createElement("span");
    item.className = "wb-item";
    item.setAttribute("aria-hidden", "true");
    hole.appendChild(item);
    board.appendChild(hole);
    holes.push({ el: hole, item: item, kind: null, until: 0, hit: false });
  }

  holes.forEach(function (h) {
    h.el.addEventListener("pointerdown", function (e) {
      e.preventDefault(); // no scroll, zoom or double-tap while playing
      tap(h);
    });
  });
  board.addEventListener("touchstart", function (e) { e.preventDefault(); }, { passive: false });

  function floatText(h, text, cls) {
    var f = document.createElement("span");
    f.className = "gk-float " + cls;
    f.textContent = text;
    var r = h.el.getBoundingClientRect();
    var b = board.getBoundingClientRect();
    f.style.left = (r.left - b.left + r.width / 2 - 20) + "px";
    f.style.top = (r.top - b.top + 4) + "px";
    board.appendChild(f);
    setTimeout(function () { f.remove(); }, 800);
  }

  function setUp(h, kind) {
    h.kind = kind;
    h.hit = false;
    h.until = state.elapsed + lerp(STAY_START, STAY_END, state.elapsed / ROUND_SECONDS);
    h.item.textContent = EMOJI[kind];
    h.el.className = "wb-hole up " + (kind === "bug" ? "" : kind);
    h.el.setAttribute("aria-label", kind === "feature" ? "Feature – don't tap" : kind === "golden" ? "Golden bug" : "Bug");
  }

  function setDown(h) {
    h.kind = null;
    h.el.classList.remove("up");
    h.el.setAttribute("aria-label", "Empty socket");
  }

  // ---------- Tapping ----------
  function tap(h) {
    if (!state || !state.running || !h.kind || h.hit) return;
    h.hit = true;
    var kind = h.kind;
    state.score += POINTS[kind];
    h.el.classList.add("hit");
    setTimeout(function () { if (h.hit) { h.el.classList.remove("hit"); setDown(h); } }, 140);

    if (kind === "feature") {
      state.features++;
      state.combo = 0;
      h.el.classList.add("oops");
      setTimeout(function () { h.el.classList.remove("oops"); }, 400);
      floatText(h, "−15 Don't squash the features!", "bad");
      $("wb-combo").textContent = "";
      GameKit.beep(160, 160, "sawtooth");
    } else {
      state.squashed++;
      state.combo = state.elapsed - state.lastHit <= COMBO_WINDOW ? state.combo + 1 : 1;
      state.lastHit = state.elapsed;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      floatText(h, "+" + POINTS[kind], kind === "golden" ? "gold" : "good");
      $("wb-combo").textContent = state.combo >= 3 ? "Combo ×" + state.combo + "!" : "";
      GameKit.beep(kind === "golden" ? 1040 : 700 + state.combo * 40, 70);
    }
    $("wb-score").textContent = state.score;
  }

  // ---------- Round ----------
  function spawn() {
    var free = holes.filter(function (h) { return !h.kind; });
    var maxUp = state.elapsed < 10 ? 2 : 3;
    if (!free.length || holes.length - free.length >= maxUp) return;
    var h = free[Math.floor(Math.random() * free.length)];
    var r = Math.random();
    setUp(h, r < CHANCE_GOLDEN ? "golden" : r < CHANCE_GOLDEN + CHANCE_FEATURE ? "feature" : "bug");
  }

  function step(dt) {
    state.elapsed += dt;
    var left = Math.max(0, ROUND_SECONDS - state.elapsed);
    $("wb-time").textContent = Math.ceil(left);
    var fill = $("wb-timer");
    fill.style.transform = "scaleX(" + left / ROUND_SECONDS + ")";
    fill.classList.toggle("hurry", left < 8);

    holes.forEach(function (h) { if (h.kind && !h.hit && state.elapsed >= h.until) setDown(h); });

    state.nextSpawn -= dt;
    if (state.nextSpawn <= 0) {
      spawn();
      state.nextSpawn = lerp(SPAWN_START, SPAWN_END, state.elapsed / ROUND_SECONDS);
    }

    if (left <= 0) end();
  }

  function begin() {
    holes.forEach(setDown);
    state = { running: true, elapsed: 0, score: 0, squashed: 0, features: 0, combo: 0, bestCombo: 0, lastHit: -9, nextSpawn: 0.4 };
    $("wb-score").textContent = "0";
    $("wb-combo").textContent = "";
    if (loop) loop.stop();
    loop = GameKit.loop(step);
  }

  function end() {
    state.running = false;
    loop.stop();
    holes.forEach(setDown);
    GameKit.finish({
      title: state.score >= 200 ? "Bug exterminator! 🏆" : "Time's up!",
      score: "Score: " + state.score,
      details: ["🐛 " + plural(state.squashed, "bug") + " squashed · ✅ " + plural(state.features, "feature") +
        " hit · best combo ×" + state.bestCombo],
      points: GameKit.formulas.whack(state.score)
    });
  }

  GameKit.init({
    id: "game-whack",
    instructions: "Tap the bugs 🐛 as fast as you can — golden bugs 🪲 are worth +30. Don't squash the features ✅! 30 seconds.",
    onStart: begin
  });
})();
