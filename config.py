"""
config.py
=========
Central place for secrets / third-party client setup.

IMPORTANT — API key security:
Never hard-code a real API key into a source file you might commit to
version control or share. This project reads the Gemini API key from the
environment variable GEMINI_API_KEY (or a local .env file, see below).

Setup:
  1. Copy .env.example to .env
  2. Put your key in .env:   GEMINI_API_KEY=your-real-key-here
  3. (Optional) install python-dotenv if you want .env to auto-load, or
     just export the variable in your shell before running app.py:
        export GEMINI_API_KEY="your-real-key-here"      # macOS/Linux
        setx GEMINI_API_KEY "your-real-key-here"         # Windows
"""

import os

# Try to auto-load a local .env file if python-dotenv is installed.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL_NAME = os.environ.get("GEMINI_MODEL_NAME", "gemini-2.0-flash")

gemini_model = None
GEMINI_AVAILABLE = False
GEMINI_INIT_ERROR = None

if GEMINI_API_KEY:
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        gemini_model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        GEMINI_AVAILABLE = True
    except Exception as exc:  # noqa: BLE001 - want to surface any init issue
        GEMINI_INIT_ERROR = str(exc)
else:
    GEMINI_INIT_ERROR = "GEMINI_API_KEY environment variable is not set."
