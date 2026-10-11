# Fase 16 — Parejas de salida simuladas y por qué (E2)

> **Brief de la fase.** Escrito el 2026-10-11 a partir de la propuesta de ampliaciones (opción **E2**, elegida por el usuario). Las opciones que no se hicieron pasan a la [propuesta de la fase 17](fase-17.md).
> Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md), la de [herramientas](../guias/herramientas.md), [ADR-0015](../adr/0015-vista-previa-del-nivel-3.md) y [ADR-0017](../adr/0017-arquetipos-en-la-vista-previa.md).

## Objetivo

Que el nivel 3, en dobles, valore las **parejas de salida** jugándolas 2 contra 2 (Sorpresa con quien se potencia, inductor con sus atacantes, dos que tumban a uno) en lugar de quedarse con los dos de mejor duelo medio, y que **explique por qué** esperaba tu salida y por qué eligió la suya.

## Decisión del usuario (2026-10-11)

1. Como siempre: **enseña y decide si mejora** (medido con el arena); si no, solo se enseña.
2. La explicación, **en términos de partida y no con puntuaciones**: «por un combo, para presionar a un Pokémon, para poder tumbar a alguien, para evitar algo, porque si pasa X necesitamos Y para Z». Las frases con valores («le dejaba +24») no se entienden en mitad de una partida.

## Punto de partida

- La vista previa de dobles elegía su grupo por cobertura (con el clima y el control de velocidad del grupo, [ADR-0017](../adr/0017-arquetipos-en-la-vista-previa.md)) y salía con los dos de mejor duelo medio.
- `DoublesSim` (nivel 2) ya modela Sorpresa, Refuerzo, redirección, Viento Afín, Espacio Raro, pantallas y ataques en área, pero solo con los Pokémon del campo.

## Hechos verificados

- Una vista previa con todas las parejas simuladas tarda ≈ 90 ms (≈ 60 ms más). Como al final no decide, se calcula solo al explicar: las decisiones y los tiempos del arena son los de la fase 15.
- Las 8 variantes de elección de salida medidas pierden entre 2 y 3 puntos con tus rivales (tabla en el [ADR-0018](../adr/0018-parejas-de-salida-simuladas.md)): no es la predicción, ni los movimientos de estado propios, ni la temperatura. Tres turnos premian el primer intercambio; el duelo medio, rendir contra todo el equipo rival.
- Los cálculos de las razones salen de la calculadora: «tu Slowking tumba de un golpe a su Conkeldurr» es un Psíquico con un 56 % de KO.

## Diseño aplicado

Ver [ADR-0018](../adr/0018-parejas-de-salida-simuladas.md).

1. `DoublesSim.evaluateLineup` (alineación fuera del combate) y `SimTrace` (KOs, daño, Sorpresa, efectos).
2. `search/lead-plan.ts` (`leadMatchup`: mejor plan del turno 1 de una pareja contra otra) y `LeadPlanner` (`search/preview.ts`, caché y alineaciones con una Mega por lado).
3. Predicción de tu salida 2 contra 2 contra sus salidas probables (`leads` en `PREVIEW_SETTINGS`), perezosa (`PreviewPlan.leads`).
4. `search/lead-reasons.ts`: `LeadReading` con razones `combo`, `ko`, `pressure`, `fakeout`, `redirect` y `avoid`; `PreviewAnalysis.leads` (core, protocol); censura de las suyas con equipo cerrado; frases en la web (`leadStory`).

## Tests

- `packages/bot/test/leads.test.ts`: una alineación se juega fuera del combate y apunta Espacio Raro y el daño; `leadMatchup` es determinista; la explicación trae tu salida esperada y la suya (que es la que trae primero) sin cambiar la decisión.
- `apps/server/test/tools.test.ts`: en dobles, la explicación trae tu salida esperada y, de la suya, solo Pokémon vistos y ningún plan que necesite un movimiento aún no usado.
- `packages/protocol/test/protocol.test.ts` (ida y vuelta), `apps/web/test/explanation-story.test.ts` (frases de los dos lados).

## Criterios de «hecho»

- ✅ Medido: ninguna variante mejora (−2 a −3 puntos con tus rivales). La salida se elige como antes y las decisiones son idénticas a las de la fase 15 (comprobado semilla a semilla).
- ✅ «Pensamiento del bot» dice por qué esperaba tu salida y por qué eligió la suya, con razones de partida y sin revelar lo oculto (tests).
- ✅ `npm run check` y `npm run e2e` en verde; CI en verde.
- ✅ Docs: CHANGELOG, AGENTS, PLAN, README, guías del bot y de herramientas, ADR-0018 y la [propuesta de la fase 17](fase-17.md).

## Fuera de alcance

- Una valoración de la salida que mire más allá de los primeros turnos (la pareja con el resto del equipo detrás), la vista previa menos predecible (G) y el resto de opciones: [fase 17](fase-17.md).
