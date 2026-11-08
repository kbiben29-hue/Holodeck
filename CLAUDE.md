# CLAUDE.md

Holodeck is an unofficial browser table for the four Magic: The Gathering | Star Trek Commander decks,
two players (Duel Commander by default). Sibling of Afterlife (kbiben29-hue/Afterlife-) and Ready Room
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
- `src/engine/named.ts` — scripts for specific cards (Swords, Path, Cultivate, Beast Within, Brainstorm).
- `src/engine/mana.ts` — costs and the payment solver. `engine.ts` — flow, priority, combat, SBAs,
  commander rules, table tools. Smart stops: players auto-pass when they can't do anything (`wantsStop`).
- `src/bot/bot.ts` — greedy "Ensign" bot. `src/data/decks.ts` — the four decklists (names only).
- `src/data/scryfall.ts` — loads cards + tokens from Scryfall on the device (prefers Star Trek sets), caches
  in localStorage. Card data is never committed or bundled.
- `src/ui/Board.tsx` — console (1600×1000 scaled) and pocket (phone) layouts; `src/App.tsx` — sessions,
  autosave, undo, bot loop, online host/guest. `src/config.ts` — repo/play URL.

## Hard rules

- No `Math.random`/`Date.now` in `src/engine/**` or `src/bot/**`; randomness from `state.rng`.
- Engine is DOM-free. Every rules change gets a test; run `npm test` and `npm run sim` before committing.
- Never commit card data or images.
