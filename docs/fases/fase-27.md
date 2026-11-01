# Fase 27 — La vista previa trae juntas las piezas de un combo

> **Brief de la fase.** Escrito el 2026-11-01 al cerrar la fase 25 (parada en el techo de los sets, [ADR-0027](../adr/0027-techo-de-los-sets-del-rival.md)) como fase 26; pasó a la 27 porque los golpes críticos ([fase 26](fase-26.md), [ADR-0028](../adr/0028-golpes-criticos.md)) fueron antes. Viene de la fase 24: el usuario quiere que el bot **entienda de qué va el equipo que juega**. Desde la fase 24 el nivel 2 sabe jugar Intercambio con Intimidación, Bromista, Última Palabra o Vasta Guardia, pero en la vista previa de dobles el bot elige sus 4 por duelos uno contra uno: muchas veces deja fuera una pieza del combo. Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md#nivel-3-vista-previa), [ADR-0015](../adr/0015-vista-previa-del-nivel-3.md) (vista previa), [ADR-0017](../adr/0017-arquetipos-en-la-vista-previa.md) (arquetipos), [ADR-0018](../adr/0018-parejas-de-salida-simuladas.md) (salidas simuladas) y [ADR-0026](../adr/0026-movimientos-de-estado-del-nivel-2.md) (movimientos de estado).

## Objetivo

Que el nivel 3, en dobles, traiga juntos a los Pokémon que se necesitan (Intercambio y los dos con Intimidación; un setter de clima y sus atacantes ya lo hace) y, si mejora, que salga con ellos. Medido con los equipos del usuario que giran en torno a un combo y con sus rivales guardados.

## Punto de partida (verificado el 2026-11-01)

- `planPreview` (`search/preview.ts`): en dobles elige el grupo como el nivel 2 (`PREVIEW_SETTINGS.doubles.groups = 0`): duelos uno contra uno (`duelTable`, `blendedDuel`) mezclados con Espacio Raro y Viento Afín (`fieldShare`, ADR-0017) y el clima de sus setters (ADR-0016). Nada valora Intercambio, Intimidación doble ni otros combos de la fase 24.
- `readTeam` (`analysis/team-read.ts`) lee arquetipos (Espacio Raro, Viento Afín, clima, potenciarse con apoyo), solo para la explicación salvo `fieldShare`. Sumar puntos sueltos por arquetipo no ganó nada (ADR-0017): **cambia el modelo**.
- `DoublesSim.evaluateLineup` y `LeadPlanner` (ADR-0018) juegan parejas 2 contra 2 fuera del combate y, desde la fase 24, entienden Intercambio, Intimidación al entrar, Bromista, etc. Hoy **solo explican**: elegir la salida así perdía 2–3 puntos con los rivales guardados (antes del modelo de la fase 24).
- Medidas de la fase 24: con «Doble Intimidación» contra «Intercambio (PC)», 51,8 % ± 2,4 frente al bot sin el modelo, en `--fixed` (4 de 6 **al azar**): las piezas a menudo no coincidían. En `--fixed-group` el bot elige su salida dentro de un grupo fijo.
- Equipos del usuario (storage, no versionado): «Doble Intimidación» e «Intercambio (PC)» en `storage/teams/`.
- El arena: `--fixed-group` con `--a-leads`/`--b-leads`, `--teams rivales|<carpeta>|meta`, `--a-settings`/`--b-settings`, priors del meta. Lanzador de 15 arenas de 80 combates, ≈ 20 min por tanda.

## Diseño recomendado

Si te apartas de esto, escribe un ADR (ADR-0029).

1. **Medir antes el techo**: ¿cuánto gana el bot si trae el grupo bueno? Un oráculo barato: en el arena, comparar la vista previa del bot con un grupo fijado a mano que lleva el combo (`BotOptions.fixedGroup`) con los equipos del usuario. Si no gana nada, **parar y decidirlo con el usuario**.
2. **Valorar grupos con la simulación**: para los mejores grupos candidatos del nivel 2 (p. ej. 4–6), jugar sus parejas de salida contra las salidas probables del rival con `LeadPlanner`/`evaluateLineup` (que ya entienden los combos) y mezclar ese valor con el de los duelos (peso en `PREVIEW_SETTINGS`). Así el combo cuenta por lo que hace en la partida, no por una regla.
3. **La salida**: volver a medir elegirla con las parejas simuladas ahora que la simulación entiende los movimientos de estado (fase 24); si sigue perdiendo, solo explica.
4. La explicación de la vista previa debe decir el combo con términos de partida («trae a X e Y para Intercambio con doble Intimidación»), comprobada como las demás (`checkedReasons`): solo si quitarlo cambia la elección.

## Tests

- Con el ajuste a 0, mismas decisiones que hoy (huellas de `arena:perf`).
- Un equipo de combo (Intercambio + dos Intimidación) contra rivales físicos: la vista previa trae a los tres.
- `explain.test.ts`, `leads.test.ts`, `preview.test.ts` y la invariancia del sandbox, en verde.

## Criterios de «hecho»

- Techo medido; si sigue, la mejora nivel 3 contra nivel 3 en dos tandas con los equipos de combo y sin perder con los rivales guardados ni el meta. Cifras en el ADR y el CHANGELOG; activarla, decisión del usuario.
- Vista previa ≤ ~3 s y decisiones del nivel 3 ≤ ~1 s de media.
- `npm run check` y `npm run e2e` en verde; CI en verde. Docs y brief de la fase 28.

## Fuera de alcance

- Mejorar la deducción de sets raros (≈ 5 puntos con equipos de torneo, ADR-0027): queda propuesta con oráculos parciales.
- Predecir qué trae el rival o su salida (≈ 0, ADR-0023 y ADR-0025).
- Modelar los movimientos de estado que siguen en `UNMODELLED_STATUS_MOVES` (Mofa, Truco, Canto Mortal…).
