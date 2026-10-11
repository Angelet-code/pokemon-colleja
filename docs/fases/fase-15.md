# Fase 15 — El nivel 3 lee el equipo entero (arquetipos)

> **Brief de la fase.** Escrito el 2026-10-11 a partir de la propuesta de ampliaciones (opción **E1**, elegida por el usuario). Las opciones que no se hicieron pasan a la [propuesta de la fase 16](fase-16.md).
> Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md), la de [herramientas](../guias/herramientas.md), [ADR-0015](../adr/0015-vista-previa-del-nivel-3.md) y [ADR-0016](../adr/0016-clima-en-la-vista-previa.md).

## Objetivo

Que en la vista previa el nivel 3 vea **el equipo entero** y no solo duelos 1 contra 1: qué pinta tiene cada equipo, qué arquetipo puede ser (Espacio Raro, Viento Afín, clima, potenciarse con apoyo), qué 4 encajan entre sí y qué pareja de salida monta el plan. Como primera aproximación, sin simular parejas (eso es la E2).

## Decisión del usuario (2026-10-11)

1. **Enseña y decide si mejora**: medido con el arena; si no mejora, solo se enseña.
2. Se mide con **tus rivales guardados y con aleatorios** (los aleatorios casi nunca forman arquetipos): el arena gana `--teams rivales`.
3. Se ve en **«Pensamiento del bot»**: la lectura de tu equipo; la del suyo solo con equipo abierto o en el replay. No en el teambuilder (queda propuesto).
4. **Lectura en los dos modos; decide solo en dobles.**

## Punto de partida

- La vista previa del nivel 3 sumaba duelos 1 contra 1 (`duelScore`) en el clima de sus setters ([ADR-0016](../adr/0016-clima-en-la-vista-previa.md)). No veía Espacio Raro, Viento Afín ni potenciarse con apoyo; podía dejar fuera al inductor de Espacio Raro.
- En dobles elegía como el nivel 2 (cobertura); la predicción de tus grupos solo se enseñaba.

## Hechos verificados

- Los sets estándar de dobles tienen 26 con Espacio Raro, 26 con Viento Afín, 41 con Sorpresa y 10 con Señuelo o Polvo Ira; de 3 a 6 inductores de cada clima. Los equipos aleatorios llevan a menudo un inductor y algún Pokémon lento por casualidad, sin plan.
- Tus 26 rivales de dobles guardados sí forman arquetipos (los lee bien `readTeam`: «Sol + Espacio Raro», «Lluvia Mega-Swampert», Viento Afín con Dragonite o Staraptor…).
- Los duelos (`movesFirst`, `effectiveSpeed`) ya leen Espacio Raro (`pseudoWeather`) y Viento Afín (condición de lado): basta con preguntar con otro campo (`withSpeedControl`).
- Sumar puntos sueltos por arquetipo **no gana fuerza** con tus rivales (76,2 frente a 76,3 %): los atacantes lentos seguían valiendo poco en duelos sin Espacio Raro.

## Diseño aplicado

Ver [ADR-0017](../adr/0017-arquetipos-en-la-vista-previa.md).

1. **`analysis/team-read.ts`**: papel de cada miembro en cada arquetipo (quién lo pone, quién lo aprovecha) como probabilidad sobre los sets que considera; fuerza de un arquetipo en un grupo; `readTeam` (arquetipos, grupo, pareja de salida).
2. **Dobles**: los duelos de cada grupo se mezclan con los mismos duelos bajo el Espacio Raro o el Viento Afín que pone el grupo (`fieldShare` × fuerza), al elegir su grupo y al predecir el tuyo. `Situation.withSpeedControl`.
3. **Explicación**: `PreviewAnalysis.teams` (core, protocol), censura de la lectura del bot con equipo cerrado, frases en la web (`teamStory`).
4. **Arena**: `--teams rivales|<carpeta>` (`tools/arena/src/pool.ts`).

## Tests

- `packages/bot/test/team-read.test.ts`: papeles, ponderación por sets, Espacio Raro, lluvia, potenciarse con apoyo, sin plan, fuerza de grupo y de pareja.
- `packages/bot/test/preview.test.ts`: lee tu equipo de Espacio Raro; en dobles trae a Farigiraf con sus atacantes lentos (sin el campo, no); individuales sin cambios.
- `packages/bot/test/weather.test.ts`: el control sin Llovizna pierde también Viento Afín (si no, Pelipper se trae por su Viento Afín).
- `packages/protocol/test/protocol.test.ts`, `apps/server/test/tools.test.ts` (la lectura del bot no llega con equipo cerrado), `apps/web/test/explanation-story.test.ts` y `tools.test.tsx` (frases), `tools/arena/test/arena.test.ts` (conjunto de equipos).

## Criterios de «hecho»

- ✅ La lectura de tu equipo se ve en «Pensamiento del bot»; la del suyo, solo con equipo abierto o en el replay (test).
- ✅ Medido con el arena (3 tandas de 600 combates por conjunto): con tus rivales 76,9 → **78,6 %**; con aleatorios 80,1 → 79,2 % (dentro del ruido). Se queda en dobles.
- ✅ `npm run check` y `npm run e2e` en verde; CI en verde.
- ✅ Docs: CHANGELOG, AGENTS, PLAN, README, guías del bot y de herramientas, ADR-0017 y la [propuesta de la fase 16](fase-16.md).

## Fuera de alcance

- Valorar parejas de salida 2 contra 2 (E2), la lectura en el teambuilder, terrenos, Intimidación en bucle o inmunidades del aliado a los ataques en área: [fase 16](fase-16.md).
