# Fase 3 — Dominio + motor + primer combate jugable (CLI)

> **Brief de traspaso.** Escrito al cerrar la fase 2 (2026-10-07) para que una sesión nueva pueda empezar sin contexto previo.
> Lee antes [AGENTS.md](../../AGENTS.md) (reglas y comandos) y [PLAN.md](../PLAN.md) §3, que describe la arquitectura objetivo.
> Las decisiones de diseño aquí son **recomendaciones**: si al implementar encuentras algo mejor, adelante, pero documenta la decisión en un ADR.

## Objetivo

Jugar el **primer combate completo en la terminal**: el usuario contra un bot aleatorio, en individuales y en dobles de Champions. Para ello hay que construir antes, de forma limpia y reutilizable, las dos piezas que usarán la UI (fase 5) y el bot (fase 4):

1. **`packages/core`** (`@colleja/core`): dominio puro, apto para navegador.
2. **`packages/engine`** (`@colleja/engine`): adaptador de Showdown y sesiones de combate (solo Node).
3. **`tools/cli`**: combate interactivo en la terminal.

## Punto de partida (ya hecho)

| Pieza | Qué ofrece |
|---|---|
| `@colleja/showdown` | Puente tipado al sim de Showdown: `Battle`, `BattleStream`, `getPlayerStreams`, `Teams`, `TeamValidator`, `Dex`, `PRNG`, `RandomPlayerAI`, `CHAMPIONS_FORMATS` |
| `@colleja/data` | Datos de Champions en el navegador: `getSpecies`, `getLearnset`, `canLearn`, `getNature`, `getFormat(mode)`, `getStandardSets`, `getName(kind, id, 'es')`… |
| `tools/smoke` | `runHeadlessBattle()`: un combate bot contra bot por streams. Es un buen ejemplo de cómo se conectan los streams |
| `tools/smoke/fixtures/equipo-{a,b}.txt` | Dos equipos legales en formato export (sirven como equipos por defecto del CLI) |

## Hechos verificados sobre el motor (no los redescubras)

- **`BattleStream` no valida los equipos.** Hay que pasar antes `TeamValidator.get(formatid).validateTeam(sets)`, que además normaliza el nivel a 50 (`Adjust Level`). Sin esa validación, un set sin `Level` juega a nivel 100.
- **Siempre hay elección de equipo.** Con `pickedTeamSize` (3 en BSS, 4 en VGC) el motor manda una petición de elegir equipo **aunque se quite la regla `Team Preview`**: cada jugador solo ve el suyo. Para la opción de práctica "sin vista previa", lo que hay que hacer es **responder automáticamente** con el orden por defecto (`team 1234`) en lugar de tocar reglas.
- **Reglas personalizadas**: `formatid@@@regla1,!regla2`. Ejemplo que funciona: `gen9championsvgc2026regmc@@@!Team Preview,!Open Team Sheets`. En VGC, quitar `Team Preview` obliga a quitar también `Open Team Sheets`; si no, lanza un error.
- La regla `Open Team Sheets` del formato VGC emite `|uhtml|otsrequest|…` con botones. Es una función del servidor de Showdown y aquí no hace nada útil. La opción "ver equipo rival" la implementamos nosotros, mandando los sets del rival a la UI. Recomendación: quitarla con `@@@!Open Team Sheets`.
- Los temporizadores (`VGC Timer`) son del servidor de Showdown; el sim no los aplica. Si algún día hay temporizador, será nuestro (fase 8).
- **`battle.inputLog`** guarda todo lo necesario para reproducir el combate:
  ```
  >start {"formatid":"gen9championsbssregmc","seed":"sodium,…"}
  >player p1 {"name":"A","team":"<packed>"}
  >player p2 {…}
  >p1 team 1, 2, 3          ← las elecciones quedan normalizadas
  >p2 team 2, 1, 3
  >p1 move fakeout
  >p2 move shadowball
  ```
  Misma semilla + mismas entradas = el mismo combate (hay un test en `tools/smoke`). **Rebobinar** = crear un `Battle`/`BattleStream` nuevo y reaplicar el prefijo del `inputLog` hasta el inicio del turno deseado.
- `Battle.toJSON()` / `Battle.fromJSON()` funcionan con el mod Champions; los usará el bot en la fase 4 para mirar jugadas por delante.
- **Sintaxis de las elecciones**:
  - `move 1`, `move 1 mega`, `switch 3`, `team 1234`.
  - En dobles se separan con coma: `move 1 +2, move 3 -1`. `+N` es un rival y `-N` un aliado.
  - Si una elección no es válida, el jugador recibe `|error|[Invalid choice] …` y una nueva petición.
- **Peticiones** (`|request|{json}` en el stream de cada jugador): `{ active?, side, forceSwitch?, teamPreview?, maxChosenTeamSize?, wait? }`.
- En la perspectiva de p1, los PS del rival llegan como `x/100`, mientras que los propios llegan exactos. Champions muestra el porcentaje del rival redondeado hacia abajo; ojo con el redondeo si se quiere replicar exacto.
- **Stat Points**: `PS = Base + SP + 75`; el resto `floor((Base + SP + 20) × naturaleza)`. Showdown guarda los SP en `set.evs`. Ejemplo comprobado contra el motor, Garchomp Jolly `2 HP / 32 Atk / 32 Spe`: PS 185 · Atk 182 · Def 115 · SpA 90 · SpD 105 · Spe 169.

## Diseño recomendado

### A. `packages/core` (`@colleja/core`): sin Node y sin Showdown, solo depende de `@colleja/data`

- **Tipos de dominio**:
  - `PokemonSet`: especie, mote, objeto, habilidad, naturaleza, `statPoints`, movimientos y género.
  - `Team`: id, nombre, modo y miembros.
  - `GameMode`, `RulesetId` (`'champions-regmc'`), `SideId`.
  - `BattleOptions`: vista previa, equipo abierto y semilla.
  - **Elecciones tipadas** (`Choice`): movimiento con objetivo y Mega, cambio y orden de equipo, con su serializador al texto de Showdown.
  - Partir del borrador de PLAN §3.5.
- **Stats**: interfaz `StatCalculator` con la implementación `championsStats(set)`. Es una estrategia por reglamento, para que el modo clásico IV/EV se pueda añadir después.
- **Stat Points**: helpers de límites (32 por stat y 66 en total, leídos de `getFormat(mode).statPoints`) y de puntos restantes.
- **Import/export en formato Showdown**: `parseShowdownTeam(text)` → `{ sets, problems }` y `formatShowdownTeam(sets)`.
  - Tiene que ir en core porque el teambuilder web importará texto pegado.
  - Recomendación: un parser propio y pequeño, con ids vía `toId` y la línea `EVs:` como Stat Points.
  - Tests de ida y vuelta, y contraste con `Teams.import/export` de Showdown en los tests de engine.
- **Validación rápida en cliente**: 6 miembros, Species Clause, Item Clause, movimientos aprendibles (`canLearn`) y habilidad válida. Sirve para dar feedback inmediato en la UI; la validación **autoritativa** es la del engine.

### B. `packages/engine` (`@colleja/engine`): solo Node, depende de core + showdown

- **Conversión `PokemonSet` ↔ set de Showdown**: único sitio donde se mezclan los dos modelos.
- **`validateTeam(team, mode)`**: usa `TeamValidator` y devuelve `{ ok, problems, normalized }`. Se ejecuta **siempre** antes de crear un combate.
- **Mapeo de formatos**: (`mode`, `ruleset`, opciones) → formatid de Showdown, con sus reglas `@@@`. Está centralizado aquí.
- **`BattleEngine.create(config)` → `BattleSession`**:
  - Eventos: líneas de protocolo **por perspectiva** (p1 / p2 / omnisciente) y peticiones.
  - `choose(side, choice)` comprueba la elección contra la petición actual antes de enviarla y gestiona `[Invalid choice]` sin romperse.
  - `rewindTo(turn)`: guarda el índice de `inputLog` al inicio de cada turno y reconstruye la sesión.
  - `exportReplay()`: semilla, equipos, `inputLog` y log omnisciente. Así se puede reproducir.
  - `dispose()`.
- **Agentes**: interfaz `BattleAgent` (recibe la petición y lo que ve su lado y devuelve una elección) para conectar al rival.
  - Recomendación: crear ya `packages/bot` con el **nivel 0, aleatorio** (port tipado de la lógica de `RandomPlayerAI`: vista previa, cambios forzados, objetivos en dobles y Mega). Así el CLI no depende de la clase de Showdown y la fase 4 solo añade los niveles 1 y 2.
  - Alternativa más corta: envolver `RandomPlayerAI` de `@colleja/showdown`.

### C. `tools/cli`: `npm run play`

- **Opciones**: `--mode singles|doubles`, `--team <export.txt>` (por defecto `equipo-a`), `--opponent-team <export.txt>` (por defecto `equipo-b`, porque generar equipos aleatorios es de la fase 4), `--seed <texto>`, `--no-preview`, `--auto` (bot contra bot, no interactivo: sirve para los tests).
- **Pantalla**:
  - Turno y estado del campo (clima, campo, pantallas, Espacio Raro, Viento Afín).
  - Activos propios con PS exactos, estado y movimientos con PP.
  - Activos rivales con PS en %.
  - Log del turno **en español**, con los nombres de `getName(…, 'es')` y un formateador propio mínimo: movimientos, daño, debilitado, cambios, estados, clima, Mega, ganador. El log completo con las plantillas de Showdown en español (`data/text/es/default.ts`) es de la fase 5.
- **Entrada**: menús numerados con `node:readline`.
  - Vista previa: elegir 3 o 4 y el orden.
  - Movimiento, objetivo (dobles) y Mega.
  - Cambio, también los cambios forzados.
- **Comandos extra**: `deshacer` (rebobina un turno), `rebobinar N`, `exportar` (guarda el replay JSON en `storage/replays/`), `salir`.

## Tests mínimos

| Workspace | Tests |
|---|---|
| core | Stats con Stat Points (tabla de casos con naturalezas positivas, negativas y neutras). Límites de SP. Ida y vuelta de import/export con los fixtures. Cláusulas de equipo. Serialización de elecciones en individuales y dobles |
| engine | **Stats de core = stats del motor** para una muestra amplia de sets estándar (`listStandardSets`). `validateTeam` con equipos válidos e inválidos. Mapeo de formatos. Combate completo con dos agentes aleatorios en cada modo. Determinismo. **Rebobinado**: jugar N turnos, volver al turno k, reaplicar las mismas elecciones y obtener el mismo log |
| bot | Nivel 0: nunca manda una elección inválida (fuzz de cientos de combates en ambos modos) |
| cli | `--auto` termina un combate en cada modo sin errores |

## Criterios de "hecho"

- [ ] `npm run play` permite jugar un combate completo, de individuales y de dobles, contra el bot aleatorio.
- [ ] Misma semilla + mismas entradas → el mismo log (test).
- [ ] `deshacer` / `rebobinar N` funcionan (test).
- [ ] Los stats de core coinciden con los del motor (test).
- [ ] `npm run check` en verde: añade `npm run play -- --auto` al script `check` o un test equivalente.

## Al cerrar la fase

Sigue el **protocolo de cierre de fase** de [AGENTS.md](../../AGENTS.md): docs, CHANGELOG, el brief de la fase 4 en `docs/fases/fase-4.md`, commit y push.

## Fuera de alcance de esta fase

UI web, servidor HTTP/WebSocket, bots de nivel 1 y 2, generador de equipos aleatorios, teambuilder y calculadora de daño. Todo eso va en las fases 4 a 8 de PLAN §8.
