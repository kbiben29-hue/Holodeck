# Holodeck

**Play:** https://kbiben29-hue.github.io/Holodeck/ ·
**Mac app:** [Holodeck-Mac.dmg](https://github.com/kbiben29-hue/Holodeck/releases/latest/download/Holodeck-Mac.dmg) ·
**Windows app:** [Holodeck-Windows-Setup.exe](https://github.com/kbiben29-hue/Holodeck/releases/latest/download/Holodeck-Windows-Setup.exe)

Every push to `main` rebuilds all three (`.github/workflows/release.yml`); the links always point at the newest build.

Holodeck is a two-player table for the four **Magic: The Gathering | Star Trek Commander decks**
(Federation Fleet, Landing Party, Klingon Fury, We Are the Borg). It's a fan project with no official
standing; card text and images are loaded from [Scryfall](https://scryfall.com) on your own device.

- **vs Computer**, **two players on one device**, or **play a friend online** with an invite link.
- **Formats:** Duel Commander (20 life, no commander damage, the usual 2-player Commander), 1v1 Commander
  (30 life, 21 commander damage) or classic 40 life. The Duel Commander ban list isn't used, so the decks
  play as they come out of the box.
- Runs on computers, iPads (the table scaled to fit) and phones (a touch layout). Switch layouts in the menu.
  Every game saves automatically, and you can undo moves when playing locally.

## Learning to play

- **Tutorial: practice game** — a real game against the computer with a coach panel that explains each
  step (mulligans, lands and mana, casting, the stack, attacking, blocking, doing cards by hand) and makes
  the suggested card or button glow.
- **Deck lessons & combos** — for each deck: a guide to its game plan, then a coached game where the coach
  points out combos as you draw them, plus combo drills: set positions with a goal ("win this turn"),
  coached step by step, with a debrief when you solve them.

Hover over any card to enlarge it (tap on touch screens). Each side of the table shows its library,
graveyard, exile and command zone as piles; click a pile to look through it.

## What's automatic

Turn structure, priority and the stack, mana and automatic land tapping (double-click a land to tap it by
hand), casting with commander tax, the command zone, combat (flying, reach, trample, first/double strike,
deathtouch, lifelink, vigilance, menace, haste…), Station for Spacecraft, Seek out and other
"whenever you draw your second card" / "whenever you attack" abilities, state-based actions, the legend rule, equipment and
anthems, and the most common card wordings ("Destroy target creature.", "Draw two cards.", "Create a
Treasure token.", land searches, scry…).

Anything else — many of the new Star Trek cards — still goes on the stack, and when it resolves the game
asks you to **do it by hand** with the table tools: counters, tokens, moving cards between zones, life,
P/T changes, control, attaching and so on, like at a real table.

## Playing a friend online

Choose **Play a friend online**, pick your deck and press **Create invite link**. Send the link; your
friend opens it, picks a deck and presses **Join game**. The browsers connect directly (WebRTC via the
free PeerJS service) and the host's browser referees. Keep the host's page open for the whole game.

## Running it yourself

Double-click `Start Holodeck.command` (Mac) or `Start Holodeck (Windows).bat` (needs Node.js), or:

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # rules engine tests
npm run sim -- 100 # computer-vs-computer games
```
