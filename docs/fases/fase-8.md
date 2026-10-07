# Fase 8 — Herramientas de práctica (calculadora, replays guardados y explicación del bot)

> **Brief de traspaso.** Escrito al cerrar la fase 7 (2026-10-08) para que una sesión nueva pueda empezar sin contexto previo.
> Lee antes [AGENTS.md](../../AGENTS.md) (reglas y comandos), [PLAN.md](../PLAN.md) §6, §7.5 y §3.7, la [guía de la web](../guias/web.md), la [guía del bot](../guias/bot.md) y el [ADR-0007](../adr/0007-rivales-guardados.md) (repositorio genérico).
> Las decisiones de diseño son **recomendaciones**. Si al implementar encuentras algo mejor, adelante, pero documéntalo en un ADR.

## Objetivo

Aprender de cada combate (PLAN §7.5: "Herramientas"):

1. **Calculadora de daño** con las reglas de Champions (Stat Points, nivel 50, Megas): atacante, defensor, movimiento y campo → rango de daño, % y probabilidad de KO.
2. **Replays guardados**: cada combate terminado se guarda en `storage/replays/`, con una lista para verlos, descargarlos o borrarlos, y un **visor** turno a turno.
3. **Explicación del bot**: por qué el bot eligió lo que eligió (las opciones que consideró y su valoración), sin revelar información oculta antes de tiempo.

## Punto de partida (ya hecho)

| Pieza | Qué ofrece |
|---|---|
| `@colleja/bot` | `analysis/damage.ts`: el único sitio que habla con `@smogon/calc` 0.12.0 (Champions = generación 0; los SP van en `evs`). `estimateDamage(attacker, defender, move, field)` → `DamageEstimate` (`rolls`, `min`, `max`, `avg`, `koChance`, `accuracy`), `toCalcPokemon`, `FieldState`/`fieldFromView`/`emptyField`. Apto para navegador |
| `@colleja/bot` (planes) | `planSingles`/`planDoubles` devuelven `PlannedOption[]` con su valoración; `AggressiveAgent`/`TacticalAgent` eligen entre `Candidate`s. Hoy solo devuelven la `Choice` (`BattleAgent.choose`) |
| `@colleja/engine` | `ReplayData` (versión, modo, opciones, semilla, jugadores con sus sets, `inputLog`, log omnisciente, ganador, turnos) y `BattleSession.fromReplay` (reconstruye la sesión) |
| `apps/server` | `FileJsonRepository<K, T, C>` (`storage/json-repository.ts`): una colección nueva es un `JsonFileFormat` y una subclase. `BattleRoom` crea el replay al terminar (`battle:replay`) y el bot juega con `decideFor` |
| `apps/web` | Pantalla de combate (`features/battle`: `Field`, `BattleLog`, `TeamPreview`…), `BattleView` de core y `@colleja/narration` para reconstruir campo y log desde líneas de protocolo. Lista compartida (`SavedListLayout`, `SavedCard`) y `useMeta()` |

## Hechos verificados (no los redescubras)

- **`apps/web` no depende de `@colleja/bot` ni de `@smogon/calc`**. `@smogon/calc` trae los datos de todas las generaciones (≈1,6 MB en `dist/data`); importarlo en la web haría crecer mucho el bundle (hoy ≈1,5 MB, ≈338 KB con gzip).
- El replay se descarga hoy en el cliente al llegar `battle:replay` (`battle-store.ts`). Solo se entrega con el combate **terminado** porque el log es omnisciente (test en `server.test.ts`).
- El servidor solo manda la perspectiva p1. La explicación del bot habla del equipo rival y de lo que el bot cree saber: **mostrarla antes de que se resuelva el turno revelaría su jugada**.
- Los bots son deterministas por semilla (`createBot(level, { seed })`): añadir una explicación no puede cambiar la decisión (los tests de fuerza y los de referencia lo detectarían).
- El daño del bot ya se contrasta con el motor (`packages/bot/test/calc.test.ts`): la calculadora puede reutilizar `estimateDamage` sin otra fuente de verdad.

## Diseño recomendado

### A. Calculadora

- **En el servidor**: `POST /api/calc` con atacante y defensor (`PokemonSetSchema` + Mega opcional y cambios de stats), movimiento y campo (clima, terreno, pantallas, dobles). Llama a `estimateDamage` de `@colleja/bot`. Así la web no carga `@smogon/calc`.
- Esquemas en `@colleja/protocol` (`calc.ts`), con su test de ida y vuelta.
- **Web** `/calculadora`: dos fichas compactas (reutiliza `Combobox`, `StatPointsEditor` y las opciones de `features/teams/options.tsx`), selector de movimiento y del campo, y el resultado en vivo (rango, % de PS, "KO en N golpes", probabilidad). Atajos: "cargar de mis equipos/rivales" y, desde un combate, "abrir en la calculadora" con los dos Pokémon activos.

### B. Replays guardados

- `ReplayRepository` sobre `FileJsonRepository` (`storage/replays/<id>.json`, clave `replay`, versión del fichero 1, sin `export`). Guarda `ReplayData` más un resumen (fecha, modo, jugadores, ganador, turnos, rival guardado si lo había).
- El servidor lo guarda al terminar cada combate (en `BattleRoom`, cuando hoy manda `battle:replay`). Una opción del servidor (`replaysDir`) para que los tests usen una carpeta temporal.
- Rutas `GET /api/replays` (resúmenes), `GET /api/replays/:id`, `DELETE /api/replays/:id`.
- **Web** `/replays`: lista (lista compartida) y visor `/replays/:id` que avanza turno a turno (anterior/siguiente/ir a turno) reconstruyendo `BattleView` y la narración desde el log. El replay ya terminado puede verse **omnisciente** (los dos equipos completos).

### C. Explicación del bot

- Añade a los agentes un método opcional `explain()` o haz que `choose` pueda devolver `{ choice, reasoning }` con las opciones valoradas (`PlannedOption`/`Candidate`: acción, puntuación, daño esperado, motivo corto en español). La decisión no cambia.
- El servidor guarda la explicación de cada turno del bot y la manda **solo cuando el turno ya se ha resuelto** (p. ej. en el `battle:update` siguiente, o bajo demanda con un mensaje `battle:explain` para un turno pasado).
- **Web**: en el log o en un panel plegable, "¿Por qué hizo esto el bot?" en cada turno resuelto.

## Tests mínimos

| Workspace | Tests |
|---|---|
| protocol | Ida y vuelta de los cuerpos de la calculadora, de los resúmenes de replay y del mensaje de explicación |
| server | `/api/calc` coincide con `estimateDamage` (y con el motor en un caso conocido); el replay se guarda al terminar en carpeta temporal y se lista, lee y borra; la explicación de un turno **no llega antes** de que se resuelva (como el test de información oculta) |
| bot | Con y sin explicación, misma decisión para la misma semilla; la explicación incluye la opción elegida |
| web | Calculadora (cambiar SP o el movimiento actualiza el resultado), visor de replays (avanzar y retroceder turnos) y el panel de explicación |

## Criterios de "hecho"

- [ ] Calcular en el navegador el daño de un set guardado contra otro con campo y Mega, con el mismo resultado que el bot.
- [ ] Terminar un combate, verlo en `/replays` tras reiniciar el servidor y recorrerlo turno a turno.
- [ ] Ver en un combate por qué el bot eligió su jugada en un turno ya resuelto, nunca antes.
- [ ] `npm run check` y la CI en verde. Guía nueva (`docs/guias/herramientas.md`) y ADR si cambia la forma de la explicación o del protocolo.

## Decisiones de producto para preguntar al usuario (con recomendación)

- **¿Dónde corre la calculadora?** Recomendación: en el servidor (`POST /api/calc`), para no añadir ≈1,6 MB de datos de la calculadora a la web.
- **¿Se guardan todos los replays automáticamente?** Recomendación: sí, al terminar cada combate (los rendidos también), con borrado desde la lista. Alternativa: solo los que el usuario marque.
- **¿Cuándo se ve la explicación del bot?** Recomendación: tras resolverse cada turno, en un panel plegable (y en el visor de replays). Alternativa: solo al terminar el combate.
- **¿El visor de replays muestra la información oculta?** Recomendación: sí (el combate ya terminó), con un interruptor "ver como jugador" que muestre solo la perspectiva p1.

## Al cerrar la fase

Sigue el **protocolo de cierre de fase** de [AGENTS.md](../../AGENTS.md): docs, CHANGELOG, el brief de la siguiente fase en `docs/fases/fase-9.md` (o, si no hay más fases planificadas, una propuesta de las ampliaciones "Futuro" de PLAN §8 para que el usuario elija), commit y push.

## Fuera de alcance de esta fase

Bot nivel 3, modo clásico IV/EV/Tera, PWA/móvil, PvP, rivales sacados de estadísticas de uso reales y E2E con Playwright.
