(() => {
  // src/engine/rules.ts
  var KEYWORDS = [
    "flying",
    "reach",
    "trample",
    "first strike",
    "double strike",
    "deathtouch",
    "lifelink",
    "vigilance",
    "haste",
    "menace",
    "defender",
    "hexproof",
    "shroud",
    "indestructible",
    "flash",
    "prowess",
    "changeling",
    "fear",
    "intimidate",
    "skulk",
    "horsemanship",
    "infect",
    "wither",
    "unblockable",
    "devoid",
    "partner",
    "banding",
    "flanking",
    "convoke",
    "improvise",
    "delve",
    "storm",
    "cascade",
    "exalted",
    "undying",
    "persist",
    "myriad",
    "melee",
    "toxic",
    "battle cry"
  ];
  var SELF = "~";
  function normalise(def2) {
    let t = def2.oracle;
    const names = [def2.name];
    if (def2.name.includes(",")) names.push(def2.name.split(",")[0].trim());
    const head = def2.name.split(",")[0].trim().split(/\s+/);
    const COMMON = ["The", "Captain", "Commander", "Chief", "Lieutenant", "Ensign", "Dr.", "U.S.S.", "I.K.S.", "S.S.", "Lt.", "Fleet", "Cmdr."];
    if (head.length > 1) {
      if (!COMMON.includes(head[0])) names.push(head[0]);
      names.push(`${head[0]} ${head[head.length - 1]}`);
    }
    if (def2.name.includes(" // ")) names.push(...def2.name.split(" // "));
    names.sort((a, b) => b.length - a.length);
    for (const n of names) if (n.length > 1) t = t.split(n).join(SELF);
    t = t.replace(/\b[Tt]his (creature|artifact|land|enchantment|spell|card|equipment|Equipment|Vehicle|vehicle|permanent|Spacecraft|token|Aura|aura|planeswalker|Planet|planet|battle)\b/g, SELF);
    t = t.replace(/−/g, "-");
    t = t.split("\n").map(
      (line) => /where X is the number of opponents you (attacked this turn|have)/.test(line) ? line.replace(/,? where X is the number of opponents you (attacked this turn|have)/, "").replace(/\+X\/\+X/g, "+1/+1").replace(/\bX cards\b/g, "a card").replace(/\bX life\b/g, "1 life").replace(/\bX\b/g, "one") : line
    ).join("\n");
    t = t.replace(/a number of (.+?) equal to the number of opponents you have/g, "a $1");
    t = t.replace(/for each opponent you attacked this turn, /g, "");
    t = t.replace(/For each opponent, you create /g, "Create ");
    t = t.replace(/you may have (target [^,.]+?) gain /g, "you may $1 gains ");
    t = t.replace(/draw that many cards/g, "draw X cards");
    t = t.replace(/(^|\. |, )you create /g, "$1create ");
    return t;
  }
  function stripAbilityWord(line) {
    const m = line.match(/^([A-Z][A-Za-z'’!. -]{1,40}?) — (.+)$/);
    if (!m || /^[IVX]+$/.test(m[1])) return line;
    return m[2];
  }
  var stripReminder = (s) => s.replace(/\s*\([^)]*\)/g, "").trim();
  var NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, x: -1 };
  function num(s) {
    const k = s.toLowerCase();
    if (k === "x") return "x";
    if (k in NUM) return NUM[k];
    const n = Number(k);
    return Number.isFinite(n) ? n : 1;
  }
  var TYPE_WORDS = ["creature", "artifact", "enchantment", "land", "planeswalker", "permanent", "battle", "instant", "sorcery", "spell", "card"];
  function parseFilter(raw) {
    let s = raw.trim().toLowerCase();
    const f = { types: [], not: [] };
    if (s.startsWith("another ")) {
      f.other = true;
      s = s.slice(8);
    }
    if (s.startsWith("other ")) {
      f.other = true;
      s = s.slice(6);
    }
    const tail = [
      [/ an opponent controls$/, () => f.controller = "opp"],
      [/ you don't control$/, () => f.controller = "opp"],
      [/ you control$/, () => f.controller = "you"],
      [/ your opponents control$/, () => f.controller = "opp"],
      [/ defending player controls$/, () => f.controller = "opp"],
      [/ with toughness (\d+) or greater$/, (m) => f.minToughness = Number(m[1])],
      [/ with counters on them$/, () => f.withCounters = true],
      [/ with mana value (\d+) or greater$/, (m) => f.minMv = Number(m[1])],
      [/ with mana value (\d+) or less$/, (m) => f.maxMv = Number(m[1])]
    ];
    for (let again = true; again; ) {
      again = false;
      for (const [re, fn] of tail) {
        const m = s.match(re);
        if (m) {
          fn(m);
          s = s.slice(0, m.index);
          again = true;
        }
      }
    }
    const words = s.replace(/,? or /g, ",").replace(/,? and /g, ",").split(/\s*,\s*/);
    for (const w0 of words) {
      const parts = w0.trim().split(/\s+/);
      let typeFound = false;
      const before = f.types.length;
      for (const p of parts) {
        if (p === "historic") f.historic = true;
        else if (p === "tapped") f.tapped = true;
        else if (p === "untapped") f.tapped = false;
        else if (p === "attacking") f.attacking = true;
        else if (p === "nontoken") f.nonToken = true;
        else if (p === "token" || p === "tokens") f.token = true;
        else if (p === "basic") f.basic = true;
        else if (p.startsWith("non") && TYPE_WORDS.includes(p.slice(3).replace(/-/g, ""))) f.not.push(p.slice(3).replace(/-/g, ""));
        else if (p.startsWith("non") && ["white", "blue", "black", "red", "green"].includes(p.slice(3))) (f.nonColors ??= []).push(colorLetter(p.slice(3)));
        else if (["white", "blue", "black", "red", "green"].includes(p)) (f.colors ??= []).push(colorLetter(p));
        else if (TYPE_WORDS.includes(p) || TYPE_WORDS.includes(p.replace(/s$/, ""))) {
          const t = p.replace(/s$/, "");
          if (t !== "permanent" && t !== "card" && t !== "spell") f.types.push(t);
          typeFound = true;
        } else if (/^[a-z][a-z'-]+$/.test(p) && !typeFound) (f.subtypes ??= []).push(p.replace(/s$/, ""));
        else return null;
      }
      if (f.types.length - before > 1) {
        const extra = f.types.splice(before + 1);
        f.and = [...f.and ?? [], ...extra];
      }
    }
    return f;
  }
  function colorLetter(w) {
    return { white: "W", blue: "U", black: "B", red: "R", green: "G" }[w];
  }
  var COUNT = { one: 1, two: 2, three: 3, four: 4, five: 5, seven: 7 };
  function parseTarget(raw) {
    let s = raw.trim().toLowerCase();
    let min = 1;
    let max = 1;
    let other = false;
    let pm;
    if (pm = s.match(/^(?:each of )?up to (one|two|three|four|five|seven) (.+)$/)) {
      min = 0;
      max = COUNT[pm[1]];
      s = pm[2];
    } else if (pm = s.match(/^one or two (.+)$/)) {
      max = 2;
      s = pm[1];
    } else if (pm = s.match(/^(two|three) (.+)$/)) {
      min = max = COUNT[pm[1]];
      s = pm[2];
    }
    if (pm = s.match(/^(?:another|other) (target .+)$/)) {
      other = true;
      s = pm[1];
    }
    const spec = parseTarget1(s);
    if (!spec) return null;
    if (other && "filter" in spec) spec.filter.other = true;
    if (min !== 1 || max !== 1) Object.assign(spec, { min, max });
    return spec;
  }
  function parseTarget1(s) {
    if (s === "target spell, activated ability, or triggered ability") return { kind: "stackAny" };
    if (s === "any target") return { kind: "any" };
    if (s === "target player" || s === "target player or planeswalker") return { kind: "player" };
    if (s === "target opponent" || s === "target opponent or planeswalker") return { kind: "player", opponent: true };
    if (s === "target creature or player") return { kind: "creatureOrPlayer" };
    const m = s.match(/^target (.+)$/);
    if (!m) return null;
    if (/\bspell$/.test(m[1])) {
      const f2 = parseFilter(m[1].replace(/spell$/, "").trim() || "permanent");
      return f2 ? { kind: "spell", filter: f2 } : null;
    }
    const f = parseFilter(m[1]);
    return f ? { kind: "perm", filter: f } : null;
  }
  var KW_LIST = "(flying|reach|trample|first strike|double strike|deathtouch|lifelink|vigilance|haste|menace|indestructible|hexproof|melee|ward \\{\\d+\\})";
  var TGT = "(?:(?:each of )?up to (?:one|two|three|four|five|seven) |one or two |two |three )?(?:another |other )?target [^.]+?";
  function keywordList(s) {
    if (!s) return [];
    return s.toLowerCase().replace(/ and /g, ", ").split(/,\s*/).map((x) => x.trim()).filter(Boolean);
  }
  function compile(text, defName = "") {
    const out = { targets: [], effects: [] };
    let t = stripReminder(text).trim();
    if (!t) return null;
    if (/^you may /i.test(t)) {
      out.optional = true;
      t = t.replace(/^you may /i, "");
      t = t[0].toUpperCase() + t.slice(1);
    }
    t = t[0].toUpperCase() + t.slice(1);
    const sentences = t.split(/(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean);
    for (const s0 of sentences) {
      const s = s0.replace(/\.$/, "");
      if (!compileSentence(s, out, defName)) return null;
    }
    return out;
  }
  function addTarget(out, spec) {
    out.targets.push(spec);
    return out.targets.length - 1;
  }
  function compileSentence(s0, out, defName) {
    let m;
    let s = s0;
    const counts = [
      [/ for each attacking creature$/, "attackers"],
      [/ for each charge counter on ~$/, "charge"],
      [/ equal to the number of differently named lands you control$/, "lands"]
    ];
    for (const [re, c] of counts)
      if (re.test(s)) {
        s = s.replace(re, "").replace(/^(Create|Draw|Put) (a|an|one) /, "$1 X ").replace(/^you gain life$/, "you gain X life").replace(/^You gain life$/, "You gain X life");
        const before = out.effects.length;
        if (!compileSentence(s, out, defName)) return false;
        out.count = c;
        void before;
        return true;
      }
    const lower = s.toLowerCase();
    if (/^(it|they|that creature) can't be regenerated$/.test(lower)) return true;
    const last = out.effects[out.effects.length - 1];
    if (/^Return (?:that card|those cards|it|them|the exiled card) to the battlefield under (?:its|their) owners?'s? control(?: at the beginning of the next end step)?$/.test(s) && last?.e === "exile") {
      out.effects[out.effects.length - 1] = { e: "flicker", t: last.t, later: /next end step/.test(s) };
      return true;
    }
    if (/^If it's a combat phase, you may end the combat phase$/.test(s)) {
      out.effects.push({ e: "endCombat" });
      return true;
    }
    if (/^If you cast ~ during your main phase, you may exile up to one other target (.+)$/.test(s) && last?.e === "exile") {
      const spec = parseTarget("up to one other target " + s.match(/target (.+)$/)[1]);
      if (!spec) return false;
      out.effects.push({ e: "exile", t: addTarget(out, spec) });
      return true;
    }
    if (m = s.match(/^(.+?) you control gain protection from the color of your choice until end of turn$/)) {
      const f = parseFilter(m[1]);
      if (!f) return false;
      f.controller = "you";
      out.effects.push({ e: "protectionChoice", filter: f });
      return true;
    }
    if (m = s.match(new RegExp(`^[Gg]oad (${TGT})$`))) {
      const spec = parseTarget(m[1]);
      if (!spec || spec.kind !== "perm") return false;
      out.effects.push({ e: "goad", t: addTarget(out, spec) });
      return true;
    }
    if (/^Goad all creatures you don't control$/.test(s)) {
      out.effects.push({ e: "goad", t: "allOpp" });
      return true;
    }
    if (m = s.match(new RegExp(`^Assimilate (${TGT})$`))) {
      const spec = parseTarget(m[1]);
      if (!spec || spec.kind !== "perm") return false;
      out.effects.push({ e: "assimilate", t: addTarget(out, spec) });
      return true;
    }
    if (lower === "then shuffle" || lower === "shuffle your library" || lower === "then shuffle your library") {
      out.effects.push({ e: "shuffle" });
      return true;
    }
    if (m = lower.match(/^you and target opponent each draw (a|an|one|two|three|\d+) cards?$/)) {
      addTarget(out, { kind: "player", opponent: true });
      out.effects.push({ e: "draw", n: num(m[1]), who: "you" }, { e: "draw", n: num(m[1]), who: "target" });
      return true;
    }
    if (m = lower.match(/^(?:you )?draw (a|an|one|two|three|four|five|six|seven|x|\d+) cards?(?: and (?:you )?lose (\w+) life)?$/)) {
      out.effects.push({ e: "draw", n: num(m[1]), who: "you" });
      if (m[2]) out.effects.push({ e: "loseLife", n: num(m[2]), who: "you" });
      return true;
    }
    if (m = lower.match(/^target player draws (a|one|two|three|four|x|\d+) cards?$/)) {
      const i = addTarget(out, { kind: "player" });
      void i;
      out.effects.push({ e: "draw", n: num(m[1]), who: "target" });
      return true;
    }
    if (m = lower.match(/^each player draws (a|one|two|three|\d+) cards?$/)) {
      out.effects.push({ e: "draw", n: num(m[1]), who: "each" });
      return true;
    }
    if (m = lower.match(/^draw (a|one|two|three|\d+) cards?, then discard (a|one|two|three|\d+) cards?$/)) {
      out.effects.push({ e: "draw", n: num(m[1]), who: "you" }, { e: "discard", n: num(m[2]), who: "you" });
      return true;
    }
    if (m = lower.match(/^you gain (\w+) life$/)) {
      out.effects.push({ e: "life", n: num(m[1]), who: "you" });
      return true;
    }
    if (m = lower.match(/^you lose (\w+) life$/)) {
      out.effects.push({ e: "loseLife", n: num(m[1]), who: "you" });
      return true;
    }
    if (m = lower.match(/^each opponent loses (\w+) life$/)) {
      out.effects.push({ e: "loseLife", n: num(m[1]), who: "eachOpp" });
      return true;
    }
    if (m = lower.match(/^each opponent loses (\w+) life and you gain (\w+) life$/)) {
      out.effects.push({ e: "loseLife", n: num(m[1]), who: "eachOpp" }, { e: "life", n: num(m[2]), who: "you" });
      return true;
    }
    if (m = lower.match(/^target (player|opponent) loses (\w+) life$/)) {
      addTarget(out, { kind: "player", opponent: m[1] === "opponent" });
      out.effects.push({ e: "loseLife", n: num(m[2]), who: "target" });
      return true;
    }
    if (m = s.match(new RegExp(`^(Destroy|Exile) (${TGT})$`, "i"))) {
      const spec = parseTarget(m[2]);
      if (!spec || spec.kind !== "perm") return false;
      const i = addTarget(out, spec);
      out.effects.push({ e: m[1] === "Destroy" ? "destroy" : "exile", t: i });
      return true;
    }
    if (m = s.match(new RegExp(`^Return (${TGT}) to (?:its owner's|their owner's|its owners'|their owners') hands?$`, "i"))) {
      const spec = parseTarget(m[1]);
      if (!spec || spec.kind !== "perm") return false;
      out.effects.push({ e: "bounce", t: addTarget(out, spec) });
      return true;
    }
    if ((m = s.match(new RegExp(`^Put (${TGT}) (?:on top|on the bottom|second from the top)? ?(?:of|into) (?:its owner's|their owner's) library(?: (second from the top|third from the top))?$`, "i"))) || (m = s.match(new RegExp(`^Put (${TGT}) (on top|on the bottom) of (?:its owner's|their owner's) library$`, "i")))) {
      const spec = parseTarget(m[1]);
      if (!spec || spec.kind !== "perm") return false;
      out.effects.push({ e: "tuck", t: addTarget(out, spec), where: /bottom/i.test(s) ? "bottom" : "top" });
      return true;
    }
    if (m = s.match(new RegExp(`^(${TGT})'s owner puts it on (?:the )?top or bottom of their library$`, "i"))) {
      const spec = parseTarget(m[1]);
      if (!spec || spec.kind !== "perm") return false;
      out.effects.push({ e: "tuck", t: addTarget(out, spec), where: "either" });
      return true;
    }
    if (m = s.match(new RegExp(`^(Tap|Untap) (${TGT})$`, "i"))) {
      const spec = parseTarget(m[2]);
      if (!spec || spec.kind !== "perm") return false;
      out.effects.push({ e: "tap", t: addTarget(out, spec), untap: m[1] === "Untap" });
      return true;
    }
    if (m = s.match(/^(Destroy|Exile) all (.+?)$/)) {
      const f = parseFilter(m[2]);
      if (!f) return false;
      out.effects.push({ e: m[1] === "Destroy" ? "destroyAll" : "exileAll", filter: f });
      return true;
    }
    if (m = s.match(/^Return all (.+?) to their owners' hands$/)) {
      const f = parseFilter(m[1]);
      if (!f) return false;
      out.effects.push({ e: "bounceAll", filter: f });
      return true;
    }
    if (m = s.match(new RegExp(`^~ deals (\\w+) damage to (any target|${TGT})$`))) {
      const spec = parseTarget(m[2]);
      if (!spec) return false;
      out.effects.push({ e: "damage", n: num(m[1]), t: addTarget(out, spec) });
      return true;
    }
    if (m = s.match(/^~ deals (\w+) damage to each (opponent|player)$/)) {
      out.effects.push({ e: "damageEach", n: num(m[1]), players: m[2] === "opponent" ? "opp" : "each" });
      return true;
    }
    if (m = s.match(/^~ deals (\w+) damage to each (.+?)$/)) {
      const f = parseFilter(m[2]);
      if (!f) return false;
      out.effects.push({ e: "damageEach", n: num(m[1]), filter: f });
      return true;
    }
    if (m = s.match(/^Counter (target .*spell)$/)) {
      const spec = parseTarget(m[1]);
      if (!spec || spec.kind !== "spell") return false;
      out.effects.push({ e: "counter", t: addTarget(out, spec) });
      return true;
    }
    if (m = s.match(/^Create (a|an|one|two|three|four|five|x|X|\d+) (tapped (?:and attacking )?)?(\d+|X)\/(\d+|X) ((?:(?:white|blue|black|red|green|colorless)(?:,? and |, | )?)*)((?:[A-Z][\w'-]* )*?)(artifact )?creature tokens?(?: with ((?:flying|reach|trample|vigilance|haste|deathtouch|lifelink|menace|first strike|defender|indestructible)(?:(?:,| and|, and) (?:flying|reach|trample|vigilance|haste|deathtouch|lifelink|menace|first strike|defender|indestructible))*))?$/)) {
      const colors = (m[5].match(/white|blue|black|red|green/g) ?? []).map(colorLetter);
      const sub = m[6].trim();
      out.effects.push({
        e: "token",
        n: num(m[1]),
        tapped: !!m[2],
        power: m[3] === "X" ? -1 : Number(m[3]),
        toughness: m[4] === "X" ? -1 : Number(m[4]),
        colors,
        name: sub || "Token",
        types: `${m[7] ? "Artifact " : ""}Creature${sub ? " \u2014 " + sub : ""}`,
        keywords: keywordList(m[8]),
        artifact: !!m[7],
        attacking: /attacking/.test(m[2] ?? "")
      });
      return true;
    }
    if (m = s.match(/^Create (a|an|one|two|three|four|five|x|\d+) (tapped )?(Treasure|Clue|Food|Map|Blood|Gold|Powerstone|Junk|Shard|Lander) tokens?$/)) {
      out.effects.push({ e: "token", n: num(m[1]), tapped: !!m[2], name: m[3], types: `Artifact \u2014 ${m[3]}`, colors: [], keywords: [], artifact: true });
      return true;
    }
    if (m = lower.match(new RegExp(`^put (a|an|one|two|three|four|five|x|\\d+) ([+-]1\\/[+-]1|\\w+) counters? on (${TGT}|~|it|each (.+?))$`))) {
      const n = num(m[1]);
      const kind = m[2];
      if (m[3] === "~" || m[3] === "it") out.effects.push({ e: "counters", n, kind, t: "self" });
      else if (m[4]) {
        const f = parseFilter(m[4]);
        if (!f) return false;
        out.effects.push({ e: "counters", n, kind, t: "each", filter: f });
      } else {
        const spec = parseTarget(m[3]);
        if (!spec || spec.kind !== "perm") return false;
        out.effects.push({ e: "counters", n, kind, t: addTarget(out, spec) });
      }
      return true;
    }
    if (m = s.match(new RegExp(`^(${TGT}|~) (?:each )?gets? ([+-]\\d+)\\/([+-]\\d+)(?: and gains? ${KW_LIST}(?:(?:,| and|, and) ${KW_LIST})*)? until end of turn$`, "i"))) {
      const kws = (s.match(/gains? (.+) until/)?.[1] ?? "").toLowerCase();
      let t = "self";
      if (m[1] !== "~") {
        const spec = parseTarget(m[1].toLowerCase());
        if (!spec || spec.kind !== "perm") return false;
        t = addTarget(out, spec);
      }
      out.effects.push({ e: "pump", p: Number(m[2]), tough: Number(m[3]), keywords: keywordList(kws), t });
      return true;
    }
    if (m = s.match(new RegExp(`^(${TGT}|~) (?:each )?gains? ${KW_LIST}(?:(?:,| and|, and) ${KW_LIST})* until end of turn$`, "i"))) {
      const kws = (s.match(/gains (.+) until/)?.[1] ?? "").toLowerCase();
      let t = "self";
      if (m[1] !== "~") {
        const spec = parseTarget(m[1].toLowerCase());
        if (!spec || spec.kind !== "perm") return false;
        t = addTarget(out, spec);
      }
      out.effects.push({ e: "pump", p: 0, tough: 0, keywords: keywordList(kws), t });
      return true;
    }
    if (m = s.match(new RegExp(`^(.+?) you control get ([+-]\\d+)\\/([+-]\\d+)(?: and gain ${KW_LIST}(?:(?:,| and|, and) ${KW_LIST})*)? until end of turn$`))) {
      const f = parseFilter(m[1]);
      if (!f) return false;
      f.controller = "you";
      const kws = (s.match(/gain (.+) until/)?.[1] ?? "").toLowerCase();
      out.effects.push({ e: "pumpAll", p: Number(m[2]), tough: Number(m[3]), keywords: keywordList(kws), filter: f });
      return true;
    }
    if (m = s.match(new RegExp(`^(.+?) you control gain ${KW_LIST}(?:(?:,| and|, and) ${KW_LIST})* until end of turn$`))) {
      const f = parseFilter(m[1]);
      if (!f) return false;
      f.controller = "you";
      const kws = (s.match(/gain (.+) until/)?.[1] ?? "").toLowerCase();
      out.effects.push({ e: "pumpAll", p: 0, tough: 0, keywords: keywordList(kws), filter: f });
      return true;
    }
    if (m = lower.match(/^scry (\w+)$/)) {
      out.effects.push({ e: "scry", n: num(m[1]) });
      return true;
    }
    if (m = lower.match(/^surveil (\w+)$/)) {
      out.effects.push({ e: "surveil", n: num(m[1]) });
      return true;
    }
    if (m = lower.match(/^mill (\w+) cards?$/)) {
      out.effects.push({ e: "mill", n: num(m[1]), who: "you" });
      return true;
    }
    if (m = lower.match(/^target player mills (\w+) cards?$/)) {
      addTarget(out, { kind: "player" });
      out.effects.push({ e: "mill", n: num(m[1]), who: "target" });
      return true;
    }
    if (m = lower.match(/^search your library for (a|an|up to (?:one|two|three)) (.+?) cards?(?:,| and) (reveal (?:it|them|that card), )?(?:and )?put (?:it|that card|them|those cards) (onto the battlefield( tapped)?|into your hand|on top of your library)(?:,| and)?(?: then)? shuffle(?: your library)?$/)) {
      const count = m[1].startsWith("up to") ? num(m[1].replace("up to ", "")) : 1;
      let what = m[2];
      let names;
      const basicTypes = what.match(/^((?:plains|island|swamp|mountain|forest)(?:(?:, | or |, or )(?:plains|island|swamp|mountain|forest))*)$/);
      const f = { types: [], not: [] };
      if (basicTypes) {
        names = basicTypes[1].split(/, or |, | or /);
        f.types = ["land"];
      } else {
        const ff = parseFilter(what);
        if (!ff) return false;
        Object.assign(f, ff);
      }
      out.effects.push({
        e: "search",
        filter: f,
        names,
        count,
        dest: m[4].startsWith("onto") ? "battlefield" : m[4].startsWith("into") ? "hand" : "top",
        tapped: !!m[5],
        reveal: !!m[3]
      });
      return true;
    }
    if (m = lower.match(/^(?:you may )?return (?:up to one )?(target .+?) card(?: with mana value (\d+) or less)? from your graveyard to (your hand|the battlefield)$/)) {
      const f = parseFilter(m[1].replace(/^target /, ""));
      if (!f) return false;
      if (m[2]) f.maxMv = Number(m[2]);
      out.effects.push({ e: "returnFromGy", filter: f, dest: m[3] === "your hand" ? "hand" : "battlefield", t: 0 });
      return true;
    }
    if (m = lower.match(/^each opponent sacrifices (a|an) (.+?)(?: of their choice)?$/)) {
      const f = parseFilter(m[2]);
      if (!f) return false;
      out.effects.push({ e: "sacrifice", who: "eachOpp", filter: f });
      return true;
    }
    if (m = lower.match(/^target (player|opponent) sacrifices (a|an) (.+?)(?: of their choice)?$/)) {
      const f = parseFilter(m[3]);
      if (!f) return false;
      addTarget(out, { kind: "player", opponent: m[1] === "opponent" });
      out.effects.push({ e: "sacrifice", who: "target", filter: f });
      return true;
    }
    if (m = lower.match(/^(?:each opponent|target opponent) discards (a|one|two|\d+) cards?$/)) {
      if (lower.startsWith("target")) addTarget(out, { kind: "player", opponent: true });
      out.effects.push({ e: "discard", n: num(m[1]), who: lower.startsWith("target") ? "target" : "eachOpp" });
      return true;
    }
    if (m = lower.match(/^you may put a land card from your hand onto the battlefield$/)) {
      out.effects.push({ e: "putLand" });
      return true;
    }
    if (m = s.match(/^(Untap|Tap) all (.+?)$/)) {
      const f = parseFilter(m[2]);
      if (!f) return false;
      out.effects.push({ e: "tapAll", filter: f, untap: m[1] === "Untap" });
      return true;
    }
    if (m = s.match(/^Its controller creates an? (\d+)\/(\d+) ((?:(?:white|blue|black|red|green|colorless)(?: and | )?)*)((?:[A-Z][\w'-]* )*)creature token$/)) {
      const i = out.targets.length - 1;
      if (i < 0) return false;
      const sub = m[4].trim();
      out.effects.push({ e: "tokenForController", t: i, name: sub || "Token", power: Number(m[1]), toughness: Number(m[2]), types: `Creature \u2014 ${sub}`, colors: (m[3].match(/white|blue|black|red|green/g) ?? []).map(colorLetter) });
      return true;
    }
    if (m = lower.match(/^investigate(?: (twice|three times))?$/)) {
      out.effects.push({ e: "investigate", n: m[1] === "twice" ? 2 : m[1] ? 3 : 1 });
      return true;
    }
    if (/^(~|he|she|it) explores?$/.test(lower)) {
      out.effects.push({ e: "explore", t: "self" });
      return true;
    }
    if (m = lower.match(/^discover (\d+)$/)) {
      out.effects.push({ e: "discover", n: Number(m[1]) });
      return true;
    }
    if (m = s.match(new RegExp(`^[Cc]reate a token that's a copy of (${TGT}|~)(, except (.+))?$`))) {
      let t = "self";
      if (m[1] !== "~") {
        const spec = parseTarget(m[1]);
        if (!spec || spec.kind !== "perm") return false;
        t = addTarget(out, spec);
      }
      out.effects.push({ e: "copyToken", t, haste: /has haste/.test(m[3] ?? "") });
      return true;
    }
    if (/^Exile that token at the beginning of the next end step$/.test(s)) {
      const last2 = out.effects[out.effects.length - 1];
      if (last2?.e !== "copyToken") return false;
      last2.exileAtEnd = true;
      return true;
    }
    if (m = s.match(new RegExp(`^Exile (${TGT})\\. Return (?:that card|those cards|it|them) to the battlefield under (?:its|their) owners?'s? control(?: at the beginning of the next end step)?$`))) {
      const spec = parseTarget(m[1]);
      if (!spec || spec.kind !== "perm") return false;
      out.effects.push({ e: "flicker", t: addTarget(out, spec), later: /next end step/.test(s) });
      return true;
    }
    if (/^Add one mana of any color$/.test(s)) {
      out.effects.push({ e: "addMana", n: 1 });
      return true;
    }
    if (m = s.match(new RegExp(`^Gain control of (${TGT})( until end of turn)?$`))) {
      const spec = parseTarget(m[1]);
      if (!spec || spec.kind !== "perm") return false;
      out.effects.push({ e: "gainControl", t: addTarget(out, spec), eot: !!m[2] });
      return true;
    }
    if (/^Untap (it|that creature)$/.test(s) && out.effects[out.effects.length - 1]?.e === "gainControl") {
      ;
      out.effects[out.effects.length - 1].untap = true;
      return true;
    }
    if (m = s.match(new RegExp(`^(${TGT}|~) can't (be blocked|block) this turn$`, "i"))) {
      let t = "self";
      if (m[1] !== "~") {
        const spec = parseTarget(m[1]);
        if (!spec || spec.kind !== "perm") return false;
        t = addTarget(out, spec);
      }
      if (m[2] === "block") out.effects.push({ e: "cantBlock", t });
      else out.effects.push({ e: "pump", p: 0, tough: 0, keywords: ["unblockable"], t });
      return true;
    }
    if (m = s.match(new RegExp(`^(~) fights (${TGT})$`))) {
      const spec = parseTarget(m[2]);
      if (!spec || spec.kind !== "perm") return false;
      out.effects.push({ e: "fight", a: "self", b: addTarget(out, spec) });
      return true;
    }
    if (m = s.match(new RegExp(`^Counter (target spell, activated ability, or triggered ability)$`))) {
      out.effects.push({ e: "counter", t: addTarget(out, { kind: "stackAny" }) });
      return true;
    }
    if (m = lower.match(/^return (target .+?) card from your graveyard to (your hand|the battlefield)$/)) {
      const f = parseFilter(m[1].replace(/^target /, ""));
      if (!f) return false;
      out.effects.push({ e: "returnFromGy", filter: f, dest: m[2] === "your hand" ? "hand" : "battlefield", t: 0 });
      return true;
    }
    for (const sep of [", then ", " and then ", ", and ", " and ", ", "]) {
      const i = s.indexOf(sep);
      if (i <= 0) continue;
      const a = s.slice(0, i);
      let b = s.slice(i + sep.length);
      if (/^(you |each |target )?(draw|create|gain|lose|put|discard|scry|surveil|mill|untap|tap|exile|destroy|return|investigate|explore|shuffle)/i.test(b)) {
        b = /^(draw|create|gain|lose|put|discard|scry|surveil|mill|untap|tap|exile|destroy|return|investigate|shuffle)/i.test(b) ? b : b;
        const save = { t: out.targets.length, e: out.effects.length };
        if (compileSentence(a, out, defName) && compileSentence(b[0].toUpperCase() + b.slice(1), out, defName)) return true;
        out.targets.length = save.t;
        out.effects.length = save.e;
      }
    }
    void defName;
    return false;
  }
  function parseAbilityCost(raw) {
    const c = { mana: "", tap: false, sacrificeSelf: false, life: 0 };
    const parts = raw.split(/,\s*/);
    const other = [];
    for (const p0 of parts) {
      const p = p0.trim();
      if (/^(\{[^}]+\})+$/.test(p)) {
        for (const sym of p.match(/\{[^}]+\}/g)) {
          if (sym === "{T}") c.tap = true;
          else if (sym === "{Q}") c.untap = true;
          else c.mana += sym;
        }
      } else if (/^Sacrifice ~$/.test(p)) c.sacrificeSelf = true;
      else if (/^Pay (\d+) life$/.test(p)) c.life += Number(p.match(/\d+/)[0]);
      else if (/^Discard a card$/.test(p)) c.discard = 1;
      else if (/^Exile ~ from your graveyard$/.test(p)) c.exileSelfFromGy = true;
      else if (/^Tap an untapped creature you control$/.test(p)) c.tapOther = true;
      else if (/^Sacrifice (?:a|an|another) (.+)$/.test(p) && parseFilter(p.replace(/^Sacrifice (?:a|an|another) /, ""))) c.sacrifice = parseFilter(p.replace(/^Sacrifice (?:a|an|another) /, ""));
      else if (/^Remove a counter from ~$/.test(p)) c.removeCounters = { n: 1 };
      else if (/^Remove (a|an|one|two|three) ([+-]1\/[+-]1|\w+) counters? from ~$/.test(p)) {
        const mm = p.match(/^Remove (\w+) ([+-]1\/[+-]1|\w+) counters? from ~$/);
        c.removeCounters = { n: num(mm[1]), kind: mm[2] };
      } else if (/^Remove (a|an|one|two|three) ([+-]1\/[+-]1|\w+) counters? from among creatures you control$/.test(p)) {
        const mm = p.match(/^Remove (\w+) ([+-]1\/[+-]1|\w+) counters? from among/);
        c.removeCounters = { n: num(mm[1]), kind: mm[2], fromAmong: true };
      } else if (/^[+-]\d+$/.test(p) || p === "0") c.loyalty = Number(p);
      else other.push(p);
    }
    if (other.length) c.other = other.join(", ");
    return c;
  }
  function parseManaEffect(e) {
    let m;
    const s = e.replace(/\.$/, "");
    let pain = 0;
    let body = s;
    const painM = s.match(/^(.*?)\. ~ deals (\d+) damage to you$/);
    if (painM) {
      body = painM[1];
      pain = Number(painM[2]);
    }
    if (m = body.match(/^Add ((?:\{[WUBRGC]\})+)$/)) {
      const mana = m[1].match(/[WUBRGC]/g);
      return { kind: "fixed", mana, amount: mana.length, pain };
    }
    if (m = body.match(/^Add (\{[WUBRGC]\})(?:, (\{[WUBRGC]\}))*,? or (\{[WUBRGC]\})$/)) {
      const mana = body.match(/\{([WUBRGC])\}/g).map((x) => x[1]);
      return { kind: "oneOf", mana, amount: 1, pain };
    }
    if (m = body.match(/^Add ((?:\{[WUBRGC]\}){2,}) or ((?:\{[WUBRGC]\}){2,})$/)) {
      const a = m[1].match(/[WUBRGC]/g);
      const b = m[2].match(/[WUBRGC]/g);
      return { kind: "oneOf", mana: [a[0], b[0]], amount: a.length, sameColor: true, pain };
    }
    if (/^Add one mana of any color$/.test(body)) return { kind: "any", mana: ["W", "U", "B", "R", "G"], amount: 1, pain };
    if (m = body.match(/^Add (two|three) mana of any one color$/)) return { kind: "any", mana: ["W", "U", "B", "R", "G"], amount: num(m[1]), sameColor: true, pain };
    if (/^Add one mana of any color in your commander's color identity$/.test(body)) return { kind: "identity", mana: [], amount: 1, pain };
    if (/^Add one mana of any type that a land an opponent controls could produce$/.test(body) || /^Add one mana of any color that a land an opponent controls could produce$/.test(body))
      return { kind: "oppLands", mana: [], amount: 1, pain };
    if (/^Add \{C\} for each charge counter on ~$/.test(body)) return { kind: "charge", mana: ["C"], amount: 0, pain };
    if (/^Choose a color\. Add one mana of that color for each charge counter on ~(\. Spend this mana only to cast your commander)?$/.test(body)) return { kind: "charge", mana: ["W", "U", "B", "R", "G"], amount: 0, sameColor: true, pain };
    if (/^Add X mana of any one color, where X is the number of charge counters on ~$/.test(body)) return { kind: "charge", mana: ["W", "U", "B", "R", "G"], amount: 0, sameColor: true, pain };
    return null;
  }
  function parseEntersTapped(lines) {
    for (const l of lines) {
      const s = stripReminder(l);
      let m;
      if (/^~ enters tapped\.$/.test(s) || /^~ enters the battlefield tapped\.$/.test(s)) return "yes";
      if (m = s.match(/^~ enters tapped unless you control (?:a|an) (\w+)(?:,? or (?:a|an) (\w+))?\.$/)) return { unlessControl: [m[1], m[2]].filter(Boolean) };
      if (m = s.match(/^~ enters tapped unless you control two or (more|fewer) other lands\.$/)) return { unlessOtherLands: [2, m[1] === "more" ? "ge" : "le"] };
      if (/^~ enters tapped unless you control two or more basic lands\.$/.test(s)) return { unlessBasics: 2 };
      if (/^~ enters tapped unless you control a legendary creature\.$/.test(s)) return { unlessLegendary: true };
      if (m = s.match(/^As ~ enters, you may reveal (?:a|an) (\w+) or (\w+) card from your hand\. If you don't, ~ enters tapped\.$/)) return { revealFromHand: [m[1], m[2]] };
      if (/enters tapped/.test(s)) return "yes";
    }
    return "no";
  }
  function isKeywordLine(s) {
    const parts = stripReminder(s).replace(/\.$/, "").split(/[,;]\s*/).map((x) => x.trim().toLowerCase());
    if (!parts.length || !parts[0]) return null;
    const out = [];
    for (const p of parts) {
      if (KEYWORDS.includes(p)) out.push(p);
      else if (/^protection from (white|blue|black|red|green|everything|creatures|artifacts)( and from (white|blue|black|red|green))*$/.test(p)) out.push(p);
      else if (/^ward (\{.+\}|\d+|—.*)$/.test(p)) out.push("ward");
      else if (/^(basic landcycling|landcycling|multikicker|squad|suspend)\b/.test(p)) out.push(p.split(/ [{\d]/)[0]);
      else if (/^affinity for \w+$/.test(p)) out.push(p);
      else if (/^(equip|crew|cycling|kicker|flashback|ninjutsu|landwalk|plainswalk|islandwalk|swampwalk|mountainwalk|forestwalk|toxic \d+|annihilator \d+|afflict \d+|bushido \d+|rampage \d+|bloodthirst \d+|modular \d+)\b/.test(p)) out.push(p.split(" ")[0]);
      else if (/^affinity for artifacts$/.test(p)) out.push("affinity for artifacts");
      else return null;
    }
    return out;
  }
  var cache = /* @__PURE__ */ new Map();
  var overrides = /* @__PURE__ */ new Map();
  function overrideTrigger(card, o) {
    overrides.set(card, [...overrides.get(card) ?? [], o]);
    cache.clear();
  }
  var patches = /* @__PURE__ */ new Map();
  function patchRules(card, f) {
    patches.set(card, [...patches.get(card) ?? [], f]);
    cache.clear();
  }
  function allCompiled(r) {
    return r.triggers.every((t) => t.compiled && !t.conditional) && r.activated.every((a) => a.compiled || a.station) && !r.chapters?.some((c) => !c.compiled);
  }
  function rulesFor(def2, flipped = false) {
    const key = def2.id + (flipped ? "#back" : "");
    const hit = cache.get(key);
    if (hit) return hit;
    const face = flipped && def2.back ? def2.back : def2;
    const r = parse({ name: face.name, oracle: face.oracle, typeLine: face.typeLine });
    for (const o of overrides.get(face.name) ?? []) {
      let hit2 = false;
      for (const t of r.triggers)
        if (o.events.includes(t.event)) {
          t.compiled = o.compiled;
          t.conditional = false;
          hit2 = true;
        }
      if (!hit2) {
        const word = { attacks: /attack/i, etb: /enter/i, dies: /dies/i, landfall: /land/i, upkeep: /upkeep/i, endStep: /end step/i };
        for (const event of o.events) {
          const line = face.oracle.split("\n").find((l) => word[event]?.test(l)) ?? face.name;
          r.triggers.push({ index: r.triggers.length, event, text: line, effectText: "", compiled: o.compiled });
        }
      }
    }
    if (overrides.has(face.name)) r.fullyAutomated = r.triggers.every((t) => t.compiled) && (r.fullyAutomated || r.triggers.length > 0);
    for (const f of patches.get(face.name) ?? []) f(r);
    cache.set(key, r);
    return r;
  }
  function parse(def2) {
    const [left, right = ""] = def2.typeLine.split(/\s+[—-]\s+/);
    const lw = left.toLowerCase().split(/\s+/);
    const supertypes = lw.filter((w) => ["legendary", "basic", "snow", "world", "token"].includes(w));
    const types = lw.filter((w) => !supertypes.includes(w) && w !== "");
    const subtypes = right.split(/\s+/).filter(Boolean);
    const text = normalise(def2);
    const lines = text.split("\n").map((x) => x.trim()).filter(Boolean);
    const r = {
      types,
      subtypes,
      supertypes,
      keywords: [],
      manaAbilities: [],
      activated: [],
      triggers: [],
      statics: [],
      spell: null,
      spellText: "",
      entersTapped: types.includes("land") ? parseEntersTapped(lines) : "no",
      hasX: false,
      canBeCountered: !/can't be countered/.test(text),
      fullyAutomated: true
    };
    const spellLines = [];
    const isSpell = types.includes("instant") || types.includes("sorcery");
    const handle = (line0, index) => {
      const line = stripAbilityWord(line0);
      if (/^Station\b/.test(line)) {
        const cm = line.match(/artifact creature at (\d+)\+/);
        if (cm) r.stationCreatureAt = Number(cm[1]);
        r.activated.push({
          index,
          text: "Station",
          station: true,
          sorcery: true,
          oncePerTurn: false,
          cost: { mana: "", tap: false, sacrificeSelf: false, life: 0 },
          effectText: "Tap another creature you control: put charge counters equal to its power on this.",
          compiled: { targets: [], effects: [] }
        });
        return;
      }
      const plain = stripReminder(line);
      if (!plain) {
        const inner = line.replace(/^\(|\)$/g, "");
        const mm = inner.match(/^\{T\}: (Add .+)$/);
        if (mm) {
          const me = parseManaEffect(mm[1]);
          if (me) r.manaAbilities.push({ index, cost: { mana: "", tap: true, sacrificeSelf: false, life: 0 }, ...me });
        }
        return;
      }
      const kws = isKeywordLine(plain);
      if (kws) {
        for (const k of kws) if (k !== "equip") r.keywords.push(k);
        if (kws.includes("affinity for artifacts")) r.affinity = true;
        let km;
        const costOf = (re) => plain.match(re)?.[1];
        if ((km = plain.match(/^Affinity for (\w+?)s?$/i)) && km[1].toLowerCase() !== "artifact") r.selfReduce = { filter: { types: [], not: [], subtypes: [km[1].toLowerCase()], controller: "you" }, mine: true };
        r.kicker = costOf(/^Kicker ((?:\{[^}]+\})+)/) ?? r.kicker;
        r.multikicker = costOf(/^Multikicker ((?:\{[^}]+\})+)/) ?? r.multikicker;
        r.squad = costOf(/^Squad ((?:\{[^}]+\})+)/) ?? r.squad;
        r.flashback = costOf(/^Flashback ((?:\{[^}]+\})+)/) ?? r.flashback;
        if (km = plain.match(/^(Basic landcycling|Cycling) ((?:\{[^}]+\})+)/)) r.cycling = { cost: km[2], basic: km[1] !== "Cycling" };
        const eq = plain.match(/^Equip (\{[^}]+\}(?:\{[^}]+\})*|\d+)/i);
        if (eq) {
          const cost = /^\d+$/.test(eq[1]) ? `{${eq[1]}}` : eq[1];
          r.activated.push({
            index,
            text: `Equip ${cost}`,
            cost: { mana: cost, tap: false, sacrificeSelf: false, life: 0 },
            effectText: "Attach to target creature you control.",
            compiled: { targets: [{ kind: "perm", filter: { types: ["creature"], not: [], controller: "you" } }], effects: [] },
            sorcery: true,
            oncePerTurn: false,
            equip: true
          });
        }
        return;
      }
      let m;
      if (m = plain.match(/^Enchant (.+)$/)) {
        const f = parseFilter(m[1]);
        r.enchant = f ?? { types: ["permanent"], not: [] };
        if (!f) r.fullyAutomated = false;
        return;
      }
      if (m = plain.match(/^Equipped creature gets ([+-]\d+)\/([+-]\d+) and has "(Whenever this creature attacks), (.+)"$/)) {
        r.statics.push({ kind: "equip", power: Number(m[1]), toughness: Number(m[2]), keywords: [] });
        const compiled = compile(m[4], def2.name);
        r.triggers.push({ index, event: "attacks", text: line, effectText: m[4], compiled, equipped: true });
        if (!compiled) r.fullyAutomated = false;
        return;
      }
      if (m = plain.match(/^(Equipped|Enchanted) creature gets ([+-]\d+)\/([+-]\d+)(?: and has (.+?))?\.$/)) {
        r.statics.push({ kind: m[1] === "Equipped" ? "equip" : "aura", power: Number(m[2]), toughness: Number(m[3]), keywords: keywordList(m[4]) });
        return;
      }
      if (m = plain.match(/^(Equipped|Enchanted) creature has (.+?)\.$/)) {
        r.statics.push({ kind: m[1] === "Equipped" ? "equip" : "aura", power: 0, toughness: 0, keywords: keywordList(m[2]) });
        return;
      }
      if (m = plain.match(/^(.+?) you control get ([+-]\d+)\/([+-]\d+)(?: and have (.+?))?\.$/)) {
        const f = parseFilter(m[1]);
        if (f) {
          f.controller = "you";
          r.statics.push({ kind: "anthem", power: Number(m[2]), toughness: Number(m[3]), keywords: keywordList(m[4]), filter: f });
          return;
        }
      }
      if (m = plain.match(new RegExp(`^(.+?) you control( with counters on them)? have ${KW_LIST}(?:(?:,| and|, and) ${KW_LIST})*\\.$`))) {
        const f = parseFilter(m[1] + (m[2] ?? ""));
        if (f) {
          f.controller = "you";
          r.statics.push({ kind: "anthem", power: 0, toughness: 0, keywords: keywordList(plain.match(/have (.+)\.$/)[1]), filter: f });
          return;
        }
      }
      if (/enters tapped/.test(plain) || /^As ~ enters, you may reveal/.test(plain)) {
        if (!types.includes("land")) r.fullyAutomated = false;
        return;
      }
      if (m = plain.match(/^((?:[IVX]+)(?:, [IVX]+)*) \u2014 (.+)$/)) {
        const roman = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
        const compiled = compile(m[2], def2.name);
        (r.chapters ??= []).push({ nums: m[1].split(", ").map((x) => roman[x] ?? 0), text: m[2], compiled });
        if (!compiled) r.fullyAutomated = false;
        return;
      }
      if (/^You have no maximum hand size\.$/.test(plain)) return void (r.noMaxHandSize = true);
      if (/^Whenever a creature you control attacks, it gets \+1\/\+0 until end of turn for each other attacking creature that shares a creature type with it\.$/.test(plain)) return void (r.sharedAnimosity = true);
      if (/^Players can't activate planeswalkers' loyalty abilities\.$/.test(plain)) return;
      if (/^You may play an additional land on each of your turns\.$/.test(plain)) return void (r.extraLand = true);
      if (/^~ can't block\.$/.test(plain)) return void (r.cantBlock = true);
      if (/^~ can't be blocked\.$/.test(plain)) return void (r.unblockable = true);
      if (/^~ can't be blocked if you control a Spacecraft\.$/.test(plain)) return void (r.unblockable = "ifSpacecraft");
      if (m = plain.match(/^~ can't be blocked by creatures with power (\d+) or less\.$/)) return void (r.evasionPower = Number(m[1]));
      if (/^~ attacks each combat if able\.$/.test(plain)) return void (r.mustAttack = true);
      if (m = plain.match(/^(.+?) spells you cast cost \{(\d+)\} less to cast\.$/)) {
        const f = parseFilter(m[1].replace(/ spells and /, " and "));
        if (f) return void (r.costReduction = { filter: f, n: Number(m[2]) });
      }
      if (m = plain.match(/^~ costs \{1\} less to cast for each (.+?) on the battlefield\.$/)) {
        const f = parseFilter(m[1]);
        if (f) return void (r.selfReduce = { filter: f });
      }
      if (m = plain.match(/^As an additional cost to cast ~, (.+)\.$/)) {
        const c = m[1];
        if (/^discard a card$/.test(c)) r.extraCost = { discard: 1 };
        else if (/^pay X life$/.test(c)) r.extraCost = { lifeX: true };
        else if (m = c.match(/^discard a card or pay (\d+) life$/)) r.extraCost = { discard: 1, orLife: Number(m[1]) };
        else if ((m = c.match(/^sacrifice an? (.+)$/)) && parseFilter(m[1])) r.extraCost = { sacrifice: parseFilter(m[1]) };
        else r.fullyAutomated = false;
        return;
      }
      if (m = plain.match(/^~ enters with (a|an|one|two|three|four|five|x|\d+) ([+-]1\/[+-]1|\w+) counters? on it\.$/i)) {
        const n = num(m[1]);
        return void (r.entersWith = { kind: m[2].toLowerCase(), n });
      }
      if (m = plain.match(/^~ enters with an? (\w+|[+-]1\/[+-]1) counter on it for each time it was kicked\.$/)) return void (r.entersWith = { kind: m[1], n: "kicked" });
      if (m = plain.match(/^(.+?) you control have "(.+)"\.?$/)) {
        const f = parseFilter(m[1]);
        const inner = m[2].replace(/\.$/, ".").replace(/\bthis creature\b/g, SELF);
        if (f && /^(When|Whenever|At) /.test(inner)) {
          f.controller = "you";
          const t0 = r.triggers.length;
          handle(inner, index);
          const added = r.triggers.slice(t0);
          if (added.length) {
            added.forEach((t) => t.granted = f);
            return;
          }
        }
      }
      if (m = plain.match(/^(When|Whenever|At) ([^,]+), (.+)$/)) {
        const cond = m[2];
        let effectText = m[3];
        let event = null;
        let filter;
        let fm;
        if (/^~ enters or attacks$/.test(cond)) {
          const compiled = conditional0(effectText) ? null : compile(effectText, def2.name);
          r.triggers.push({ index, event: "etb", text: line, effectText, compiled }, { index, event: "attacks", text: line, effectText, compiled });
          if (!compiled) r.fullyAutomated = false;
          return;
        }
        let kicked = false;
        if (/^if it was kicked, /.test(effectText)) {
          kicked = true;
          effectText = effectText.replace(/^if it was kicked, /, "");
        }
        let who;
        if (fm = cond.match(/^~ or another (.+?) you control enters$/)) {
          const ff = parseFilter(fm[1] + " you control");
          const compiled = compile(effectText, def2.name);
          if (ff) {
            ff.other = true;
            r.triggers.push({ index, event: "etb", text: line, effectText, compiled }, { index, event: "otherEtb", text: line, effectText, compiled, filter: ff });
            if (!compiled) r.fullyAutomated = false;
            return;
          }
        }
        let equipped = false;
        if (fm = cond.match(/^equipped creature (dies|attacks|deals combat damage to a player)$/)) {
          equipped = true;
          event = fm[1] === "dies" ? "dies" : fm[1] === "attacks" ? "attacks" : "combatDamagePlayer";
        } else if (/^one or more creatures attack$/.test(cond)) event = "youAttack";
        else if (/^the beginning of your draw step$/.test(cond)) event = "yourDraw";
        else if (/^the beginning of each player's draw step$/.test(cond)) event = "eachDraw";
        else if (/^you draw your second card each turn$/.test(cond)) event = "secondDraw";
        else if (fm = cond.match(/^(you|an opponent) casts? (?:a|an) ?(.*?) ?spell$/)) {
          const ff = parseFilter(fm[2] || "card");
          if (ff) {
            event = "castSpell";
            filter = ff;
            who = fm[1] === "you" ? "you" : "opp";
          }
        } else if (fm = cond.match(/^(another|a) (.+?) you control dies$/)) {
          const ff = parseFilter(fm[2] + " you control");
          if (ff) {
            if (fm[1] === "another") ff.other = true;
            event = "otherDies";
            filter = ff;
          }
        } else if (/^you gain life$/.test(cond)) event = "gainLife";
        else if (/^~ becomes tapped$/.test(cond)) event = "tapped";
        else if (/^the beginning of each upkeep$/.test(cond) || /^the beginning of each player's upkeep$/.test(cond)) event = "eachUpkeep";
        else if (/^the beginning of each player's end step$/.test(cond)) event = "eachEndStep";
        else if (fm = cond.match(/^one or more (.+?) you control deal combat damage to a player$/)) {
          const ff = parseFilter(fm[1] + " you control");
          if (ff) {
            event = "teamDamage";
            filter = ff;
          }
        } else if (/^you attack$/.test(cond)) event = "youAttack";
        else if (/^~ enters$/.test(cond) || /^~ enters the battlefield$/.test(cond)) event = "etb";
        else if (/^~ attacks$/.test(cond)) event = "attacks";
        else if (/^~ blocks$/.test(cond)) event = "blocks";
        else if (/^~ dies$/.test(cond)) event = "dies";
        else if (/^~ leaves the battlefield$/.test(cond)) event = "ltb";
        else if (/^the beginning of your upkeep$/.test(cond)) event = "upkeep";
        else if (/^the beginning of your end step$/.test(cond)) event = "endStep";
        else if (/^the beginning of combat on your turn$/.test(cond)) event = "beginCombat";
        else if (/^~ deals combat damage to a player$/.test(cond)) event = "combatDamagePlayer";
        else if (/^you cast this spell$/.test(cond)) event = "cast";
        else if (/^a land you control enters$/.test(cond) || /^a land enters the battlefield under your control$/.test(cond)) event = "landfall";
        else if (fm = cond.match(/^(another .+?|a .+?|an .+?) (?:you control )?enters(?: the battlefield)?(?: under your control)?$/)) {
          const raw = fm[1].replace(/^(a|an) /, "");
          const ff = parseFilter(raw.replace(/ you control$/, "") + (/ you control$/.test(raw) || /you control/.test(cond) || /under your control/.test(cond) ? " you control" : ""));
          if (ff) {
            event = "otherEtb";
            filter = ff;
          }
        }
        const conditional = /^if /i.test(effectText);
        if (event) {
          let compiled = conditional ? null : compile(effectText, def2.name);
          if (compiled && kicked) compiled.ifKicked = true;
          r.triggers.push({ index, event, text: line, effectText, compiled, filter, conditional, who, equipped: equipped || void 0 });
          if (!compiled) r.fullyAutomated = false;
          effectText = "";
          return;
        }
        r.fullyAutomated = false;
        r.triggers.push({ index, event: "cast", text: line, effectText: m[3], compiled: null, conditional: true });
        r.triggers.pop();
        return;
      }
      if (!isSpell && (m = plain.match(/^([^:"]+?): (.+)$/)) && /(\{|^[+-]?\d+$|Sacrifice|Pay|Discard|Exile|Tap|Remove)/.test(m[1])) {
        const cost = parseAbilityCost(m[1]);
        let eff = m[2];
        const sorcery = /Activate only as a sorcery\.?/.test(eff) || cost?.loyalty !== void 0;
        const once = /Activate only once each turn\.?/.test(eff) || cost?.loyalty !== void 0;
        eff = eff.replace(/\s*Activate only (as a sorcery|once each turn)( and only (as a sorcery|once each turn))?\.?/g, "").trim();
        let lm;
        if (cost && (lm = eff.match(/\s*Activate only if you control (five|four|seven|\w+) or more lands\.$/))) {
          cost.needLands = num(lm[1]);
          eff = eff.replace(lm[0], "");
        }
        if (cost && /\s*Activate only if you control an artifact\.$/.test(eff)) {
          cost.needArtifact = true;
          eff = eff.replace(/\s*Activate only if you control an artifact\.$/, "");
        }
        if (cost && cost.tap && !cost.other && cost.loyalty === void 0) {
          const me = parseManaEffect(eff);
          if (me) {
            r.manaAbilities.push({ index, cost, ...me });
            return;
          }
        }
        if (cost && !cost.tap && !cost.mana && cost.loyalty === void 0 && !cost.other && /^Add /.test(eff)) {
          const me = parseManaEffect(eff);
          if (me) {
            r.manaAbilities.push({ index, cost, ...me });
            return;
          }
        }
        if (cost) {
          const compiled = cost.other ? null : compile(eff, def2.name);
          if (!compiled) r.fullyAutomated = false;
          r.activated.push({
            index,
            text: line,
            cost,
            effectText: eff,
            compiled,
            sorcery,
            oncePerTurn: once,
            loyalty: cost.loyalty !== void 0,
            fromGraveyard: /from your graveyard/.test(eff) && cost.exileSelfFromGy
          });
          return;
        }
      }
      if (isSpell) {
        spellLines.push(plain);
        return;
      }
      r.fullyAutomated = false;
    };
    let threshold;
    lines.forEach((line, index) => {
      const th = line.match(/^(\d+)\+ \| (.+)$/);
      if (th) threshold = Number(th[1]);
      if (threshold === void 0) return handle(line, index);
      const k0 = r.keywords.length;
      const s0 = r.statics.length;
      const t0 = r.triggers.length;
      const a0 = r.activated.length;
      handle(th ? th[2] : line, index);
      const n = threshold;
      const newK = r.keywords.splice(k0);
      if (newK.length) (r.thresholdKeywords ??= []).push({ n, keywords: newK });
      r.statics.slice(s0).forEach((x) => x.threshold = n);
      r.triggers.slice(t0).forEach((x) => x.threshold = n);
      r.activated.slice(a0).forEach((x) => x.threshold = n);
    });
    if (isSpell) {
      const head = spellLines.findIndex((l) => /^Choose (one|two|one or both|one or more)\b/.test(l));
      if (head >= 0) {
        const h = spellLines[head];
        const n = /^Choose two/.test(h) ? 2 : /^Choose one or both/.test(h) ? 2 : /If you control a commander/.test(h) ? 1 : 1;
        const modes = spellLines.slice(head + 1).filter((l) => l.startsWith("\u2022")).map((l) => {
          const text2 = l.replace(/^\u2022\s*/, "");
          return { text: text2, compiled: compile(text2, def2.name) };
        });
        r.modal = { n, upTo: /one or both/.test(h), modes };
        if (modes.some((x) => !x.compiled)) r.fullyAutomated = false;
        r.spellText = spellLines.join(" ");
        r.spell = { targets: [], effects: [] };
      } else {
        r.spellText = spellLines.join(" ").replace(/\s*~ can't be countered\.\s*/, " ").trim();
        r.spell = r.spellText ? compile(r.spellText, def2.name) : null;
        if (!r.spell) r.fullyAutomated = false;
      }
    }
    r.hasX = /\{X\}/.test(def2.oracle);
    return r;
  }
  var conditional0 = (t) => /^if /i.test(t);

  // src/engine/state.ts
  var clone = (x) => structuredClone(x);
  function cloneState(s) {
    const { cards, ...rest } = s;
    return { ...structuredClone(rest), cards };
  }
  var opp = (p) => 1 - p;
  function def(s, id) {
    return s.cards[id] ?? {
      id,
      name: id,
      manaCost: "",
      cmc: 0,
      typeLine: "Card",
      oracle: "",
      colors: [],
      identity: [],
      keywords: [],
      missing: true
    };
  }
  var cardName = (s, id) => def(s, id).name;
  function permName(s, p) {
    const d = def(s, p.card);
    if (p.faceDown) return "Face-down card";
    return p.flipped && d.back ? d.back.name : d.name;
  }
  function rulesOf(s, p) {
    return rulesFor(def(s, p.card), !!p.flipped);
  }
  function findPerm(s, iid) {
    return s.battlefield.find((p) => p.iid === iid);
  }
  function log(s, msg) {
    s.log.push(msg);
    if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
  }
  var ZONES = ["library", "hand", "graveyard", "exile", "command"];
  function locate(s, iid) {
    const perm = findPerm(s, iid);
    if (perm) return { zone: "battlefield", player: perm.controller, obj: perm };
    for (let p = 0; p < s.players.length; p++) {
      for (const z of ZONES) {
        const o = s.players[p][z].find((x) => x.iid === iid);
        if (o) return { zone: z, player: p, obj: o };
      }
    }
    for (const it of s.stack) if (it.kind === "spell" && it.obj?.iid === iid) return { zone: "stack", player: it.controller, obj: it.obj };
    return null;
  }
  function detach(s, iid) {
    const i = s.battlefield.findIndex((p) => p.iid === iid);
    if (i >= 0) {
      const p = s.battlefield[i];
      s.battlefield.splice(i, 1);
      if (s.combat) {
        s.combat.attackers = s.combat.attackers.filter((x) => x.iid !== iid);
        s.combat.blocks = s.combat.blocks.filter((x) => x.blocker !== iid && x.attacker !== iid);
      }
      for (const q of s.battlefield) if (q.attachedTo === iid) q.attachedTo = void 0;
      return { obj: { iid: p.iid, card: p.card, owner: p.owner, token: p.token, commander: p.commander }, from: "battlefield" };
    }
    for (const pl of s.players)
      for (const z of ZONES) {
        const j = pl[z].findIndex((x) => x.iid === iid);
        if (j >= 0) {
          const [o] = pl[z].splice(j, 1);
          return { obj: o, from: z };
        }
      }
    const k = s.stack.findIndex((it) => it.kind === "spell" && it.obj?.iid === iid);
    if (k >= 0) {
      const it = s.stack.splice(k, 1)[0];
      return { obj: it.obj, from: "stack" };
    }
    return null;
  }
  function newPerm(s, o, controller, opts = {}) {
    return {
      iid: o.iid,
      card: o.card,
      owner: o.owner,
      token: o.token,
      commander: o.commander,
      controller,
      tapped: !!opts.tapped,
      sick: true,
      counters: {},
      damage: 0,
      mods: [],
      flipped: opts.flipped
    };
  }
  function typesOf(s, p) {
    const r = rulesOf(s, p);
    const extra = p.addTypes;
    if (extra?.length) return [.../* @__PURE__ */ new Set([...r.types, ...extra])];
    if (r.stationCreatureAt !== void 0 && (p.counters?.charge ?? 0) >= r.stationCreatureAt && !r.types.includes("creature")) return [...r.types, "creature"];
    return r.types;
  }
  function isType(s, p, t) {
    return typesOf(s, p).includes(t);
  }
  var reached = (p, n) => n === void 0 || (p.counters?.charge ?? 0) >= n;
  function matches(s, f, o, viewer, controller, sourceIid, perm) {
    const r = rulesOf(s, o);
    const types = perm ? typesOf(s, perm) : r.types;
    if (f.types.length && !f.types.some((t) => types.includes(t))) return false;
    if (f.and?.length && !f.and.every((t) => types.includes(t))) return false;
    if (f.not.some((t) => types.includes(t))) return false;
    if (f.controller === "you" && controller !== viewer) return false;
    if (f.controller === "opp" && controller === viewer) return false;
    if (f.other && o.iid !== void 0 && o.iid === sourceIid) return false;
    if (f.subtypes?.length && !f.subtypes.some((st) => r.subtypes.some((x) => x.toLowerCase() === st || x.toLowerCase() + "s" === st) || r.types.includes(st) || r.supertypes.includes(st))) return false;
    if (f.maxMv !== void 0 && def(s, o.card).cmc > f.maxMv) return false;
    if (f.minMv !== void 0 && def(s, o.card).cmc < f.minMv) return false;
    if (f.token && !o.token) return false;
    if (f.minToughness !== void 0 && !(perm && pt(s, perm)[1] >= f.minToughness)) return false;
    if (f.historic && !(types.includes("artifact") || r.supertypes.includes("legendary") || r.subtypes.includes("Saga"))) return false;
    if (f.withCounters && !(perm && Object.values(perm.counters).some((v) => v > 0))) return false;
    if (f.colors?.length && !f.colors.some((c) => def(s, o.card).colors.includes(c))) return false;
    if (f.nonColors?.length && f.nonColors.some((c) => def(s, o.card).colors.includes(c))) return false;
    if (f.nonToken && o.token) return false;
    if (f.basic && !r.supertypes.includes("basic")) return false;
    if (perm) {
      if (f.tapped === true && !perm.tapped) return false;
      if (f.tapped === false && perm.tapped) return false;
      if (f.attacking && !s.combat?.attackers.some((a) => a.iid === perm.iid)) return false;
    }
    return true;
  }
  var num2 = (x) => {
    const n = parseInt(x ?? "0", 10);
    return Number.isFinite(n) ? n : 0;
  };
  var CDA = {};
  function basePT(s, p) {
    const d = def(s, p.card);
    if (p.faceDown) return [2, 2];
    const cda = CDA[d.name];
    if (cda && !p.flipped) return cda(s, p);
    const face = p.flipped && d.back ? d.back : d;
    return [num2(face.power), num2(face.toughness)];
  }
  var COST_MODS = {};
  var BUFFS = {};
  var GRANTS = {};
  function keywords(s, p) {
    const own = rulesOf(s, p);
    const out = new Set(own.keywords);
    for (const q of s.battlefield) {
      const g = GRANTS[def(s, q.card).name];
      if (g) for (const k of g(s, q, p)) out.add(k);
    }
    for (const t of own.thresholdKeywords ?? []) if (reached(p, t.n)) t.keywords.forEach((k) => out.add(k));
    for (const m of p.mods) for (const k of m.keywords ?? []) out.add(k);
    for (const q of s.battlefield) {
      const r = rulesOf(s, q);
      for (const st of r.statics) {
        if (!reached(q, st.threshold)) continue;
        if (st.kind === "anthem") {
          if (q.controller === p.controller && isType(s, p, "creature") && matches(s, st.filter, p, q.controller, p.controller, q.iid, p)) for (const k of st.keywords) out.add(k);
        } else if (q.attachedTo === p.iid) for (const k of st.keywords) out.add(k);
      }
    }
    return [...out];
  }
  var hasKw = (s, p, k) => keywords(s, p).includes(k);
  function pt(s, p) {
    let [pw, t] = basePT(s, p);
    pw += (p.counters["+1/+1"] ?? 0) - (p.counters["-1/-1"] ?? 0);
    t += (p.counters["+1/+1"] ?? 0) - (p.counters["-1/-1"] ?? 0);
    for (const m of p.mods) {
      pw += m.power;
      t += m.toughness;
    }
    for (const q of s.battlefield) {
      const b = BUFFS[def(s, q.card).name];
      if (b) {
        const [x, y] = b(s, q, p);
        pw += x;
        t += y;
      }
      const r = rulesOf(s, q);
      for (const st of r.statics) {
        if (!reached(q, st.threshold)) continue;
        if (st.kind === "anthem") {
          if (q.controller === p.controller && matches(s, st.filter, p, q.controller, p.controller, q.iid, p)) {
            pw += st.power;
            t += st.toughness;
          }
        } else if (q.attachedTo === p.iid) {
          pw += st.power;
          t += st.toughness;
        }
      }
    }
    return [pw, t];
  }
  function isCreature(s, p) {
    return isType(s, p, "creature") || !!p.mods.some((m) => m.note === "creature");
  }
  function emptyPool() {
    return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  }

  // src/engine/named.ts
  var creature = { kind: "perm", filter: { types: ["creature"], not: [] } };
  var permanent = { kind: "perm", filter: { types: [], not: [] } };
  var NAMED = {
    "Swords to Plowshares": {
      spell: { targets: [creature], effects: [{ e: "named", name: "Swords to Plowshares" }] },
      run(ctx, item, legal) {
        const p = legal[0] ? findPerm(ctx.s, item.targets[0].id) : void 0;
        if (!p) return;
        const [power] = pt(ctx.s, p);
        const who = p.controller;
        H().move(ctx.s, p.iid, "exile");
        H().gainLife(ctx.s, who, Math.max(0, power));
      }
    },
    "Path to Exile": {
      spell: { targets: [creature], effects: [{ e: "named", name: "Path to Exile" }] },
      run(ctx, item, legal) {
        const p = legal[0] ? findPerm(ctx.s, item.targets[0].id) : void 0;
        if (!p) return;
        const who = p.controller;
        H().move(ctx.s, p.iid, "exile");
        search(ctx, who, { e: "search", filter: { types: ["land"], not: [], basic: true }, count: 1, dest: "battlefield", tapped: true }, "path");
      }
    },
    "Beast Within": {
      spell: { targets: [permanent], effects: [{ e: "named", name: "Beast Within" }] },
      run(ctx, item, legal) {
        const p = legal[0] ? findPerm(ctx.s, item.targets[0].id) : void 0;
        if (!p) return;
        const who = p.controller;
        H().destroy(ctx.s, p.iid);
        const card = H().makeTokenDef(ctx.s, { e: "token", n: 1, name: "Beast", power: 3, toughness: 3, types: "Creature \u2014 Beast", colors: ["G"], keywords: [] }, 0);
        H().createToken(ctx.s, who, card, 1);
      }
    },
    Cultivate: {
      spell: { targets: [], effects: [{ e: "named", name: "Cultivate" }] },
      run(ctx, item) {
        const s = ctx.s;
        const me = item.controller;
        const lib = s.players[me].library;
        const basics = lib.filter((o) => rulesOf(s, o).supertypes.includes("basic") && rulesOf(s, o).types.includes("land"));
        const seen = /* @__PURE__ */ new Map();
        const opts = basics.filter((o) => {
          const n = seen.get(o.card) ?? 0;
          seen.set(o.card, n + 1);
          return n < 2;
        }).map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: 1 }));
        const picks = ctx.ask(me, { key: "cult", prompt: "Cultivate: choose up to two basic lands", options: opts, min: 0, max: Math.min(2, opts.length), cards: true });
        if (picks.length) {
          const [bf] = ctx.ask(me, { key: "cult2", prompt: "Which one goes onto the battlefield tapped? (the other goes to your hand)", options: picks.map((id) => opts.find((o) => o.id === id)), min: 1, max: 1, cards: true });
          H().move(s, Number(bf), "battlefield", { tapped: true });
          for (const id of picks) if (id !== bf) H().move(s, Number(id), "hand");
        }
        H().shuffle(s, me);
      }
    },
    Dispatch: {
      spell: { targets: [creature], effects: [{ e: "named", name: "Dispatch" }] },
      run(ctx, item, legal) {
        const s = ctx.s;
        const p = legal[0] ? findPerm(s, item.targets[0].id) : void 0;
        if (!p) return;
        const artifacts = s.battlefield.filter((q) => q.controller === item.controller && isType(s, q, "artifact")).length;
        if (artifacts >= 3) {
          log(s, "Metalcraft: three or more artifacts, so it is exiled.");
          H().move(s, p.iid, "exile");
        } else p.tapped = true;
      }
    },
    "Deliver from Chaos": {
      spell: { targets: [{ kind: "perm", filter: { types: ["artifact", "creature"], not: [] } }], effects: [{ e: "named", name: "Deliver from Chaos" }] },
      run(ctx, item, legal) {
        const s = ctx.s;
        const p = legal[0] ? findPerm(s, item.targets[0].id) : void 0;
        if (!p) return;
        const n = def(s, p.card).cmc;
        H().move(s, p.iid, "exile");
        const card = H().makeTokenDef(s, { e: "token", n, name: "Borg", power: 1, toughness: 1, types: "Artifact Creature \u2014 Borg", colors: [], keywords: [], artifact: true }, 0);
        H().createToken(s, item.controller, card, n);
      }
    },
    Brainstorm: {
      spell: { targets: [], effects: [{ e: "named", name: "Brainstorm" }] },
      run(ctx, item) {
        const s = ctx.s;
        const me = item.controller;
        H().draw(s, me, 3);
        const hand = s.players[me].hand;
        if (hand.length === 0) return;
        const k = Math.min(2, hand.length);
        const picks = ctx.ask(me, {
          key: "bs",
          prompt: `Brainstorm: put ${k} cards from your hand on top of your library (the last one chosen ends on top)`,
          options: hand.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: rulesOf(s, o).types.includes("land") ? 2 : 0 })),
          min: k,
          max: k,
          cards: true,
          ordered: true
        });
        for (const id of picks) H().move(s, Number(id), "library");
        log(s, `${s.players[me].name} puts ${k} cards back on top.`);
      }
    }
  };
  var sweep = (name, run) => ({ spell: { targets: [], effects: [{ e: "named", name }] }, run });
  function shrinkAll(s, x, only) {
    for (const p of s.battlefield) if (isCreature(s, p) && (!only || only(p))) p.mods.push({ power: -x, toughness: -x, until: "eot" });
    log(s, `Creatures get -${x}/-${x} until end of turn.`);
  }
  Object.assign(NAMED, {
    "Join the Collective": sweep("Join the Collective", (ctx, item) => {
      const s = ctx.s;
      const victims = s.battlefield.filter((p) => isCreature(s, p));
      let n = 0;
      for (const p of victims) {
        const nonArtifact = !isType(s, p, "artifact");
        if (H().destroy(s, p.iid) && nonArtifact) n++;
      }
      const card = H().makeTokenDef(s, { e: "token", n, name: "Borg", power: 1, toughness: 1, types: "Artifact Creature \u2014 Borg", colors: [], keywords: [], artifact: true }, 0);
      H().createToken(s, item.controller, card, n);
    }),
    "Battle of Wolf 359": sweep("Battle of Wolf 359", (ctx, item) => {
      const s = ctx.s;
      const x = s.battlefield.filter((p) => p.controller === item.controller && isCreature(s, p) && isType(s, p, "artifact")).length;
      shrinkAll(s, x, (p) => !isType(s, p, "artifact"));
    }),
    "Toxic Deluge": sweep("Toxic Deluge", (ctx, item) => shrinkAll(ctx.s, item.x ?? 0)),
    "Chain Reaction": sweep("Chain Reaction", (ctx, item) => {
      const s = ctx.s;
      const all = s.battlefield.filter((p) => isCreature(s, p));
      for (const p of all) H().damage(s, { card: item.card, controller: item.controller }, { kind: "perm", id: p.iid }, all.length);
    }),
    "Echo of Eons": sweep("Echo of Eons", (ctx) => {
      const s = ctx.s;
      s.players.forEach((pl, i) => {
        for (const o of [...pl.hand, ...pl.graveyard]) H().move(s, o.iid, "library");
        H().shuffle(s, i);
        H().draw(s, i, 7);
      });
    }),
    Ponder: sweep("Ponder", (ctx, item) => {
      scryLike(ctx, item.controller, 3, "pond");
      H().draw(ctx.s, item.controller, 1);
    }),
    "Thirst for Knowledge": sweep("Thirst for Knowledge", (ctx, item) => {
      const s = ctx.s;
      const me = item.controller;
      H().draw(s, me, 3);
      const hand = s.players[me].hand;
      const picks = ctx.ask(me, { key: "tfk", prompt: "Discard two cards, or one artifact card", options: hand.map((o) => ({ id: String(o.iid), label: cardName(s, o.card) + (isType(s, o, "artifact") ? " (artifact)" : ""), card: o.card, iid: o.iid, score: isType(s, o, "artifact") ? 3 : -def(s, o.card).cmc })), min: Math.min(1, hand.length), max: Math.min(2, hand.length), cards: true });
      const ok = picks.length === 2 || picks.length === 1 && isType(s, hand.find((o) => o.iid === Number(picks[0])), "artifact") || hand.length < 2;
      const all = ok ? picks : [...picks, ...hand.filter((o) => !picks.includes(String(o.iid))).slice(0, 2 - picks.length).map((o) => String(o.iid))];
      for (const id of all) H().move(s, Number(id), "graveyard");
    }),
    "Frantic Search": sweep("Frantic Search", (ctx, item) => {
      const s = ctx.s;
      const me = item.controller;
      H().draw(s, me, 2);
      const hand = s.players[me].hand;
      const picks = ctx.ask(me, { key: "fs", prompt: "Discard two cards", options: hand.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: -def(s, o.card).cmc })), min: Math.min(2, hand.length), max: Math.min(2, hand.length), cards: true });
      for (const id of picks) H().move(s, Number(id), "graveyard");
      let n = 3;
      for (const p of s.battlefield) if (n > 0 && p.controller === me && p.tapped && isType(s, p, "land")) p.tapped = false, n--;
    }),
    "Painful Truths": sweep("Painful Truths", (ctx, item) => {
      const n = Math.min(3, ctx.s.players[item.controller].identity.length);
      H().draw(ctx.s, item.controller, n);
      ctx.s.players[item.controller].life -= n;
      log(ctx.s, `${ctx.s.players[item.controller].name} loses ${n} life.`);
    }),
    "The Promise of Kahless": sweep("The Promise of Kahless", (ctx, item) => {
      const s = ctx.s;
      const me = item.controller;
      const kw = (o) => rulesOf(s, o).subtypes.some((t) => t === "Klingon" || t === "Warrior");
      const sac = s.battlefield.filter((p) => p.controller === me && isCreature(s, p) && kw(p));
      const pick = sac.length ? ctx.ask(me, { key: "pk", prompt: "You may sacrifice a Klingon or Warrior", options: sac.map((p) => ({ id: String(p.iid), label: permName(s, p), card: p.card, iid: p.iid, score: -def(s, p.card).cmc })), min: 0, max: 1, cards: true }) : [];
      if (!pick.length) return;
      H().move(s, Number(pick[0]), "graveyard", { cause: "sacrifice" });
      const back = s.players[me].graveyard.filter((o) => o.iid !== Number(pick[0]) && rulesOf(s, o).types.includes("creature") && kw(o));
      for (const o of back) H().move(s, o.iid, "battlefield", { controller: me });
    }),
    "Gift of Perfection": sweep("Gift of Perfection", (ctx, item) => assimilateTop(ctx, item.controller, opp(item.controller))),
    "Fractured Identity": {
      spell: { targets: [{ kind: "perm", filter: { types: [], not: ["land"] } }], effects: [{ e: "named", name: "Fractured Identity" }] },
      run(ctx, item, legal) {
        const s = ctx.s;
        const p = legal[0] ? findPerm(s, item.targets[0].id) : void 0;
        if (!p) return;
        const card = p.card;
        const ctl = p.controller;
        H().move(s, p.iid, "exile");
        if (ctl !== item.controller) H().createToken(s, item.controller, card, 1);
      }
    }
  });
  function scryLike(ctx, me, n, key) {
    const s = ctx.s;
    const top = s.players[me].library.slice(0, n);
    if (!top.length) return;
    const order = ctx.ask(me, { key, prompt: `Look at the top ${top.length}: put them back in any order (first = top). Pick none to shuffle instead.`, options: top.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: rulesOf(s, o).types.includes("land") ? 0 : 1 })), min: 0, max: top.length, cards: true, ordered: true });
    if (!order.length) return H().shuffle(s, me);
    const kept = order.map((id) => top.find((o) => o.iid === Number(id)));
    const rest = top.filter((o) => !kept.includes(o));
    s.players[me].library.splice(0, top.length, ...kept, ...rest);
  }
  function assimilate(s, me, iid) {
    H().move(s, iid, "battlefield", { controller: me });
    const p = findPerm(s, iid);
    if (!p) return;
    p.counters["+1/+1"] = (p.counters["+1/+1"] ?? 0) + 1;
    p.addTypes = ["artifact", "creature"];
    log(s, `${s.players[me].name} assimilates ${permName(s, p)}.`);
  }
  function assimilateTop(ctx, me, who) {
    const s = ctx.s;
    const lib = s.players[who].library;
    const i = lib.findIndex((o) => rulesOf(s, o).types.includes("creature"));
    if (i < 0) return;
    const passed = lib.slice(0, i);
    const hit = lib[i];
    for (const o of passed) H().move(s, o.iid, "libraryBottom");
    assimilate(s, me, hit.iid);
  }
  var T = (card, events, name, run, targets = []) => {
    NAMED[name] = { spell: { targets, effects: [{ e: "named", name }] }, run };
    overrideTrigger(card, { events, compiled: { targets, effects: [{ e: "named", name }] } });
  };
  var lands = (s, me) => new Set(s.battlefield.filter((p) => p.controller === me && isType(s, p, "land")).map((p) => cardName(s, p.card))).size;
  T("Commander Spock", ["etb", "attacks"], "Commander Spock#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const top = s.players[me].library[0];
    if (!top) return;
    log(s, `Spock reveals ${cardName(s, top.card)}.`);
    const L = lands(s, me);
    if (rulesOf(s, top).types.includes("land")) {
      const [c] = ctx.ask(me, { key: "sp", prompt: `Spock: put ${cardName(s, top.card)} onto the battlefield tapped?`, options: [{ id: "yes", label: "Yes", card: top.card, score: 1 }, { id: "no", label: "No" }], min: 1, max: 1 });
      if (c === "yes") H().move(s, top.iid, "battlefield", { controller: me, tapped: true });
    } else if (def(s, top.card).cmc <= L) {
      const [c] = ctx.ask(me, { key: "sp", prompt: `Spock: cast ${cardName(s, top.card)} without paying its mana cost? (mana value ${def(s, top.card).cmc} \u2264 ${L} differently named lands)`, options: [{ id: "yes", label: "Cast it free", card: top.card, score: 1 }, { id: "no", label: "No" }], min: 1, max: 1 });
      if (c === "yes") castFreeHook(s, me, top.iid);
    }
    if (s.players[me].library[0]?.iid === top.iid) H().draw(s, me, 1);
  });
  T("Captain Kirk, Boldly Going", ["etb", "attacks"], "Captain Kirk#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const pl = s.players[me];
    const ok = (o) => rulesOf(s, o).supertypes.includes("basic") && rulesOf(s, o).types.includes("land") || cardName(s, o.card) === "Starship Enterprise";
    const seen = /* @__PURE__ */ new Set();
    const opts = [...pl.graveyard, ...pl.library].filter((o) => ok(o) && !seen.has(o.card + (pl.graveyard.includes(o) ? "g" : "l")) && seen.add(o.card + (pl.graveyard.includes(o) ? "g" : "l")));
    if (!opts.length) return;
    const [pick] = ctx.ask(me, { key: "kirk", prompt: "Kirk: put a basic land or Starship Enterprise into your hand", options: opts.map((o) => ({ id: String(o.iid), label: `${cardName(s, o.card)}${pl.graveyard.includes(o) ? " (graveyard)" : ""}`, card: o.card, iid: o.iid, score: cardName(s, o.card) === "Starship Enterprise" ? 5 : 1 })), min: 1, max: 1, cards: true });
    const fromLib = pl.library.some((o) => o.iid === Number(pick));
    H().move(s, Number(pick), "hand");
    if (fromLib) H().shuffle(s, me);
  });
  T("The Borg Queen", ["etb", "attacks"], "The Borg Queen#t", (ctx, item) => assimilateTop(ctx, item.controller, opp(item.controller)));
  T("Borg Queen, Perfection Manifest", ["etb"], "Borg Queen PM#t", (ctx, item) => {
    const s = ctx.s;
    const gy = s.players[opp(item.controller)].graveyard.filter((o) => rulesOf(s, o).types.includes("creature"));
    if (!gy.length) return;
    const [pick] = ctx.ask(item.controller, { key: "bq", prompt: "Assimilate a creature card from the opponent\u2019s graveyard", options: gy.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: def(s, o.card).cmc })), min: 1, max: 1, cards: true });
    assimilate(s, item.controller, Number(pick));
  });
  T("Worf, Defiant Commander", ["youAttack"], "Worf Defiant#t", (ctx, item) => {
    const s = ctx.s;
    const pl = s.players[item.controller];
    const top = pl.library[0];
    if (!top) return;
    H().move(s, top.iid, "exile");
    (pl.playable ??= []).push({ iid: top.iid, until: s.turn + 2 });
    log(s, `Worf exiles ${cardName(s, top.card)} \u2014 it can be played until the end of your next turn.`);
  });
  T("Kor, Cause of Vengeance", ["youAttack"], "Kor#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const others = s.battlefield.filter((p) => p.controller === me && p.iid !== item.iid && isCreature(s, p));
    if (!others.length) return;
    const pick = ctx.ask(me, { key: "kor", prompt: "Kor: you may sacrifice another creature to draw a card and give Klingons and Warriors +2/+2", options: others.map((p) => ({ id: String(p.iid), label: permName(s, p), card: p.card, iid: p.iid, score: p.token ? 1 : -def(s, p.card).cmc })), min: 0, max: 1, cards: true });
    if (!pick.length) return;
    H().move(s, Number(pick[0]), "graveyard", { cause: "sacrifice" });
    H().draw(s, me, 1);
    for (const p of s.battlefield) if (p.controller === me && isCreature(s, p) && rulesOf(s, p).subtypes.some((t) => t === "Klingon" || t === "Warrior")) p.mods.push({ power: 2, toughness: 2, until: "eot" });
  });
  T("Jean-Luc Picard, Luminary", ["secondDraw"], "Picard#seek", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const cr = s.battlefield.filter((p) => p.controller === me && p.iid !== item.iid && isCreature(s, p));
    const a = cr.length ? ctx.ask(me, { key: "pc1", prompt: "Picard: put a +1/+1 counter on up to one other creature", options: cr.map((p) => ({ id: String(p.iid), label: permName(s, p), card: p.card, iid: p.iid, score: 1 })), min: 0, max: 1 }) : [];
    for (const id of a) {
      const p = findPerm(s, Number(id));
      if (p) p.counters["+1/+1"] = (p.counters["+1/+1"] ?? 0) + 1;
    }
    const sc = s.battlefield.filter((p) => p.controller === me && rulesOf(s, p).subtypes.includes("Spacecraft"));
    const b = sc.length ? ctx.ask(me, { key: "pc2", prompt: "Picard: put two charge counters on up to one Spacecraft", options: sc.map((p) => ({ id: String(p.iid), label: permName(s, p), card: p.card, iid: p.iid, score: 1 })), min: 0, max: 1 }) : [];
    for (const id of b) {
      const p = findPerm(s, Number(id));
      if (p) p.counters.charge = (p.counters.charge ?? 0) + 2;
    }
  });
  T("Data, Exploring Humanity", ["secondDraw"], "Data#seek", (ctx, item) => H().discover(ctx, item.controller, 4, "disc"));
  T("Kes, Evolving Telepath", ["endStep"], "Kes#t", (ctx, item) => {
    const s = ctx.s;
    const p = findPerm(s, item.iid);
    if (!p) return;
    p.counters.time = (p.counters.time ?? 0) + 1;
    H().draw(s, item.controller, p.counters.time);
    if (p.counters.time >= 9) H().move(s, p.iid, "graveyard", { cause: "sacrifice" });
  });
  T("Tribble Cluster", ["dies"], "Tribble Cluster#t", (ctx, item) => {
    const s = ctx.s;
    const n = Math.max(1, lastPower(s, item.iid));
    const card = H().makeTokenDef(s, { e: "token", n, name: "Tribble", power: 1, toughness: 1, types: "Creature \u2014 Tribble", colors: ["W"], keywords: [] }, 0);
    for (const iid of H().createToken(s, item.controller, card, n)) findPerm(s, iid)?.mods.push({ power: 0, toughness: 0, keywords: ["cantblock"], until: "perm" });
  });
  T("Stratagem Emulator", ["dies"], "Stratagem Emulator#t", (ctx, item) => {
    const s = ctx.s;
    const n = Math.max(0, lastPower(s, item.iid));
    const card = H().makeTokenDef(s, { e: "token", n, name: "Borg", power: 1, toughness: 1, types: "Artifact Creature \u2014 Borg", colors: [], keywords: [], artifact: true }, 0);
    H().createToken(s, item.controller, card, n);
  });
  T("Satyr Wayfinder", ["etb"], "Satyr Wayfinder#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const top = s.players[me].library.slice(0, 4);
    const ls = top.filter((o) => rulesOf(s, o).types.includes("land"));
    const pick = ls.length ? ctx.ask(me, { key: "sw", prompt: "Satyr Wayfinder: you may put a land into your hand (the rest go to your graveyard)", options: ls.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: 1 })), min: 0, max: 1, cards: true }) : [];
    for (const o of top) H().move(s, o.iid, pick.includes(String(o.iid)) ? "hand" : "graveyard");
  });
  T("Malfunctioning Holodeck", ["etb"], "Holodeck#t", (ctx, item) => {
    const s = ctx.s;
    const opts = s.battlefield.filter((p) => p.controller !== item.controller && !isType(s, p, "land"));
    if (!opts.length) return;
    const [pick] = ctx.ask(item.controller, { key: "mh", prompt: "Exile a nonland permanent an opponent controls until the Holodeck leaves", options: opts.map((p) => ({ id: String(p.iid), label: permName(s, p), card: p.card, iid: p.iid, score: def(s, p.card).cmc })), min: 1, max: 1, cards: true });
    H().move(s, Number(pick), "exile");
    const h = findPerm(s, item.iid);
    if (h) h.counters["holding:" + pick] = 1;
  });
  function lastPower(s, iid) {
    return s.lastPower?.[iid] ?? 1;
  }
  var castFreeHook = () => {
  };
  function setCastFree(f) {
    castFreeHook = f;
  }
  T("Howling Mine", ["eachDraw"], "Howling Mine#t", (ctx, item) => {
    const p = findPerm(ctx.s, item.iid);
    if (p && !p.tapped) H().draw(ctx.s, ctx.s.active, 1);
  });
  T("Fevered Visions", ["eachEndStep"], "Fevered Visions#t", (ctx, item) => {
    const s = ctx.s;
    const who = s.active;
    H().draw(s, who, 1);
    if (who !== item.controller && s.players[who].hand.length >= 4) H().damage(s, { card: item.card, controller: item.controller, iid: item.iid }, { kind: "player", id: who }, 2);
  });
  T("Transwarp Hub", ["etb"], "Transwarp Hub#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const top = s.players[me].library.slice(0, 5);
    for (const o of top) H().move(s, o.iid, "graveyard");
    const arts = top.filter((o) => isType(s, o, "artifact"));
    if (!arts.length) return;
    const picks = ctx.ask(me, { key: "th", prompt: "Transwarp Hub: put up to two artifact cards into your hand", options: arts.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: def(s, o.card).cmc })), min: 0, max: Math.min(2, arts.length), cards: true });
    for (const id of picks) H().move(s, Number(id), "hand");
  });
  T("The Sword of Kahless", ["attacks"], "Sword of Kahless#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const top = s.players[me].library.slice(0, 5);
    const ok = top.filter((o) => rulesOf(s, o).types.includes("creature") && rulesOf(s, o).subtypes.some((t) => t === "Klingon" || t === "Warrior"));
    const pick = ok.length ? ctx.ask(me, { key: "sk", prompt: "Sword of Kahless: you may put a Klingon or Warrior creature onto the battlefield", options: ok.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: def(s, o.card).cmc })), min: 0, max: 1, cards: true }) : [];
    for (const id of pick) H().move(s, Number(id), "battlefield", { controller: me });
    for (const o of top) if (!pick.includes(String(o.iid))) H().move(s, o.iid, "libraryBottom");
  });
  T("Koloth, Tribble Hunter", ["endStep"], "Koloth#t", (ctx) => {
    const s = ctx.s;
    const card = H().makeTokenDef(s, { e: "token", n: 2, name: "Tribble", power: 1, toughness: 1, types: "Creature \u2014 Tribble", colors: ["W"], keywords: [] }, 0);
    s.players.forEach((_, i) => {
      for (const iid of H().createToken(s, i, card, 2)) findPerm(s, iid)?.mods.push({ power: 0, toughness: 0, keywords: ["cantblock"], until: "perm" });
    });
  });
  T("Julian Bashir, Frontier Doctor", ["attacks"], "Bashir#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const p = findPerm(s, item.iid);
    const x = p ? pt(s, p)[0] : 0;
    const gy = s.players[me].graveyard.filter((o) => rulesOf(s, o).types.includes("creature") && def(s, o.card).cmc <= x);
    if (!gy.length) return;
    const [pick] = ctx.ask(me, { key: "jb", prompt: `Bashir: return a creature card with mana value ${x} or less to the battlefield`, options: gy.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: def(s, o.card).cmc })), min: 1, max: 1, cards: true });
    H().move(s, Number(pick), "battlefield", { controller: me });
  });
  T("Grilka, Widowed Warrior", ["etb"], "Grilka#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const opts = s.battlefield.filter((p2) => p2.controller !== me && isCreature(s, p2));
    if (!opts.length) return;
    const [pick] = ctx.ask(me, { key: "gk", prompt: "Grilka: gain control of a creature until end of turn (it gets haste and trample)", options: opts.map((p2) => ({ id: String(p2.iid), label: permName(s, p2), card: p2.card, iid: p2.iid, score: pt(s, p2)[0] })), min: 1, max: 1, cards: true });
    const p = findPerm(s, Number(pick));
    const was = p.controller;
    p.controller = me;
    p.tapped = false;
    p.mods.push({ power: 0, toughness: 0, keywords: ["haste", "trample"], until: "eot" });
    H().later(s, { at: "cleanup", kind: "control", iid: p.iid, owner: was });
    log(s, `${s.players[me].name} gains control of ${permName(s, p)} until end of turn.`);
  });
  var castFreeNow = (s, p, iid) => castFreeHook(s, p, iid);

  // src/engine/effects.ts
  var NeedChoice = class {
    constructor(player, question) {
      this.player = player;
      this.question = question;
    }
    player;
    question;
  };
  var Illegal = class extends Error {
  };
  function makeCtx(s, task) {
    return {
      s,
      task,
      ask(player, q) {
        const rec = task.answers[q.key];
        if (rec) return rec;
        if (q.options.length === 0) return [];
        if (q.min === q.options.length && q.max === q.options.length && !q.ordered) return q.options.map((o) => o.id);
        if (q.options.length === 1 && q.min === 1) return [q.options[0].id];
        throw new NeedChoice(player, q);
      }
    };
  }
  var hooks;
  function setHooks(h) {
    hooks = h;
  }
  var H = () => hooks;
  function shielded(s, p, chooser, srcCard) {
    const kws = rulesOf(s, p).keywords.concat(p.mods.flatMap((m) => m.keywords ?? []));
    const all = new Set(kws);
    for (const q of s.battlefield) if (q.attachedTo === p.iid) for (const st of rulesOf(s, q).statics) st.keywords.forEach((k) => all.add(k));
    if (all.has("shroud")) return true;
    if (all.has("hexproof") && p.controller !== chooser) return true;
    const cols = def(s, srcCard).colors;
    const names = { W: "white", U: "blue", B: "black", R: "red", G: "green" };
    for (const k of all) if (k.startsWith("protection from") && cols.some((c) => k.includes(names[c]))) return true;
    return false;
  }
  function targetOptions(s, spec, chooser, src) {
    const out = [];
    const permOk = (p, f) => (!f || matches(s, f, p, chooser, p.controller, src.iid, p)) && !shielded(s, p, chooser, src.card);
    const addPerm = (p) => {
      const [pw, t] = pt(s, p);
      out.push({ id: `p:${p.iid}`, label: `${permName(s, p)}${isCreature(s, p) ? ` ${pw}/${t}` : ""} (${s.players[p.controller].name})`, card: p.card, iid: p.iid, score: (p.controller === chooser ? -1 : 1) * (def(s, p.card).cmc + 1) });
    };
    const addPlayer = (i) => out.push({ id: `pl:${i}`, label: s.players[i].name, score: i === chooser ? -5 : 5 });
    if (spec.kind === "perm") for (const p of s.battlefield) permOk(p, spec.filter) && addPerm(p);
    if (spec.kind === "any" || spec.kind === "creatureOrPlayer") {
      for (const p of s.battlefield) if ((isCreature(s, p) || spec.kind === "any" && rulesOf(s, p).types.includes("planeswalker")) && permOk(p, null)) addPerm(p);
      s.players.forEach((_, i) => addPlayer(i));
    }
    if (spec.kind === "player") s.players.forEach((_, i) => (!spec.opponent || i !== chooser) && addPlayer(i));
    if (spec.kind === "stackAny")
      for (const it of s.stack) out.push({ id: `s:${it.sid}`, label: `${cardName(s, it.card)}${it.kind === "spell" ? "" : " ability"} (${s.players[it.controller].name})`, card: it.card, score: it.controller === chooser ? -5 : 3 });
    if (spec.kind === "spell")
      for (const it of s.stack) {
        if (it.kind !== "spell") continue;
        if (matches(s, spec.filter, { card: it.card }, chooser, it.controller)) out.push({ id: `s:${it.sid}`, label: `${cardName(s, it.card)} (${s.players[it.controller].name}'s spell)`, card: it.card, score: it.controller === chooser ? -5 : def(s, it.card).cmc });
      }
    return out;
  }
  var parseTargetId = (id) => {
    const [k, v] = id.split(":");
    return { kind: k === "p" ? "perm" : k === "pl" ? "player" : "stack", id: Number(v) };
  };
  function chooseTargets(ctx, compiled, chooser, src, keyPrefix) {
    const out = [];
    for (let i = 0; i < compiled.targets.length; i++) {
      const spec = compiled.targets[i];
      const min = spec.min ?? 1;
      const max = spec.max ?? 1;
      const opts = targetOptions(ctx.s, spec, chooser, src).filter((o) => !out.some((t) => `${t.kind === "perm" ? "p" : t.kind === "player" ? "pl" : "s"}:${t.id}` === o.id));
      if (opts.length < Math.max(1, min)) {
        if (min === 0) continue;
        return null;
      }
      const picks = ctx.ask(chooser, { key: `${keyPrefix}t${i}`, prompt: `${cardName(ctx.s, src.card)}: choose ${max > 1 ? min === 0 ? `up to ${max} ` : `${min === max ? max : `${min}\u2013${max}`} ` : min === 0 ? "up to one " : ""}${describeSpec(spec)}`, options: opts, min: Math.min(min, opts.length), max: Math.min(max, opts.length) });
      for (const pick of picks) {
        const t = { ...parseTargetId(pick), spec: i };
        if (t.kind === "perm") t.ctl = findPerm(ctx.s, t.id)?.controller;
        out.push(t);
      }
    }
    return out;
  }
  function describeSpec(spec) {
    if (spec.kind === "any") return "any target";
    if (spec.kind === "player") return spec.opponent ? "target opponent" : "target player";
    if (spec.kind === "creatureOrPlayer") return "target creature or player";
    if (spec.kind === "spell") return "target spell";
    if (spec.kind === "stackAny") return "target spell or ability";
    if (spec.kind === "gyCard") return "target card in a graveyard";
    const f = spec.filter;
    return `target ${f.not.map((x) => "non" + x + " ").join("")}${f.types.join(" or ") || "permanent"}${f.controller === "opp" ? " an opponent controls" : f.controller === "you" ? " you control" : ""}`;
  }
  function stillLegal(s, spec, t, controller, src) {
    if (t.kind === "player") return !s.players[t.id].lost;
    if (t.kind === "stack") return s.stack.some((it) => it.sid === t.id);
    const p = findPerm(s, t.id);
    if (!p) return false;
    if (spec.kind === "perm") return matches(s, spec.filter, p, controller, p.controller, src.iid, p) && !shielded(s, p, controller, src.card);
    return true;
  }
  var N = (n, x) => n === "x" ? x : n;
  function runCompiled(ctx, item, compiled, keyPrefix = "e") {
    const s = ctx.s;
    const me = item.controller;
    let x = item.x ?? 0;
    if (compiled.count === "attackers") x = s.combat?.attackers.length ?? 0;
    else if (compiled.count === "charge") x = findPerm(s, item.iid)?.counters.charge ?? 0;
    else if (compiled.count === "lands") x = new Set(s.battlefield.filter((p) => p.controller === me && rulesOf(s, p).types.includes("land")).map((p) => cardName(s, p.card))).size;
    const src = { card: item.card, controller: me, iid: item.iid };
    const specOf = (t, j) => t.spec ?? j;
    const legalT = item.targets.map((t, j) => {
      const spec = compiled.targets[specOf(t, j)];
      return !!spec && stillLegal(s, spec, t, me, src);
    });
    const legal = compiled.targets.map((_, i) => item.targets.some((t, j) => specOf(t, j) === i && legalT[j]));
    const tall = (i) => item.targets.filter((t, j) => specOf(t, j) === i && legalT[j]);
    const tperms = (i) => tall(i).flatMap((t) => t.kind === "perm" ? [findPerm(s, t.id)].filter((p) => !!p) : []);
    if (compiled.ifKicked && !findPerm(s, item.iid)?.kicked) return;
    if (compiled.optional) {
      const [yn] = ctx.ask(me, { key: `${keyPrefix}opt`, prompt: `${cardName(s, item.card)}: use this ability?`, options: [{ id: "yes", label: "Yes", score: 1 }, { id: "no", label: "No" }], min: 1, max: 1 });
      if (yn === "no") return;
    }
    const tgt = (i) => tall(i)[0] ?? null;
    const tperm = (i) => tperms(i)[0];
    const targetPlayer = () => {
      const i = compiled.targets.findIndex((sp) => sp.kind === "player");
      const t = i >= 0 ? tgt(i) : null;
      return t ? t.id : null;
    };
    const lastController = compiled.targets.length ? tperms(compiled.targets.length - 1)[0]?.controller ?? lastCtl(item, s) : void 0;
    compiled.effects.forEach((e, ei) => {
      const k = `${keyPrefix}${ei}`;
      switch (e.e) {
        case "draw": {
          const n = N(e.n, x);
          if (e.who === "you") H().draw(s, me, n);
          else if (e.who === "each") s.players.forEach((_, i) => H().draw(s, i, n));
          else {
            const p = targetPlayer();
            if (p !== null) H().draw(s, p, n);
          }
          break;
        }
        case "life": {
          const n = N(e.n, x);
          if (e.who === "you") H().gainLife(s, me, n);
          else if (e.who === "each") s.players.forEach((_, i) => H().gainLife(s, i, n));
          else if (e.who === "eachOpp") H().gainLife(s, opp(me), n);
          break;
        }
        case "loseLife": {
          const n = N(e.n, x);
          const lose = (p) => {
            s.players[p].life -= n;
            log(s, `${s.players[p].name} loses ${n} life.`);
          };
          if (e.who === "you") lose(me);
          else if (e.who === "eachOpp") lose(opp(me));
          else if (e.who === "each") s.players.forEach((_, i) => lose(i));
          else {
            const p = targetPlayer();
            if (p !== null) lose(p);
          }
          break;
        }
        case "destroy":
          for (const p of tperms(e.t)) H().destroy(s, p.iid);
          break;
        case "exile":
          for (const p of tperms(e.t)) H().move(s, p.iid, "exile");
          break;
        case "bounce":
          for (const p of tperms(e.t)) H().move(s, p.iid, "hand");
          break;
        case "tuck":
          for (const p of tperms(e.t)) {
            let where = e.where;
            if (where === "either") {
              const mine2 = p.owner === me;
              where = ctx.ask(p.owner, { key: k + "tk" + p.iid, prompt: `Put ${permName(s, p)} on the top or the bottom of your library?`, options: [{ id: "top", label: "Top", score: mine2 ? 1 : 0 }, { id: "bottom", label: "Bottom", score: mine2 ? 0 : 1 }], min: 1, max: 1 })[0];
            }
            H().move(s, p.iid, where === "top" ? "library" : "libraryBottom");
          }
          break;
        case "tap":
          for (const p of tperms(e.t)) H().setTapped(s, p, !e.untap);
          break;
        case "tapAll":
          for (const p of s.battlefield.filter((p2) => matches(s, e.filter, p2, me, p2.controller, item.iid, p2))) H().setTapped(s, p, !e.untap);
          break;
        case "tokenForController": {
          const p = tperm(e.t) ?? (item.targets[0] ? void 0 : void 0);
          const who = p?.controller ?? lastController;
          if (who === void 0) break;
          const card = H().makeTokenDef(s, { e: "token", n: 1, name: e.name, power: e.power, toughness: e.toughness, types: e.types, colors: e.colors, keywords: [] }, 0);
          H().createToken(s, who, card, 1);
          break;
        }
        case "investigate": {
          const card = H().makeTokenDef(s, { e: "token", n: e.n, name: "Clue", types: "Artifact \u2014 Clue", colors: [], keywords: [], artifact: true }, 0);
          H().createToken(s, me, card, e.n);
          break;
        }
        case "explore": {
          const p = findPerm(s, item.iid);
          const top = s.players[me].library[0];
          if (!top) break;
          log(s, `${p ? permName(s, p) : "It"} explores: ${cardName(s, top.card)}.`);
          if (rulesOf(s, top).types.includes("land")) H().move(s, top.iid, "hand");
          else {
            if (p) p.counters["+1/+1"] = (p.counters["+1/+1"] ?? 0) + 1;
            const [c] = ctx.ask(me, { key: k, prompt: `Explore: keep ${cardName(s, top.card)} on top, or put it into your graveyard?`, options: [{ id: "keep", label: "Keep on top", card: top.card, score: def(s, top.card).cmc <= 4 ? 1 : 0 }, { id: "gy", label: "Graveyard", score: 0.5 }], min: 1, max: 1 });
            if (c === "gy") H().move(s, top.iid, "graveyard");
          }
          break;
        }
        case "discover":
          H().discover(ctx, me, e.n, k);
          break;
        case "copyToken": {
          const p = e.t === "self" ? findPerm(s, item.iid) : tperm(e.t);
          if (!p) break;
          const [made] = H().createToken(s, me, p.card, 1);
          const t = findPerm(s, made);
          if (t && e.haste) t.mods.push({ power: 0, toughness: 0, keywords: ["haste"], until: "perm" });
          if (t && e.exileAtEnd) H().later(s, { at: "end", kind: "exile", iid: made });
          break;
        }
        case "flicker":
          for (const p of tperms(e.t)) {
            const owner = p.owner;
            const iid = p.iid;
            H().move(s, iid, "exile");
            if (e.later) H().later(s, { at: "end", kind: "return", iid, owner });
            else H().move(s, iid, "battlefield", { controller: owner });
          }
          break;
        case "addMana": {
          const cols = s.players[me].identity.length ? s.players[me].identity : ["W", "U", "B", "R", "G"];
          const [c] = ctx.ask(me, { key: k, prompt: "Add one mana of which colour?", options: cols.map((m) => ({ id: m, label: m, score: 1 })), min: 1, max: 1 });
          s.players[me].pool[c] += e.n;
          if (s.players[me].floating === void 0 || s.players[me].floating < e.n) s.players[me].floating = (s.players[me].floating ?? 0) + e.n;
          break;
        }
        case "gainControl":
          for (const p of tperms(e.t)) {
            const was = p.controller;
            p.controller = me;
            p.sick = true;
            if (e.untap) p.tapped = false;
            if (e.eot) H().later(s, { at: "cleanup", kind: "control", iid: p.iid, owner: was });
            log(s, `${s.players[me].name} gains control of ${permName(s, p)}${e.eot ? " until end of turn" : ""}.`);
          }
          break;
        case "cantBlock": {
          const ps = e.t === "self" ? [findPerm(s, item.iid)].filter((p) => !!p) : tperms(e.t);
          for (const p of ps) p.mods.push({ power: 0, toughness: 0, keywords: ["cantblock"], until: "eot" });
          break;
        }
        case "endCombat":
          if (s.combat) {
            s.combat.attackers = [];
            s.combat.blocks = [];
            log(s, "Combat ends.");
          }
          break;
        case "protectionChoice": {
          const names = ["white", "blue", "black", "red", "green"];
          const [c] = ctx.ask(me, { key: k, prompt: "Protection from which colour?", options: names.map((n) => ({ id: n, label: n, score: s.battlefield.some((p) => p.controller !== me && def(s, p.card).colors.includes({ white: "W", blue: "U", black: "B", red: "R", green: "G" }[n])) ? 1 : 0 })), min: 1, max: 1 });
          for (const p of s.battlefield.filter((p2) => matches(s, e.filter, p2, me, p2.controller, item.iid, p2))) p.mods.push({ power: 0, toughness: 0, keywords: [`protection from ${c}`], until: "eot" });
          break;
        }
        case "goad": {
          const ps = e.t === "allOpp" ? s.battlefield.filter((p) => p.controller !== me && isCreature(s, p)) : tperms(e.t);
          for (const p of ps) p.mods.push({ power: 0, toughness: 0, keywords: ["goaded"], until: "turn", expires: s.turn + 2 });
          if (ps.length) log(s, `${ps.map((p) => permName(s, p)).join(", ")} ${ps.length > 1 ? "are" : "is"} goaded.`);
          break;
        }
        case "assimilate":
          for (const p of tperms(e.t)) {
            p.controller = me;
            p.sick = true;
            p.counters["+1/+1"] = (p.counters["+1/+1"] ?? 0) + 1;
            p.addTypes = ["artifact", "creature"];
            log(s, `${s.players[me].name} assimilates ${permName(s, p)}.`);
          }
          break;
        case "fight": {
          const a = e.a === "self" ? findPerm(s, item.iid) : tperm(e.a);
          const b = tperm(e.b);
          if (!a || !b) break;
          const [ap] = pt(s, a);
          const [bp] = pt(s, b);
          H().damage(s, { card: a.card, controller: a.controller, iid: a.iid }, { kind: "perm", id: b.iid }, ap);
          H().damage(s, { card: b.card, controller: b.controller, iid: b.iid }, { kind: "perm", id: a.iid }, bp);
          break;
        }
        case "destroyAll":
        case "exileAll":
        case "bounceAll": {
          const victims = s.battlefield.filter((p) => matches(s, e.filter, p, me, p.controller, item.iid, p)).map((p) => p.iid);
          for (const v of victims) {
            if (e.e === "destroyAll") H().destroy(s, v);
            else H().move(s, v, e.e === "exileAll" ? "exile" : "hand");
          }
          break;
        }
        case "damage":
          for (const t of tall(e.t)) H().damage(s, src, t, N(e.n, x));
          break;
        case "damageEach": {
          const n = N(e.n, x);
          if (e.filter) for (const p of s.battlefield.filter((p2) => matches(s, e.filter, p2, me, p2.controller, item.iid, p2))) H().damage(s, src, { kind: "perm", id: p.iid }, n);
          if (e.players) s.players.forEach((_, i) => (e.players === "each" || i !== me) && H().damage(s, src, { kind: "player", id: i }, n));
          break;
        }
        case "counter": {
          const t = tgt(e.t);
          if (t && t.kind === "stack") {
            const it = s.stack.find((z) => z.sid === t.id);
            if (it && it.kind !== "spell") {
              s.stack = s.stack.filter((z) => z.sid !== t.id);
              log(s, `${cardName(s, it.card)}'s ability is countered.`);
            } else if (it && rulesOf(s, { card: it.card }).canBeCountered) {
              if (it.obj && !it.copy) H().move(s, it.obj.iid, "graveyard");
              else s.stack = s.stack.filter((z) => z.sid !== t.id);
              log(s, `${cardName(s, it.card)} is countered.`);
            }
          }
          break;
        }
        case "token": {
          const card = H().makeTokenDef(s, e, x);
          const made = H().createToken(s, me, card, N(e.n, x), e.tapped);
          if (e.attacking && s.combat) for (const iid of made) s.combat.attackers.push({ iid, defender: opp(me) });
          break;
        }
        case "counters": {
          const n = N(e.n, x);
          const put = (p) => {
            p.counters[e.kind] = (p.counters[e.kind] ?? 0) + n;
          };
          if (e.t === "self") {
            const p = findPerm(s, item.iid);
            if (p) put(p);
          } else if (e.t === "each") s.battlefield.filter((p) => matches(s, e.filter, p, me, p.controller, item.iid, p)).forEach(put);
          else tperms(e.t).forEach(put);
          break;
        }
        case "pump": {
          const ps = e.t === "self" ? [findPerm(s, item.iid)].filter((p) => !!p) : tperms(e.t);
          for (const p of ps) p.mods.push({ power: e.p, toughness: e.tough, keywords: e.keywords, until: "eot" });
          break;
        }
        case "pumpAll": {
          for (const p of s.battlefield.filter((p2) => isCreature(s, p2) && matches(s, e.filter, p2, me, p2.controller, item.iid, p2))) p.mods.push({ power: e.p, toughness: e.tough, keywords: e.keywords, until: "eot" });
          break;
        }
        case "search":
          search(ctx, me, e, k);
          break;
        case "scry":
        case "surveil":
          scry(ctx, me, e.n, e.e === "surveil", k);
          break;
        case "mill": {
          const who = e.who === "you" ? [me] : e.who === "eachOpp" ? [opp(me)] : [targetPlayer() ?? opp(me)];
          for (const p of who) mill(s, p, e.n);
          break;
        }
        case "discard": {
          const who = e.who === "you" ? me : e.who === "eachOpp" ? opp(me) : targetPlayer() ?? opp(me);
          discard(ctx, who, e.n, k);
          break;
        }
        case "sacrifice": {
          const who = e.who === "you" ? me : e.who === "eachOpp" ? opp(me) : targetPlayer() ?? opp(me);
          const opts = s.battlefield.filter((p) => p.controller === who && matches(s, e.filter, p, who, p.controller, void 0, p));
          if (opts.length) {
            const [pick] = ctx.ask(who, { key: k, prompt: `Sacrifice ${e.filter.types.join(" or ") || "a permanent"}`, options: opts.map((p) => ({ id: String(p.iid), label: permName(s, p), card: p.card, iid: p.iid, score: -def(s, p.card).cmc })), min: 1, max: 1 });
            H().move(s, Number(pick), "graveyard", { cause: "sacrifice" });
          }
          break;
        }
        case "returnFromGy": {
          const gy = s.players[me].graveyard.filter((o) => matches(s, e.filter, o, me, me));
          if (gy.length) {
            const [pick] = ctx.ask(me, { key: k, prompt: "Choose a card in your graveyard", options: gy.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: def(s, o.card).cmc })), min: 1, max: 1, cards: true });
            H().move(s, Number(pick), e.dest);
          }
          break;
        }
        case "shuffle":
          H().shuffle(s, me);
          break;
        case "putLand": {
          const lands2 = s.players[me].hand.filter((o) => rulesOf(s, o).types.includes("land"));
          if (lands2.length) {
            const picks = ctx.ask(me, { key: k, prompt: "You may put a land from your hand onto the battlefield", options: lands2.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: 1 })), min: 0, max: 1, cards: true });
            for (const id of picks) H().move(s, Number(id), "battlefield");
          }
          break;
        }
        case "mana":
          break;
        case "named":
          NAMED[e.name]?.run(ctx, item, legal);
          break;
      }
    });
  }
  function lastCtl(item, s) {
    const t = item.targets.find((x) => x.kind === "perm");
    return t?.ctl ?? (t ? findPerm(s, t.id)?.controller : void 0);
  }
  function search(ctx, me, e, key) {
    const s = ctx.s;
    const lib = s.players[me].library;
    const ok = lib.filter((o) => {
      if (e.names) return e.names.some((n) => rulesOf(s, o).subtypes.some((st) => st.toLowerCase() === n) || cardName(s, o.card).toLowerCase() === n);
      return matches(s, e.filter, o, me, me);
    });
    const seen = /* @__PURE__ */ new Map();
    const opts = [];
    for (const o of ok) {
      if ((seen.get(o.card) ?? 0) >= e.count) continue;
      seen.set(o.card, (seen.get(o.card) ?? 0) + 1);
      opts.push({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: 1 });
    }
    const picks = opts.length ? ctx.ask(me, { key, prompt: `Search your library (up to ${e.count})`, options: opts, min: 0, max: Math.min(e.count, opts.length), cards: true }) : [];
    const names = picks.map((id) => cardName(s, lib.find((o) => o.iid === Number(id)).card));
    for (const id of picks) {
      if (e.dest === "battlefield") H().move(s, Number(id), "battlefield", { tapped: e.tapped });
      else if (e.dest === "hand") H().move(s, Number(id), "hand");
    }
    H().shuffle(s, me);
    for (const id of picks) if (e.dest === "top") H().move(s, Number(id), "library");
    if (picks.length) log(s, `${s.players[me].name} searches their library${e.dest === "hand" ? ` and puts ${picks.length} card${picks.length > 1 ? "s" : ""} into their hand` : ` and puts ${names.join(", ")} ${e.dest === "top" ? "on top" : "onto the battlefield"}`}.`);
    else log(s, `${s.players[me].name} searches their library.`);
  }
  function scry(ctx, me, n, surveil, key) {
    const s = ctx.s;
    const lib = s.players[me].library;
    const top = lib.slice(0, n);
    if (!top.length) return;
    const keep = ctx.ask(me, {
      key,
      prompt: surveil ? `Surveil ${n}: choose cards to keep on top (the rest go to your graveyard)` : `Scry ${n}: choose cards to keep on top, in order (the rest go to the bottom)`,
      options: top.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: rulesOf(s, o).types.includes("land") ? 0 : 1 })),
      min: 0,
      max: top.length,
      cards: true,
      ordered: true
    });
    const kept = keep.map((id) => top.find((o) => o.iid === Number(id))).filter(Boolean);
    const rest = top.filter((o) => !kept.includes(o));
    lib.splice(0, top.length, ...kept);
    if (surveil) for (const o of rest) H().move(s, o.iid, "graveyard");
    else lib.push(...rest);
    log(s, `${s.players[me].name} ${surveil ? "surveils" : "scries"} ${n}${rest.length ? ` (${rest.length} ${surveil ? "to the graveyard" : "to the bottom"})` : ""}.`);
  }
  function mill(s, p, n) {
    const top = s.players[p].library.slice(0, n);
    for (const o of top) H().move(s, o.iid, "graveyard");
    if (top.length) log(s, `${s.players[p].name} mills ${top.length}.`);
  }
  function discard(ctx, p, n, key) {
    const s = ctx.s;
    const hand = s.players[p].hand;
    if (!hand.length) return;
    const k = Math.min(n, hand.length);
    const picks = ctx.ask(p, { key, prompt: `Discard ${k} card${k > 1 ? "s" : ""}`, options: hand.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: -def(s, o.card).cmc })), min: k, max: k, cards: true });
    for (const id of picks) H().move(s, Number(id), "graveyard");
    log(s, `${s.players[p].name} discards ${picks.length}.`);
  }

  // src/engine/mana.ts
  var emptyCost = () => ({ generic: 0, sym: {}, hybrid: [], x: 0, phyrexian: [] });
  function parseCost(s) {
    const c = emptyCost();
    if (!s) return c;
    for (const m of s.matchAll(/\{([^}]+)\}/g)) {
      const t = m[1].toUpperCase();
      if (/^\d+$/.test(t)) c.generic += Number(t);
      else if (t === "X") c.x++;
      else if (["W", "U", "B", "R", "G", "C"].includes(t)) c.sym[t] = (c.sym[t] ?? 0) + 1;
      else if (t.includes("/P")) {
        const col = t.replace("/P", "").split("/")[0];
        c.phyrexian.push(col);
      } else if (t.includes("/")) c.hybrid.push(t.split("/"));
      else if (t === "S") c.generic++;
    }
    return c;
  }
  function addCost(a, generic) {
    return { ...a, sym: { ...a.sym }, hybrid: a.hybrid.slice(), phyrexian: a.phyrexian.slice(), generic: Math.max(0, a.generic + generic) };
  }
  function costText(c, x) {
    let s = "";
    for (let i = 0; i < c.x; i++) s += x === void 0 ? "{X}" : "";
    const g = c.generic + (x ?? 0) * c.x;
    if (g > 0 || s === "" && Object.keys(c.sym).length === 0 && c.hybrid.length === 0 && c.phyrexian.length === 0) s += `{${g}}`;
    for (const h of c.hybrid) s += `{${h.join("/")}}`;
    for (const p of c.phyrexian) s += `{${p}}`;
    for (const m of ["W", "U", "B", "R", "G", "C"]) for (let i = 0; i < (c.sym[m] ?? 0); i++) s += `{${m}}`;
    return s;
  }
  function units(c, x) {
    const u = [];
    for (const m of ["W", "U", "B", "R", "G", "C"]) for (let i = 0; i < (c.sym[m] ?? 0); i++) u.push([m]);
    for (const p of c.phyrexian) u.push([p]);
    for (const h of c.hybrid) u.push(h.some((t) => /^\d+$/.test(t)) ? ["*"] : h);
    for (let i = 0; i < c.generic + c.x * x; i++) u.push(["*"]);
    return u;
  }
  function solvePayment(cost, x, pool, sources) {
    const need = units(cost, x);
    need.sort((a, b) => (a[0] === "*" ? 1 : 0) - (b[0] === "*" ? 1 : 0) || a.length - b.length);
    const left = { ...pool };
    const fromPool = {};
    const rest = [];
    for (const u of need) {
      let paid = false;
      const order = u[0] === "*" ? ["C", "W", "U", "B", "R", "G"] : u;
      for (const m of order) {
        if ((left[m] ?? 0) > 0) {
          left[m]--;
          fromPool[m] = (fromPool[m] ?? 0) + 1;
          paid = true;
          break;
        }
      }
      if (!paid) rest.push(u);
    }
    if (rest.length === 0) return { used: [], fromPool };
    const srcs = sources.slice().sort((a, b) => a.weight - b.weight || a.options.length - b.options.length);
    const total = srcs.reduce((n, s) => n + s.amount, 0);
    if (total < rest.length) return null;
    const coloured = rest.filter((u) => u[0] !== "*");
    const generic = rest.length - coloured.length;
    const chosen = [];
    const usedKeys = /* @__PURE__ */ new Set();
    let steps = 0;
    const tryColoured = (i, spare) => {
      if (++steps > 2e4) return false;
      if (i === coloured.length) {
        let g = generic - Math.min(generic, spare.length);
        const extra = [];
        for (const s of srcs) {
          if (g <= 0) break;
          if (usedKeys.has(s.key)) continue;
          const pick = s.options.includes("C") ? "C" : s.options[0];
          extra.push({ key: s.key, mana: Array(s.amount).fill(pick) });
          g -= s.amount;
        }
        if (g > 0) return false;
        chosen.push(...extra);
        return true;
      }
      const u = coloured[i];
      const si = spare.findIndex((m) => u.includes(m));
      if (si >= 0) {
        const sp = spare.slice();
        sp.splice(si, 1);
        if (tryColoured(i + 1, sp)) return true;
      }
      for (const s of srcs) {
        if (usedKeys.has(s.key)) continue;
        const col = u.find((m) => s.options.includes(m));
        if (!col) continue;
        usedKeys.add(s.key);
        const made = s.sameColor || s.amount === 1 ? Array(s.amount).fill(col) : [col, ...Array(s.amount - 1).fill(s.options.includes("C") ? "C" : s.options[0])];
        chosen.push({ key: s.key, mana: made });
        if (tryColoured(i + 1, [...spare, ...made.slice(1)])) return true;
        chosen.pop();
        usedKeys.delete(s.key);
      }
      return false;
    };
    if (!tryColoured(0, [])) return null;
    return { used: chosen, fromPool };
  }

  // src/engine/rng.ts
  function next(seed) {
    let t = seed + 1831565813 | 0;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    const out = ((t ^ t >>> 14) >>> 0) / 4294967296;
    return [out, seed + 1831565813 | 0];
  }
  var Rng = class {
    constructor(seed) {
      this.seed = seed;
    }
    seed;
    float() {
      const [v, s] = next(this.seed);
      this.seed = s;
      return v;
    }
    int(n) {
      return Math.floor(this.float() * n);
    }
    roll(sides) {
      return this.int(sides) + 1;
    }
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = this.int(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
  };

  // src/engine/scripts.ts
  var named = (name, targets = []) => ({ targets, effects: [{ e: "named", name }] });
  var reg = (name, run, targets = []) => NAMED[name] = { spell: named(name, targets), run };
  function trig(card, event, name, run, extra = {}) {
    reg(name, run);
    patchRules(card, (r) => r.triggers.push({ index: r.triggers.length, event, text: extra.text ?? name.replace(/#.*/, ""), effectText: "", compiled: named(name), ...extra }));
  }
  function act(card, re, name, run) {
    reg(name, run);
    patchRules(card, (r) => {
      for (const a of r.activated) if (re.test(a.text)) a.compiled = named(name);
    });
  }
  function spell(card, run) {
    reg(card, run);
  }
  function done(card) {
    patchRules(card, (r) => {
      if (allCompiled(r)) r.fullyAutomated = true;
    });
  }
  var mine = (s, me, f = () => true) => s.battlefield.filter((p) => p.controller === me && f(p));
  var landNames = (s, me) => new Set(mine(s, me, (p) => isType(s, p, "land")).map((p) => cardName(s, p.card))).size;
  var isKW = (s, o) => rulesOf(s, o).subtypes.some((t) => t === "Klingon" || t === "Warrior");
  var addCounters = (p, kind, n) => p.counters[kind] = (p.counters[kind] ?? 0) + n;
  var pickPerm = (ctx, me, key, prompt, ps, min = 1, max = 1, score = () => 1) => ps.length ? ctx.ask(me, { key, prompt, options: ps.map((p) => ({ id: String(p.iid), label: permName(ctx.s, p), card: p.card, iid: p.iid, score: score(p) })), min: Math.min(min, ps.length), max: Math.min(max, ps.length), cards: true }).map((id) => findPerm(ctx.s, Number(id))) : [];
  var pickCard = (ctx, me, key, prompt, cs, min = 1, max = 1) => cs.length ? ctx.ask(me, { key, prompt, options: cs.map((o) => ({ id: String(o.iid), label: cardName(ctx.s, o.card), card: o.card, iid: o.iid, score: def(ctx.s, o.card).cmc })), min: Math.min(min, cs.length), max: Math.min(max, cs.length), cards: true }).map(Number) : [];
  var yes = (ctx, me, key, prompt, card, score = 1) => ctx.ask(me, { key, prompt, options: [{ id: "yes", label: "Yes", card, score }, { id: "no", label: "No", score: 0 }], min: 1, max: 1 })[0] === "yes";
  var bottomRandom = (s, ids) => {
    const r = new Rng(s.rng);
    for (const id of r.shuffle(ids)) H().move(s, id, "libraryBottom");
    s.rng = r.seed;
  };
  var borgToken = (s) => H().makeTokenDef(s, { e: "token", n: 1, name: "Borg", power: 1, toughness: 1, types: "Artifact Creature \u2014 Borg", colors: [], keywords: [], artifact: true }, 0);
  var landsFromHand = (ctx, me, key, n) => {
    const s = ctx.s;
    const ls = s.players[me].hand.filter((o) => rulesOf(s, o).types.includes("land"));
    for (const id of pickCard(ctx, me, key, `You may put up to ${n} land card${n > 1 ? "s" : ""} from your hand onto the battlefield tapped`, ls, 0, n)) H().move(s, id, "battlefield", { controller: me, tapped: true });
  };
  T("U.S.S. Stargazer, Here and There", ["attacks"], "Stargazer#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const card = H().makeTokenDef(s, { e: "token", n: 1, name: "Spacecraft Illusion", power: 4, toughness: 3, types: "Artifact Creature \u2014 Spacecraft Illusion", colors: [], keywords: ["flying"], artifact: true }, 0);
    for (const iid of H().createToken(s, me, card, 1, true)) {
      if (s.combat) s.combat.attackers.push({ iid, defender: opp(me) });
      const p = findPerm(s, iid);
      if (p) p.attackedTurn = s.turn;
      H().later(s, { at: "endCombat", kind: "exile", iid });
    }
  });
  done("U.S.S. Stargazer, Here and There");
  T("Ensign Harry Kim, Operations", ["otherEtb"], "Harry Kim#t", (ctx, item) => {
    const s = ctx.s;
    const kim = findPerm(s, item.iid);
    const other = item.about !== void 0 ? findPerm(s, item.about) : void 0;
    if (kim && other && pt(s, other)[0] > pt(s, kim)[0]) addCounters(kim, "+1/+1", 1);
  });
  act("Guinan, Ancient Advisor", /entered this turn/, "Guinan#a", (ctx, item) => {
    const s = ctx.s;
    const ps = mine(s, item.controller, (p) => isCreature(s, p) && p.enteredTurn === s.turn);
    for (const p of ps) addCounters(p, "+1/+1", 1);
    if (ps.length >= 2) H().draw(s, item.controller, 1);
  });
  done("Guinan, Ancient Advisor");
  T("Chief Miles O'Brien", ["secondDraw"], "O'Brien#t", (ctx, item) => {
    const s = ctx.s;
    const ps = mine(s, item.controller, (p2) => (isCreature(s, p2) || isType(s, p2, "artifact")) && Object.values(p2.counters).some((n) => n > 0));
    const [p] = pickPerm(ctx, item.controller, "ob", "O'Brien: double the counters on an artifact or creature you control", ps, 1, 1, (p2) => Object.values(p2.counters).reduce((a, b) => a + b, 0));
    if (!p) return;
    for (const k of Object.keys(p.counters)) if (!k.includes(":")) p.counters[k] *= 2;
    log(s, `O'Brien doubles the counters on ${permName(s, p)}.`);
  });
  done("Chief Miles O'Brien");
  act("Seven of Nine, Tertiary Adjunct", /Draw a card, then discard/, "Seven#a", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const before = new Set(s.players[me].graveyard.map((o) => o.iid));
    H().draw(s, me, 1);
    discard(ctx, me, 1, "sd");
    const dropped = s.players[me].graveyard.find((o) => !before.has(o.iid));
    if (!dropped || rulesOf(s, dropped).types.includes("land")) return;
    const [a] = pickPerm(ctx, me, "sc", "Put two charge counters on up to one artifact", s.battlefield.filter((p) => isType(s, p, "artifact")), 0, 1, (p) => p.controller === me ? 1 : -1);
    if (a) addCounters(a, "charge", 2);
  });
  done("Seven of Nine, Tertiary Adjunct");
  act("B'Elanna Torres, Scrapper", /Surveil 2/, "B'Elanna#a", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    scry(ctx, me, 2, true, "bs");
    const top = s.players[me].library[0];
    if (top && isType(s, top, "artifact")) {
      log(s, `B'Elanna reveals ${cardName(s, top.card)}.`);
      H().draw(s, me, 1);
    } else {
      const b = findPerm(s, item.iid);
      if (b) addCounters(b, "+1/+1", 2);
    }
  });
  done("B'Elanna Torres, Scrapper");
  trig("U.S.S. Enterprise-C, Time-Tossed", "etb", "Enterprise-C#etb", (ctx, item) => wheel(ctx, item.controller), { text: "When U.S.S. Enterprise-C enters, you may discard your hand and draw that many." });
  trig("U.S.S. Enterprise-C, Time-Tossed", "dies", "Enterprise-C#dies", (ctx, item) => wheel(ctx, item.controller), { text: "When U.S.S. Enterprise-C dies, you may discard your hand and draw that many." });
  function wheel(ctx, me) {
    const s = ctx.s;
    const hand = s.players[me].hand;
    if (!hand.length) return;
    const lands2 = hand.filter((o) => rulesOf(s, o).types.includes("land")).length;
    if (!yes(ctx, me, "ec", `Discard your hand (${hand.length}) and draw that many?`, void 0, lands2 * 2 >= hand.length ? 1 : -1)) return;
    const n = hand.length;
    for (const o of [...hand]) H().move(s, o.iid, "graveyard");
    H().draw(s, me, n);
  }
  done("U.S.S. Enterprise-C, Time-Tossed");
  done("U.S.S. Prometheus, Prototype");
  act("Command Beacon", /commander into your hand/, "Command Beacon#a", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const cs = s.players[me].command;
    const [id] = pickCard(ctx, me, "cb", "Put your commander into your hand", cs);
    if (id !== void 0) H().move(s, id, "hand");
  });
  done("Command Beacon");
  act("Fabled Passage", /basic land card/, "Fabled Passage#a", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const before = new Set(s.battlefield.map((p) => p.iid));
    search(ctx, me, { e: "search", filter: { types: ["land"], not: [], basic: true }, count: 1, dest: "battlefield", tapped: true }, "fp");
    if (mine(s, me, (p) => isType(s, p, "land")).length >= 4) {
      for (const p of s.battlefield) if (!before.has(p.iid) && p.controller === me) p.tapped = false;
    }
  });
  done("Fabled Passage");
  act("Stonespeaker Crystal", /Exile any number/, "Stonespeaker#a", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    for (const o of [...s.players[opp(me)].graveyard]) H().move(s, o.iid, "exile");
    log(s, `${s.players[opp(me)].name}'s graveyard is exiled.`);
    H().draw(s, me, 1);
  });
  done("Stonespeaker Crystal");
  act("Jefferies Tube", /Draw a card\. You may put a land/, "Jefferies#a", (ctx, item) => {
    H().draw(ctx.s, item.controller, 1);
    landsFromHand(ctx, item.controller, "jt", 1);
  });
  done("Jefferies Tube");
  CDA["Lt. Arex, Ever-Adapting"] = (s, p) => [landNames(s, p.controller), landNames(s, p.controller)];
  T("Lt. Arex, Ever-Adapting", ["etb"], "Arex#t", (ctx, item) => {
    H().draw(ctx.s, item.controller, 3);
    landsFromHand(ctx, item.controller, "ax", 3);
  });
  patchRules("Lt. Arex, Ever-Adapting", (r) => {
    if (allCompiled(r)) r.fullyAutomated = true;
  });
  T("Guardian Project", ["otherEtb"], "Guardian Project#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const p = item.about !== void 0 ? findPerm(s, item.about) ?? void 0 : void 0;
    const name = p ? cardName(s, p.card) : item.about !== void 0 ? cardName(s, locate(s, item.about)?.obj.card ?? "") : "";
    if (!name) return;
    const dup = mine(s, me, (q) => q.iid !== item.about && isCreature(s, q) && cardName(s, q.card) === name).length || s.players[me].graveyard.some((o) => rulesOf(s, o).types.includes("creature") && cardName(s, o.card) === name);
    if (!dup) H().draw(s, me, 1);
  });
  done("Guardian Project");
  T("Scute Swarm", ["landfall"], "Scute Swarm#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const self = findPerm(s, item.iid);
    if (mine(s, me, (p) => isType(s, p, "land")).length >= 6 && self) H().createToken(s, me, self.card, 1);
    else H().createToken(s, me, H().makeTokenDef(s, { e: "token", n: 1, name: "Insect", power: 1, toughness: 1, types: "Creature \u2014 Insect", colors: ["G"], keywords: [] }, 0), 1);
  });
  done("Scute Swarm");
  for (const ev of ["commanderEtb", "commanderAttacks"])
    trig("Janice Rand, Essential Aide", ev, `Janice#${ev}`, (ctx, item) => {
      const s = ctx.s;
      const me = item.controller;
      const c = item.about !== void 0 ? findPerm(s, item.about) : void 0;
      if (c) addCounters(c, "+1/+1", 1);
      const lib = s.players[me].library;
      const i = lib.findIndex((o) => rulesOf(s, o).types.includes("land"));
      const passed = (i < 0 ? lib : lib.slice(0, i)).map((o) => o.iid);
      if (i >= 0) H().move(s, lib[i].iid, "battlefield", { controller: me, tapped: true });
      bottomRandom(s, passed);
    }, { text: `Whenever a commander you control ${ev === "commanderEtb" ? "enters" : "attacks"}, put a +1/+1 counter on it and reveal until a land; put it onto the battlefield tapped.` });
  done("Janice Rand, Essential Aide");
  act("Mutavault", /becomes a 2\/2/, "Mutavault#a", (ctx, item) => {
    const p = findPerm(ctx.s, item.iid);
    if (p) p.mods.push({ power: 2, toughness: 2, until: "eot", note: "creature" });
  });
  done("Mutavault");
  T("Planet Killer", ["combatDamagePlayer"], "Planet Killer#t", (ctx, item) => {
    const s = ctx.s;
    const p = findPerm(s, item.iid);
    if (p) addCounters(p, "+1/+1", mine(s, opp(item.controller), (q) => isType(s, q, "land")).length);
  });
  done("Planet Killer");
  T("T'Pring, Never Parted", ["etb"], "T'Pring#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const [a] = pickPerm(ctx, me, "tp1", "T'Pring: choose another creature you control", mine(s, me, (p) => p.iid !== item.iid && isCreature(s, p)), 1, 1, (p) => pt(s, p)[0]);
    const [b] = pickPerm(ctx, me, "tp2", "T'Pring: choose a creature an opponent controls", mine(s, opp(me), (p) => isCreature(s, p) && !rulesOf(s, p).keywords.includes("hexproof")), 1, 1, (p) => (a && pt(s, a)[0] >= pt(s, p)[1] ? 5 : 0) - pt(s, p)[0]);
    if (!a || !b) return;
    if (!yes(ctx, me, "tp3", `Have ${permName(s, a)} fight ${permName(s, b)}?`, b.card, pt(s, a)[0] >= pt(s, b)[1] && pt(s, b)[0] < pt(s, a)[1] ? 1 : -1)) return;
    const [pa] = pt(s, a);
    const [pb] = pt(s, b);
    H().damage(s, { card: a.card, controller: me, iid: a.iid }, { kind: "perm", id: b.iid }, pa);
    H().damage(s, { card: b.card, controller: b.controller, iid: b.iid }, { kind: "perm", id: a.iid }, pb);
    a.mods.push({ power: 0, toughness: 0, until: "eot", note: `fought:${me}` });
    b.mods.push({ power: 0, toughness: 0, until: "eot", note: `fought:${me}` });
  });
  act("S.S. Botany Bay", /exiles a card from their graveyard/, "Botany Bay#a", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const them = opp(me);
    const [x] = pickCard(ctx, them, "bb1", "S.S. Botany Bay: exile a card from your graveyard", s.players[them].graveyard);
    if (x !== void 0) H().move(s, x, "exile");
    const [y] = pickCard(ctx, me, "bb2", "You may exile a card from your graveyard (creature cards come back when the Botany Bay connects)", s.players[me].graveyard, 0, 1);
    if (y !== void 0) H().move(s, y, "exile");
    const bay = findPerm(s, item.iid);
    if (bay) {
      for (const id of [x, y]) if (id !== void 0) bay.counters[`exiled:${id}`] = 1;
    }
  });
  T("S.S. Botany Bay", ["combatDamagePlayer"], "Botany Bay#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const bay = findPerm(s, item.iid);
    if (!bay) return;
    for (const k of Object.keys(bay.counters))
      if (k.startsWith("exiled:")) {
        const l = locate(s, Number(k.slice(7)));
        if (l && l.zone === "exile" && l.obj.owner === me && rulesOf(s, l.obj).types.includes("creature")) {
          H().move(s, l.obj.iid, "battlefield", { controller: me });
          delete bay.counters[k];
        }
      }
  });
  done("S.S. Botany Bay");
  overrideTrigger("Qo'noS Quartermaster", { events: ["attacks"], compiled: { targets: [], effects: [{ e: "addMana", n: 1 }] } });
  done("Qo'noS Quartermaster");
  T("Curzon Dax, Bound by Blood", ["dies"], "Curzon#dies", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const cs = s.players[me].hand.filter((o) => rulesOf(s, o).types.includes("creature") && def(s, o.card).cmc <= 3);
    for (const id of pickCard(ctx, me, "cd", "Curzon Dax: you may put a creature card with mana value 3 or less onto the battlefield", cs, 0, 1)) H().move(s, id, "battlefield", { controller: me });
  });
  done("Curzon Dax, Bound by Blood");
  T("K't'inga-Class Battle Cruiser", ["etb", "attacks"], "K't'inga#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    for (const p of pickPerm(ctx, me, "kt", "One or two Klingons and/or Warriors you control gain flying until end of turn", mine(s, me, (p2) => isCreature(s, p2) && isKW(s, p2)), 1, 2, (p2) => pt(s, p2)[0]))
      p.mods.push({ power: 0, toughness: 0, keywords: ["flying"], until: "eot" });
  });
  done("K't'inga-Class Battle Cruiser");
  GRANTS["K'Vort-Class Raider"] = (s, src, p) => s.active === src.controller && p.controller === src.controller && (p.iid === src.iid || isCreature(s, p)) ? ["hexproof"] : [];
  patchRules("K'Vort-Class Raider", (r) => {
    r.fullyAutomated = allCompiled(r);
  });
  T("Kang, Suspicious Captain", ["etb"], "Kang#etb", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const [t] = pickPerm(ctx, me, "kg", "Kang: goad a creature an opponent controls (while you control Kang)", mine(s, opp(me), (p) => isCreature(s, p)), 1, 1, (p) => pt(s, p)[0]);
    const kang = findPerm(s, item.iid);
    for (const p of [t, kang]) if (p) p.mods.push({ power: 0, toughness: 0, keywords: ["goaded"], until: "perm", note: `while:${item.iid}` });
    if (t) log(s, `${permName(s, t)} and Kang are goaded.`);
  });
  trig("Kang, Suspicious Captain", "goadedAttack", "Kang#atk", (ctx, item) => {
    const s = ctx.s;
    const [p] = pickPerm(ctx, item.controller, "kg2", "Kang: put a +1/+1 counter on a creature you control", mine(s, item.controller, (p2) => isCreature(s, p2)), 1, 1, (p2) => pt(s, p2)[0]);
    if (p) addCounters(p, "+1/+1", 1);
  });
  patchRules("Kang, Suspicious Captain", (r) => {
    r.triggers = r.triggers.filter((t) => t.compiled || t.event !== "attacks").map((t, i) => ({ ...t, index: i }));
    for (const t of r.triggers) t.conditional = false;
    r.triggers.forEach((t) => {
      if (t.event === "goadedAttack") t.compiled = named("Kang#atk");
    });
    if (allCompiled(r)) r.fullyAutomated = true;
  });
  spell("Own the Day", (ctx, item) => {
    const s = ctx.s;
    for (const p of mine(s, item.controller)) if (p.attackedTurn === s.turn) p.tapped = false;
    s.extraCombats = (s.extraCombats ?? 0) + 1;
    log(s, "There will be an additional combat phase after this main phase.");
  });
  spell("World at War", (ctx) => {
    const s = ctx.s;
    s.extraCombats = (s.extraCombats ?? 0) + 1;
    s.untapAtExtra = (s.untapAtExtra ?? 0) + 1;
    log(s, "There will be an additional combat phase after the second main phase.");
  });
  T("Combat Celebrant", ["attacks"], "Combat Celebrant#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const c = findPerm(s, item.iid);
    if (!c || c.used?.exert === s.turn) return;
    if (!yes(ctx, me, "cc", "Exert Combat Celebrant? (untap your other creatures and take an additional combat phase; it won\u2019t untap next turn)", c.card)) return;
    c.used = { ...c.used, exert: s.turn };
    c.skipUntap = true;
    for (const p of mine(s, me)) if (p.iid !== c.iid && isCreature(s, p)) p.tapped = false;
    s.extraCombatsNow = (s.extraCombatsNow ?? 0) + 1;
    log(s, "Combat Celebrant is exerted: the other creatures untap and there will be an additional combat phase.");
  });
  done("Combat Celebrant");
  act("Professional Face-Breaker", /Exile the top card/, "Face-Breaker#a", (ctx, item) => {
    const s = ctx.s;
    const pl = s.players[item.controller];
    const top = pl.library[0];
    if (!top) return;
    H().move(s, top.iid, "exile");
    (pl.playable ??= []).push({ iid: top.iid, until: s.turn });
    log(s, `${cardName(s, top.card)} is exiled \u2014 it can be played this turn.`);
  });
  act("Alexander, Ship's Fool", /Each player reveals/, "Alexander#a", (ctx, item) => {
    const s = ctx.s;
    let x = 0;
    s.players.forEach((pl, i) => {
      const top = pl.library[0];
      if (top) {
        x = Math.max(x, def(s, top.card).cmc);
        log(s, `${pl.name} reveals ${cardName(s, top.card)}.`);
      }
      H().draw(s, i, 1);
    });
    if (x > 0) H().damage(s, { card: item.card, controller: item.controller, iid: item.iid }, { kind: "player", id: opp(item.controller) }, x);
  });
  done("Alexander, Ship's Fool");
  T("Ambassador K'Ehleyr", ["beginCombat"], "K'Ehleyr#t", (ctx, item) => {
    const s = ctx.s;
    let n = 0;
    s.players.forEach((pl, i) => {
      const top = pl.library[0];
      if (top) {
        log(s, `${pl.name} reveals ${cardName(s, top.card)}.`);
        if (!rulesOf(s, top).types.includes("land")) n++;
      }
      H().draw(s, i, 1);
    });
    const k = findPerm(s, item.iid);
    if (k && n) addCounters(k, "+1/+1", n);
  });
  done("Ambassador K'Ehleyr");
  T("Concerted Effort", ["eachUpkeep"], "Concerted Effort#t", (ctx, item) => {
    const s = ctx.s;
    const cr = mine(s, item.controller, (p) => isCreature(s, p));
    const kws = ["flying", "fear", "first strike", "double strike", "trample", "vigilance"];
    const have = /* @__PURE__ */ new Set();
    for (const p of cr) for (const k of rulesOf(s, p).keywords.concat(p.mods.flatMap((m) => m.keywords ?? []))) if (kws.includes(k) || /walk$|^protection/.test(k)) have.add(k);
    if (!have.size) return;
    for (const p of cr) p.mods.push({ power: 0, toughness: 0, keywords: [...have], until: "eot" });
    log(s, `Concerted Effort: your creatures gain ${[...have].join(", ")}.`);
  });
  done("Concerted Effort");
  T("Sword of Light and Shadow", ["combatDamagePlayer"], "Sword of L&S#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    H().gainLife(s, me, 3);
    for (const id of pickCard(ctx, me, "sls", "You may return a creature card from your graveyard to your hand", s.players[me].graveyard.filter((o) => rulesOf(s, o).types.includes("creature")), 0, 1)) H().move(s, id, "hand");
  });
  spell("Right of Vengeance", (ctx, item) => {
    const s = ctx.s;
    (s.vengeance ??= []).push({ player: item.controller, turn: s.turn });
    log(s, "Until end of turn, creatures that deal combat damage to you are destroyed.");
  });
  patchRules("Sins of the Father", (r) => {
    const c = r.chapters?.[2];
    if (c) c.compiled = named("Sins III");
    if (allCompiled(r)) r.fullyAutomated = true;
  });
  reg("Sins III", (ctx, item) => {
    const s = ctx.s;
    const them = opp(item.controller);
    const gy = [...s.players[them].graveyard];
    const n = gy.filter((o) => rulesOf(s, o).types.includes("creature")).length;
    for (const o of gy) H().move(s, o.iid, "exile");
    s.players[them].life -= n;
    log(s, `Sins of the Father exiles ${gy.length} card${gy.length === 1 ? "" : "s"}; ${s.players[them].name} loses ${n} life.`);
  });
  trig("Maturation Chamber", "castSpell", "Maturation#t", (ctx, item) => {
    const p = findPerm(ctx.s, item.iid);
    if (p) addCounters(p, "charge", 1 + annex(ctx.s, item.controller));
  }, { who: "you", filter: { types: ["artifact"], not: [] }, text: "Whenever you cast an artifact spell, put a charge counter on this artifact." });
  act("Maturation Chamber", /for each charge counter/, "Maturation#a", (ctx, item) => {
    const p = findPerm(ctx.s, item.iid);
    const n = p?.counters.charge ?? 0;
    if (n) H().createToken(ctx.s, item.controller, borgToken(ctx.s), n);
  });
  done("Maturation Chamber");
  var annex = (s, me) => mine(s, me, (p) => cardName(s, p.card) === "Optimization Annex").length;
  trig("Conquest Mission", "otherEtb", "Conquest#t", (ctx, item) => {
    const s = ctx.s;
    const m = findPerm(s, item.iid);
    if (!m) return;
    addCounters(m, "quest", 1);
    H().createToken(s, item.controller, borgToken(s), m.counters.quest >= 6 ? 2 : 1);
  }, { filter: { types: ["artifact"], not: [], controller: "you", nonToken: true } });
  patchRules("Conquest Mission", (r) => {
    r.triggers = r.triggers.filter((t) => t.compiled);
    r.triggers.forEach((t, i) => t.index = i);
    r.fullyAutomated = allCompiled(r);
  });
  T("Assimilation Assessor", ["etb"], "Assessor#etb", (ctx, item) => {
    const s = ctx.s;
    const them = opp(item.controller);
    const a = findPerm(s, item.iid);
    for (const o of [...s.players[them].graveyard]) {
      H().move(s, o.iid, "exile");
      if (a) a.counters[`exiled:${o.iid}`] = 1;
    }
    log(s, `${s.players[them].name}'s graveyard is exiled.`);
  });
  T("Assimilation Assessor", ["attacks"], "Assessor#atk", (ctx, item) => {
    const s = ctx.s;
    const a = findPerm(s, item.iid);
    if (!a) return;
    const cs = Object.keys(a.counters).filter((k) => k.startsWith("exiled:")).map((k) => locate(s, Number(k.slice(7)))).filter((l) => l && l.zone === "exile" && rulesOf(s, l.obj).types.includes("creature")).map((l) => l.obj);
    const [id] = pickCard(ctx, item.controller, "aa", "Assimilate a creature card exiled with Assimilation Assessor", cs);
    if (id === void 0) return;
    delete a.counters[`exiled:${id}`];
    assimilate(s, item.controller, id);
  });
  done("Assimilation Assessor");
  T("Hive Mind Coprocessor", ["combatDamagePlayer"], "Hive Mind#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    if (s.players[me].life > 1 && yes(ctx, me, "hm", "Pay 1 life to draw a card?", item.card, s.players[me].life > 5 ? 1 : -1)) {
      s.players[me].life -= 1;
      H().draw(s, me, 1);
    }
  });
  done("Hive Mind Coprocessor");
  T("The Immortal Sun", ["yourDraw"], "Immortal Sun#t", (ctx, item) => H().draw(ctx.s, item.controller, 1));
  patchRules("The Immortal Sun", (r) => {
    r.costReduction = { filter: { types: [], not: [] }, n: 1 };
    if (!r.statics.some((x) => x.kind === "anthem")) r.statics.push({ kind: "anthem", power: 1, toughness: 1, keywords: [], filter: { types: ["creature"], not: [], controller: "you" } });
    if (allCompiled(r)) r.fullyAutomated = true;
  });
  act("Reconnaissance Partition", /Choose one/, "Recon#a", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const [c] = ctx.ask(me, { key: "rp", prompt: "Reconnaissance Partition: choose one", options: [{ id: "land", label: "Search for a basic land (enters tapped)", score: mine(s, me, (p) => isType(s, p, "land")).length < 6 ? 2 : 0 }, { id: "draw", label: "Draw a card", score: 1 }], min: 1, max: 1 });
    if (c === "land") search(ctx, me, { e: "search", filter: { types: ["land"], not: [], basic: true }, count: 1, dest: "battlefield", tapped: true }, "rps");
    else H().draw(s, me, 1);
  });
  done("Reconnaissance Partition");
  act("Academy Ruins", /artifact card from your graveyard on top/, "Academy Ruins#a", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const [id] = pickCard(ctx, me, "ar", "Put an artifact card from your graveyard on top of your library", s.players[me].graveyard.filter((o) => rulesOf(s, o).types.includes("artifact")));
    if (id !== void 0) H().move(s, id, "library");
  });
  done("Academy Ruins");
  GRANTS["Extraction Integrant"] = (s, src, p) => p.controller === src.controller && isCreature(s, p) && isType(s, p, "artifact") ? ["menace"] : [];
  spell("Borg Incursion", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    H().createToken(s, me, borgToken(s), 2);
    const cols = ["W", "U", "B", "R", "G"];
    const theirs = /* @__PURE__ */ new Map();
    for (const p of mine(s, opp(me))) for (const c2 of def(s, p.card).colors) theirs.set(c2, (theirs.get(c2) ?? 0) + 1);
    const names = { W: "white", U: "blue", B: "black", R: "red", G: "green" };
    const [c] = ctx.ask(me, { key: "bi", prompt: "Artifact creatures you control gain protection from which colour?", options: cols.map((x) => ({ id: x, label: names[x], score: theirs.get(x) ?? 0 })), min: 1, max: 1 });
    for (const p of mine(s, me, (p2) => isCreature(s, p2) && isType(s, p2, "artifact"))) p.mods.push({ power: 0, toughness: 0, keywords: [`protection from ${names[c]}`], until: "eot" });
  });
  spell("Assimilate the Wounded", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const them = opp(me);
    const died = s.diedThisTurn ?? {};
    const cs = s.players[them].graveyard.filter((o) => rulesOf(s, o).types.includes("creature") && died[o.iid] === s.turn);
    for (const id of pickCard(ctx, me, "aw", "Assimilate up to one creature card that died this turn", cs, 0, 1)) assimilate(s, me, id);
  });
  patchRules("The Best of Both Worlds", (r) => {
    const c1 = r.chapters?.[0];
    const c3 = r.chapters?.[2];
    if (c1) c1.compiled = named("BoBW I", [{ kind: "perm", filter: { types: ["creature"], not: ["artifact"], controller: "opp" } }]);
    if (c3) c3.compiled = named("BoBW III");
    if (allCompiled(r)) r.fullyAutomated = true;
  });
  reg("BoBW I", (ctx, item) => {
    const s = ctx.s;
    const t = item.targets[0] ? findPerm(s, item.targets[0].id) : void 0;
    if (!t) return;
    assimilate(s, item.controller, t.iid);
    const saga = findPerm(s, item.iid);
    if (saga) saga.counters[`exiled:${t.iid}`] = 1;
  }, [{ kind: "perm", filter: { types: ["creature"], not: ["artifact"], controller: "opp" } }]);
  reg("BoBW III", (ctx, item) => {
    const s = ctx.s;
    const saga = findPerm(s, item.iid);
    if (!saga) return;
    for (const k of Object.keys(saga.counters))
      if (k.startsWith("exiled:")) {
        const p = findPerm(s, Number(k.slice(7)));
        if (!p) continue;
        H().move(s, p.iid, "exile");
        H().move(s, p.iid, "battlefield", { controller: p.owner });
      }
  });
  done("Unwinding Clock");
  done("Alhammarret's Archive");
  function equipAttack(card, name, power, toughness) {
    patchRules(card, (r) => {
      if (power || toughness) r.statics.push({ kind: "equip", power, toughness, keywords: [] });
      r.triggers.push({ index: r.triggers.length, event: "attacks", text: "Equipped creature: whenever it attacks \u2026", effectText: "", compiled: named(name), equipped: true });
      if (allCompiled(r)) r.fullyAutomated = true;
    });
  }
  equipAttack("The Sword of Kahless", "Sword of Kahless#t", 2, 2);
  reg("Communicator#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const eq = findPerm(s, item.iid);
    const host = eq?.attachedTo;
    const x = mine(s, me, (p) => p.iid !== host && isCreature(s, p) && s.battlefield.some((q) => q.attachedTo === p.iid && rulesOf(s, q).subtypes.includes("Communicator"))).length;
    if (!x) return;
    H().draw(s, me, x);
    landsFromHand(ctx, me, "sfc", x);
  });
  equipAttack("Starfleet Communicator", "Communicator#t", 0, 0);
  trig("Starfleet Communicator", "cast", "Communicator#cast", (ctx, item) => {
    H().createToken(ctx.s, item.controller, item.card, 1);
    log(ctx.s, "Starfleet Communicator is copied (the copy is a token).");
  }, { text: "When you cast this spell, copy it." });
  patchRules("Starfleet Communicator", (r) => {
    if (allCompiled(r)) r.fullyAutomated = true;
  });
  T("U.S.S. Farragut, Bold Explorer", ["landfall"], "Farragut#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const cs = s.players[me].hand.filter((o) => rulesOf(s, o).types.includes("creature"));
    const [id] = pickCard(ctx, me, "fg", "Farragut: you may put a creature card from your hand onto the battlefield (it has haste; at the next end step it goes to the bottom of your library and you draw a card)", cs, 0, 1);
    if (id === void 0) return;
    H().move(s, id, "battlefield", { controller: me });
    findPerm(s, id)?.mods.push({ power: 0, toughness: 0, keywords: ["haste"], until: "perm" });
    H().later(s, { at: "end", kind: "bottom", iid: id, owner: me, draw: true });
  });
  done("U.S.S. Farragut, Bold Explorer");
  act("Lieutenant Nyota Uhura", /exiles the top X cards/, "Uhura#a", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const them = opp(me);
    const x = landNames(s, me);
    const top = s.players[them].library.slice(0, x);
    for (const o of top) H().move(s, o.iid, "exile");
    log(s, `${s.players[them].name} exiles the top ${top.length} cards of their library.`);
    const spells = top.filter((o) => rulesOf(s, o).types.some((t) => t === "instant" || t === "sorcery"));
    const [pick] = pickCard(ctx, me, "uh", "Uhura: you may cast an instant or sorcery from among them for free", spells, 0, 1);
    bottomRandom(s, top.filter((o) => o.iid !== pick).map((o) => o.iid));
    if (pick !== void 0) castFreeNow(s, me, pick);
  });
  done("Lieutenant Nyota Uhura");
  act("Chief Montgomery Scott", /creature or Spacecraft card from your hand/, "Scotty#a", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const x = landNames(s, me);
    const cs = s.players[me].hand.filter((o) => rulesOf(s, o).types.includes("creature") || rulesOf(s, o).subtypes.includes("Spacecraft"));
    const [id] = pickCard(ctx, me, "sc", `Scotty: you may put a creature or Spacecraft card onto the battlefield with ${x} extra counters`, cs, 0, 1);
    if (id === void 0) return;
    const ship = rulesOf(s, s.players[me].hand.find((o) => o.iid === id)).subtypes.includes("Spacecraft");
    H().move(s, id, "battlefield", { controller: me });
    const p = findPerm(s, id);
    if (p) addCounters(p, ship ? "charge" : "+1/+1", x);
  });
  done("Chief Montgomery Scott");
  act("The Guardian of Forever", /Return that card/, "Guardian of Forever#a", (ctx, item) => {
    const s = ctx.s;
    if (item.about === void 0) return;
    const l = locate(s, item.about);
    if (l) H().later(s, { at: "end", kind: "return", iid: item.about, owner: l.obj.owner });
    log(s, "It will return at the beginning of the next end step.");
  });
  done("The Guardian of Forever");
  var chosenType = (p) => Object.keys(p.counters).find((k) => k.startsWith("type:"))?.slice(5);
  function chooseType(card) {
    trig(card, "etb", `${card}#type`, (ctx, item) => {
      const s = ctx.s;
      const me = item.controller;
      const count = /* @__PURE__ */ new Map();
      for (const o of [...s.players[me].library, ...s.players[me].hand, ...s.battlefield.filter((p2) => p2.controller === me)])
        if (rulesOf(s, o).types.includes("creature")) for (const t2 of rulesOf(s, o).subtypes) count.set(t2, (count.get(t2) ?? 0) + 1);
      const opts = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (!opts.length) opts.push(["Human", 0]);
      const [t] = ctx.ask(me, { key: "ct", prompt: `${card}: choose a creature type`, options: opts.map(([t2, n]) => ({ id: t2, label: `${t2} (${n})`, score: n })), min: 1, max: 1 });
      const p = findPerm(s, item.iid);
      if (p) p.counters[`type:${t}`] = 1;
      log(s, `${card}: ${t} chosen.`);
    }, { text: "As this enters, choose a creature type." });
  }
  var ofType = (s, o, t) => !!t && rulesOf(s, o).subtypes.includes(t);
  chooseType("Herald's Horn");
  COST_MODS["Herald's Horn"] = (s, src, card) => rulesOf(s, { card }).types.includes("creature") && ofType(s, { card }, chosenType(src)) ? 1 : 0;
  T("Herald's Horn", ["upkeep"], "Herald's Horn#t", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const h = findPerm(s, item.iid);
    const top = s.players[me].library[0];
    if (!h || !top) return;
    if (rulesOf(s, top).types.includes("creature") && ofType(s, top, chosenType(h)) && yes(ctx, me, "hh", `Herald's Horn: reveal ${cardName(s, top.card)} and put it into your hand?`, top.card)) H().move(s, top.iid, "hand");
  });
  done("Herald's Horn");
  chooseType("Door of Destinies");
  trig("Door of Destinies", "castSpell", "Door#cast", (ctx, item) => {
    const s = ctx.s;
    const d = findPerm(s, item.iid);
    const spell2 = item.about !== void 0 ? locate(s, item.about) : null;
    const card = spell2?.obj.card ?? s.stack.find((it) => it.obj?.iid === item.about)?.card;
    if (d && card && ofType(s, { card }, chosenType(d))) addCounters(d, "charge", 1 + annex(s, item.controller));
  }, { who: "you", text: "Whenever you cast a spell of the chosen type, put a charge counter on this artifact." });
  BUFFS["Door of Destinies"] = (s, src, p) => {
    const n = src.counters.charge ?? 0;
    return n && p.controller === src.controller && isCreature(s, p) && ofType(s, p, chosenType(src)) ? [n, n] : [0, 0];
  };
  done("Door of Destinies");
  patchRules("Unification", (r) => {
    if (r.chapters?.[0]) r.chapters[0].compiled = named("Unification I", [{ kind: "perm", filter: { types: ["creature"], not: [] }, min: 0, max: 1 }]);
    if (r.chapters?.[1]) r.chapters[1].compiled = named("Unification II");
    if (allCompiled(r)) r.fullyAutomated = true;
  });
  reg("Unification I", (ctx, item) => {
    const s = ctx.s;
    const t = item.targets[0] ? findPerm(s, item.targets[0].id) : void 0;
    if (!t) return;
    const owner = t.owner;
    H().draw(s, owner, 2);
    H().move(s, t.iid, "library");
    H().shuffle(s, owner);
    log(s, `${cardName(s, t.card)} is shuffled into its owner's library.`);
  }, [{ kind: "perm", filter: { types: ["creature"], not: [] }, min: 0, max: 1 }]);
  reg("Unification II", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    const pl = s.players[me];
    const cs = [...pl.hand, ...pl.graveyard].filter((o) => rulesOf(s, o).subtypes.includes("Spacecraft"));
    for (const id of pickCard(ctx, me, "un", "You may put a Spacecraft card from your hand or graveyard onto the battlefield", cs, 0, 1)) H().move(s, id, "battlefield", { controller: me });
  });
  spell("Promise of Loyalty", (ctx, item) => {
    const s = ctx.s;
    const me = item.controller;
    s.players.forEach((_, i) => {
      const cs = mine(s, i, (p) => isCreature(s, p));
      const [keep] = pickPerm(ctx, i, `pl${i}`, "Promise of Loyalty: choose a creature to keep (it gets a vow counter); sacrifice the rest", cs, 1, 1, (p) => pt(s, p)[0] + pt(s, p)[1]);
      for (const p of cs) if (p !== keep) H().move(s, p.iid, "graveyard", { cause: "sacrifice" });
      if (keep) {
        addCounters(keep, "vow", 1);
        if (i !== me) keep.mods.push({ power: 0, toughness: 0, keywords: ["defender"], until: "perm", note: "vow" });
      }
    });
  });
  patchRules("Tuvok, Chief Tactical Officer", (r) => {
    for (const t of r.triggers) t.compiled ??= { targets: [], effects: [] };
    for (const t of r.triggers) t.conditional = false;
    if (allCompiled(r)) r.fullyAutomated = true;
  });

  // src/engine/engine.ts
  var FORMATS = {
    duel: { id: "duel", name: "Duel Commander", life: 20, commanderDamage: false, freeMulligan: false },
    oneVsOne: { id: "oneVsOne", name: "1v1 Commander", life: 30, commanderDamage: true, freeMulligan: false },
    classic: { id: "classic", name: "Classic Commander (40 life)", life: 40, commanderDamage: true, freeMulligan: true }
  };
  function newGame(setup) {
    const rng2 = new Rng(setup.seed);
    let nextId = 1;
    const s = {
      v: 1,
      seed: setup.seed,
      rng: 0,
      format: FORMATS[setup.format],
      players: [],
      battlefield: [],
      stack: [],
      turn: 0,
      active: 0,
      step: "mulligan",
      passes: 0,
      pending: { kind: "mulligan", player: 0 },
      combat: null,
      tasks: [],
      nextId: 0,
      log: [],
      cards: setup.cards,
      notice: null,
      firstPlayer: 0,
      ticks: 0
    };
    setup.players.forEach((p, i) => {
      const identity = /* @__PURE__ */ new Set();
      for (const c of p.commanders) for (const col of setup.cards[c]?.identity ?? []) identity.add(col);
      const library = rng2.shuffle(p.deck.map((card) => ({ iid: nextId++, card, owner: i })));
      const command = p.commanders.map((card) => ({ iid: nextId++, card, owner: i, commander: true }));
      s.players.push({
        name: p.name,
        life: FORMATS[setup.format].life,
        poison: 0,
        library,
        hand: [],
        graveyard: [],
        exile: [],
        command,
        pool: emptyPool(),
        landsPlayed: 0,
        commanderCasts: {},
        commanderDamage: {},
        mulligans: 0,
        kept: false,
        commanders: p.commanders,
        identity: [...identity],
        bot: p.bot
      });
    });
    s.nextId = nextId;
    const first = setup.first ?? rng2.int(2);
    s.firstPlayer = first;
    s.active = first;
    s.rng = rng2.seed;
    for (let i = 0; i < 2; i++) drawCards(s, i, 7, true);
    s.pending = { kind: "mulligan", player: first };
    log(s, `${s.format.name}: ${s.players[0].name} vs ${s.players[1].name}. ${s.players[first].name} goes first.`);
    return s;
  }
  function rng(s) {
    return new Rng(s.rng);
  }
  function saveRng(s, r) {
    s.rng = r.seed;
  }
  function shuffle(s, p) {
    const r = rng(s);
    s.players[p].library = r.shuffle(s.players[p].library);
    saveRng(s, r);
  }
  function drawCards(s, p, n, quiet = false) {
    const pl = s.players[p];
    const archives = s.battlefield.filter((q) => q.controller === p && cardName(s, q.card) === "Alhammarret's Archive").length;
    let total = n;
    if (archives && s.turn > 0) {
      const first = s.step === "draw" && s.active === p && pl.drawStepTurn !== s.turn;
      total = (first ? 1 : 0) + (n - (first ? 1 : 0)) * 2 ** archives;
    }
    if (s.step === "draw" && s.active === p) pl.drawStepTurn = s.turn;
    n = total;
    for (let i = 0; i < n; i++) {
      const c = pl.library.shift();
      if (!c) {
        ;
        pl.drewFromEmpty = true;
        break;
      }
      pl.hand.push(c);
      if (s.turn > 0) {
        pl.drawsThisTurn = (pl.drawsThisTurn ?? 0) + 1;
        if (pl.drawsThisTurn === 2) {
          for (const q of s.battlefield) if (q.controller === p) fire(s, q, "secondDraw");
        }
      }
    }
    if (!quiet && n > 0) log(s, `${pl.name} draws ${n === 1 ? "a card" : `${n} cards`}.`);
  }
  function gainLife(s, p, n) {
    if (n <= 0) return;
    n *= 2 ** s.battlefield.filter((q) => q.controller === p && cardName(s, q.card) === "Alhammarret's Archive").length;
    s.players[p].life += n;
    log(s, `${s.players[p].name} gains ${n} life.`);
    for (const q of s.battlefield) if (q.controller === p) fire(s, q, "gainLife");
  }
  function setTapped(s, p, tapped) {
    if (tapped && !p.tapped) {
      p.tapped = true;
      fire(s, p, "tapped");
    } else p.tapped = tapped;
  }
  function chapter(s, p) {
    const r = rulesOf(s, p);
    const n = p.counters.lore ?? 0;
    const ch = r.chapters?.findIndex((c) => c.nums.includes(n)) ?? -1;
    if (ch >= 0) queue(s).push({ iid: p.iid, card: p.card, controller: p.controller, index: -100 - ch });
  }
  function discover(ctx, p, n, key) {
    const s = ctx.s;
    const lib = s.players[p].library;
    const seen = [];
    let hit;
    for (const o of lib) {
      seen.push(o);
      if (!rulesOf(s, o).types.includes("land") && def(s, o.card).cmc <= n) {
        hit = o;
        break;
      }
    }
    if (!hit) return;
    const [c] = ctx.ask(p, { key, prompt: `Discover ${n}: ${cardName(s, hit.card)}`, options: [{ id: "cast", label: "Cast it for free", card: hit.card, score: 2 }, { id: "hand", label: "Put it into your hand", score: 1 }], min: 1, max: 1 });
    for (const o of seen) if (o !== hit) moveCard(s, o.iid, "libraryBottom", { manual: true });
    log(s, `${s.players[p].name} discovers ${cardName(s, hit.card)}.`);
    if (c === "hand") moveCard(s, hit.iid, "hand", { manual: true });
    else castFree(s, p, hit.iid);
  }
  function castFree(s, p, iid) {
    const l = locate(s, iid);
    if (!l) return;
    if (rulesOf(s, l.obj).types.includes("land")) {
      moveCard(s, iid, "battlefield", { controller: p, manual: true });
      return;
    }
    s.tasks.unshift({ tid: s.nextId++, kind: "cast", player: p, answers: {}, data: { iid, free: true } });
  }
  function later(s, d) {
    ;
    (s.delayed ??= []).push(d);
  }
  function runDelayed(s, at) {
    const mine2 = (d) => d.at === at && (at !== "upkeep" || d.owner === s.active);
    const due = (s.delayed ?? []).filter(mine2);
    s.delayed = (s.delayed ?? []).filter((d) => !mine2(d));
    for (const d of due) {
      if (d.kind === "rebound") {
        const l = locate(s, d.iid);
        if (l && l.zone === "exile") {
          log(s, `${cardName(s, l.obj.card)} is cast again from rebound.`);
          castFree(s, d.owner, d.iid);
        }
      } else if (d.kind === "return") {
        const l = locate(s, d.iid);
        if (l && (l.zone === "exile" || l.zone === "graveyard")) {
          moveCard(s, d.iid, "battlefield", { controller: d.owner, manual: true });
          log(s, `${cardName(s, l.obj.card)} returns to the battlefield.`);
        }
      } else if (d.kind === "exile") {
        if (findPerm(s, d.iid)) moveCard(s, d.iid, "exile");
      } else if (d.kind === "bottom") {
        if (findPerm(s, d.iid)) {
          moveCard(s, d.iid, "libraryBottom");
          if (d.draw && d.owner !== void 0) drawCards(s, d.owner, 1);
        }
      } else if (d.kind === "control") {
        const q = findPerm(s, d.iid);
        if (q && d.owner !== void 0) q.controller = d.owner;
      }
    }
  }
  var isPermanentCard = (s, card, back = false) => {
    const r = rulesOf(s, { card, flipped: back });
    return !r.types.includes("instant") && !r.types.includes("sorcery");
  };
  function queue(s) {
    const anyS = s;
    anyS.queued ??= [];
    return anyS.queued;
  }
  function triggersOf(s, p, ev) {
    return rulesOf(s, p).triggers.map((t, index) => ({ t, index })).filter((x) => x.t.event === ev);
  }
  function fire(s, src, ev, about) {
    const perm = findPerm(s, src.iid) ?? src;
    for (const q of s.battlefield)
      for (const { t, index } of triggersOf(s, q, ev))
        if (t.granted && q.controller === src.controller && reached(q, t.threshold) && "counters" in perm && matches(s, t.granted, perm, q.controller, src.controller, void 0, perm))
          queue(s).push({ iid: src.iid, card: q.card, flipped: q.flipped, controller: src.controller, index, about });
    for (const q of s.battlefield)
      if (q.attachedTo === src.iid) {
        for (const { t, index } of triggersOf(s, q, ev)) if (t.equipped) queue(s).push({ iid: q.iid, card: q.card, flipped: q.flipped, controller: q.controller, index, about });
      }
    for (const { index } of triggersOf(s, src, ev).filter((x) => reached(src, x.t.threshold) && !x.t.granted && !x.t.equipped)) queue(s).push({ iid: src.iid, card: src.card, flipped: src.flipped, controller: src.controller, index, about });
  }
  function onEnter(s, p) {
    p.enteredTurn = s.turn;
    const r = rulesOf(s, p);
    if (r.chapters?.length) {
      p.counters.lore = (p.counters.lore ?? 0) + 1;
      chapter(s, p);
    }
    fire(s, p, "etb");
    if (p.commander) {
      for (const q of s.battlefield) if (q.controller === p.controller) fire(s, q, "commanderEtb", p.iid);
    }
    for (const q of s.battlefield) {
      if (q.iid === p.iid) {
        continue;
      }
      for (const { t, index } of triggersOf(s, q, "otherEtb")) {
        if (t.filter && matches(s, t.filter, p, q.controller, p.controller, q.iid, p)) queue(s).push({ iid: q.iid, card: q.card, flipped: q.flipped, controller: q.controller, index, about: p.iid });
      }
      if (isType(s, p, "land") && p.controller === q.controller) fire(s, q, "landfall", p.iid);
    }
    if (isType(s, p, "land")) fire(s, p, "landfall", p.iid);
  }
  function moveCard(s, iid, to, opts = {}) {
    const before = findPerm(s, iid);
    const snap2 = before ? clone(before) : null;
    const gear = before ? s.battlefield.filter((q) => q.attachedTo === iid).map((q) => clone(q)) : [];
    const d = detach(s, iid);
    if (!d) return;
    const { obj, from } = d;
    let dest = to;
    if (obj.commander && !opts.manual && from !== "command" && ["graveyard", "exile", "library", "libraryBottom"].includes(to)) dest = "command";
    if (snap2) {
      for (const q of s.battlefield) if (q.mods.some((m) => m.note === `while:${snap2.iid}`)) q.mods = q.mods.filter((m) => m.note !== `while:${snap2.iid}`);
      if (isCreatureSnap(s, snap2)) (s.lastPower ??= {})[snap2.iid] = pt(s, { ...snap2, controller: snap2.controller })[0];
      for (const k of Object.keys(snap2.counters)) if (k.startsWith("holding:")) {
        const held = Number(k.slice(8));
        const l = locate(s, held);
        if (l && l.zone === "exile") moveCard(s, held, "battlefield", { controller: l.obj.owner, manual: true });
      }
      if (to === "graveyard" && isCreatureSnap(s, snap2)) {
        ;
        (s.diedThisTurn ??= {})[snap2.iid] = s.turn;
        for (const m of snap2.mods) if (m.note?.startsWith("fought:")) drawCards(s, Number(m.note.slice(7)), 1);
        fire(s, snap2, "dies");
        for (const q of gear) for (const { t, index } of triggersOf(s, q, "dies")) if (t.equipped) queue(s).push({ iid: q.iid, card: q.card, controller: q.controller, index });
        for (const q of s.battlefield)
          for (const { t, index } of triggersOf(s, q, "otherDies"))
            if (t.filter && matches(s, t.filter, snap2, q.controller, snap2.controller, q.iid, snap2)) queue(s).push({ iid: q.iid, card: q.card, flipped: q.flipped, controller: q.controller, index, about: snap2.iid });
      }
      fire(s, snap2, "ltb");
      for (const q of s.battlefield) if (q.attachedTo === iid) q.attachedTo = void 0;
    }
    if (obj.token && dest !== "battlefield") {
      if (snap2) log(s, `${cardName(s, obj.card)} token ${to === "graveyard" ? "dies" : "leaves the battlefield"}.`);
      return;
    }
    const owner = s.players[obj.owner];
    const plain = { iid: obj.iid, card: obj.card, owner: obj.owner, token: obj.token, commander: obj.commander };
    switch (dest) {
      case "battlefield": {
        const controller = opts.controller ?? (from === "battlefield" && snap2 ? snap2.controller : obj.owner);
        let tapped = !!opts.tapped;
        const r = rulesOf(s, { card: obj.card, flipped: opts.flipped });
        if (r.types.includes("land") && !tapped) tapped = entersTapped(s, obj.card, controller, opts.flipped);
        const p = newPerm(s, plain, controller, { tapped, flipped: opts.flipped });
        const face = opts.flipped && def(s, obj.card).back ? def(s, obj.card).back : def(s, obj.card);
        if (face.loyalty && /^\d+$/.test(face.loyalty)) p.counters.loyalty = Number(face.loyalty);
        if (opts.kicked) p.kicked = opts.kicked;
        const ew = r.entersWith;
        if (ew) {
          const n = ew.n === "x" ? opts.x ?? 0 : ew.n === "kicked" ? opts.kicked ?? 0 : ew.n;
          if (n > 0) p.counters[ew.kind] = (p.counters[ew.kind] ?? 0) + n;
        }
        s.battlefield.push(p);
        onEnter(s, p);
        break;
      }
      case "libraryBottom":
        owner.library.push(plain);
        break;
      case "library":
        owner.library.unshift(plain);
        break;
      case "command":
        owner.command.push(plain);
        if (to !== "command" && !opts.manual) log(s, `${cardName(s, obj.card)} returns to the command zone.`);
        break;
      default:
        owner[dest].push(plain);
    }
    if (snap2 && dest !== "battlefield" && !opts.manual) {
      const verb = to === "graveyard" ? opts.cause === "sacrifice" ? "is sacrificed" : isCreatureSnap(s, snap2) ? "dies" : "is put into the graveyard" : to === "exile" ? "is exiled" : to === "hand" ? "returns to its owner's hand" : "leaves the battlefield";
      log(s, `${cardName(s, obj.card)} ${verb}.`);
    }
  }
  function isCreatureSnap(s, p) {
    return isType(s, p, "creature");
  }
  function entersTapped(s, card, controller, flipped) {
    const et = rulesOf(s, { card, flipped }).entersTapped;
    if (et === "no") return false;
    if (et === "yes") return true;
    const mine2 = s.battlefield.filter((p) => p.controller === controller && isType(s, p, "land"));
    if (et.unlessControl) return !mine2.some((p) => et.unlessControl.some((t) => rulesOf(s, p).subtypes.includes(t)));
    if (et.unlessOtherLands) {
      const n = mine2.length;
      return et.unlessOtherLands[1] === "ge" ? n < et.unlessOtherLands[0] : n > et.unlessOtherLands[0];
    }
    if (et.unlessBasics) return mine2.filter((p) => rulesOf(s, p).supertypes.includes("basic")).length < et.unlessBasics;
    if (et.unlessLegendary) return !s.battlefield.some((p) => p.controller === controller && isCreature(s, p) && rulesOf(s, p).supertypes.includes("legendary"));
    if (et.revealFromHand) return !s.players[controller].hand.some((o) => et.revealFromHand.some((t) => rulesOf(s, o).subtypes.includes(t)));
    return true;
  }
  function destroy(s, iid) {
    const p = findPerm(s, iid);
    if (!p) return false;
    if (hasKw(s, p, "indestructible")) {
      log(s, `${permName(s, p)} is indestructible.`);
      return false;
    }
    moveCard(s, iid, "graveyard");
    return true;
  }
  function dealDamage(s, src, t, n, combat = false) {
    if (n <= 0) return;
    const srcPerm = src.iid !== void 0 ? findPerm(s, src.iid) : void 0;
    const kws = srcPerm ? keywords(s, srcPerm) : rulesOf(s, { card: src.card }).keywords ?? [];
    if (t.kind === "player") {
      const pl = s.players[t.id];
      pl.life -= n;
      if (combat && srcPerm?.commander && s.format.commanderDamage) pl.commanderDamage[srcPerm.card] = (pl.commanderDamage[srcPerm.card] ?? 0) + n;
      if (kws.includes("infect")) {
        pl.life += n;
        pl.poison += n;
      }
      log(s, `${cardName(s, src.card)} deals ${n} damage to ${pl.name}.`);
    } else if (t.kind === "perm") {
      const p = findPerm(s, t.id);
      if (!p) return;
      if (isType(s, p, "planeswalker") && !isCreature(s, p)) p.counters.loyalty = Math.max(0, (p.counters.loyalty ?? 0) - n);
      else {
        if (kws.includes("infect") || kws.includes("wither")) p.counters["-1/-1"] = (p.counters["-1/-1"] ?? 0) + n;
        else p.damage += n;
        if (kws.includes("deathtouch")) p.deathtouched = true;
      }
      log(s, `${cardName(s, src.card)} deals ${n} damage to ${permName(s, p)}.`);
    }
    if (kws.includes("lifelink")) gainLife(s, src.controller, n);
  }
  var tokenSeq = 0;
  function makeTokenDef(s, e, x) {
    const name = e.name;
    const real = Object.values(s.cards).find((c) => c.isToken && c.name.toLowerCase() === name.toLowerCase() && (e.power === void 0 || c.power === String(e.power === -1 ? "*" : e.power)));
    if (real) return real.id;
    const pw = e.power === -1 ? x : e.power;
    const tg = e.toughness === -1 ? x : e.toughness;
    const id = `token:${name}:${pw ?? ""}/${tg ?? ""}:${e.colors.join("")}:${e.keywords.join(",")}`;
    if (!s.cards[id]) {
      void tokenSeq;
      s.cards = { ...s.cards };
      s.cards[id] = {
        id,
        name,
        manaCost: "",
        cmc: 0,
        typeLine: `Token ${e.types}`,
        oracle: e.keywords.map((k) => k[0].toUpperCase() + k.slice(1)).join(", ") + (e.name === "Treasure" ? "\n{T}, Sacrifice this artifact: Add one mana of any color." : e.name === "Clue" ? "\n{2}, Sacrifice this artifact: Draw a card." : e.name === "Food" ? "\n{2}, {T}, Sacrifice this artifact: You gain 3 life." : ""),
        power: pw === void 0 ? void 0 : String(pw),
        toughness: tg === void 0 ? void 0 : String(tg),
        colors: e.colors,
        identity: e.colors,
        keywords: e.keywords,
        isToken: true
      };
      s.cards[id].oracle = s.cards[id].oracle.trim();
    }
    return id;
  }
  function createToken(s, p, card, n, tapped = false) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const o = { iid: s.nextId++, card, owner: p, token: true };
      const perm = newPerm(s, o, p, { tapped });
      s.battlefield.push(perm);
      onEnter(s, perm);
      out.push(o.iid);
    }
    if (n > 0) log(s, `${s.players[p].name} creates ${n === 1 ? "a" : n} ${cardName(s, card)} token${n > 1 ? "s" : ""}.`);
    return out;
  }
  setCastFree((s, p, iid) => castFree(s, p, iid));
  setHooks({
    setTapped,
    later,
    discover,
    move: (s, iid, to, opts) => moveCard(s, iid, to, opts),
    destroy,
    damage: dealDamage,
    draw: (s, p, n) => drawCards(s, p, n),
    createToken,
    makeTokenDef,
    gainLife,
    shuffle
  });
  function manaOptions(s, p, a) {
    switch (a.kind) {
      case "fixed":
        return { options: a.mana, amount: a.amount };
      case "oneOf":
        return { options: a.mana, amount: a.amount };
      case "any":
        return { options: ["W", "U", "B", "R", "G"], amount: a.amount };
      case "identity": {
        const id = s.players[p.controller].identity;
        return { options: id.length ? id : ["C"], amount: 1 };
      }
      case "oppLands": {
        const set = /* @__PURE__ */ new Set();
        for (const q of s.battlefield)
          if (q.controller !== p.controller && isType(s, q, "land")) {
            for (const ma of rulesOf(s, q).manaAbilities) for (const m of ma.kind === "fixed" || ma.kind === "oneOf" ? ma.mana : ma.kind === "any" ? ["W", "U", "B", "R", "G"] : []) if (m !== "C") set.add(m);
          }
        return { options: [...set], amount: set.size ? 1 : 0 };
      }
      case "charge":
        return { options: a.mana, amount: p.counters.charge ?? 0 };
    }
  }
  function canTapForMana(s, p, a) {
    if (a.cost.tap && p.tapped) return false;
    if (a.cost.needLands && s.battlefield.filter((q) => q.controller === p.controller && isType(s, q, "land")).length < a.cost.needLands) return false;
    if (a.cost.needArtifact && !s.battlefield.some((q) => q.controller === p.controller && isType(s, q, "artifact"))) return false;
    if (a.cost.tap && isCreature(s, p) && p.sick && !hasKw(s, p, "haste")) return false;
    return true;
  }
  function manaSources(s, player, skip = []) {
    const out = [];
    for (const p of s.battlefield) {
      if (p.controller !== player || skip.includes(p.iid)) continue;
      const r = rulesOf(s, p);
      const usable = r.manaAbilities.filter((a) => canTapForMana(s, p, a) && !a.cost.sacrificeSelf && !a.cost.life && a.cost.tap && !a.cost.mana);
      if (!usable.length) continue;
      const opts = /* @__PURE__ */ new Set();
      let amount = 0;
      const pain = [];
      let same = false;
      for (const a of usable) {
        const { options, amount: n } = manaOptions(s, p, a);
        options.forEach((m) => opts.add(m));
        if (a.pain) options.filter((m) => m !== "C").forEach((m) => pain.push(m));
        amount = Math.max(amount, n);
        same ||= !!a.sameColor;
      }
      if (!amount || !opts.size) continue;
      const weight = (isCreature(s, p) ? 5 : 0) + (pain.length ? 2 : 0) + (isType(s, p, "land") ? 0 : 1) + opts.size * 0.1;
      out.push({ key: String(p.iid), options: [...opts], amount, sameColor: same, painColors: pain, weight });
    }
    return out;
  }
  function spellCost(s, player, card, fromCommand, back = false, fromGraveyard = false) {
    const d = def(s, card);
    const r = rulesOf(s, { card, flipped: back });
    let c = parseCost(fromGraveyard && r.flashback ? r.flashback : back && d.back ? d.back.manaCost : d.manaCost);
    if (fromCommand) c = addCost(c, 2 * (s.players[player].commanderCasts[card] ?? 0));
    if (r.affinity) c = addCost(c, -s.battlefield.filter((p) => p.controller === player && isType(s, p, "artifact")).length);
    if (r.selfReduce) c = addCost(c, -s.battlefield.filter((p) => (!r.selfReduce.mine || p.controller === player) && matches(s, r.selfReduce.filter, p, player, p.controller, void 0, p)).length);
    for (const q of s.battlefield) {
      if (q.controller !== player) continue;
      const cr = rulesOf(s, q).costReduction;
      if (cr && matches(s, cr.filter, { card, flipped: back }, player, player)) c = addCost(c, -cr.n);
      const cm = COST_MODS[def(s, q.card).name];
      if (cm) c = addCost(c, -cm(s, q, card));
    }
    return c;
  }
  function availableMana(s, player) {
    const pool = Object.values(s.players[player].pool).reduce((a, b) => a + b, 0);
    return pool + manaSources(s, player).reduce((n, x) => n + x.amount, 0);
  }
  function canPay(s, player, cost, x = 0, skip = []) {
    return !!solvePayment(cost, x, s.players[player].pool, manaSources(s, player, skip));
  }
  function pay(s, player, cost, x, skip = []) {
    const pl = s.players[player];
    const plan = solvePayment(cost, x, pl.pool, manaSources(s, player, skip));
    if (!plan) throw new Illegal(`Not enough mana (needs ${costText(cost, x)}).`);
    for (const u of plan.used) {
      const p = findPerm(s, Number(u.key));
      p.tapped = true;
      for (const m of u.mana) pl.pool[m]++;
      const src = manaSources(s, player).length;
      void src;
      const painful = rulesOf(s, p).manaAbilities.some((a) => a.pain && u.mana.some((m) => m !== "C" && (a.kind === "oneOf" ? a.mana.includes(m) : true)));
      if (painful && !rulesOf(s, p).manaAbilities.some((a) => !a.pain && u.mana.every((m) => manaOptions(s, p, a).options.includes(m)))) {
        const n = rulesOf(s, p).manaAbilities.find((a) => a.pain).pain;
        pl.life -= n;
        log(s, `${permName(s, p)} deals ${n} damage to ${pl.name}.`);
      }
    }
    spendPool(s, player, cost, x);
  }
  function spendPool(s, player, cost, x) {
    const pool = s.players[player].pool;
    const take = (m) => {
      if (pool[m] <= 0) throw new Illegal("Not enough mana in pool.");
      pool[m]--;
    };
    for (const m of ["W", "U", "B", "R", "G", "C"]) for (let i = 0; i < (cost.sym[m] ?? 0); i++) take(m);
    for (const m of cost.phyrexian) take(m);
    for (const h of cost.hybrid) {
      const m = h.find((c) => ["W", "U", "B", "R", "G"].includes(c) && pool[c] > 0) ?? null;
      if (m) take(m);
      else takeAny();
    }
    for (let i = 0; i < cost.generic + cost.x * x; i++) takeAny();
    function takeAny() {
      const m = ["C", "W", "U", "B", "R", "G"].filter((c) => pool[c] > 0).sort((a, b) => pool[b] - pool[a])[0];
      if (!m) throw new Illegal("Not enough mana in pool.");
      pool[m]--;
    }
  }
  var isMain = (s) => s.step === "main1" || s.step === "main2";
  var sorceryTime = (s, p) => s.active === p && isMain(s) && s.stack.length === 0;
  var hasPriority = (s, p) => s.pending.kind === "priority" && s.pending.player === p;
  function extraLands(s, p) {
    return s.battlefield.filter((q) => q.controller === p && rulesOf(s, q).extraLand).length;
  }
  function canPlayLand(s, p, iid, back = false) {
    if (!hasPriority(s, p)) return "Wait for your turn to act.";
    if (!sorceryTime(s, p)) return "Lands can be played in your main phase when the stack is empty.";
    const pl = s.players[p];
    const o = pl.hand.find((x) => x.iid === iid) ?? pl.exile.find((x) => x.iid === iid && pl.playable?.some((q) => q.iid === iid && q.until >= s.turn));
    if (!o) return "That card is not in your hand.";
    if (!rulesOf(s, { card: o.card, flipped: back }).types.includes("land")) return "That is not a land.";
    if (s.players[p].landsPlayed >= 1 + extraLands(s, p)) return "You already played a land this turn.";
    return null;
  }
  function castableFrom(s, p, iid, free = false) {
    const pl = s.players[p];
    const h = pl.hand.find((x) => x.iid === iid);
    if (h) return { obj: h, zone: "hand" };
    const c = pl.command.find((x) => x.iid === iid);
    if (c) return { obj: c, zone: "command" };
    const g = pl.graveyard.find((x) => x.iid === iid);
    if (g && (free || rulesOf(s, g).flashback)) return { obj: g, zone: "graveyard" };
    const e = pl.exile.find((x) => x.iid === iid);
    if (e && (free || pl.playable?.some((x) => x.iid === iid && x.until >= s.turn))) return { obj: e, zone: "exile" };
    if (free) {
      const l = pl.library.find((x) => x.iid === iid);
      if (l) return { obj: l, zone: "library" };
    }
    return null;
  }
  function canCast(s, p, iid, back = false, checkMana = true) {
    if (!hasPriority(s, p)) return "Wait until you have priority.";
    const f = castableFrom(s, p, iid);
    if (!f) return "You can only cast cards from your hand or command zone.";
    const r = rulesOf(s, { card: f.obj.card, flipped: back });
    if (r.types.includes("land")) return 'Play lands with "Play land".';
    const instant = r.types.includes("instant") || r.keywords.includes("flash");
    if (!instant && !sorceryTime(s, p)) return "This can only be cast in your main phase when the stack is empty.";
    if (checkMana) {
      const cost = spellCost(s, p, f.obj.card, f.zone === "command", back);
      if (!canPay(s, p, cost, 0)) return `Not enough mana (needs ${costText(cost, r.hasX ? void 0 : 0)}).`;
    }
    return null;
  }
  function abilityProblem(s, p, perm, a) {
    if (!hasPriority(s, p)) return "Wait until you have priority.";
    if (perm.controller !== p) return "You don\u2019t control that.";
    if (!reached(perm, a.threshold)) return `Needs ${a.threshold} charge counters.`;
    if (a.station && !s.battlefield.some((q) => q.controller === p && q.iid !== perm.iid && !q.tapped && isCreature(s, q))) return "You need another untapped creature to station it.";
    if ((a.sorcery || a.equip) && !sorceryTime(s, p)) return "Only in your main phase when the stack is empty.";
    if (a.cost.tap && perm.tapped) return "It is tapped.";
    if (a.cost.untap && !perm.tapped) return "It is untapped.";
    if (a.cost.tap && isCreature(s, perm) && perm.sick && !hasKw(s, perm, "haste")) return "It has summoning sickness.";
    if (a.oncePerTurn && (perm.used?.[a.index] ?? 0) >= 1) return "Already used this turn.";
    if (a.loyalty && Object.entries(perm.used ?? {}).some(([k, v]) => k.startsWith("loyalty") && v > 0)) return "Only one loyalty ability per turn.";
    if (a.cost.loyalty !== void 0 && a.cost.loyalty < 0 && (perm.counters.loyalty ?? 0) < -a.cost.loyalty) return "Not enough loyalty.";
    if (a.cost.life && s.players[p].life < a.cost.life) return "Not enough life.";
    if (a.cost.tapOther && !s.battlefield.some((q) => q.controller === p && q.iid !== perm.iid && !q.tapped && isCreature(s, q))) return "You need another untapped creature.";
    if (a.cost.sacrifice && !s.battlefield.some((q) => q.controller === p && q.iid !== perm.iid && matches(s, a.cost.sacrifice, q, p, p, void 0, q))) return "You have nothing to sacrifice for it.";
    if (a.cost.removeCounters) {
      const rc = a.cost.removeCounters;
      const have = rc.fromAmong ? s.battlefield.filter((q) => q.controller === p).reduce((n, q) => n + (q.counters[rc.kind ?? ""] ?? 0), 0) : rc.kind ? perm.counters[rc.kind] ?? 0 : Object.values(perm.counters).reduce((n, v) => n + v, 0);
      if (have < rc.n) return "Not enough counters.";
    }
    if (a.cost.mana && !canPay(s, p, parseCost(a.cost.mana), 0, a.cost.tap ? [perm.iid] : [])) return `Not enough mana (needs ${a.cost.mana}).`;
    return null;
  }
  function canAct(s, p) {
    const pl = s.players[p];
    if (availableMana(s, p) === 0 && !s.battlefield.some((q) => q.controller === p && rulesOf(s, q).activated.some((a) => !a.cost.mana && !abilityProblem(s, p, q, a)))) {
      return false;
    }
    for (const o of [...pl.hand, ...pl.command]) {
      const r = rulesOf(s, o);
      if (r.types.includes("land")) continue;
      if (!(r.types.includes("instant") || r.keywords.includes("flash")) && !sorceryTime(s, p)) continue;
      if (!canCast(s, p, o.iid)) return true;
    }
    for (const q of s.battlefield) {
      if (q.controller !== p) continue;
      for (const a of rulesOf(s, q).activated) if (!a.equip && !a.sorcery && !abilityProblem(s, p, q, a)) return true;
    }
    return false;
  }
  function addTask(s, kind, player, data) {
    s.tasks.push({ tid: s.nextId++, kind, player, answers: {}, data });
  }
  function spellCompiled(s, card, back = false) {
    const d = def(s, card);
    const name = back && d.back ? d.back.name : d.name;
    if (NAMED[name]) return NAMED[name].spell;
    return rulesOf(s, { card, flipped: back }).spell;
  }
  function runTask(s, task) {
    const draft = cloneState(s);
    draft.tasks = draft.tasks.filter((t) => t.tid !== task.tid);
    const ctx = makeCtx(draft, task);
    try {
      switch (task.kind) {
        case "cast":
          doCast(ctx);
          break;
        case "activate":
          doActivate(ctx);
          break;
        case "trigger":
          doTrigger(ctx);
          break;
        case "resolve":
          doResolve(ctx);
          break;
        case "script":
          doScript(ctx);
          break;
      }
    } catch (e) {
      if (e instanceof NeedChoice) {
        s.pending = { kind: "choose", player: e.player, question: e.question, task: task.tid };
        return s;
      }
      if (e instanceof Illegal && (task.kind === "cast" || task.kind === "activate")) {
        s.tasks = s.tasks.filter((t) => t.tid !== task.tid);
        const pl = s.players[task.player];
        pl.failed = [...(pl.failed ?? []).filter((f) => f.turn === s.turn), { iid: task.data.iid, turn: s.turn }];
        s.notice = { player: task.player, text: e.message };
        s.pending = { kind: "priority", player: task.player };
        return s;
      }
      throw e;
    }
    return draft;
  }
  function doCast(ctx) {
    const s = ctx.s;
    const { iid, back, free } = ctx.task.data;
    const p = ctx.task.player;
    const f = castableFrom(s, p, iid, free);
    if (!f) throw new Illegal("That card is no longer available.");
    const card = f.obj.card;
    const r = rulesOf(s, { card, flipped: back });
    const flashback = f.zone === "graveyard" && !free;
    let cost = free ? parseCost("") : spellCost(s, p, card, f.zone === "command", back, flashback);
    let kicked = 0;
    const extra = r.kicker ?? r.multikicker ?? r.squad;
    if (extra && !free) {
      const many = !r.kicker;
      const opts = [];
      for (let k = 0; k <= (many ? 6 : 1); k++) {
        let c2 = cost;
        for (let j = 0; j < k; j++) c2 = joinCost(c2, parseCost(extra));
        if (canPay(s, p, c2, 0)) opts.push({ id: String(k), label: k === 0 ? `Don\u2019t pay ${r.kicker ? "kicker" : r.squad ? "squad" : "multikicker"}` : `Pay ${extra}${many ? ` \xD7${k}` : ""}`, score: k });
      }
      if (opts.length > 1) kicked = Number(ctx.ask(p, { key: "kick", prompt: `${cardName(s, card)}: pay ${r.kicker ? "kicker" : r.squad ? "squad (one copy each)" : "multikicker"} ${extra}?`, options: opts, min: 1, max: 1 })[0]);
      for (let j = 0; j < kicked; j++) cost = joinCost(cost, parseCost(extra));
    }
    let x = 0;
    if (cost.x > 0) {
      const opts = [];
      for (let i = 0; i <= 20; i++) if (canPay(s, p, cost, i)) opts.push({ id: String(i), label: `X = ${i}`, score: i });
      if (!opts.length) throw new Illegal("Not enough mana.");
      x = Number(ctx.ask(p, { key: "x", prompt: `${cardName(s, card)}: choose X`, options: opts, min: 1, max: 1 })[0]);
    }
    let targets = [];
    let manual2 = false;
    let modes;
    if (r.modal) {
      const m = r.modal;
      const usable = (md) => !md.compiled || md.compiled.targets.every((t) => (t.min ?? 1) === 0 || targetOptions(s, t, p, { card }).length >= (t.min ?? 1));
      const opts = m.modes.map((md, i) => ({ id: String(i), label: md.text + (md.compiled ? "" : " (by hand)"), score: md.compiled ? 1 : 0, ok: usable(md) })).filter((o) => o.ok).map(({ ok, ...o }) => (void ok, o));
      if (opts.length < (m.upTo ? 1 : Math.min(m.n, m.modes.length))) throw new Illegal("Not enough of its modes can be chosen right now.");
      modes = ctx.ask(p, { key: "modes", prompt: `${cardName(s, card)}: choose ${m.n === 1 ? "one" : m.upTo ? "one or both" : "two"}`, options: opts, min: m.upTo ? 1 : Math.min(m.n, opts.length), max: Math.min(m.n, opts.length) }).map(Number).sort((a, b) => a - b);
      const comp = modalCompiled(r, modes);
      if (comp) {
        const t = chooseTargets(ctx, comp, p, { card }, "c");
        if (!t) throw new Illegal("There are no legal targets for those modes.");
        targets = t;
      } else manual2 = true;
    } else if (r.types.includes("instant") || r.types.includes("sorcery")) {
      const comp = spellCompiled(s, card, back);
      if (comp) {
        const t = chooseTargets(ctx, comp, p, { card }, "c");
        if (!t) throw new Illegal("There are no legal targets.");
        targets = t;
      } else manual2 = true;
    } else if (r.subtypes.includes("Aura") && r.enchant) {
      const t = chooseTargets(ctx, { targets: [{ kind: "perm", filter: r.enchant }], effects: [] }, p, { card }, "c");
      if (!t) throw new Illegal("There is nothing it can enchant.");
      targets = t;
    }
    const ec = r.extraCost;
    if (ec && !free) {
      if (ec.lifeX) {
        const opts = [];
        for (let i = 0; i <= Math.max(0, s.players[p].life - 1); i++) opts.push({ id: String(i), label: `Pay ${i} life`, score: i });
        x = Number(ctx.ask(p, { key: "lifex", prompt: `${cardName(s, card)}: pay X life`, options: opts.slice(0, 21), min: 1, max: 1 })[0]);
      }
      if (ec.discard) {
        const others = s.players[p].hand.filter((o) => o.iid !== iid);
        let payLife = false;
        if (ec.orLife) {
          const opts = [{ id: "life", label: `Pay ${ec.orLife} life`, score: s.players[p].life > 10 ? 2 : 0 }];
          if (others.length) opts.push({ id: "discard", label: "Discard a card", score: 1 });
          payLife = ctx.ask(p, { key: "orlife", prompt: `${cardName(s, card)}: additional cost`, options: opts, min: 1, max: 1 })[0] === "life";
        }
        if (!payLife) {
          if (others.length < ec.discard) throw new Illegal("You need a card to discard.");
          const picks = ctx.ask(p, { key: "ecd", prompt: `${cardName(s, card)}: discard ${ec.discard} as an additional cost`, options: others.map((o) => ({ id: String(o.iid), label: cardName(s, o.card), card: o.card, iid: o.iid, score: -def(s, o.card).cmc })), min: ec.discard, max: ec.discard, cards: true });
          for (const id of picks) moveCard(s, Number(id), "graveyard");
        } else s.players[p].life -= ec.orLife;
      }
      if (ec.sacrifice) {
        const opts = s.battlefield.filter((q) => q.controller === p && matches(s, ec.sacrifice, q, p, p, void 0, q));
        if (!opts.length) throw new Illegal("You have nothing to sacrifice for it.");
        const [pick] = ctx.ask(p, { key: "ecs", prompt: `${cardName(s, card)}: sacrifice as an additional cost`, options: opts.map((q) => ({ id: String(q.iid), label: permName(s, q), card: q.card, iid: q.iid, score: -def(s, q.card).cmc })), min: 1, max: 1, cards: true });
        moveCard(s, Number(pick), "graveyard", { cause: "sacrifice" });
      }
      if (ec.lifeX) s.players[p].life -= x;
    }
    if (!free) pay(s, p, cost, x);
    const it = detach(s, iid);
    if (f.zone === "command") s.players[p].commanderCasts[card] = (s.players[p].commanderCasts[card] ?? 0) + 1;
    s.players[p].playable = s.players[p].playable?.filter((q) => q.iid !== iid);
    s.stack.push({ sid: s.nextId++, kind: "spell", controller: p, card, iid, obj: it.obj, text: back && def(s, card).back ? def(s, card).back.name : cardName(s, card), targets, x, fromCommand: f.zone === "command", manual: manual2, modes, kicked: kicked || void 0, flashback: flashback || void 0, rebound: f.zone === "hand" && /^Rebound\b/m.test(def(s, card).oracle) || void 0, ...back ? { ability: -1 } : {} });
    log(s, `${s.players[p].name} casts ${cardName(s, card)}${f.zone === "command" ? " from the command zone" : flashback ? " with flashback" : free ? " without paying its mana cost" : ""}${x ? ` (X=${x})` : ""}${kicked ? " (kicked)" : ""}${targets.length ? ` targeting ${targets.map((t) => targetName(s, t)).join(", ")}` : ""}.`);
    for (const { index } of triggersOf(s, { card }, "cast")) queue(s).push({ iid, card, controller: p, index });
    for (const q of s.battlefield)
      for (const { t, index } of triggersOf(s, q, "castSpell"))
        if (reached(q, t.threshold) && (t.who === "any" || t.who === "you" === (q.controller === p)) && (!t.filter || matches(s, t.filter, { card }, q.controller, p)))
          queue(s).push({ iid: q.iid, card: q.card, flipped: q.flipped, controller: q.controller, index, about: iid });
    afterStackAdd(s, p);
  }
  function joinCost(a, b) {
    const sym = { ...a.sym };
    for (const [k, v] of Object.entries(b.sym)) sym[k] = (sym[k] ?? 0) + (v ?? 0);
    return { generic: a.generic + b.generic, sym, hybrid: [...a.hybrid, ...b.hybrid], x: a.x + b.x, phyrexian: [...a.phyrexian, ...b.phyrexian] };
  }
  function modalCompiled(r, modes) {
    const out = { targets: [], effects: [] };
    for (const i of modes) {
      const c = r.modal?.modes[i]?.compiled;
      if (!c) return null;
      const base = out.targets.length;
      out.targets.push(...c.targets);
      for (const e of c.effects) out.effects.push(renumber(e, base));
    }
    return out;
  }
  function renumber(e, base) {
    const x = { ...e };
    for (const k of ["t", "a", "b"]) if (typeof x[k] === "number") x[k] = x[k] + base;
    return x;
  }
  function targetName(s, t) {
    if (t.kind === "player") return s.players[t.id].name;
    if (t.kind === "stack") {
      const it = s.stack.find((x) => x.sid === t.id);
      return it ? cardName(s, it.card) : "a spell";
    }
    const p = findPerm(s, t.id);
    return p ? permName(s, p) : "a permanent";
  }
  function afterStackAdd(s, p) {
    s.passes = 1;
    s.pending = { kind: "priority", player: opp(p) };
  }
  function doActivate(ctx) {
    const s = ctx.s;
    const { iid, ability } = ctx.task.data;
    const p = ctx.task.player;
    const perm = findPerm(s, iid);
    if (!perm) throw new Illegal("That permanent is gone.");
    const a = rulesOf(s, perm).activated.find((x2) => x2.index === ability);
    if (!a) throw new Illegal("No such ability.");
    const problem = abilityProblem(s, p, perm, a);
    if (problem) throw new Illegal(problem);
    let targets = [];
    if (a.compiled && a.compiled.targets.length) {
      const t = chooseTargets(ctx, a.compiled, p, { card: perm.card, iid: perm.iid }, "a");
      if (!t) throw new Illegal("There are no legal targets.");
      targets = t;
    }
    let x;
    if (a.station) {
      const crew = s.battlefield.filter((q) => q.controller === p && q.iid !== iid && !q.tapped && isCreature(s, q));
      const [pick] = ctx.ask(p, { key: "st", prompt: `Station ${permName(s, perm)}: tap which creature? (its power becomes charge counters)`, options: crew.map((q) => ({ id: String(q.iid), label: `${permName(s, q)} (${pt(s, q)[0]})`, card: q.card, iid: q.iid, score: pt(s, q)[0] })), min: 1, max: 1, cards: true });
      const c = findPerm(s, Number(pick));
      c.tapped = true;
      x = Math.max(0, pt(s, c)[0]);
    }
    if (a.cost.discard) {
      if (s.players[p].hand.length < a.cost.discard) throw new Illegal("You have no card to discard.");
      discard(ctx, p, a.cost.discard, "cd");
    }
    if (a.cost.mana) pay(s, p, parseCost(a.cost.mana), 0, a.cost.tap ? [perm.iid] : []);
    if (a.cost.tapOther) {
      const crew = s.battlefield.filter((q) => q.controller === p && q.iid !== iid && !q.tapped && isCreature(s, q));
      const [pick] = ctx.ask(p, { key: "tapo", prompt: `${permName(s, perm)}: tap an untapped creature you control`, options: crew.map((q) => ({ id: String(q.iid), label: permName(s, q), card: q.card, iid: q.iid, score: -pt(s, q)[0] })), min: 1, max: 1, cards: true });
      setTapped(s, findPerm(s, Number(pick)), true);
    }
    if (a.cost.removeCounters) {
      const rc = a.cost.removeCounters;
      let left = rc.n;
      const pool = rc.fromAmong ? s.battlefield.filter((q) => q.controller === p) : [perm];
      for (const q of pool)
        for (const k of rc.kind ? [rc.kind] : Object.keys(q.counters)) {
          while (left > 0 && (q.counters[k] ?? 0) > 0) {
            q.counters[k]--;
            left--;
          }
        }
    }
    if (a.cost.tap) setTapped(s, perm, true);
    if (a.cost.untap) perm.tapped = false;
    if (a.cost.life) s.players[p].life -= a.cost.life;
    if (a.cost.loyalty !== void 0) {
      perm.counters.loyalty = (perm.counters.loyalty ?? 0) + a.cost.loyalty;
      perm.used = { ...perm.used ?? {}, loyalty: 1 };
    }
    perm.used = { ...perm.used ?? {}, [a.index]: (perm.used?.[a.index] ?? 0) + 1 };
    const card = perm.card;
    let sacrificed;
    if (a.cost.sacrifice) {
      const opts = s.battlefield.filter((q) => q.controller === p && q.iid !== iid && matches(s, a.cost.sacrifice, q, p, p, void 0, q));
      const [pick] = ctx.ask(p, { key: "sacc", prompt: `${permName(s, perm)}: sacrifice ${a.cost.sacrifice.subtypes?.join(" or ") || a.cost.sacrifice.types.join(" or ") || "a permanent"}`, options: opts.map((q) => ({ id: String(q.iid), label: permName(s, q), card: q.card, iid: q.iid, score: -def(s, q.card).cmc })), min: 1, max: 1, cards: true });
      moveCard(s, Number(pick), "graveyard", { cause: "sacrifice" });
      sacrificed = Number(pick);
    }
    if (a.cost.sacrificeSelf) moveCard(s, iid, "graveyard", { cause: "sacrifice" });
    s.stack.push({ sid: s.nextId++, kind: "ability", controller: p, card, iid, text: a.station ? `Station: +${x} charge` : a.text, ability: a.index, targets, x, manual: !a.compiled || !!a.cost.other, about: sacrificed });
    log(s, `${s.players[p].name} activates ${cardName(s, card)}${a.equip ? " (equip)" : ""}${targets.length ? ` targeting ${targets.map((t) => targetName(s, t)).join(", ")}` : ""}.${a.cost.other ? ` (Pay by hand: ${a.cost.other}.)` : ""}`);
    afterStackAdd(s, p);
  }
  function doTrigger(ctx) {
    const s = ctx.s;
    const q = ctx.task.data;
    const r0 = rulesOf(s, { card: q.card, flipped: q.flipped });
    const chapterIdx = q.index <= -100 ? -100 - q.index : -1;
    const ch = chapterIdx >= 0 ? r0.chapters?.[chapterIdx] : void 0;
    const t = ch ? { index: q.index, event: "etb", text: `Chapter: ${ch.text}`, effectText: ch.text, compiled: ch.compiled } : r0.triggers[q.index];
    if (!t) return;
    let targets = [];
    if (t.compiled && t.compiled.targets.length) {
      const tt = chooseTargets(ctx, t.compiled, q.controller, { card: q.card, iid: q.iid }, "g");
      if (!tt) {
        log(s, `${cardName(s, q.card)}'s ability has no legal targets.`);
        return;
      }
      targets = tt;
    }
    s.stack.push({ sid: s.nextId++, kind: "trigger", controller: q.controller, card: q.card, iid: q.iid, text: t.text, ability: q.index, targets, manual: !t.compiled, flipped: q.flipped, chapter: ch ? chapterIdx : void 0, x: t.event === "combatDamagePlayer" && typeof q.about === "number" ? q.about : void 0, about: t.event === "combatDamagePlayer" ? void 0 : q.about });
    s.passes = 0;
    s.pending = { kind: "priority", player: s.active };
  }
  function doResolve(ctx) {
    const s = ctx.s;
    const it = s.stack[s.stack.length - 1];
    if (!it) return;
    const me = it.controller;
    if (it.manual) {
      const text = it.kind === "spell" ? def(s, it.card).oracle : it.text;
      ctx.ask(me, { key: "manual", prompt: `${cardName(s, it.card)} \u2014 do this by hand with the table tools, then press Done:
${text}`, options: [{ id: "done", label: "Done", card: it.card, score: 1 }, { id: "skip", label: "Skip it" }], min: 1, max: 1 });
    }
    s.stack.pop();
    if (it.kind === "spell") {
      const back = it.ability === -1;
      const r2 = rulesOf(s, { card: it.card, flipped: back });
      if (!isPermanentCard(s, it.card, back)) {
        const comp = it.modes ? modalCompiled(r2, it.modes) : spellCompiled(s, it.card, back);
        if (comp && !it.manual) {
          const legal = it.targets.map((t2, j) => {
            const spec = comp.targets[t2.spec ?? j];
            return !!spec && stillLegal(s, spec, t2, me, { card: it.card });
          });
          if (it.targets.length && legal.every((l) => !l)) log(s, `${cardName(s, it.card)} has no legal targets and does nothing.`);
          else runCompiled(ctx, it, comp);
        }
        if (it.obj && !it.copy) {
          const o = it.obj;
          s.players[o.owner][it.flashback || it.rebound ? "exile" : "graveyard"].push(o);
          if (it.rebound) {
            later(s, { at: "upkeep", kind: "rebound", iid: o.iid, owner: o.owner });
            log(s, `${cardName(s, it.card)} is exiled with rebound.`);
          }
          if (o.commander) moveCard(s, o.iid, "command");
        }
        log(s, `${cardName(s, it.card)} resolves.`);
      } else {
        if (it.copy) return;
        const o = it.obj;
        s.players[o.owner].exile.push(o);
        if (r2.subtypes.includes("Aura")) {
          const tgt = it.targets[0];
          const host = tgt && tgt.kind === "perm" ? findPerm(s, tgt.id) : void 0;
          if (!host) {
            moveCard(s, o.iid, "graveyard", { manual: true });
            log(s, `${cardName(s, it.card)} has nothing to enchant and goes to the graveyard.`);
            return;
          }
          moveCard(s, o.iid, "battlefield", { controller: me, flipped: back });
          const perm = findPerm(s, o.iid);
          if (perm) perm.attachedTo = host.iid;
        } else moveCard(s, o.iid, "battlefield", { controller: me, flipped: back, kicked: it.kicked, x: it.x });
        if (r2.squad && it.kicked) createToken(s, me, it.card, it.kicked);
        log(s, `${cardName(s, it.card)} enters the battlefield.`);
      }
      return;
    }
    const flipped = it.flipped;
    const r = rulesOf(s, { card: it.card, flipped });
    if (it.kind === "ability") {
      const a = r.activated.find((x) => x.index === it.ability);
      if (a?.equip) {
        const eq = findPerm(s, it.iid);
        const host = it.targets[0] ? findPerm(s, it.targets[0].id) : void 0;
        if (eq && host && host.controller === me && isCreature(s, host)) {
          eq.attachedTo = host.iid;
          log(s, `${permName(s, eq)} is attached to ${permName(s, host)}.`);
        }
        return;
      }
      if (a?.station) {
        const sc = findPerm(s, it.iid);
        if (sc) {
          sc.counters.charge = (sc.counters.charge ?? 0) + (it.x ?? 0);
          log(s, `${permName(s, sc)} now has ${sc.counters.charge} charge counters.`);
        }
        return;
      }
      if (a?.compiled && !it.manual) runCompiled(ctx, it, a.compiled);
      return;
    }
    if (it.chapter !== void 0) {
      const c = r.chapters?.[it.chapter]?.compiled;
      if (c && !it.manual) runCompiled(ctx, it, c);
      return;
    }
    const t = r.triggers[it.ability ?? -1];
    if (t?.compiled && !it.manual) runCompiled(ctx, it, t.compiled);
  }
  function doScript(ctx) {
    const s = ctx.s;
    const d = ctx.task.data;
    if (d.kind === "cycleSearch") {
      search(ctx, ctx.task.player, { e: "search", filter: { types: ["land"], not: [], basic: true }, count: 1, dest: "hand", tapped: false, reveal: true }, "cs");
      return;
    }
    if (d.kind === "cleanupDiscard") {
      const p = s.active;
      const n = s.players[p].hand.length - 7;
      if (n > 0) discard(ctx, p, n, "cl");
    }
  }
  function checkSBA(s) {
    let changed = false;
    for (const pl of s.players) {
      if (pl.lost) continue;
      if (pl.life <= 0) pl.lost = "life total 0";
      else if (pl.poison >= 10) pl.lost = "10 poison counters";
      else if (pl.drewFromEmpty) pl.lost = "drew from an empty library";
      else if (s.format.commanderDamage && Object.values(pl.commanderDamage).some((v) => v >= 21)) pl.lost = "21 commander damage";
      if (pl.lost) {
        log(s, `${pl.name} loses (${pl.lost}).`);
        changed = true;
      }
    }
    const losers = s.players.filter((p) => p.lost).length;
    if (losers > 0) {
      const alive = s.players.findIndex((p) => !p.lost);
      s.pending = { kind: "over", winner: losers === 2 ? null : alive };
      return true;
    }
    for (const p of s.battlefield) {
      const a = p.counters["+1/+1"] ?? 0;
      const b = p.counters["-1/-1"] ?? 0;
      if (a && b) {
        const m = Math.min(a, b);
        p.counters["+1/+1"] = a - m;
        p.counters["-1/-1"] = b - m;
      }
    }
    for (const p of s.battlefield.slice()) {
      if (!findPerm(s, p.iid)) continue;
      if (isCreature(s, p)) {
        const [, t] = pt(s, p);
        if (t <= 0) {
          moveCard(s, p.iid, "graveyard");
          changed = true;
          continue;
        }
        if ((p.damage >= t || p.deathtouched && p.damage > 0) && !hasKw(s, p, "indestructible")) {
          moveCard(s, p.iid, "graveyard");
          changed = true;
          continue;
        }
      }
      if (isType(s, p, "planeswalker") && !isCreature(s, p) && (p.counters.loyalty ?? 0) <= 0) {
        moveCard(s, p.iid, "graveyard");
        changed = true;
        continue;
      }
      const r = rulesOf(s, p);
      if (r.chapters?.length && (p.counters.lore ?? 0) >= Math.max(...r.chapters.flatMap((c) => c.nums)) && !s.stack.some((it) => it.iid === p.iid && it.chapter !== void 0) && !queue(s).some((q) => q.iid === p.iid) && !s.tasks.some((t) => t.data.iid === p.iid)) {
        moveCard(s, p.iid, "graveyard", { cause: "sacrifice" });
        changed = true;
        continue;
      }
      if (r.subtypes.includes("Aura") && (p.attachedTo === void 0 || !findPerm(s, p.attachedTo))) {
        moveCard(s, p.iid, "graveyard");
        changed = true;
        continue;
      }
      if (r.subtypes.includes("Equipment") && p.attachedTo !== void 0) {
        const h = findPerm(s, p.attachedTo);
        if (!h || !isCreature(s, h)) p.attachedTo = void 0;
      }
    }
    const seen = /* @__PURE__ */ new Map();
    for (const p of s.battlefield.slice().sort((a, b) => b.iid - a.iid)) {
      if (!rulesOf(s, p).supertypes.includes("legendary") || p.faceDown) continue;
      const k = `${p.controller}:${permName(s, p)}`;
      if (seen.has(k)) {
        moveCard(s, p.iid, "graveyard");
        log(s, `Legend rule: the older ${permName(s, p)} goes to the graveyard.`);
        changed = true;
      } else seen.set(k, p);
    }
    return changed;
  }
  var ORDER = ["untap", "upkeep", "draw", "main1", "beginCombat", "attackers", "blockers", "firstDamage", "damage", "endCombat", "main2", "end", "cleanup"];
  function canAttack(s, p) {
    return p.controller === s.active && isCreature(s, p) && !p.tapped && !(p.sick && !hasKw(s, p, "haste")) && !hasKw(s, p, "defender");
  }
  function canBlock(s, blocker, attacker) {
    if (blocker.tapped || !isCreature(s, blocker) || blocker.controller === attacker.controller) return false;
    const ak = keywords(s, attacker);
    const bk = keywords(s, blocker);
    const ar = rulesOf(s, attacker);
    if (bk.includes("cantblock") || rulesOf(s, blocker).cantBlock) return false;
    if (ar.unblockable === true || ar.unblockable === "ifSpacecraft" && s.battlefield.some((q) => q.controller === attacker.controller && rulesOf(s, q).subtypes.includes("Spacecraft"))) return false;
    if (ar.evasionPower !== void 0 && pt(s, blocker)[0] <= ar.evasionPower) return false;
    if ((ak.includes("flying") || ak.includes("horsemanship")) && !bk.includes("flying") && !bk.includes("reach")) return false;
    if (ak.includes("unblockable")) return false;
    if (ak.includes("fear") && !def(s, blocker.card).colors.includes("B") && !isType(s, blocker, "artifact")) return false;
    if (ak.includes("intimidate") && !isType(s, blocker, "artifact") && !def(s, blocker.card).colors.some((c) => def(s, attacker.card).colors.includes(c))) return false;
    if (ak.includes("skulk") && pt(s, blocker)[0] > pt(s, attacker)[0]) return false;
    const names = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
    for (const k of ak) {
      const m = k.match(/^protection from (.+)$/);
      if (m) {
        for (const [w, c] of Object.entries(names)) if (m[1].includes(w) && def(s, blocker.card).colors.includes(c)) return false;
      }
    }
    for (const k of ak) {
      const m = k.match(/^(plains|island|swamp|mountain|forest)walk$/);
      if (m && s.battlefield.some((q) => q.controller === blocker.controller && rulesOf(s, q).subtypes.some((st) => st.toLowerCase() === m[1]))) return false;
    }
    return true;
  }
  function enterStep(s, step) {
    s.step = step;
    s.passes = 0;
    for (const pl of s.players) if (!pl.floating) pl.pool = emptyPool();
    const a = s.active;
    switch (step) {
      case "main1":
        for (const p of s.battlefield)
          if (p.controller === a && rulesOf(s, p).chapters?.length) {
            p.counters.lore = (p.counters.lore ?? 0) + 1;
            chapter(s, p);
          }
        break;
      case "untap": {
        s.turn++;
        const pl = s.players[a];
        pl.landsPlayed = 0;
        for (const x of s.players) x.drawsThisTurn = 0;
        s.diedThisTurn = {};
        for (const p of s.battlefield) {
          if (p.controller === a) {
            if (p.skipUntap) p.skipUntap = false;
            else p.tapped = false;
            p.sick = false;
          } else if (p.tapped && isType(s, p, "artifact") && s.battlefield.some((q) => q.controller === p.controller && cardName(s, q.card) === "Unwinding Clock")) p.tapped = false;
          p.used = void 0;
          p.mods = p.mods.filter((m) => !(m.until === "turn" && (m.expires ?? 0) <= s.turn));
        }
        log(s, `\u2014 Turn ${s.turn}: ${pl.name} \u2014`);
        return enterStep(s, "upkeep");
      }
      case "upkeep":
        runDelayed(s, "upkeep");
        for (const p of s.battlefield) {
          if (p.controller === a) fire(s, p, "upkeep");
          fire(s, p, "eachUpkeep");
        }
        break;
      case "draw":
        if (!(s.turn === 1 && a === s.firstPlayer)) drawCards(s, a, 1, true);
        for (const p of s.battlefield) {
          if (p.controller === a) fire(s, p, "yourDraw");
          fire(s, p, "eachDraw");
        }
        break;
      case "beginCombat": {
        s.combat = { attackers: [], blocks: [], declared: false, blocksDeclared: false, firstStrikeDone: false };
        for (const p of s.battlefield) if (p.controller === a) fire(s, p, "beginCombat");
        if (!queue(s).length && !s.battlefield.some((p) => canAttack(s, p))) {
          s.combat = null;
          return enterStep(s, "main2");
        }
        break;
      }
      case "attackers":
        if (!s.battlefield.some((p) => canAttack(s, p))) {
          s.combat = null;
          return enterStep(s, "main2");
        }
        s.pending = { kind: "attackers", player: a };
        return;
      case "blockers": {
        const c = s.combat;
        if (!c || !c.attackers.length) {
          s.combat = null;
          return enterStep(s, "main2");
        }
        const d = opp(a);
        const any = s.battlefield.some((b) => b.controller === d && c.attackers.some((x) => canBlock(s, b, findPerm(s, x.iid))));
        if (any) {
          s.pending = { kind: "blockers", player: d };
          return;
        }
        c.blocksDeclared = true;
        break;
      }
      case "firstDamage": {
        const c = s.combat;
        if (!c) return enterStep(s, "main2");
        const fs = [...c.attackers.map((x) => x.iid), ...c.blocks.map((b) => b.blocker)].some((iid) => {
          const p = findPerm(s, iid);
          return p && (hasKw(s, p, "first strike") || hasKw(s, p, "double strike"));
        });
        if (!fs) return enterStep(s, "damage");
        combatDamage(s, true);
        break;
      }
      case "damage":
        if (!s.combat) return enterStep(s, "main2");
        combatDamage(s, false);
        break;
      case "endCombat":
        runDelayed(s, "endCombat");
        break;
      case "main2":
        s.combat = null;
        break;
      case "end":
        runDelayed(s, "end");
        for (const p of s.battlefield) {
          if (p.controller === a) fire(s, p, "endStep");
          fire(s, p, "eachEndStep");
        }
        break;
      case "cleanup": {
        runDelayed(s, "cleanup");
        for (const x of s.players) x.floating = 0;
        const pl = s.players[a];
        const noMax = s.battlefield.some((p) => p.controller === a && rulesOf(s, p).noMaxHandSize);
        if (pl.hand.length > 7 && !noMax) addTask(s, "script", a, { kind: "cleanupDiscard" });
        for (const p of s.battlefield) {
          p.damage = 0;
          p.deathtouched = false;
          p.mods = p.mods.filter((m) => m.until !== "eot");
        }
        s.pending = { kind: "priority", player: a };
        return;
      }
    }
    s.pending = { kind: "priority", player: a };
  }
  function nextStep(s) {
    if (s.step === "main2" && (s.extraCombats ?? 0) > 0) {
      s.extraCombats--;
      log(s, `${s.players[s.active].name} gets an additional combat phase.`);
      if ((s.untapAtExtra ?? 0) > 0) {
        s.untapAtExtra--;
        for (const q of s.battlefield) if (q.attackedTurn === s.turn) q.tapped = false;
      }
      return enterStep(s, "beginCombat");
    }
    if (s.step === "cleanup") {
      s.extraCombats = 0;
      s.extraCombatsNow = 0;
      s.untapAtExtra = 0;
      s.active = opp(s.active);
      return enterStep(s, "untap");
    }
    if (s.step === "endCombat") {
      s.combat = null;
      if ((s.extraCombatsNow ?? 0) > 0) {
        s.extraCombatsNow--;
        log(s, `${s.players[s.active].name} gets an additional combat phase.`);
        return enterStep(s, "beginCombat");
      }
      return enterStep(s, "main2");
    }
    const i = ORDER.indexOf(s.step);
    enterStep(s, ORDER[i + 1]);
  }
  function combatDamage(s, first) {
    const c = s.combat;
    const strikes = (p) => {
      const fs = hasKw(s, p, "first strike");
      const ds = hasKw(s, p, "double strike");
      return first ? fs || ds : !fs || ds || !c.firstStrikeDone;
    };
    const dealt = [];
    for (const a of c.attackers) {
      const att = findPerm(s, a.iid);
      if (!att || !strikes(att)) continue;
      if (!first && c.firstStrikeDone && hasKw(s, att, "first strike") && !hasKw(s, att, "double strike")) continue;
      let [power] = pt(s, att);
      if (power <= 0) continue;
      const blockers = c.blocks.filter((b) => b.attacker === a.iid).map((b) => findPerm(s, b.blocker)).filter(Boolean);
      const wasBlocked = c.blocks.some((b) => b.attacker === a.iid);
      if (!wasBlocked) {
        dealt.push({ src: att, t: { kind: "player", id: a.defender }, n: power });
        continue;
      }
      const dt = hasKw(s, att, "deathtouch");
      for (const b of blockers) {
        if (power <= 0) break;
        const [, bt] = pt(s, b);
        const lethal = dt ? 1 : Math.max(0, bt - b.damage);
        const n = blockers.indexOf(b) === blockers.length - 1 && !hasKw(s, att, "trample") ? power : Math.min(power, lethal);
        dealt.push({ src: att, t: { kind: "perm", id: b.iid }, n });
        power -= n;
      }
      if (power > 0 && hasKw(s, att, "trample")) dealt.push({ src: att, t: { kind: "player", id: a.defender }, n: power });
    }
    for (const b of c.blocks) {
      const bl = findPerm(s, b.blocker);
      const att = findPerm(s, b.attacker);
      if (!bl || !att || !strikes(bl)) continue;
      if (!first && c.firstStrikeDone && hasKw(s, bl, "first strike") && !hasKw(s, bl, "double strike")) continue;
      const [power] = pt(s, bl);
      if (power > 0) dealt.push({ src: bl, t: { kind: "perm", id: att.iid }, n: power });
    }
    for (const d of dealt) {
      dealDamage(s, { card: d.src.card, controller: d.src.controller, iid: d.src.iid }, d.t, d.n, true);
      if (d.t.kind === "player") fire(s, d.src, "combatDamagePlayer", d.n);
    }
    const veng = s.vengeance?.filter((v) => v.turn === s.turn) ?? [];
    for (const v of veng)
      for (const d of dealt)
        if (d.t.kind === "player" && d.t.id === v.player && findPerm(s, d.src.iid)) {
          destroy(s, d.src.iid);
          createToken(s, v.player, makeTokenDef(s, { e: "token", n: 1, name: "Klingon Warrior", power: 2, toughness: 1, types: "Creature \u2014 Klingon Warrior", colors: ["R"], keywords: ["haste"] }, 0), 1);
        }
    for (const q of s.battlefield)
      for (const { t, index } of triggersOf(s, q, "teamDamage"))
        if (dealt.some((d) => d.t.kind === "player" && d.src.controller === q.controller && (!t.filter || matches(s, t.filter, d.src, q.controller, d.src.controller, void 0, d.src))))
          queue(s).push({ iid: q.iid, card: q.card, flipped: q.flipped, controller: q.controller, index });
    if (first) c.firstStrikeDone = true;
  }
  function flushTriggers(s) {
    const q = queue(s);
    if (!q.length) return;
    const ordered = [...q.filter((t) => t.controller === s.active), ...q.filter((t) => t.controller !== s.active)];
    q.length = 0;
    for (const t of ordered) addTask(s, "trigger", t.controller, t);
  }
  function wantsStop(s, p) {
    if (s.stack.length) return canAct(s, p);
    if (p === s.active && isMain(s)) return true;
    if (p === s.active && s.step === "cleanup") return false;
    if (p !== s.active && (s.step === "end" || s.step === "blockers" || s.step === "beginCombat")) return canAct(s, p);
    if (p === s.active && s.step === "blockers" && s.combat?.blocks.length) return canAct(s, p);
    return false;
  }
  function passPriority(s, p) {
    s.passes++;
    if (s.passes >= 2) {
      s.passes = 0;
      if (s.stack.length) {
        addTask(s, "resolve", s.stack[s.stack.length - 1].controller, {});
        s.pending = { kind: "priority", player: s.active };
      } else nextStep(s);
    } else s.pending = { kind: "priority", player: opp(p) };
  }
  var collecting = null;
  var frameBase = 0;
  function snap(s) {
    if (!collecting) return;
    const last = collecting[collecting.length - 1];
    if (last ? last.log.length === s.log.length && last.stack.length === s.stack.length : s.log.length === frameBase) return;
    collecting.push(cloneState(s));
  }
  function settle(s) {
    for (let guard = 0; guard < 2e3; guard++) {
      if (s.pending.kind === "over") return s;
      if (s.tasks.length && s.pending.kind !== "choose") {
        const t = s.tasks[0];
        const before = s;
        s = runTask(s, t);
        if (s === before && s.pending.kind === "choose") return s;
        continue;
      }
      if (s.pending.kind === "choose") return s;
      const isOver = (x) => x.pending.kind === "over";
      while (checkSBA(s)) if (isOver(s)) return s;
      if (isOver(s)) return s;
      if (queue(s).length) {
        flushTriggers(s);
        continue;
      }
      if (s.pending.kind === "priority") {
        const p = s.pending.player;
        if (!wantsStop(s, p)) {
          snap(s);
          passPriority(s, p);
          continue;
        }
      }
      return s;
    }
    return s;
  }
  function tryApply(s, intent) {
    const mark = collecting?.length ?? 0;
    try {
      return { state: apply(s, intent) };
    } catch (e) {
      if (collecting) collecting.length = mark;
      if (e instanceof Illegal) return { error: e.message };
      throw e;
    }
  }
  function apply(s0, intent) {
    if (collecting && !collecting.length) frameBase = s0.log.length;
    let s = cloneState(s0);
    s.notice = null;
    const p = intent.player;
    const pend = s.pending;
    const need = (ok, msg) => {
      if (!ok) throw new Illegal(msg);
    };
    switch (intent.type) {
      case "keep":
      case "mulligan": {
        need(pend.kind === "mulligan" && pend.player === p, "Not your mulligan decision.");
        const pl = s.players[p];
        if (intent.type === "mulligan") {
          pl.library.push(...pl.hand);
          pl.hand = [];
          shuffle(s, p);
          drawCards(s, p, 7, true);
          pl.mulligans++;
          log(s, `${pl.name} mulligans.`);
          return s;
        }
        pl.kept = true;
        const bottom = pl.mulligans - (s.format.freeMulligan ? 1 : 0);
        log(s, `${pl.name} keeps ${pl.hand.length - Math.max(0, bottom)} cards.`);
        if (bottom > 0) {
          s.pending = { kind: "bottom", player: p, count: Math.min(bottom, pl.hand.length) };
          return s;
        }
        return afterKeep(s, p);
      }
      case "bottom": {
        need(pend.kind === "bottom" && pend.player === p, "Not now.");
        if (pend.kind !== "bottom") return s;
        need(intent.iids.length === pend.count, `Choose ${pend.count} card(s).`);
        const pl = s.players[p];
        for (const iid of intent.iids) {
          const i = pl.hand.findIndex((o) => o.iid === iid);
          need(i >= 0, "That card is not in your hand.");
          pl.library.push(pl.hand.splice(i, 1)[0]);
        }
        return afterKeep(s, p);
      }
      case "playLand": {
        const why = canPlayLand(s, p, intent.iid, intent.back);
        need(!why, why ?? "");
        s.players[p].landsPlayed++;
        const o = s.players[p].hand.find((x) => x.iid === intent.iid) ?? s.players[p].exile.find((x) => x.iid === intent.iid);
        moveCard(s, intent.iid, "battlefield", { controller: p, flipped: intent.back });
        log(s, `${s.players[p].name} plays ${cardName(s, o.card)}.`);
        break;
      }
      case "cast": {
        const why = canCast(s, p, intent.iid, intent.back, true);
        need(!why, why ?? "");
        addTask(s, "cast", p, { iid: intent.iid, back: intent.back });
        break;
      }
      case "activate": {
        const perm = findPerm(s, intent.iid);
        need(!!perm, "That permanent is gone.");
        const a = rulesOf(s, perm).activated.find((x) => x.index === intent.ability);
        need(!!a, "No such ability.");
        const why = abilityProblem(s, p, perm, a);
        need(!why, why ?? "");
        addTask(s, "activate", p, { iid: intent.iid, ability: intent.ability });
        break;
      }
      case "tapForMana": {
        const perm = findPerm(s, intent.iid);
        need(!!perm && perm.controller === p, "You don\u2019t control that.");
        const a = rulesOf(s, perm).manaAbilities.find((x) => x.index === intent.ability);
        need(!!a, "That has no mana ability.");
        need(canTapForMana(s, perm, a), perm.tapped ? "It is already tapped." : "It has summoning sickness.");
        const { options, amount } = manaOptions(s, perm, a);
        need(amount > 0 && options.length > 0, "It makes no mana right now.");
        const col = intent.color && options.includes(intent.color) ? intent.color : options[0];
        if (a.cost.mana) pay(s, p, parseCost(a.cost.mana), 0, [perm.iid]);
        if (a.cost.life) s.players[p].life -= a.cost.life;
        if (a.cost.tap) perm.tapped = true;
        const pool = s.players[p].pool;
        if (a.kind === "fixed") for (const m of a.mana) pool[m]++;
        else pool[col] += amount;
        if (a.pain && col !== "C") {
          s.players[p].life -= a.pain;
          log(s, `${permName(s, perm)} deals ${a.pain} damage to ${s.players[p].name}.`);
        }
        if (a.cost.sacrificeSelf) moveCard(s, perm.iid, "graveyard", { cause: "sacrifice" });
        break;
      }
      case "pass": {
        need(pend.kind === "priority" && pend.player === p, "You don\u2019t have priority.");
        passPriority(s, p);
        break;
      }
      case "attack": {
        need(pend.kind === "attackers" && pend.player === p, "Not time to declare attackers.");
        const c = s.combat;
        for (const iid of intent.attackers) {
          const a = findPerm(s, iid);
          need(!!a && canAttack(s, a), `${a ? permName(s, a) : "That"} can't attack.`);
        }
        for (const q of s.battlefield)
          if (canAttack(s, q) && (rulesOf(s, q).mustAttack || hasKw(s, q, "goaded")) && !intent.attackers.includes(q.iid)) throw new Illegal(`${permName(s, q)} attacks each combat if able.`);
        c.attackers = intent.attackers.map((iid) => ({ iid, defender: opp(p) }));
        c.declared = true;
        for (const iid of intent.attackers) {
          const a = findPerm(s, iid);
          if (!hasKw(s, a, "vigilance")) setTapped(s, a, true);
          a.attackedTurn = s.turn;
          fire(s, a, "attacks");
        }
        if (intent.attackers.length) {
          const atk = intent.attackers.map((iid) => findPerm(s, iid)).filter(Boolean);
          for (const a of atk) {
            if (hasKw(s, a, "melee")) a.mods.push({ power: 1, toughness: 1, until: "eot" });
            if (hasKw(s, a, "battle cry")) {
              for (const b of atk) if (b !== a) b.mods.push({ power: 1, toughness: 0, until: "eot" });
            }
          }
          for (const sa of s.battlefield.filter((q) => q.controller === p && rulesOf(s, q).sharedAnimosity))
            for (const a of atk) {
              const mine2 = rulesOf(s, a).subtypes;
              const n = atk.filter((b) => b !== a && rulesOf(s, b).subtypes.some((t) => mine2.includes(t))).length;
              if (n) a.mods.push({ power: n, toughness: 0, until: "eot", note: permName(s, sa) });
            }
          for (const q of s.battlefield) if (q.controller === p) fire(s, q, "youAttack");
          for (const a of atk) if (a.commander) {
            for (const q of s.battlefield) if (q.controller === p) fire(s, q, "commanderAttacks", a.iid);
          }
          if (atk.some((a) => hasKw(s, a, "goaded"))) for (const q of s.battlefield) fire(s, q, "goadedAttack");
        }
        if (intent.attackers.length) log(s, `${s.players[p].name} attacks with ${intent.attackers.map((iid) => permName(s, findPerm(s, iid))).join(", ")}.`);
        else {
          s.combat = null;
          enterStep(s, "main2");
          break;
        }
        s.passes = 0;
        s.pending = { kind: "priority", player: s.active };
        break;
      }
      case "block": {
        need(pend.kind === "blockers" && pend.player === p, "Not time to declare blockers.");
        const c = s.combat;
        const used = /* @__PURE__ */ new Set();
        for (const b of intent.blocks) {
          const bl = findPerm(s, b.blocker);
          const at = findPerm(s, b.attacker);
          need(!!bl && !!at && c.attackers.some((x) => x.iid === b.attacker), "Invalid block.");
          need(!used.has(b.blocker), `${permName(s, bl)} can only block one attacker.`);
          need(canBlock(s, bl, at), `${permName(s, bl)} can't block ${permName(s, at)}.`);
          used.add(b.blocker);
        }
        for (const a of c.attackers) {
          const at = findPerm(s, a.iid);
          const n = intent.blocks.filter((b) => b.attacker === a.iid).length;
          need(!(n === 1 && hasKw(s, at, "menace")), `${permName(s, at)} has menace: block it with two or more creatures.`);
        }
        c.blocks = intent.blocks;
        c.blocksDeclared = true;
        for (const b of intent.blocks) fire(s, findPerm(s, b.blocker), "blocks");
        if (intent.blocks.length) log(s, `${s.players[p].name} blocks: ${intent.blocks.map((b) => `${permName(s, findPerm(s, b.blocker))} blocks ${permName(s, findPerm(s, b.attacker))}`).join("; ")}.`);
        else log(s, `${s.players[p].name} doesn't block.`);
        s.passes = 0;
        s.pending = { kind: "priority", player: s.active };
        break;
      }
      case "choose": {
        need(pend.kind === "choose" && pend.player === p, "Nothing to choose.");
        if (pend.kind !== "choose") return s;
        const q = pend.question;
        need(intent.picks.length >= q.min && intent.picks.length <= q.max, q.min === q.max ? `Choose ${q.min}.` : `Choose ${q.min}\u2013${q.max}.`);
        need(intent.picks.every((id) => q.options.some((o) => o.id === id)), "Invalid choice.");
        need(new Set(intent.picks).size === intent.picks.length, "Choose each option once.");
        const task = s.tasks.find((t) => t.tid === pend.task);
        if (task) {
          task.answers[q.key] = intent.picks;
        }
        s.pending = { kind: "priority", player: s.active };
        break;
      }
      case "discard":
        throw new Illegal("Not now.");
      case "concede":
        s.players[p].lost = "conceded";
        log(s, `${s.players[p].name} concedes.`);
        break;
      case "manual":
        manual(s, p, intent.m);
        return s.pending.kind === "choose" ? s : settle(s);
      case "resolveManual":
        break;
      case "cycle": {
        need(pend.kind === "priority" && pend.player === p, "Wait until you have priority.");
        const o = s.players[p].hand.find((x) => x.iid === intent.iid);
        need(!!o, "That card is not in your hand.");
        const cy = rulesOf(s, o).cycling;
        need(!!cy, "That card has no cycling.");
        pay(s, p, parseCost(cy.cost), 0);
        moveCard(s, o.iid, "graveyard");
        log(s, `${s.players[p].name} cycles ${cardName(s, o.card)}.`);
        if (cy.basic) addTask(s, "script", p, { kind: "cycleSearch" });
        else drawCards(s, p, 1);
        break;
      }
    }
    s = settle(s);
    if ((intent.type === "cast" || intent.type === "activate") && s.notice && s.notice.player === p && !s0.notice) throw new Illegal(s.notice.text);
    return s;
  }
  function afterKeep(s, p) {
    const o = opp(p);
    if (!s.players[o].kept) {
      s.pending = { kind: "mulligan", player: o };
      return s;
    }
    s.active = s.firstPlayer;
    s.turn = 0;
    enterStep(s, "untap");
    return settle(s);
  }
  function manual(s, p, m) {
    const who = s.players[p].name;
    const nameOf = (iid) => {
      const l = locate(s, iid);
      return l ? cardName(s, l.obj.card) : "card";
    };
    switch (m.op) {
      case "move": {
        const l = locate(s, m.iid);
        if (!l) throw new Illegal("Card not found.");
        const n = nameOf(m.iid);
        if (l.zone === "stack") {
          const it = s.stack.find((x) => x.obj?.iid === m.iid);
          s.stack = s.stack.filter((x) => x !== it);
          s.players[it.obj.owner].exile.push(it.obj);
        }
        const to = m.to === "stack" ? "graveyard" : m.to;
        moveCard(s, m.iid, to, { manual: true, controller: m.player ?? p });
        log(s, `${who} moves ${n} to ${to === "libraryBottom" ? "the bottom of the library" : to === "library" ? "the top of the library" : to === "command" ? "the command zone" : to}.`);
        break;
      }
      case "tap": {
        const x = findPerm(s, m.iid);
        if (x) x.tapped = m.tapped;
        break;
      }
      case "counter": {
        const x = findPerm(s, m.iid);
        if (!x) break;
        x.counters[m.kind] = Math.max(0, (x.counters[m.kind] ?? 0) + m.delta);
        if (!x.counters[m.kind]) delete x.counters[m.kind];
        log(s, `${who} ${m.delta > 0 ? "adds" : "removes"} ${Math.abs(m.delta)} ${m.kind} counter${Math.abs(m.delta) > 1 ? "s" : ""} ${m.delta > 0 ? "to" : "from"} ${permName(s, x)}.`);
        break;
      }
      case "life":
        s.players[m.player].life += m.delta;
        log(s, `${s.players[m.player].name}: life ${m.delta > 0 ? "+" : ""}${m.delta} (${s.players[m.player].life}).`);
        break;
      case "poison":
        s.players[m.player].poison = Math.max(0, s.players[m.player].poison + m.delta);
        break;
      case "commanderDamage": {
        const cd = s.players[m.player].commanderDamage;
        cd[m.card] = Math.max(0, (cd[m.card] ?? 0) + m.delta);
        break;
      }
      case "token":
        createToken(s, m.player, m.card, m.count, m.tapped);
        break;
      case "customToken": {
        const card = makeTokenDef(s, { e: "token", n: m.count, name: m.name, power: m.power, toughness: m.toughness, types: m.types, colors: [], keywords: m.keywords ?? [] }, 0);
        createToken(s, m.player, card, m.count);
        break;
      }
      case "draw":
        drawCards(s, m.player, m.count);
        break;
      case "mill": {
        const top = s.players[m.player].library.slice(0, m.count);
        for (const o of top) moveCard(s, o.iid, "graveyard", { manual: true });
        log(s, `${s.players[m.player].name} mills ${top.length}.`);
        break;
      }
      case "shuffle":
        shuffle(s, m.player);
        log(s, `${s.players[m.player].name} shuffles their library.`);
        break;
      case "control": {
        const x = findPerm(s, m.iid);
        if (x) {
          x.controller = m.player;
          x.sick = true;
          log(s, `${s.players[m.player].name} gains control of ${permName(s, x)}.`);
        }
        break;
      }
      case "flip": {
        const x = findPerm(s, m.iid);
        if (x && def(s, x.card).back) x.flipped = !x.flipped;
        else if (x) x.faceDown = !x.faceDown;
        break;
      }
      case "attach": {
        const x = findPerm(s, m.iid);
        if (x) x.attachedTo = m.to ?? void 0;
        break;
      }
      case "pt": {
        const x = findPerm(s, m.iid);
        if (x) x.mods.push({ power: m.power, toughness: m.toughness, until: m.until });
        break;
      }
      case "clearMods": {
        const x = findPerm(s, m.iid);
        if (x) x.mods = [];
        break;
      }
      case "mana": {
        const pool = s.players[m.player].pool;
        pool[m.mana] = Math.max(0, pool[m.mana] + m.delta);
        break;
      }
      case "untapAll":
        for (const x of s.battlefield) if (x.controller === m.player) x.tapped = false;
        break;
      case "peek":
        s.players[m.player].peek = m.count;
        break;
      case "damage": {
        const x = findPerm(s, m.iid);
        if (x) x.damage = Math.max(0, x.damage + m.delta);
        break;
      }
      case "copySpell": {
        const it = s.stack.find((x) => x.sid === m.sid);
        if (it) {
          s.stack.push({ ...clone(it), sid: s.nextId++, copy: true, controller: p, manual: it.manual });
          log(s, `${who} copies ${cardName(s, it.card)}.`);
          s.passes = 0;
        }
        break;
      }
      case "counterSpell": {
        const it = s.stack.find((x) => x.sid === m.sid);
        if (!it) break;
        if (it.obj && !it.copy) moveCard(s, it.obj.iid, "graveyard");
        else s.stack = s.stack.filter((x) => x.sid !== m.sid);
        log(s, `${who} counters ${cardName(s, it.card)}.`);
        s.passes = 0;
        break;
      }
      case "sick": {
        const x = findPerm(s, m.iid);
        if (x) x.sick = m.sick;
        break;
      }
    }
  }

  // src/bot/bot.ts
  function botIntents(s, me) {
    const pend = s.pending;
    if (pend.kind === "over") return [];
    if (pend.kind === "mulligan" && pend.player === me) {
      const lands3 = s.players[me].hand.filter((o) => rulesOf(s, o).types.includes("land")).length;
      const ok = lands3 >= 2 && lands3 <= 5 || s.players[me].mulligans >= 2;
      return [{ type: ok ? "keep" : "mulligan", player: me }];
    }
    if (pend.kind === "bottom" && pend.player === me) {
      const hand = s.players[me].hand.slice();
      const lands3 = hand.filter((o) => rulesOf(s, o).types.includes("land"));
      const score = (o) => rulesOf(s, o).types.includes("land") ? lands3.length > 3 ? 5 : -5 : def(s, o.card).cmc;
      hand.sort((a, b) => score(b) - score(a));
      return [{ type: "bottom", player: me, iids: hand.slice(0, pend.count).map((o) => o.iid) }];
    }
    if (pend.kind === "choose" && pend.player === me) {
      const q = pend.question;
      if (q.key === "manual") return [{ type: "choose", player: me, picks: ["done"] }];
      const sorted = q.options.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      let n = q.min;
      if (q.ordered) n = Math.max(q.min, sorted.filter((o) => (o.score ?? 0) > 0).length);
      else if (q.max > q.min) n = Math.max(q.min, Math.min(q.max, sorted.filter((o) => (o.score ?? 0) > 0).length));
      return [{ type: "choose", player: me, picks: sorted.slice(0, Math.min(q.max, n)).map((o) => o.id) }];
    }
    if (pend.kind === "attackers" && pend.player === me) {
      const must = s.battlefield.filter((p) => canAttack(s, p) && (rulesOf(s, p).mustAttack || hasKw(s, p, "goaded"))).map((p) => p.iid);
      return [{ type: "attack", player: me, attackers: chooseAttackers(s, me) }, { type: "attack", player: me, attackers: must }];
    }
    if (pend.kind === "blockers" && pend.player === me) return [{ type: "block", player: me, blocks: chooseBlocks(s, me) }, { type: "block", player: me, blocks: [] }];
    if (pend.kind !== "priority" || pend.player !== me) return [];
    const out = [];
    const pl = s.players[me];
    const lands2 = pl.hand.filter((o) => rulesOf(s, o).types.includes("land"));
    for (const l of lands2) if (!canPlayLand(s, me, l.iid)) out.push({ type: "playLand", player: me, iid: l.iid });
    const playable = pl.exile.filter((o) => pl.playable?.some((q) => q.iid === o.iid && q.until >= s.turn));
    for (const l of playable) if (rulesOf(s, l).types.includes("land") && !canPlayLand(s, me, l.iid)) out.push({ type: "playLand", player: me, iid: l.iid });
    const cards = [...pl.command, ...pl.hand, ...playable].filter((o) => !rulesOf(s, o).types.includes("land"));
    const legends = new Set(s.battlefield.filter((p) => p.controller === me && rulesOf(s, p).supertypes.includes("legendary")).map((p) => p.card));
    const scored = cards.map((o) => {
      const r = rulesOf(s, o);
      const isSpell = r.types.includes("instant") || r.types.includes("sorcery");
      const spell2 = NAMED[def(s, o.card).name]?.spell ?? r.spell;
      let v = def(s, o.card).cmc + (o.commander ? 1.5 : 0);
      if (pl.exile.includes(o)) v += 2;
      if (isSpell && !spell2) v -= 100;
      if (legends.has(o.card)) v -= 100;
      if (isSpell && /additional combat phase/.test(def(s, o.card).oracle)) {
        const attacked = s.battlefield.some((p) => p.controller === me && p.attackedTurn === s.turn);
        const army = s.battlefield.filter((p) => p.controller === me && isCreature(s, p)).length;
        const untaps = /Untap all creatures that attacked this turn\. After this main phase/.test(def(s, o.card).oracle);
        if (army < 2 || untaps && !attacked) v -= 100;
        else v += 3;
      }
      if (isSpell && spell2?.effects.some((e) => e.e === "counter")) v -= 100;
      if (isSpell && spell2?.effects.some((e) => e.e === "destroyAll" || e.e === "exileAll")) v += boardWipeValue(s, me);
      if (isSpell && spell2?.targets.length && spell2.effects.some((e) => e.e === "destroy" || e.e === "exile") && !s.battlefield.some((p) => p.controller !== me && isCreature(s, p))) v -= 100;
      if (!isSpell && !r.fullyAutomated && !r.types.includes("creature") && !r.types.includes("artifact")) v -= 1;
      return { o, v };
    }).filter((x) => x.v > -50).sort((a, b) => b.v - a.v);
    const failed = new Set((pl.failed ?? []).filter((f) => f.turn === s.turn).map((f) => f.iid));
    for (const { o } of scored) if (!failed.has(o.iid) && !canCast(s, me, o.iid)) out.push({ type: "cast", player: me, iid: o.iid });
    for (const p of s.battlefield) {
      if (p.controller !== me || p.attachedTo !== void 0) continue;
      for (const a of rulesOf(s, p).activated) if (a.equip && !abilityProblem(s, me, p, a) && s.battlefield.some((c) => c.controller === me && isCreature(s, c))) out.push({ type: "activate", player: me, iid: p.iid, ability: a.index });
    }
    if (s.step === "main2" && !s.stack.length)
      for (const p of s.battlefield) {
        if (p.controller !== me) continue;
        const r = rulesOf(s, p);
        const a = r.activated.find((x) => x.station);
        if (!a || r.stationCreatureAt !== void 0 && (p.counters.charge ?? 0) >= r.stationCreatureAt + 4) continue;
        if (!abilityProblem(s, me, p, a) && !failed.has(p.iid)) out.push({ type: "activate", player: me, iid: p.iid, ability: a.index });
      }
    for (const p of s.battlefield) {
      if (p.controller !== me) continue;
      for (const a of rulesOf(s, p).activated) {
        if (a.equip || !a.compiled || a.cost.sacrificeSelf || a.cost.life || a.loyalty) continue;
        if (!a.compiled.effects.every((e) => ["draw", "token", "counters", "scry", "life"].includes(e.e))) continue;
        if (s.stack.length || !(s.step === "main2" || s.step === "end")) continue;
        if (!abilityProblem(s, me, p, a)) out.push({ type: "activate", player: me, iid: p.iid, ability: a.index });
      }
    }
    out.push({ type: "pass", player: me });
    return out;
  }
  function boardWipeValue(s, me) {
    const mine2 = s.battlefield.filter((p) => p.controller === me && isCreature(s, p)).reduce((n, p) => n + def(s, p.card).cmc, 0);
    const theirs = s.battlefield.filter((p) => p.controller !== me && isCreature(s, p)).reduce((n, p) => n + def(s, p.card).cmc, 0);
    return theirs - mine2 * 1.5 - 4;
  }
  function chooseAttackers(s, me) {
    const mine2 = s.battlefield.filter((p) => p.controller === me && canAttack(s, p));
    const theirs = s.battlefield.filter((p) => p.controller === opp(me) && isCreature(s, p) && !p.tapped);
    const out = [];
    const oppLife = s.players[opp(me)].life;
    const totalPower = mine2.reduce((n, p) => n + Math.max(0, pt(s, p)[0]), 0);
    for (const a of mine2) {
      const [ap, at] = pt(s, a);
      if (ap <= 0) continue;
      const blockers = theirs.filter((b) => canBlock(s, b, a));
      const dies = blockers.some((b) => {
        const [bp] = pt(s, b);
        return bp >= at || hasKw(s, b, "deathtouch");
      });
      const evasive = blockers.length === 0;
      const cmdWin = s.format.commanderDamage && a.commander && evasive && (s.players[opp(me)].commanderDamage[a.card] ?? 0) + ap >= 21;
      if (evasive || cmdWin || !dies || totalPower >= oppLife + blockers.length * 2) out.push(a.iid);
    }
    for (const a of mine2) if ((rulesOf(s, a).mustAttack || hasKw(s, a, "goaded")) && !out.includes(a.iid)) out.push(a.iid);
    return out;
  }
  function chooseBlocks(s, me) {
    const c = s.combat;
    if (!c) return [];
    const attackers = c.attackers.map((a) => findPerm(s, a.iid)).filter(Boolean);
    attackers.sort((a, b) => pt(s, b)[0] - pt(s, a)[0]);
    const free = s.battlefield.filter((p) => p.controller === me && isCreature(s, p) && !p.tapped);
    const blocks = [];
    let incoming = attackers.reduce((n, a) => n + Math.max(0, pt(s, a)[0]), 0);
    const life = s.players[me].life;
    for (const a of attackers) {
      const [ap, at] = pt(s, a);
      const menace = keywords(s, a).includes("menace");
      const can = free.filter((b) => !blocks.some((x) => x.blocker === b.iid) && canBlock(s, b, a));
      if (!can.length || menace) continue;
      let pick = can.find((b) => {
        const [bp, bt] = pt(s, b);
        return (bp >= at || hasKw(s, b, "deathtouch")) && (bt > ap && !hasKw(s, a, "deathtouch"));
      });
      pick ??= can.find((b) => pt(s, b)[1] > ap && !hasKw(s, a, "deathtouch"));
      pick ??= can.find((b) => (pt(s, b)[0] >= at || hasKw(s, b, "deathtouch")) && def(s, b.card).cmc <= def(s, a.card).cmc);
      const cmdLethal = !!(s.format.commanderDamage && a.commander && (s.players[me].commanderDamage[a.card] ?? 0) + ap >= 21 && !hasKw(s, a, "trample"));
      if (!pick && (incoming >= life || cmdLethal)) pick = can.slice().sort((x, y) => def(s, x.card).cmc - def(s, y.card).cmc)[0];
      if (pick) {
        blocks.push({ blocker: pick.iid, attacker: a.iid });
        if (!hasKw(s, a, "trample")) incoming -= ap;
      }
    }
    return blocks;
  }
  function botStep(s, me) {
    for (const intent of botIntents(s, me)) {
      const r = tryApply(s, intent);
      if (r.state) return r.state;
    }
    return null;
  }

  // src/data/decks.ts
  var split = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  var DECKS = [
    {
      id: "federation",
      name: "Federation Fleet",
      colors: "WUR",
      commander: "Jean-Luc Picard, Luminary",
      alt: "Captain Janeway, Endgame",
      basics: [["Island", 5], ["Plains", 4], ["Mountain", 4]],
      cards: split(`
Captain Janeway, Endgame
Ambassador K'Ehleyr
Beverly Crusher, Ship's Doctor
Dr. Pulaski, Cynical Clinician
Ensign Harry Kim, Operations
Ezri Dax, Newly Joined
Guinan, Ancient Advisor
Julian Bashir, Frontier Doctor
Spot, Felis catus
U.S.S. Enterprise-E, Sovereign
Chief Miles O'Brien
Data, Exploring Humanity
Geordi La Forge, Innovator
Kes, Evolving Telepath
On the Shoulders of Giants
Seven of Nine, Tertiary Adjunct
Temporal Tribulation
Tuvok, Chief Tactical Officer
Ro Laren, Double Agent
Rom and Leeta, Unlikely Pair
B'Elanna Torres, Scrapper
Cmdr. Troi, Outgoing Empath
Commander William Riker
Reg Barclay, Fidgety Fantasist
Tom Paris, Risk-Taker
Unification
Vic Fontaine, One Night Only
Worf, Son of Mogh
U.S.S. Defiant, Tough Little Ship
U.S.S. Enterprise-C, Time-Tossed
U.S.S. Prometheus, Prototype
U.S.S. Stargazer, Here and There
Grand Crescendo
Loran of the Third Path
Promise of Loyalty
Cryptic Command
Chain Reaction
Fevered Visions
Fractured Identity
Supreme Verdict
Alhammarret's Archive
Howling Mine
Battlefield Forge
Clifftop Retreat
Coastal Peak
Command Beacon
Desolate Lighthouse
Exotic Orchard
Fabled Passage
Frostboil Snarl
Furycalm Snarl
Glacial Fortress
Glittering Massif
Irrigated Farmland
Port Town
Prairie Stream
Radiant Summit
Scorched Geyser
Sulfur Falls
Training Center
Malfunctioning Holodeck
Chronomantic Escape
Swords to Plowshares
Frantic Search
Negate
Pongify
Abrade
Thrill of Possibility
Faithful Mending
Arcane Signet
Commander's Sphere
Hedron Archive
Mind Stone
Sol Ring
Stonespeaker Crystal
Talisman of Conviction
Talisman of Creativity
Talisman of Progress
Thought Vessel
Command Tower
Evolving Wilds
Mystic Monastery
Path of Ancestry
Perilous Landscape
Reliquary Tower
Terramorphic Expanse`)
    },
    {
      id: "landing",
      name: "Landing Party",
      colors: "GWU",
      commander: "Commander Spock",
      alt: "Captain Kirk, Boldly Going",
      basics: [["Forest", 4], ["Plains", 2], ["Island", 2]],
      cards: split(`
Captain Kirk, Boldly Going
Balance of Terror
Merciful Mandate
M'Ress, Crew Coordinator
Shuttlecraft Galileo
Tribble Cluster
Colossal Clone Master
Fleet Captain Christopher Pike
Giant Space Amoeba
Lieutenant Nyota Uhura
Sam Kirk, Xenoanthropologist
Temporal Tribulation
Amanda Grayson, Logic's Link
Christine Chapel, Combat Medic
Janice Rand, Essential Aide
Lieutenant Hikaru Sulu
Chief Kyle, Transporter Tech
Chief Montgomery Scott
Lt. Arex, Ever-Adapting
McCoy, Not a Bricklayer
Pavel Chekov, First Posting
T'Pring, Never Parted
Command Chair
The Guardian of Forever
Jefferies Tube
Planet Killer
S.S. Botany Bay
Starfleet Communicator
Starship Enterprise
U.S.S. Defiant, Mirror Migrant
U.S.S. Farragut, Bold Explorer
Shore Leave
Austere Command
Sun Titan
Wrath of God
Echo of Eons
Ancient Greenwarden
Augur of Autumn
Exploration
Guardian Project
Heroic Intervention
Lotus Cobra
Scute Swarm
Tireless Tracker
Canopy Vista
Exotic Orchard
Fabled Passage
Fortified Village
Glacial Fortress
Hinterland Harbor
Irrigated Farmland
Mosswort Bridge
Mutavault
Port Town
Prairie Stream
Rain-Slicked Copse
Scattered Groves
Sea of Clouds
Sodden Verdure
Sunpetal Grove
Temple of Enlightenment
Temple of Mystery
Temple of Plenty
Vineglimmer Snarl
Cold-Blooded Crew
Syndicate Liquidators
Earth, Sector 001
Risa
Vulcan
Path to Exile
Brainstorm
Ponder
Reality Shift
Beast Within
Cultivate
Farseek
Harmonize
Nature's Lore
Rampant Growth
Satyr Wayfinder
Growth Spiral
Arcane Signet
Sol Ring
Command Tower
Evolving Wilds
Path of Ancestry
Reliquary Tower
Seaside Citadel
Temple of the False God
Terramorphic Expanse
Tranquil Landscape`)
    },
    {
      id: "klingon",
      name: "Klingon Fury",
      colors: "RWB",
      commander: "Worf, Defiant Commander",
      alt: "Kor, Cause of Vengeance",
      basics: [["Mountain", 5], ["Plains", 5], ["Swamp", 5]],
      cards: split(`
Kor, Cause of Vengeance
Ambassador K'Ehleyr
Imperial Hullbreachers
Indelicate Healer
Korok, Liberated Rage
Martok, Hero of the Empire
Merciful Mandate
Right of Vengeance
Blood-Sport Champion
Kurn, Son of Mogh
The Promise of Kahless
Voq, Torchbearer
The Beacon of Kahless
Ferocious Colonist
Gagh Slinger
Galvanizing Tenor
Glory to the Empire!
Gnarling Targ
Grilka, Widowed Warrior
Kang, Suspicious Captain
Koloth, Tribble Hunter
Own the Day
Qo'noS Quartermaster
Alexander, Ship's Fool
Chancellor Gorkon
Curzon Dax, Bound by Blood
Rite of Ascension
Sins of the Father
I.K.S. Negh'Var, Imperial Flagship
K't'inga-Class Battle Cruiser
K'Vort-Class Raider
The Sword of Kahless
Concerted Effort
Duelist's Heritage
Vanquish the Horde
Painful Truths
Combat Celebrant
Disrupt Decorum
Professional Face-Breaker
Shared Animosity
World at War
Pest Control
Ruinous Ultimatum
Vindicate
Warleader's Call
Sword of Light and Shadow
Battlefield Forge
Canyon Slough
Clifftop Retreat
Dragonskull Summit
Eclipsed Steppe
Exotic Orchard
Foreboding Ruins
Furycalm Snarl
Glittering Massif
Isolated Chapel
Radiant Summit
Shineshadow Snarl
Smoldering Marsh
Temple of Malice
Umbral Expanse
Vault of Champions
Cha'DIch Investigator
Path to Exile
Return to Dust
Valorous Stance
Night's Whisper
Rite of Oblivion
Terminate
Arcane Signet
Herald's Horn
Lightning Greaves
Mind Stone
Sol Ring
Talisman of Conviction
Talisman of Hierarchy
Talisman of Indulgence
Command Tower
Evolving Wilds
Nomad Outpost
Path of Ancestry
Rogue's Passage
Shattered Landscape
Terramorphic Expanse`)
    },
    {
      id: "borg",
      name: "We Are the Borg",
      colors: "WUB",
      commander: "The Borg Queen",
      alt: "Locutus of Borg",
      basics: [["Plains", 4], ["Island", 4], ["Swamp", 4]],
      cards: split(`
Locutus of Borg
Borg Incursion
Emergency Regeneration
Join the Collective
Korok, Liberated Rage
Maturation Chamber
Stratagem Emulator
Supplementation Node
Type-03 Borg Vessel
Ambulatory Reactor
Borg Scout Sphere
Co-Option Adjutant
Gift of Perfection
Optimization Annex
Seven of Nine, Tertiary Adjunct
Transwarp Hub
V\xF5x, Child of the Collective
Assimilate the Wounded
Assimilation Assessor
Battle of Wolf 359
Extraction Integrant
Reclamation Specialist
The Best of Both Worlds
Collective Override
Deliver from Chaos
Hugh, First of Many
Jurati, Cordial Queen
One, Borg Evolved
Class-4 Tactical Cube
Queen's Diamond
Reconnaissance Partition
Shore Leave
Tempered Steel
Disallow
Toxic Deluge
Anguished Unmaking
Astral Cornucopia
Darksteel Plate
Door of Destinies
Forsaken Monument
The Immortal Sun
Skullclamp
Unwinding Clock
Academy Ruins
Choked Estuary
Drowned Catacomb
Eclipsed Steppe
Exotic Orchard
Fetid Pools
Glacial Fortress
Irrigated Farmland
Isolated Chapel
Morphic Pool
Port Town
Prairie Stream
Shineshadow Snarl
Skycloud Expanse
Spire of Industry
Sunken Hollow
Umbral Expanse
Underground River
Command Subadjunct
Conquest Mission
Hive Mind Coprocessor
Locutus, the One Who Speaks
Dispatch
Return to Dust
Thirst for Knowledge
Thoughtcast
Bitter Triumph
Arcane Signet
Commander's Sphere
Everflowing Chalice
Sol Ring
Stonespeaker Crystal
Swiftfoot Boots
Talisman of Dominance
Talisman of Hierarchy
Talisman of Progress
Wayfarer's Bauble
Arcane Sanctum
Command Tower
Contaminated Landscape
Evolving Wilds
Path of Ancestry
Rogue's Passage
Terramorphic Expanse`)
    }
  ];
  function deckCards(d, leader = "commander") {
    const commanders = leader === "both" ? [d.commander, d.alt] : [leader === "alt" ? d.alt : d.commander];
    const rest = [d.commander, ...d.cards].filter((n) => !commanders.includes(n));
    for (const [b, n] of d.basics) for (let i = 0; i < n; i++) rest.push(b);
    return { commanders, cards: rest };
  }

  // src/data/scryfall.ts
  var MAX_AGE = 7 * 24 * 3600 * 1e3;
  var slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  function missingDef(name) {
    return { id: slug(name), name, manaCost: "", cmc: 0, typeLine: "Card", oracle: "This card could not be loaded. Use the table tools to play it.", colors: [], identity: [], keywords: [], missing: true };
  }

  // src/data/build.ts
  function buildGame(pool, players, format, seed) {
    const cards = { ...pool };
    const ids = (names) => names.map((n) => {
      const id = slug(n);
      if (!cards[id]) cards[id] = missingDef(n);
      return id;
    });
    return newGame({
      players: players.map((p) => {
        const d = DECKS.find((x) => x.id === p.deck) ?? DECKS[0];
        const { commanders, cards: rest } = deckCards(d, p.leader);
        return { name: p.name, commanders: ids(commanders), deck: ids(rest), bot: p.bot };
      }),
      cards,
      seed,
      format
    });
  }

  // tools/coverage.ts
  function coverage(cards) {
    const out = [];
    for (const c of cards) {
      if (c.isToken) continue;
      const full = rulesFor(c);
      if (full.fullyAutomated || NAMED[c.name] || full.triggers.length && full.triggers.every((t) => t.compiled) && full.activated.every((a) => a.compiled || a.station) && !full.chapters?.some((x) => !x.compiled)) continue;
      const isSpell = /Instant|Sorcery/.test(c.typeLine);
      const bad = [];
      if (isSpell) bad.push(c.oracle.replace(/\n/g, " / "));
      else
        for (const line of c.oracle.split("\n")) {
          const r = parse({ name: c.name, oracle: line, typeLine: c.typeLine });
          const manualTrig = r.triggers.some((t) => !t.compiled);
          const manualAct = r.activated.some((a) => !a.compiled && !a.station);
          if (!r.fullyAutomated || manualTrig || manualAct) bad.push(line);
        }
      if (bad.length) out.push({ name: c.name, lines: bad });
    }
    return out;
  }
  globalThis.HoloCov = { coverage };

  // src/engine/invariants.ts
  function invariantErrors(s) {
    const out = [];
    const seen = /* @__PURE__ */ new Map();
    const note = (iid, where) => {
      const was = seen.get(iid);
      if (was) out.push(`card ${iid} is in two places: ${was} and ${where}`);
      else seen.set(iid, where);
    };
    s.players.forEach((pl, i) => {
      for (const z of ["library", "hand", "graveyard", "exile", "command"]) for (const o of pl[z]) {
        note(o.iid, `${z}#${i}`);
        if (o.owner !== i) out.push(`${s.cards[o.card]?.name ?? o.card} is in ${pl.name}'s ${z} but belongs to player ${o.owner}`);
        if (o.token) out.push(`a token (${s.cards[o.card]?.name}) is in a ${z}`);
      }
      for (const o of pl.command) if (!o.commander) out.push(`${s.cards[o.card]?.name} is in the command zone but isn't a commander`);
      for (const c of pl.commanders) {
        const n = [...pl.library, ...pl.hand, ...pl.graveyard, ...pl.exile, ...pl.command, ...s.battlefield, ...s.stack.map((it) => it.obj).filter((o) => !!o)].filter((o) => o.card === c && o.commander).length;
        if (n !== 1) out.push(`commander ${s.cards[c]?.name} is in ${n} places`);
      }
      if (Object.values(pl.pool).some((v) => v < 0)) out.push(`${pl.name} has negative mana`);
      if (pl.landsPlayed < 0) out.push("negative lands played");
    });
    for (const p of s.battlefield) {
      note(p.iid, "battlefield");
      if (p.controller !== 0 && p.controller !== 1) out.push(`bad controller ${p.controller}`);
      if (p.attachedTo !== void 0 && p.attachedTo === p.iid) out.push("attached to itself");
      for (const [k, v] of Object.entries(p.counters)) if (v < 0) out.push(`${k} counters below zero on ${s.cards[p.card]?.name}`);
    }
    for (const it of s.stack) if (it.obj) note(it.obj.iid, "stack");
    if (s.pending.kind === "priority" && !s.tasks.length) {
      for (const p of s.battlefield) {
        const d = s.cards[p.card];
        if (!d) {
          out.push(`unknown card ${p.card}`);
          continue;
        }
        const creature2 = /Creature/.test(d.typeLine) || p.mods.some((m) => m.note === "creature");
        if (creature2 && !p.faceDown && !/Indestructible/i.test(d.oracle) && !p.mods.some((m) => m.keywords?.includes("indestructible"))) {
          const [, t] = pt(s, p);
          if (t <= 0 && !/Spacecraft/.test(d.typeLine)) out.push(`${d.name} has toughness ${t} but is still on the battlefield`);
        }
      }
      s.players.forEach((pl) => {
        if (pl.life <= 0 && !pl.lost) out.push(`${pl.name} is at ${pl.life} life but hasn't lost`);
      });
    }
    if (s.combat && s.combat.attackers.some((a) => !s.battlefield.some((p) => p.iid === a.iid)) && s.step === "attackers") out.push("an attacker is gone during declare attackers");
    return out;
  }

  // tools/realsim.ts
  function realSim(cards, n) {
    const out = [];
    for (let g = 0; g < n; g++) {
      const a = DECKS[g % 4].id;
      const b = DECKS[(g + 1 + Math.floor(g / 4)) % 4].id;
      let s = buildGame(cards, [{ name: "A", deck: a, leader: "commander", bot: true }, { name: "B", deck: b, leader: g % 2 ? "alt" : "commander", bot: true }], ["duel", "oneVsOne", "classic"][g % 3], 1e3 + g);
      let error;
      try {
        for (let i = 0; i < 6e3 && s.pending.kind !== "over" && s.turn <= 40; i++) {
          const next2 = botStep(s, s.pending.player);
          if (!next2) {
            error = `stuck: ${JSON.stringify(s.pending).slice(0, 300)}`;
            break;
          }
          s = next2;
          const bad = invariantErrors(s);
          if (bad.length) {
            error = `invariant: ${bad.slice(0, 2).join("; ")} :: ${s.log.slice(-4).join(" | ")}`;
            break;
          }
        }
      } catch (e) {
        error = `${e.message} @ ${e.stack?.split("\n").slice(0, 3).join(" | ")} :: ${s.log.slice(-4).join(" | ")}`;
      }
      out.push({ game: g, decks: `${a} vs ${b}`, turns: s.turn, result: s.pending.kind === "over" ? s.players.find((p) => p.lost)?.lost ?? "draw" : "unfinished", error });
    }
    return out;
  }
  globalThis.HoloSim = { realSim, coverage };
  function trace(cards, g, steps) {
    const a = DECKS[g % 4].id;
    const b = DECKS[(g + 1 + Math.floor(g / 4)) % 4].id;
    let s = buildGame(cards, [{ name: "A", deck: a, leader: "commander", bot: true }, { name: "B", deck: b, leader: g % 2 ? "alt" : "commander", bot: true }], "duel", 1e3 + g);
    const pend = [];
    for (let i = 0; i < steps && s.pending.kind !== "over"; i++) {
      const next2 = botStep(s, s.pending.player);
      if (!next2) break;
      s = next2;
      if (i > steps - 12) pend.push(`${s.turn}/${s.step} ${JSON.stringify(s.pending).slice(0, 160)} stack=${s.stack.map((x) => x.text.slice(0, 40)).join(";")}`);
    }
    return { log: s.log.slice(-15), pend };
  }
  globalThis.HoloSim = { realSim, coverage, trace };
})();
