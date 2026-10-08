# Guía: rivales guardados

Cómo crear rivales para el bot (un equipo más su dificultad), guardarlos y practicar contra ellos. Las decisiones de arquitectura están en [ADR-0007](../adr/0007-rivales-guardados.md). El editor es el del [teambuilder](teambuilder.md).

## Uso

Con `npm run dev`, entra en **Rivales** (cabecera) o en http://127.0.0.1:5173/rivales.

- **Nuevo rival**, de cuatro maneras:
  - **Aleatorio** (individuales o dobles): un equipo legal de los sets estándar (`teamgen`, como mucho dos megapiedras).
  - **De mis equipos**: copia uno de tus equipos guardados. Tu equipo no cambia.
  - **Importar**: texto de Showdown, con nombre, modo y dificultad.
  - **Nuevo rival**: el editor vacío.

  El aleatorio y la copia se abren en el editor **sin guardar**: hay que guardarlos para poder usarlos (el aviso de cambios sin guardar te lo recuerda).
- **Editor** (`/rivales/nuevo` o `/rivales/<id>`): el mismo del teambuilder, con el selector de **dificultad** en la cabecera.
- **Lista**: cada rival con sus iconos, el modo preferido, la dificultad, la fecha y si es legal. Acciones: **Usar como rival**, **Editar**, **Duplicar** y **Borrar** (pide confirmación).
- **Inicio**: en "Equipo rival", elige **Aleatorio**, **Guardado** o **Pegado**. Al elegir un rival guardado se aplica su dificultad, que aún puedes cambiar; si la cambias, el inicio te recuerda la guardada ("Usar esa"). Un rival legal vale para individuales y dobles.

Las opciones de práctica (vista previa, equipo abierto) no se guardan con el rival: son de cada combate.

Los rivales se guardan en `storage/opponents/<id>.json` (no versionado), legibles y editables a mano:

```json
{
  "version": 1,
  "updatedAt": "2026-10-08T10:00:00.000Z",
  "opponent": {
    "id": "…", "name": "Lluvia", "mode": "doubles", "ruleset": "champions-regmc",
    "members": [ … ], "botLevel": 2
  },
  "export": "Pelipper @ Damp Rock\nAbility: Drizzle\n…"
}
```

## Arquitectura

| Pieza | Qué hace |
|---|---|
| `@colleja/protocol` (`opponents.ts`) | `OpponentContentSchema` (`TeamContentSchema` + `botLevel`), `SavedOpponentSchema`, los cuerpos y respuestas de `/api/opponents` y `OpponentSummary`. `battle.ts`: `opponent: { kind: 'saved', opponentId }` |
| `apps/server` | `storage/json-repository.ts` (`FileJsonRepository`, compartido con los equipos), `opponents/opponent-repository.ts`, `teams/saved-teams.ts` (resumen e importación comunes), `routes/opponents.ts` y `BattleManager.rivalTeam` |
| `apps/web` (`features/teams/`) | `editor-destination.ts` (`TEAM_DESTINATION`, `OPPONENT_DESTINATION`), `OpponentsPage`, `components/BotLevelSelect`, y la lista compartida (`SavedList`, `SavedCard`, `ImportSavedDialog`) |
| `apps/web` (`features/setup/`) | `setup-store.ts` (`opponentKind: 'random' \| 'saved' \| 'team'`, `opponentId`) y `SavedTeamPicker` (sirve para tu equipo y para el rival) |
| `apps/web` (`lib/use-meta.ts`) | `useMeta()` y `botLevelName()`: los niveles del bot de `GET /api/meta`, pedidos una vez |

### API

| Petición | Respuesta |
|---|---|
| `GET /api/opponents` | `{ opponents: OpponentSummary[] }` (como los de equipos, más `botLevel`), los más recientes primero |
| `POST /api/opponents` `{ opponent }` | 201 + `OpponentResponse` (`opponent`, `problems`, `adjustments`, `updatedAt`) |
| `POST /api/opponents/import` `{ text, name, mode, botLevel }` | 201 + `OpponentResponse`; `adjustments` lista las líneas no leídas y los recortes |
| `GET /api/opponents/:id` · `PUT /api/opponents/:id` `{ opponent }` | `OpponentResponse` |
| `DELETE /api/opponents/:id` | 204 |

Errores: 400 con `details` en español y 404 (`Ese rival no existe.`). En `battle:start`, un rival guardado inexistente o ilegal da `battle:error` de tipo `team` (`Ese rival guardado no existe.`, `El rival «X» no se puede usar.`).

### Reglas

- La dificultad del combate es siempre `botLevel` del mensaje: la web la rellena con la del rival. El servidor no lee la del fichero.
- El bot sigue sin conocer tus sets con equipo cerrado: un rival guardado no cambia eso.
- Una colección nueva (p. ej. replays) se añade con su `JsonFileFormat` y una subclase de `FileJsonRepository`, nunca escribiendo ficheros a mano.
- Los tests del servidor usan carpetas temporales (`tempTeamsDir()`, `tempOpponentsDir()` y `testServer({ teamsDir, opponentsDir })`).

## Tests relevantes

| Fichero | Qué cubre |
|---|---|
| `packages/protocol/test/protocol.test.ts` | Ida y vuelta del rival y sus cuerpos; `opponent: { kind: 'saved' }` sin id o con un id inseguro se rechaza |
| `apps/server/test/opponents.test.ts` | `FileOpponentRepository` (fichero legible, otro tipo de fichero se ignora), CRUD por HTTP (400, 404, problemas, importar), persistencia tras reiniciar y `battle:start` contra un rival guardado en los dos modos (el bot lleva exactamente ese equipo y ese nivel), con error si no existe o es ilegal |
| `apps/server/test/teams.test.ts` | Los mismos tests de equipos de la fase 6, ahora sobre el repositorio genérico |
| `apps/web/test/opponents.test.tsx` | El store guarda en la API de cada destino, "Generar aleatorio" abre un borrador sin guardar con su dificultad, la lista (borrar con confirmación), "Usar como rival" y el inicio con un rival guardado (aplica su dificultad y se puede cambiar) |
