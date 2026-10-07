/*
 * Tech Match – memory game (4x4 grid, 8 pairs)
 * Points: IEEEArcade.SCORING.memory(moves, seconds) in js/arcade.js.
 */
(function () {
  "use strict";

  var Arcade = window.IEEEArcade;
  var IMG = "../../assets/img/";

  // ---- The 8 card faces: edit this list to change the cards. ----
  // tile "dark" = white logo artwork, tile "light" = colored logo.
  // To use the official IEEE logo instead of the mascot, add assets/img/ieee-logo.png
  // and replace the mascot line with:
  //   { img: "ieee-logo.png", label: "IEEE", tile: "light" },
  var FACES = [
    { img: "chapters/cs.png",       label: "CS",           tile: "dark" },
    { img: "chapters/cis.png",      label: "CIS",          tile: "dark" },
    { img: "chapters/ras.png",      label: "RAS",          tile: "dark" },
    { img: "chapters/wie.png",      label: "WIE",          tile: "dark" },
    { img: "sb-logo-white.png",     label: "IEEE ISIMA SB", tile: "dark" },
    { img: "mascot.png",            label: "Our mascot",   tile: "light" },
    { img: "partners/isima.png",    label: "ISIMA",        tile: "light" },
    { img: "partners/pepiniere.png", label: "Pépinière",   tile: "light" }
  ];

  var FLIP_BACK_MS = 850;

  function $(id) { return document.getElementById(id); }

  var grid = $("mem-grid");
  var open = [];          // cards currently face up and not matched (max 2)
  var moves = 0;
  var pairsFound = 0;
  var seconds = 0;
  var clock = null;
  var locked = false;

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function formatTime(s) {
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function updateStats() {
    $("mem-moves").textContent = moves;
    $("mem-time").textContent = formatTime(seconds);
    $("mem-pairs").textContent = pairsFound + "/" + FACES.length;
  }

  function showBest() {
    var best = Arcade.getLocalBests()["game-memory"];
    $("mem-best").textContent = best ? "Your best: " + best + " pts" : "Find all pairs with few moves, fast!";
  }

  function buildCard(face, pairId) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "mcard";
    card.dataset.pair = pairId;
    card.setAttribute("aria-label", "Hidden card");

    var inner = document.createElement("span");
    inner.className = "mcard-inner";

    var back = document.createElement("span");
    back.className = "mcard-face mcard-back";

    var front = document.createElement("span");
    front.className = "mcard-face mcard-front " + face.tile;
    var img = document.createElement("img");
    img.src = IMG + face.img;
    img.alt = "";
    img.draggable = false;
    img.addEventListener("error", function () { img.hidden = true; }); // the label stays visible
    var label = document.createElement("span");
    label.className = "mlabel";
    label.textContent = face.label;
    front.appendChild(img);
    front.appendChild(label);

    inner.appendChild(back);
    inner.appendChild(front);
    card.appendChild(inner);
    card.addEventListener("click", function () { flip(card, face); });
    return card;
  }

  function newGame() {
    clearInterval(clock);
    clock = null;
    open = [];
    moves = 0;
    pairsFound = 0;
    seconds = 0;
    locked = false;
    $("mem-end").hidden = true;

    var deck = [];
    FACES.forEach(function (face, i) { deck.push({ face: face, pair: i }, { face: face, pair: i }); });
    grid.innerHTML = "";
    shuffle(deck).forEach(function (c) { grid.appendChild(buildCard(c.face, c.pair)); });
    updateStats();
    showBest();
  }

  function startClock() {
    if (clock) return;
    clock = setInterval(function () {
      seconds++;
      updateStats();
    }, 1000);
  }

  function flip(card, face) {
    if (locked || card.classList.contains("flipped") || card.classList.contains("matched")) return;
    startClock();
    card.classList.add("flipped");
    card.setAttribute("aria-label", face.label);
    open.push(card);
    if (open.length < 2) return;

    moves++;
    var a = open[0];
    var b = open[1];
    open = [];

    if (a.dataset.pair === b.dataset.pair) {
      a.classList.add("matched");
      b.classList.add("matched");
      pairsFound++;
      updateStats();
      if (pairsFound === FACES.length) finish();
    } else {
      updateStats();
      locked = true;
      a.classList.add("nope");
      b.classList.add("nope");
      setTimeout(function () {
        [a, b].forEach(function (c) {
          c.classList.remove("flipped", "nope");
          c.setAttribute("aria-label", "Hidden card");
        });
        locked = false;
      }, FLIP_BACK_MS);
    }
  }

  function finish() {
    clearInterval(clock);
    clock = null;
    var points = Arcade.SCORING.memory(moves, seconds);
    var result = Arcade.submitScore("game-memory", points);

    $("mem-end-stats").textContent = moves + " moves in " + formatTime(seconds);
    $("mem-end-points").textContent = "+" + result.points + " points!";
    $("mem-end-best").textContent = result.isNewBest ? "🌟 New best score: " + result.best : "Your best: " + result.best;
    showBest();
    setTimeout(function () {
      $("mem-end").hidden = false;
      $("mem-again").focus();
    }, 700);
  }

  $("mem-restart").addEventListener("click", newGame);
  $("mem-again").addEventListener("click", newGame);

  newGame();
})();
