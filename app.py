"""
AR Virtual Physics Lab
=======================
Flask + SQLite3 backend for an Augmented-Reality-style virtual laboratory
that lets students perform interactive 3D physics experiments in the browser.

Run with:
    python app.py
Then open http://127.0.0.1:5000
"""

import math
import os
import sqlite3
from datetime import datetime
from functools import wraps

from flask import (
    Flask, render_template, request, redirect,
    url_for, session, flash, g, jsonify
)
from werkzeug.security import generate_password_hash, check_password_hash

import config
import voice

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, "arlab.db")

app = Flask(__name__)
app.config["SECRET_KEY"] = "ar-virtual-lab-secret-key-change-me"
app.config["DATABASE"] = DB_PATH

# --------------------------------------------------------------------------
# Experiment catalogue
# --------------------------------------------------------------------------

EXPERIMENTS = {
    "ohm": {
        "id": "ohm",
        "title": "Ohm's Law Circuit Lab",
        "tagline": "Drag and drop real components to wire a circuit, then launch the simulation.",
        "formula": "V = I × R",
        "icon": "circuit",
        "difficulty": "Beginner",
        "duration": "15 min",
        "concepts": ["Voltage", "Current", "Resistance", "Series Circuits"],
    },
    "pendulum": {
        "id": "pendulum",
        "title": "Simple Pendulum (SHM)",
        "tagline": "Swing a 3D pendulum and explore how length and gravity control its period.",
        "formula": "T = 2π√(L / g)",
        "icon": "pendulum",
        "difficulty": "Beginner",
        "duration": "15 min",
        "concepts": ["Simple Harmonic Motion", "Period", "Gravity", "Damping"],
    },
    "lens": {
        "id": "lens",
        "title": "Convex / Concave Lens Optics Lab",
        "tagline": "Switch between converging and diverging lenses and trace real 3D ray diagrams.",
        "formula": "1/v − 1/u = 1/f",
        "icon": "lens",
        "difficulty": "Intermediate",
        "duration": "20 min",
        "concepts": ["Refraction", "Focal Length", "Real & Virtual Images", "Magnification"],
    },
}

TECH_STACK = [
    {"name": "Python 3 & Flask", "role": "Backend web framework & routing"},
    {"name": "SQLite3", "role": "Users, activity logs, feedback & mock-test scores"},
    {"name": "Jinja2", "role": "Server-side HTML templating"},
    {"name": "HTML5 / CSS3", "role": "Responsive, themed lab interface"},
    {"name": "Vanilla JavaScript", "role": "Drag-and-drop circuit builder, app logic"},
    {"name": "Three.js (WebGL)", "role": "Real-time interactive 3D experiment models"},
    {"name": "Werkzeug Security", "role": "Password hashing for authentication"},
    {"name": "gTTS + mutagen + pygame", "role": "Step-by-step voice guidance pipeline"},
    {"name": "Google Gemini API", "role": "AI lab assistant chatbot with voice"},
]

# --------------------------------------------------------------------------
# Mock test content — quiz questions + practical answer checkers
# --------------------------------------------------------------------------

QUIZZES = {
    "ohm": [
        {"q": "What does Ohm's Law relate to each other?",
         "options": ["Voltage, Current, Resistance", "Force, Mass, Acceleration",
                     "Energy, Mass, Speed of light", "Power, Time, Work"], "correct": 0},
        {"q": "If resistance increases while voltage stays constant, current will:",
         "options": ["Increase", "Decrease", "Stay the same", "Become zero"], "correct": 1},
        {"q": "What is the SI unit of electrical resistance?",
         "options": ["Ampere", "Volt", "Ohm", "Watt"], "correct": 2},
    ],
    "pendulum": [
        {"q": "The period of a simple pendulum depends mainly on:",
         "options": ["Mass of the bob only", "Length and gravity",
                     "Amplitude only", "Color of the bob"], "correct": 1},
        {"q": "On the Moon (lower gravity), a pendulum's period compared to Earth is:",
         "options": ["Shorter", "Longer", "Exactly the same", "Zero"], "correct": 1},
        {"q": "Simple pendulum motion (for small angles) is an example of:",
         "options": ["Simple Harmonic Motion", "Projectile Motion",
                     "Uniform Circular Motion", "Free fall only"], "correct": 0},
    ],
    "lens": [
        {"q": "A convex lens is also known as a:",
         "options": ["Diverging lens", "Converging lens", "Plane lens", "Prism"], "correct": 1},
        {"q": "A concave lens always forms a:",
         "options": ["Real, inverted image", "Virtual, erect, diminished image",
                     "Real, magnified image", "Inverted real image at infinity"], "correct": 1},
        {"q": "In 1/v − 1/u = 1/f, if a convex lens's object sits exactly at the focus, the image forms at:",
         "options": ["The focus", "Infinity", "The optical centre", "Twice the focal length"], "correct": 1},
    ],
}


def _check_ohm(params):
    v = float(params["v"]); r = float(params["r"])
    return v / r


def _check_pendulum(params):
    l = float(params["l"]); gr = float(params["g"])
    return 2 * math.pi * math.sqrt(l / gr)


def _check_lens(params):
    f = float(params["f"]); u = float(params["u"])
    lens_type = params.get("type", "convex")
    u_signed = -u
    f_signed = f if lens_type == "convex" else -f
    denom = (1 / f_signed) + (1 / u_signed)
    if denom == 0:
        return None  # image at infinity
    return 1 / denom


PRACTICAL_CHECKS = {
    "ohm": {"fn": _check_ohm, "unit": "A", "label": "current (I)"},
    "pendulum": {"fn": _check_pendulum, "unit": "s", "label": "period (T)"},
    "lens": {"fn": _check_lens, "unit": "cm", "label": "image distance (v)"},
}

# --------------------------------------------------------------------------
# Database helpers
# --------------------------------------------------------------------------

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    first_time = not os.path.exists(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            experiment TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            experiment TEXT NOT NULL,
            rating INTEGER NOT NULL,
            comments TEXT,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            experiment TEXT NOT NULL,
            quiz_score INTEGER NOT NULL,
            practical_score INTEGER NOT NULL,
            bonus_score INTEGER NOT NULL DEFAULT 0,
            total_score INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)
    conn.commit()
    conn.close()
    if first_time:
        print(f"[AR Virtual Lab] Created new database at {DB_PATH}")


# --------------------------------------------------------------------------
# Auth helpers
# --------------------------------------------------------------------------

def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if session.get("user_id") is None:
            flash("Please log in to access the virtual lab.", "warning")
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapped_view


@app.context_processor
def inject_globals():
    return {
        "current_user": {
            "id": session.get("user_id"),
            "username": session.get("username"),
            "full_name": session.get("full_name"),
        },
        "now_year": datetime.now().year,
        "gemini_available": config.GEMINI_AVAILABLE,
    }


# --------------------------------------------------------------------------
# Public pages
# --------------------------------------------------------------------------

@app.route("/")
def home():
    return render_template("home.html", experiments=EXPERIMENTS, tech_stack=TECH_STACK)


@app.route("/about")
def about():
    return render_template("about.html", experiments=EXPERIMENTS, tech_stack=TECH_STACK)


# --------------------------------------------------------------------------
# Authentication
# --------------------------------------------------------------------------

@app.route("/register", methods=["GET", "POST"])
def register():
    if session.get("user_id"):
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        full_name = request.form.get("full_name", "").strip()
        username = request.form.get("username", "").strip().lower()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")

        errors = []
        if not full_name or not username or not email or not password:
            errors.append("All fields are required.")
        if len(username) < 3:
            errors.append("Username must be at least 3 characters.")
        if len(password) < 6:
            errors.append("Password must be at least 6 characters.")
        if password != confirm_password:
            errors.append("Passwords do not match.")

        if not errors:
            db = get_db()
            existing = db.execute(
                "SELECT id FROM users WHERE username = ? OR email = ?",
                (username, email),
            ).fetchone()
            if existing:
                errors.append("Username or email is already registered.")

        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("register.html", form=request.form)

        password_hash = generate_password_hash(password)
        db = get_db()
        db.execute(
            "INSERT INTO users (full_name, username, email, password_hash, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (full_name, username, email, password_hash, datetime.now().isoformat()),
        )
        db.commit()
        flash("Account created successfully! Please log in to enter the lab.", "success")
        return redirect(url_for("login"))

    return render_template("register.html", form={})


@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("user_id"):
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        identifier = request.form.get("identifier", "").strip().lower()
        password = request.form.get("password", "")

        db = get_db()
        user = db.execute(
            "SELECT * FROM users WHERE username = ? OR email = ?",
            (identifier, identifier),
        ).fetchone()

        if user and check_password_hash(user["password_hash"], password):
            session.clear()
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            session["full_name"] = user["full_name"]
            flash(f"Welcome back, {user['full_name']}!", "success")
            next_page = request.args.get("next") or url_for("dashboard")
            return redirect(next_page)
        else:
            flash("Invalid username/email or password.", "error")

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    flash("You have been logged out.", "info")
    return redirect(url_for("home"))


# --------------------------------------------------------------------------
# Dashboard & Experiments
# --------------------------------------------------------------------------

@app.route("/dashboard")
@login_required
def dashboard():
    db = get_db()
    rows = db.execute(
        "SELECT experiment, COUNT(*) as runs, MAX(timestamp) as last_run "
        "FROM activity_log WHERE user_id = ? GROUP BY experiment",
        (session["user_id"],),
    ).fetchall()
    progress = {r["experiment"]: dict(r) for r in rows}
    total_runs = sum(p["runs"] for p in progress.values()) if progress else 0

    score_rows = db.execute(
        "SELECT experiment, MAX(total_score) as best_score "
        "FROM scores WHERE user_id = ? GROUP BY experiment",
        (session["user_id"],),
    ).fetchall()
    best_scores = {r["experiment"]: r["best_score"] for r in score_rows}
    total_credits = sum(best_scores.values()) if best_scores else 0
    max_credits = len(EXPERIMENTS) * 100

    return render_template(
        "dashboard.html",
        experiments=EXPERIMENTS,
        progress=progress,
        total_runs=total_runs,
        completed_count=len(progress),
        best_scores=best_scores,
        total_credits=total_credits,
        max_credits=max_credits,
    )


@app.route("/experiment/<exp_id>")
@login_required
def experiment(exp_id):
    if exp_id not in EXPERIMENTS:
        flash("Unknown experiment.", "error")
        return redirect(url_for("dashboard"))

    template_map = {
        "ohm": "experiment_ohm.html",
        "pendulum": "experiment_pendulum.html",
        "lens": "experiment_lens.html",
    }

    db = get_db()
    best_row = db.execute(
        "SELECT MAX(total_score) as best FROM scores WHERE user_id = ? AND experiment = ?",
        (session["user_id"], exp_id),
    ).fetchone()
    best_score = best_row["best"] if best_row and best_row["best"] is not None else None

    return render_template(
        template_map[exp_id],
        exp=EXPERIMENTS[exp_id],
        all_experiments=EXPERIMENTS,
        quiz=QUIZZES[exp_id],
        best_score=best_score,
    )


@app.route("/api/log_activity", methods=["POST"])
@login_required
def log_activity():
    data = request.get_json(silent=True) or {}
    experiment_id = data.get("experiment", "unknown")
    action = data.get("action", "interaction")
    details = data.get("details", "")

    db = get_db()
    db.execute(
        "INSERT INTO activity_log (user_id, experiment, action, details, timestamp) "
        "VALUES (?, ?, ?, ?, ?)",
        (session["user_id"], experiment_id, action, str(details), datetime.now().isoformat()),
    )
    db.commit()
    return jsonify({"status": "ok"})


@app.route("/api/feedback", methods=["POST"])
@login_required
def submit_feedback():
    data = request.get_json(silent=True) or {}
    experiment_id = data.get("experiment", "unknown")
    rating = int(data.get("rating", 0))
    comments = data.get("comments", "")

    db = get_db()
    db.execute(
        "INSERT INTO feedback (user_id, experiment, rating, comments, timestamp) "
        "VALUES (?, ?, ?, ?, ?)",
        (session["user_id"], experiment_id, rating, comments, datetime.now().isoformat()),
    )
    db.commit()
    return jsonify({"status": "ok"})


# --------------------------------------------------------------------------
# Mock Test / Scoring API
# --------------------------------------------------------------------------

@app.route("/api/mock_test/submit", methods=["POST"])
@login_required
def mock_test_submit():
    data = request.get_json(silent=True) or {}
    exp_id = data.get("experiment")
    if exp_id not in EXPERIMENTS:
        return jsonify({"error": "Unknown experiment."}), 400

    quiz_answers = data.get("quiz_answers", [])
    practical_params = data.get("practical_params", {})
    student_answer_raw = data.get("student_answer", None)
    circuit_connected = bool(data.get("circuit_connected", False))

    # ---- Grade quiz (60 points: 20 each) ----
    quiz_defs = QUIZZES[exp_id]
    quiz_flags = []
    quiz_score = 0
    for i, question in enumerate(quiz_defs):
        chosen = quiz_answers[i] if i < len(quiz_answers) else None
        correct = (chosen == question["correct"])
        quiz_flags.append(correct)
        if correct:
            quiz_score += 20

    # ---- Grade practical (30 or 40 points depending on experiment) ----
    checker = PRACTICAL_CHECKS[exp_id]
    practical_max = 30 if exp_id == "ohm" else 40
    practical_score = 0
    correct_answer = None
    try:
        correct_answer = checker["fn"](practical_params)
        if correct_answer is not None and student_answer_raw not in (None, ""):
            student_answer = float(student_answer_raw)
            if correct_answer == 0:
                tolerance = 0.5
            else:
                tolerance = max(abs(correct_answer) * 0.08, 0.15)
            diff = abs(student_answer - correct_answer)
            if diff <= tolerance:
                practical_score = practical_max
            elif diff <= tolerance * 3:
                practical_score = round(practical_max * 0.5)
    except (KeyError, ValueError, TypeError, ZeroDivisionError):
        practical_score = 0

    # ---- Bonus: circuit correctly wired (Ohm's Law only, 10 points) ----
    bonus_score = 10 if (exp_id == "ohm" and circuit_connected) else 0

    total_score = min(quiz_score + practical_score + bonus_score, 100)

    db = get_db()
    db.execute(
        "INSERT INTO scores (user_id, experiment, quiz_score, practical_score, bonus_score, total_score, timestamp) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (session["user_id"], exp_id, quiz_score, practical_score, bonus_score, total_score,
         datetime.now().isoformat()),
    )
    db.commit()
    note = {"total_score": total_score}
    db.execute(
        "INSERT INTO activity_log (user_id, experiment, action, details, timestamp) VALUES (?,?,?,?,?)",
        (session["user_id"], exp_id, "mock_test_submitted", str(note), datetime.now().isoformat()),
    )
    db.commit()

    return jsonify({
        "quiz_score": quiz_score,
        "quiz_flags": quiz_flags,
        "practical_score": practical_score,
        "practical_max": practical_max,
        "correct_answer": None if correct_answer is None else round(correct_answer, 3),
        "correct_answer_label": checker["label"],
        "correct_answer_unit": checker["unit"],
        "bonus_score": bonus_score,
        "total_score": total_score,
    })


# --------------------------------------------------------------------------
# Voice guide API (gTTS + mutagen + pygame)
# --------------------------------------------------------------------------

@app.route("/api/tts", methods=["POST"])
@login_required
def tts():
    data = request.get_json(silent=True) or {}
    text = data.get("text", "")
    result = voice.synthesize_speech(text)
    if "error" in result:
        return jsonify(result), 502
    result["audio_url"] = url_for("static", filename=result["url_path"])
    return jsonify(result)


# --------------------------------------------------------------------------
# AI Assistant chatbot (Gemini) with voice reply
# --------------------------------------------------------------------------

SYSTEM_CONTEXT = (
    "You are the AI Lab Assistant embedded inside the AR Virtual Physics Lab, "
    "a web app where engineering students perform 3D simulations of Ohm's Law, "
    "the Simple Pendulum, and Convex/Concave Lens optics. Answer clearly and "
    "concisely (a few sentences unless asked for more detail), stay focused on "
    "physics concepts, the relevant formulas, and how to use the simulation "
    "controls. If the student mentions a specific experiment, tailor your "
    "explanation to it. Your replies are also read aloud by a text-to-speech "
    "voice, so write in plain conversational prose: keep Markdown formatting "
    "to a minimum, avoid heavy use of asterisks, bullet symbols and headers, "
    "and write formulas in words where it reads naturally (for example "
    "'voltage equals current times resistance')."
)


@app.route("/api/chatbot", methods=["POST"])
@login_required
def chatbot():
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    experiment_id = data.get("experiment")
    want_voice = bool(data.get("voice", False))

    if not message:
        return jsonify({"error": "No message provided."}), 400

    if not config.GEMINI_AVAILABLE:
        reply = (
            "The AI assistant isn't configured yet — set the GEMINI_API_KEY "
            "environment variable (see .env.example) and restart the server "
            f"to enable it. (Detail: {config.GEMINI_INIT_ERROR})"
        )
        return jsonify({"reply": reply, "voice_enabled": False})

    db = get_db()
    history_rows = db.execute(
        "SELECT role, message FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 10",
        (session["user_id"],),
    ).fetchall()
    history_rows = list(reversed(history_rows))

    gemini_history = [{"role": "user", "parts": [SYSTEM_CONTEXT]},
                       {"role": "model", "parts": ["Understood — I'll help with the lab experiments."]}]
    for row in history_rows:
        role = "user" if row["role"] == "user" else "model"
        gemini_history.append({"role": role, "parts": [row["message"]]})

    prompt = message
    if experiment_id in EXPERIMENTS:
        prompt = f"[Current experiment open: {EXPERIMENTS[experiment_id]['title']}]\n{message}"

    try:
        chat = config.gemini_model.start_chat(history=gemini_history)
        gemini_response = chat.send_message(prompt)
        reply_text = gemini_response.text
    except Exception as exc:  # noqa: BLE001
        reply_text = f"Sorry, the AI assistant hit an error talking to Gemini: {exc}"

    now = datetime.now().isoformat()
    db.execute("INSERT INTO chat_history (user_id, role, message, timestamp) VALUES (?,?,?,?)",
               (session["user_id"], "user", message, now))
    db.execute("INSERT INTO chat_history (user_id, role, message, timestamp) VALUES (?,?,?,?)",
               (session["user_id"], "model", reply_text, now))
    db.commit()

    audio_url = None
    if want_voice:
        # Strip Markdown before measuring length so the spoken version is
        # clean prose, never literal asterisks or bullet characters.
        speech_text = voice.strip_markdown_for_speech(reply_text)
        if len(speech_text) > 600:
            speech_text = speech_text[:600].rsplit(" ", 1)[0] + "…"
        result = voice.synthesize_speech(speech_text)
        if "error" not in result:
            audio_url = url_for("static", filename=result["url_path"])

    return jsonify({"reply": reply_text, "audio_url": audio_url, "voice_enabled": want_voice})


@app.route("/analytics")
@login_required
def analytics():
    db = get_db()
    exp_stats = db.execute(
        "SELECT experiment, COUNT(*) as total_runs, COUNT(DISTINCT user_id) as unique_users "
        "FROM activity_log GROUP BY experiment"
    ).fetchall()
    feedback_stats = db.execute(
        "SELECT experiment, ROUND(AVG(rating), 2) as avg_rating, COUNT(*) as num_ratings "
        "FROM feedback GROUP BY experiment"
    ).fetchall()
    score_stats = db.execute(
        "SELECT experiment, ROUND(AVG(total_score),1) as avg_score, MAX(total_score) as top_score, "
        "COUNT(*) as attempts FROM scores GROUP BY experiment"
    ).fetchall()
    user_count = db.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
    total_activity = db.execute("SELECT COUNT(*) as c FROM activity_log").fetchone()["c"]

    return render_template(
        "analytics.html",
        exp_stats=exp_stats,
        feedback_stats=feedback_stats,
        score_stats=score_stats,
        user_count=user_count,
        total_activity=total_activity,
        experiments=EXPERIMENTS,
    )


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
else:
    init_db()
