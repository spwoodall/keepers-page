# The Keepers' Page

*An Age in many rooms.*

**[Play it in your browser →](https://spwoodall.github.io/keepers-page/)**

A short Myst-style puzzle game built with Three.js. The compass has stopped spinning. The captain has agreed to wait at the dock. The Keepers are long gone — but the library still stands, and the door bears three symbols. Only one was placed by the Keepers themselves.

Find the writings. Find what awaits beyond the sigil and the spiral.

## How to play

- **Drag** with the mouse to look around
- **Click** the glowing shapes to travel or interact
- **Listen** — the world responds to your actions. Books, mechanisms, and unseen passages all have a voice
- Around 15 minutes for the full path, longer if you wander

## Built with

- [Three.js](https://threejs.org/) — panoramic rendering
- [Skybox AI](https://skybox.blockadelabs.com/) + Adobe Photoshop — panoramas
- [ElevenLabs](https://elevenlabs.io/), [freesound.org](https://freesound.org/), [pixabay](https://pixabay.com/) — sound

## Inspired by

[Myst](https://en.wikipedia.org/wiki/Myst) (Cyan Worlds, 1993). This is a personal tribute, not a commercial work.

## Run locally

Pure static site — no build step.

```
cd keepers-page
python3 -m http.server 8765
# open http://localhost:8765
```

Any static file server works (`npx serve`, `caddy file-server`, etc.).

---

© 2026 Stephen Woodall
