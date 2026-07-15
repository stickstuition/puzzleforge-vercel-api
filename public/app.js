(() => {
  const app = document.querySelector("[data-app]");
  if (!app) return;

  const one = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const ui = Object.fromEntries([
    "service", "category", "setup-status", "loading-title", "loading-detail", "stages", "elapsed",
    "result-meta", "quality", "question-number", "prompt", "diagram", "answer-form", "answers",
    "feedback", "hint", "solution", "solution-steps", "review-dialog", "review-summary", "review-grid",
  ].map((name) => [name, one(`[data-ui="${name}"]`)]));
  const screens = Object.fromEntries(all("[data-screen]").map((screen) => [screen.dataset.screen, screen]));
  const HISTORY_KEY = "puzzleforge:standalone:v2";
  const state = {
    level: "junior",
    question: null,
    controller: null,
    attempts: 0,
    count: 0,
    timers: [],
    startedAt: 0,
    history: readHistory(),
  };
  const stageCopy = [
    ["Inventing eight visual situations", "The generator begins with pictures, not equations."],
    ["Scoring originality and aha factor", "Routine and decorative ideas are being removed."],
    ["Blind-solving three finalists", "An independent solver cannot see the intended answer."],
    ["Typesetting the competition diagram", "Only thin lines, essential labels, and restrained shading survive."],
    ["Verifying one unique answer", "The final examiner is checking ambiguity and hidden assumptions."],
  ];

  function readHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]").slice(-12); }
    catch { return []; }
  }
  function saveHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(-12))); }
    catch { /* Storage is optional. */ }
  }
  function escapeHtml(value) {
    const element = document.createElement("span");
    element.textContent = String(value ?? "");
    return element.innerHTML;
  }
  function normalize(value) { return String(value).replace(/[\s,]/g, "").toLowerCase(); }
  function showScreen(name) {
    Object.entries(screens).forEach(([key, screen]) => { screen.hidden = key !== name; });
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function selectedCategoryLabel() {
    return ui.category.options[ui.category.selectedIndex]?.text || "Curator’s choice";
  }

  all("[data-level]").forEach((button) => {
    button.addEventListener("click", () => {
      state.level = button.dataset.level;
      all("[data-level]").forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-checked", String(selected));
      });
    });
  });

  function clearTimers() {
    state.timers.forEach(clearTimeout);
    state.timers = [];
  }
  function setStage(index) {
    const stages = all("li", ui.stages);
    stages.forEach((stage, stageIndex) => {
      stage.classList.toggle("is-done", stageIndex < index);
      stage.classList.toggle("is-active", stageIndex === index);
    });
    const copy = stageCopy[Math.min(index, stageCopy.length - 1)];
    ui["loading-title"].textContent = copy[0];
    ui["loading-detail"].textContent = copy[1];
  }
  function startLoading() {
    showScreen("loading");
    setStage(0);
    state.startedAt = Date.now();
    const stageTimes = [9000, 22000, 40000, 62000];
    stageTimes.forEach((delay, index) => state.timers.push(setTimeout(() => setStage(index + 1), delay)));
    const tick = () => {
      if (!state.controller) return;
      const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
      ui.elapsed.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
      state.timers.push(setTimeout(tick, 1000));
    };
    tick();
  }
  function stopLoading() {
    clearTimers();
    state.controller = null;
  }

  async function forge() {
    if (state.controller) return;
    state.controller = new AbortController();
    ui["setup-status"].textContent = "The proofing press has started.";
    startLoading();
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          level: state.level,
          category: ui.category.value,
          recentFingerprints: state.history.map((item) => item.fingerprint).filter(Boolean).slice(-8),
        }),
        signal: state.controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Generation failed (${response.status})`);
      if (body.source !== "ai" || !body.diagramDataUri || !Array.isArray(body.options)) throw new Error("The forge returned an incomplete question.");
      renderQuestion(body);
      showScreen("result");
    } catch (error) {
      if (error.name === "AbortError") ui["setup-status"].textContent = "Generation cancelled. Nothing was published.";
      else {
        console.error("PuzzleForge request failed", error);
        ui["setup-status"].textContent = error.message || "The finalists did not clear review. Please try again.";
      }
      showScreen("setup");
    } finally {
      stopLoading();
    }
  }

  function renderQuestion(question) {
    state.question = question;
    state.attempts = 0;
    state.count += 1;
    ui["result-meta"].textContent = `${titleCase(question.level)} · ${selectedCategoryLabel()}`;
    ui.quality.textContent = `Quality ${question.qualityScore}/100 · blind verified`;
    ui["question-number"].textContent = `Question ${state.count}`;
    ui.prompt.textContent = question.prompt;
    ui.diagram.src = question.diagramDataUri;
    ui.diagram.alt = question.diagramAlt || "Essential diagram for the question";
    ui.answers.innerHTML = `<legend>Choose one answer</legend>${question.options.map((option, index) => `
      <label class="answer-option">
        <input type="radio" name="answer" value="${escapeHtml(option)}">
        <span><b>(${String.fromCharCode(65 + index)})</b>${escapeHtml(option)}</span>
      </label>`).join("")}`;
    ui.feedback.className = "feedback";
    ui.feedback.textContent = "Choose the answer supported by both the words and the diagram.";
    ui.hint.hidden = true;
    one("p", ui.hint).textContent = question.hint || "Look for the single relationship connecting the labelled parts.";
    ui.solution.hidden = true;
    one('[data-action="solution"]').disabled = true;
    ui["solution-steps"].innerHTML = (question.solutionSteps || []).map((step) => `<li>${escapeHtml(typeof step === "string" ? step : step.explanation)}</li>`).join("");
    renderReview(question.audit);
    state.history.push({ fingerprint: question.fingerprint, score: question.qualityScore });
    saveHistory();
  }

  function renderReview(audit) {
    const concepts = audit?.concepts || [];
    ui["review-summary"].textContent = audit?.notes?.join(" ") || "The published question survived independent solving and editorial review.";
    ui["review-grid"].innerHTML = concepts.map((concept) => `
      <article class="review-card ${concept.status === "winner" ? "is-winner" : ""}">
        <div class="review-card__top"><span>${escapeHtml(concept.status)}</span><span>${escapeHtml(concept.score)}/100</span></div>
        <h3>${escapeHtml(concept.title || "Candidate")}</h3>
        <p>${escapeHtml(concept.reason || "Removed during comparison.")}</p>
        <dl><dt>Fingerprint</dt><dd>${escapeHtml(concept.fingerprint)}</dd><dt>Hidden idea</dt><dd>${escapeHtml(concept.hiddenInsight)}</dd></dl>
      </article>`).join("");
  }

  function titleCase(value) {
    const text = String(value || "");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  function checkAnswer(event) {
    event.preventDefault();
    if (!state.question) return;
    const chosen = one('input[name="answer"]:checked');
    if (!chosen) {
      ui.feedback.className = "feedback is-wrong";
      ui.feedback.textContent = "Choose one of the five answers first.";
      return;
    }
    state.attempts += 1;
    if (normalize(chosen.value) === normalize(state.question.correctAnswer)) {
      ui.feedback.className = "feedback is-correct";
      ui.feedback.textContent = "Correct — you found the organising idea.";
      one('[data-action="solution"]').disabled = false;
    } else {
      ui.feedback.className = "feedback is-wrong";
      ui.feedback.textContent = state.attempts < 2 ? "Not yet. Re-read the diagram as part of the question." : "Second attempt complete. The worked solution is now available.";
      if (state.attempts >= 2) one('[data-action="solution"]').disabled = false;
    }
  }

  async function checkHealth() {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const health = await response.json();
      if (!response.ok || !health.openAIConfigured) throw new Error("not configured");
      ui.service.classList.add("is-online");
      ui.service.innerHTML = "<i></i>Forge online";
    } catch {
      ui.service.classList.add("is-offline");
      ui.service.innerHTML = "<i></i>Forge unavailable";
    }
  }

  all('[data-action="forge"]').forEach((button) => button.addEventListener("click", forge));
  one('[data-action="another"]').addEventListener("click", forge);
  one('[data-action="cancel"]').addEventListener("click", () => state.controller?.abort());
  ui["answer-form"].addEventListener("submit", checkAnswer);
  one('[data-action="hint"]').addEventListener("click", () => { ui.hint.hidden = !ui.hint.hidden; });
  one('[data-action="solution"]').addEventListener("click", () => { if (!one('[data-action="solution"]').disabled) ui.solution.hidden = false; });
  one('[data-action="close-solution"]').addEventListener("click", () => { ui.solution.hidden = true; });
  one('[data-action="review"]').addEventListener("click", () => ui["review-dialog"].showModal());
  one('[data-action="close-review"]').addEventListener("click", () => ui["review-dialog"].close());
  ui["review-dialog"].addEventListener("click", (event) => { if (event.target === ui["review-dialog"]) ui["review-dialog"].close(); });
  checkHealth();
})();
