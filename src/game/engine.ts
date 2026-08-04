import { ENEMY_STATS, intentThreatens, makeEnemy, planIntent, spawnsOnWind } from './enemies';
import { eraAt, isAfterBoss, isBossFloor } from './eras';
import { MAX_ENEMIES, generateFloor } from './floors';
import { DIR_VEC, add, allTiles, chebyshev, eq, inBounds } from './grid';
import { Rng, randomSeed } from './rng';
import { SHIPPED, type Rules } from './rules';
import { TRAIT_BY_ID, applyTraitRules, offerTraits } from './traits';
import type { Action, Dir, Enemy, Ev, GameState, StepResult, Vec } from './types';

/**
 * Measured, not guessed. Simulated runs at 6 / 7 / 8 HP, played by a bot with
 * three plies of lookahead (exact, because enemies commit to their telegraphs):
 *
 *   HP 6 → median depth  9   HP 7 → median depth 10   HP 8 → median depth 17
 *
 * 8 turns the run into a long session; 6 is tight enough that a mistake on floor
 * three ends it. 7 keeps a mindless bumper pinned at depth 2 while a player who
 * reads the board reaches 10 — see balance.test.ts.
 */
export const START_HP = 7;
export const START_DMG = 1;
/**
 * Combo bonus ceiling — the default. Lives on `Rules` as `comboCap` so a trait
 * can raise it; this is what a run starts with.
 */
export const MAX_COMBO = 3;
export const VIAL_HEAL = 3;

/* ---------------------------------------------------------------------------
 * The spill.
 *
 * Without it the game has no answer to a patient player: a simulated bot that
 * read telegraphs and simply refused to engage kited three rats for 4000 turns
 * on floor one and never died. Every enemy moves at exactly your speed, so on an
 * open board you can weave indefinitely — which makes commitment optional, and
 * commitment is the entire game.
 *
 * So the page fills. After a floor's grace runs out, ink wells up and something
 * climbs out of it on a fixed cadence. Killing outpaces spilling comfortably, so
 * aggression clears a floor and timidity drowns in it — which is the lesson the
 * design wanted to teach in the first place.
 * ------------------------------------------------------------------------ */
/**
 * How often the page fills once grace is gone, and how fast that quickens.
 *
 * The threat budget caps and the board only holds seven bodies, so enemy count
 * cannot scale forever — this is the knob that can. Deep down the ink comes
 * faster than anything can be killed, which is what finally ends a run that
 * skill alone would otherwise carry indefinitely.
 */
export const spillEvery = (d: GameState, over: number): number => {
  // PRESS: the cadence also tightens with time spent on THIS floor, so lingering
  // costs more the longer it goes on. Without it the trickle is flat, and a flat
  // trickle is farmable by anything that makes killing cheap (see rules.ts).
  const ramp = d.rules.spillRampTurns > 0 ? Math.floor(over / d.rules.spillRampTurns) : 0;
  // Every N marginalia taken, the page fills a turn sooner. Power is coupled
  // straight to pressure, because the threat budget saturates and this does not.
  const built =
    d.rules.spillPerTraits > 0 ? Math.floor(d.traits.length / d.rules.spillPerTraits) : 0;
  return Math.max(1, d.rules.spillBase - Math.floor(d.depth / 9) - ramp - built);
};

/** Bigger floors get more quiet; deeper ones get less. */
const spillGrace = (enemies: number, depth: number): number =>
  Math.max(5, 8 + enemies * 2 - Math.floor(depth / 4));

export function newGame(seed: number = randomSeed(), rules: Rules = SHIPPED): GameState {
  const s: GameState = {
    screen: 'playing',
    depth: 0,
    turn: 0,
    floorTurns: 0,
    grace: 0,
    player: {
      pos: { x: 2, y: 2 },
      hp: rules.startHp,
      maxHp: rules.startHp,
      dmg: START_DMG,
      exposed: false,
      combo: 0,
      flow: false,
      ink: rules.fadeMax,
      ward: 0,
      trail: [],
      facing: 'up',
    },
    enemies: [],
    items: [],
    blots: [],
    stairs: { x: 4, y: 4 },
    stairsOpen: false,
    rng: seed >>> 0,
    nextId: 1,
    stats: { kills: 0, turns: 0, damageTaken: 0, nibs: 0, vials: 0, deepest: 0 },
    rules,
    chain: 0,
    floorHpLost: 0,
    floorHpRallied: 0,
    spillClock: 0,
    floorWaits: 0,
    traits: [],
    offer: [],
  };
  enterFloor(s, []);
  return s;
}

/** Recompute every enemy's telegraph against the board as it now stands. */
function replan(d: GameState): void {
  const rng = new Rng(d.rng);
  for (const e of d.enemies) e.intent = planIntent(e, d, rng);
  d.rng = rng.s;
}

function enterFloor(d: GameState, ev: Ev[]): void {
  d.depth += 1;
  const rng = new Rng(d.rng);
  const f = generateFloor(d.depth, rng, d);
  d.rng = rng.s;

  d.enemies = f.enemies;
  d.items = f.items;
  d.blots = f.blots;
  d.stairs = f.stairs;
  d.stairsOpen = f.enemies.length === 0;
  d.player.pos = f.playerStart;
  d.player.exposed = false;
  d.player.combo = 0;
  d.player.flow = false;
  // A fresh page, a fresh charge of ink. The fade is a per-floor clock, exactly
  // like the spill it is a candidate to replace.
  d.player.ink = d.rules.fadeMax;
  // Seeded with where you arrive, not left empty: the trail records where a turn
  // ENDS, so an unseeded one forgets the tile you started on and the very first
  // step-out-and-back — the most basic juke there is — came out free.
  d.player.trail = [{ ...f.playerStart }];
  d.floorTurns = 0;
  d.floorHpLost = 0;
  d.floorHpRallied = 0;
  d.spillClock = 0;
  d.floorWaits = 0;
  d.chain = 0;
  d.grace = spillGrace(f.enemies.length, d.depth);
  d.stats.deepest = Math.max(d.stats.deepest, d.depth);

  replan(d);
  ev.push({ t: 'descend', phase: 'p', depth: d.depth });

  /*
   * The marginalia. The floor is already built and waiting; the run simply does
   * not accept a turn until a card is taken.
   *
   * Never on the first floor — you arrive with nothing, and a choice before you
   * have played a turn is a choice made blind.
   */
  if (d.rules.traitsPerDescent > 0 && d.depth > 1) {
    const rng2 = new Rng(d.rng);
    const hurt = d.player.hp < d.player.maxHp;
    // Surviving a boss widens the hand by one. It is the whole reward, and it
    // costs no new machinery — a boss floor is simply worth a better choice.
    const count = d.rules.traitsPerDescent + (isAfterBoss(d.depth) ? 1 : 0);
    const offer = offerTraits(
      d.traits,
      (n) => rng2.int(n),
      count,
      hurt,
      d.rules.maxTraits,
    );
    d.rng = rng2.s;
    if (offer.length > 0) {
      d.offer = offer.map((t) => t.id);
      d.screen = 'choosing';
      ev.push({ t: 'offer', phase: 'p', ids: [...d.offer] });
    }
  }
}

/**
 * Take one of the marginalia on offer.
 *
 * Separate from `step()` because it is not a turn: nothing on the board moves,
 * no enemy acts, and the floor you were just handed is untouched. It only
 * unblocks the run.
 */
export function chooseTrait(state: GameState, id: string): StepResult {
  if (state.screen !== 'choosing' || !state.offer.includes(id)) {
    return { state, events: [], spent: false };
  }
  const trait = TRAIT_BY_ID.get(id);
  if (!trait) return { state, events: [], spent: false };

  const d: GameState = structuredClone(state);
  d.rules = applyTraitRules(d.rules, trait);
  trait.player?.(d.player);
  // MEND is spent, not kept: it can be taken again on the next floor, and a run
  // that healed four times has not "built" anything.
  if (trait !== TRAIT_BY_ID.get('mend')) d.traits.push(id);
  d.offer = [];
  d.screen = 'playing';
  return { state: d, events: [{ t: 'trait', phase: 'p', id }], spent: false };
}

const isBlot = (d: GameState, v: Vec) => d.blots.some((b) => eq(b, v));

/** Somewhere clear, and never right on top of you. */
function spillSite(d: GameState, rng: Rng): Vec | null {
  const free = allTiles().filter(
    (t) =>
      chebyshev(t, d.player.pos) >= 2 &&
      !isBlot(d, t) &&
      !eq(t, d.stairs) &&
      !d.enemies.some((e) => eq(e.pos, t)) &&
      !d.items.some((i) => eq(i.pos, t)),
  );
  return free.length ? rng.pick(rng.shuffle(free)) : null;
}

/**
 * Does the page fill on this turn?
 *
 * Counted on an explicit clock rather than `over % every === 0`, because under
 * PRESS the cadence changes while the floor is running and a modulo against a
 * moving divisor both double-fires and skips. With a flat cadence the two are
 * identical, so this is behaviour-preserving for the shipped rules.
 */
function shouldSpill(d: GameState): boolean {
  // A boss floor does not fill WHILE THE BOSS LIVES. The boss is its own clock,
  // and two clocks on one board is not a duel — but the moment it dies the duel
  // is over and the ordinary rules of the page resume.
  if (isBossFloor(d.depth) && d.enemies.some((e) => e.kind === eraAt(d.depth).boss)) {
    return false;
  }
  const over = d.floorTurns - d.grace;
  if (over <= 0) return false;
  d.spillClock += 1;
  if (d.spillClock < spillEvery(d, over)) return false;
  d.spillClock = 0;
  return true;
}

/**
 * Execute one enemy's committed intent.
 *
 * The intent was planned last turn against where you stood then, and it is NOT
 * re-aimed. An enemy walks its path until something stops it: the board edge, a
 * blot, another enemy, or you — and walking into you is the strike.
 */
function execIntent(e: Enemy, d: GameState, ev: Ev[]): void {
  const st = ENEMY_STATS[e.kind];
  const intent = e.intent;

  const struck = e.struck;
  e.struck = false;

  if (struck && e.poise) {
    // Stance broken: whatever it committed to does not happen. A slow unit also
    // loses its wind-up and must start again, so interrupting a CHARGER mid-coil
    // is worth far more than interrupting a RAT.
    e.poise = false;
    if (st.slow) e.ready = false;
    ev.push({
      t: 'stagger',
      phase: 'e',
      id: e.id,
      kind: e.kind,
      pos: { ...e.pos },
      interrupted: intent.kind === 'move' && intent.path.length > 0,
    });
    return;
  }

  // Poise returns only on a turn you did not strike it. Hitting a braced enemy
  // still hurts it, but it acts anyway — that is what stops a stagger-lock and
  // turns a heavy into a rhythm: strike, step away, strike.
  if (!struck) e.poise = true;

  if (intent.kind === 'wind') {
    e.ready = true;
    ev.push({ t: 'wind', phase: 'e', id: e.id, kind: e.kind, pos: { ...e.pos } });
    // A DROLLERY draws another out of the margin every time it winds, so the
    // wind-up you fail to punish is a body you have to fight later. Capped by
    // the board, which is what stops it running away.
    if (spawnsOnWind(e.kind) && d.enemies.length < MAX_ENEMIES) {
      const rng = new Rng(d.rng);
      const site = spillSite(d, rng);
      d.rng = rng.s;
      if (site) {
        d.enemies.push(makeEnemy(d.nextId++, 'rat', site, rng.int(1 << 20)));
        ev.push({ t: 'spill', phase: 'e', pos: { ...site }, kind: 'rat' });
      }
    }
    return;
  }
  if (intent.kind === 'hold' || intent.path.length === 0) return;

  const from: Vec = { ...e.pos };
  let cur: Vec = { ...e.pos };

  for (const next of intent.path) {
    if (!inBounds(next)) break;
    if (isBlot(d, next)) break;

    if (eq(next, d.player.pos)) {
      // Doubled while you are mid-swing. This is the whole cost of committing.
      const dmg = st.dmg * (d.player.exposed ? d.rules.exposedMult : 1);
      // GESSO takes it first. Health lost is counted separately from ward lost,
      // because RALLY gives back health and must never give back a ground layer
      // the whole point of which is that it cannot be replaced.
      const soaked = Math.min(d.player.ward, dmg);
      d.player.ward -= soaked;
      const toHp = dmg - soaked;
      d.player.hp -= toHp;
      d.stats.damageTaken += dmg;
      d.floorHpLost += toHp;
      d.player.flow = false; // a charge you were hit through is not a dodge
      ev.push({
        t: 'eattack',
        phase: 'e',
        id: e.id,
        kind: e.kind,
        from: { ...cur },
        at: { ...next },
        dmg,
        exposed: d.player.exposed,
        hpAfter: Math.max(0, d.player.hp),
      });
      break; // strikes from where it stands; never enters your tile
    }

    if (d.enemies.some((o) => o.id !== e.id && eq(o.pos, next))) break;
    cur = { ...next };
  }

  if (!eq(cur, from)) {
    e.pos = cur;
    ev.push({ t: 'emove', phase: 'e', id: e.id, kind: e.kind, from, to: { ...cur } });
  }
  if (st.slow) e.ready = false;
}

/**
 * Advance the game by one player input.
 *
 * Pure: `state` is never mutated. Returns the next state plus an ordered event
 * list that the renderer and the audio layer schedule against.
 *
 * Turn order — player acts, then every enemy executes the intent it committed to
 * last turn, then intents are recomputed for the next turn.
 */
export function step(state: GameState, action: Action): StepResult {
  if (state.screen !== 'playing') return { state, events: [], spent: false };

  const d: GameState = structuredClone(state);
  const r = d.rules;
  const ev: Ev[] = [];
  const p = d.player;

  // Holding your ground. Costs a turn, sheds the swing — you spent it recovering
  // rather than committing — and hands the floor to the enemy phase unchanged.
  const waiting = action === 'wait';
  if (waiting && !r.allowWait) return { state, events: [], spent: false };
  // Out of holds for this floor. Costs nothing, exactly like a swipe into a wall
  // — being killed by an input the board had already spent is not a fair death.
  if (waiting && r.waitsPerFloor > 0 && d.floorWaits >= r.waitsPerFloor) {
    return { state, events: [], spent: false };
  }

  const dir: Dir = waiting ? p.facing : action;
  if (!waiting) p.facing = dir;

  // Where you stood when the turn opened, and what had committed to strike that
  // tile. Both are needed after the enemy phase to tell a dodge from a retreat.
  const openedOn: Vec = { ...p.pos };
  const wasAimedAt = d.enemies.some((e) => intentThreatens(e.intent, openedOn));

  const to = add(p.pos, DIR_VEC[dir]);

  // --- Player phase -------------------------------------------------------
  if (waiting) {
    p.exposed = false;
    p.combo = 0;
    d.floorWaits += 1;
    ev.push({ t: 'wait', phase: 'p', pos: { ...p.pos } });
  } else if (!inBounds(to) || isBlot(d, to)) {
    // A wall costs you nothing. Being killed by a mis-swipe into stone is not
    // the kind of commitment this game is about.
    ev.push({ t: 'blocked', phase: 'p', pos: { ...p.pos }, dir });
    return { state: d, events: ev, spent: false };
  }

  // Waiting swings at nothing and steps nowhere; it falls straight through to
  // the enemy phase below.
  const target = waiting ? undefined : d.enemies.find((e) => eq(e.pos, to));

  if (target) {
    const bonus = Math.min(p.combo, r.comboCap);
    // A charged stroke lands heavier and cannot be shrugged off. Spent here
    // whether or not it kills — you only get one punish per dodge.
    const charged = p.flow;
    p.flow = false;
    const dmg = p.dmg + bonus + (charged ? r.flowBonus : 0);
    target.hp -= dmg;
    p.combo = Math.min(p.combo + 1, r.comboCap);
    p.exposed = true; // you are mid-swing until you do something else

    // A stroke heavy enough breaks a poised stance, and that enemy's committed
    // action is cancelled in the phase that follows. Aggression is now also
    // defence — but you can only interrupt ONE per turn, everything you did not
    // hit strikes you at double while you are mid-swing, a stance you already
    // broke does not break again until you leave it alone for a turn, and a
    // heavy shrugs off anything lighter than its poiseBreak.
    const heavy = charged || dmg >= ENEMY_STATS[target.kind].poiseBreak;
    target.struck = heavy;

    const killed = target.hp <= 0;
    ev.push({
      t: 'bump',
      phase: 'p',
      from: { ...p.pos },
      to: { ...to },
      dir,
      dmg,
      combo: bonus,
      killed,
      kind: target.kind,
      id: target.id,
      /** False when the blow landed but was shrugged off. */
      broke: heavy && target.poise,
    });

    if (killed) {
      d.enemies = d.enemies.filter((e) => e.id !== target.id);
      d.stats.kills += 1;
      ev.push({ t: 'kill', phase: 'p', pos: { ...to }, kind: target.kind });

      /*
       * Kill the DROLLERY and everything it drew fades with it.
       *
       * The fiction says so — they are its marginal scribbles, not creatures —
       * and the mechanics need it. A boss floor carries no spill, so anything
       * outliving the boss has no clock behind it at all: measured, a 1-ply bot
       * kited a single leftover rat around a cleared boss floor for four
       * thousand turns in 9 runs of 40. It is also the right shape for a boss
       * fight, because it makes ignoring the adds and bursting the boss down a
       * real strategy rather than a losing one.
       *
       * Not counted as kills. You did not kill them; you killed the hand that
       * drew them.
       */
      if (isBossFloor(d.depth) && target.kind === eraAt(d.depth).boss) {
        for (const e of d.enemies) {
          ev.push({ t: 'kill', phase: 'p', pos: { ...e.pos }, kind: e.kind });
        }
        d.enemies = [];
      }

      /*
       * A kill is ink back on the page, and it clears the trail.
       *
       * A KILL, not a swing. Clearing on any stroke was launderable and the
       * harness found it immediately: strike-move-strike-move never accumulates
       * a trail at all, so on a crowded board — where there is always something
       * to swing at — wear costs nothing forever. Measured, one run in sixty sat
       * at depth 31 with seventeen bodies on the board, one health, and a FULL
       * charge of ink after three and a half thousand turns on the floor.
       *
       * Killing is bounded by what is actually there to kill, so it cannot be
       * farmed the same way — and it says the design's oldest thesis outright:
       * aggression that accomplishes something sustains you.
       */
      if (r.fadeMax > 0) p.ink = Math.min(r.fadeMax, p.ink + r.fadePerKill);
      p.trail = [];

      // RALLY: a kill wins back health lost on this floor, and nothing more.
      // Capped per floor so the spill cannot be farmed into an HP fountain.
      if (r.rallyPerKill > 0) {
        const room = Math.min(
          r.rallyPerKill,
          p.maxHp - p.hp,
          d.floorHpLost,
          Math.max(0, r.rallyFloorCap - d.floorHpRallied),
        );
        if (room > 0) {
          p.hp += room;
          d.floorHpRallied += room;
          ev.push({ t: 'pickup', phase: 'p', pos: { ...to }, kind: 'vial', amount: room });
        }
      }

      // MOMENTUM: the enemy phase is skipped and you act again. Enemies keep the
      // intents they already committed to, so you are moving inside a frozen
      // turn rather than being handed a fresh board — the telegraph stays a
      // promise. Bounded so a lucky clump cannot clear a floor in one input.
      // Never on the kill that clears the floor — the stairs unseal in the enemy
      // phase, so a free action there would just be a wasted swipe.
      if (r.killGrantsActions > 0 && d.chain < r.killGrantsActions && d.enemies.length > 0) {
        d.chain += 1;
        return { state: d, events: ev, spent: true };
      }
    }
    // You do NOT advance into the tile. A bump attack is a swing, not a step.
  } else if (!waiting) {
    p.exposed = false;
    p.combo = 0;
    p.pos = { ...to };
    ev.push({ t: 'move', phase: 'p', from: { ...state.player.pos }, to: { ...to }, dir });

    const item = d.items.find((i) => eq(i.pos, to));
    if (item) {
      d.items = d.items.filter((i) => i.id !== item.id);
      let amount = 0;
      if (item.kind === 'vial') {
        amount = Math.min(VIAL_HEAL, p.maxHp - p.hp);
        p.hp += amount;
        d.stats.vials += 1;
      } else if (item.kind === 'gesso') {
        // A ground layer over the page. Stacks, and is never capped by maxHp —
        // it is not health, it is something laid on top of you.
        amount = 1;
        p.ward += 1;
      } else {
        amount = 1;
        p.dmg += 1;
        d.stats.nibs += 1;
      }
      ev.push({ t: 'pickup', phase: 'p', pos: { ...to }, kind: item.kind, amount });
    }

    if (d.stairsOpen && eq(to, d.stairs)) {
      d.turn += 1;
      d.stats.turns += 1;
      enterFloor(d, ev);
      return { state: d, events: ev, spent: true };
    }
  }

  // --- Enemy phase --------------------------------------------------------
  d.chain = 0; // a turn is resolving; the momentum window closes here
  for (const e of d.enemies) execIntent(e, d, ev);

  // FLOW: you stepped off a tile something had committed to, and nothing landed.
  // Deliberately requires that the tile was ACTUALLY aimed at — walking around an
  // empty board is not a dodge — and that you took no damage at all, so weaving
  // out of one strike into another earns nothing.
  if (r.flowBonus > 0 && !eq(p.pos, openedOn) && wasAimedAt && !ev.some((e) => e.t === 'eattack')) {
    p.flow = true;
  }

  if (p.hp <= 0) {
    p.hp = 0;
    d.screen = 'dead';
    ev.push({ t: 'death', phase: 'e', depth: d.depth, cause: 'blow' });
    d.turn += 1;
    d.stats.turns += 1;
    return { state: d, events: ev, spent: true };
  }

  // A hold can cost more than an action, so patience is always priced. See
  // Rules.waitCost — at parity the harness stalls runs outright.
  d.floorTurns += waiting ? r.waitCost : 1;

  /*
   * The fade. Every action spends ink; run out and you are gone from the page —
   * not struck down, simply no longer written.
   *
   * Charged AFTER the enemy phase so a blow that kills you reads as the blow,
   * and only on turns that were actually spent, so a swipe into a wall is free
   * exactly the way it is for everything else.
   */
  if (r.fadeMax > 0) {
    p.ink -= r.fadePerAction;

    /*
     * WEAR. Retracing your steps wears the page through.
     *
     * Charged on the tile you ended the turn on, so it catches the actual
     * complaint — pacing back and forth to juke something — while a player
     * crossing fresh paper pays nothing however long they take. That is the
     * whole correction to the flat fade, which charged for time and therefore
     * only ever taxed the slower player.
     */
    if (r.wearMemory > 0 && !waiting) {
      if (p.trail.some((v) => eq(v, p.pos))) p.ink -= r.wearCost;
      p.trail.unshift({ ...p.pos });
      p.trail.length = Math.min(p.trail.length, r.wearMemory);
    }
    if (p.ink <= 0) {
      p.ink = 0;
      d.screen = 'dead';
      ev.push({ t: 'death', phase: 'e', depth: d.depth, cause: 'fade' });
      d.turn += 1;
      d.stats.turns += 1;
      return { state: d, events: ev, spent: true };
    }
  }

  // The page fills. Checked before the clear-check so a spill on the very turn
  // you kill the last enemy keeps the floor honestly uncleared.
  if (shouldSpill(d)) {
    const rng = new Rng(d.rng);
    const site = spillSite(d, rng);
    d.rng = rng.s;
    if (site) {
      const e = makeEnemy(d.nextId++, 'rat', site, rng.int(1 << 20));
      d.enemies.push(e);
      ev.push({ t: 'spill', phase: 'e', pos: { ...site }, kind: 'rat' });
    }
  }

  if (d.enemies.length === 0 && !d.stairsOpen) {
    d.stairsOpen = true;
    ev.push({ t: 'unseal', phase: 'e', pos: { ...d.stairs } });

    /*
     * You cleared the floor while standing on the way down.
     *
     * Descending is normally "step ONTO the stairs", so a player already on that
     * tile had to step off and step back — and a search bot never will, because
     * stepping off scores strictly worse than standing on the exit. Measured, one
     * run in thirty wedged exactly here and burned six thousand turns on a clear
     * board with the stairs open under its feet.
     *
     * It has always been possible; boss floors merely made it likely, because a
     * duel ends wherever the last blow landed. The seal breaking under you is
     * the same event as walking onto it.
     */
    if (eq(p.pos, d.stairs)) {
      d.turn += 1;
      d.stats.turns += 1;
      enterFloor(d, ev);
      return { state: d, events: ev, spent: true };
    }
  }

  replan(d);
  d.turn += 1;
  d.stats.turns += 1;
  return { state: d, events: ev, spent: true };
}

/** Preview a floor without playing it — used by the title screen's idle board. */
export function demoState(seed: number = randomSeed()): GameState {
  const s = newGame(seed);
  s.screen = 'title';
  return s;
}
