# Guía: herramientas de práctica

Calculadora de daño, replays guardados y explicación de las jugadas del bot. Las decisiones de arquitectura están en [ADR-0008](../adr/0008-herramientas-de-practica.md).

## Uso

Con `npm run dev`:

### Calculadora (`/calculadora`)

- **Atacante** y **defensor** se editan con la ficha del teambuilder (especie, objeto, habilidad, naturaleza, Stat Points, movimientos, set sugerido, importar/exportar). "Cargar de mis equipos" toma un Pokémon de tus equipos o rivales guardados.
- **Estado de cada uno**: megaevolucionado (con su megapiedra), PS en %, estado alterado y cambios de características (−6 a +6).
- **Campo**: individuales o dobles (los ataques múltiples hacen el 75 %), clima, campo y pantallas del defensor.
- **Resultado**: el daño de los cuatro movimientos del atacante a la vez (rango en PS y en %, y "KO seguro", "62,5 % de KO de un golpe" o "2–3 golpes para KO", desde los PS actuales). "⇄ Intercambiar" cambia los papeles.
- Recuerda lo último que calculaste (en el navegador).

### Replays (`/replays`)

- Al terminar un combate, **"Guardar replay"** lo añade a la lista (solo si lo pides). "Descargar" sigue bajando el JSON sin guardarlo.
- La lista muestra resultado, modo, dificultad, tipo de rival, turnos y los dos equipos; puedes verlo, descargarlo o borrarlo (con confirmación).
- **Visor** (`/replays/<id>`): avanza turno a turno (⏮ ◀ turno ▶ ⏭) con el campo, el log hasta ese momento y lo que valoró el bot en el turno recién jugado. "Todo" enseña los PS exactos y los equipos completos; "Como jugador", solo lo que viste en el combate.

Se guardan en `storage/replays/<id>.json` (no versionado):

```json
{
  "version": 1,
  "updatedAt": "2026-10-08T10:00:00.000Z",
  "replay": {
    "id": "…", "name": "Jugador contra Bot Táctico", "botLevel": 2, "opponentKind": "saved",
    "replay": { "version": 1, "mode": "singles", "seed": "…", "inputLog": [ … ], "log": [ … ], … },
    "playerLog": [ … ],
    "explanations": [ { "turn": 1, "kind": "moves", "method": "…", "options": [ … ] } ]
  }
}
```

### "Por qué jugó así el bot" (pantalla de combate)

- Panel plegable bajo los controles. Al resolverse cada turno aparece lo que valoró el bot: el método (qué mide la puntuación) y sus mejores opciones, con la elegida marcada. Puedes elegir cualquier turno ya jugado.
- **Nunca antes de tiempo**: la decisión del turno que estás jugando no se envía hasta que se resuelve.
- **Información oculta**: con equipo cerrado, las opciones con movimientos que aún no has visto (o Pokémon que no han salido) aparecen como "algo que aún no has visto", con su puntuación. Con equipo abierto se ve todo.
- Cada nivel valora a su manera: el aleatorio no valora nada, el agresivo usa el daño esperado de este turno y el táctico el balance de PS tras simular el intercambio (individuales) o unos turnos 2 contra 2 (dobles).

## Arquitectura

| Pieza | Qué hace |
|---|---|
| `@colleja/core` (`battle/explanation.ts`) | `DecisionExplanation`, `TurnExplanation`, `ExplainedAction`, `topOptions` y `redactExplanation` (oculta lo no revelado desde una perspectiva). `BattleAgent.explain?()` |
| `@colleja/bot` (`explain.ts`) | `describeAction` (de índices de la petición a ids legibles), `explanation`, `EXPLANATION_METHODS`. Cada nivel guarda lo que calculó y construye la explicación bajo demanda. `planDoubles` devuelve también las parejas evaluadas |
| `@colleja/protocol` | `calc.ts` (`CalcRequestSchema`, `CalcResponse`), `replays.ts` (`ReplayDataSchema`, `ReplayContentSchema`, `TurnExplanationSchema`, `ReplaySummary`). En `battle.ts`: `battle:save-replay` → `battle:replay-saved`, y `explanations` en `battle:update`/`battle:snapshot` |
| `apps/server` | `routes/calc.ts`, `routes/replays.ts`, `replays/replay-repository.ts` y, en `BattleRoom`, las explicaciones por turno (resueltas y censuradas) y `saveReplay()` |
| `apps/web` | `features/calc/` (`CalculatorPage`, `calc-store.ts`, `LoadSetDialog`), `features/replays/` (`ReplaysPage`, `ReplayViewerPage`, `replay-steps.ts`), `features/battle/components/BotExplanation.tsx` y el botón de guardar en `EndPanel` |

### API

| Petición | Respuesta |
|---|---|
| `POST /api/calc` `{ attacker, defender, move, field }` | `CalcResponse` (tiradas, mín./máx. en PS y %, probabilidad de KO, golpes para KO, precisión) |
| `GET /api/replays` | `{ replays: ReplaySummary[] }`, los más recientes primero |
| `GET /api/replays/:id` | `{ replay: SavedReplay, updatedAt }` |
| `DELETE /api/replays/:id` | 204 |
| WS `battle:save-replay` `{ battleId }` | `battle:replay-saved` `{ battleId, replayId }`, o `battle:error` de tipo `state` si el combate no ha terminado |

### Reglas

- La calculadora **no tiene otra fuente de verdad**: siempre `estimateDamage` (el test lo compara).
- **Una explicación nunca cambia una decisión**: no uses el generador aleatorio al construirla. El test `packages/bot/test/explain.test.ts` juega cada nivel con y sin explicaciones.
- **Nada de la explicación sale antes de resolverse su turno**, y con equipo cerrado siempre pasa por `redactExplanation`. Hay un test en `apps/server/test/tools.test.ts` como el de información oculta.
- Los tests del servidor guardan replays en una carpeta temporal (`tempReplaysDir()`).

## Tests relevantes

| Fichero | Qué cubre |
|---|---|
| `packages/bot/test/explain.test.ts` | Mismas decisiones con y sin explicaciones (niveles 0–2, los dos modos); la opción elegida coincide con la jugada |
| `packages/protocol/test/protocol.test.ts` | Ida y vuelta de la calculadora, del replay guardado y de los mensajes nuevos |
| `apps/server/test/tools.test.ts` | `/api/calc` = `estimateDamage` (Mega, cambios, Reflejo, dobles), movimientos de estado y errores; explicaciones solo de turnos resueltos y sin movimientos no vistos (y completas con equipo abierto, rehechas al rebobinar); guardar, listar, leer y borrar replays |
| `apps/web/test/tools.test.tsx` | Textos de la explicación, panel, store (explicaciones y replay guardado), `EndPanel`, pasos del visor y censura "como jugador", textos de KO y peticiones de la calculadora |
