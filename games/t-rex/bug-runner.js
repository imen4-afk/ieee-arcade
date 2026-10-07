/*
 * Ezzdin 101 (Bug Runner) – IEEE Arcade additions to the T-Rex runner (not part of the original game).
 * index.js calls:
 *   BugRunner.drawRunner(ctx, trex)  every frame: draws Ezzdin instead of the dino
 *   BugRunner.onGameOver(distance)   when the runner crashes
 * Points: IEEEArcade.SCORING.trex(distance) (formulas in js/activities.js).
 */
window.BugRunner = (function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  // ---- Ezzdin, our runner (transparent PNG made from assets/img/ezzdin_run.jpg) ----
  var runner = new Image();
  runner.src = "../../assets/img/ezzdin-run.png";

  // Draws Ezzdin in the dino's place (same position and size, so the collisions
  // of the original game still match). Returns false if the image isn't ready.
  function drawRunner(ctx, trex) {
    if (!runner.complete || !runner.naturalWidth) return false;
    var ratio = runner.naturalWidth / runner.naturalHeight;
    var box = trex.config;
    var h = box.HEIGHT;
    var w = h * ratio;
    var x = trex.xPos + (box.WIDTH - w) / 2;
    var y = trex.yPos;

    if (trex.ducking && trex.status !== "CRASHED") {
      // crouch: smaller, standing on the ground
      h = box.HEIGHT_DUCK + 8;
      w = h * ratio;
      x = trex.xPos + (box.WIDTH_DUCK - w) / 2;
      y = trex.yPos + box.HEIGHT - h;
    } else if (trex.status === "RUNNING" && trex.currentFrame % 2) {
      y -= 1; // small bounce between the two running frames
    }

    ctx.drawImage(runner, x, y, w, h);
    if (trex.status === "CRASHED") {
      // dizzy stars above his head when a bug hits him
      ctx.save();
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("💫", x + w / 2, y - 2);
      ctx.restore();
    }
    return true;
  }

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
    $("bug-howto").textContent = touch ? "Tap to make Ezzdin jump" : "Tap, click or press Space to make Ezzdin jump";
    showBest();

    // Hide the last result when a new run starts.
    function hideResult() { $("bug-result").hidden = true; }
    document.addEventListener("keydown", function (e) { if (e.keyCode === 32 || e.keyCode === 38) hideResult(); });
    document.querySelector(".interstitial-wrapper").addEventListener("pointerdown", hideResult);
  });

  return { onGameOver: onGameOver, drawRunner: drawRunner };
})();
