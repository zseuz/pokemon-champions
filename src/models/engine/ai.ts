/**
 * Evaluación de jugadas: lo usa el Asistente de turno (para recomendar) y la IA del simulador.
 * Puntúa cada movimiento × objetivo con el daño real de @smogon/calc y heurísticas de dobles VGC.
 */
import {
  activeMons, allyOf, benchOf, canMegaNow, computeDamage, effSpeed, foesOf, isStatusMove, legalMoves,
  legalTargets, monAt, moveTargetKind, movePriority, type Action, type BattleMon, type BattleState,
  type SideActions, type SideIdx, type Target,
} from './battle';
import { effectiveness, getMove } from '../domain/dex';
import { moveLabel } from '../domain/es';
import { STATUS_MOVES, moveAccuracy } from '../domain/moveEffects';

export interface Option {
  action: Action;
  score: number;
  label: string;
  reasons: string[];
}

const hpPct = (m: BattleMon) => (m.hp / m.maxHP) * 100;

/** Máximo daño (%) que `foe` puede hacer a `m` con cualquiera de sus movimientos. */
export function bestIncoming(state: BattleState, foe: BattleMon, m: BattleMon) {
  let best = { pct: 0, move: '' };
  for (const mv of legalMoves(foe)) {
    if (isStatusMove(mv)) continue;
    const spread = ['spread', 'all'].includes(moveTargetKind(mv)) && activeMons(state, m.side).length > 1;
    const d = computeDamage(state, foe, m, mv, { spread });
    if (d.maxPct > best.pct) best = { pct: d.maxPct, move: mv };
  }
  return best;
}

export function threatTo(state: BattleState, m: BattleMon) {
  const foes = foesOf(state, m);
  const each = foes.map((f) => ({ foe: f, ...bestIncoming(state, f, m) }));
  const total = each.reduce((t, e) => t + e.pct, 0);
  return { each, total, max: Math.max(0, ...each.map((e) => e.pct)) };
}

function outspeeds(state: BattleState, a: BattleMon, b: BattleMon) {
  const sa = effSpeed(state, a);
  const sb = effSpeed(state, b);
  return state.trickRoom > 0 ? sa < sb : sa > sb;
}

function targetLabel(state: BattleState, user: BattleMon, t?: Target) {
  if (!t || state.format === 'singles') return '';
  const m = monAt(state, t);
  if (!m) return '';
  return t.side === user.side ? ` → ${m.species} (aliado)` : ` → ${m.species}`;
}

/** Evalúa todas las opciones de un Pokémon activo y las ordena de mejor a peor. */
export function evaluateOptions(state: BattleState, user: BattleMon): Option[] {
  const opts: Option[] = [];
  const foes = foesOf(state, user);
  const ally = allyOf(state, user);
  const threat = threatTo(state, user);
  const myHp = hpPct(user);
  const inDanger = threat.total >= myHp;
  const firstTurn = user.turnsOnField === 0;
  const side = state.sides[user.side];
  const foeSide = state.sides[1 - user.side];
  const mega = canMegaNow(state, user);
  const singles = state.format === 'singles';

  const avgSpeedUs = activeMons(state, user.side).reduce((t, m) => t + m.stats.spe, 0);
  const avgSpeedThem = foes.reduce((t, m) => t + m.stats.spe, 0) || 1;
  const weAreSlower = avgSpeedUs / Math.max(1, activeMons(state, user.side).length) < avgSpeedThem / Math.max(1, foes.length);

  for (const mv of legalMoves(user)) {
    const kind = moveTargetKind(mv);
    const status = isStatusMove(mv);
    const prio = movePriority(state, user, mv);
    const acc = (moveAccuracy(mv, state.weather?.type) || 100) / 100;

    // ── Movimientos ofensivos ──
    if (!status) {
      const targets: (Target | undefined)[] = kind === 'foe' ? legalTargets(state, user, mv).filter((t) => t.side !== user.side) : [undefined];
      for (const t of targets) {
        const hit: BattleMon[] = kind === 'foe' ? [monAt(state, t!)!] : kind === 'spread' ? foes : [...foes, ...(ally ? [ally] : [])];
        const spread = hit.length > 1;
        let score = 0;
        const reasons: string[] = [];
        for (const h of hit) {
          const d = computeDamage(state, user, h, mv, { spread });
          const remaining = hpPct(h);
          const avg = (d.minPct + d.maxPct) / 2;
          const isAlly = h.side === user.side;
          if (isAlly) {
            if (d.maxPct > 0) { score -= Math.min(avg, remaining) * 1.5; reasons.push(`daña a tu aliado ${h.species} (${d.minPct}–${d.maxPct}%)`); }
            continue;
          }
          if (d.maxPct === 0) { reasons.push(`${h.species} es inmune`); continue; }
          let v = Math.min(avg, remaining);
          if (d.minPct >= remaining) { v += 60; reasons.push(`KO seguro a ${h.species} (${d.minPct}–${d.maxPct}%)`); }
          else if (d.maxPct >= remaining) {
            const chance = d.rolls.filter((r) => (r / h.maxHP) * 100 >= remaining).length / d.rolls.length;
            v += 60 * chance;
            reasons.push(`${Math.round(chance * 100)}% de KO a ${h.species} (${d.minPct}–${d.maxPct}%)`);
          } else reasons.push(`${d.minPct}–${d.maxPct}% a ${h.species}`);
          // rematar amenazas grandes vale más
          v *= 1 + Math.min(0.5, bestIncoming(state, h, user).pct / 200);
          if (d.effectiveness > 1) v += 3;
          score += v;
        }
        score *= acc;
        if (acc < 1) reasons.push(`precisión ${Math.round(acc * 100)}%`);
        // ataques de carga: sin el clima adecuado tardan 2 turnos
        const charge: Record<string, string> = { 'Electro Shot': 'Rain', 'Solar Beam': 'Sun', 'Solar Blade': 'Sun', 'Meteor Beam': '' };
        if (mv in charge && state.weather?.type !== charge[mv] && !(mv === 'Electro Shot' && user.item === 'Power Herb')) {
          score *= 0.45;
          reasons.push(`⚠ tarda 2 turnos${charge[mv] ? ` sin ${charge[mv] === 'Rain' ? 'lluvia' : 'sol'}` : ''} (el rival puede protegerse o golpearte antes)`);
        }
        // Fake Out
        if (mv === 'Fake Out' || mv === 'First Impression') {
          if (!firstTurn) { score = -100; reasons.unshift('solo funciona el primer turno en campo'); }
          else if (mv === 'Fake Out' && t) {
            const tm = monAt(state, t)!;
            const tThreat = bestIncoming(state, tm, user).pct + (ally ? bestIncoming(state, tm, ally).pct : 0);
            const blocked = tm.ability === 'Inner Focus' || foes.some((f) => f.ability === 'Armor Tail' || f.ability === 'Queenly Majesty') || (state.terrain?.type === 'Psychic' && !tm.types.includes('Flying'));
            if (blocked) { score = -20; reasons.unshift('Fake Out será bloqueado (Cola Armadura / Campo Psíquico / Foco Interno)'); }
            else { score += 25 + tThreat / 4; reasons.unshift(`hace retroceder a ${tm.species}`); }
          }
        }
        // Prioridad útil si somos más lentos y estamos en peligro
        if (prio > 0 && inDanger && foes.some((f) => outspeeds(state, f, user))) { score += 10; reasons.push('prioridad: golpeas antes'); }
        if (mv === 'Sucker Punch') { score *= 0.8; reasons.push('falla si el objetivo no ataca'); }
        if (['Close Combat', 'Draco Meteor', 'Make It Rain', 'Overheat', 'Leaf Storm'].includes(mv)) score -= 4;
        if (['U-turn', 'Volt Switch', 'Flip Turn'].includes(mv) && benchOf(state, user.side).length) { score += 6; reasons.push('pivota a otro Pokémon'); }
        opts.push({ action: { type: 'move', move: mv, target: t, mega }, score, label: moveLabel(mv) + targetLabel(state, user, t), reasons });
      }
      continue;
    }

    // ── Movimientos de estado ──
    const reasons: string[] = [];
    let score = 0;
    if (STATUS_MOVES.protect.includes(mv)) {
      if (user.protectCount > 0) { score = 2; reasons.push('Protección seguida puede fallar'); }
      else if (singles) {
        // en individuales sirve para ver qué hace el rival o gastar turnos de clima/quemadura, no para salvarte
        score = inDanger ? 14 : 6;
        reasons.push(inDanger ? 'solo retrasa el golpe un turno: mejor cambiar o atacar' : 'ver qué hace el rival');
        if (foes.some((f) => f.status === 'brn' || f.status === 'psn' || f.status === 'tox')) { score += 12; reasons.push('el rival pierde PS por su estado'); }
      }
      else if (inDanger) { score = 45 + (threat.total - myHp) / 4; reasons.push(`te pueden hacer ${Math.round(threat.total)}% este turno`); }
      else { score = 8; reasons.push('ganar un turno / ver jugada rival'); }
      if (side.tailwind === 0 && foeSide.tailwind > 0) { score += 10; reasons.push('gastar turnos del Viento Afín rival'); }
      if (state.trickRoom > 0 && !weAreSlower) { score += 10; reasons.push('gastar turnos del Espacio Raro'); }
    } else if (STATUS_MOVES.tailwind.includes(mv)) {
      if (side.tailwind > 0) { score = -10; reasons.push('Viento Afín ya activo'); }
      else if (state.trickRoom > 0) { score = 0; reasons.push('Espacio Raro activo: Viento Afín te haría más lento'); }
      else { score = (weAreSlower ? 50 : 22) * (singles ? 0.5 : 1); reasons.push(weAreSlower ? 'eres más lento: dobla tu velocidad 4 turnos' : 'asegura moverte primero'); }
    } else if (STATUS_MOVES.trickRoom.includes(mv)) {
      if (state.trickRoom > 0) { score = weAreSlower ? -30 : 30; reasons.push(weAreSlower ? '¡ya hay Espacio Raro y te favorece!' : 'anula el Espacio Raro rival'); }
      else { score = weAreSlower ? (singles ? 25 : 55) : -5; reasons.push(weAreSlower ? 'eres más lento: invierte el orden 5 turnos' : 'eres más rápido, no te conviene'); }
    } else if (STATUS_MOVES.redirect.includes(mv)) {
      const allyThreat = ally ? threatTo(state, ally) : null;
      if (ally && allyThreat && allyThreat.total > 30) { score = 30 + allyThreat.total / 4; reasons.push(`atrae ataques lejos de ${ally.species}`); }
      else { score = 10; reasons.push('redirige ataques'); }
      if (ally && (ally.set.moves.includes('Trick Room') || ally.set.moves.includes('Tailwind')) && state.trickRoom === 0) { score += 15; reasons.push('protege a tu aliado mientras prepara'); }
    } else if (STATUS_MOVES.helpingHand.includes(mv)) {
      if (!ally) { score = -50; reasons.push('no tienes aliado'); }
      else {
        const allyBest = Math.max(0, ...legalMoves(ally).filter((m) => !isStatusMove(m)).flatMap((m) => foes.map((f) => computeDamage(state, ally, f, m).maxPct)));
        score = 10 + allyBest / 5;
        reasons.push(`potencia 50% el ataque de ${ally.species}`);
      }
    } else if (mv in STATUS_MOVES.boostsSelf) {
      score = inDanger ? 4 : 30 - user.boosts.atk * 5 - user.boosts.spa * 5;
      reasons.push(inDanger ? 'arriesgado: estás amenazado' : 'buen momento para potenciarte');
    } else if (mv in STATUS_MOVES.heal) {
      score = myHp < 50 && !inDanger ? 40 : myHp < 60 ? 15 : -5;
      reasons.push(`estás al ${Math.round(myHp)}%`);
    } else if (mv in STATUS_MOVES.screens) {
      const key = STATUS_MOVES.screens[mv];
      if (side[key] > 0) { score = -10; reasons.push('ya activa'); }
      else if (key === 'auroraVeil' && state.weather?.type !== 'Snow') { score = -20; reasons.push('necesita nieve'); }
      else {
        const phys = foes.filter((f) => f.stats.atk > f.stats.spa).length;
        score = key === 'reflect' ? 15 + phys * 12 : key === 'lightScreen' ? 15 + (foes.length - phys) * 12 : 45;
        reasons.push('reduce el daño recibido 5 turnos');
      }
    } else if (mv in STATUS_MOVES.statusTarget || mv in STATUS_MOVES.boostsTarget || STATUS_MOVES.taunt.includes(mv)) {
      for (const t of legalTargets(state, user, mv).filter((t) => t.side !== user.side)) {
        const tm = monAt(state, t)!;
        let s = 0;
        const r: string[] = [];
        if (tm.ability === 'Good as Gold') { s = -20; r.push(`${tm.species} es inmune (Cuerpo Áureo)`); }
        else if (mv === 'Will-O-Wisp') { s = tm.status ? -10 : tm.types.includes('Fire') ? -20 : tm.stats.atk > tm.stats.spa ? 35 : 10; r.push('quema: reduce a la mitad su ataque físico'); }
        else if (mv === 'Thunder Wave') { s = tm.status || tm.types.includes('Electric') || tm.types.includes('Ground') ? -20 : outspeeds(state, tm, user) ? 30 : 12; r.push('parálisis: reduce su velocidad a la mitad'); }
        else if (mv in STATUS_MOVES.statusTarget) { s = tm.status ? -10 : 28; r.push('altera su estado'); }
        else if (mv === 'Parting Shot') { s = 22 + (inDanger ? 15 : 0); r.push('baja Ataque y At. Esp. y cambia de Pokémon'); }
        else if (mv in STATUS_MOVES.boostsTarget) { s = 18; r.push('baja sus stats'); }
        else if (STATUS_MOVES.taunt.includes(mv)) {
          const setsUp = tm.set.moves.some((m) => ['Trick Room', 'Tailwind', 'Follow Me', 'Rage Powder', 'Will-O-Wisp', 'Spore'].includes(m) || m in STATUS_MOVES.boostsSelf);
          s = setsUp && tm.tauntTurns === 0 ? 38 : 5;
          r.push(setsUp ? `impide que ${tm.species} use apoyo (${tm.set.moves.find((m) => isStatusMove(m) && m !== 'Protect') ?? 'estado'})` : 'pocas jugadas de apoyo que cortar');
        }
        if (user.ability === 'Prankster' && tm.types.includes('Dark')) { s = -30; r.push('Siniestro es inmune a Bromista'); }
        opts.push({ action: { type: 'move', move: mv, target: t, mega }, score: s * (moveAccuracy(mv) || 100) / 100, label: moveLabel(mv) + targetLabel(state, user, t), reasons: r });
      }
      continue;
    } else if (['Stealth Rock', 'Spikes', 'Toxic Spikes', 'Sticky Web'].includes(mv)) {
      const foeBench = benchOf(state, (1 - user.side) as SideIdx).length;
      const already = (mv === 'Stealth Rock' && foeSide.stealthRock) || (mv === 'Spikes' && foeSide.spikes >= 3);
      if (already) { score = -15; reasons.push('ya está puesta'); }
      else if (!foeBench) { score = -10; reasons.push('el rival no tiene más Pokémon que sacar'); }
      else {
        score = (singles ? (inDanger ? 10 : 30) : 3) + foeBench * 3 - (mv === 'Spikes' ? foeSide.spikes * 6 : 0);
        reasons.push(singles ? `desgasta a cada Pokémon que el rival saque (le quedan ${foeBench})` : 'poco útil en dobles');
      }
    } else if (mv === 'Defog' || mv === 'Tidy Up') {
      const mine = side.stealthRock || side.spikes > 0;
      score = mine ? 28 + side.spikes * 4 : -5;
      reasons.push(mine ? 'quita las trampas de tu lado' : 'no hay trampas que quitar');
    } else if (STATUS_MOVES.perish.includes(mv)) {
      const myBench = benchOf(state, user.side).length;
      const foeBench = benchOf(state, (1 - user.side) as SideIdx).length;
      if (user.perish) { score = -20; reasons.push('ya hay Canto Mortal en curso'); }
      else if (!foeBench && myBench) { score = 60; reasons.push('el rival no puede cambiar: caerá en 3 turnos y tú sí puedes cambiar'); }
      else { score = 4; reasons.push('ambos pueden cambiar para evitarlo'); }
    } else if (STATUS_MOVES.encore.includes(mv) || STATUS_MOVES.phaze.includes(mv)) {
      for (const t of legalTargets(state, user, mv).filter((t) => t.side !== user.side)) {
        const tm = monAt(state, t)!;
        let s = 0;
        const r: string[] = [];
        if (STATUS_MOVES.encore.includes(mv)) {
          if (!tm.lastMove || tm.encore) { s = -15; r.push('el rival aún no ha usado ningún movimiento'); }
          else if (isStatusMove(tm.lastMove)) { s = 40; r.push(`lo deja atrapado usando ${moveLabel(tm.lastMove)}`); }
          else { s = 0; r.push(`le obligaría a repetir un ataque (${moveLabel(tm.lastMove)})`); }
        } else {
          const boosted = Object.values(tm.boosts).reduce((a, b) => a + Math.max(0, b), 0);
          const hazards = (foeSide.stealthRock ? 1 : 0) + foeSide.spikes;
          if (!benchOf(state, tm.side).length) { s = -20; r.push('el rival no tiene a quién sacar'); }
          else { s = 8 + boosted * 15 + hazards * 6; r.push(boosted ? 'elimina sus mejoras de stats' : 'saca a un Pokémon al azar'); if (hazards) r.push('le hace pasar por tus trampas'); }
        }
        opts.push({ action: { type: 'move', move: mv, target: t, mega }, score: s, label: moveLabel(mv) + targetLabel(state, user, t), reasons: r });
      }
      continue;
    } else {
      score = 5;
      reasons.push('efecto de apoyo');
    }
    opts.push({ action: { type: 'move', move: mv, mega }, score, label: moveLabel(mv), reasons });
  }

  // ── Cambios ── (en individuales siempre se valoran: cambiar es la jugada clave)
  const bench = benchOf(state, user.side);
  const perishing = user.perish > 0 && user.perish <= 2;
  if (singles || inDanger || myHp < 35 || perishing) {
    for (const i of bench) {
      const b = state.sides[user.side].team[i];
      const incoming = foes.reduce((t, f) => t + bestIncoming(state, f, b).pct, 0);
      const benchHp = hpPct(b);
      const resists = foes.every((f) => f.types.every((ty) => effectiveness(ty, b.types) <= 1));
      // lo que el que entra puede hacer después al rival
      const offense = Math.max(0, ...foes.flatMap((f) => legalMoves(b).filter((m) => !isStatusMove(m)).map((m) => computeDamage(state, b, f, m).maxPct)));
      let score = (threat.total - incoming) / 2 + (resists ? 8 : 0) - (singles ? 14 : 10) + (singles ? Math.min(100, offense) / 5 : 0);
      const reasons = [`recibiría ~${Math.round(incoming)}% en vez de ~${Math.round(threat.total)}%`];
      if (singles) reasons.push(`después le puede hacer hasta ${Math.round(offense)}%`);
      // trampas que sufrirá al entrar
      const hz = b.item === 'Heavy-Duty Boots' || b.ability === 'Magic Guard' ? 0
        : (side.stealthRock ? 12.5 * effectiveness('Rock', b.types) : 0) +
          (side.spikes && !b.types.includes('Flying') && b.ability !== 'Levitate' ? [0, 12.5, 16.7, 25][side.spikes] : 0);
      if (hz) { score -= hz / 2; reasons.push(`pierde ~${Math.round(hz)}% por las trampas`); }
      if (perishing) { score += 60; reasons.unshift(`⚠ Canto Mortal: ${user.species} caerá ${user.perish === 1 ? 'este turno' : 'pronto'}`); }
      if (incoming + hz >= benchHp) { score -= 40; reasons.unshift(`⚠ ${b.species} (${Math.round(benchHp)}% PS) caería al entrar`); }
      if (resists) reasons.push('resiste sus ataques');
      opts.push({ action: { type: 'switch', to: i }, score, label: `Cambiar a ${b.species}`, reasons });
    }
  }

  return opts.sort((a, b) => b.score - a.score);
}

/**
 * Cuando un Pokémon en combate cae: qué Pokémon de la reserva conviene sacar (los debilitados no cuentan).
 * Valora el daño que hará a los rivales en combate, el que recibirá y quién es más rápido.
 */
export function rankSwitchIns(state: BattleState, side: SideIdx): Option[] {
  const foes = activeMons(state, (1 - side) as SideIdx);
  return benchOf(state, side).map((i) => {
    const b = state.sides[side].team[i];
    const hp = hpPct(b);
    const reasons: string[] = [];
    let offense = 0;
    let bestMove = '';
    for (const f of foes) for (const m of legalMoves(b).filter((mv) => !isStatusMove(mv))) {
      const d = computeDamage(state, b, f, m);
      if (d.maxPct > offense) { offense = d.maxPct; bestMove = `${moveLabel(m)} a ${f.species}`; }
    }
    const incoming = foes.reduce((t, f) => t + bestIncoming(state, f, b).pct, 0);
    const faster = foes.filter((f) => outspeeds(state, b, f)).length;
    let score = Math.min(100, offense) / 2 - Math.min(150, incoming) / 2 + faster * 10 + hp / 10;
    if (foes.length) {
      reasons.push(`le hace hasta ${Math.round(offense)}%${bestMove ? ` (${bestMove})` : ''}`);
      reasons.push(`recibiría ~${Math.round(incoming)}% (tiene ${Math.round(hp)}% PS)`);
      if (faster) reasons.push('es más rápido');
      if (incoming >= hp) { score -= 30; reasons.unshift('⚠ caería de un golpe'); }
      if (offense >= 100) { score += 20; reasons.unshift('puede dejarlo KO'); }
    } else reasons.push(`${Math.round(hp)}% PS`);
    return { action: { type: 'switch', to: i }, score, label: `Sacar a ${b.species}`, reasons } as Option;
  }).sort((a, b) => b.score - a.score);
}

/** Decide las acciones de un bando (IA). `noise` añade aleatoriedad: 0 = siempre la mejor jugada. */
export function chooseActions(state: BattleState, side: SideIdx, noise = 0.15): SideActions {
  const usedSwitch = new Set<number>();
  let megaTaken = false;
  return [0, 1].map((slot) => {
    const m = monAt(state, { side, slot });
    if (!m) return null;
    let opts = evaluateOptions(state, m).filter((o) => o.action.type !== 'switch' || !usedSwitch.has(o.action.to));
    if (!opts.length) return { type: 'move', move: legalMoves(m)[0] ?? 'Struggle' } as Action;
    const best = opts[0].score;
    opts = opts.filter((o) => o.score >= best - Math.abs(best) * noise - 1);
    const pick = opts[Math.floor(Math.random() * Math.min(opts.length, noise > 0 ? 2 : 1))];
    const action = { ...pick.action } as Action;
    if (action.type === 'switch') usedSwitch.add(action.to);
    if (action.type === 'move') {
      action.mega = !megaTaken && canMegaNow(state, m);
      if (action.mega) megaTaken = true;
    }
    return action;
  });
}

/** Resumen de orden de movimiento este turno (sin prioridad). */
export function speedOrder(state: BattleState) {
  return activeMons(state)
    .map((m) => ({ mon: m, speed: effSpeed(state, m) }))
    .sort((a, b) => (state.trickRoom > 0 ? a.speed - b.speed : b.speed - a.speed));
}

export function moveInfo(name: string) {
  return getMove(name);
}
