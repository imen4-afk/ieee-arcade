/*
 * Bug Runner – IEEE Arcade additions to the T-Rex runner (not part of the original game).
 * index.js calls BugRunner.onGameOver(distance) when the runner crashes.
 * Points: IEEEArcade.SCORING.trex(distance) in js/arcade.js.
 */
window.BugRunner = (function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function showBest() {
    var best = window.IEEEArcade ? window.IEEEArcade.getLocalBests()["game-trex"] : 0;
    $("bug-best").textContent = best ? "Your best: " + best + " pts" : "Run as far as you can!";
  }

  function onGameOver(distance) {
    if (!window.IEEEArcade) return;
    var points = window.IEEEArcade.SCORING.trex(distance);
    var result = window.IEEEArcade.submitScore("game-trex", points);

    $("bug-points").textContent = "+" + result.points + " points!";
    $("bug-detail").textContent = "Distance " + distance + " · " +
      (result.isNewBest && result.points > 0 ? "🌟 New best: " + result.best : "Best: " + result.best);
    $("bug-result").hidden = false;
    showBest();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    $("bug-howto").textContent = touch ? "Tap to jump" : "Tap, click or press Space to jump";
    showBest();

    // Hide the last result when a new run starts.
    function hideResult() { $("bug-result").hidden = true; }
    document.addEventListener("keydown", function (e) { if (e.keyCode === 32 || e.keyCode === 38) hideResult(); });
    document.querySelector(".interstitial-wrapper").addEventListener("pointerdown", hideResult);
  });

  return { onGameOver: onGameOver };
})();
