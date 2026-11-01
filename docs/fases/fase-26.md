# Fase 26 — Golpes críticos

> **Brief de la fase.** Escrito el 2026-11-01 al cerrarla: la fase no estaba planificada. Hablando de Sirfetch'd (Puerro + Dragoaliento del aliado = críticos seguros), el usuario pidió **enseñar críticos al bot**. La vista previa con las piezas de un combo pasó a la [fase 27](fase-27.md). Decisión y cifras en [ADR-0028](../adr/0028-golpes-criticos.md).

## Objetivo

Que la simulación del nivel 2 (y con ella el nivel 3 y el banco) cuente la probabilidad de crítico y juegue Foco Energía y Dragoaliento, sin perder fuerza.

## Punto de partida (verificado el 2026-11-01)

- `estimateDamage` (`analysis/damage.ts`) solo calculaba críticos forzados (`crit`) y los movimientos que siempre critican (`willCrit` de `@smogon/calc`).
- Foco Energía estaba en `UNMODELLED_STATUS_MOVES`; Dragoaliento no estaba en los sets estándar.
- Showdown (gen 7+): grados 0/1/2/≥3 → 1/24, 1/8, 1/2, 1. Foco Energía +2; Dragoaliento +1 (+2 a un Dragón, por sus tipos al usarlo); no se acumulan. Protocolo: `-start|POKEMON|move: Focus Energy` y `move: Dragon Cheer`.

## Diseño

- `critChance` y daño mixto (tiradas normales repetidas `1/p − 1` veces más las críticas) en `estimateDamage`; grado 0 ignorado.
- `Combatant.critBoost`, `BattleView.critBoost` (core), `CRIT_BOOST_MOVES` y `withCritBoost` en `DoublesSim` y en el plan de individuales.
- `SEARCH_SETTINGS.critModel` con 0 = el de antes (huellas idénticas).

## Tests

- `packages/bot/test/crits.test.ts`: grados, Dragoaliento a un Dragón, la mezcla de tiradas, Caparazón y que en dobles Dragoaliento al aliado vale más que pasar solo con el modelo encendido.
- `packages/core/test/battle.test.ts`: `critBoost` desde el log y a 0 al retirarse.
- `status-moves.test.ts`: `CRIT_BOOST_MOVES` en las tablas modeladas.

## Criterios de «hecho»

- Huellas idénticas con `critModel: 0`; nivel 3 contra nivel 3 sin perder (meta en dos tandas, equipos de críticos e individuales). Activarlo, decisión del usuario: **activado**.
- `npm run check` en verde; CI en verde. Docs y brief de la fase 27 (la vista previa con las piezas de un combo).

## Fuera de alcance

- Contar el grado 0 (1/24).
- Críticos en los factores de la valoración aprendida.
