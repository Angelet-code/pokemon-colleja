# Guía: herramientas de práctica

Calculadora de daño, replays guardados y explicación de las jugadas del bot. Las decisiones de arquitectura están en [ADR-0008](../adr/0008-herramientas-de-practica.md); lo añadido en la fase 10 (abrir la calculadora desde un combate, críticos y efectos, renombrar replays y E2E), en el [brief de la fase 10](../fases/fase-10.md).

## Uso

Con `npm run dev`:

### Calculadora (`/calculadora`)

- **Atacante** y **defensor** se editan con la ficha del teambuilder (especie, objeto, habilidad, naturaleza, Stat Points, movimientos, set sugerido, importar/exportar). "Cargar de mis equipos" toma un Pokémon de tus equipos o rivales guardados.
- **Estado de cada uno**: megaevolucionado (el interruptor «Mega» equipa la megapiedra si no la lleva, y la ficha enseña la forma Mega solo con él activo), PS en %, estado alterado y cambios de características (−6 a +6).
- **Campo**: individuales o dobles (los ataques múltiples hacen el 75 %), clima, campo, pantallas del defensor y **efectos**: Gravedad, Zona Mágica y Zona Extraña; en dobles, también Refuerzo (el aliado del atacante) y Compiescolta (el aliado del defensor).
- **Crítico** (en la cabecera de «Daño»): todos los golpes son críticos.
- **Resultado**: el daño de los cuatro movimientos del atacante a la vez (rango en PS y en %, y "KO seguro", "62,5 % de KO de un golpe" o "2–3 golpes para KO", desde los PS actuales). "Intercambiar" cambia los papeles.
- Recuerda lo último que calculaste (en el navegador).

### «Calcular» desde un combate

- Botón **«Calcular»** en el marcador del combate: abre la calculadora en **otra pestaña** con tu Pokémon activo atacando al del rival (en dobles, un menú con las parejas). El combate sigue igual en su pestaña.
- Lleva los PS (en %), el estado, los cambios de características y la Mega de los dos, y el campo: clima, campo, pantallas del rival, Gravedad y las zonas.
- **Sin información oculta**: con equipo cerrado, el rival lleva su set estándar más probable (el que supone el bot, `OpponentModel`) con lo ya revelado encima (objeto, habilidad, movimientos; sin objeto si lo perdió). Con equipo abierto, su set real.

### Datos y efecto de los movimientos (pantalla de combate)

- Cada botón de movimiento lleva su tipo, categoría, potencia, precisión, PP y efecto, y, por cada rival en el campo, la **eficacia** (×4, ×2, ×1, ×½, ×¼, «Inmune»), el **daño estimado** en % de sus PS y los golpes para KO (o la probabilidad de KO). El detalle va en el `title`. En dobles, el selector de objetivo lo repite para cada rival.
- Se calcula **como «Calcular»** (`features/battle/move-estimates.ts`: `calcFromBattle` + `POST /api/calc`), así que solo usa lo que ves. La eficacia sigue el **tipo final** que da la calculadora (`moveType`: Piel Feérica, Meteorobola, Voz Fluida…), y un ataque que no hace daño es una inmunidad por habilidad (la supuesta, con equipo cerrado).

### Replays (`/replays`)

- Al terminar un combate, **"Guardar replay"** lo añade a la lista (solo si lo pides). "Descargar" sigue bajando el JSON sin guardarlo.
- La lista muestra resultado, modo, dificultad, tipo de rival, turnos y los dos equipos; puedes verlo, **renombrarlo** (también desde el visor), descargarlo o borrarlo (con confirmación).
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
- **«Cómo lo pensó»** (nivel 3, al elegir movimientos): unas frases con su razonamiento. Qué esperaba que hicieras (tus respuestas contra las que jugó en la búsqueda, con su peso; en dobles, una línea por cada Pokémon tuyo), a cuáles dio más peso porque sueles anticiparte a lo obvio, que el resto lo descartó por verlo peor para ti y por qué eligió su jugada: la mejor contra lo que más esperaba o, si no, la que le cubría ante otra respuesta tuya. Son tus propias jugadas, así que no se censuran.

## Arquitectura

| Pieza | Qué hace |
|---|---|
| `@colleja/core` (`battle/explanation.ts`) | `DecisionExplanation` (con `expected`, tus respuestas que esperaba, y `versus` en cada opción, su valor contra cada una), `TurnExplanation`, `ExplainedAction`, `ExpectedReply`, `topOptions` y `redactExplanation` (oculta lo no revelado desde una perspectiva). `BattleAgent.explain?()` |
| `@colleja/bot` (`explain.ts`) | `describeAction` (de índices de la petición a ids legibles), `explanation`, `EXPLANATION_METHODS`. Cada nivel guarda lo que calculó y construye la explicación bajo demanda. `planDoubles` devuelve también las parejas evaluadas |
| `@colleja/protocol` | `calc.ts` (`CalcRequestSchema`, `CalcResponse`), `replays.ts` (`ReplayDataSchema`, `ReplayContentSchema`, `TurnExplanationSchema`, `ReplaySummary`). En `battle.ts`: `battle:save-replay` → `battle:replay-saved`, y `explanations` en `battle:update`/`battle:snapshot` |
| `apps/server` | `routes/calc.ts`, `routes/replays.ts`, `replays/replay-repository.ts` y, en `BattleRoom`, las explicaciones por turno (resueltas y censuradas) y `saveReplay()` |
| `apps/web` | `features/calc/` (`CalculatorPage`, `calc-store.ts`, `LoadSetDialog`, `from-battle.ts`), `features/replays/` (`ReplaysPage`, `ReplayViewerPage`, `RenameForm`, `replay-steps.ts`), `features/battle/components/BotExplanation.tsx` (con las frases puras de `explanation-story.ts`), `CalcButton.tsx` y el botón de guardar en `EndPanel` |
| `@colleja/bot/opponent-model` | Entrada aparte de `OpponentModel` para la web: el índice de `@colleja/bot` arrastra `@smogon/calc` y la web nunca lo importa (lo comprueba `apps/web/test/dependencies.test.ts`) |
| `tools/e2e` | Tests E2E con Playwright (`npm run e2e`) |

### API

| Petición | Respuesta |
|---|---|
| `POST /api/calc` `{ attacker, defender, move, crit?, field }` | `CalcResponse` (tiradas, mín./máx. en PS y %, probabilidad de KO, golpes para KO, precisión, tipo final del movimiento `moveType`). `field` admite `helpingHand` y `friendGuard` (solo dobles), `gravity`, `magicRoom` y `wonderRoom` |
| `GET /api/replays` | `{ replays: ReplaySummary[] }`, los más recientes primero |
| `GET /api/replays/:id` | `{ replay: SavedReplay, updatedAt }` |
| `PATCH /api/replays/:id` `{ name }` | `{ replay, updatedAt }` (400 si el nombre está vacío o pasa de 100 caracteres, 404 si no existe) |
| `DELETE /api/replays/:id` | 204 |
| WS `battle:save-replay` `{ battleId }` | `battle:replay-saved` `{ battleId, replayId }`, o `battle:error` de tipo `state` si el combate no ha terminado |

### Reglas

- La calculadora **no tiene otra fuente de verdad**: siempre `estimateDamage` (el test lo compara).
- **Una explicación nunca cambia una decisión**: no uses el generador aleatorio al construirla. El test `packages/bot/test/explain.test.ts` juega cada nivel con y sin explicaciones.
- **Nada de la explicación sale antes de resolverse su turno**, y con equipo cerrado siempre pasa por `redactExplanation`. Hay un test en `apps/server/test/tools.test.ts` como el de información oculta.
- Los tests del servidor guardan replays en una carpeta temporal (`tempReplaysDir()`).
- **«Calcular» solo usa lo que ves**: `calcFromBattle` parte de `BattleView` (perspectiva p1), tu equipo y el del rival solo con equipo abierto. Para suponer sets, `OpponentModel`, nunca otra lógica.
- Los efectos de un turno de la calculadora (Refuerzo, Compiescolta) van en `FieldState.boosts`; los combates no los rellenan.

## Tests E2E (Playwright)

`npm run e2e` compila la web y arranca el servidor de producción en el puerto 3101 (`E2E_PORT`) con `STORAGE_DIR` en una carpeta temporal, y juega en Chromium los flujos principales: importar un equipo y usarlo, un combate contra el nivel 0 (vista previa, un movimiento con su atajo, «Calcular», rendirse, guardar el replay), renombrar, ver y borrar el replay, y la calculadora con crítico y Refuerzo. La primera vez hace falta `npm run e2e:install` (descarga Chromium). No forma parte de `npm run check`; la CI lo ejecuta en un job aparte (`e2e`) y sube el informe si falla.

Los specs están en `tools/e2e/specs/`. Usa nombres accesibles (`getByRole`, `getByLabel`) y nada de esperas fijas.

## Tests relevantes

| Fichero | Qué cubre |
|---|---|
| `packages/bot/test/explain.test.ts` | Mismas decisiones con y sin explicaciones (niveles 0–3, los dos modos); la opción elegida coincide con la jugada; el nivel 3 dice qué esperaba de ti (probabilidades y `versus` alineados) |
| `apps/web/test/explanation-story.test.ts` | Frases de «Cómo lo pensó» en individuales y dobles |
| `packages/protocol/test/protocol.test.ts` | Ida y vuelta de la calculadora (con crítico y efectos), del replay guardado, de renombrar y de los mensajes nuevos |
| `packages/bot/test/calc.test.ts` | Crítico, Refuerzo y Compiescolta contra `@smogon/calc` directamente; la caché distingue el crítico |
| `apps/web/test/calc-from-battle.test.ts` | «Calcular»: lo visible del combate, el set supuesto con equipo cerrado y el real con equipo abierto, objeto perdido, campo y parejas en dobles |
| `apps/server/test/tools.test.ts` | `/api/calc` = `estimateDamage` (Mega, cambios, Reflejo, dobles, crítico, Refuerzo y Compiescolta solo en dobles, Zona Extraña), movimientos de estado y errores; explicaciones solo de turnos resueltos y sin movimientos no vistos (y completas con equipo abierto, rehechas al rebobinar); guardar, listar, leer, renombrar y borrar replays |
| `apps/web/test/tools.test.tsx` | Textos de la explicación, panel, store (explicaciones y replay guardado), `EndPanel`, pasos del visor y censura "como jugador", textos de KO, peticiones de la calculadora (crítico y efectos de dobles) y renombrar en la lista |
| `tools/e2e/specs/*.spec.ts` | Flujos completos en el navegador (ver arriba) |
