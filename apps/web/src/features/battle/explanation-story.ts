/**
 * The bot's train of thought in a few plain Spanish sentences: what it expected the player to
 * do, what it ruled out and why it chose what it chose (level 3, from `expected` and each
 * option's `versus`; at team preview, from `preview`). Pure: the panel only renders them.
 */
import type {
  DecisionExplanation,
  ExpectedReply,
  ExplainedAction,
  ExplainedOption,
  PreviewAnalysis,
  PreviewRival,
} from '@colleja/core';
import type { Locale } from '@colleja/data';
import { moveName, speciesName } from '@colleja/narration';

/** Score points (HP balance × 100) from which an outcome is a clear win or loss. */
const CLEAR_OUTCOME = 15;
/** Probability from which the bot was "almost sure". */
const ALMOST_SURE = 0.75;
/** Alternatives named per Pokémon in doubles. */
const MAX_ALTERNATIVES = 2;

/** The sentences of a decision; empty when the bot did not anticipate the player. */
export function explanationStory(
  explanation: DecisionExplanation,
  locale: Locale,
  label: (option: ExplainedOption) => string,
): string[] {
  if (explanation.preview) return previewStory(explanation, explanation.preview, locale);
  const expected = explanation.expected ?? [];
  const chosen = explanation.options.find((option) => option.chosen);
  if (expected.length === 0 || !chosen) return [];
  const doubles = expected.some((reply) => reply.actions.length > 1);
  const story = doubles
    ? doublesExpectations(expected, locale)
    : singlesExpectations(expected, locale);

  const counters = expected.filter((reply) => reply.counter);
  if (counters.length > 0) {
    story.push(
      `Como sueles anticiparte a la jugada obvia, le dio más peso a ${joinOr(
        counters.map((reply) => withPercent(replyText(reply.actions, locale, doubles), reply)),
      )}.`,
    );
  }
  story.push('El resto de tus opciones lo descartó: las veía peores para ti.');
  story.push(decisionSentence(explanation.options, chosen, expected, locale, doubles, label));
  return story;
}

/**
 * Team preview: what the bot expected the player to bring and lead with, what it feared the
 * most and what it brought.
 */
function previewStory(
  explanation: DecisionExplanation,
  preview: PreviewAnalysis,
  locale: Locale,
): string[] {
  const chosen = explanation.options.find((option) => option.chosen);
  const size = chosen?.actions.length ?? 0;
  const leadCount = chosen?.actions.filter(
    (action) => action.kind === 'bring' && action.lead,
  ).length;
  const named = (rivals: readonly PreviewRival[], value: (rival: PreviewRival) => number) =>
    joinAnd(
      rivals.map((rival) => `${speciesName(rival.species, locale)} (${percent(value(rival))})`),
    );
  const story: string[] = [];
  const brought = [...preview.rivals].sort((a, b) => b.brought - a.brought).slice(0, size);
  const leads = [...preview.rivals]
    .sort((a, b) => b.lead - a.lead)
    .slice(0, Math.max(1, leadCount ?? 1));
  if (brought.length > 0) {
    story.push(
      `Esperaba que trajeras sobre todo a ${named(brought, (rival) => rival.brought)} y que empezaras con ${named(leads, (rival) => rival.lead)}.`,
    );
  }
  const threats = preview.rivals.filter((rival) => rival.threat >= CLEAR_OUTCOME);
  story.push(
    threats.length > 0
      ? `Lo que más temía de tu equipo: ${joinAnd(threats.map((rival) => speciesName(rival.species, locale)))}.`
      : 'Ninguno de tus Pokémon le parecía una gran amenaza para su equipo.',
  );
  if (chosen) {
    const actions = chosen.actions;
    const visible = actions.flatMap((action) =>
      action.kind === 'bring'
        ? [{ name: speciesName(action.species, locale), lead: action.lead }]
        : [],
    );
    const leaders = visible.filter((pokemon) => pokemon.lead).map((pokemon) => pokemon.name);
    const hidden = actions.length - visible.length;
    const lead =
      leaders.length > 0
        ? `, con ${joinAnd(leaders)} de ${leaders.length > 1 ? 'líderes' : 'líder'}`
        : '';
    story.push(
      hidden > 0
        ? `Eligió el grupo al que mejor le iba${lead}; ${hidden === 1 ? 'otro aún no lo has visto' : `los otros ${hidden} aún no los has visto`}.`
        : `Eligió a ${joinAnd(visible.map((pokemon) => pokemon.name))}${lead}: el grupo al que mejor le iba contra lo que esperaba.`,
    );
  }
  return story;
}

/** Singles: the likeliest reply, then the others. */
function singlesExpectations(expected: readonly ExpectedReply[], locale: Locale): string[] {
  const [top, ...others] = expected as [ExpectedReply, ...ExpectedReply[]];
  const [action] = top.actions;
  const who =
    action?.kind === 'move' && action.user ? ` de tu ${speciesName(action.user, locale)}` : '';
  const likeliest = withPercent(`${replyText(top.actions, locale, false)}${who}`, top);
  const story = [
    top.probability >= ALMOST_SURE
      ? `Estaba casi seguro de lo que harías: ${likeliest}.`
      : `Esperaba sobre todo ${likeliest}.`,
  ];
  if (others.length > 0) {
    story.push(
      `También contaba con ${joinOr(
        others.map((reply) => withPercent(replyText(reply.actions, locale, false), reply)),
      )}.`,
    );
  }
  return story;
}

/** Doubles: what it expected from each of the player's Pokémon (summed over the replies). */
function doublesExpectations(expected: readonly ExpectedReply[], locale: Locale): string[] {
  const byUser = new Map<string, Map<string, number>>();
  for (const reply of expected) {
    for (const action of reply.actions) {
      const user = action.user ?? '';
      const actions = byUser.get(user) ?? new Map<string, number>();
      const text = actionPhrase(action, locale, true);
      actions.set(text, (actions.get(text) ?? 0) + reply.probability);
      byUser.set(user, actions);
    }
  }
  return [...byUser].map(([user, actions]) => {
    const [top, ...others] = [...actions].sort((a, b) => b[1] - a[1]) as [
      [string, number],
      ...[string, number][],
    ];
    const who = user ? `De tu ${speciesName(user, locale)}` : 'De ti';
    const lead =
      top[1] >= ALMOST_SURE
        ? `${who} estaba casi seguro: ${top[0]} (${percent(top[1])})`
        : `${who} esperaba sobre todo ${top[0]} (${percent(top[1])})`;
    const rest = others
      .slice(0, MAX_ALTERNATIVES)
      .map(([text, probability]) => `${text} (${percent(probability)})`);
    return rest.length > 0 ? `${lead}; si no, ${joinOr(rest)}.` : `${lead}.`;
  });
}

/** Why the chosen option, against the reply it expected the most. */
function decisionSentence(
  options: readonly ExplainedOption[],
  chosen: ExplainedOption,
  expected: readonly ExpectedReply[],
  locale: Locale,
  doubles: boolean,
  label: (option: ExplainedOption) => string,
): string {
  const best = bestAgainst(options, 0);
  const mine = chosen.versus?.[0] ?? null;
  if (!best || mine === null) {
    return `Eligió «${label(chosen)}» porque, sumando todo, era lo que mejor le salía.`;
  }
  if (best === chosen || (best.versus?.[0] ?? -Infinity) <= mine) {
    return `Contra lo que más esperaba, «${label(chosen)}» era lo mejor: ${outcome(mine)}.`;
  }
  const cover = coveredReply(chosen, best, expected.length);
  const reply = cover === null ? undefined : expected[cover];
  return reply
    ? `Contra lo que más esperaba, lo mejor habría sido «${label(best)}», pero «${label(chosen)}» le cubría mejor por si elegías ${replyText(reply.actions, locale, doubles)}.`
    : `Contra lo que más esperaba, lo mejor habría sido «${label(best)}», pero sumando todo le salía mejor «${label(chosen)}».`;
}

/** The player's actions of a reply, as a noun phrase. */
export function replyText(
  actions: readonly ExplainedAction[],
  locale: Locale,
  doubles: boolean,
): string {
  return actions
    .map((action) => {
      const text = actionPhrase(action, locale, doubles);
      return doubles && action.user ? `${text} de tu ${speciesName(action.user, locale)}` : text;
    })
    .join(' y ');
}

/** One action of the player as a noun phrase ("Terremoto", "un cambio a Gyarados"…). */
function actionPhrase(action: ExplainedAction, locale: Locale, withTarget: boolean): string {
  switch (action.kind) {
    case 'move': {
      let text = moveName(action.move, locale);
      if (withTarget && action.target) {
        const target = speciesName(action.target, locale);
        text += action.targetSide === 'p1' ? ` sobre tu ${target}` : ` contra su ${target}`;
      }
      return action.mega ? `megaevolución y ${text}` : text;
    }
    case 'switch':
      return `un cambio a ${speciesName(action.species, locale)}`;
    case 'pass':
      return 'no hacer nada';
    case 'bring':
      return speciesName(action.species, locale);
    case 'hidden':
      return 'otra cosa';
  }
}

/** The option that did best against reply `index` (`null`: none was played against it). */
function bestAgainst(options: readonly ExplainedOption[], index: number): ExplainedOption | null {
  let best: ExplainedOption | null = null;
  for (const option of options) {
    const value = option.versus?.[index];
    if (value === null || value === undefined) continue;
    if (!best || value > (best.versus?.[index] ?? -Infinity)) best = option;
  }
  return best;
}

/** The other reply where `chosen` beats `best` the most (`null`: it never does). */
function coveredReply(
  chosen: ExplainedOption,
  best: ExplainedOption,
  replies: number,
): number | null {
  let covered: number | null = null;
  let margin = 0;
  for (let index = 1; index < replies; index++) {
    const mine = chosen.versus?.[index];
    const theirs = best.versus?.[index];
    if (mine === null || mine === undefined || theirs === null || theirs === undefined) continue;
    if (mine - theirs > margin) {
      margin = mine - theirs;
      covered = index;
    }
  }
  return covered;
}

function outcome(score: number): string {
  if (score >= CLEAR_OUTCOME) return 'salía ganando';
  if (score <= -CLEAR_OUTCOME) return 'salía perdiendo, pero era lo que menos perdía';
  return 'quedaba parejo';
}

function withPercent(text: string, reply: ExpectedReply): string {
  return `${text} (${percent(reply.probability)})`;
}

function percent(probability: number): string {
  return `${Math.round(probability * 100)} %`;
}

function joinOr(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} o ${items.at(-1)}`;
}

export function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}
