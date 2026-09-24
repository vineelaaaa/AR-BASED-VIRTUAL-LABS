// =============================================================
// Mock Test — quiz + practical scoring, tied to live experiment
// controls so "doing it the same way" earns real credit.
// =============================================================

(function () {
  const panel = document.querySelector(".mock-test-panel[data-experiment]");
  if (!panel) return;

  const experiment = panel.dataset.experiment;
  const echo = panel.querySelector("#currentSettingsEcho");
  const answerInput = panel.querySelector("#practicalAnswer");
  const submitBtn = panel.querySelector("#submitMockTestBtn");
  const resultBanner = panel.querySelector("#resultBanner");
  const scoreBig = panel.querySelector("#scoreBig");
  const resultBreakdown = panel.querySelector("#resultBreakdown");

  function currentParams() {
    if (experiment === "ohm" && typeof window.getOhmState === "function") {
      const s = window.getOhmState();
      return { v: s.v, r: s.r };
    }
    if (experiment === "pendulum" && typeof window.getPendulumState === "function") {
      const s = window.getPendulumState();
      return { l: s.l, g: s.g };
    }
    if (experiment === "lens" && typeof window.getLensState === "function") {
      const s = window.getLensState();
      return { f: s.f, u: s.u, type: s.type };
    }
    return {};
  }

  function refreshEcho() {
    if (!echo) return;
    const p = currentParams();
    if (experiment === "ohm") echo.textContent = `Current settings → V = ${p.v} V, R = ${p.r} Ω`;
    else if (experiment === "pendulum") echo.textContent = `Current settings → L = ${p.l} m, g = ${p.g} m/s²`;
    else if (experiment === "lens") echo.textContent = `Current settings → ${p.type} lens, f = ${p.f} cm, u = ${p.u} cm`;
  }
  refreshEcho();
  setInterval(refreshEcho, 1500); // keep in sync as the student adjusts sliders elsewhere on the page

  submitBtn.addEventListener("click", async () => {
    const quizAnswers = [];
    panel.querySelectorAll(".quiz-question").forEach((q) => {
      const checked = q.querySelector("input[type=radio]:checked");
      quizAnswers.push(checked ? parseInt(checked.value, 10) : null);
    });

    const payload = {
      experiment,
      quiz_answers: quizAnswers,
      practical_params: currentParams(),
      student_answer: answerInput.value,
      circuit_connected: !!(window.circuitBuilderState && window.circuitBuilderState.connected),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Grading…";

    try {
      const res = await fetch("/api/mock_test/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      scoreBig.textContent = `${data.total_score}/100`;
      const bonusLine = data.bonus_score
        ? `<span>Circuit bonus: +${data.bonus_score}</span>` : "";
      resultBreakdown.innerHTML = `
        <span>Quiz: ${data.quiz_score}/60</span>
        <span>Practical: ${data.practical_score}/${data.practical_max}</span>
        ${bonusLine}
        <span>Correct ${data.correct_answer_label}: ${data.correct_answer === null ? "∞" : data.correct_answer} ${data.correct_answer_unit}</span>
      `;
      resultBanner.classList.add("show");
      resultBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      scoreBig.textContent = "Error";
      resultBreakdown.textContent = "Could not reach the server to grade the test. Please try again.";
      resultBanner.classList.add("show");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Test";
    }
  });
})();
