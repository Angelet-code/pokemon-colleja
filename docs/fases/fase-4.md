# Fase 4 — Bot (niveles 1 y 2), generador de equipos y arena

> **Brief de traspaso.** Escrito al cerrar la fase 3 (2026-10-07) para que una sesión nueva pueda empezar sin contexto previo.
> Lee antes [AGENTS.md](../../AGENTS.md) (reglas y comandos), [PLAN.md](../PLAN.md) §6 (bot) y la [guía de combates](../guias/combate.md), que explica la API de `core`/`engine`/`bot` que ya existe.
> Las decisiones de diseño aquí son **recomendaciones**: si al implementar encuentras algo mejor, adelante, pero documenta la decisión en un ADR.

## Objetivo

Que el bot sea un rival útil para practicar y poder medirlo:

1. **`packages/teamgen`** (`@colleja/teamgen`): equipos aleatorios legales a partir de los sets estándar.
2. **Bot nivel 1 (agresivo)** y **nivel 2 (táctico)** en `@colleja/bot`, con elección de vista previa propia.
3. **`tools/arena`**: torneos bot contra bot con métricas (porcentaje de victorias, turnos, elecciones inválidas, tiempos).
4. El CLI usa los nuevos niveles y los equipos aleatorios.

## Punto de partida (ya hecho)

| Pieza | Qué ofrece |
|---|---|
| `@colleja/core` | `BattleAgent`/`AgentContext` (petición, log de su perspectiva, su equipo y, con equipo abierto, el del rival), `Choice` y `formatChoice`, `getSlotOptions` (movimientos con objetivos válidos, cambios, Mega por posición), `validateChoice`, `BattleView` (estado desde el protocolo), `championsStats`, `checkTeam`, `SeededRandom` |
| `@colleja/engine` | `BattleSession` (síncrona), `playOut(session, agents, { maxRetries, onChoice })`, `validateTeam`, `exportReplay`/`fromReplay` |
| `@colleja/bot` | `RandomAgent` (nivel 0): port tipado de `RandomPlayerAI`, determinista por semilla |
| `@colleja/data` | `listStandardSets(mode)`, `getStandardSets(species, mode)` (≈490 sets en individuales, ≈460 en dobles, todos legales), `getTypeEffectiveness`, `getSpecies`, `getMove`… |
| `packages/bot/test/random-agent.test.ts` | `randomTeam()`: generador mínimo de equipos (cláusulas de especie y objeto + `validateTeam`). **Muévelo a `teamgen`** |
| `tools/cli` | `npm run play` con `RandomAgent` como rival y equipos de `tools/smoke/fixtures/` |

## Hechos verificados (no los redescubras)

- **`@smogon/calc` 0.12.0** (npm, MIT, 2026-09-18) **soporta Champions como "generación 0"**:
  ```ts
  import { calculate, Generations, Move, Pokemon } from '@smogon/calc';
  const gen = Generations.get(0);
  const garchomp = new Pokemon(gen, 'Garchomp', { nature: 'Jolly', evs: { hp: 2, atk: 32, spe: 32 }, level: 50, item: 'Life Orb' });
  // garchomp.stats → { hp: 185, atk: 182, def: 115, spa: 90, spd: 105, spe: 169 } (= championsStats)
  calculate(gen, garchomp, incineroar, new Move(gen, 'Earthquake')).range(); // [213, 252]
  ```
  - Los **Stat Points se pasan en `evs`** (usa la fórmula de Champions: `calcStatChampions`).
  - Tiene mecánicas propias de Champions (`mechanics/champions.js`) y conoce las Megas de M-C (Dragonite-Mega, Meganium-Mega, Floette-Mega…).
  - **No verificado**: que sus datos estén al día con nuestro commit de Showdown. Hazle un test de contraste (ver Tests).
  - Funciona en el navegador, así que el bot puede seguir dependiendo solo de `core` + `data` + calc.
- **Rendimiento**: un combate entre dos `RandomAgent` tarda ≈40 ms (200 combates en ≈8 s; 2000 en ≈15 s con Vitest). 500 combates por modo con bots que calculan daño deberían caber en uno o dos minutos: el arena completo **no** va en `npm run check`, una versión corta sí.
- **`[Unavailable choice]` es legítimo**: aparece al intentar cambiar con un Pokémon atrapado por una habilidad rival aún no revelada (Shadow Tag, Arena Trap…). Showdown manda una petición nueva y `playOut` reintenta (`maxRetries`). Solo `[Invalid choice]` es un bug del bot.
- **Lo que ve un bot** (`AgentContext`):
  - De sí mismo, todo: la petición trae stats calculados (sin PS), movimientos con PP, objeto, habilidad y el estado de cada miembro (`condition`). `context.team` tiene los sets completos.
  - Del rival, solo lo de su perspectiva: `BattleView.from(context.log)` da especie actual (incluida la Mega), PS en **%** (`maxhp` = 100), estado, cambios de características, objeto/habilidad/movimientos revelados, campo (clima, terreno, Espacio Raro…) y condiciones de cada lado (pantallas, Viento Afín, trampas). Con vista previa, `sides[rival].preview` tiene las 6 especies.
  - `BattleView` **no** sigue aún volátiles (Sustituto, Protección, confusión, bloqueo de objeto elegido, Mofa…), PP del rival ni turnos restantes de clima/campos. Si un nivel lo necesita, amplíalo en `core` con tests.
- Con equipo abierto (`openTeamSheets`), `context.opponentTeam` trae los sets del rival tal cual: el bot puede usarlos sin adivinar.
- `Battle.toJSON()`/`fromJSON()` funcionan con el mod Champions (verificado en la fase 2). Solo harán falta para el nivel 3 (futuro, lookahead): fuera de alcance aquí.
- Determinismo: si el bot usa `SeededRandom` con semilla, misma semilla de combate + mismas semillas de bot = mismo combate. El arena debe derivar todas las semillas de una semilla base (como `tools/smoke/src/seeds.ts`).

## Diseño recomendado

### A. `packages/teamgen` (`@colleja/teamgen`): apto para navegador, depende de `core` + `data`

- `generateTeam(mode, { seed, size? })` → `PokemonSet[]` de 6, a partir de `listStandardSets(mode)`:
  - Cláusula de especie (por número de Pokédex) y de objeto.
  - Como mucho **una o dos megapiedras** por equipo (la Mega solo se puede usar una vez por combate). Pregunta al usuario cuál prefiere; recomendación: una.
  - Un poco de coherencia opcional (no todo el equipo débil al mismo tipo) si sale barato; si no, aleatorio puro.
- Test: cientos de semillas → `checkTeam` vacío y `validateTeam` (engine, dependencia de desarrollo) ok en ambos modos. Determinista por semilla.

### B. Niveles del bot en `@colleja/bot`

Infraestructura compartida (módulos pequeños y testeables):

- **Conocimiento del rival** (`opponent-model.ts`): para cada rival visto, el set probable. Con equipo abierto, el set real. Si no, los sets estándar de esa especie (`getStandardSets`) filtrados por lo ya revelado (objeto, habilidad, movimientos, Mega). Ojo: los sets estándar se guardan bajo la especie base (`charizard` con `mega: 'charizardmegay'`).
- **Estimador de daño** (`damage.ts`): envuelve `@smogon/calc` (generación 0) y traduce nuestro estado (`BattleView` + petición + set supuesto) a sus `Pokemon`/`Field`: PS actuales (en % para el rival), estado, boosts, clima, terreno, pantallas, Mega. Devuelve rango de daño y probabilidad de KO.
- **Registro de niveles**: `createBot(level: 0 | 1 | 2, { seed })` y `BOT_LEVELS` con nombre y descripción en español para la UI (Aleatorio, Agresivo, Táctico).

Niveles (detalle en PLAN §6):

- **Nivel 1, agresivo**: por cada posición, el movimiento y objetivo con mayor daño esperado. Prioriza los KOs y usa prioridad cuando asegura el KO. No golpea al aliado salvo que sea inmune. Mega en el primer turno en que pueda. Cambia solo si no tiene ningún movimiento útil.
- **Nivel 2, táctico**: nivel 1 más heurísticas:
  - Cambiar si el matchup es claramente malo (le hacen KO y él no hace nada relevante) y hay alguien mejor en el banquillo.
  - Dobles: Protección cuando le amenazan dos rivales o para ganar un turno de campo, Sorpresa (Fake Out) en el turno de entrada, concentrar ataques en un rival, no usar ataques en área que dañan al aliado si no compensa.
  - Control de velocidad: Viento Afín o Espacio Raro cuando invierten el orden a su favor.
  - Movimientos de estado con valor (Danza Dragón si sobrevive, Quemar a un atacante físico…), no aleatorios.
  - Elegir el momento de la Mega.
- **Vista previa** (niveles 1 y 2): puntuar cada Pokémon propio contra las 6 especies rivales (tipos, velocidad, daño estimado con sets supuestos) y llevar los 3 o 4 mejores, con el líder más adecuado.

Todo determinista con `SeededRandom` (desempates). Ningún nivel lee el log omnisciente.

### C. `tools/arena`: `npm run arena`

- Opciones: `--a <nivel> --b <nivel> --mode singles|doubles --battles N --seed X`. Equipos de `teamgen`; cada par de equipos se juega dos veces cambiando de lado para quitar el sesgo de equipo.
- Salida: porcentaje de victorias con intervalo aproximado, turnos medios, ms por combate, número de `[Invalid choice]` (debe ser 0) y semillas de los combates que fallen o se cuelguen, para reproducirlos con `BattleSession.fromReplay`.
- La lógica en una función (`runArena(options)`) para poder testearla con pocos combates.

### D. CLI

- `--bot 0|1|2` (por defecto, el nivel más alto) y `--opponent-team random` (por defecto) para usar `teamgen`. Los fixtures siguen disponibles con `--opponent-team <fichero>`.
- En la vista previa sin equipo abierto, el CLI no debe mostrar más de lo que ve el jugador.

## Tests mínimos

| Workspace | Tests |
|---|---|
| teamgen | Equipos legales (`checkTeam` + `validateTeam`) para cientos de semillas en ambos modos. Cláusulas. Límite de megapiedras. Determinismo |
| bot | **Calc = motor**: para una muestra de sets estándar, stats de `@smogon/calc` = `championsStats`, y el daño estimado de unos cuantos movimientos cae en el rango real (comparar con combates guionizados o con `battle.actions.getDamage` en un test de engine). Modelo del rival: filtra por lo revelado. Niveles 1 y 2: casos guionizados con peticiones a mano (elige el KO, no golpea al aliado, usa Protección cuando debe). Fuzz: niveles 1 y 2 sin `[Invalid choice]` en ≥100 combates por modo |
| arena | `runArena` con pocos combates termina y cuenta bien. Un test "corto" de fuerza: nivel 2 gana claramente al 0 en ~40 combates por modo (umbral holgado para que no sea frágil) |
| cli | `--auto --bot 2 --opponent-team random` termina en ambos modos |

## Criterios de "hecho"

- [ ] `npm run arena -- --a 2 --b 0 --battles 500` → el nivel 2 gana **≥ 80 %** en individuales y en dobles, **sin elecciones inválidas**. Apunta los resultados (y los del nivel 1 contra el 0) en el CHANGELOG.
- [ ] El nivel 1 gana claramente al 0 (orientativo ≥ 65 %), y el 2 al 1.
- [ ] `teamgen` genera equipos legales y deterministas.
- [ ] `npm run play` usa el nivel elegido y equipos aleatorios.
- [ ] `npm run check` en verde y en un tiempo razonable (el arena largo fuera del check).

## Decisiones de producto para preguntar al usuario (con recomendación)

- Nivel por defecto del rival en el CLI y en la futura UI. Recomendación: el más alto disponible.
- Megapiedras por equipo aleatorio. Recomendación: como mucho una.
- Si el bot de nivel 2 puede "hacer trampa" con equipo cerrado (conocer los sets reales). Recomendación: **no**, respeta PLAN §3.1 (información oculta); el equipo abierto ya cubre ese caso.

## Al cerrar la fase

Sigue el **protocolo de cierre de fase** de [AGENTS.md](../../AGENTS.md): docs, CHANGELOG, el brief de la fase 5 en `docs/fases/fase-5.md`, commit y push.

## Fuera de alcance de esta fase

Bot nivel 3 (lookahead con `Battle.fromJSON` o MCTS), modo explicación del bot (fase 8), servidor y UI web (fase 5), teambuilder (fase 6) y rivales guardados (fase 7).
