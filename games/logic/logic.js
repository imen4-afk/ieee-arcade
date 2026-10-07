/*
 * Logic Gates (game-logic) – what does the gate output?
 * AND / OR / NOT first, XOR after 5 correct answers, NAND / NOR after 10. 45 s.
 * Wrong answer = −3 s + the gate's truth table. Gates are standard symbols drawn in inline SVG.
 * Arcade points: GameKit.formulas.logic(correct, bestStreak) in js/activities.js.
 */
(function () {
  "use strict";

  var ROUND_SECONDS = 45;
  var WRONG_COST = 3;
  var FLASH_SECONDS = 1.6;

  var GATES = {
    AND:  { inputs: 2, out: function (a, b) { return a & b; } },
    OR:   { inputs: 2, out: function (a, b) { return a | b; } },
    NOT:  { inputs: 1, out: function (a) { return a ? 0 : 1; } },
    XOR:  { inputs: 2, out: function (a, b) { return a ^ b; } },
    NAND: { inputs: 2, out: function (a, b) { return (a & b) ? 0 : 1; } },
    NOR:  { inputs: 2, out: function (a, b) { return (a | b) ? 0 : 1; } }
  };

  function gatesFor(correct) {
    if (correct < 5) return ["AND", "OR", "NOT"];
    if (correct < 10) return ["AND", "OR", "NOT", "XOR"];
    return ["AND", "OR", "NOT", "XOR", "NAND", "NOR"];
  }

  function $(id) { return document.getElementById(id); }

  // ---------- SVG gate symbols ----------
  var SVG_NS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  // Body paths in a 200 x 100 box; inputs enter from the left, output leaves at y = 50
  var BODY = {
    AND: "M60,15 H95 A35,35 0 0 1 95,85 H60 Z",
    OR:  "M55,15 Q80,50 55,85 Q110,85 135,50 Q110,15 55,15 Z"
  };

  function drawGate(name, a, b) {
    var svg = svgEl("svg", { viewBox: "0 0 200 100", role: "img", "aria-label": name + " gate" });
    var line = { stroke: "#fafafa", "stroke-width": 3, fill: "none", "stroke-linecap": "round" };
    var body = { stroke: "#fafafa", "stroke-width": 3.5, fill: "rgba(0,181,226,0.18)", "stroke-linejoin": "round" };
    var one = name === "NOT";
    var outStart;

    if (one) {
      svg.appendChild(svgEl("line", Object.assign({ x1: 28, y1: 50, x2: 60, y2: 50 }, line)));
      svg.appendChild(svgEl("path", Object.assign({ d: "M60,15 L60,85 L125,50 Z" }, body)));
      svg.appendChild(svgEl("circle", Object.assign({ cx: 132, cy: 50, r: 7 }, body)));
      outStart = 139;
    } else {
      var orLike = name === "OR" || name === "XOR" || name === "NOR";
      var inEnd = orLike ? (name === "XOR" ? 54 : 66) : 60;
      svg.appendChild(svgEl("line", Object.assign({ x1: 28, y1: 32, x2: inEnd, y2: 32 }, line)));
      svg.appendChild(svgEl("line", Object.assign({ x1: 28, y1: 68, x2: inEnd, y2: 68 }, line)));
      if (name === "XOR") svg.appendChild(svgEl("path", Object.assign({ d: "M45,15 Q70,50 45,85" }, line)));
      svg.appendChild(svgEl("path", Object.assign({ d: orLike ? BODY.OR : BODY.AND }, body)));
      var end = orLike ? 135 : 130;
      if (name === "NAND" || name === "NOR") {
        svg.appendChild(svgEl("circle", Object.assign({ cx: end + 7, cy: 50, r: 7 }, body)));
        end += 14;
      }
      outStart = end;
    }
    svg.appendChild(svgEl("line", Object.assign({ x1: outStart, y1: 50, x2: 172, y2: 50 }, line)));

    // input values and the "?" output
    function bit(x, y, v, label) {
      var g = svgEl("g", {});
      g.appendChild(svgEl("rect", { x: x - 13, y: y - 13, width: 26, height: 26, rx: 6,
        fill: v ? "#f99c00" : "#262626", stroke: v ? "#ffaa40" : "#555", "stroke-width": 2 }));
      var t = svgEl("text", { x: x, y: y + 6, "text-anchor": "middle", "font-size": 17, "font-weight": 900,
        "font-family": "ui-monospace, Consolas, monospace", fill: v ? "#1a1100" : "#fafafa" });
      t.textContent = String(v);
      g.appendChild(t);
      var l = svgEl("text", { x: x - 22, y: y + 5, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: "#a1a1a1" });
      l.textContent = label;
      g.appendChild(l);
      return g;
    }
    if (one) svg.appendChild(bit(28, 50, a, "A"));
    else { svg.appendChild(bit(28, 32, a, "A")); svg.appendChild(bit(28, 68, b, "B")); }
    var q = svgEl("text", { x: 186, y: 59, "text-anchor": "middle", "font-size": 26, "font-weight": 900, fill: "#ffaa40" });
    q.textContent = "?";
    svg.appendChild(q);
    return svg;
  }

  // ---------- Truth tables (cheat sheet + after a wrong answer) ----------
  function truthTable(name, highlightA, highlightB) {
    var gate = GATES[name];
    var table = document.createElement("table");
    table.className = "lg-table";
    var head = document.createElement("tr");
    (gate.inputs === 1 ? ["A", "out"] : ["A", "B", "out"]).forEach(function (h) {
      var th = document.createElement("th");
      th.textContent = h;
      head.appendChild(th);
    });
    table.appendChild(head);
    var rows = gate.inputs === 1 ? [[0], [1]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      if (r[0] === highlightA && (gate.inputs === 1 || r[1] === highlightB)) tr.className = "hl";
      r.concat(gate.out(r[0], r[1])).forEach(function (v) {
        var td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    return table;
  }

  // ---------- Game ----------
  var loop = null;
  var s = null;

  function nextQuestion() {
    var pool = gatesFor(s.correct);
    var name;
    do { name = pool[Math.floor(Math.random() * pool.length)]; } while (name === s.gate && pool.length > 1 && Math.random() < 0.6);
    s.gate = name;
    s.a = Math.random() < 0.5 ? 0 : 1;
    s.b = Math.random() < 0.5 ? 0 : 1;
    s.answer = GATES[name].out(s.a, s.b);
    $("lg-gate-name").textContent = name;
    var box = $("lg-svg");
    box.innerHTML = "";
    box.appendChild(drawGate(name, s.a, s.b));
    $("lg-inputs").textContent = GATES[name].inputs === 1 ? "A = " + s.a : "A = " + s.a + ", B = " + s.b;
    $("lg-card").classList.remove("good", "bad");
  }

  function setButtons(enabled) {
    $("lg-0").disabled = !enabled;
    $("lg-1").disabled = !enabled;
  }

  function answer(v) {
    if (!s || !s.running || s.flash > 0) return;
    if (v === s.answer) {
      s.correct++;
      s.streak++;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      GameKit.beep(880, 60);
      $("lg-card").classList.add("good");
      setTimeout(function () { if (s.running) nextQuestion(); }, 160);
    } else {
      s.wrong++;
      s.streak = 0;
      s.elapsed += WRONG_COST;
      GameKit.beep(150, 200, "sawtooth");
      $("lg-card").classList.add("bad");
      var flash = $("lg-flash");
      flash.innerHTML = "";
      var msg = document.createElement("strong");
      msg.textContent = "✗ " + s.gate + " gives " + s.answer + " (−3 s)";
      flash.appendChild(msg);
      flash.appendChild(truthTable(s.gate, s.a, s.b));
      flash.hidden = false;
      setButtons(false);
      s.flash = FLASH_SECONDS;
    }
    $("lg-correct").textContent = s.correct;
    $("lg-streak").textContent = s.streak;
  }

  function step(dt) {
    s.elapsed += dt;
    if (s.flash > 0) {
      s.flash -= dt;
      if (s.flash <= 0) {
        $("lg-flash").hidden = true;
        setButtons(true);
        nextQuestion();
      }
    }
    var left = Math.max(0, ROUND_SECONDS - s.elapsed);
    $("lg-time").textContent = Math.ceil(left);
    var fill = $("lg-timer");
    fill.style.transform = "scaleX(" + left / ROUND_SECONDS + ")";
    fill.classList.toggle("hurry", left < 10);
    if (left <= 0) end();
  }

  $("lg-0").addEventListener("click", function () { answer(0); });
  $("lg-1").addEventListener("click", function () { answer(1); });
  document.addEventListener("keydown", function (e) {
    if ($("gk-play").hidden) return;
    if (e.key === "0" || e.key === "1") answer(Number(e.key));
  });

  function begin() {
    s = { running: true, elapsed: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, flash: 0, gate: null };
    $("lg-correct").textContent = "0";
    $("lg-streak").textContent = "0";
    $("lg-flash").hidden = true;
    setButtons(true);
    nextQuestion();
    if (loop) loop.stop();
    loop = GameKit.loop(step);
  }

  function end() {
    s.running = false;
    loop.stop();
    $("lg-flash").hidden = true;
    GameKit.finish({
      title: s.correct >= 20 ? "Logic legend! ⚡" : "Time's up!",
      score: s.correct + " correct · best streak " + s.bestStreak,
      details: s.wrong ? ["Wrong answers: " + s.wrong] : [],
      points: GameKit.formulas.logic(s.correct, s.bestStreak)
    });
  }

  GameKit.init({
    id: "game-logic",
    instructions: "Look at the gate and its inputs, then tap the output: 0 or 1. Wrong answers cost 3 seconds. 45 seconds!",
    startExtra: function (box) {
      var help = document.createElement("details");
      help.className = "gk-help";
      var sum = document.createElement("summary");
      sum.textContent = "Truth-table cheat sheet";
      help.appendChild(sum);
      var grid = document.createElement("div");
      grid.className = "lg-cheats";
      Object.keys(GATES).forEach(function (name) {
        var c = document.createElement("div");
        c.className = "lg-cheat";
        var t = document.createElement("b");
        t.textContent = name;
        c.appendChild(t);
        c.appendChild(truthTable(name));
        grid.appendChild(c);
      });
      help.appendChild(grid);
      box.appendChild(help);
    },
    onStart: begin
  });

  // read-only view of the game state (used by automated tests)
  window.LogicGates = { state: function () { return s && { gate: s.gate, answer: s.answer, correct: s.correct, flash: s.flash, running: s.running }; } };
})();
