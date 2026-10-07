/*
 * Flappy Ezzdin (game-flappy) – fly Ezzdin through the firewalls.
 * Tap / click / Space = flap. +1 per firewall passed. Pipe, ground or ceiling = game over.
 * Arcade points: GameKit.formulas.flappy(pipesPassed) in js/activities.js.
 *
 * The game world is always 360 x 560 "units"; it's scaled to fit the phone.
 */
(function () {
  "use strict";

  var W = 360, H = 560;           // world size
  var GROUND = 56;                // ground height
  var GRAVITY = 1500;             // units / s²
  var FLAP = -430;                // velocity after a flap
  var MAX_FALL = 650;
  var BIRD_X = 96;
  var BIRD_W = 48, BIRD_H = 43;   // drawn size of Ezzdin
  var HIT_R = 15;                 // forgiving hitbox (smaller than the picture)
  var PIPE_W = 62;
  var PIPE_GAP_START = 172, PIPE_GAP_MIN = 120, GAP_SHRINK = 3; // gap shrinks 3 units per point
  var PIPE_SPACING = 205;         // distance between two firewalls
  var SPEED = 150;                // scroll speed (units / s)

  var canvas = document.getElementById("fl-canvas");
  var ctx = null;
  var scale = 1;
  var loop = null;
  var s = null;                   // game state

  var ezzdin = new Image();
  ezzdin.src = "../../assets/img/mascot.png";

  // ---------- Size: fit the phone (width and height) ----------
  function resize() {
    var maxW = Math.min(480, document.querySelector(".game-main").clientWidth - 4);
    var maxH = Math.max(320, window.innerHeight - 190);
    var cssW = Math.min(maxW, maxH * W / H);
    var cssH = cssW * H / W;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx = GameKit.setupCanvas(canvas, cssW, cssH);
    scale = cssW / W;
  }

  // ---------- Game ----------
  function newPipe(x) {
    var gap = Math.max(PIPE_GAP_MIN, PIPE_GAP_START - s.score * GAP_SHRINK);
    var margin = 70;
    var center = margin + gap / 2 + Math.random() * (H - GROUND - 2 * margin - gap);
    return { x: x, top: center - gap / 2, bottom: center + gap / 2, passed: false };
  }

  function reset() {
    s = { mode: "ready", y: H * 0.42, vy: 0, score: 0, pipes: [], t: 0, scroll: 0, deadFor: 0 };
  }

  function flap() {
    if (!s) return;
    if (s.mode === "ready") {
      s.mode = "play";
      s.pipes = [newPipe(W + 40), newPipe(W + 40 + PIPE_SPACING)];
    }
    if (s.mode !== "play") return;
    s.vy = FLAP;
    GameKit.beep(620, 40);
  }

  function hitsPipe(p) {
    // circle (Ezzdin) against the two pipe rectangles
    var cx = BIRD_X, cy = s.y;
    if (cx + HIT_R < p.x || cx - HIT_R > p.x + PIPE_W) return false;
    function rect(top, bottom) {
      var nx = Math.max(p.x, Math.min(cx, p.x + PIPE_W));
      var ny = Math.max(top, Math.min(cy, bottom));
      return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < HIT_R * HIT_R;
    }
    return rect(-50, p.top) || rect(p.bottom, H);
  }

  function die() {
    s.mode = "dead";
    s.deadFor = 0;
    GameKit.beep(140, 220, "sawtooth");
  }

  function step(dt) {
    s.t += dt;
    if (s.mode !== "dead") s.scroll += SPEED * dt;

    if (s.mode === "ready") {
      s.y = H * 0.42 + Math.sin(s.t * 3) * 8;  // hovering
    } else {
      s.vy = Math.min(MAX_FALL, s.vy + GRAVITY * dt);
      s.y += s.vy * dt;
    }

    if (s.mode === "play") {
      s.pipes.forEach(function (p) {
        p.x -= SPEED * dt;
        if (!p.passed && p.x + PIPE_W < BIRD_X - HIT_R) {
          p.passed = true;
          s.score++;
          GameKit.beep(880, 50);
        }
      });
      if (s.pipes.length && s.pipes[0].x < -PIPE_W) s.pipes.shift();
      var last = s.pipes[s.pipes.length - 1];
      if (last.x < W + 40 - PIPE_SPACING) s.pipes.push(newPipe(last.x + PIPE_SPACING));

      if (s.y - HIT_R < 0 || s.y + HIT_R > H - GROUND || s.pipes.some(hitsPipe)) die();
    }

    if (s.mode === "dead") {
      s.deadFor += dt;
      if (s.y > H - GROUND - HIT_R) { s.y = H - GROUND - HIT_R; s.vy = 0; }
      if (s.deadFor > 0.8) { end(); return; }
    }
    draw();
  }

  // ---------- Drawing ----------
  function drawBackground() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#002855");
    g.addColorStop(1, "#00629B");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // faint circuit lines + kite diamonds, scrolling slowly
    var off = GameKit.reducedMotion ? 0 : (s.scroll * 0.3) % 60;
    ctx.strokeStyle = "rgba(0, 181, 226, 0.12)";
    ctx.lineWidth = 2;
    for (var x = -off; x < W + 60; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, 120); ctx.lineTo(x + 30, 150); ctx.lineTo(x + 30, H);
      ctx.stroke();
      ctx.fillStyle = "rgba(0, 181, 226, 0.25)";
      ctx.beginPath(); ctx.arc(x + 30, 150, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPipe(p) {
    function block(y, h, capAtBottom) {
      if (h <= 0) return;
      ctx.fillStyle = "#00629B";
      ctx.fillRect(p.x, y, PIPE_W, h);
      // bricks
      ctx.strokeStyle = "rgba(0, 40, 85, 0.75)";
      ctx.lineWidth = 2;
      for (var row = 0, by = y; by < y + h; by += 16, row++) {
        ctx.beginPath(); ctx.moveTo(p.x, by); ctx.lineTo(p.x + PIPE_W, by); ctx.stroke();
        var shift = row % 2 ? 0 : PIPE_W / 4;
        for (var bx = p.x + shift; bx < p.x + PIPE_W; bx += PIPE_W / 2) {
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, Math.min(by + 16, y + h)); ctx.stroke();
        }
      }
      // cap with an orange edge
      var capY = capAtBottom ? y + h - 14 : y;
      ctx.fillStyle = "#004a7a";
      ctx.fillRect(p.x - 5, capY, PIPE_W + 10, 14);
      ctx.fillStyle = "#f99c00";
      ctx.fillRect(p.x - 5, capAtBottom ? capY + 11 : capY, PIPE_W + 10, 3);
    }
    block(0, p.top, true);
    block(p.bottom, H - GROUND - p.bottom, false);
    // little fires at the edges of the gap
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🔥", p.x + PIPE_W / 2, p.top + 20);
    ctx.fillText("🔥", p.x + PIPE_W / 2, p.bottom - 4);
  }

  function drawGround() {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, H - GROUND, W, GROUND);
    ctx.fillStyle = "#f99c00";
    ctx.fillRect(0, H - GROUND, W, 4);
    var off = (s.scroll) % 40;
    ctx.fillStyle = "rgba(0, 181, 226, 0.5)";
    for (var x = -off; x < W + 40; x += 40) {     // kite diamonds
      ctx.save();
      ctx.translate(x + 20, H - GROUND / 2 + 2);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-6, -6, 12, 12);
      ctx.restore();
    }
  }

  function drawEzzdin() {
    var angle = GameKit.reducedMotion || s.mode === "ready" ? 0 : Math.max(-0.45, Math.min(1.1, s.vy / 600));
    ctx.save();
    ctx.translate(BIRD_X, s.y);
    ctx.rotate(angle);
    if (ezzdin.complete && ezzdin.naturalWidth) {
      ctx.drawImage(ezzdin, -BIRD_W / 2, -BIRD_H / 2, BIRD_W, BIRD_H);
    } else {
      ctx.fillStyle = "#f99c00";
      ctx.beginPath(); ctx.arc(0, 0, HIT_R + 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawText(text, y, size) {
    ctx.font = "900 " + size + "px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.strokeText(text, W / 2, y);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, W / 2, y);
  }

  function draw() {
    ctx.save();
    ctx.scale(scale, scale);
    drawBackground();
    s.pipes.forEach(drawPipe);
    drawGround();
    drawEzzdin();
    if (s.mode === "ready") {
      drawText("Tap to start", H * 0.62, 30);
      drawText("Tap = flap", H * 0.62 + 34, 18);
    } else {
      drawText(String(s.score), 70, 52);
    }
    ctx.restore();
  }

  // ---------- Input (only inside the game) ----------
  canvas.addEventListener("pointerdown", function (e) { e.preventDefault(); flap(); });
  canvas.addEventListener("touchstart", function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener("keydown", function (e) {
    if (document.getElementById("gk-play").hidden) return;
    if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); flap(); }
  });
  window.addEventListener("resize", function () { if (s && !document.getElementById("gk-play").hidden) { resize(); draw(); } });

  // ---------- Round ----------
  function begin() {
    resize();
    reset();
    if (loop) loop.stop();
    loop = GameKit.loop(step);
  }

  function end() {
    loop.stop();
    GameKit.finish({
      title: s.score >= 15 ? "Firewall master! 🔥" : "Crashed into a firewall!",
      score: "Firewalls passed: " + s.score,
      points: GameKit.formulas.flappy(s.score)
    });
  }

  // read-only view of the game state (used by automated tests)
  window.FlappyEzzdin = { state: function () { return s && { mode: s.mode, y: s.y, vy: s.vy, score: s.score, pipes: s.pipes.slice() }; } };

  GameKit.init({
    id: "game-flappy",
    instructions: "Tap to flap and fly Ezzdin through the firewalls. Each firewall = +20 points!",
    onStart: begin
  });
})();
