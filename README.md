# AR Virtual Physics Lab

An Augmented-Reality-inspired **virtual laboratory** for engineering practical
experiments, built with **Flask + SQLite3 + HTML/CSS/JS + Three.js (WebGL)**,
with a drag-and-drop circuit builder, spoken step-by-step guidance, a scored
mock-test system, and a Gemini-powered voice AI assistant.

## What's new in this version

1. **Manual terminal-to-terminal circuit wiring** — Ohm's Law no longer uses
   "drag the battery onto the battery slot". You get a real board with three
   components and six terminals, plus written wiring guidelines to analyse
   first. You draw each wire yourself from any terminal to any other terminal
   (drag, or tap-then-tap on touch). The circuit is validated as a genuine
   **series loop** — every component used once, every terminal used once,
   forming one closed cycle — so any correct wiring order is accepted, and
   shorting a component or leaving the loop open is rejected with a reason.
2. **Realistic AR view** — every experiment has an **AR View** button that
   opens your device's rear camera, makes the 3D scene transparent so the
   model appears in your actual room, grounds it with a soft contact shadow,
   overlays an AR tracking HUD, and on phones/tablets couples the camera to
   the **gyroscope** so physically moving your device looks around the model.
3. **Clean speech output** — TTS no longer reads "asterisk asterisk" for
   `**bold**`. All text is passed through a Markdown sanitizer before speech
   (`strip_markdown_for_speech`), which strips formatting characters and
   speaks symbols naturally: `*` between values becomes "times", `/` becomes
   "divided by", and `Ω`, `°`, `π`, `√`, `≈` become "ohms", "degrees", "pi",
   "square root of", "approximately". Gemini is also instructed to reply in
   speech-friendly prose, and chat bubbles render bold/italic as real
   formatting instead of raw asterisks.
4. **Voice-guided steps** — 🔊 per step plus an "Auto Guide" button, using
   gTTS → mutagen → pygame, with browser-speech fallback offline.
5. **Convex/Concave Lens Optics Lab** — real 3D lens geometry with a live ray
   diagram, switchable between converging and diverging.
6. **Mock Test + credits** — quiz plus a practical check graded against your
   *current* live experiment settings; scores and credits on the dashboard.
7. **AI Lab Assistant chatbot** — Gemini-backed, voice in and voice out.
8. **Light workspace theme** — experiment pages are bright; dashboard is dark.

## Using the AR view

Tap **📷 AR View** on any experiment page and allow camera access.

- **Camera access requires a secure context.** It works on `localhost` out of
  the box. If you open the app from another device over your LAN (e.g.
  `http://192.168.1.x:5000`), browsers will block the camera unless it's
  HTTPS. For a quick demo over LAN, run with an ad-hoc certificate:
  `pip install pyopenssl` then change the last line of `app.py` to
  `app.run(debug=True, host="0.0.0.0", ssl_context="adhoc")` and visit the
  `https://` URL (accept the browser warning).
- On a **phone or tablet**, you also get gyroscope parallax — move the device
  and the viewpoint moves around the model. iOS will ask for motion-sensor
  permission separately from camera permission.
- On a **desktop without a webcam**, AR simply reports that the camera isn't
  available and the normal 3D view keeps working.

## Experiments included

1. **Ohm's Law Circuit Lab** — drag-and-drop circuit builder + animated
   current-flow particles. `V = I × R`
2. **Simple Pendulum (SHM)** — numerically integrated pendulum physics with a
   motion trail. `T = 2π√(L/g)`
3. **Convex/Concave Lens Optics Lab** — true 3D lens geometry with a live ray
   diagram, real/virtual image detection. `1/v − 1/u = 1/f`

## Tech stack

| Layer          | Technology                                        |
|----------------|-----------------------------------------------------|
| Backend        | Python 3, Flask                                     |
| Database       | SQLite3 (users, activity logs, feedback, scores, chat history) |
| Templating     | Jinja2                                              |
| Frontend       | HTML5, CSS3, vanilla JavaScript (native Drag & Drop API) |
| 3D / AR        | Three.js (WebGL) + OrbitControls                    |
| Auth           | Werkzeug password hashing + Flask sessions          |
| Voice guide    | gTTS (speech synthesis) + mutagen (duration) + pygame (audio validation) |
| AI Assistant   | Google Gemini API (`google-generativeai`) + Web Speech API (voice input) |

## Project structure

```
arlab/
├── app.py                      # Flask app: routes, auth, mock-test grading, chatbot, TTS
├── config.py                   # Gemini API key / model setup (reads from env)
├── voice.py                    # gTTS + mutagen + pygame TTS pipeline
├── requirements.txt
├── .env.example                # copy to .env and add your Gemini key
├── arlab.db                    # created automatically on first run
├── templates/
│   ├── base.html                 # shared layout, nav, footer, chatbot widget
│   ├── home.html / about.html
│   ├── login.html / register.html
│   ├── dashboard.html            # experiment picker + credits
│   ├── analytics.html            # usability/performance/score evaluation
│   ├── experiment_ohm.html       # drag-and-drop builder + 3D sim + mock test
│   ├── experiment_pendulum.html
│   └── experiment_lens.html
└── static/
    ├── css/style.css            # dark dashboard theme + light experiment theme
    ├── audio/                   # generated TTS mp3 cache (auto-created)
    └── js/
        ├── main.js               # nav, tabs, star ratings
        ├── ohm.js                # Ohm's Law 3D scene + physics
        ├── circuit_builder.js    # manual terminal-to-terminal wiring + validation
        ├── pendulum.js           # Pendulum 3D scene + physics
        ├── lens.js               # Lens 3D scene + ray tracing
        ├── ar.js                 # camera passthrough AR view + gyro parallax
        ├── voiceguide.js         # per-step + auto TTS playback (markdown-stripped)
        ├── mocktest.js           # quiz + practical grading UI
        └── chatbot.js            # Gemini chat widget + voice input/output
```

## Setup & run

```bash
# 1. Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. (Optional but recommended) enable the AI assistant
cp .env.example .env
# then edit .env and paste your Gemini API key into GEMINI_API_KEY=
# get a key at https://aistudio.google.com/app/apikey

# 4. Run the app
python app.py
```

Then open **http://127.0.0.1:5000**. The SQLite database and all tables are
created automatically on first run.

> **Security note on API keys:** never commit a real API key to source
> control. This project reads `GEMINI_API_KEY` from your environment / `.env`
> file (via `config.py`) instead of hard-coding it, so it's safe to share this
> codebase without leaking your key. If a key has ever been pasted into a
> chat, document, or public repo, treat it as compromised and regenerate it
> in Google AI Studio.

Without a Gemini key configured, every other feature (3D sims, drag-and-drop,
voice guide, mock tests) still works fully — the chatbot just replies with a
message explaining it isn't configured yet.

## Database schema

- **users** — id, full_name, username, email, password_hash, created_at
- **activity_log** — every slider change / circuit connection / launch / mock
  test submission, timestamped, per user and experiment
- **feedback** — star ratings (1–5) per experiment
- **scores** — quiz_score, practical_score, bonus_score, total_score per
  mock-test attempt (used for dashboard credits and the Analytics page)
- **chat_history** — recent chatbot turns per user, used to give Gemini
  short-term conversational memory

## Notes

- Three.js, OrbitControls, and the Gemini/gTTS calls all need outbound
  internet access from wherever you run the Flask server (your machine),
  since gTTS calls Google Translate's TTS endpoint and Gemini calls
  Google's Generative Language API.
- If gTTS can't reach the internet, the voice guide automatically falls back
  to the browser's own built-in speech synthesis — voice guidance still works,
  just with your OS's system voice instead of gTTS's.
- `pygame.mixer` is initialized with the "dummy" SDL audio driver so it works
  fine on headless servers with no sound card; it's used purely to validate
  that generated speech files are well-formed, not to play audio on the server.
- Want to hear the gTTS + mutagen + pygame pipeline actually play through your
  own speakers (rather than through the browser)? Run:
  `python tools/voice_preview.py "Drag the battery into the left slot."`
- To reset all data, delete `arlab.db` and restart the app.
