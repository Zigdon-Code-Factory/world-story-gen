# 🌍 World Story Gen

A turn-based world history generator. Draw shapes on a map, describe your world's lore with AI, then simulate civilizations evolving through the ages.

## How to Play

1. **Open `index.html`** in a browser (no server needed)
2. **Draw regions** — click to place polygon points, click near the first point to close
3. **Add lore** — describe your world's gods, creatures, and magic in the lore panel. Your text influences events offline; AI replies need an OpenRouter API key.
4. **Start simulation** — watch civilizations advance through ages, fight wars, and experience events

## Features

- 🗺️ **Map Drawing** — polygon-based region creation with colors and names
- 📜 **World Lore AI** — chat-powered world-building via OpenRouter (Qwen 3.6 Plus)
- 🎲 **10% Age Regression** — every advancement attempt has a 10% chance to FALL BACK one age instead
- 🎬 **Dice Roll Animation** — see the roll result when stepping manually
- ⚔️ **Conflicts** — civilizations battle, lose population, and suffer warrior casualties
- 🌋 **Random Events** — disasters, golden ages, discoveries (flavored by your lore)
- 📊 **History Timeline** — complete event log with world summary

## Ages

🪨 Stone → 🏺 Bronze → ⚔️ Iron → 🏛️ Classical → 🏰 Medieval → ⛵ Exploration → 🏭 Industrial → 💡 Modern → 🚀 Information

## Tech

Pure HTML/CSS/JS — no build tools, no dependencies, just open and play.

AI chat requires an [OpenRouter](https://openrouter.ai) API key (prompted on first use).

## Run locally

Open `index.html` directly, or serve this directory with Python:

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

Then open <http://localhost:8080>. Choose a preset and skip the optional API key prompt to run without external services.

## Example world review

Open [the Three Continents review](examples/three-continents-review.html) for an actual 300-turn run, with a population chart, civilization profiles, and selected historical milestones. The [JSON data](examples/three-continents-review.json) includes the full event history.

Reproduce it with Node.js (no packages required):

```powershell
node scripts/generate-example.cjs
```

The example uses seed `20261111`; normal gameplay uses fresh randomness. Lore supplies keywords for events rather than changing the simulation's political or economic rules.

## Verification

```powershell
node --test tests/*.test.cjs
```
