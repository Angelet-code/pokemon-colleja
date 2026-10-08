# Fase 9 — Bot nivel 3 "Experto" (lookahead con el simulador real)

> **Brief.** El usuario eligió la opción A de la propuesta de ampliaciones (2026-10-08). Este brief sustituye a la propuesta; las demás opciones (modo clásico, PWA, rivales por uso, pulido) siguen en la propuesta de la fase 10.
> Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md), el [ADR-0004](../adr/0004-bot-por-simulacion.md) (nivel 2 por simulación) y el [ADR-0003](../adr/0003-sesion-de-combate.md) (sesión de combate).

## Objetivo

Un rival más fuerte que el nivel 2: el **nivel 3 "Experto"**, que juega cada turno por adelantado con el simulador real (Showdown) antes de decidir.

## Decisiones del usuario (2026-10-08)

- Si el nivel 3 cumple, **pasa a ser el rival por defecto** (coherente con "el rival por defecto es el nivel más alto").
- Puede pensar **hasta ~3 s por decisión**; además debe pensar **mientras el jugador elige** (hoy el servidor hace pensar al bot antes de enseñar el turno).
- Si no llega al 60 % contra el nivel 2: **averiguar qué falla y mejorarlo**, no publicarlo a medias.

## Punto de partida (ya hecho)

| Pieza | Qué ofrece |
|---|---|
| `@colleja/bot` | Nivel 2 (`TacticalAgent`): `planSingles`/`planDoubles` valoran cada opción con daño esperado; `OpponentModel` filtra los sets estándar por lo revelado; `explain()` |
| `@colleja/engine` | `BattleSession` sobre el `Battle` síncrono de Showdown; `getAgentContext(side)` da a cada bot solo su perspectiva |
| `tools/arena` | Torneos bot contra bot con equipos aleatorios, reproducibles por semilla |

## Hechos verificados (no los redescubras)

- `Battle.toJSON()` ≈ 0,2 ms y `Battle.fromJSON()` ≈ 0,5 ms (posición de 3 contra 3); clonar y jugar un turno ≈ 1,5 ms.
- Tras la vista previa, `side.pokemon` de Showdown solo tiene los Pokémon traídos (3 o 4). Los sets ya validados llevan `level: 50`.
- `deserializeBattle` crea el `Battle` a partir de `pokemon[i].set` y luego sobrescribe con los campos serializados: si se borran del JSON los campos derivados del set (stats, movimientos, objeto, PS…), se quedan los del set nuevo.
- El JSON del combate contiene `inputLog` (con los dos equipos completos empaquetados) y la elección ya hecha por el rival en el turno: hay que quitarlos.
- El sueño de Champions dura `sample([2, 3, 3])` turnos (`statusState.startTime`/`time`): es información oculta.
- Un solo resultado aleatorio por hoja da un ruido de ±30–50 puntos por opción, mayor que las diferencias entre opciones: con eso el nivel 3 no supera al 2 en individuales (48,6 %).

## Diseño

1. **Sandbox en `engine`** (`sandbox.ts`), con su interfaz en `core` (`BattleSandbox`, `SandboxBattle`, `RivalAssumption`): `AgentContext.sandbox` solo existe al elegir movimientos. `fork(suposición, semilla)` parte de la posición real y quita todo lo oculto: sets del rival (los vistos, por nombre; los no vistos, enteros), PS del rival al % que ve el jugador, generador aleatorio nuevo, duración del sueño, elecciones ya hechas e `inputLog`. `clone(semilla)` copia una posición.
2. **Suerte común por acción**: en un fork cada acción del turno saca sus números de un flujo propio (semilla + turno + quién actúa), así todas las opciones propias se comparan con la misma suerte del rival.
3. **Nivel 3 en `bot`** (`ExpertAgent` + `search/`): apto para navegador, solo usa la interfaz. Para unas pocas suposiciones de los sets rivales (`rivalAssumptions`), forka la posición, calcula las respuestas probables del rival (el nivel 2 jugando su lado, con pesos softmax) y juega el turno contra ellas. Cada posición resultante vale el balance de PS más la estimación del nivel 2 de cómo sigue. Sin sandbox juega como el nivel 2. Vista previa y relevos: los del nivel 2.
   La posición resultante vale el balance de PS más 0,5 × el **cambio** que espera el nivel 2 desde ahí (su puntuación menos la que tendría sin cambios); ver el ADR.
4. **Servidor**: cuando el jugador y el bot eligen a la vez, la sala manda primero el turno al jugador y después piensa el bot.
5. Caché por contenido de `estimateDamage` (función pura): las hojas repiten los mismos cálculos.

## Tests

| Workspace | Tests |
|---|---|
| engine | El sandbox solo existe al elegir movimientos; sustituye sets vistos y no vistos; PS al % visible; reproducible y sin tocar el combate real; olvida la elección del rival; rechaza posiciones viejas |
| bot | Nivel 3 registrado y KO evidente; sin sandbox = nivel 2; **misma decisión y explicación aunque cambie lo que el rival oculta**; determinista; sin elecciones inválidas contra el nivel 2; explicación sin cambiar decisiones |
| server | El jugador recibe el turno antes de que el bot piense; `/api/meta` con el nivel 3 |

## Criterios de "hecho"

- [x] Nivel 3 ≥ 60 % contra el nivel 2 en ≥ 300 combates por modo (arena), sin elecciones inválidas: **61,8 %** en individuales (602) y **78,6 %** en dobles (308).
- [x] ≤ ~3 s por decisión: media 0,3–0,4 s, máximo ≈ 1 s.
- [x] Sin información oculta en los forks (test de invariancia).
- [x] Nivel 3 por defecto en servidor, CLI y web; selectores con el nivel 3.
- [x] ADR-0010, guía del bot, CHANGELOG, PLAN, AGENTS y README al día; brief de la fase 10.

## Fuera de alcance

- Búsqueda a más de un turno o MCTS completo.
- Modelar la vista previa o los relevos con el simulador (siguen siendo los del nivel 2).
- Pensar en un hilo aparte (el bot sigue siendo síncrono; ver riesgos en el ADR).
