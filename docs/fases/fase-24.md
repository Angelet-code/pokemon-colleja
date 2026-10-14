# Fase 24 — Cuánto falta en los sets del rival

> **Brief de la fase.** Escrito el 2026-10-12 al cerrar la fase 23. Sigue la prioridad del usuario: que el bot **prediga al rival** (qué hará, a quién cambiará, qué Pokémon y sets tiene). Las fases 21 y 23 midieron que saber la salida y qué trae el rival vale ≈ 0 para el nivel 3. La fase 22 ganó 5–9 puntos con los sets del meta. Antes de seguir mejorando la deducción hay que saber **cuánto queda por ganar en los sets**. Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md), [ADR-0012](../adr/0012-deduccion-de-sets-y-estilo-del-rival.md) (deducción), [ADR-0024](../adr/0024-sets-del-meta-para-predecir-al-rival.md) (sets del meta) y [ADR-0025](../adr/0025-que-trae-el-rival-no-importa.md) (qué trae el rival).

## Objetivo

Medir el techo de conocer los sets exactos del rival frente a suponer los del meta (nivel 3 contra nivel 3). Si es grande, mejorar la deducción hasta acercarse; si es pequeño, parar y proponer al usuario el siguiente frente (lo que hará el rival cada turno).

## Punto de partida (verificado al cerrar la fase 23)

- Con equipo cerrado, `OpponentModel` supone los sets del meta (`BotOptions.setPriors`) y la deducción (`inference/beliefs.ts`) los pesa por el daño y la velocidad observados. Con equipo abierto, `AgentContext.opponentTeam` trae el equipo del rival (`engine/src/session.ts`, solo si `openTeamSheets`) y `OpponentModel` usa esos sets.
- La única cifra de techo de sets es vieja (fase 10–11, individuales, contra el nivel 2): 70,7 % con equipo abierto frente a 67,1 % con equipo cerrado y deducción. No hay ninguna con los sets del meta ni nivel 3 contra nivel 3.
- `--open-team-sheets` en el arena abre el equipo **a los dos**: para un techo hace falta que **solo el bot A** lo vea. Ganchos de medida parecidos ya existen: `BotOptions.fixedGroup` (fase 21) y `BotOptions.rivalBrought` (fase 23, `--a-oracle`).
- Medir: lanzador de 15 arenas de 80 combates (semillas `t1-*`, `t2-*`), `--fixed --teams meta --a-priors meta --b-priors meta`, sumando por pares. ≈ 25 min por tanda.

## Diseño recomendado

Si te apartas de esto, escribe un ADR (ADR-0026).

### 1. Techo (arena)

- Gancho `BotOptions.rivalSets` (o ampliar `--a-oracle` con un modo `sets`): el bot A recibe el equipo real del B como si fuera equipo abierto (solo él). Ojo: el sandbox ya monta los forks con los sets supuestos; con el oráculo, esos son los reales.
- Dos tandas con equipos del meta y una con tus rivales guardados (sus sets se alejan más del meta: ahí debería verse más techo).
- **Si el techo es ≲ 2 puntos, para y decídelo con el usuario.**

### 2. Si hay techo: de dónde viene

- Variantes de oráculo parcial para repartirlo: solo objetos, solo movimientos, solo repartos (Stat Points y naturaleza). Lo que más pese es lo que hay que deducir mejor.
- Prueba barata con replays (como `ladder:sets:eval`) para la parte que se vea en un log (objeto, movimientos); los repartos solo los mide el arena.

### 3. Mejorar la deducción

- Ideas según dónde esté el techo:
  - repartos más finos en `buildSetPriors`;
  - sets condicionados por los compañeros del equipo (el `chaos` de Smogon da `teammates`);
  - más variantes de reparto en `inferBeliefs`;
  - la verosimilitud de la velocidad y el daño.
- Cada variante, nivel 3 contra nivel 3 en espejo y dos tandas.

## Tests

- El gancho de oráculo: sin él, mismas decisiones (huellas de `arena:perf`); con él, el modelo del rival devuelve los sets reales y el sandbox los usa.
- Invariancia del sandbox y explicaciones sin cambiar decisiones, en verde (`expert.test.ts`, `explain.test.ts`).

## Criterios de «hecho»

- Techo con cifras en un ADR (y, si es pequeño, la decisión con el usuario).
- Si sigue: la mejora medida en dos tandas, cifras en el CHANGELOG y decisión de activarla con el usuario. Nivel 3 ≤ ~1 s de media por decisión.
- `npm run check` y `npm run e2e` en verde; CI en verde. Docs y brief de la fase 25.

## Fuera de alcance

- Predecir qué trae el rival o su salida (medido: ≈ 0, ADR-0023 y ADR-0025).
- Los sets del meta en «Calcular» desde el combate (mejora pequeña aparte).
- El estilo de un jugador concreto o su historial.
