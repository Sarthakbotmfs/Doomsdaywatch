# The Road to Doom

A fan-made MCU and multiverse watch tracker for getting ready for **Avengers: Doomsday** and **Avengers: Secret Wars**.

🌐 **Try it live:** [doomsdaywatch.lol](https://doomsdaywatch.lol/)

This started as a simple watch order and turned into a full-on prep room: curated storylines, a live countdown, collectible ticket stubs, achievements, audio effects, and comic lore for anyone who wants the context without watching absolutely everything.

## The highlights

### A watchlist that does not waste your time

The tracker includes the MCU movies, the key series, selected X-Men and Spider-Man legacy entries, and a shorter route for people who want the main plot beats fast.

### A live Doomsday countdown

See the time left until **December 18, 2026**, plus a watch-time calculator for the remaining runtime.

### Collectibles and progress tracking

- Generate holographic-style ticket stubs for watched titles.
- Rate movies from 1 to 5 stars.
- Write personal reviews and export or print your scorecard.
- Unlock badges for milestones, phases, and hidden easter eggs.

### Multiverse lore

The site also covers the ideas behind incursions, *Secret Wars (1984)*, *Secret Wars (2015)*, Doctor Doom, the Beyonders, and the Molecule Man.

### Extra atmosphere

The audio layer uses the Web Audio API for small effects, achievement fanfares, and an optional ambient drone — no external audio files needed.

## Run locally

There is no build step or Node.js setup required.

```bash
git clone https://github.com/Sarthakbotmfs/Doomsdaywatch.git
cd Doomsdaywatch
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) in your browser. You can also open `index.html` directly.

## Tech stack

- HTML
- CSS
- Vanilla JavaScript
- Web Audio API
- GitHub Pages-compatible static hosting

## Project layout

```text
├── index.html       # Main page and UI structure
├── styles.css       # Visual design and responsive layout
├── app.js           # Interactions, progress, countdown, and effects
├── data.js           # Watchlist, lore, and achievement data
├── CNAME             # Custom domain configuration
└── favicon.png
```

## Creator

Made by **[Sarthak Tiwari](https://github.com/Sarthakbotmfs)** — a developer and Marvel fan who wanted a better way to prepare for the multiverse chaos.

Questions, ideas, or bugs? [Open an issue](https://github.com/Sarthakbotmfs/Doomsdaywatch/issues).

---

[Back to Sarthak's GitHub profile](https://github.com/Sarthakbotmfs)
