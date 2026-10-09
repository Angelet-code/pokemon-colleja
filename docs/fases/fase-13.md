# Fase 13 — Nivel 3 más rápido

> **Brief de la fase.** Escrito el 2026-10-09 a partir de la propuesta que cerró la fase 12, con las decisiones del usuario.
> Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md), [ADR-0010](../adr/0010-bot-experto-con-sandbox.md) y [ADR-0013](../adr/0013-banco-de-pruebas-con-hilos.md).

## Objetivo

Que medir variantes de un equipo en el banco sea **rápido sin perder calidad**: la A/B de la fase 12 (v1 contra v2, 20 rivales de dobles, nivel 3 contra 3, ± 5) en **≤ 7 min** (era ≈ 14), ≈ 2× más rápido.

## Decisión del usuario (2026-10-09)

1. De las cinco opciones propuestas (nivel 3 más rápido, tabla de daños, tipos y velocidades, optimizador de Stat Points, criba en la web), **la A: nivel 3 más rápido**.
2. A mitad de fase, con el techo de las optimizaciones idénticas a la vista (≈ 1,4×), **poda adaptativa**: se aceptan decisiones distintas si la **fuerza contra el nivel 2 en el arena no cambia** (≥ 600 combates por modo y dos semillas).

## Punto de partida

- Banco en la web y la terminal con hilos de trabajo, parada temprana, Neyman y A/B en pares (fase 12).
- Nivel 3: ≈ 1 s por decisión en dobles con 15 hilos; en un hilo, ≈ 0,3 s en individuales y 0,4 s en dobles con equipos aleatorios.

## Hechos verificados

- Perfil (`node --cpu-prof`, 12 combates por modo contra el nivel 2): Showdown jugando los turnos de las hojas, 36 % (individuales) / 48 % (dobles), con ≈ 6 400 llamadas a `getCallback` por turno simulado; deserializar cada hoja, 15–22 %; calculadora, 26 % en individuales (antes de esta fase).
- La caché de daño por contenido acertaba el 84 %, pero los PS exactos casi nunca se repiten tras un turno simulado: sin los PS, los fallos bajaban ≈ 2,7×. La calculadora solo lee los PS en siete movimientos y en dos umbrales (lleno, ≤ 1/3).
- tsx compila con `keepNames`: cada cierre con nombre creado en un bucle llama a `__name` (`Object.defineProperty`), 2–4 % del tiempo en dobles.
- Sin ganancia (medido alternando ejecuciones): sustituir `getCallback` por una versión con caché y reutilizar el formato al deserializar (ya estaba en caché).
- El reloj varía ±10 % con otros programas abiertos: para comparar dos versiones hay que **alternar** las ejecuciones; el tiempo de CPU ayuda.
- Otra sesión trabaja a la vez en el mismo checkout (explicación «Cómo lo pensó», que reutiliza la búsqueda sin cambiar decisiones): añade siempre rutas explícitas al hacer commit.

## Diseño aplicado

1. **Medir sin cambiar decisiones**: huella por combate (`BotBattleResult.fingerprint`) y `npm run arena:perf` (`--save`/`--compare`).
2. **Optimizaciones idénticas**: caché de tiradas por clase de PS con `EXACT_HP_MOVES`, sin cierres con nombre en `duel.ts` y `doubles-sim.ts`, claves de campo en caché.
3. **Poda sucesiva** (`search/lookahead.ts`): turnos por orden, `stillPromising` tras `pruneAfter` turnos con `pruneMargin` puntos.
4. Fuerza medida con el arena en procesos paralelos (mismas semillas con y sin poda).

## Tests

- `packages/bot/test/damage-cache.test.ts`: ningún movimiento, habilidad u objeto (salvo `EXACT_HP_MOVES`) cambia sus tiradas dentro de una clase de PS; la caché da lo mismo que la calculadora.
- `stillPromising` (en `team-chain.test.ts`) y huella reproducible en `tools/arena/test/arena.test.ts`.

## Criterios de «hecho»

- A/B v1 contra v2 del banco en ≤ 7 min con v1 mejor.
- La misma fuerza del nivel 3 contra el 2 (dentro del ruido, 1 200 combates por modo).
- `npm run check` y `npm run e2e` en verde; CI en verde.
- Docs: ADR-0014, guías del bot y del banco, CHANGELOG, AGENTS, PLAN, README y el brief de la fase 14.

> **Estado**: ✅ cerrada el 2026-10-09.
> - `npm run arena:perf`: 294 → 140 ms por decisión en individuales y 390 → 188 en dobles (2,10× / 2,07×). Solo con lo idéntico, 1,25× / 1,12×.
> - Fuerza contra el nivel 2 (1 200 combates por modo): individuales 64,8 % con poda frente a 64,6 % sin ella; dobles 79,9 % frente a 80,5 %. Dentro del ruido.
> - A/B v1 contra v2: **416 s** (antes 874 s), v1 mejor (−2,5 ± 4,9).
> - Detalle en [ADR-0014](../adr/0014-nivel-3-mas-rapido-con-poda.md) y el [CHANGELOG](../../CHANGELOG.md).

## Fuera de alcance (ampliaciones posibles para después)

Ver la [propuesta de la fase 14](fase-14.md): criba y varias versiones en la web, tabla de daños, tipos y velocidades, optimizador de Stat Points y gastar la velocidad ganada en fuerza.
