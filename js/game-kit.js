/*
 * IEEE Arcade – shared kit for the new games (games/<name>/index.html)
 * --------------------------------------------------------------------
 * Needs: js/config.js, js/activities.js, js/arcade.js (and js/layout.js for the top bar).
 *
 *   GameKit.init({ id, instructions, onStart, startExtra })
 *       fills the sub-header (nickname, best score, sound toggle) and shows the start screen
 *       (Ezzdin, the game name from js/activities.js, one line of instructions, a big Play button).
 *   GameKit.finish({ points, score, details })
 *       submits the arcade points and shows the end screen ("+340 points! Best: 410").
 *   GameKit.loop(step)        requestAnimationFrame loop with delta-time (seconds), paused
 *                             while the tab is hidden. Returns { stop() }.
 *   GameKit.setupCanvas(canvas, width, height)   sharp canvas (devicePixelRatio), returns the 2D context.
 *   GameKit.beep(freq, ms)    short generated sound (only if the player turned sound on).
 *   GameKit.reducedMotion     true if the phone asks for less motion.
 *
 * Page structure expected in the game's HTML:
 *   <div class="gk-subbar" id="gk-subbar"></div>
 *   <section class="card gk-screen" id="gk-start" hidden></section>
 *   <div id="gk-play" hidden> … the game … </div>
 *   <section class="card gk-screen" id="gk-end" hidden></section>
 */
(function () {
  "use strict";

  var Arcade = window.IEEEArcade;
  var Registry = window.IEEEActivities;
  var ROOT = "../../";
  var SOUND_KEY = "ieeeArcade.sound";

  var options = null;
  var activity = null;

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  var reducedMotion = false;
  try { reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { reducedMotion = false; }

  // ---------- Sound (off by default, Web Audio beeps, no files) ----------

  var soundOn = false;
  try { soundOn = window.localStorage.getItem(SOUND_KEY) === "on"; } catch (e) { soundOn = false; }
  var audio = null;

  function beep(freq, ms, type) {
    if (!soundOn) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      var osc = audio.createOscillator();
      var gain = audio.createGain();
      osc.type = type || "square";
      osc.frequency.value = freq || 660;
      gain.gain.setValueAtTime(0.08, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + (ms || 80) / 1000);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + (ms || 80) / 1000);
    } catch (e) { /* no audio on this browser: ignore */ }
  }

  // ---------- Sub-header: nickname, best score, sound toggle ----------

  function bestScore() { return Arcade.getLocalBests()[options.id] || 0; }

  function buildSubbar() {
    var bar = $("gk-subbar");
    if (!bar) return;
    bar.innerHTML = "";
    var nick = Arcade.getNickname();
    bar.appendChild(el("span", "gk-chip", nick ? "👤 " + nick : "👤 Not logged in"));
    var best = el("span", "gk-chip gk-best", "⭐ Best: " + bestScore());
    best.id = "gk-best";
    bar.appendChild(best);
    var sound = el("button", "gk-sound", soundOn ? "🔊" : "🔇");
    sound.type = "button";
    sound.setAttribute("aria-label", soundOn ? "Sound on (tap to mute)" : "Sound off (tap to turn on)");
    sound.setAttribute("aria-pressed", soundOn ? "true" : "false");
    sound.addEventListener("click", function () {
      soundOn = !soundOn;
      try { window.localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch (e) { /* ignore */ }
      sound.textContent = soundOn ? "🔊" : "🔇";
      sound.setAttribute("aria-label", soundOn ? "Sound on (tap to mute)" : "Sound off (tap to turn on)");
      sound.setAttribute("aria-pressed", soundOn ? "true" : "false");
      beep(880, 60);
    });
    bar.appendChild(sound);
  }

  function updateBest() {
    var best = $("gk-best");
    if (best) best.textContent = "⭐ Best: " + bestScore();
  }

  // ---------- Screens ----------

  function show(name) {
    ["gk-start", "gk-play", "gk-end"].forEach(function (id) {
      var node = $(id);
      if (node) node.hidden = id !== name;
    });
  }

  function mascot(size) {
    var img = el("img", "gk-mascot");
    img.src = ROOT + "assets/img/mascot.png";
    img.alt = "Ezzdin, the IEEE ISIMA SB mascot";
    img.width = size;
    img.height = size;
    img.addEventListener("error", function () { img.hidden = true; });
    return img;
  }

  function buildStart() {
    var box = $("gk-start");
    box.innerHTML = "";
    box.appendChild(mascot(96));
    box.appendChild(el("h2", "gk-title", activity.name));
    box.appendChild(el("p", "gk-instructions", options.instructions));
    if (options.startExtra) options.startExtra(box);
    var play = el("button", "btn btn-primary btn-block btn-lg gk-play-btn", "▶ Play");
    play.type = "button";
    play.addEventListener("click", start);
    box.appendChild(play);
    if (!Arcade.getNickname()) {
      var note = el("p", "notice", "You're not logged in: your points won't reach the scoreboard. ");
      var link = el("a", "", "Log in first");
      link.href = ROOT + "index.html";
      note.appendChild(link);
      box.appendChild(note);
    }
  }

  function start() {
    show("gk-play");
    beep(520, 60);
    options.onStart();
  }

  // result: { points, score (text), details: [text lines] }
  function finish(result) {
    var res = Arcade.submitScore(options.id, result.points);
    updateBest();
    beep(330, 180, "triangle");

    var box = $("gk-end");
    box.innerHTML = "";
    box.appendChild(mascot(72));
    box.appendChild(el("h2", "gk-title", result.title || "Round over!"));
    if (result.score !== undefined) box.appendChild(el("p", "gk-score", result.score));
    (result.details || []).forEach(function (line) { box.appendChild(el("p", "small", line)); });
    box.appendChild(el("p", "result-points", "+" + res.points + " points!"));
    box.appendChild(el("p", "gk-best-line", res.isNewBest && res.points > 0 ? "🌟 New best: " + res.best : "Best: " + res.best));

    var row = el("div", "btn-row");
    var again = el("button", "btn btn-primary", "↻ Play again");
    again.type = "button";
    again.addEventListener("click", start);
    var back = el("a", "btn btn-ghost", "Back to Arcade");
    back.href = ROOT + "index.html";
    row.appendChild(again);
    row.appendChild(back);
    box.appendChild(row);
    var chapters = el("a", "discover-link", "Discover our chapters →");
    chapters.href = ROOT + "chapters.html";
    box.appendChild(chapters);

    show("gk-end");
    again.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function init(opts) {
    options = opts;
    activity = Registry.byId(opts.id) || { name: document.title, maxPoints: 500 };
    buildSubbar();
    buildStart();
    show("gk-start");
  }

  // ---------- Frame loop with delta-time, paused while the tab is hidden ----------

  function loop(step) {
    var last = 0;
    var raf = 0;
    var running = true;

    function frame(now) {
      if (!running) return;
      var dt = last ? (now - last) / 1000 : 0;
      last = now;
      if (dt > 0.05) dt = 0.05; // after a hiccup: no big jump (same speed at 60 Hz and 120 Hz)
      if (!document.hidden) step(dt);
      raf = requestAnimationFrame(frame);
    }
    function onVisibility() { last = 0; } // don't count the time spent in another tab

    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);
    return {
      stop: function () {
        running = false;
        cancelAnimationFrame(raf);
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }

  // ---------- Sharp canvas ----------

  function setupCanvas(canvas, width, height) {
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
    return ctx;
  }

  window.GameKit = {
    init: init,
    finish: finish,
    loop: loop,
    setupCanvas: setupCanvas,
    beep: beep,
    reducedMotion: reducedMotion,
    formulas: Registry.FORMULAS
  };
})();
