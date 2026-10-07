# Fase 7 — Rivales editables (presets de rival con su dificultad)

> **Brief de traspaso.** Escrito al cerrar la fase 6 (2026-10-08) para que una sesión nueva pueda empezar sin contexto previo.
> Lee antes [AGENTS.md](../../AGENTS.md) (reglas y comandos), [PLAN.md](../PLAN.md) §2.1, §3.7 y §7.3 (rivales), la [guía del teambuilder](../guias/teambuilder.md) y el [ADR-0006](../adr/0006-equipos-guardados-y-teambuilder.md), porque esta fase reutiliza casi todo lo de la 6.
> Las decisiones de diseño son **recomendaciones**. Si al implementar encuentras algo mejor, adelante, pero documéntalo en un ADR.

## Objetivo

Practicar contra un equipo rival concreto y guardado (PLAN §8: "Practicar contra un equipo concreto guardado").

1. **Rivales guardados** ("presets"): un equipo del bot más su configuración (dificultad y, si se quiere, opciones de práctica).
2. Crear un rival **generando un equipo aleatorio** (los sets estándar de `teamgen`), **editándolo** con el mismo editor del teambuilder y guardándolo. También desde cero, importando texto o a partir de uno de tus equipos.
3. **Inicio**: elegir como rival un preset guardado (además de aleatorio o pegado). Al elegirlo, la dificultad del preset se aplica (y se puede cambiar).

## Punto de partida (ya hecho)

| Pieza | Qué ofrece |
|---|---|
| `@colleja/core` | `Team`, `checkTeamIssues`/`checkTeam`, `fitTeamToLimits`, import/export, `championsStats` |
| `@colleja/protocol` | `TeamContentSchema`, `TeamSchema`, `TeamIdSchema`, `BotLevelSchema`, `BattleOptionsSchema`, `OpponentSchema` (`random` \| `team` con texto) y el patrón de los cuerpos y respuestas de `/api/teams` (`teams.ts`) |
| `@colleja/teamgen` | `generateTeam(mode, { seed })`: 6 sets legales a partir de los sets estándar, como mucho una megapiedra. Ya expuesto en `POST /api/teams/random` (`{ seed, team, text }`) |
| `apps/server` | `TeamRepository`/`FileTeamRepository` (un JSON por equipo, escritura atómica, ids seguros), `teamProblems` (core y después Showdown), `routes/teams.ts` (CRUD) y `BattleManager.rivalTeam` (hoy: aleatorio o texto) |
| `apps/web` | Teambuilder completo en `features/teams/`: `team-draft.ts` (operaciones puras), `team-editor-store.ts` (borrador, guardado vía `api.createTeam`/`updateTeam`), `TeamEditorPage`, `TeamsPage`, componentes `MemberList`, `SetEditor`, `StatPointsEditor`, `TextDialogs`; `Combobox` y `Dialog` genéricos. Inicio con "Equipo rival: Aleatorio / Pegado" y la dificultad (`setup-store.ts`) |

## Hechos verificados (no los redescubras)

- El rival es siempre **p2** y lo juega el bot creado con `createBot(level, { seed })`. Su equipo pasa por `BattleSession.create`, que valida con Showdown: un rival ilegal da `TeamProblemsError('El equipo rival no se puede usar.', …)` y `battle:error` de tipo `team`.
- **El bot no conoce los sets del jugador** con equipo cerrado (decisión de producto); con equipo abierto (`openTeamSheets`) los dos ven los del otro. Un rival guardado no cambia eso.
- Un equipo guardado vale para los dos modos si es legal (decisión de la fase 6): un rival también, aunque guarde un modo preferido.
- Los ficheros de `storage/` son del usuario: los tests usan carpetas temporales (`tempTeamsDir()` en `apps/server/test/helpers.ts`).
- `FileTeamRepository` valida al leer con `TeamFileSchema` (versión 1). Si cambias el formato, sube la versión y acepta la anterior.
- El editor (`TeamEditorPage`) está atado a `/equipos/*` y a `api.createTeam`/`updateTeam` a través de `team-editor-store.ts`. Para reutilizarlo hay que parametrizar **solo** dónde se guarda y adónde se vuelve; `team-draft.ts` y los componentes ya son independientes.
- Tras HMR de Vite el store Zustand del editor se reinicia: al probar a mano, recarga la página.

## Diseño recomendado

### A. Persistencia (`apps/server`)

- `Opponent` = `{ id, name, team: TeamContent, botLevel, notes? }` (el modo va en el equipo). Esquema `OpponentSchema…` en `@colleja/protocol` (`opponents.ts`), reutilizando `TeamContentSchema` y `BotLevelSchema`. Ojo: ya existe `OpponentSchema` para el rival de `battle:start`; elige nombres que no choquen (p. ej. `SavedOpponentSchema`).
- `storage/opponents/<id>.json` con `{ version: 1, updatedAt, opponent, export }`.
- Generaliza `FileTeamRepository` en un repositorio JSON genérico (`FileJsonRepository<T>` con el esquema, la versión y la función de export como parámetros) y crea `TeamRepository` y `OpponentRepository` sobre él, sin duplicar la escritura atómica ni la validación de ids. Escribe un ADR si cambias la forma de ADR-0006.
- Rutas `GET/POST /api/opponents`, `POST /api/opponents/import`, `GET/PUT/DELETE /api/opponents/:id`, con `problems` en cada respuesta (mismo `teamProblems`).
- `battle:start`: `opponent` admite `{ kind: 'saved', opponentId }`. El servidor lee el preset y lo valida. La dificultad sigue viniendo en `botLevel` (la web la rellena con la del preset): así el servidor no tiene dos fuentes de verdad.

### B. Web

- **Rutas**: `/rivales` (lista) y `/rivales/nuevo`, `/rivales/:id` (editor). Enlace "Rivales" en la cabecera.
- **Editor reutilizado**: parametriza `team-editor-store.ts` con un "destino" (`teams` u `opponents`: funciones de cargar y guardar, ruta de vuelta) y añade en la cabecera del editor de rivales el selector de **dificultad** (los niveles de `GET /api/meta`).
- **Nuevo rival**: "Generar aleatorio" (llama a `POST /api/teams/random` con el modo y abre el editor con ese borrador sin guardar), "Desde uno de mis equipos" (copia), "Importar" y "Desde cero".
- **Lista**: igual que la de equipos (iconos, modo, dificultad, estado) con "Usar como rival".
- **Inicio**: "Equipo rival: Aleatorio / Guardado / Pegado". Con un preset, la dificultad se pone a la suya (el usuario puede cambiarla antes de empezar). `toStartMessage` manda `{ kind: 'saved', opponentId }`.

## Tests mínimos

| Workspace | Tests |
|---|---|
| server | Repositorio genérico (los tests de `FileTeamRepository` siguen en verde) y `OpponentRepository` en carpeta temporal. CRUD de `/api/opponents` (400, 404, problemas, importar). `battle:start` con `{ kind: 'saved', opponentId }` en los dos modos, y error con un preset inexistente o ilegal |
| protocol | Ida y vuelta del esquema de rival y de los cuerpos; `opponent: { kind: 'saved' }` sin id se rechaza |
| web | El store del editor con los dos destinos (guardar llama a la API correcta). Componentes: selector de dificultad del editor de rivales, "Generar aleatorio" abre un borrador sin guardar, lista de rivales (borrar con confirmación) e inicio con rival guardado (aplica la dificultad) |

## Criterios de "hecho"

- [ ] Desde `/rivales`, generar un rival aleatorio, cambiarle un Pokémon y la dificultad, guardarlo y, tras reiniciar el servidor, seguir teniéndolo.
- [ ] Elegirlo en el inicio y jugar contra él en individuales y en dobles (el bot usa exactamente ese equipo y ese nivel).
- [ ] Los equipos de la fase 6 siguen funcionando igual (sus tests en verde).
- [ ] `npm run check` y la CI en verde. Guía `docs/guias/teambuilder.md` ampliada (o una nueva `rivales.md`).

## Decisiones de producto para preguntar al usuario (con recomendación)

- **¿Rival = equipo aparte o un equipo marcado como rival?** Recomendación: aparte (`storage/opponents/`), con su dificultad; se puede crear copiando uno de tus equipos.
- **¿El preset guarda también las opciones de práctica (vista previa, equipo abierto)?** Recomendación: no, solo la dificultad; las opciones son del combate, no del rival.
- **¿Al elegir un preset en el inicio se bloquea la dificultad?** Recomendación: no, se aplica la del preset y se puede cambiar.
- **¿Se puede combatir contra un rival generado sin guardarlo?** Recomendación: no. "Generar aleatorio" abre el editor con el borrador y hay que guardarlo para usarlo; el inicio solo maneja presets (y el rival aleatorio de siempre sigue disponible sin editar).

## Al cerrar la fase

Sigue el **protocolo de cierre de fase** de [AGENTS.md](../../AGENTS.md): docs, CHANGELOG, el brief de la fase 8 en `docs/fases/fase-8.md`, commit y push.

## Fuera de alcance de esta fase

Calculadora, lista de replays y explicación del bot (fase 8), bot nivel 3, rivales sacados de estadísticas de uso reales, modo clásico IV/EV/Tera y E2E con Playwright.
