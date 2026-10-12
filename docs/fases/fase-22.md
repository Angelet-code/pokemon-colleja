# Fase 22 — El nivel 3 supone los sets del meta

> **Cerrada el 2026-10-12** ([ADR-0024](../adr/0024-sets-del-meta-para-predecir-al-rival.md)): el objeto supuesto acierta un 78,6 % (antes 34,5 %) y el nivel 3 con los sets del meta gana al de antes 59,5 / 59,3 % con equipos del meta y 55,1 % con los rivales guardados (46,6 % con aleatorios de sets estándar). Activado siempre que haya meta (decisión del usuario). La siguiente es la [fase 23](fase-23.md).

> **Brief de la fase.** Escrito el 2026-10-12 al cerrar la fase 21. Lo eligió el usuario: le importa que el bot **prediga al rival**, y lo que más limita al nivel 3 es la información oculta (con equipo abierto gana bastante más que con equipo cerrado y deducción). Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md), [ADR-0012](../adr/0012-deduccion-de-sets-y-estilo-del-rival.md) (deducción de sets), [ADR-0022](../adr/0022-meta-del-ladder-como-rivales.md) (el meta) y [ADR-0023](../adr/0023-la-salida-no-se-aprende.md).

## Objetivo

Que el bot suponga para cada Pokémon rival **los sets que se juegan** (las estadísticas de Smogon del meta), con su probabilidad, en lugar de los sets estándar de `@colleja/data`, y que el nivel 3 juegue mejor por ello. Se mide **nivel 3 contra nivel 3** (regla del usuario desde la fase 21).

## Punto de partida (verificado al cerrar la fase 21)

- `OpponentModel` (`packages/bot/src/analysis/opponent-model.ts`): con equipo cerrado, los candidatos de un rival son **los sets estándar** de su especie (`getStandardSets`).
  - Se filtran por lo revelado (Mega, objeto, habilidad, movimientos), quitando filtros si ninguno encaja.
  - Se ordenan por **inversión ofensiva** («prepararse para lo peor»).
  - Sin sets estándar, un set genérico sin inversión.
- La deducción del nivel 3 (`inference/beliefs.ts`, fase 11) pesa esos candidatos por el daño y la velocidad observados (verosimilitud 0,05 para lo que no cuadra) y prueba variantes de reparto. El peso **de partida** es uniforme, y es justo lo que puede dar el meta.
- El meta (`@colleja/metagame`, solo Node) guarda **un set por especie** en `storage/metagame/<mes>-<corte>.json` (el más usado). El `chaos` de Smogon tiene las **distribuciones** completas: habilidades, objetos, repartos, movimientos y compañeros, por especie y por Mega. Hoy la instantánea no las guarda.
- `@colleja/bot` es apto para navegador: no puede leer `storage/`. Los sets del meta le tienen que llegar como datos (opciones del bot), y los cargan el servidor, el arena y el banco.
- Medir: `npm run arena -- --a 3 --b 3 --mode doubles --fixed` en 15 arenas paralelas de 80 combates (semillas `t1-*`, `t2-*`), sumando por pares. Para esto es mejor el lanzador de la fase 21 (ver la guía del bot). Nivel 3 contra nivel 3 en dobles ≈ 18 min por 1 200 combates.

## Diseño recomendado

Si te apartas de esto, escribe un ADR (ADR-0024).

### 1. Sets del meta con su probabilidad (`@colleja/metagame`)

- Por especie (y por Mega), los **K sets más probables** (p. ej. K = 4) a partir del `chaos`. Por ejemplo: el reparto más usado con cada uno de los 2–3 objetos más usados, y los movimientos más probables que aprende. Cada set lleva un peso: el producto de las cuotas, normalizado.
- Todos legales en Champions, como en la fase 20.
- Se guardan en la instantánea (`MetagameSnapshot.sets`, subiendo su versión) o en un fichero aparte del mismo mes; decide con un ADR.
- Test: determinista, legal, y los pesos suman 1 por especie.

### 2. El bot los usa (`OpponentModel`)

- `BotOptions.setPriors?: Record<SpeciesId, { set: PokemonSet; weight: number }[]>`, datos planos que el bot no lee de disco.
- Con priors: candidatos = los del meta filtrados por lo revelado (mismo orden de filtros), en **orden de probabilidad**, y si ninguno encaja, los estándar como hoy. Sin priors, todo idéntico (huellas de `arena:perf`).
- La deducción del nivel 3 empieza con **esos pesos** en lugar de uniformes.
- Decide midiendo si se mantiene «prepararse para lo peor» (el más ofensivo primero) o se pasa a «lo más probable primero».
- Quién los pasa:
  - **Servidor**: al crear el bot de un combate, con la instantánea activa (si no hay, sin priors).
  - **Arena**: `--set-priors meta` para un bot; `--teams meta` para jugar con equipos del meta.
  - **Banco**: igual que el servidor.
- «Lo que cree de tu equipo» (la explicación) sigue saliendo de los candidatos: ahora con los sets del meta.

### 3. Prueba barata (replays, sin tocar el bot)

- En los replays de `datasets/ladder/` (rating ≥ 1500): al final de cada combate, lo revelado de cada Pokémon (objeto, habilidad, movimientos).
- ¿Cuánto acierta el candidato más probable de cada modelo, los sets estándar frente a los del meta? Acierto de objeto y de habilidad, y movimientos revelados que están en el set.
- Los sets del meta salen de Smogon y no de estos replays, así que no hay fuga. Aun así, usa replays de fechas posteriores al mes de las estadísticas si los hay.
- Si el meta no acierta claramente más, para y decídelo con el usuario.

### 4. Medir (nivel 3 contra nivel 3, dos tandas)

- Variante: nivel 3 con priors del meta contra el nivel 3 de hoy, en espejo:
  - con **equipos del meta** (`--teams meta`), que es donde debe ganar;
  - con **aleatorios** (sets estándar), donde no debe perder.
- Si gana, también en el banco con el meta y en la web.

## Tests

- Sets del meta: deterministas, legales y con pesos que suman 1, desde las estadísticas recortadas de `packages/metagame/test/fixtures/`.
- `OpponentModel` con priors: orden por probabilidad, filtros por lo revelado, vuelta a los estándar si nada encaja; sin priors, igual que antes (test e huellas).
- La deducción empieza con los pesos del meta (`beliefs.test`).
- Invariancia del sandbox y explicaciones sin cambiar decisiones, en verde (`expert.test.ts`, `explain.test.ts`).
- Servidor: con una instantánea en la carpeta temporal, el bot del combate recibe sus priors; sin instantánea, ninguno.

## Criterios de «hecho»

- Prueba barata con cifras en el ADR-0024 (y, si no sale, la decisión con el usuario).
- Si sigue: nivel 3 con priors contra nivel 3 de hoy, dos tandas con equipos del meta y una con aleatorios. Cifras en el CHANGELOG y la decisión de activarlo, con el usuario. Nivel 3 ≤ ~1 s de media por decisión.
- `npm run check` y `npm run e2e` en verde; CI en verde. Docs y brief de la fase 23.

## Fuera de alcance

- Aprender el estilo de un jugador concreto o su historial.
- Los compañeros del meta para predecir qué Pokémon trae el rival en la vista previa: posible fase siguiente, con la misma prueba de techo antes (`arena --fixed-group` y una variante que elija el grupo al azar).
- Elegir 4 de 6 (mide antes cuánto vale con la misma técnica que la salida en la fase 21).
- El fallo de Plegaria Vital (tarea aparte).
