# CLAUDE.md

Holodeck is an unofficial browser table for the four Magic: The Gathering | Star Trek Commander decks and the four
The Lord of the Rings: Tales of Middle-earth Commander decks (`world: 'me'` in decks.ts; Frodo & Sam are partners) and the four
Bloomburrow Commander decks (`world: 'bb'`), two players (Duel Commander by default). Sibling of Afterlife (kbiben29-hue/Afterlife-) and Ready Room
(kbiben29-hue/readyroom); same ideas: pure TypeScript engine, React UI, fit-to-screen table, hot-seat,
bot, PeerJS online play, Pages + Tauri releases.

## Commands

```bash
npm run dev        # Vite app
npm test           # tsx --test (node:test)
npm run sim -- 100 # bot-vs-bot with the test stand-in decks
npm run build
```

## Layout

- `src/engine/types.ts` — CardDef, GameState, Pending, Intent, ManualOp (table tools).
- `src/engine/rules.ts` — reads Oracle text: keywords, mana abilities, activated/triggered abilities,
  statics (anthems, equipment, auras), enters-tapped lands, and effect templates (`compile`). Text it can't
  read is "manual": it still uses the stack and the controller is asked to do it by hand.
- `src/engine/effects.ts` — runs compiled effects. Tasks re-run from the start on each new answer
  (`ctx.ask` → NeedChoice → `pending: choose`), so code before an ask must not depend on hidden state.
- `src/engine/named.ts` — scripts for specific cards (Swords, Path, Cultivate, Beast Within, Brainstorm) and
  trigger overrides (`T`). `src/engine/scripts.ts` — more Star Trek card scripts: `trig` (add a trigger),
  `act` (script an activated ability), `spell`, `done`; registries `CDA`, `GRANTS`, `BUFFS`, `COST_MODS` in state.ts.
  Extra combats (`extraCombats`), rebound and `delayed` (end, cleanup, endCombat, upkeep) live in engine.ts.
- Middle-earth mechanics: `tempt` (the Ring tempts you: Ring-bearer + 4 levels, `ringBearer` in engine.ts), `amass`,
  `monarch` effects; `middleearth.test.ts`. Bloomburrow: `gift` (prompt at cast, `giveGift`, counts as kicked; extra turns
  via `extraTurns`/`afterExtra`) and `offspring` (squad of one 1/1 copy); `bloomburrow.test.ts`. `src/ui/world.ts` picks the world (sounds, ending) from a player's deck.
- `src/engine/mana.ts` — costs and the payment solver. `engine.ts` — flow, priority, combat, SBAs,
  commander rules, table tools. Smart stops: players auto-pass when they can't do anything (`wantsStop`).
- `src/bot/bot.ts` — greedy "Ensign" bot. `src/data/decks.ts` — the four decklists (names only).
- `sixtyCards` in `src/data/decks.ts` — the Classic 60-card cut (format `sixty`, `noCommander`: no command zone).
- `src/data/scryfall.ts` — loads cards + tokens from Scryfall on the device (prefers Star Trek sets), caches
  in localStorage. Card data is never committed or bundled.
- `src/engine/invariants.ts` — what every state must satisfy (one place per card, commanders, SBAs done);
  `fuzz.test.ts` plays bot games with the stand-ins and checks it after every move (`FUZZ=200 npm test` for more).
- `src/engine/scenario.ts` — build a position directly (drills, tests). `startrek.fixture.ts` — test stand-ins.
- `src/ui/coach.ts` — tutorial coach (`INTRO` pages, `coachFor` explains the step and turns the bot's
  suggested move into a `Hint`). `src/ui/lessons.ts` — per-deck `PLANS`, `COMBOS` (alerts in coached games),
  `DRILLS` (built with `scenario`; `lessons.test.ts` solves each one). Lesson text is our own wording.
- `src/ui/sfx.ts` — sounds, mute in the top bar: recorded CC0 effects in `public/sfx` (Kenney Sci-Fi Sounds, see its
  README) picked per card by `soundFor` (Spacecraft fire phasers, Klingons disruptors, Borg beams, spells torpedoes;
  deaths explode, exile beams out), plus Web Audio synthesis as fallback. No music, nothing from the shows.
- Pacing: `withFrames(() => tryApply(…))` returns the in-between states one move auto-passed through (`snap` in
  `settle`); App plays them back one beat each (`ui/prefs.ts` Animation: Full/Fast/Off, click skips) before the result.
- `src/ui/Arrows.tsx` — SVG arrows: stack targets (`data-sid` → `data-iid`/`data-life`), attacks, blocks, drag-to-block.
- `src/ui/motion.ts` — Arena-style motion: diffs `[data-iid]` elements between renders (FLIP moves, draws from
  `data-anchor` piles, ghosts to the graveyard, lunges, floating damage/life numbers). Keep `data-iid` unique per card.
- Arena-style handling (mouse): click a playable card to play it, click a land to tap it, click a permanent for its
  `AbilityBubble`, right-click to inspect, Space/Enter = main button, Esc = put down; targeting shows an aim arrow
  (`aimFrom` in Arrows.tsx) and a compact prompt. Engine: `fullControl` / `stops` player prefs (ManualOp `prefs`).
  Touch keeps tap-to-select (sheet), drag to play, long-press to enlarge.
- Drag to play: `beginDrag` in Board.tsx (hand/command card → `[data-drop]` play/graveyard/exile); `flyFrom` in motion.ts
  starts the card's next move from where it was dropped.
- `src/ui/Finale.tsx` — end of game: warp jump (win), red alert + warp-core breach (lose), assimilation (lose to
  Borg), then an LCARS-style report; Middle-earth decks get sunrise (win) / darkness falls (lose) and a parchment report; Bloomburrow decks a firefly meadow (win) / thunderstorm (lose) and a storybook report. Canvas + synthesized sounds (`sfx.warp/redAlert/breach/assimilated`).
- `src/ui/Board.tsx` — console (1600×1000 scaled; narrower, down to 1360, on squarer screens: `useFit` sets `--stage-w`) and
  pocket (phone) layouts. Console cards are big (creatures 126×176, other permanents 98×137, hand 150×209 peeking up from
  the bottom) and battlefield rows shrink their cards only when full (`fit` in `field`); `src/App.tsx` — sessions,
  autosave, undo, bot loop, online host/guest. `src/config.ts` — repo/play URL.

## Hard rules

- No `Math.random`/`Date.now` in `src/engine/**` or `src/bot/**`; randomness from `state.rng`.
- Engine is DOM-free. Every rules change gets a test; run `npm test` and `npm run sim` before committing.
- Never commit card data or images.
