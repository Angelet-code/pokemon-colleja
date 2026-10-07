# Fase 5 — Servidor + UI de combate

> **Brief de traspaso.** Escrito al cerrar la fase 4 (2026-10-07) para que una sesión nueva pueda empezar sin contexto previo.
> Lee antes [AGENTS.md](../../AGENTS.md) (reglas y comandos), [PLAN.md](../PLAN.md) §3.4–3.7 (flujo, protocolo, persistencia), §7 (pantallas), y las guías de [combates](../guias/combate.md) y [bots](../guias/bot.md), que explican la API que ya existe.
> Las decisiones de diseño aquí son **recomendaciones**: si al implementar encuentras algo mejor, adelante, pero documenta la decisión en un ADR.

## Objetivo

Jugar un combate completo **en el navegador**, en individuales y en dobles, contra el bot:

1. **`apps/server`**: Fastify + WebSocket. Crea sesiones de combate (`BattleSession`), juega el lado del bot y reenvía protocolo y peticiones al cliente.
2. **`packages/protocol`** (`@colleja/protocol`): esquemas zod de los mensajes cliente ↔ servidor, compartidos.
3. **`apps/web`**: React + Vite. Pantalla de inicio (modo, tu equipo pegado en formato Showdown, nivel del bot, opciones de práctica) y **pantalla de combate**: vista previa, campo con sprites y PS, selección de movimiento/objetivo/Mega/cambio, log en español, rebobinar y exportar.
4. `npm run dev` arranca servidor y web a la vez.

## Punto de partida (ya hecho)

| Pieza | Qué ofrece |
|---|---|
| `@colleja/engine` | `BattleSession.create(config)` **síncrona**: `choose(side, Choice)`, `getLog(perspectiva)`, `getRequest`, `getAgentContext`, `on(listener)` con eventos `protocol` (por perspectiva), `request`, `error`, `end`, `rewind`. `rewindTo`, `undo`, `exportReplay`/`fromReplay`. `validateTeam` |
| `@colleja/core` | `Choice`/`SlotAction`, `getSlotOptions` (movimientos con objetivos válidos, cambios, Mega por posición: **es lo que necesitan los menús de la UI**), `validateChoice` (mensajes en español), `BattleView` (estado del campo desde el log de una perspectiva), `parseShowdownTeam`/`formatShowdownTeam`, `checkTeam` |
| `@colleja/bot` | `createBot(level, { seed })`, `BOT_LEVELS` (nombres y descripciones en español), `DEFAULT_BOT_LEVEL = 2` |
| `@colleja/teamgen` | `generateTeam(mode, { seed })`: equipo rival aleatorio legal |
| `@colleja/data` | Nombres en español (`getName`), descripciones, tipos, formatos, sprites ids |
| `tools/cli` | Juego completo en terminal: **referencia de flujo**. `narrator.ts` (narración en español del protocolo) y `names.ts` son reutilizables, pero viven en una tool |
| `assets/sprites/` | Renders de Champions (358), iconos e ítems. `manifest.json` lista respaldos y faltantes (93 iconos y 40 objetos no existen: usar el render reducido o solo el nombre) |

## Hechos verificados (no los redescubras)

- **Versiones en npm (2026-10-07)**: fastify 5.12.5, @fastify/websocket 11.3.3, @fastify/static 10.1.5, zod 4.6.5, react 19.3.0, vite 8.3.3, @vitejs/plugin-react 6.1.2, zustand 5.0.15, react-router 8.4.0, tailwindcss 4.3.3 (+ @tailwindcss/vite), @playwright/test 1.64.0. npm funciona en la red del usuario.
- **`@pkmn/client`/`@pkmn/view`/`@pkmn/protocol` 0.7.3** (última publicación 2026-05-08) y **`@pkmn/dex` 0.10.11** (2026-06-18): **anteriores a Reg M-C**. Es muy probable que no conozcan las Megas nuevas ni datos de Champions. **No verificado**: compruébalo al empezar (un test que alimente `@pkmn/client` con un log de Champions con una Mega de M-C). Plan B ya disponible y probado: `BattleView` de `core` + `getSlotOptions` + `@colleja/data` para nombres y tipos + el narrador del CLI.
- El protocolo que llega al cliente es el de Showdown **por perspectiva** (`session.getLog('p1')`): PS propios exactos, del rival en `x/100`. Las peticiones (`|request|`) ya vienen separadas en eventos `request` con el JSON parseado (`BattleRequest`).
- La sesión es síncrona: tras `choose('p1', …)` el turno se resuelve en el acto si el bot ya eligió. El servidor puede, tras cada elección humana, pedir al bot su elección con `getAgentContext('p2')` (≈3 ms en el nivel 2) y reenviar el lote de líneas nuevas.
- Rebobinar emite un evento `rewind` y **no** reemite el protocolo: el cliente debe pedir/recibir el log completo de su perspectiva y reconstruir su estado (como hace el CLI con `narrator.reset(log)`).
- El arena mide unos 50 ms por combate completo entre bots: el servidor no necesita workers para un único jugador local.
- Los nombres de los efectos de campo y movimientos se traducen con `getName('moves', id)`; los climas no son movimientos (ver `weatherName` en `tools/cli/src/names.ts`).

## Diseño recomendado

### A. `packages/protocol` (apto para navegador)

- Esquemas zod y tipos inferidos para los mensajes de PLAN §3.6:
  - Cliente → servidor: `battle:start { mode, team (texto Showdown), botLevel, opponentTeam?: texto | 'random', options: { teamPreview, openTeamSheets }, seed? }`, `battle:choose { choice: Choice }`, `battle:rewind { turn }`, `battle:undo`, `battle:forfeit`, `battle:export`.
  - Servidor → cliente: `battle:started { id, mode, seed, players, botLevel }`, `battle:protocol { lines }`, `battle:request { request }`, `battle:snapshot { log, request, turn, rewindableTurns }` (tras rebobinar o reconectar), `battle:error { message, kind: 'choice' | 'team' | 'internal' }`, `battle:ended { winner, replay? }`.
- `Choice` ya está tipada en `core`: el esquema zod debe aceptar exactamente esa forma.

### B. `apps/server` (Node)

- Fastify con `@fastify/websocket`. Una conexión = un combate (para empezar, un solo jugador local).
- `BattleManager`: crea la sesión (`validateTeam` → errores en español al cliente), el bot (`createBot`), escucha eventos y reenvía solo la perspectiva `p1`. Tras cada elección de p1 hace jugar al bot si le toca.
- REST mínimo: `GET /api/meta` (versión de datos, commit de Showdown, `BOT_LEVELS`), `POST /api/teams/validate`, `POST /api/teams/random`. El resto del CRUD (equipos, rivales) es de las fases 6–7.
- Sirve `assets/sprites/` con `@fastify/static` (no se copian al build; se siguen sin versionar).
- Tests: con `fastify.inject` y un cliente WS en proceso, un combate completo bot contra bot a través del protocolo.

### C. `apps/web` (React + Vite)

- Estado del combate: **decidir al principio** entre `@pkmn/client` (si soporta M-C) o `BattleView` propio. Recomendación: `BattleView`, que ya está probado con Champions, ampliándolo con lo que pida la UI (volátiles visibles, turnos de clima…) en `core` y con tests.
- **Mover el narrador y los nombres del CLI a un paquete apto para navegador** (p. ej. `packages/narration`, `@colleja/narration`) para que CLI y web compartan la narración en español. El log de combate de la web se construye con él.
- Pantallas: inicio (modo, equipo pegado con validación en vivo usando `checkTeam`, nivel del bot con `BOT_LEVELS`, rival aleatorio o pegado, opciones de práctica) y combate (vista previa 6 → 3/4, campo, panel de clima/campo/pantallas/trampas, menús de acción a partir de `getSlotOptions`, log, rebobinar a un turno, exportar replay).
- Empieza por **individuales** y después dobles (selector de objetivo con las posiciones de `getSlotOptions`).
- Vite con proxy al servidor en desarrollo. Tailwind para estilos.

### D. Scripts

- `npm run dev`: servidor + Vite. `npm run build` (web) si hace falta. `npm run check` sigue siendo el criterio: añade los tests de `protocol`, `server` y, si es barato, componentes críticos de `web` (Vitest + Testing Library); Playwright puede esperar.

## Tests mínimos

| Workspace | Tests |
|---|---|
| protocol | Ida y vuelta de cada mensaje; rechaza mensajes mal formados |
| server | Un combate completo por WebSocket en ambos modos (cliente de test que elige con `getSlotOptions`), equipo inválido → error en español, rebobinar → snapshot coherente |
| narration | Las pruebas del narrador del CLI, movidas con él |
| web | Menús de acción a partir de peticiones reales (objetivos en dobles, Mega, cambios forzados). Opcional: un E2E con Playwright |

## Criterios de "hecho"

- [ ] `npm run dev` y, en el navegador, un combate completo contra el bot de nivel 2 en **individuales y en dobles**, con tu equipo pegado.
- [ ] Vista previa, Mega, objetivos en dobles, cambios forzados, rebobinar y exportar replay funcionan desde la UI.
- [ ] Log en español y sprites de Champions (con los respaldos del manifest).
- [ ] `npm run check` en verde.

## Decisiones de producto para preguntar al usuario (con recomendación)

- Diseño de la pantalla de combate: estilo Showdown (campo arriba, log a la derecha) o propio. Recomendación: estilo Showdown, conocido y probado.
- ¿Animaciones? Recomendación: ninguna en esta fase (solo transiciones de barras de PS); la prioridad es jugar.
- Selector de idioma ES/EN ya en esta fase o en la 6. Recomendación: preparar los textos para i18n pero mostrar solo español.

## Al cerrar la fase

Sigue el **protocolo de cierre de fase** de [AGENTS.md](../../AGENTS.md): docs, CHANGELOG, el brief de la fase 6 en `docs/fases/fase-6.md`, commit y push.

## Fuera de alcance de esta fase

Teambuilder completo (fase 6), rivales guardados y CRUD de equipos (fase 7), calculadora y explicación del bot (fase 8), bot nivel 3, multijugador, versión móvil.
