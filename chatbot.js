// =============================================================
// AI Lab Assistant — floating chatbot widget
// Text + voice input (Web Speech API) -> Flask -> Gemini -> spoken reply
// =============================================================

(function () {
  const toggle = document.getElementById("chatbotToggle");
  const panel = document.getElementById("chatbotPanel");
  const closeBtn = document.getElementById("chatbotClose");
  const messages = document.getElementById("chatbotMessages");
  const input = document.getElementById("chatbotInput");
  const sendBtn = document.getElementById("chatSendBtn");
  const micBtn = document.getElementById("chatMicBtn");
  if (!toggle || !panel) return;

  const scriptTag = document.currentScript;
  const experimentId = scriptTag ? scriptTag.dataset.experiment : "";

  toggle.addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) input.focus();
  });
  closeBtn.addEventListener("click", () => panel.classList.remove("open"));

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // Render a safe, lightly-formatted version of the bot's markdown reply
  // (bold/italic/code/bullets) without ever using raw innerHTML from the model.
  function renderChatMarkdown(raw) {
    let t = escapeHtml(raw);
    t = t.replace(/^#{1,6}\s*(.+)$/gm, "<strong>$1</strong>");
    t = t.replace(/\*\*\*(\S.*?\S|\S)\*\*\*/g, "<strong><em>$1</em></strong>");
    t = t.replace(/\*\*(\S.*?\S|\S)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(?<!\*)\*(\S.*?\S|\S)\*(?!\*)/g, "<em>$1</em>");
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    t = t.replace(/^[\-\*\+]\s+(.+)$/gm, "• $1");
    t = t.replace(/\n/g, "<br>");
    return t;
  }

  function addMessage(text, who, extraClass) {
    const div = document.createElement("div");
    div.className = `chat-msg ${who}${extraClass ? " " + extraClass : ""}`;
    if (who === "bot") {
      div.innerHTML = renderChatMarkdown(text);
    } else {
      div.textContent = text;
    }
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  let sending = false;
  async function sendMessage(text) {
    if (!text || sending) return;
    sending = true;
    addMessage(text, "user");
    input.value = "";
    const thinkingEl = addMessage("Thinking…", "bot", "thinking");

    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, experiment: experimentId, voice: true }),
      });
      const data = await res.json();
      thinkingEl.classList.remove("thinking");
      thinkingEl.innerHTML = renderChatMarkdown(data.reply || data.error || "Sorry, something went wrong.");
      if (data.audio_url) {
        const audio = new Audio(data.audio_url);
        audio.play().catch(() => {});
      }
    } catch (err) {
      thinkingEl.classList.remove("thinking");
      thinkingEl.textContent = "Network error reaching the AI assistant.";
    } finally {
      sending = false;
    }
  }

  sendBtn.addEventListener("click", () => sendMessage(input.value.trim()));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage(input.value.trim());
  });

  // ---- Voice input via Web Speech API ----
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const recognizer = new SpeechRecognition();
    recognizer.lang = "en-US";
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;
    let listening = false;

    micBtn.addEventListener("click", () => {
      if (listening) {
        recognizer.stop();
        return;
      }
      try {
        recognizer.start();
        listening = true;
        micBtn.classList.add("recording");
      } catch (e) { /* already started */ }
    });

    recognizer.addEventListener("result", (event) => {
      const transcript = event.results[0][0].transcript;
      input.value = transcript;
      sendMessage(transcript);
    });
    recognizer.addEventListener("end", () => {
      listening = false;
      micBtn.classList.remove("recording");
    });
    recognizer.addEventListener("error", () => {
      listening = false;
      micBtn.classList.remove("recording");
    });
  } else {
    micBtn.disabled = true;
    micBtn.title = "Voice input isn't supported in this browser";
    micBtn.style.opacity = "0.4";
  }
})();
