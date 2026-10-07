/*
 * IEEE Journey – IEEE Arcade additions to 2048 (not part of the original game).
 * The original files only call IEEEJourney.label() and IEEEJourney.onGameEnd().
 */
window.IEEEJourney = (function () {
  "use strict";

  // ---- Tile labels: edit this object to rename the steps of the journey ----
  var TILE_LABELS = {
    2: "Curious",
    4: "Student",
    8: "Member",
    16: "Volunteer",
    32: "Officer",
    64: "Chair",
    128: "Mentor",
    256: "Senior",
    512: "Fellow",
    1024: "Legend",
    2048: "IEEE Hero"
  };

  function label(value) {
    return TILE_LABELS[value] || String(value);
  }

  // Called by HTMLActuator.message() when the game is won or lost.
  function onGameEnd(won, gameScore) {
    var box = document.querySelector(".arcade-result");
    if (!window.IEEEArcade) return;

    var points = window.IEEEArcade.SCORING.game2048(gameScore);
    var result = window.IEEEArcade.submitScore("game-2048", points);
    if (box) {
      box.querySelector(".arcade-points").textContent = "+" + result.points + " points!";
      box.querySelector(".arcade-best").textContent = result.isNewBest && result.points > 0
        ? "🌟 New best: " + result.best
        : "Best: " + result.best;
    }
  }

  // The original swipe code blocks normal taps inside the board, so links in
  // the end message are opened on "touchend" (like the original buttons).
  document.addEventListener("DOMContentLoaded", function () {
    var links = document.querySelectorAll(".game-message a[href]");
    Array.prototype.forEach.call(links, function (link) {
      link.addEventListener("touchend", function (e) {
        e.preventDefault();
        window.location.href = link.href;
      });
    });
  });

  return { TILE_LABELS: TILE_LABELS, label: label, onGameEnd: onGameEnd };
})();
