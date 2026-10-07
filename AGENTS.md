# Pokemon Colleja Simulator — Guía para agentes

Simulador de combates de **Pokémon Champions** (individuales y dobles) para practicar contra un bot. El plan completo (arquitectura, hoja de ruta por fases y decisiones) está en [docs/PLAN.md](docs/PLAN.md).

## ▶ Cómo continuar

El proyecto avanza **por fases** (PLAN §8). Cuando te pidan *"continúa con la fase N"*:

1. Lee este fichero entero y después el **brief de la fase**: `docs/fases/fase-N.md`. Contiene el objetivo, el diseño recomendado, los hechos ya verificados y los criterios de "hecho".
2. Prepara el entorno (ver "Puesta en marcha") y comprueba que `npm run check` está en verde **antes** de tocar nada.
3. Implementa la fase. Si tomas una decisión de arquitectura distinta a la del brief o el plan, escribe un ADR.
4. Cierra la fase con el **protocolo de cierre** (más abajo).

### Estado

| Fase | Estado |
|---|---|
| 0. Investigación y plan | ✅ ([docs/research/](docs/research/)) |
| 1. Cimientos (monorepo, Showdown vendorizado, smoke) | ✅ |
| 2. Pipeline de datos (`@colleja/data`) | ✅ ([guía](docs/guias/datos.md)) |
| 3. Dominio + motor + CLI jugable | ✅ ([guía](docs/guias/combate.md), [ADR-0003](docs/adr/0003-sesion-de-combate.md)) |
| 4. Bot (niveles 1–2, teamgen, arena) | ✅ ([guía](docs/guias/bot.md), [ADR-0004](docs/adr/0004-bot-por-simulacion.md)) |
| 5. Servidor + UI de combate (MVP) | ✅ ([guía](docs/guias/web.md), [ADR-0005](docs/adr/0005-servidor-web-y-narracion.md)) |
| 6. Teambuilder y equipos guardados | ✅ ([guía](docs/guias/teambuilder.md), [ADR-0006](docs/adr/0006-equipos-guardados-y-teambuilder.md)) |
| 7. Rivales guardados | ✅ ([guía](docs/guias/rivales.md), [ADR-0007](docs/adr/0007-rivales-guardados.md)) |
| **8. Herramientas de práctica** | ⏭️ **Siguiente**: [docs/fases/fase-8.md](docs/fases/fase-8.md) |
| Futuro | Pendiente (PLAN §8) |

### Protocolo de cierre de fase

1. `npm run check` en verde. Si añades algo ejecutable, inclúyelo en el check o en los tests.
2. Documentación:
   - `CHANGELOG.md`: entrada de la fase.
   - `docs/PLAN.md`: marca la fase ✅ en §8, pon al día la estructura (§3.2) y los riesgos si han cambiado.
   - `AGENTS.md`: tabla de estado, comandos nuevos y reglas o particularidades nuevas.
   - `README.md`: línea de estado y comandos de usuario.
   - Guías (`docs/guias/`) y ADRs (`docs/adr/`) si aplica.
3. **Escribe el brief de la siguiente fase** en `docs/fases/fase-(N+1).md`, con el mismo formato que `fase-8.md`: objetivo, punto de partida, hechos verificados, diseño recomendado, tests, criterios de "hecho" y fuera de alcance. Así la siguiente sesión puede empezar sin contexto.
4. Commits con Conventional Commits y **push a `origin/main`** (el usuario trabaja así). La CI de GitHub ejecuta `npm run check` en cada push: compruébala.

## Preferencias del usuario

- Habla con el usuario **en español**. Documentación y UI en español; el código, en inglés.
- Quiere el proyecto **muy ordenado, limpio, escalable y documentado**.
- Las decisiones de producto relevantes (alcance, UX, cambios de plan) se le **preguntan** antes de implementarlas, con una opción recomendada.
- Decisiones ya tomadas (2026-10-07):
  - Envolver el motor de Showdown ([ADR-0001](docs/adr/0001-motor-de-combate.md)).
  - App web local con servidor Node.
  - Solo Stat Points de Champions; el modo clásico IV/EV queda para el futuro.
  - Nombres en español con selector de inglés.
  - Sets estándar "cualesquiera" por ahora: el usuario los editará más adelante.
  - Bot: el rival por defecto es el **nivel más alto** (2); los equipos aleatorios llevan **como mucho una megapiedra**; el bot **no conoce los sets del rival** con equipo cerrado (solo con equipo abierto).
  - Web (2026-10-07): pantalla de combate al estilo Showdown (campo arriba, controles abajo, log a la derecha), tema oscuro por defecto con opción clara, animaciones mínimas, y el selector ES/EN cambia los **nombres** (la interfaz y el log siguen en español).
  - Teambuilder (2026-10-08): un equipo con problemas **se guarda como borrador** (solo se exige legalidad para combatir); el modo del equipo es el **preferido** y vale para los dos si es legal; lista a la izquierda y ficha a la derecha; botón de set sugerido.
  - Rivales (2026-10-08): **colección aparte** con su dificultad (se pueden copiar de tus equipos); **solo se guarda la dificultad**, no las opciones de práctica; en el inicio **se aplica la dificultad del rival y se puede cambiar**; un rival generado **hay que guardarlo** para combatir contra él.

## Puesta en marcha

Requisitos: **Node ≥ 24** y **git**.

```bash
git clone --recurse-submodules https://github.com/Angelet-code/pokemon-colleja.git
cd pokemon-colleja
npm install          # instala dependencias y además compila Showdown (postinstall)
npm run check        # lint + typecheck + tests + smoke: debe salir en verde
npm run data:sprites # opcional: sprites en assets/ (solo hacen falta para la UI)
npm run dev          # servidor + web: http://127.0.0.1:5173
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias y prepara Showdown (postinstall → `npm run setup`) |
| `npm run setup` / `setup:force` | Sincroniza el submódulo, instala sus dependencias y compila `dist/` con tipos (idempotente) |
| `npm run dev` | Servidor (127.0.0.1:3001, con recarga) + web con Vite (http://127.0.0.1:5173) a la vez ([guía](docs/guias/web.md)). Los equipos guardados van a `storage/teams/` ([guía](docs/guias/teambuilder.md)) y los rivales a `storage/opponents/` ([guía](docs/guias/rivales.md)) |
| `npm run build` / `npm start` | Compila la web (`apps/web/dist`) / la compila y la sirve desde el servidor en http://127.0.0.1:3001 |
| `npm run play` | Combate en la terminal contra el bot. Admite `-- --mode doubles --bot 0\|1\|2 --team <fichero> --opponent-team <fichero>\|random --seed X --no-preview --open-team-sheets --auto` ([guía](docs/guias/combate.md)) |
| `npm run arena` | Torneo bot contra bot con equipos aleatorios. Admite `-- --a 2 --b 0 --mode singles\|doubles\|both --battles N --seed X` ([guía](docs/guias/bot.md)) |
| `npm run smoke` | Combates headless de Champions (fixtures + aleatorios). Admite `-- --random N --seed X --verbose` |
| `npm run data:build` | Regenera `packages/data/generated/` desde Showdown + PokeAPI (determinista). Después, revisa el diff |
| `npm run data:sprites` | Descarga los sprites a `assets/sprites/` (no versionado). Admite `-- --shiny` y `-- --force` |
| `npm test` | Vitest (`{packages,apps,tools}/*/test/**/*.test.{ts,tsx}`; los de componentes con `// @vitest-environment happy-dom`). Fuzz del bot más largo: `BOT_FUZZ_BATTLES=1000 npx vitest run packages/bot` |
| `npm run typecheck` | `tsc --noEmit` en cada workspace (TypeScript 7) |
| `npm run lint` / `lint:fix` | Biome (formato + lint) |
| `npm run check` | lint + typecheck + test + smoke. Ejecútalo antes de dar algo por terminado |

## Estructura y reglas de dependencias

```
apps/       → aplicaciones (web, server). Pueden depender de packages/*
packages/   → librerías: showdown (puente al motor), data (datos del juego), core (dominio), engine (sesiones), bot, teamgen, narration (log), protocol (mensajes web ↔ servidor)
tools/      → scripts: setup, smoke, data-pipeline, cli, arena, dev
vendor/pokemon-showdown → submódulo git fijado a un commit (NO editar)
docs/       → PLAN, research/, adr/, guias/, fases/ (briefs de cada fase)
storage/    → datos del usuario (teams/ y opponents/ con los equipos y rivales guardados, replays/): local, no versionado
assets/     → sprites descargados: local, no versionado
```

- **Solo `packages/showdown` toca `vendor/`.** El resto importa `@colleja/showdown`. Esto es una regla dura.
- `@colleja/showdown` es Node-only (usa `createRequire`). Nunca se importa desde `apps/web` ni desde `packages/core`.
- **Capas** (ver PLAN §3.3): `core` → `data`; `bot` → `core`, `data`, `@smogon/calc`; `teamgen` → `core`, `data`; `narration` → `core`, `data`; `protocol` → `core` (tipos), `zod`; `engine` → `core`, `data`, `showdown`; apps y tools → lo que necesiten. Nadie depende de `apps/*` ni de `tools/*`. `engine` y `teamgen` pueden ser dependencias **de desarrollo** de `bot` (sus tests juegan combates).
- **`@colleja/core`, `@colleja/bot`, `@colleja/teamgen`, `@colleja/narration` y `@colleja/protocol` son aptos para navegador**: sin `node:*` ni Showdown. **`apps/web` solo importa paquetes aptos para navegador** (nunca `engine`, `showdown` ni `node:*`; lo comprueba `apps/web/test/dependencies.test.ts`). `@colleja/engine` es solo Node y es el **único paquete de dominio que importa `@colleja/showdown`** (además de `tools/smoke` y `tools/data-pipeline`).
- **`@colleja/data` es apto para navegador**: solo lee los JSON generados. Los datos del juego (roster, movimientos, nombres en español…) **se consultan ahí**, nunca a mano ni de memoria.
- `packages/data/generated/` **no se edita a mano**: se regenera con `npm run data:build`. Las correcciones van en `packages/data/overrides/` (sets propios en formato export, nombres en español y plantillas de mensajes de combate en español que falten en Showdown).
- El pipeline importa `@colleja/data/schema` (tipos y constantes), nunca `@colleja/data`, porque este carga los JSON que el propio pipeline genera.
- Los paquetes internos se consumen como fuente TS (`"exports": "./src/index.ts"`), sin build. Se ejecutan con `tsx` y se testean con Vitest. Un paquete nuevo necesita su `package.json` (`@colleja/<nombre>`, `"type": "module"`, script `typecheck`) y su `tsconfig.json` (extiende `../../tsconfig.base.json`). Después hay que ejecutar `npm install` para enlazarlo.

## Convenciones

- Código, identificadores y comentarios técnicos en **inglés**. Documentación y UI en **español**.
- TypeScript `strict` + `noUncheckedIndexedAccess`. Sin `any`. Imports de tipos con `import type`. Módulos de Node con prefijo `node:`.
- Ficheros en `kebab-case`, tipos en `PascalCase`. Tests en `<workspace>/test/*.test.ts`.
- Cada decisión de arquitectura relevante se documenta en un ADR (`docs/adr/NNNN-titulo.md`). Cada fase o cambio de datos va al [CHANGELOG](CHANGELOG.md).
- Commits con Conventional Commits (`feat(bot): …`, `fix(engine): …`, `chore(showdown): bump to <sha>`).

## Particularidades de Champions (errores típicos)

- **No hay IVs ni EVs, hay Stat Points**: 66 en total y 32 como máximo por stat. Showdown los guarda en el campo `evs` del set. Los IVs están fijos a 31 y el nivel es 50.
  - `PS = Base + SP + 75`
  - El resto: `floor((Base + SP + 20) × naturaleza)`
- **Hay que validar los equipos antes de combatir.** `TeamValidator.get(formatid).validateTeam(sets)` aplica el nivel 50 y la legalidad. `BattleStream` **no valida**: sin validar, un set sin `Level` se jugaría a nivel 100.
- Los learnsets de Champions difieren de los de Escarlata/Púrpura (por ejemplo, Incineroar no aprende Knock Off). La verdad la tienen `@colleja/data` (`canLearn`) o el validador, nunca la memoria.
- Hay 20 efectos con texto propio de Champions (Fiebre Dorada, Sorpresa…). Para esos no se usa el texto de los juegos principales.
- No hay Teracristalización. La Mega Evolución sí existe, una por combate.
- Formatos usados: `gen9championsbssregmc` (individuales: 6 → elegir 3) y `gen9championsvgc2026regmc` (dobles: 6 → elegir 4). Están en `CHAMPIONS_FORMATS`, pero **solo `engine/src/formats.ts` construye formatids** (con sus reglas `@@@`). Más hechos verificados del motor (reglas `@@@`, `inputLog`, elección de equipo, sintaxis de las elecciones) en [docs/fases/fase-3.md](docs/fases/fase-3.md).

## Particularidades del motor de combate

- **Todo combate pasa por `BattleSession.create`**, que valida los equipos. No crees `Battle`/`BattleStream` a mano fuera de `engine` (salvo `tools/smoke`, que prueba Showdown en crudo).
- Las elecciones se mandan como `Choice` tipada (se comprueban con `validateChoice`) o como texto de Showdown. Una rechazada devuelve `{ ok: false }` y la sesión sigue esperando.
- `[Unavailable choice]` **no es un bug**: depende de información oculta (p. ej. una habilidad que atrapa aún no revelada) y Showdown manda una petición nueva. `[Invalid choice]` sí lo es.
- Los bots solo ven su perspectiva (`AgentContext`). Nunca les pases el log omnisciente.
- Los equipos fixture de `tools/smoke/fixtures/` son también el equipo por defecto del jugador en el CLI y los usan los tests de `core` y `engine`: si los cambias, que sigan siendo legales en ambos modos. El rival del CLI usa por defecto un equipo de `teamgen`.
- Los tests de combate usan semillas fijas. Si un cambio altera un log de referencia, comprueba que es intencionado.

## Particularidades del bot

- **Todo bot se crea con `createBot(nivel, { seed })`** (o sus clases). Misma semilla y misma situación → misma decisión: los combates entre bots son reproducibles.
- El nivel 2 decide **simulando** con daño esperado ([ADR-0004](docs/adr/0004-bot-por-simulacion.md)). Para mejorarlo, corrige el modelo (`analysis/duel.ts`, `doubles-sim.ts`), no añadas bonificaciones sueltas, y **mídelo con el arena** contra el nivel anterior (≥ 300 combates por modo; ±5 %).
- El daño lo calcula `@smogon/calc` 0.12.0 con Champions como **generación 0**: los Stat Points van en `evs`. `analysis/damage.ts` es el único sitio que habla con la calculadora. Su test de contraste (`packages/bot/test/calc.test.ts`) debe seguir en verde al actualizar Showdown o la calculadora.
- El modelo del rival solo usa lo que el bot puede ver (`BattleView` de su perspectiva) y los sets estándar. Nunca le pases el log omnisciente ni el equipo rival con equipo cerrado.
- Los tests de fuerza son cortos en el check (40 combates por modo); las cifras de referencia (500 por modo) se apuntan en el CHANGELOG al cambiar el bot.

## Particularidades del servidor y la web

- **El servidor solo envía la perspectiva p1** y las peticiones de p1 (`apps/server/src/battles/battle-room.ts`). El replay (log omnisciente) solo se entrega con el combate terminado. Hay un test que lo comprueba: si tocas la sala, que siga en verde.
- Los mensajes van por `@colleja/protocol` (zod): un mensaje nuevo se añade allí primero, con su test de ida y vuelta. El servidor responde a cada acción con un `battle:update` y, tras deshacer, rebobinar o reconectar, con un `battle:snapshot`.
- El estado del combate en la web sale de `BattleView` (core) y el log de `@colleja/narration` (port de `BattleTextParser` de Showdown). **No uses `@pkmn/client`/`@pkmn/dex`**: sus datos no son los de Champions ([ADR-0005](docs/adr/0005-servidor-web-y-narracion.md)). Las cifras que se muestran salen de la petición o de `@colleja/data`.
- El store de la web solo cambia con mensajes del servidor; nunca adivines el resultado de una elección en el cliente.
- Para los bots en el servidor (o en cualquier bucle humano contra bot), usa `decideFor` de `engine`: reintenta tras `[Unavailable choice]`.
- El servidor escucha en `127.0.0.1` y usa `SERVER_PORT`/`SERVER_HOST` (no `PORT`, que las herramientas de desarrollo suelen fijar para la web). La web usa `WEB_PORT`.
- Champions añade el color de la barra de PS al 20 % y al 50 % justos (`50/100y`): usa siempre `parseCondition` de `core` para leer condiciones.

## Particularidades de los equipos y rivales guardados y el teambuilder

- **Lo guardado pasa por un repositorio**: `TeamRepository` (`apps/server/src/teams/team-repository.ts`) y `OpponentRepository` (`apps/server/src/opponents/opponent-repository.ts`), ambos sobre `FileJsonRepository` (`apps/server/src/storage/json-repository.ts`). Nunca escribas ficheros a mano desde otra parte. Un fichero por elemento en `storage/<colección>/<id>.json`; el nombre del fichero es el id y solo admite letras, números y guiones (`SavedIdSchema`). Una colección nueva es un `JsonFileFormat` y una subclase.
- **Los tests nunca escriben en `storage/`**: usa `testServer()`, `tempTeamsDir()` y `tempOpponentsDir()` de `apps/server/test/helpers.ts` (carpetas temporales).
- **Legalidad informada, no impuesta**: se guarda cualquier equipo que cumpla los límites estructurales de `TeamSchema` (6 miembros, 4 movimientos, 0–32 SP por stat). Los `problems` (core y después el validador de Showdown, con `teamProblems`) van en cada respuesta, y la legalidad solo se exige al empezar un combate.
- El texto importado pasa por `fitTeamToLimits` (core), que recorta lo que no cabe y devuelve cada ajuste para enseñárselo al usuario.
- Para mostrar un problema junto a su campo usa `checkTeamIssues`/`checkSetIssues` (core). No partas los textos de `checkTeam`.
- Las operaciones del editor van en `apps/web/src/features/teams/team-draft.ts` (puras y testeadas); los componentes solo las llaman. Para comparar borradores usa `sameDraft` (zod reordena las claves al validar).
- **Un rival es un equipo más `botLevel`, en plano** (`OpponentContentSchema = TeamContentSchema.extend({ botLevel })`). El editor es el mismo: `TeamEditorPage` recibe un `EditorDestination` (`TEAM_DESTINATION` u `OPPONENT_DESTINATION`) que dice dónde cargar y guardar. No dupliques el editor ni la lista (`SavedListLayout`, `SavedCard`).
- **La dificultad del combate es siempre `botLevel` de `battle:start`**: con un rival guardado (`opponent: { kind: 'saved', opponentId }`) la web la rellena con la del rival, y el servidor no la lee del fichero.

## Actualizar Showdown (nueva regulación o fixes)

1. `git -C vendor/pokemon-showdown fetch --depth 1 origin master`, y luego `git -C vendor/pokemon-showdown checkout FETCH_HEAD`.
2. `npm run setup:force`, luego `npm run data:build` (y revisa el diff de los datos, incluidas las plantillas de `generated/text/`), y después `npm run check`. El test de consistencia falla si se te olvida regenerar los datos.
3. Commit del nuevo puntero del submódulo junto con los datos regenerados (`chore(showdown): bump to <sha>`) y entrada en el CHANGELOG.

## Red del equipo del usuario

La red es normal. A veces el usuario activa una VPN (Sophos) para otro proyecto que bloquea Serebii, Smogon, Showdown, PokeAPI… (`SEC_E_UNTRUSTED_ROOT`). Si un sitio falla así, avísale en lugar de buscar rodeos. Los scripts de datos y sprites siguen descargando de GitHub (raw o git) porque es reproducible.
