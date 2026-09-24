// =============================================================
// Voice Guide — reads each experiment step aloud
// Backend: gTTS (+ mutagen + pygame validation) via /api/tts
// Falls back to the browser's built-in speechSynthesis if the
// backend TTS call fails (e.g. no internet reaching Google TTS).
// =============================================================

(function () {
  function stripMarkdownForSpeech(text) {
    if (!text) return text;
    let t = text;
    t = t.replace(/```[\s\S]*?```/g, (m) => m.replace(/`/g, ""));
    t = t.replace(/`/g, "");
    t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    t = t.replace(/^#{1,6}\s*/gm, "");
    t = t.replace(/^>\s*/gm, "");
    t = t.replace(/^[\-\*\+]\s+/gm, "");
    t = t.replace(/^\d+\.\s+/gm, "");
    t = t.replace(/(\*{1,3}|_{1,3})(\S.*?\S|\S)\1/g, "$2");
    t = t.replace(/([\w\)])\s*\*\s*([\w\(])/g, "$1 times $2");
    t = t.replace(/([\w\)])\s*\/\s*([\w\(])/g, "$1 divided by $2");
    t = t.replace(/Ω/g, " ohms").replace(/°/g, " degrees").replace(/π/g, " pi");
    t = t.replace(/≈/g, " approximately ").replace(/×/g, " times ").replace(/÷/g, " divided by ");
    t = t.replace(/√\s*/g, " square root of ");
    t = t.replace(/[#*_~`>]/g, "");
    t = t.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, ". ").replace(/\n/g, ". ");
    return t.replace(/\s+/g, " ").trim();
  }

  function speakWithBrowserFallback(text) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      const utter = new SpeechSynthesisUtterance(stripMarkdownForSpeech(text));
      utter.rate = 0.98;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    });
  }

  async function speakText(text) {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("tts backend unavailable");
      const data = await res.json();
      if (!data.audio_url) throw new Error("no audio url");
      await new Promise((resolve) => {
        const audio = new Audio(data.audio_url);
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
      });
    } catch (err) {
      await speakWithBrowserFallback(text);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".steps-panel[data-experiment]").forEach((panel) => {
      const experiment = panel.dataset.experiment;
      const list = panel.querySelector(".step-list");
      if (!list) return;
      const items = Array.from(list.querySelectorAll("li"));

      items.forEach((li) => {
        const text = li.textContent.trim();
        li.textContent = "";
        const span = document.createElement("span");
        span.className = "step-text";
        span.textContent = text;
        const btn = document.createElement("button");
        btn.className = "step-speak-btn";
        btn.type = "button";
        btn.title = "Read this step aloud";
        btn.innerHTML = "🔊";
        btn.addEventListener("click", async () => {
          li.classList.add("speaking");
          if (typeof logActivity === "function") logActivity(experiment, "voice_guide_step", { text });
          await speakText(text);
          li.classList.remove("speaking");
        });
        li.appendChild(btn);
        li.appendChild(span);
      });

      const autoBtn = panel.querySelector(".auto-guide-btn");
      if (autoBtn) {
        autoBtn.addEventListener("click", async () => {
          autoBtn.disabled = true;
          autoBtn.textContent = "🔊 Playing…";
          for (const li of items) {
            li.classList.add("speaking");
            const text = li.querySelector(".step-text").textContent;
            await speakText(text);
            li.classList.remove("speaking");
          }
          autoBtn.disabled = false;
          autoBtn.textContent = "🔊 Auto Guide";
          if (typeof logActivity === "function") logActivity(experiment, "voice_guide_auto_complete", {});
        });
      }
    });
  });
})();
