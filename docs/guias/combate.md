# Guía: combates (`core`, `engine`, `bot` y CLI)

Cómo se juega un combate en el proyecto, desde la terminal o desde código. Decisión de arquitectura: [ADR-0003](../adr/0003-sesion-de-combate.md). Los bots, el generador de equipos y el arena tienen su propia guía: [bot.md](bot.md). Para jugar en el navegador (`npm run dev`), ver la [guía de la web](web.md).

## Jugar en la terminal

```bash
npm run play                                  # individuales contra el bot táctico (nivel 2) con un equipo aleatorio
npm run play -- --mode doubles                # dobles
npm run play -- --bot 1                       # rival más fácil (0 aleatorio, 1 agresivo, 2 táctico)
npm run play -- --team mi-equipo.txt          # tu equipo, en formato export de Showdown
npm run play -- --seed hola                   # combate reproducible
npm run play -- --no-preview --open-team-sheets
npm run play -- --help
```

| Opción | Qué hace |
|---|---|
| `--mode singles\|doubles` | Individuales (6 → 3) o dobles (6 → 4). Por defecto, individuales |
| `--bot <0\|1\|2>` | Nivel del bot: 0 aleatorio, 1 agresivo, 2 táctico. Por defecto, 2 |
| `--team <fichero>` | Tu equipo (por defecto `tools/smoke/fixtures/equipo-a.txt`) |
| `--opponent-team <fichero>\|random` | Equipo del bot. Por defecto, `random` (generado con `@colleja/teamgen` a partir de la semilla). Los fixtures siguen disponibles: `--opponent-team tools/smoke/fixtures/equipo-b.txt` |
| `--seed <texto>` | Semilla. Misma semilla + mismas elecciones = mismo combate. Sin ella se genera una y se muestra al empezar |
| `--no-preview` | Sin vista previa: cada uno saca sus primeros 3 o 4, en orden, y no ve el equipo rival |
| `--open-team-sheets` | Ves los sets completos del rival en la vista previa |
| `--name <nombre>` | Tu nombre en el combate |
| `--auto` | Bot contra bot (del nivel de `--bot`) sin preguntas (lo usan los tests) |

En cada pregunta se elige con números. En dobles se pide además el objetivo y, si se puede, si megaevolucionar. Comandos que funcionan en cualquier pregunta (también al terminar el combate):

| Comando | Qué hace |
|---|---|
| `deshacer` | Vuelve al inicio del turno anterior (o del actual, si ya pasó algo en él, como un cambio forzado) |
| `rebobinar N` | Vuelve al inicio del turno N (0 = vista previa) |
| `exportar` | Guarda el replay en `storage/replays/<fecha>-<modo>.json` |
| `salir` | Abandona el combate |
| `ayuda` | Lista los comandos |

El log se narra en español con las plantillas de mensajes de Showdown (`@colleja/narration`, el mismo narrador que usa la web).

## Piezas

| Paquete | Entorno | Qué aporta |
|---|---|---|
| `@colleja/core` | Navegador y Node | `PokemonSet`/`Team`, stats (`championsStats`), Stat Points, import/export de Showdown, comprobación rápida de equipos, peticiones y elecciones tipadas, `getSlotOptions`/`validateChoice`, `BattleView`, `BattleAgent`, `SeededRandom` |
| `@colleja/engine` | Solo Node | `validateTeam`, `resolveFormat`, `BattleSession`, `playOut`, `decideFor`, replays, conversión de sets a Showdown |
| `@colleja/narration` | Navegador y Node | `Narrator` (log en español o inglés con las plantillas de Showdown) y nombres para mostrar ([guía de la web](web.md)) |
| `@colleja/bot` | Navegador y Node | Niveles 0–3 (`createBot`, `BOT_LEVELS`) y su análisis con `@smogon/calc` ([guía](bot.md)) |
| `@colleja/teamgen` | Navegador y Node | `generateTeam`: equipos aleatorios legales desde los sets estándar |
| `tools/cli` | Node | `npm run play` |
| `tools/arena` | Node | `npm run arena`: torneos bot contra bot |

## Usar el motor desde código

```ts
import { createBot } from '@colleja/bot';
import { actionsChoice, moveAction, parseShowdownTeam } from '@colleja/core';
import { BattleSession, decideFor, playOut } from '@colleja/engine';

const session = BattleSession.create({
  mode: 'doubles',
  seed: 'hola',                                  // cualquier texto; sin semilla, aleatoria
  options: { teamPreview: true, openTeamSheets: false },
  players: {
    p1: { name: 'Yo', team: parseShowdownTeam(textoA).sets },
    p2: { name: 'Bot', team: parseShowdownTeam(textoB).sets },
  },
});                                              // valida ambos equipos: TeamValidationError si no son legales

session.on((event) => { /* protocol | request | error | end | rewind */ });

session.choose('p1', { type: 'team', order: [1, 2, 3, 4] });
session.choose('p1', actionsChoice(moveAction(1, { target: 2, mega: true }), moveAction(3, { target: 1 })));
session.choose('p2', 'move 1 +1, switch 3');     // también texto de Showdown (sin pre-comprobación)

session.getLog('p1');                            // protocolo visto por p1 (PS del rival en %)
session.getAgentContext('p2');                   // lo que puede saber un bot: petición, log de su lado, equipos
session.rewindTo(3);                             // vuelve al inicio del turno 3
session.undo();                                  // un paso atrás
session.forfeit('p1');                           // p1 se rinde (rebobinar lo deshace)
const replay = session.exportReplay();           // JSON reproducible
BattleSession.fromReplay(replay);                // mismo combate

await playOut(session, { p1: createBot(2, { seed: 'a' }), p2: createBot(0, { seed: 'b' }) });
await decideFor(session, 'p2', createBot(2));    // una sola decisión de un agente (con reintentos)
```

### Elecciones

`Choice` se serializa a la sintaxis de Showdown con `formatChoice`:

| `Choice` | Texto |
|---|---|
| `teamChoice([2, 1, 3])` | `team 2, 1, 3` |
| `actionsChoice(moveAction(1))` | `move 1` |
| `actionsChoice(moveAction(2, { target: 1, mega: true }), moveAction(1, { target: -1 }))` | `move 2 +1 mega, move 1 -1` |
| `actionsChoice(PASS, switchAction(3))` | `pass, switch 3` |

En dobles, `+N` es la posición N del rival y `-N` la posición N propia (aliado o uno mismo). `getSlotOptions(request)` lista, para cada posición activa, los movimientos con sus objetivos válidos, los cambios posibles y si puede megaevolucionar. `validateChoice(request, choice)` devuelve los problemas en español; la sesión lo aplica antes de mandar la elección.

### Perspectivas

`getLog(perspectiva)` admite `p1`, `p2`, `omniscient` y `spectator`. Cada jugador ve sus PS exactos y los del rival como `x/100`. Los bots **solo** reciben su perspectiva (`AgentContext.log`); para reconstruir el campo, `BattleView.from(log)`. Además del campo, `BattleView` sigue lo revelado de cada Pokémon (objeto y habilidad, también por etiquetas `[from] item:`/`[from] ability:`, movimientos, Mega), el turno en que entró y su último movimiento.

### Sandbox (combates hipotéticos)

Al elegir movimientos, `getAgentContext(lado).sandbox` ofrece un `BattleSandbox` (interfaz de `core`, implementado en `engine/src/sandbox.ts`) para mirar jugadas por delante, como hace el bot nivel 3 ([ADR-0010](../adr/0010-bot-experto-con-sandbox.md)):

```ts
const { sandbox } = session.getAgentContext('p2')!;
const fork = sandbox!.fork({ seen: { Garchomp: setSupuesto }, unseen: [otroSet, …] }, 'semilla');
fork.choose('p1', actionsChoice(moveAction(1)));
fork.choose('p2', actionsChoice(moveAction(2)));
fork.log('p2');           // lo que vería p2 de ese turno
fork.clone('otra');       // misma posición, otra suerte
```

Un fork **no tiene información oculta**: los sets del rival son los supuestos (los vistos, por nombre; los no vistos, enteros), sus PS son el % visible, el generador aleatorio es nuevo (con suerte común por acción), la duración del sueño se sortea otra vez y se olvidan las elecciones ya hechas. El combate real no cambia. Si la posición real avanza, el sandbox deja de valer (lanza un error).

### Rebobinar

La sesión guarda en qué punto del `inputLog` empezó cada turno y, para volver, reconstruye el combate desde la semilla reaplicando las elecciones hasta ese punto. `rewindableTurns()` dice a qué turnos se puede volver; `undoTarget()`, adónde iría `undo()`.

### Elecciones rechazadas

`choose` devuelve `{ ok: false, errors }` y la sesión sigue esperando. Hay dos tipos de rechazo de Showdown:

- `[Invalid choice]`: la elección es ilegal. Con una `Choice` tipada no debería pasar nunca (el test de fuzz del bot lo comprueba).
- `[Unavailable choice]`: depende de información oculta (por ejemplo, un rival con una habilidad que atrapa y que aún no se ha revelado). Showdown manda una petición actualizada y hay que volver a elegir. `playOut` y `decideFor` lo reintentan.

## Tests relevantes

| Fichero | Qué cubre |
|---|---|
| `packages/core/test/team.test.ts` | Stats con Stat Points, límites, import/export, comprobación de equipos |
| `packages/core/test/battle.test.ts` | Elecciones, objetivos en dobles, validación, `BattleView` |
| `packages/engine/test/engine.test.ts` | Stats de core = motor en todos los sets estándar, validación, formatos, determinismo, replays, rebobinado, perspectivas |
| `packages/engine/test/sandbox.test.ts` | Sandbox: cuándo existe, sustitución de sets, PS visibles, reproducibilidad, combate real intacto |
| `packages/bot/test/*.test.ts` | Bots: ver la [guía de bots](bot.md#tests) |
| `packages/narration/test/narration.test.ts` | Narración en español e inglés, gramática y combates completos sin marcadores sin resolver |
| `tools/cli/test/cli.test.ts` | `--auto` en ambos modos (nivel 2 y equipo aleatorio), `--bot 0/1` con fixtures y una partida "humana" guionizada con deshacer y rebobinar |
