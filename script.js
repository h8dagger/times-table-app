(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = "tta-progress";
  const screens = ["home", "setup", "game", "results"];

  let table = 2;
  let mode = "practice";
  let questions = [];
  let index = 0;
  let answers = [];
  let sessionActive = false;

  // Migrate Step 3 table scores without deleting existing stars or attempts.
  // Step 4 also stores each ordered fact: 0x0 through 12x12 (169 total).
  function loadProgress() {
    let stored;
    try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch (_) { stored = {}; }
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) stored = {};
    if (stored.tables && typeof stored.tables === "object") {
      return { tables: stored.tables, facts: stored.facts && typeof stored.facts === "object" ? stored.facts : {} };
    }
    const tables = {};
    for (const [key, value] of Object.entries(stored)) {
      if (/^(?:[0-9]|1[0-2])$/.test(key) && value && typeof value === "object") {
        tables[key] = value;
      }
    }
    return { tables, facts: {} };
  }
  const progress = loadProgress();

  function show(name) {
    screens.forEach(s => $(s).classList.toggle("hidden", s !== name));
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
    catch (error) { console.warn("Could not save progress on this device.", error); }
  }
  function starsFor(score) { return score >= 12 ? 3 : score >= 9 ? 2 : score >= 6 ? 1 : 0; }
  function totalStars() {
    return Object.values(progress.tables).reduce((sum, p) => sum + (Number(p.stars) || 0), 0);
  }
  function factKey(a, b) { return `${a}x${b}`; }
  function factStats(a, b) {
    return progress.facts[factKey(a, b)] || { attempts: 0, correct: 0 };
  }
  function tableStats(n) {
    let practiced = 0, attempts = 0, correct = 0;
    for (let b = 0; b <= 12; b++) {
      const f = factStats(n, b);
      if (f.attempts > 0) practiced++;
      attempts += Number(f.attempts) || 0;
      correct += Number(f.correct) || 0;
    }
    return { practiced, attempts, correct };
  }
  function recordFact(q, ok) {
    const key = factKey(q.a, q.b);
    const old = factStats(q.a, q.b);
    progress.facts[key] = {
      attempts: (Number(old.attempts) || 0) + 1,
      correct: (Number(old.correct) || 0) + (ok ? 1 : 0)
    };
    save(); // Saved on every submitted answer, even if the child leaves early.
  }

  function renderHome() {
    $("totalProgress").textContent = `⭐ ${totalStars()} stars`;
    $("tableGrid").replaceChildren();
    for (let n = 0; n <= 12; n++) {
      const p = progress.tables[n] || { best: 0, stars: 0 };
      const stats = tableStats(n);
      const stars = Math.max(0, Math.min(3, Number(p.stars) || 0));
      const card = document.createElement("button");
      card.type = "button";
      card.className = "table-card";
      card.innerHTML =
        `<div class="num">×${n}</div>` +
        `<div class="sub">${stats.practiced}/13 facts practiced</div>` +
        `<div class="stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>`;
      card.addEventListener("click", () => chooseTable(n));
      $("tableGrid").appendChild(card);
    }
  }
  function chooseTable(n) {
    table = n;
    mode = "practice";
    $("setupTitle").textContent = `The ×${n} table`;
    const p = progress.tables[n];
    $("bestScore").textContent = p && p.attempts
      ? `Best completed score: ${p.best}/13 · ${p.attempts} completed ${p.attempts === 1 ? "round" : "rounds"}`
      : "No completed rounds yet. You can earn your first star!";
    const stats = tableStats(n);
    const accuracy = stats.attempts ? ` · ${Math.round(100 * stats.correct / stats.attempts)}% correct so far` : "";
    $("factProgress").textContent = `🧠 ${stats.practiced} of 13 facts practiced${accuracy}`;
    document.querySelectorAll(".mode").forEach(b =>
      b.classList.toggle("active", b.dataset.mode === mode));
    show("setup");
  }

  document.querySelectorAll(".mode").forEach(b => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    document.querySelectorAll(".mode").forEach(x =>
      x.classList.toggle("active", x === b));
  }));
  $("backHome").addEventListener("click", () => { renderHome(); show("home"); });

  // Uses a fair Fisher-Yates shuffle instead of random-sort.
  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }
  function focusPriority(q) {
    const f = factStats(q.a, q.b);
    return f.attempts ? Number(f.correct) / Number(f.attempts) : -1;
  }
  function start() {
    questions = Array.from({ length: 13 }, (_, b) => ({ a: table, b }));
    if (mode === "quiz") {
      shuffle(questions);
    } else if (mode === "focus") {
      // Unseen facts first, then lowest accuracy, then fewest tries.
      questions.sort((a, b) =>
        focusPriority(a) - focusPriority(b) ||
        factStats(a.a, a.b).attempts - factStats(b.a, b.b).attempts ||
        a.b - b.b);
    }
    index = 0;
    answers = [];
    sessionActive = true;
    const labels = { practice: "Guided practice", quiz: "Quiz time", focus: "Tricky Facts" };
    $("gameLabel").textContent = `×${table} · ${labels[mode]}`;
    show("game");
    showQuestion();
  }
  function showQuestion() {
    if (!sessionActive || index >= questions.length) return;
    const q = questions[index];
    $("question").textContent = `${q.a} × ${q.b} = ?`;
    $("questionCount").textContent = `${index + 1} / ${questions.length}`;
    $("bar").style.width = `${index / questions.length * 100}%`;
    $("answer").value = "";
    $("answer").focus();
  }
  function exitGame() {
    // Abandon the unfinished round: never touch completed-round score/stars.
    sessionActive = false;
    questions = [];
    answers = [];
    index = 0;
    renderHome();
    show("home");
  }
  $("exitGame").addEventListener("click", exitGame);
  $("startGame").addEventListener("click", start);

  $("answerForm").addEventListener("submit", event => {
    event.preventDefault();
    if (!sessionActive || index >= questions.length) return;
    const raw = $("answer").value.trim();
    if (!/^\d+$/.test(raw)) return;
    const q = questions[index];
    const entered = Number(raw);
    const correct = q.a * q.b;
    const ok = entered === correct;
    answers.push({ q, entered, correct, ok });
    recordFact(q, ok);
    index++;
    if (index < questions.length) showQuestion();
    else finish();
  });

  function finish() {
    if (!sessionActive || answers.length !== 13) return;
    sessionActive = false;
    const score = answers.filter(a => a.ok).length;
    const old = progress.tables[table] || { best: 0, stars: 0, attempts: 0 };
    const earned = starsFor(score);
    const previousStars = Number(old.stars) || 0;
    progress.tables[table] = {
      best: Math.max(Number(old.best) || 0, score),
      stars: Math.max(previousStars, earned),
      attempts: (Number(old.attempts) || 0) + 1,
      last: score
    };
    save();
    renderHome();
    $("score").textContent = `${score} / 13`;
    $("scoreCaption").textContent = score === 13
      ? "Perfect score! You're a multiplication superstar!"
      : score >= 10 ? "Amazing effort! Keep shining!"
      : score >= 6 ? "Good practice! You're getting stronger!"
      : "Every try helps your brain grow. Try again!";
    $("resultEmoji").textContent = score === 13 ? "🏆" : score >= 9 ? "🌟" : "💪";
    $("newStars").textContent = earned > previousStars
      ? `You earned ${earned - previousStars} new ${earned - previousStars === 1 ? "star" : "stars"}! ⭐`
      : `This round earned ${earned} ${earned === 1 ? "star" : "stars"}!`;
    $("reviewList").replaceChildren();
    answers.forEach(a => {
      const row = document.createElement("div");
      row.className = "review-row";
      const left = document.createElement("span");
      left.textContent = `${a.q.a} × ${a.q.b} = ${a.correct}`;
      const right = document.createElement("span");
      right.className = a.ok ? "good" : "bad";
      right.textContent = a.ok ? "✓ Correct" : `You said ${a.entered}`;
      row.append(left, right);
      $("reviewList").appendChild(row);
    });
    $("bar").style.width = "100%";
    show("results");
  }
  $("retry").addEventListener("click", start);
  $("toHome").addEventListener("click", () => { renderHome(); show("home"); });
  renderHome();
})();
