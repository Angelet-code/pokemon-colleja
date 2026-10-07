# Guía: bots, generador de equipos y arena

Cómo deciden los bots, cómo se miden y cómo se mejoran. Decisión de arquitectura: [ADR-0004](../adr/0004-bot-por-simulacion.md). La API de combate (`BattleSession`, `BattleAgent`…) está en la [guía de combates](combate.md).

## Niveles

| Nivel | Clase | Cómo decide |
|---|---|---|
| 0 · Aleatorio | `RandomAgent` | Al azar entre las acciones legales (objetivos útiles en dobles, Mega a veces) |
| 1 · Agresivo | `AggressiveAgent` | En cada posición, el movimiento y objetivo con más daño esperado (+ bonus de KO). Prioridad si asegura el KO. Nunca golpea al aliado salvo que sea inmune. Mega en cuanto puede. Solo cambia si ningún movimiento hace nada |
| 2 · Táctico | `TacticalAgent` | Simula las consecuencias de cada opción con daño esperado (duelos en individuales, turnos 2 contra 2 en dobles) y elige la de mejor balance de PS. Vista previa por cobertura |

```ts
import { BOT_LEVELS, createBot, DEFAULT_BOT_LEVEL } from '@colleja/bot';

const bot = createBot(2, { seed: 'partida-1' }); // misma semilla → mismas decisiones
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
| `analysis/singles-plan.ts` | Opciones del nivel 2 en individuales, promediadas sobre los sets plausibles del rival. Valor fijo de trampas, pantallas y control de velocidad |
| `analysis/doubles-sim.ts` / `doubles-plan.ts` | Simulación 2 contra 2 y búsqueda de la mejor pareja de acciones |
| `analysis/team-selection.ts` | Vista previa por cobertura (el grupo que mejor responde a cada especie rival) |
| `analysis/move-knowledge.ts` | Para qué sirve cada movimiento de estado (Protección, mejoras, estados, recuperación, pantallas, trampas…) |

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
| `--a <0\|1\|2>` / `--b <0\|1\|2>` | Niveles de los bots. Se informa del % de victorias de A (por defecto 2 contra 0) |
| `--mode singles\|doubles\|both` | Por defecto, ambos |
| `--battles N` | Combates por modo (por defecto 100). Cada par de equipos se juega dos veces cambiando qué bot lleva cuál |
| `--seed X` | Semilla base: mismos parámetros, mismos combates |
| `--no-preview`, `--open-team-sheets` | Opciones de práctica |

Muestra el % de victorias con su intervalo de confianza del 95 % (Wilson), los turnos medios, los ms por combate y por decisión, y las elecciones inválidas (deben ser 0). Los combates que fallen se guardan en `storage/arena/` como replays (`BattleSession.fromReplay`). La lógica está en `runArena()` (`tools/arena/src/arena.ts`).

Resultados de referencia al cerrar la fase 4: en el [CHANGELOG](../../CHANGELOG.md).

## Cómo mejorar un bot

1. Reproduce el problema: un combate concreto del arena (semilla) o un escenario guionizado (`packages/bot/test/helpers.ts`: `scenario(modo, líderes p1, líderes p2)` crea un combate sin vista previa con esos Pokémon en cabeza).
2. Mira las opciones y sus valores: `planSingles(situation, slot)` devuelve cada acción con su puntuación; `DoublesSim.evaluate(situation, planes)` valora una pareja. `new Situation(session.getAgentContext('p1'))` da la situación de un turno.
3. Corrige el **modelo** (un efecto que falta en la simulación, un dato mal leído), no añadas pesos sueltos.
4. Mide con el arena contra el nivel anterior: al menos 300 combates por modo (±5 %) y, para cifras finales, 1000.

## Tests

| Fichero | Qué cubre |
|---|---|
| `packages/bot/test/calc.test.ts` | Stats de la calculadora = `championsStats` en todos los sets estándar (y sus Megas). Daño estimado dentro del real en primeros golpes de combates del motor (≥ 90 %) |
| `packages/bot/test/opponent-model.test.ts` | Filtrado de sets por lo revelado, orden pesimista, equipo abierto, especies sin sets |
| `packages/bot/test/levels.test.ts` | Registro de niveles. Escenarios: elige el KO, no golpea al aliado con Terremoto, el nivel 2 cambia a un Pokémon que gana el duelo. Fuzz: 100 combates por modo nivel 1 contra 2 sin elecciones inválidas |
| `packages/bot/test/random-agent.test.ts` | Fuzz del nivel 0 |
| `packages/teamgen/test/teamgen.test.ts` | Equipos legales (300 semillas por modo), cláusulas, megapiedras, determinismo |
| `tools/arena/test/arena.test.ts` | `runArena` cuenta bien y es reproducible. Prueba corta de fuerza: el nivel 2 gana ≥ 75 % al 0 en 40 combates por modo |

Fuzz más largo: `BOT_FUZZ_BATTLES=1000 npx vitest run packages/bot`.
