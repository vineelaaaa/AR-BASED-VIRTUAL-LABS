"""
Offline voice-guidance preview tool
====================================
This small script demonstrates the gTTS -> mutagen -> pygame pipeline
*outside* the browser, for testing what a step-guidance line will sound
like directly on your own machine's speakers (the web app itself plays
generated audio through the browser's <audio> element instead, since a
server cannot push sound to a client's speakers directly).

Usage:
    python tools/voice_preview.py "Drag the battery into the left slot."

Requires: gtts, mutagen, pygame  (already in requirements.txt)
"""

import os
import sys
import tempfile
import time

from gtts import gTTS
from mutagen.mp3 import MP3
import pygame


def speak(text: str) -> None:
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        mp3_path = tmp.name

    print(f"Generating speech for: {text!r}")
    gTTS(text=text, lang="en").save(mp3_path)

    duration = MP3(mp3_path).info.length
    print(f"Audio duration: {duration:.2f}s")

    pygame.mixer.init()
    pygame.mixer.music.load(mp3_path)
    pygame.mixer.music.play()

    while pygame.mixer.music.get_busy():
        time.sleep(0.1)

    pygame.mixer.quit()
    os.remove(mp3_path)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print('Usage: python tools/voice_preview.py "text to speak"')
        sys.exit(1)
    speak(" ".join(sys.argv[1:]))
