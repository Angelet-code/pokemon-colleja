# Fase 5 — Servidor y UI de combate (MVP en el navegador)

> **Brief de traspaso.** Escrito al cerrar la fase 4 (2026-10-07) y completado ese mismo día con un spike de `@pkmn/client` y de las plantillas de texto de Showdown. Permite empezar en una sesión nueva sin contexto previo.
> Lee antes [AGENTS.md](../../AGENTS.md) (reglas y comandos), [PLAN.md](../PLAN.md) §3.3–3.7 (dependencias, flujo, protocolo y persistencia) y §7 (pantallas), y las guías de [combates](../guias/combate.md) y de [bots](../guias/bot.md), que explican la API que ya existe.
> Las decisiones de diseño son **recomendaciones**. Si al implementar encuentras algo mejor, adelante, pero documéntalo en un ADR.

## Objetivo

Jugar un combate completo **en el navegador**, en individuales y en dobles, contra el bot. Con esta fase se cierra el MVP (PLAN §8: fases 1–5).

1. **`packages/protocol`** (`@colleja/protocol`): esquemas zod de los mensajes REST y WebSocket, compartidos por el cliente y el servidor.
2. **`packages/narration`** (`@colleja/narration`): narración del combate en español, apta para navegador. La comparten el CLI y la web.
3. **`apps/server`**: Fastify + `@fastify/websocket`. Sesiones de combate en memoria sobre `BattleSession`, el bot en p2, la validación de equipos y la API mínima.
4. **`apps/web`**: React 19 + Vite + Tailwind + Zustand + React Router.
   - Inicio: modo, equipo pegado, rival, dificultad y opciones.
   - Combate: vista previa, campo, menús de acción, log, rebobinar y exportar. Primero individuales y después dobles.
5. `npm run dev` levanta el servidor y la web a la vez.

## Punto de partida (ya hecho)

| Pieza | Qué ofrece |
|---|---|
| `@colleja/engine` (solo Node) | `BattleSession.create(config)`: **síncrona** y **valida** los equipos (si no son legales, lanza `TeamValidationError` con los problemas). `on(listener)`: eventos `protocol` (con su `perspective`), `request`, `error`, `end` y `rewind`. `choose(side, Choice \| texto)` → `{ ok } \| { ok: false, errors }`. `getLog(perspective)`, `getRequest`, `pendingSides`, `getAgentContext`, `rewindTo`, `undo`/`undoTarget`, `rewindableTurns`, `exportReplay`/`fromReplay`, `dispose()`. `validateTeam(mode, sets)`. `playOut` lleva dentro la lógica de reintento de un agente (`decide`) |
| `@colleja/core` (navegador) | `parseShowdownTeam`/`formatShowdownTeam`, `checkTeam`, `championsStats`, `BattleRequest` tipado. `getSlotOptions(request)`: movimientos con objetivos válidos, cambios y Mega por posición; **es lo que necesitan los menús de la UI**. `validateChoice` (problemas en español), constructores de `Choice` y `formatChoice`, `BattleView.from(log)` |
| `@colleja/bot` | `createBot(level, { seed })`, `BOT_LEVELS` (nombre y descripción en español), `DEFAULT_BOT_LEVEL = 2`, `isBotLevel`, `botLevelInfo` |
| `@colleja/teamgen` | `generateTeam(mode, { seed })`: equipo rival aleatorio y legal |
| `@colleja/data` (navegador) | `getName(kind, id, 'es' \| 'en')`, `getDescription`, `getSpecies`, `getMove`, `getItem`, `getAbility`, `getTypeEffectiveness`, `getFormat(mode)` y `meta`. Todos los JSON juntos ocupan ≈1,3 MB sin comprimir |
| `tools/cli` | El juego completo en terminal: **referencia del flujo**. `app.ts` contiene `agentTurn` (el bot reintenta tras `[Unavailable choice]`) y el manejo de deshacer, rebobinar y exportar. `narrator.ts` (229 líneas) y `names.ts` (`speciesName`, `moveName`, `weatherName`, `boostName`…) se pueden reutilizar, pero viven en una tool |
| `assets/sprites/` | Lo crea `npm run data:sprites` (no versionado): `pokemon/<id>.png` (358 renders de 128 px), `icons/<id>.png` (faltan 93) e `items/<id>.png` (faltan 40). `manifest.json` lista los respaldos y lo que falta. Donde falte el icono, se usa el render reducido; donde falte el sprite del objeto, solo el nombre |

## Hechos verificados (no los redescubras)

### `@pkmn/client` y `@pkmn/dex` (el riesgo de PLAN §11): **descartados**

Spike del 2026-10-07 con `@pkmn/client`, `@pkmn/protocol` y `@pkmn/view` **0.7.3** (mayo de 2026) y `@pkmn/dex`/`@pkmn/data` **0.10.11** (junio de 2026). Se probaron contra 80 combates generados con nuestro motor (40 por modo, con Megas forzadas, 15.592 líneas de la perspectiva de p1):

- `@pkmn/dex` **sí conoce** las Megas de M-C (Meganium-Mega, Dragonite-Mega, Garchomp-Mega-Z…), pero las marca como `isNonstandard: 'Future'`. Con `new Generations(Dex)` por defecto **quedan filtradas**.
- Con un filtro permisivo, `new Generations(Dex, () => true)`, el `Battle` de `@pkmn/client` procesa los 80 combates **sin errores** y reconoce las 55 Megas o formas que aparecieron. Las 358 especies coinciden con las nuestras en tipos y stats base.
- **Pero los movimientos son los de Escarlata/Púrpura, no los de Champions.** De 511 movimientos, **434 difieren**: casi todo son los PP fijos de Champions, pero **21** cambian de potencia, precisión o tipo (Psyshield Bash 70 → 90, Tropical Kick 70 → 85, Make It Rain con un 95 % de precisión, Snap Trap de tipo Acero, Growth de tipo Planta…).
- `@pkmn/dex` pesa ≈1,8 MB minificado y duplicaría los datos que ya tenemos.
- `LogFormatter` de `@pkmn/view` trae las plantillas **en inglés empaquetadas** (un objeto `Text` interno) y no hay API para cambiarlas.

**Decisión recomendada**: el estado del combate en el cliente sale de **`BattleView` de `core`** (apto para navegador, probado con Champions y usado por los bots), junto con la petición de p1 para los datos propios (PS exactos, PP, stats). Cualquier número que muestre la UI (PP, potencia, precisión, tipo) sale de la petición o de `@colleja/data`. No uses `@pkmn/client` ni `@pkmn/dex`; `@pkmn/protocol` (ligero, sin datos) solo si te ahorra parsear a mano. Escribe un ADR con esta decisión, porque PLAN §3.4 y §4 decían que la UI reconstruía el estado con `@pkmn/client`.

### Textos del log

- Showdown tiene plantillas en español en `vendor/pokemon-showdown/data/text/es/` (`default.ts`, `moves.ts`, `abilities.ts`, `items.ts`), pero **incompletas**: cada hueco aparece como `null, // NEEDS TRANSLATION`. Faltan 82 en `default`, 2.793 en `moves`, 790 en `abilities` y 784 en `items`. Lo que sí está traducido es lo más habitual: salir al campo, usar un movimiento, debilitarse, efectividad… Las plantillas inglesas están en `data/text/*.ts`.
- Marcadores de las plantillas: `{POKEMON}`, `{NICKNAME}`, `{TRAINER:definite:capitalize}`, `{MOVE}`… En español, `opposingPokemon` es `"el {NICKNAME} rival"`.
- Los nombres en español de Pokémon, movimientos, objetos y habilidades ya están en `@colleja/data` (`getName`). Los climas no son movimientos: ver `weatherName` en `tools/cli/src/names.ts`.

### Motor y rendimiento

- El protocolo que llega al cliente es el de Showdown **por perspectiva** (`getLog('p1')`): PS propios exactos y los del rival en `x/100`. Las peticiones llegan aparte, como eventos `request` con el JSON ya parseado (`BattleRequest`).
- La sesión es síncrona. Tras `choose('p1', …)`, el turno se resuelve en el acto si el bot ya había elegido. El servidor puede pedir al bot su elección con `getAgentContext('p2')` (≈3 ms en el nivel 2) y reenviar de golpe las líneas nuevas.
- **Rebobinar emite un evento `rewind` y no reemite el protocolo.** El cliente tiene que recibir el log completo de su perspectiva y reconstruir su estado, como hace el CLI con `narrator.reset(log)`.
- Un combate completo entre bots tarda unos 50 ms: para un único jugador local no hacen falta workers.

### Bibliotecas (versiones en npm a 2026-10-07)

`fastify` 5.12.5 · `@fastify/websocket` 11.3.3 (decora la instancia con **`injectWS`** para testear el WebSocket sin abrir puertos) · `@fastify/static` 10.1.5 · `zod` 4.6.5 · `react` 19.3.0 · `vite` 8.3.3 · `@vitejs/plugin-react` 6.1.2 · `tailwindcss` y `@tailwindcss/vite` 4.3.3 · `zustand` 5.0.15 · `react-router` 8.4.0 · `@testing-library/react` 16.3.3 · `happy-dom` 20.14.5 · `@playwright/test` 1.64.0. npm funciona en la red del usuario.

### Del repo

- `vitest.config.ts` solo incluye `{packages,apps,tools}/*/test/**/*.test.ts` con `environment: 'node'`. Para testear componentes `.tsx`, amplía el `include` y usa `// @vitest-environment happy-dom` en esos ficheros (o un `projects` de Vitest para `apps/web`).
- `tsconfig.base.json` fija `"lib": ["ES2023"]` y `"types": ["node"]`. `apps/web` tiene que sobrescribirlos: `"lib": ["ES2023", "DOM", "DOM.Iterable"]`, `"jsx": "react-jsx"` y sin los tipos de Node.
- Los paquetes internos se consumen como fuente TS (`"exports": "./src/index.ts"`). Vite los compila sin build previo, porque npm los enlaza en `node_modules`. Si el pre-bundling da problemas, pon los `@colleja/*` en `optimizeDeps.exclude`.
- **Regla dura**: `apps/web` solo importa paquetes aptos para navegador (`core`, `data`, `protocol`, `narration` y, si hiciera falta, `bot` o `teamgen`). **Nunca `engine` ni `showdown`.** Añade un test que lo compruebe.

## Diseño recomendado

### A. `packages/protocol` (`@colleja/protocol`): apto para navegador, depende de `zod` y de `core` (solo tipos)

- **Cliente → servidor**:
  - `battle:start { mode, team (texto de Showdown), botLevel, opponentTeam?: texto | 'random', options: { teamPreview, openTeamSheets }, seed? }`.
  - `battle:choose { choice }`: la `Choice` de `core`; el esquema zod acepta exactamente esa forma.
  - `battle:undo`, `battle:rewind { turn }`, `battle:forfeit` y `battle:export`.
  - `battle:resume { id }` para reconectar.
- **Servidor → cliente**:
  - `battle:started { id, mode, seed, players, botLevel }`.
  - `battle:protocol { lines }`: **solo de la perspectiva p1**.
  - `battle:request { request }`.
  - `battle:snapshot { log, request, turn, rewindableTurns }`: tras rebobinar, deshacer o reconectar.
  - `battle:error { kind: 'choice' | 'team' | 'internal', message }`, con el mensaje en español.
  - `battle:ended { winner }` y `battle:replay { replay }`.
- **REST**:
  - `GET /api/meta`: versión de datos, commit de Showdown y `BOT_LEVELS`.
  - `POST /api/teams/validate { mode, team }`: problemas en español.
  - `POST /api/teams/random { mode, seed? }`.
  - El CRUD de equipos y rivales es de las fases 6 y 7.
- Una unión discriminada por `type` y los tipos inferidos con `z.infer`.

### B. `packages/narration` (`@colleja/narration`): apto para navegador, depende de `core` y `data`

- **Mueve** `narrator.ts` y `names.ts` del CLI aquí. El CLI pasa a importarlos, y sus tests se mueven con ellos.
- **Amplía la cobertura con las plantillas de Showdown**:
  - El pipeline (`tools/data-pipeline`) exporta `data/text/{default,moves,abilities,items}.ts` en inglés y en español a `packages/data/generated/text/{en,es}.json`.
  - `@colleja/data` las expone con `getBattleText(section, key, locale)`, que devuelve la inglesa si falta la española.
  - Regenera con `npm run data:build` y revisa el diff.
- El narrador trabaja por líneas y con estado (`push(lines)` y `reset(log)`). Devuelve entradas estructuradas (`{ kind: 'turn' | 'action' | 'effect' | 'info', text }`) para que la web pueda darles estilo y el CLI imprimirlas.
- Puedes basarte en la lógica de `LogFormatter` de `@pkmn/view` (MIT, cita la procedencia en un comentario), pero con nuestras plantillas y nuestros nombres.

### C. `apps/server`: Node, depende de `engine`, `core`, `data`, `protocol`, `bot` y `teamgen`

- `buildServer(options)` devuelve la instancia de Fastify sin escuchar, para testearla con `inject`/`injectWS`. `src/main.ts` escucha en **`127.0.0.1`** (uso local, sin autenticación) en el puerto `PORT` (por defecto, 3001).
- **`BattleManager`** con un mapa `id → { session, bot, socket }`:
  - Valida con `BattleSession.create`. Si salta `TeamValidationError`, responde con `battle:error` de tipo `team`.
  - Reenvía al cliente **solo** los eventos `protocol` con `perspective === 'p1'` y los `request` de p1. **Nunca** `omniscient`, `spectator` ni nada de p2: es la regla de información oculta (PLAN §3.1) y un test lo comprueba.
  - Cuando `pendingSides()` incluye `p2`, juega el bot. Extrae de `engine/src/runner.ts` un `decideFor(session, side, agent, { maxRetries })` exportado, que ya hace `playOut` por dentro (reintenta tras `[Unavailable choice]`), y úsalo en el servidor y en el CLI en lugar de `agentTurn`.
  - Elección humana: primero el esquema zod y después `session.choose`. Si se rechaza, responde `battle:error` de tipo `choice` y la sesión sigue esperando.
  - Deshacer y rebobinar: `undo()`/`rewindTo(turn)` y después un `battle:snapshot`.
  - Limpieza: `dispose()` tras N minutos sin socket. Mientras el servidor siga vivo se puede reconectar con `battle:resume`; si se reinicia, el combate se pierde.
- Sirve `assets/sprites/` en `/sprites/*` con `@fastify/static`. Si faltan, responde 404 y la UI usa un respaldo. En producción local (`npm start`) sirve también `apps/web/dist`.

### D. `apps/web`: React 19 + Vite + Tailwind 4 + Zustand + React Router

- **Estructura**:
  - `src/app/`: rutas y layout.
  - `src/features/setup/`: la pantalla de inicio.
  - `src/features/battle/`: la pantalla de combate, sus componentes y el store.
  - `src/lib/`: clientes WS y REST tipados con `@colleja/protocol`.
  - `src/i18n/`: los textos de la UI en español.
- **Inicio**:
  - Modo.
  - Tu equipo en un textarea con el export de Showdown: comprobación en vivo con `checkTeam`, validación definitiva con `/api/teams/validate` y errores en español junto a cada Pokémon. El último equipo se recuerda en `localStorage`.
  - Rival aleatorio o pegado.
  - Nivel del bot con `BOT_LEVELS` (por defecto `DEFAULT_BOT_LEVEL`).
  - Opciones de práctica: vista previa, equipo abierto y semilla.
- **Combate**:
  - **Vista previa**: elegir 3 o 4 en orden; el primero sale de líder.
  - **Campo**: sprite, nombre, barra de PS (exactos los propios, en % los del rival), estado, Mega y cambios de características.
  - **Panel de campo**: clima, terreno, Espacio Raro, pantallas, Viento Afín y trampas, todo desde `BattleView`.
  - **Menús de acción** a partir de `getSlotOptions(request)`:
    - Movimientos con tipo, PP y categoría.
    - Mega.
    - Cambios.
    - En dobles, el **selector de objetivo** solo con objetivos válidos, eligiendo posición por posición y con opción de volver atrás.
    - Cambios forzados y espera.
    - Antes de enviar, se comprueba con `validateChoice`.
  - **Log** en español con `@colleja/narration`.
  - **Rebobinar a un turno**, deshacer, exportar el replay y rendirse.
  - **Pantalla final**: ganador, semilla y revancha.
- **Store (Zustand)**: `log`, `request`, `view` (`BattleView.from(log)`, memoizado), las entradas del narrador y la fase de la UI. Solo cambia por mensajes del servidor.
- Empieza por **individuales** y después dobles. Atajos de teclado como en Showdown (1–4 para movimientos, 5–9 para cambios).

### E. Scripts

- `npm run dev`: servidor (`tsx watch`) y Vite a la vez, con proxy de `/api`, `/ws` y `/sprites` hacia el servidor.
- `npm run build`: compila la web.
- `npm start`: el servidor sirviendo la web compilada.
- `npm run check` no levanta navegadores. Playwright puede esperar.

## Tests mínimos

| Workspace | Tests |
|---|---|
| protocol | Ida y vuelta de cada mensaje. Rechazo de mensajes mal formados |
| narration | Los tests del narrador del CLI, movidos con él. Casos guionizados en español con fallback al inglés. En un combate completo de cada modo no queda ningún marcador `{...}` sin sustituir ni ningún `undefined` |
| data | `getBattleText` con fallback y recuentos de las plantillas en el snapshot |
| engine | `decideFor` reintenta tras `[Unavailable choice]` |
| server | REST con `inject`. WebSocket con `injectWS`: un combate completo en cada modo (cliente de test que elige con `getSlotOptions`). Equipo inválido → error en español. Elección rechazada → error y el combate sigue. Rebobinar → snapshot coherente. **Información oculta**: el cliente no recibe ninguna línea omnisciente ni de p2 |
| web | Testing Library + happy-dom: menús de acción a partir de peticiones reales (objetivos en dobles, Mega, cambios forzados), vista previa (exactamente 3 o 4) y store (`protocol`, `request`, `snapshot`) |
| dependencias | `apps/web` no importa `@colleja/engine` ni `@colleja/showdown` |

## Criterios de "hecho"

- [ ] `npm run dev` y, en el navegador, un combate completo contra el bot de nivel 2 en **individuales** y en **dobles**, con tu equipo pegado.
- [ ] Vista previa, Mega, objetivos en dobles, cambios forzados, rebobinar y exportar el replay funcionan desde la UI.
- [ ] Log en español (inglés solo donde Showdown no tiene traducción) y sprites de Champions con los respaldos del manifest.
- [ ] El servidor nunca envía información oculta (test).
- [ ] ADR sobre el estado en el cliente y guía `docs/guias/web.md`.
- [ ] `npm run check` y la CI en verde.

## Decisiones de producto (tomadas el 2026-10-07)

- **Pantalla de combate al estilo Showdown**: campo arriba, controles abajo y log a la derecha. En móvil, el log va en una pestaña.
- **Tema oscuro por defecto**, con opción clara. La elección se recuerda.
- **Animaciones mínimas**: transiciones de las barras de PS y un leve resalte de la acción.
- **Selector ES/EN de nombres ya en esta fase.** La interfaz y el log siguen en español.

## Al cerrar la fase

Sigue el **protocolo de cierre de fase** de [AGENTS.md](../../AGENTS.md):

- Docs, CHANGELOG y el brief de la fase 6 en `docs/fases/fase-6.md`.
- Actualiza PLAN §3.4 y §4 (`BattleView` en lugar de `@pkmn/client`) y §11 (el riesgo de `@pkmn/client` queda resuelto).
- Commit y push a `origin/main`.

## Fuera de alcance de esta fase

Teambuilder y persistencia de equipos (fase 6), rivales guardados (fase 7), calculadora y explicación del bot (fase 8), E2E con Playwright, temporizador, bot de nivel 3, PvP y versión estática o móvil.
