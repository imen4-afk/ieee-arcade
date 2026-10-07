/*
 * IEEE Arcade – quiz engine (quiz.html?set=quiz-ieee)
 * ---------------------------------------------------
 * Questions come from data/quiz.json (edit that file to add questions).
 * Each run: up to 10 random questions, options shuffled, a countdown per question.
 * Points per answer: IEEEArcade.SCORING.quizAnswer() (formulas in js/activities.js).
 */
(function () {
  "use strict";

  var Arcade = window.IEEEArcade;
  var DATA_URL = "data/quiz.json";

  function $(id) { return document.getElementById(id); }

  var set = null;        // the quiz set from quiz.json
  var questions = [];    // questions for this run (shuffled)
  var index = 0;         // current question
  var correctCount = 0;
  var points = 0;
  var timer = null;      // { start, duration, raf }
  var answered = false;

  // ---------- helpers ----------

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function show(id) {
    ["quiz-loading", "quiz-error", "quiz-intro", "quiz-question", "quiz-result"].forEach(function (s) {
      $(s).hidden = s !== id;
    });
    window.scrollTo(0, 0);
  }

  function fail(message) {
    $("quiz-error-text").textContent = message;
    show("quiz-error");
  }

  // A question is valid if it has text, 2+ options and an answer index inside the options.
  function isValid(q) {
    return q && typeof q.q === "string" && Array.isArray(q.options) && q.options.length >= 2 &&
      typeof q.answer === "number" && q.answer >= 0 && q.answer < q.options.length;
  }

  // ---------- loading ----------

  function load() {
    var params = new URLSearchParams(window.location.search);
    var setId = params.get("set") || "quiz-ieee";

    var request;
    try {
      request = fetch(DATA_URL, { cache: "no-cache" });
    } catch (e) {
      request = Promise.reject(e);
    }

    request
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var sets = (data && data.sets) || [];
        set = null;
        for (var i = 0; i < sets.length; i++) if (sets[i].id === setId) set = sets[i];
        if (!set) return fail("This quiz doesn't exist.");

        var valid = (set.questions || []).filter(function (q, n) {
          if (!isValid(q)) console.warn("quiz.json: skipping invalid question #" + (n + 1) + " in " + set.id, q);
          return isValid(q);
        });
        if (valid.length === 0) return fail("This quiz has no questions yet.");
        set.questions = valid;
        showIntro();
      })
      .catch(function () {
        fail("The questions couldn't be loaded. Check your connection and try again.");
      });
  }

  function questionsPerRun() {
    return Math.min(Arcade.SCORING.QUIZ_QUESTIONS_PER_RUN, set.questions.length);
  }

  function secondsPerQuestion() {
    return Number(set.timePerQuestion) > 0 ? Number(set.timePerQuestion) : 30;
  }

  function showIntro() {
    document.title = set.title + " – IEEE Arcade";
    $("quiz-topbar-title").textContent = set.title;
    $("quiz-title").textContent = set.title;
    $("quiz-description").textContent = set.description || "";
    var n = questionsPerRun();
    var maxPts = n * (Arcade.SCORING.QUIZ_POINTS_PER_CORRECT + Arcade.SCORING.QUIZ_MAX_SPEED_BONUS);
    $("quiz-rules").textContent = "📝 " + n + " questions · ⏱️ " + secondsPerQuestion() +
      " s each · ⭐ up to " + Math.min(maxPts, Arcade.maxPointsFor(set.id)) + " points";
    $("quiz-not-joined").hidden = Arcade.isLoggedIn();
    show("quiz-intro");
  }

  // ---------- playing ----------

  function start() {
    questions = shuffle(set.questions).slice(0, questionsPerRun()).map(function (q) {
      var options = q.options.map(function (text, i) { return { text: String(text), correct: i === q.answer }; });
      return { q: q.q, explain: q.explain || "", options: shuffle(options) };
    });
    index = 0;
    correctCount = 0;
    points = 0;
    show("quiz-question");
    renderQuestion();
  }

  function renderQuestion() {
    var q = questions[index];
    answered = false;
    $("quiz-progress").textContent = "Question " + (index + 1) + " / " + questions.length;
    $("quiz-points").textContent = points + " pts";
    $("quiz-q").textContent = q.q;
    $("quiz-feedback").hidden = true;

    var box = $("quiz-options");
    box.innerHTML = "";
    q.options.forEach(function (opt, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.textContent = opt.text;
      btn.addEventListener("click", function () { answer(i); });
      box.appendChild(btn);
    });

    startTimer();
  }

  function startTimer() {
    stopTimer();
    var bar = $("quiz-timer");
    timer = { start: performance.now(), duration: secondsPerQuestion() * 1000, raf: 0 };

    function tick(now) {
      var left = Math.max(0, timer.duration - (now - timer.start));
      var ratio = left / timer.duration;
      bar.style.transform = "scaleX(" + ratio + ")";
      bar.classList.toggle("hurry", ratio < 0.3);
      if (left <= 0) { answer(-1); return; }  // time's up
      timer.raf = requestAnimationFrame(tick);
    }
    timer.raf = requestAnimationFrame(tick);
  }

  function stopTimer() {
    if (timer) cancelAnimationFrame(timer.raf);
  }

  function secondsLeft() {
    if (!timer) return 0;
    return Math.max(0, (timer.duration - (performance.now() - timer.start)) / 1000);
  }

  // choice = index of the clicked option, or -1 when time is up
  function answer(choice) {
    if (answered) return;
    answered = true;
    var left = secondsLeft();
    stopTimer();

    var q = questions[index];
    var isCorrect = choice >= 0 && q.options[choice].correct;
    var earned = Arcade.SCORING.quizAnswer(isCorrect, left, secondsPerQuestion());
    points += earned;
    if (isCorrect) correctCount++;

    var buttons = $("quiz-options").children;
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = true;
      if (q.options[i].correct) buttons[i].classList.add("correct");
      else if (i === choice) buttons[i].classList.add("wrong");
    }

    var title = $("quiz-feedback-title");
    if (isCorrect) {
      title.textContent = "✅ Correct! +" + earned + " pts";
      title.className = "feedback-title ok";
    } else {
      title.textContent = choice === -1 ? "⏰ Time's up!" : "❌ Not quite!";
      title.className = "feedback-title error";
    }
    $("quiz-feedback-explain").textContent = q.explain;
    $("quiz-feedback-explain").hidden = !q.explain;
    $("quiz-points").textContent = points + " pts";
    $("quiz-next").textContent = index + 1 < questions.length ? "Next question →" : "See my score →";
    $("quiz-feedback").hidden = false;
    $("quiz-next").focus({ preventScroll: true });
  }

  function next() {
    index++;
    if (index < questions.length) renderQuestion();
    else finish();
  }

  function finish() {
    var result = Arcade.submitScore(set.id, points);
    var ratio = correctCount / questions.length;

    $("result-emoji").textContent = ratio >= 0.8 ? "🏆" : ratio >= 0.5 ? "🎉" : "💪";
    $("result-title").textContent = ratio >= 0.8 ? "Amazing!" : ratio >= 0.5 ? "Well done!" : "Nice try!";
    $("result-ezzdin").textContent = ratio >= 0.8 ? "Ezzdin says: you're a real IEEE expert!"
      : ratio >= 0.5 ? "Ezzdin says: great job, keep going!"
      : "Ezzdin says: play again, you'll do better!";
    $("result-correct").textContent = correctCount + " / " + questions.length + " correct answers";
    $("result-points").textContent = "+" + result.points + " points!";
    $("result-best").textContent = result.isNewBest && result.points > 0
      ? "🌟 New best score: " + result.best
      : "Your best: " + result.best;
    show("quiz-result");
  }

  // ---------- events ----------

  $("quiz-start").addEventListener("click", start);
  $("quiz-next").addEventListener("click", next);
  $("quiz-again").addEventListener("click", start);

  load();
})();
