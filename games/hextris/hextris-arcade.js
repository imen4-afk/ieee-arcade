/*
 * Hextris (game-hextris) – IEEE Arcade wrapper around the original game (game.html, GPL-3.0).
 * The game runs in an iframe that fills the screen under the arcade header, so its own
 * canvas sizing and "tap left / right half" controls work unchanged.
 * game.html's checkGameOver() calls window.parent.IEEEHextris.onGameOver(score).
 * Arcade points: GameKit.formulas.hextris(score) = min(500, floor(score / HEXTRIS_DIVISOR)).
 */
(function () {
  "use strict";

  var frame = document.getElementById("hx-frame");
  var lastEnd = 0;

  // fill the screen below the header
  function sizeFrame() {
    var top = frame.getBoundingClientRect().top + window.scrollY;
    frame.style.height = Math.max(360, window.innerHeight - top) + "px";
  }

  function begin() {
    // a fresh copy of the game each time (its own start button appears)
    try { window.localStorage.setItem("saveState", "{}"); } catch (e) { /* ignore */ }
    frame.src = "game.html?v=" + Date.now();
    window.scrollTo(0, 0);  // header + frame = exactly one screen, nothing hidden under the sticky bar
    sizeFrame();
  }

  window.addEventListener("resize", function () { if (!document.getElementById("gk-play").hidden) sizeFrame(); });

  window.IEEEHextris = {
    onGameOver: function (score) {
      // checkGameOver() can run more than once for the same game: count it once
      var now = Date.now();
      if (now - lastEnd < 3000) return;
      lastEnd = now;
      var s = Math.max(0, Number(score) || 0);
      setTimeout(function () {             // let the player see the original "GAME OVER" first
        frame.src = "about:blank";
        GameKit.finish({
          title: s >= 1200 ? "Hexagon hero! ⬡" : "Game over!",
          score: "Hextris score: " + s,
          points: GameKit.formulas.hextris(s)
        });
      }, 1500);
    }
  };

  GameKit.init({
    id: "game-hextris",
    instructions: "Tap the left or right half of the screen (or use ← →) to spin the hexagon. Match 3+ blocks of the same color to clear them!",
    onStart: begin
  });
})();
