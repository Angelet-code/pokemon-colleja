# Fase 23 — Qué trae el rival (lo que se trae en el meta)

> **Brief de la fase.** Escrito el 2026-10-12 al cerrar la fase 22. Sigue la prioridad del usuario: que el bot **prediga al rival** (qué hará, a quién cambiará, **qué Pokémon y sets tiene**). Con la fase 22 el bot ya supone los sets que se juegan; falta adivinar **qué 4 de los 6** de la vista previa trae el rival en dobles (3 de 6 en individuales). Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md), [ADR-0015](../adr/0015-vista-previa-del-nivel-3.md) (vista previa), [ADR-0023](../adr/0023-la-salida-no-se-aprende.md) (techo de la salida) y [ADR-0024](../adr/0024-sets-del-meta-para-predecir-al-rival.md) (sets del meta).

## Objetivo

Que el nivel 3 suponga qué Pokémon de la vista previa ha traído el rival (y cuáles no) con lo que se trae en el ladder, y que juegue mejor por ello. Se mide **nivel 3 contra nivel 3** en espejo, dos tandas (regla del usuario desde la fase 21).

## Punto de partida (verificado al cerrar la fase 22)

- **En combate** (`search/assumptions.ts`), las especies de la vista previa aún no vistas entran en cada suposición en un **orden al azar** (`random.shuffle(unseenSpecies)`): todas igual de probables. Con dos rivales ya vistos en dobles, quedan 4 candidatas para 2 huecos.
- **En la vista previa** (`search/preview.ts`, `planPreview`), el nivel 3 predice tus grupos y líderes por **cobertura** desde tu lado, con softmax y reparto uniforme (`PREVIEW_SETTINGS`). No usa ningún dato del meta.
- Los **replays** de `datasets/ladder/` (≈ 6 000 de dobles, rating ≥ 1 400) dicen qué trajo cada jugador (`broughtBySide` en `tools/ladder/src/leads.ts`) de su vista previa de seis. El `chaos` de Smogon solo da **compañeros por parejas** (`teammates`), no qué se trae.
- El meta (`@colleja/metagame`) ya guarda los sets probables por especie (`MetagameSnapshot.sets`) y los pasa al bot (`BotOptions.setPriors`) desde el servidor y el banco. Lo nuevo viajaría igual: datos planos en las opciones del bot.
- Medir: `npm run arena -- --a 3 --b 3 --mode doubles --fixed --teams meta --a-priors meta --b-priors meta` en 15 arenas de 80 combates (semillas `t1-*`, `t2-*`), sumando por pares. **Los dos bots con los sets del meta** (los dos con el mismo modelo del rival, salvo lo que se mida). Ojo: `--fixed` fija el grupo de cada lado; para medir qué trae el rival hace falta que cada bot **elija su grupo** (sin `--fixed`) o un modo nuevo.

## Diseño recomendado

Si te apartas de esto, escribe un ADR (ADR-0025).

### 1. Techo antes de nada (arena)

- Variante «oráculo»: el nivel 3 conoce **qué trajo** el rival (no sus sets): sus suposiciones usan solo las especies traídas. Es un gancho de medida como `fixedGroup` (p. ej. `BotOptions.rivalBrought`, que el arena rellena desde el equipo del otro bot).
- Mídelo contra el nivel 3 de hoy, en espejo y con equipos del meta. Si el techo es pequeño (≈ 1–2 puntos, como la salida en la fase 21), **para y decídelo con el usuario**.

### 2. Prueba barata (replays, sin tocar el bot)

- De cada replay, la vista previa de seis de cada lado y lo que trajo.
- Predictores de «se trae»: (a) uniforme; (b) la tasa con que se trae cada especie en los replays (de un mes anterior a los de prueba); (c) con los compañeros (traer A sube la de B); (d) lo que hoy usa `planPreview` (cobertura contra el equipo del otro).
- Acierto de los 4 traídos y log-loss por especie. Divide por partida. Si nada mejora claramente al uniforme, para.

### 3. El bot lo usa

- `BotOptions.bringPriors` (especie base → probabilidad de traerla, o algo más rico si la prueba lo justifica), calculado en `@colleja/metagame` y guardado en la instantánea como los sets.
- `rivalAssumptions` sortea las no vistas **pesadas** por esa probabilidad en lugar de un orden al azar, y descarta las que ya no caben.
- `planPreview` puede mezclar esa probabilidad con su cobertura (peso en `PREVIEW_SETTINGS`, medido).
- Sin datos, todo idéntico (huellas de `arena:perf`).

### 4. Medir

- Nivel 3 con la variante contra el nivel 3 de hoy, los dos con los sets del meta: dos tandas con equipos del meta y una con tus rivales guardados.

## Tests

- Las probabilidades de traer: deterministas, entre 0 y 1, desde fixtures (replays recortados de `tools/ladder/test/fixtures/`).
- `rivalAssumptions` con y sin probabilidades: sin ellas, igual que antes; con ellas, la especie más traída sale más a menudo (semillas fijas).
- Invariancia del sandbox y explicaciones sin cambiar decisiones en verde (`expert.test.ts`, `explain.test.ts`).

## Criterios de «hecho»

- Techo y prueba barata con cifras en el ADR (y, si no salen, la decisión con el usuario).
- Si sigue: dos tandas en espejo con equipos del meta y una con tus rivales; cifras en el CHANGELOG y decisión de activarlo con el usuario. Nivel 3 ≤ ~1 s de media por decisión.
- `npm run check` y `npm run e2e` en verde; CI en verde. Docs y brief de la fase 24.

## Fuera de alcance

- Elegir el bot su propio grupo de 4 de 6 con lo aprendido (mide antes cuánto vale, como la salida).
- Los sets del meta en «Calcular» desde el combate (la web no los recibe; posible mejora pequeña aparte).
- El estilo de un jugador concreto o su historial.
- El fallo de Plegaria Vital (tarea aparte).
