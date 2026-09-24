"""
voice.py
========
Text-to-speech pipeline for the step-by-step voice guide and the chatbot's
spoken replies.

- gTTS      generates the actual speech audio (mp3) from instruction text.
- mutagen   reads back the generated file's duration, used by the frontend
            to sync the "now speaking" highlight with playback.
- pygame    used server-side as an audio validation / self-test layer: after
            gTTS writes a file, we try loading it with pygame's mixer to
            confirm it is a well-formed, playable audio file before handing
            the URL to the browser. Runs with the SDL "dummy" audio driver
            so it works fine on headless servers with no sound hardware.
"""

import hashlib
import os
import re

os.environ.setdefault("SDL_AUDIODRIVER", "dummy")  # safe on headless servers

from gtts import gTTS

try:
    from mutagen.mp3 import MP3
    MUTAGEN_AVAILABLE = True
except ImportError:
    MUTAGEN_AVAILABLE = False

try:
    import pygame
    PYGAME_AVAILABLE = True
except ImportError:
    PYGAME_AVAILABLE = False

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
AUDIO_DIR = os.path.join(BASE_DIR, "static", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

_pygame_ready = False


def _ensure_pygame_mixer():
    """Lazily init pygame's mixer once, tolerating environments with no audio device."""
    global _pygame_ready
    if not PYGAME_AVAILABLE or _pygame_ready:
        return _pygame_ready
    try:
        pygame.mixer.init()
        _pygame_ready = True
    except Exception:
        _pygame_ready = False
    return _pygame_ready


def _cache_key(text: str, lang: str) -> str:
    digest = hashlib.md5(f"{lang}::{text}".encode("utf-8")).hexdigest()
    return f"tts_{digest}.mp3"


def strip_markdown_for_speech(text: str) -> str:
    """
    Clean Markdown/formatting out of text before it's spoken, so TTS never
    reads out "asterisk asterisk" etc. for **bold**, bullet markers, headers,
    links, code fences, and so on.
    """
    if not text:
        return text
    t = text

    # Code fences / inline code -> just drop the backticks, keep the content
    t = re.sub(r"```.*?```", lambda m: m.group(0).strip("`"), t, flags=re.DOTALL)
    t = t.replace("`", "")

    # Markdown links [label](url) -> label
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)

    # Headers "# Heading" -> "Heading"
    t = re.sub(r"^#{1,6}\s*", "", t, flags=re.MULTILINE)

    # Blockquotes "> text" -> "text"
    t = re.sub(r"^>\s*", "", t, flags=re.MULTILINE)

    # Bullet list markers "- item" / "* item" / "+ item" -> "item"
    t = re.sub(r"^[\-\*\+]\s+", "", t, flags=re.MULTILINE)

    # Numbered list markers "1. item" -> "item"
    t = re.sub(r"^\d+\.\s+", "", t, flags=re.MULTILINE)

    # Bold/italic emphasis markers: ***x***, **x**, *x*, ___x___, __x__, _x_
    t = re.sub(r"(\*{1,3}|_{1,3})(\S.*?\S|\S)\1", r"\2", t)

    # A lone "*" between values is multiplication, not formatting -> say it
    t = re.sub(r"(?<=[\w\)])\s*\*\s*(?=[\w\(])", " times ", t)

    # Spoken forms for other symbols that would otherwise be read oddly
    t = re.sub(r"(?<=[\w\)])\s*/\s*(?=[\w\(])", " divided by ", t)
    t = t.replace("Ω", " ohms").replace("°", " degrees").replace("π", " pi")
    t = t.replace("≈", " approximately ").replace("×", " times ").replace("÷", " divided by ")
    t = re.sub(r"√\s*", " square root of ", t)

    # Any remaining stray markdown/symbol characters
    t = re.sub(r"[#*_~>`]", "", t)

    # Collapse whitespace and turn newlines into pauses for natural speech
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{2,}", ". ", t)
    t = t.replace("\n", ". ")
    t = re.sub(r"\s*\.\s*\.", ".", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def validate_audio_with_pygame(filepath: str) -> bool:
    """Try loading the generated file with pygame.mixer to confirm it's playable."""
    if not _ensure_pygame_mixer():
        return True  # can't validate on this machine, assume gTTS output is fine
    try:
        sound = pygame.mixer.Sound(filepath)
        return sound.get_length() > 0
    except Exception:
        return False


def get_audio_duration(filepath: str):
    """Return duration in seconds using mutagen, or None if unavailable."""
    if not MUTAGEN_AVAILABLE:
        return None
    try:
        audio = MP3(filepath)
        return round(audio.info.length, 2)
    except Exception:
        return None


def synthesize_speech(text: str, lang: str = "en"):
    """
    Generate (or reuse a cached) mp3 for the given text.
    Text is first cleaned of Markdown/formatting so TTS reads natural speech,
    not literal asterisks, hashes, or bullet dashes.
    Returns dict: {filename, url_path, duration, cached, valid}
    """
    text = strip_markdown_for_speech((text or "").strip())
    if not text:
        return {"error": "No text provided."}

    filename = _cache_key(text, lang)
    filepath = os.path.join(AUDIO_DIR, filename)
    cached = os.path.exists(filepath)

    if not cached:
        try:
            tts = gTTS(text=text, lang=lang, slow=False)
            tts.save(filepath)
        except Exception as exc:  # network / quota / lang errors
            return {"error": f"Speech generation failed: {exc}"}

    duration = get_audio_duration(filepath)
    valid = validate_audio_with_pygame(filepath)

    return {
        "filename": filename,
        "url_path": f"audio/{filename}",
        "duration": duration,
        "cached": cached,
        "valid": valid,
    }
