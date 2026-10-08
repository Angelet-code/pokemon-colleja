# Guía: bots, generador de equipos y arena

Cómo deciden los bots, cómo se miden y cómo se mejoran. Decisiones de arquitectura: [ADR-0004](../adr/0004-bot-por-simulacion.md) (nivel 2) y [ADR-0010](../adr/0010-bot-experto-con-sandbox.md) y [ADR-0011](../adr/0011-nivel-3-con-equipo-completo.md) (nivel 3). La API de combate (`BattleSession`, `BattleAgent`…) está en la [guía de combates](combate.md).

## Niveles

| Nivel | Clase | Cómo decide |
|---|---|---|
| 0 · Aleatorio | `RandomAgent` | Al azar entre las acciones legales (objetivos útiles en dobles, Mega a veces) |
| 1 · Agresivo | `AggressiveAgent` | En cada posición, el movimiento y objetivo con más daño esperado (+ bonus de KO). Prioridad si asegura el KO. Nunca golpea al aliado salvo que sea inmune. Mega en cuanto puede. Solo cambia si ningún movimiento hace nada |
| 2 · Táctico | `TacticalAgent` | Simula las consecuencias de cada opción con daño esperado (duelos en individuales, turnos 2 contra 2 en dobles) y elige la de mejor balance de PS. Vista previa por cobertura |
| 3 · Experto | `ExpertAgent` | El nivel 2 más un turno por adelantado con el **simulador real**: juega cada opción contra las respuestas probables del rival bajo varias suposiciones de sus sets y valora las posiciones resultantes (en individuales, también con los dos equipos enteros). En individuales elige los relevos por la cadena de equipo completo. Vista previa, la del nivel 2 |

```ts
import { BOT_LEVELS, createBot, DEFAULT_BOT_LEVEL } from '@colleja/bot';

const bot = createBot(3, { seed: 'partida-1' }); // misma semilla → mismas decisiones
BOT_LEVELS; // [{ level, name, description }] en español, para la UI
```

Todos los bots solo ven su `AgentContext` (su perspectiva). **No conocen los sets del rival** salvo con equipo abierto (decisión de producto del 2026-10-07).

## Piezas de `@colleja/bot`

| Módulo | Qué hace |
|---|---|
| `analysis/situation.ts` | `Situation`: todo lo que el bot sabe en una decisión. Sus Pokémon (petición + sets del equipo), los rivales (`BattleView` + modelo del rival), el campo y el daño cacheado |
| `analysis/combatant.ts` | `Combatant`: un Pokémon como lo razona el bot (set, PS absolutos, estado, cambios de características, objeto, habilidad, movimientos). Mega, velocidad efectiva |
| `analysis/damage.ts` | Traduce `Combatant` y campo a `@smogon/calc` (generación 0 = Champions, Stat Points en `evs`). Devuelve tiradas, media, probabilidad de KO y precisión |
| `analysis/opponent-model.ts` | Sets posibles de cada rival: sets estándar filtrados por lo revelado, del más ofensivo al menos. Con equipo abierto, el real |
| `analysis/evaluation.ts` | Valor de un golpe, víctimas de un movimiento, enfrentamientos simples (nivel 1) |
| `analysis/duel.ts` | Simulación de duelo 1 contra 1 y `chainValue` (si el nuestro cae, entra el siguiente) |
| `analysis/team-chain.ts` | `teamChainValue`: duelos encadenados de los dos equipos enteros (al caer uno, su lado saca su mejor respuesta al superviviente) hasta que un lado se queda sin nadie |
| `analysis/singles-plan.ts` | Opciones del nivel 2 en individuales, promediadas sobre los sets plausibles del rival. Valor fijo de trampas, pantallas y control de velocidad |
| `analysis/doubles-sim.ts` / `doubles-plan.ts` | Simulación 2 contra 2 y búsqueda de la mejor pareja de acciones |
| `analysis/team-selection.ts` | Vista previa por cobertura (el grupo que mejor responde a cada especie rival) |
| `analysis/move-knowledge.ts` | Para qué sirve cada movimiento de estado (Protección, mejoras, estados, recuperación, pantallas, trampas…) |
| `search/assumptions.ts` | Nivel 3: suposiciones completas de los sets rivales (vistos y no vistos) a partir del modelo del rival |
| `search/lineups.ts` | Nivel 3: alineaciones para la cadena (los tuyos vivos y los del rival según la suposición, en el combate real o en un fork) |
| `search/lookahead.ts` | Nivel 3: `searchMoves` (búsqueda a un turno con el sandbox), `SEARCH_SETTINGS` (esfuerzo y pesos por modo) y `recentSwitches` |

### Nivel 3: búsqueda con el simulador real

El motor pone en `AgentContext.sandbox` (solo al elegir movimientos) un `BattleSandbox`: `fork(suposición, semilla)` copia la posición real **sin información oculta** (sets del rival sustituidos por los supuestos, PS del rival en el % visible, generador aleatorio nuevo, duración del sueño sorteada otra vez) y `clone(semilla)` copia un fork. El bot nunca toca `engine`: solo usa esa interfaz de `core`.

Para cada suposición (`assumptions`), `searchMoves`:

1. obtiene las respuestas probables del rival: el nivel 2 jugando su lado en el fork, sus `rivalReplies` mejores opciones con pesos softmax (`replyTemperature`);
2. juega `turns` turnos por cada opción propia (las `ownOptions` mejores del nivel 2), cada uno contra una respuesta muestreada de forma estratificada por esos pesos. Con la misma semilla para todas las opciones y **suerte común por acción** (cada acción saca sus números de su propio flujo), las opciones se comparan con la misma suerte del rival;
3. valora cada posición resultante, tras los relevos forzosos (del nivel 2): balance de PS × 100 más `positionWeight` × el cambio que el nivel 2 espera desde ahí (su mejor puntuación menos la que tendría si no pasara nada: `singlesBaseline`/`doublesBaseline`) y, en individuales, `chainWeight` × lo que la **cadena de equipo completo** (`teamChainValue`, con los banquillos de los dos lados en el fork) cambia ese balance; ±200 si el combate acaba.

Elige la media más alta, restando `loopPenalty` a las opciones con un cambio por cada cambio voluntario propio de los últimos 4 turnos (sin esto, dos bots pueden cambiar de Pokémon en bucle para siempre). En individuales, los **relevos forzosos** son para el Pokémon cuya cadena de equipo completo acaba mejor contra las suposiciones del rival. Sin sandbox (otra perspectiva o la vista previa) juega como el nivel 2. El esfuerzo es fijo, nunca por reloj, para que sea reproducible.

Lo que limita al nivel 3 es, sobre todo, la **información oculta**: con equipo abierto la misma configuración gana al nivel 2 un 70,7 % en individuales, frente a un 63–64 % con equipo cerrado (CHANGELOG de la fase 10). Más muestras (`turns`, `assumptions`) ya no ayudan.

### Qué modela la simulación (nivel 2)

- Orden por prioridad y velocidad (Viento Afín, Espacio Raro, parálisis, Pañuelo Elección, habilidades de clima).
- Daño esperado (media de tiradas × precisión), retroceso y drenaje, Vida Esfera, Restos, quemadura/veneno.
- Estados infligidos (quemadura, parálisis, sueño con cláusula de sueño), mejoras de características, recuperación, Descanso.
- Protección (y que falla si se repite), Sorpresa (solo el primer turno en el campo), bloqueo de los objetos Elección, movimientos de dos turnos y de recarga.
- Dobles: Refuerzo, Señuelo/Polvo Ira, pantallas, ataques en área (y el daño al aliado), objetivo que ya cayó.
- **No** modela: cambios del rival, críticos, efectos secundarios probabilísticos, volátiles (Sustituto, Mofa, Otra Vez…).

## Generador de equipos (`@colleja/teamgen`)

```ts
import { generateTeam } from '@colleja/teamgen';

generateTeam('doubles', { seed: 'x' }); // 6 sets estándar legales, deterministas por semilla
```

- Cláusula de especie (por número de Pokédex) y de objeto.
- **Como mucho una megapiedra** (decisión de producto del 2026-10-07; `maxMegaStones` para cambiarlo).
- Como mucho 3 miembros débiles al mismo tipo (`maxSharedWeakness`).
- Apto para navegador. El test genera cientos de equipos y los valida con `checkTeam` y con el validador de Showdown.

## Arena (`npm run arena`)

```bash
npm run arena -- --a 2 --b 0 --battles 500
```

```bash
npm run arena -- --a 2 --b 1 --mode doubles --battles 300 --seed otra
```

| Opción | Qué hace |
|---|---|
| `--a <0\|1\|2\|3>` / `--b <0\|1\|2\|3>` | Niveles de los bots. Se informa del % de victorias de A (por defecto 2 contra 0) |
| `--mode singles\|doubles\|both` | Por defecto, ambos |
| `--battles N` | Combates por modo (por defecto 100). Cada par de equipos se juega dos veces cambiando qué bot lleva cuál |
| `--seed X` | Semilla base: mismos parámetros, mismos combates |
| `--no-preview`, `--open-team-sheets` | Opciones de práctica |

Muestra el % de victorias con su intervalo de confianza del 95 % (Wilson), los turnos medios, los ms por combate y por decisión, y las elecciones inválidas (deben ser 0). Los combates que fallen se guardan en `storage/arena/` como replays (`BattleSession.fromReplay`). La lógica está en `runArena()` (`tools/arena/src/arena.ts`).

Resultados de referencia (fases 4, 9 y 10): en el [CHANGELOG](../../CHANGELOG.md). El nivel 3 tarda unas décimas de segundo por decisión: para medirlo con cientos de combates conviene lanzar varios arenas en paralelo con semillas distintas. Con 600 combates el ruido es de ±2 puntos (IC 95 % ≈ ±4): compara variantes con la misma semilla y confirma lo prometedor con otra semilla antes de quedártelo.

## Cómo mejorar un bot

1. Reproduce el problema: un combate concreto del arena (semilla) o un escenario guionizado (`packages/bot/test/helpers.ts`: `scenario(modo, líderes p1, líderes p2)` crea un combate sin vista previa con esos Pokémon en cabeza).
2. Mira las opciones y sus valores: `planSingles(situation, slot)` devuelve cada acción con su puntuación; `DoublesSim.evaluate(situation, planes)` valora una pareja. `new Situation(session.getAgentContext('p1'))` da la situación de un turno.
3. Corrige el **modelo** (un efecto que falta en la simulación, un dato mal leído), no añadas pesos sueltos. En el nivel 3, su `explain()` da el valor medio de cada opción tras la búsqueda; compáralo con el del nivel 2 en la misma posición.
4. Mide con el arena contra el nivel anterior: al menos 300 combates por modo (±5 %) y, para cifras finales, 1000.

## Explicación de las decisiones

Cada nivel implementa `explain()` (de `BattleAgent`): devuelve la explicación de su última decisión con el método de valoración (`EXPLANATION_METHODS`) y sus mejores opciones con la puntuación. Se construye **bajo demanda** a partir de lo que el bot ya calculó, sin usar el generador aleatorio, así que nunca cambia la decisión (lo comprueba `test/explain.test.ts`). El servidor la enseña al jugador tras resolverse cada turno y oculta lo que aún no ha visto ([guía de herramientas](herramientas.md)).

## Tests

| Fichero | Qué cubre |
|---|---|
| `packages/bot/test/calc.test.ts` | Stats de la calculadora = `championsStats` en todos los sets estándar (y sus Megas). Daño estimado dentro del real en primeros golpes de combates del motor (≥ 90 %) |
| `packages/bot/test/opponent-model.test.ts` | Filtrado de sets por lo revelado, orden pesimista, equipo abierto, especies sin sets |
| `packages/bot/test/levels.test.ts` | Registro de niveles. Escenarios: elige el KO, no golpea al aliado con Terremoto, el nivel 2 cambia a un Pokémon que gana el duelo. Fuzz: 100 combates por modo nivel 1 contra 2 sin elecciones inválidas |
| `packages/bot/test/expert.test.ts` | Nivel 3: KO evidente, sin sandbox = nivel 2, **misma decisión y explicación aunque cambie lo que oculta el rival**, determinismo, combates contra el nivel 2 sin elecciones inválidas |
| `packages/bot/test/team-chain.test.ts` | `teamChainValue` cuenta los banquillos de los dos lados; `recentSwitches` cuenta solo los cambios voluntarios |
| `packages/engine/test/sandbox.test.ts` | El sandbox: solo al elegir movimientos, sustituye los sets vistos y no vistos, PS al % visible, reproducible, no toca el combate real, rechaza posiciones viejas |
| `packages/bot/test/random-agent.test.ts` | Fuzz del nivel 0 |
| `packages/teamgen/test/teamgen.test.ts` | Equipos legales (300 semillas por modo), cláusulas, megapiedras, determinismo |
| `tools/arena/test/arena.test.ts` | `runArena` cuenta bien y es reproducible. Prueba corta de fuerza: el nivel 2 gana ≥ 75 % al 0 en 40 combates por modo |

Fuzz más largo: `BOT_FUZZ_BATTLES=1000 npx vitest run packages/bot`.
