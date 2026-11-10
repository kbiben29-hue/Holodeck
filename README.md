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
- **Classic 60-card:** regular Magic with the same cards. Each deck is cut to 60 (24 lands, 36 spells on a
  normal curve, both legends shuffled in as regular cards, cards that need a commander left out); 20 life,
  no command zone. Open "The 60 cards" under a deck to see the list.
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

Like Arena, the game runs the rules for you: turn structure, priority and the stack (it only stops when
you can actually respond), automatic land tapping, commander tax and the command zone, combat with all the
usual keywords plus melee, battle cry and goad, state-based actions and the legend rule.

Card text is read and played automatically for the large majority of the four decks: targets (including
"up to" and multi-target choices), modal spells ("Choose one —"), Sagas, kicker/squad/multikicker,
flashback, cycling, extra costs, Spacecraft Station, Seek out, Landfall, Battlefront, "whenever you cast",
"whenever … dies", abilities that Equipment or other cards grant, token copies, flicker effects,
assimilate, discover, explore, investigate, cost reductions and more, plus scripts for every commander.

What's left (about a quarter of the cards have some rare wording, like copy effects or extra combats)
still goes on the stack, and when it resolves the game asks you to do it by hand with the table tools.

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
