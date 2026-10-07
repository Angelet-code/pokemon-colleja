# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Sin publicar]

### Fase 7 — Rivales guardados (2026-10-08)

#### Añadido

- **Rivales** en la web (`/rivales`, enlace "Rivales" en la cabecera): equipos para el bot con su **dificultad**.
  - **Nuevo rival**: generar uno aleatorio (individuales o dobles), copiar uno de tus equipos, importar texto de Showdown (con nombre, modo y dificultad) o desde cero. El aleatorio y la copia se abren como **borrador sin guardar**.
  - **Editor**: el del teambuilder, con el selector de dificultad en la cabecera y "Usar como rival".
  - **Lista** con iconos, modo, dificultad, fecha y estado, y las acciones usar como rival, editar, duplicar y borrar (con confirmación).
- **Inicio**: el "Equipo rival" puede ser **aleatorio, guardado o pegado**. Al elegir un rival guardado se aplica su dificultad, que se puede cambiar (el inicio recuerda la guardada). `battle:start` acepta `opponent: { kind: 'saved', opponentId }`.
- **Persistencia** (`apps/server`): `OpponentRepository`/`FileOpponentRepository`, un JSON legible por rival en `storage/opponents/<id>.json` (con su export de Showdown). CRUD en `GET/POST /api/opponents`, `POST /api/opponents/import` y `GET/PUT/DELETE /api/opponents/:id`, con los `problems` en cada respuesta. Carpeta configurable con `buildServer({ opponentsDir })`.
- **Decisiones de producto**: los rivales son una **colección aparte**; **solo se guarda la dificultad** (las opciones de práctica son de cada combate); en el inicio **se aplica la dificultad del rival y se puede cambiar**; un rival generado **hay que guardarlo** para combatir contra él.
- `@colleja/protocol`: `OpponentContentSchema` (`TeamContentSchema` + `botLevel`), `SavedOpponentSchema`, `SavedIdSchema`, los cuerpos y respuestas de `/api/opponents` y `OpponentSummary`.
- Web: `EditorDestination` (el editor guarda en equipos o en rivales), `BotLevelSelect`, `useMeta()` y la lista compartida (`SavedListLayout`, `SavedCard`, `ImportSavedDialog`).
- Tests (247 en total): repositorio de rivales, CRUD por HTTP (400, 404, problemas, importar, persistencia tras reiniciar), combate contra un rival guardado en los dos modos (el bot lleva exactamente ese equipo y ese nivel) y errores si no existe o es ilegal; esquemas; store del editor con los dos destinos, "Generar aleatorio", lista de rivales, "Usar como rival" e inicio con rival guardado.
- Documentación: [guía de rivales](docs/guias/rivales.md), [ADR-0007](docs/adr/0007-rivales-guardados.md) y el brief de la fase 8.

#### Cambiado

- **Repositorio genérico** `FileJsonRepository` (`apps/server/src/storage/json-repository.ts`): `FileTeamRepository` y `FileOpponentRepository` son subclases. El formato de los ficheros de equipos no cambia.
- El editor (`TeamEditorPage`, `team-editor-store.ts`) recibe un destino; el store guarda `savedId` en lugar de `teamId`.
- `SavedTeamPicker` sirve para tu equipo y para el rival. `TeamIdSchema` es ahora un alias de `SavedIdSchema` (mensaje "Id no válido.").
- `testServer()` de los tests del servidor recibe `{ teamsDir, opponentsDir }`.

### Fase 6 — Teambuilder y equipos guardados (2026-10-08)

#### Añadido

- **Teambuilder** en la web (`/equipos`, enlace "Equipos" en la cabecera):
  - **Lista** de equipos con iconos, modo, fecha y estado (legal o con N problemas), y acciones nuevo, importar, editar, duplicar, borrar (con confirmación) y **usar en combate**.
  - **Editor** con los Pokémon a la izquierda y la ficha a la derecha (una cosa cada vez en móvil): buscador de especies (español, inglés o número), mote, género, shiny, habilidad con descripción, objeto (megapiedras solo para su especie y aviso de Item Clause), naturaleza, **Stat Points con stats en vivo** (y los de la Mega con su piedra), 4 buscadores de movimientos **filtrados por learnset** con tipo, categoría, potencia, precisión y PP, y **set sugerido** desde los sets estándar.
  - **Problemas en vivo junto al campo** que los causa, con contador por Pokémon. Al guardar se añaden los del validador de Showdown.
  - **Importar y exportar** en formato de Showdown, el equipo entero o un Pokémon. El texto que no cabe (más de 6, más de 4 movimientos, Stat Points de más, motes largos) se ajusta y se avisa de cada cambio.
  - Guardado explícito con aviso al salir con cambios sin guardar.
- **Inicio**: "Tu equipo" puede ser **guardado** o **pegado**. `battle:start` acepta `teamId` en lugar del texto.
- **Persistencia** (`apps/server`): `TeamRepository` y `FileTeamRepository`, un JSON legible por equipo en `storage/teams/<id>.json` (con su export de Showdown), escritura atómica e ids seguros como nombre de fichero. CRUD en `GET/POST /api/teams`, `POST /api/teams/import` y `GET/PUT/DELETE /api/teams/:id`; cada respuesta lleva los `problems` del equipo. Carpeta configurable con `buildServer({ teamsDir })`.
- **Decisiones de producto**: un equipo con problemas **se guarda como borrador** (solo se exige legalidad para combatir); el modo del equipo es el **preferido** y vale para los dos si es legal; editor con lista a la izquierda y ficha a la derecha; botón de set sugerido.
- `@colleja/core`: `checkTeamIssues`/`checkSetIssues` (cada problema con su miembro, campo y tipo) y `fitTeamToLimits` (ajusta texto importado a los límites del editor).
- `@colleja/protocol`: `PokemonSetSchema`, `TeamSchema`, `TeamContentSchema`, `TeamIdSchema` y los cuerpos y respuestas de `/api/teams`.
- Web: componentes `Combobox` (buscador accesible, sin acentos, en los dos idiomas), `Dialog` y `TypeBadge`.
- Tests (231 en total): repositorio en carpeta temporal, CRUD por HTTP (400, 404, problemas, importar, persistencia tras reiniciar), `battle:start` con `teamId` en los dos modos, esquemas, problemas por campo, `fitTeamToLimits`, `team-draft` y componentes (editor de Stat Points, buscador de movimientos, import/export y la lista).
- Documentación: [guía del teambuilder](docs/guias/teambuilder.md), [ADR-0006](docs/adr/0006-equipos-guardados-y-teambuilder.md) y el brief de la fase 7.

#### Cambiado

- `checkTeam` marca a **cada** miembro que repite objeto (Item Clause) en los problemas por campo y no repite el mismo mensaje.
- Las rutas de equipos del servidor pasan a `routes/teams.ts`, y la validación de equipos a `teams/team-problems.ts` (`teamProblems`).
- El bundle de la web pasa de ≈1,2 MB a ≈1,5 MB (≈336 KB con gzip).

### Fase 5 — Servidor y UI de combate: MVP en el navegador (2026-10-08)

#### Añadido

- **`npm run dev`**: servidor + web en http://127.0.0.1:5173. **`npm start`** compila la web y la sirve desde el servidor (http://127.0.0.1:3001). `npm run build` solo compila. El lanzador está en `tools/dev`.
- `apps/web` (React 19, Vite 8, Tailwind 4, Zustand, React Router):
  - **Inicio**: modo, tu equipo pegado en formato Showdown con comprobación en vivo (o uno aleatorio), rival aleatorio o pegado, dificultad (niveles del bot), vista previa, equipo abierto, nombre y semilla. Recuerda el último equipo y las opciones.
  - **Combate** al estilo Showdown:
    - Campo con sprites, PS (exactos los tuyos y en % los del rival), estado, cambios de características, Mega, y objeto y habilidad revelados.
    - Clima, terreno, Espacio Raro y condiciones de cada lado.
    - Equipos en iconos y vista previa (6 → 3/4).
    - Menús desde `getSlotOptions`: movimientos con tipo, PP y categoría, Megaevolucionar, **objetivos en dobles** posición por posición con "Atrás", cambios y cambios forzados.
    - Atajos de teclado (1–4, 5–9, Esc).
    - Log en español y barra con **deshacer**, **rebobinar a un turno**, **rendirse** y **replay**.
    - Pantalla final con revancha.
    - Se reengancha al combate tras una recarga o un corte de conexión.
  - **Decisiones de producto**: estilo Showdown, tema oscuro por defecto con opción clara, animaciones mínimas (barras de PS) y **selector ES/EN de nombres** (la interfaz y el log siguen en español).
- `apps/server` (Fastify 5 + `@fastify/websocket`):
  - REST: `GET /api/meta`, `POST /api/teams/validate`, `POST /api/teams/random`.
  - WebSocket `/ws` con un combate por conexión (`BattleManager`/`BattleRoom`), el bot en p2 y limpieza de combates abandonados.
  - **Solo envía la perspectiva p1**. El replay, que lleva el log omnisciente, solo se entrega al terminar.
  - Escucha en `127.0.0.1` (`SERVER_PORT`/`SERVER_HOST`) y sirve `/sprites/*`.
- `packages/protocol` (`@colleja/protocol`): esquemas zod de todos los mensajes (`battle:start/choose/undo/rewind/forfeit/export/resume` → `battle:started/update/snapshot/replay/error`) y de las peticiones REST, con errores en español.
- `packages/narration` (`@colleja/narration`, apto para navegador): **log con las plantillas de Showdown**.
  - Port tipado de `BattleTextParser` del cliente de Showdown (MIT), con la gramática española (artículos, género, "del/al", forma "classified" de los objetos) y el nombre de la forma Mega.
  - El idioma de los nombres se elige aparte.
  - Incluye el narrador y los nombres que antes vivían en el CLI. **El CLI narra ahora igual que la web.**
- Datos: el pipeline exporta las plantillas de mensajes de combate a `packages/data/generated/text/{es,en}.json` (solo efectos de Champions, ≈70 KB) con `getBattleText`. Las 27 plantillas que faltaban en español se completan en `packages/data/overrides/battle-text.es.json`.
- `engine`:
  - `decideFor(session, side, agent)`: una decisión de un agente, con reintentos tras `[Unavailable choice]`. La usan `playOut`, el CLI y el servidor.
  - `BattleSession.forfeit(side)`.
- Tests (197 en total):
  - Protocolo (ida y vuelta y mensajes mal formados).
  - Narración: español con gramática, inglés, nombres en otro idioma y combates completos sin marcadores sin resolver.
  - Servidor: REST, un combate completo por WebSocket en cada modo contra el nivel 2, **información oculta**, equipos ilegales, elección rechazada, deshacer, rebobinar, reconexión, rendirse y replay.
  - Web: borrador de elección, menús de dobles con Testing Library y happy-dom, vista previa, store y regla de dependencias.
  - `decideFor` y `forfeit`.
- Documentación: [guía de la web](docs/guias/web.md), [ADR-0005](docs/adr/0005-servidor-web-y-narracion.md) y el brief de la fase 6.

#### Cambiado

- La web reconstruye el estado con `BattleView` de `core` en lugar de `@pkmn/client`. El spike de este mostró que sus datos de movimientos son los de Escarlata/Púrpura: 434 de 511 difieren de Champions ([ADR-0005](docs/adr/0005-servidor-web-y-narracion.md)).
- Biome entiende las directivas de Tailwind en el CSS. Vitest incluye tests `.tsx`.

#### Corregido

- `parseCondition` (core) devolvía `NaN` cuando el PS del rival estaba justo al 20 % o al 50 %, porque Champions añade el color de la barra (`50/100y`). Afectaba al estado del campo y a los bots.

### Fase 4 — Bot (niveles 1 y 2), generador de equipos y arena (2026-10-07)

#### Añadido

- `packages/teamgen` (`@colleja/teamgen`, apto para navegador): `generateTeam(modo, { seed })`, equipos aleatorios legales a partir de los sets estándar, deterministas por semilla. Cláusulas de especie y objeto, **como mucho una megapiedra** (decisión de producto) y como mucho 3 miembros débiles al mismo tipo.
- `@colleja/bot`:
  - **Nivel 1, agresivo** (`AggressiveAgent`): el máximo daño esperado por posición, prioridad que asegura KOs, nunca golpea al aliado salvo que sea inmune, Mega en cuanto puede.
  - **Nivel 2, táctico** (`TacticalAgent`): valora cada opción **simulando sus consecuencias** con daño esperado. Duelos en individuales (KO races, cambios que reciben el golpe, sacrificar o salvar, mejoras, estados, recuperación, Protección, Sorpresa) y turnos 2 contra 2 en dobles (concentrar ataques, Protección, Sorpresa, Refuerzo, Señuelo, Viento Afín, Espacio Raro, pantallas, ataques en área). Vista previa por cobertura. Ver [ADR-0004](docs/adr/0004-bot-por-simulacion.md).
  - Análisis compartido: estimador de daño con **`@smogon/calc` 0.12.0** (Champions = generación 0), modelo del rival (sets estándar filtrados por lo revelado, del más ofensivo al menos; el set real con equipo abierto), `createBot` y `BOT_LEVELS` (nombres y descripciones en español).
  - Los bots **no conocen los sets del rival** con equipo cerrado (decisión de producto).
- `tools/arena`: `npm run arena -- --a 2 --b 0 --battles 500` (`--mode singles|doubles|both`, `--seed`, `--no-preview`, `--open-team-sheets`). % de victorias con intervalo de confianza, turnos, tiempos, elecciones inválidas y replays de los combates que fallen en `storage/arena/`.
- `npm run play`: `--bot 0|1|2` (por defecto **2**, decisión de producto) y `--opponent-team random` por defecto.
- `BattleView` (core) sigue además el turno de entrada y el último movimiento de cada Pokémon, y los objetos y habilidades revelados por etiquetas `[from] item:` / `[from] ability:`.
- Tests (130 en total): contraste de la calculadora con el motor (stats en todos los sets estándar y daño real en primeros golpes), modelo del rival, escenarios guionizados de los niveles, fuzz de los niveles 1 y 2 (100 combates por modo) y del 0 (ya con `teamgen`), equipos legales en 300 semillas por modo, arena (recuento, reproducibilidad y una prueba corta de fuerza) y CLI con `--bot`.
- Documentación: `docs/guias/bot.md`, ADR-0004 y el brief de la fase 5 (`docs/fases/fase-5.md`).

#### Resultados del arena (500 combates por modo, semilla `arena`, sin elecciones inválidas)

| A contra B | Individuales | Dobles |
|---|---|---|
| Nivel 2 contra 0 | **93,6 %** (IC 95 %: 91,1–95,4) | **91,8 %** (89,1–93,9) |
| Nivel 1 contra 0 | 93,8 % (91,3–95,6) | 94,0 % (91,6–95,8) |
| Nivel 2 contra 1 | 61,2 % (56,9–65,4) | 67,2 % (63,0–71,2) |

Tiempo por decisión: ≈1,3 ms el nivel 1 y ≈3 ms el nivel 2. Un combate entre bots dura ≈20–50 ms.

#### Cambiado

- El fuzz del nivel 0 usa `teamgen` en lugar de su generador mínimo.

### Fase 3 — Dominio, motor y primer combate jugable (2026-10-07)

#### Añadido

- `packages/core` (`@colleja/core`): dominio puro, apto para navegador.
  - Tipos `PokemonSet`, `Team`, `RulesetId`, `BattleOptions` y `SideId`.
  - Stats de Champions como estrategia por reglamento (`championsStats`, `getStatCalculator`), también para la Mega Evolución.
  - Stat Points: límites leídos del formato, puntos restantes, `setStatPoint` (con recorte) y problemas en español.
  - Import/export en formato Showdown (`parseShowdownTeam`, `formatShowdownTeam`) con problemas en español.
  - Comprobación rápida de equipos para la UI (`checkTeam`): tamaño, cláusulas de especie y objeto, learnsets, habilidades y Stat Points.
  - Peticiones del motor tipadas, elecciones tipadas (`Choice`) con su serializador y parser, `getSlotOptions` (movimientos, objetivos en dobles, cambios, Mega) y `validateChoice`.
  - `BattleView`: estado del combate reconstruido desde el protocolo de una perspectiva.
  - `BattleAgent`/`AgentContext` (interfaz de los jugadores) y `SeededRandom`.
- `packages/engine` (`@colleja/engine`, solo Node):
  - `validateTeam` con el `TeamValidator` de Showdown, conversión de sets y `resolveFormat` (modo + opciones → formatid con reglas `@@@`).
  - `BattleSession` síncrona sobre `Battle`: eventos por perspectiva, pre-comprobación de elecciones, `rewindTo`/`undo`, `exportReplay`/`fromReplay` y opciones de práctica (sin vista previa, equipo abierto).
  - `playOut` para enfrentar dos agentes.
- `packages/bot` (`@colleja/bot`): `RandomAgent`, bot de nivel 0 (port tipado de `RandomPlayerAI`).
- `tools/cli`: `npm run play`, combate en la terminal contra el bot en individuales y dobles, con menús numerados, narración en español, `deshacer`, `rebobinar N`, `exportar` (a `storage/replays/`) y `salir`, también al terminar el combate.
- Tests (101 en total):
  - Stats de core = stats del motor en los ≈950 sets estándar.
  - Determinismo, replays y rebobinado en ambos modos.
  - Fuzz del bot: 200 combates sin elecciones inválidas en `npm run check` (2000 comprobados a mano).
  - CLI `--auto` en ambos modos y una partida humana guionizada.
- Documentación: `docs/guias/combate.md`, ADR-0003 y el brief de la fase 4 (`docs/fases/fase-4.md`).

### Preparación del traspaso (2026-10-07)

#### Añadido

- `docs/fases/fase-3.md`: brief de traspaso de la fase 3 (objetivo, diseño recomendado, tests, criterios de "hecho") con hechos del motor **verificados**:
  - El motor sigue pidiendo elegir equipo aunque se quite la regla Team Preview.
  - Sintaxis de las reglas `@@@`.
  - Formato de `inputLog` para rebobinar.
  - `toJSON`/`fromJSON`.
- `AGENTS.md` reorganizado como punto de entrada: cómo continuar una fase, protocolo de cierre de fase, preferencias del usuario y puesta en marcha.
- CI en GitHub Actions: `npm run check` en cada push y en cada PR.
- Recomendaciones y ajustes de VS Code (Biome, Vitest).

### Fase 2 — Pipeline de datos (2026-10-07)

#### Añadido

- `packages/data` (`@colleja/data`): datos de Champions Reg M-C generados y versionados, con una API tipada apta para navegador:
  - `getSpecies`, `getLearnset`, `canLearn`, `getStandardSets`, `getName`, `getDescription`, `getTypeEffectiveness`…
  - 269 especies seleccionables (231 nº de Pokédex), 82 Megas y 7 formas de combate.
  - 511 movimientos con los PP de Champions, 215 habilidades, 166 objetos (81 megapiedras) y 25 naturalezas.
  - Tabla de tipos, learnsets y los formatos de individuales (6 → 3) y dobles (6 → 4).
- Sets estándar: ≈490 en individuales y ≈460 en dobles, uno por rol de los *random sets* de Champions. Llevan Stat Points y naturaleza heurísticos, y **todos están validados** con el validador de Champions.
- Español:
  - Nombres oficiales de PokeAPI, con la traducción de Showdown como respaldo y nombres derivados para las Megas de Z-A y las formas regionales.
  - Descripciones del juego, salvo en los 20 efectos que Champions modifica (ahí se usa el texto de Champions en inglés).
- `packages/data/overrides/` para sets propios (formato export de Showdown) y para corregir nombres en español.
- `tools/data-pipeline`:
  - `npm run data:build` (determinista; PokeAPI fijada por commit y descargada desde GitHub).
  - `npm run data:sprites` (renders de Champions, iconos y objetos en `assets/`, no versionado).
- Tests:
  - De los datos (recuentos, cambios de Champions, i18n, coherencia de los sets).
  - Del pipeline (CSV, heurística de Stat Points, nombres).
  - Uno de **consistencia** que regenera los datos desde el motor y detecta si están desactualizados.
- Documentación: `docs/guias/datos.md` y ADR-0002.

### Fase 1 — Cimientos (2026-10-07)

#### Añadido

- Repositorio git y monorepo con npm workspaces (`packages/*`, `apps/*`, `tools/*`).
- Tooling: TypeScript 7 (`strict`, Bundler), Biome 2 (formato y lint), Vitest 5, tsx. Node ≥ 24.
- Pokémon Showdown vendorizado como submódulo git superficial en `vendor/pokemon-showdown`, **fijado a `c046106`** (2026-10-06, Reg M-C).
- `tools/setup`: setup idempotente de Showdown (submódulo + `npm ci --ignore-scripts` + build + tipos). Se ejecuta en `postinstall`.
- `packages/showdown` (`@colleja/showdown`): puente único y tipado hacia el simulador, con los formatos Champions en `CHAMPIONS_FORMATS`.
- `tools/smoke`: combates headless deterministas entre bots aleatorios de Showdown.
  - Dos equipos fixture legales, validados en BSS Reg M-C y en VGC Reg M-C.
  - Combates aleatorios con sets de random battle de Champions.
  - Recuento de Megaevoluciones.
- Tests:
  - Fórmula de Stat Points verificada a través del motor.
  - Límites de SP del validador.
  - Legalidad de los fixtures.
  - Determinismo por semilla.
- `AGENTS.md` / `CLAUDE.md` con comandos, reglas de dependencias y particularidades de Champions.

### Fase 0 — Investigación y plan (2026-10-07)

#### Añadido

- `docs/PLAN.md`: arquitectura, stack, hoja de ruta y decisiones.
- Investigación en `docs/research/`:
  - Pokémon Champions Reg M-C.
  - Mecánicas Gen 9.
  - Stack técnico.
  - Anexos con el roster y los objetos.
- ADR-0001: envolver el simulador de Showdown.
