# Fase 12 — Banco de pruebas de equipos

> **Brief de la fase.** Escrito el 2026-10-08 al cerrar la fase 11, con la decisión del usuario.
> Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md) (sección del arena), la del [teambuilder](../guias/teambuilder.md) y la de [rivales](../guias/rivales.md).

## Objetivo

Ayudar al usuario a **montar su equipo perfecto** con una medida objetiva: el bot juega **tu equipo guardado** contra **tus rivales guardados** durante N combates y da el **% de victorias por rival y por modo**, con su intervalo de confianza. Así «creo que mi equipo es bueno» pasa a ser un número, y el usuario ve contra qué rival flojea su equipo. También puede comparar dos versiones del equipo.

## Decisión del usuario (2026-10-08)

- Fase elegida después de la 11: el banco de pruebas es lo primero para ayudarle a crear su equipo. Las demás ideas (tabla de tipos, tabla de velocidades, tabla de daños, optimizador de Stat Points) quedan como ampliaciones posibles para después.
- **Por preguntar al empezar** (con opción recomendada):
  1. **Dónde**: en la web, con una pantalla nueva y progreso en vivo (recomendado), o solo como comando (`npm run bench`).
  2. **Quién juega cada lado**: el mismo nivel en los dos (recomendado: el 3, para que la diferencia sea el equipo) o cada rival con su `botLevel` guardado.
  3. **Cuántos combates por rival** por defecto (recomendado 20, ≈ ±20 puntos; con 100, ±10) y si se ofrece «más precisión».
  4. Si los **resultados se guardan** (historial por equipo para comparar versiones) o solo se ven en el momento.

## Punto de partida

- `tools/arena` (`arena.ts`) juega bot contra bot con **equipos aleatorios** de `teamgen`. Cada pareja de equipos se juega dos veces, intercambiando equipos, para **anular** la ventaja del equipo: justo lo contrario de lo que quiere el banco.
- `playOut` (engine) lleva un combate entre dos agentes hasta el final y reintenta tras `[Unavailable choice]`. `BattleSession.create` valida los equipos.
- Equipos y rivales guardados: `TeamRepository` y `OpponentRepository` (`apps/server`, `storage/teams` y `storage/opponents`). Un rival es un equipo más `botLevel`. La legalidad (`problems`) va en cada respuesta y solo se exige para combatir.
- Tiempo del nivel 3: ≈ 0,4 s por decisión en individuales y 0,55 s en dobles, ≈ 4–9 s por combate entre dos niveles 3 (el doble de decisiones que contra el 2).

## Hechos verificados

- **Nadie puede depender de `tools/*`** (regla de capas): el servidor no puede importar `tools/arena`. El bucle de un combate bot contra bot (crear agentes, sesión, contar elecciones inválidas, `playOut`) tiene que vivir en un paquete. Lo natural es `engine`, que ya tiene `playOut`, con el arena y el banco como consumidores.
- **No hay `worker_threads` en el proyecto.** El nivel 3 piensa de forma **síncrona**: cientos de combates en el hilo del servidor lo bloquearían (ni WebSocket ni API). El banco necesita **hilos de trabajo** (`node:worker_threads`, `os.availableParallelism()`). Para medir, en la fase 11 se lanzaron 8–16 procesos del arena en paralelo con semillas distintas.
- El nivel 3 tiene esfuerzo fijo (`SEARCH_SETTINGS`): con la misma semilla los resultados son **reproducibles**, aunque se repartan entre hilos, si la semilla de cada combate sale de `semilla:rival:modo:índice`.
- La vista previa la elige el bot (`team-selection.ts`, la del nivel 2): el banco mide el equipo de 6 **con la elección del bot**, no la del usuario.
- Ruido: con n combates, el IC 95 % de un % cercano al 50 % mide ≈ ±98/√n puntos (`wilsonInterval` del arena).

## Diseño recomendado

### 1. Combate entre bots en `engine` (`engine/src/bot-battle.ts`)

- `playBotBattle({ mode, seed, options, p1: { team, agent }, p2: { team, agent } })` → `{ winner, turns, invalidChoices, unavailableChoices, ms, decisionMs }`. Es lo que hoy hace `playArenaBattle` sin generar equipos. `tools/arena` pasa a usarlo, y sus tests y cifras no deben cambiar.
- `engine` no puede depender de `bot` (la capa es al revés): los agentes se pasan ya creados, así que solo dependen de la interfaz `BattleAgent` de `core`.

### 2. Banco (`packages/bench` o `apps/server/src/bench/`)

- Para cada rival y cada modo legal del equipo, juega N combates **sin intercambiar equipos** y alternando el lado (p1/p2) para anular la ventaja de lado.
- Por rival y modo da victorias, derrotas, empates, % con IC de Wilson, turnos medios y errores. También el total ponderado.
- Pool de **hilos de trabajo** (tantos como `availableParallelism() − 1`) que juegan combates sueltos. El hilo principal reparte el trabajo, junta los resultados y avisa del progreso. Se puede **cancelar**.
- Determinista con la semilla, como el arena.

### 3. Servidor y protocolo

- `POST /api/bench` con `{ teamId, opponentIds, modes, battles, botLevel, seed? }` → `{ benchId }`. El progreso y el resultado llegan por **WebSocket** (`bench:progress`, `bench:result`), definidos primero en `@colleja/protocol` con su test de ida y vuelta. `DELETE /api/bench/:id` lo cancela.
- Un equipo o rival ilegal en un modo se informa y se salta: no aborta el banco.
- Si se decide guardar resultados: colección `storage/bench/` con su `JsonFileFormat` y su repositorio (como los replays), sin escribir ficheros a mano.

### 4. Web

- Pantalla «Banco» (o una pestaña del equipo en el teambuilder): eliges equipo, rivales (todos por defecto), modo y combates. Ves una tabla por rival con una barra de % y su IC, que se llena en vivo, y un total.
- Diseño del sistema actual ([ADR-0009](../adr/0009-sistema-de-diseno.md)): tokens, `ui.tsx`, sin textos de relleno, contraste AA. El rival en `rival` y lo tuyo en `accent`.
- Desde un rival flojo, un botón para **jugar contra él** (combate normal con ese rival).

### 5. CLI

- `npm run bench -- --team <fichero|id> --opponents <ids|all> --mode singles|doubles|both --battles N --level 3 --seed X`, útil para pruebas y para la CI (con el nivel 0 o el 1, rápidos).

## Tests

- `playBotBattle`: mismo resultado que el arena antes del cambio (las cifras de referencia de `tools/arena/test` no cambian).
- Banco: reparto por rival y modo, lados alternos, total, rivales ilegales saltados, determinismo con la misma semilla aunque cambie el número de hilos, cancelación.
- Servidor: `POST /api/bench` con equipo inexistente (404) o vacío (400). El progreso llega en orden, y el resultado es igual al del banco directo. Siempre con el nivel 0 y carpetas temporales (`testServer()`).
- Protocolo: ida y vuelta de los mensajes nuevos.
- Web: la tabla se llena con el progreso. E2E corto con el nivel 0 (un rival, 2 combates).

## Criterios de «hecho»

- Las decisiones abiertas del usuario resueltas e implementadas.
- Un banco de 5 rivales × 20 combates con el nivel 3 tarda **≤ ~2 min** en el equipo del usuario (16 hilos) y el servidor sigue atendiendo mientras tanto.
- `npm run check` y `npm run e2e` en verde; CI en verde.
- Docs: ADR-0013 (hilos de trabajo y combate entre bots en `engine`), guía nueva `docs/guias/banco.md`, CHANGELOG, AGENTS, PLAN, README y el brief de la fase 13.

## Fuera de alcance (ampliaciones posibles para después)

- **Tabla de tipos** en el teambuilder: debilidades compartidas y huecos de cobertura.
- **Tabla de velocidades**: a quién superas y con cuántos Stat Points.
- **Optimizador de Stat Points**: lo mínimo para aguantar un golpe o superar a alguien en velocidad, y el resto al ataque.
- **Tabla de daños**: cada uno de tus Pokémon contra las amenazas de tus rivales (sobre `/api/calc`).
- Que el banco elija la vista previa como el usuario, o que pruebe variantes del equipo él solo.
