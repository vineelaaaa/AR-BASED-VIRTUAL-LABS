// Shared UI behaviour across all pages: nav toggle, info tabs, star ratings

document.addEventListener("DOMContentLoaded", () => {
  // ---- Mobile nav toggle ----
  const toggle = document.getElementById("navToggle");
  const links = document.getElementById("navLinks");
  if (toggle && links) {
    toggle.addEventListener("click", () => links.classList.toggle("open"));
  }

  // ---- Auto-dismiss flash messages ----
  document.querySelectorAll(".flash").forEach((flash) => {
    setTimeout(() => {
      flash.style.transition = "opacity .4s ease";
      flash.style.opacity = "0";
      setTimeout(() => flash.remove(), 400);
    }, 5000);
  });

  // ---- Generic info tab switcher (used on experiment pages) ----
  document.querySelectorAll("[data-tab-group]").forEach((group) => {
    const buttons = group.querySelectorAll(".info-tab-btn");
    const panels = group.querySelectorAll(".info-tab-panel");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        panels.forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        const target = document.getElementById(btn.dataset.tabTarget);
        if (target) target.classList.add("active");
      });
    });
  });

  // ---- Star rating feedback widget ----
  document.querySelectorAll(".feedback-row").forEach((row) => {
    const stars = row.querySelectorAll(".star-btn");
    let rating = 0;
    stars.forEach((star, idx) => {
      star.addEventListener("click", () => {
        rating = idx + 1;
        stars.forEach((s, i) => s.classList.toggle("active", i < rating));
        const expId = row.dataset.experiment;
        fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experiment: expId, rating: rating }),
        }).catch(() => {});
        const note = row.querySelector(".feedback-note");
        if (note) note.textContent = "Thanks for rating this experiment!";
      });
    });
  });
});

// Helper used by experiment pages to silently log an interaction
function logActivity(experiment, action, details) {
  fetch("/api/log_activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ experiment, action, details }),
  }).catch(() => {});
}
