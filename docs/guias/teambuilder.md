# Guía: teambuilder y equipos guardados

Cómo crear, guardar y usar equipos en el navegador, y cómo está montado. Las decisiones de arquitectura están en [ADR-0006](../adr/0006-equipos-guardados-y-teambuilder.md). El servidor y la app en general se explican en la [guía de la web](web.md). El mismo editor crea los rivales del bot: [guía de rivales](rivales.md).

## Uso

Con `npm run dev`, entra en **Equipos** (cabecera) o en http://127.0.0.1:5173/equipos.

- **Lista**: cada equipo con sus iconos, el modo preferido, la fecha y si es legal o cuántos problemas tiene (pasa el ratón por encima para verlos). Acciones:
  - **Nuevo equipo** y **Importar** (texto de Showdown, con nombre y modo).
  - **Usar en combate**: va al inicio con el equipo elegido (solo si es legal).
  - **Editar**, **Duplicar** y **Borrar** (pide confirmación).
- **Editor** (`/equipos/nuevo` o `/equipos/<id>`): los Pokémon a la izquierda y la ficha del elegido a la derecha. En pantallas estrechas se ve una cosa cada vez.
  - **Añadir Pokémon**: buscador de especies (nombre en español o inglés, o número de Pokédex). Solo especies elegibles: las Megas se consiguen con su megapiedra.
  - **Ficha**: especie (al cambiarla se conservan los movimientos que puede aprender), mote, género (si no es fijo), shiny, habilidad (con descripción), objeto (las megapiedras solo para su especie, y avisa si otro miembro ya lleva ese objeto), naturaleza (con el stat que sube y el que baja) y **set sugerido** (los sets estándar de la especie para el modo).
  - **Stat Points**: deslizador y número por stat, de 0 a 32, con los restantes de 66. Los stats finales a nivel 50 se calculan en vivo con la misma fórmula que el motor; la naturaleza se marca con ▲/▼. Con su megapiedra, también los stats de la Mega.
  - **Movimientos**: 4 buscadores con solo el learnset de Champions, con tipo, categoría, potencia, precisión, PP y descripción.
  - **Problemas en vivo** junto al campo que los causa, con un contador por Pokémon en la lista. Tras guardar, se añaden los del validador de Showdown.
  - **Importar/Exportar** el equipo entero o un solo Pokémon, en formato de Showdown (nombres en inglés; los EVs son Stat Points). Si el texto no cabe en el editor (más de 6, más de 4 movimientos, Stat Points de más), se ajusta y se avisa de cada cambio.
  - **Guardar** es explícito. Un equipo con problemas se guarda como borrador. Si sales con cambios sin guardar, pregunta.
- **Inicio**: en "Tu equipo", elige **Guardado** (la lista de tus equipos) o **Pegado** (texto). Un equipo guardado vale para individuales y dobles: el modo es solo el preferido.

Los equipos se guardan en `storage/teams/<id>.json` (no versionado), legibles y editables a mano:

```json
{
  "version": 1,
  "updatedAt": "2026-10-08T10:00:00.000Z",
  "team": { "id": "…", "name": "Lluvia", "mode": "doubles", "ruleset": "champions-regmc", "members": [ … ] },
  "export": "Pelipper @ Damp Rock\nAbility: Drizzle\n…"
}
```

`team` manda; `export` se reescribe al guardar. Si editas un fichero a mano y deja de cumplir el esquema, la lista lo ignora y el servidor lo avisa en su log.

## Arquitectura

| Pieza | Qué hace |
|---|---|
| `@colleja/core` | `checkTeamIssues`/`checkSetIssues` (problema → miembro y campo), `fitTeamToLimits` (ajusta texto importado) y el resto de utilidades de equipo (`setStatPoint`, `championsStats`, import/export) |
| `@colleja/protocol` (`teams.ts`) | `PokemonSetSchema`, `TeamSchema`, `TeamContentSchema` (sin id), `TeamIdSchema` y los cuerpos y respuestas de `/api/teams`. Límites estructurales, no legalidad |
| `apps/server` | `teams/team-repository.ts` (`TeamRepository`, `FileTeamRepository` sobre el repositorio genérico `storage/json-repository.ts`), `teams/team-problems.ts` (`teamProblems`: core y después Showdown), `teams/saved-teams.ts` (resumen e importación, comunes con los rivales) y `routes/teams.ts` |
| `apps/web` (`features/teams/`) | `team-draft.ts` (operaciones puras), `team-editor-store.ts` (borrador, versión guardada, guardar en su destino), `editor-destination.ts` (equipos o rivales), `options.tsx` (opciones de los buscadores), `TeamsPage`, `TeamEditorPage` y `components/` (`MemberList`, `SetEditor`, `StatPointsEditor`, `TextDialogs` y la lista compartida con los rivales: `SavedList`, `SavedCard`, `ImportSavedDialog`) |
| `apps/web` (`components/`) | `Combobox` (buscador accesible: flechas, Enter, Esc; busca sin acentos en los dos idiomas), `Dialog` y `TypeBadge` |

### API

| Petición | Respuesta |
|---|---|
| `GET /api/teams` | `{ teams: TeamSummary[] }` (id, nombre, modo, especies, `valid`, `problems`, `updatedAt`), los más recientes primero |
| `POST /api/teams` `{ team }` | 201 + `TeamResponse` (`team`, `problems`, `adjustments`, `updatedAt`) |
| `POST /api/teams/import` `{ text, name, mode }` | 201 + `TeamResponse`; `adjustments` lista las líneas no leídas y los recortes |
| `GET /api/teams/:id` · `PUT /api/teams/:id` `{ team }` | `TeamResponse` |
| `DELETE /api/teams/:id` | 204 |

Errores: 400 con `details` en español (cuerpo mal formado o id no válido) y 404 (`Ese equipo no existe.`). `battle:start` acepta `teamId` en lugar de `team`.

### Reglas

- **Legalidad informada, no impuesta**: se guarda cualquier equipo que cumpla los límites estructurales; solo se exige legalidad para combatir (el servidor valida al empezar).
- Las operaciones de edición van en `team-draft.ts` y se testean sin React. Los componentes solo las llaman.
- Los datos (learnsets, objetos, sets sugeridos, stats) salen de `@colleja/data` y `@colleja/core`, nunca de memoria.
- Los tests del servidor usan una carpeta temporal (`tempTeamsDir()` en `apps/server/test/helpers.ts`): **nunca** escriben en `storage/`.
- Para comparar borradores, `sameDraft` ignora el orden de las claves (zod las reordena al validar).

## Tests relevantes

| Fichero | Qué cubre |
|---|---|
| `packages/core/test/team.test.ts` | Problemas por miembro y campo, cláusulas sin duplicar y `fitTeamToLimits` |
| `packages/protocol/test/protocol.test.ts` | Ida y vuelta de `TeamSchema` y los cuerpos; rechazo de Stat Points fuera de rango, más de 4 movimientos, más de 6 miembros e ids inseguros |
| `apps/server/test/teams.test.ts` | `FileTeamRepository` (CRUD, escritura atómica, ficheros rotos, ids inseguros), CRUD por HTTP (400, 404, problemas, importar), persistencia tras reiniciar y `battle:start` con `teamId` en los dos modos |
| `apps/web/test/team-draft.test.ts` | Cambiar de especie, 66/32, megapiedras e Item Clause, huecos de movimientos, set sugerido, problemas por campo e ida y vuelta de import/export |
| `apps/web/test/teambuilder.test.tsx` | Editor de Stat Points (restantes, stats en vivo = `championsStats`, Mega), buscador de movimientos (solo learnset, sin repetir), import/export de un Pokémon y la lista (borrar con confirmación) |
