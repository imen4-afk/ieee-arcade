/*
 * Binary Blitz (game-binary) – flip the bits to make the number.
 * Levels: 4 bits for the first 5 correct answers, then 6 bits, then 8 bits. 60 s; Skip = −3 s.
 * Arcade points: GameKit.formulas.binary(correct) in js/activities.js.
 */
(function () {
  "use strict";

  var ROUND_SECONDS = 60;
  var SKIP_COST = 3;
  var NEXT_DELAY = 0.45; // seconds of "well done" before the next number

  function $(id) { return document.getElementById(id); }

  function bitsFor(correct) { return correct < 5 ? 4 : correct < 10 ? 6 : 8; }

  var loop = null;
  var s = null;

  function binaryText() { return s.bits.map(function (on) { return on ? "1" : "0"; }).join(""); }
  function value() {
    return s.bits.reduce(function (sum, on, i) { return sum + (on ? Math.pow(2, s.bits.length - 1 - i) : 0); }, 0);
  }

  function newTarget() {
    var n = bitsFor(s.correct);
    var max = Math.pow(2, n) - 1;
    var t;
    do { t = 1 + Math.floor(Math.random() * max); } while (t === s.target && max > 1);
    s.target = t;
    s.bits = [];
    for (var i = 0; i < n; i++) s.bits.push(false);
    s.waiting = 0;
    $("bb-target").textContent = t;
    $("bb-level").textContent = n + " bits (0–" + max + ")";
    $("bb-target-card").classList.remove("win");
    buildBits();
    updateReadout();
  }

  // 4 bits: one row of 4 · 6 bits: 2 rows of 3 · 8 bits: 2 rows of 4 (fits a 360 px phone)
  function buildBits() {
    var box = $("bb-bits");
    var n = s.bits.length;
    box.style.setProperty("--cols", n === 6 ? 3 : 4);
    box.innerHTML = "";
    s.bits.forEach(function (on, i) {
      var weight = Math.pow(2, n - 1 - i);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "bb-bit";
      var v = document.createElement("span");
      v.className = "bb-val";
      v.textContent = weight;
      var st = document.createElement("span");
      st.className = "bb-state";
      st.textContent = "0";
      b.appendChild(v);
      b.appendChild(st);
      b.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-label", "Bit worth " + weight);
      b.addEventListener("click", function () { toggle(i, b, st); });
      box.appendChild(b);
    });
  }

  function toggle(i, button, stateEl) {
    if (!s.running || s.waiting > 0) return;
    s.bits[i] = !s.bits[i];
    button.classList.toggle("on", s.bits[i]);
    button.setAttribute("aria-pressed", s.bits[i] ? "true" : "false");
    stateEl.textContent = s.bits[i] ? "1" : "0";
    GameKit.beep(s.bits[i] ? 660 : 440, 30);
    updateReadout();
    if (value() === s.target) {
      s.correct++;
      $("bb-correct").textContent = s.correct;
      $("bb-target-card").classList.add("win");
      GameKit.beep(988, 120, "triangle");
      s.waiting = NEXT_DELAY;
    }
  }

  function updateReadout() {
    $("bb-value").textContent = value();
    $("bb-binary").textContent = binaryText();
  }

  function step(dt) {
    s.elapsed += dt;
    if (s.waiting > 0) {
      s.waiting -= dt;
      if (s.waiting <= 0) newTarget();
    }
    var left = Math.max(0, ROUND_SECONDS - s.elapsed);
    $("bb-time").textContent = Math.ceil(left);
    var fill = $("bb-timer");
    fill.style.transform = "scaleX(" + left / ROUND_SECONDS + ")";
    fill.classList.toggle("hurry", left < 10);
    if (left <= 0) end();
  }

  $("bb-skip").addEventListener("click", function () {
    if (!s || !s.running || s.waiting > 0) return;
    s.elapsed += SKIP_COST;
    s.skips++;
    GameKit.beep(300, 80);
    newTarget();
  });

  function begin() {
    s = { running: true, elapsed: 0, correct: 0, skips: 0, target: 0, bits: [], waiting: 0 };
    $("bb-correct").textContent = "0";
    newTarget();
    if (loop) loop.stop();
    loop = GameKit.loop(step);
  }

  function end() {
    s.running = false;
    loop.stop();
    GameKit.finish({
      title: s.correct >= 15 ? "Binary wizard! 🧙" : "Time's up!",
      score: s.correct + " number" + (s.correct === 1 ? "" : "s") + " built",
      details: s.skips ? ["Skipped: " + s.skips] : [],
      points: GameKit.formulas.binary(s.correct)
    });
  }

  GameKit.init({
    id: "game-binary",
    instructions: "Turn the bits on and off to make the number shown. 60 seconds — how many can you build?",
    startExtra: function (box) {
      var help = document.createElement("details");
      help.className = "gk-help";
      var sum = document.createElement("summary");
      sum.textContent = "How binary works";
      var p = document.createElement("p");
      p.textContent = "Each switch is worth a power of 2 (8, 4, 2, 1…). Add the switches that are ON: 0101 = 4 + 1 = 5.";
      help.appendChild(sum);
      help.appendChild(p);
      box.appendChild(help);
    },
    onStart: begin
  });

  // read-only view of the game state (used by automated tests)
  window.BinaryBlitz = { state: function () { return s && { target: s.target, bits: s.bits.slice(), correct: s.correct, waiting: s.waiting }; } };
})();
