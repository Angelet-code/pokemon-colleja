# Stack técnico: motor, datos, bot y assets

> Investigación del 2026-10-07. Versiones y fechas verificadas en GitHub/npm ese día.
> Decisión derivada: [ADR-0001](../adr/0001-motor-de-combate.md).

---

## 1. Pokémon Showdown (smogon/pokemon-showdown)

- **Licencia**: MIT (el *simulador*). El *cliente web* de Showdown es **AGPLv3** → no copiamos código del cliente.
- **Actividad**: ~29k commits, commits diarios (último: 2026-10-07). npm `pokemon-showdown@0.11.11` (2026-07-28). `master` requiere Node ≥ 22.18.
- **Solo Node**: el README del sim indica que no funciona directamente en navegador.

### 1.1 Soporte de Pokémon Champions (✅ sí)

| Ruta en el repo | Contenido |
|---|---|
| `data/mods/champions/` | abilities, conditions, formats-data, items, learnsets, moves, rulesets, scripts |
| `data/mods/championsregmb/` | Regulación anterior (M-B) |
| `data/random-battles/champions/` | `sets.json`, `doubles-sets.json` (342 especies) |
| `test/sim/champions.js` | Tests de mecánicas Champions |

Formatos en `config/formats.ts` (master):

| ID | Tipo |
|---|---|
| `gen9championsvgc2026regmc` | VGC dobles, regulación M-C (vigente en master desde 2026-09-09) |
| `gen9championsbssregmc` | Battle Stadium Singles M-C |
| `gen9championsou`, `gen9championsuu` | Tiers Smogon individuales |
| `gen9championsrandombattle`, `gen9championsrandomdoublesbattle` | Aleatorios |
| `gen9championscustomgame`, `gen9championsdoublescustomgame` | Sin validación, nivel 50 por defecto |

⚠️ **npm va por detrás de master**: 0.11.11 solo trae Reg M-A/M-B y no trae Random Doubles. Desde 2026-06-18 hay ~39 commits de fixes al mod Champions (Maldición + Señuelo, Botón Escape/Emergency Exit, Potencia Bruta vs Cólera/Botón Escape, Mega Sol + Electrorrayo…). **Conclusión: fijar un commit concreto de master**, no depender de npm.

### 1.2 Mecánicas Champions tal y como las codifica Showdown

- **Stat Points (SP)** en vez de IVs/EVs: máx. **66 totales**, **32 por stat**. Se guardan en el campo `evs` del set. Nivel 50.
  - `PS = Base + SP + 75`
  - `Otra = floor((Base + SP + 20) × Naturaleza)`
  - (Equivale a IV 31 y 1 SP ≈ 8 EV a nivel 50.)
- Parálisis: no se mueve **1/8** de las veces. Sueño: **2–3 turnos**. Congelación: máx. **3 turnos**, 25% de descongelarse por turno.
- PP máximo 20.
- **Sin Teracristalización**. **Mega Evolución sí** (no revierte al debilitarse). Megas nuevas con habilidades nuevas (Dragonize, Mega Sol, Piercing Drill, Spicy Spray…).

(Detalle completo de reglas del juego en [01-pokemon-champions.md](01-pokemon-champions.md).)

### 1.3 API programática (verificada en `sim/SIMULATOR.md`, `SIM-PROTOCOL.md`, `TEAMS.md`)

Exports: `Battle, BattleStream, getPlayerStreams, Dex, Teams, TeamValidator, PRNG, toID`.

```js
const {BattleStream, Teams} = require('pokemon-showdown');
const stream = new BattleStream();
(async () => { for await (const out of stream) console.log(out); })();
stream.write(`>start {"formatid":"gen9championsvgc2026regmc"}`);
stream.write(`>player p1 ${JSON.stringify({name: 'Me', team: Teams.pack(Teams.import(myExport))})}`);
stream.write(`>player p2 ${JSON.stringify({name: 'Bot', team: botPacked})}`);
stream.write(`>p1 team 1234`);
stream.write(`>p2 team 1234`);
stream.write(`>p1 move 1 1, move 2 -1`);
```

- **Elecciones**: `move 1`, `switch 3`, `team 2134`, `move 1 mega`. En dobles se separan con coma: `move Thunderbolt 1 mega, move Helping Hand -1`. Objetivo `+N` = rival, `-N` = aliado.
- **Equipos**: formato *packed* (`NICK|SPECIES|ITEM|ABILITY|MOVES|NATURE|EVS|…`, Pokémon separados por `]`) o formato *export* de texto. Conversión con `Teams.import/export/pack/unpack`.
- **Estado serializable**: `Battle.toJSON()/fromJSON()` → permite al bot clonar la batalla y simular jugadas (lookahead).
- **Semillas** reproducibles: `"sodium,<hex>"` o `"1,2,3,4"` → combates repetibles para tests y depuración.
- Hay validador (`TeamValidator`) que aplica las reglas del formato (especies legales, objetos, clausulas).

---

## 2. Ecosistema @pkmn (github.com/pkmn/ps, MIT)

| Paquete | Función | Versión (fecha) |
|---|---|---|
| `@pkmn/sim` | Sim de Showdown adaptado a navegador, tipado | 0.10.11 (2026-06-18) |
| `@pkmn/dex` / `@pkmn/data` | Capa de datos + wrapper `Generations` | 0.10.11 |
| `@pkmn/mods` | Mods extra, **incluye `champions` y `championsregma`** | 0.10.11 |
| `@pkmn/randoms` | Generadores de equipos aleatorios Gen 1–9, **sin Champions** | 0.10.11 |
| `@pkmn/protocol` | Parser del protocolo de batalla | 0.7.3 (2026-05-08) |
| `@pkmn/client` | Reconstruye el estado de la batalla desde el protocolo (lado cliente) | 0.7.3 |
| `@pkmn/view` | Formateo de log de batalla a texto | 0.7.3 |
| `@pkmn/sets` | Import/export de sets | 5.2.0 (2025-07) |
| `@pkmn/smogon` | Cliente de data.pkmn.cc (sets/estadísticas) | 0.6.0 (2026-08-28) |
| `@pkmn/img` | URLs y tamaños de sprites/iconos | 0.3.4 (2026-06-02) |
| `@pkmn/engine` | Motor Zig ultrarrápido — **solo Gen I–II**, no aplica | — |

- ⚠️ **Retraso**: último sync con Showdown 2026-06-18 (Reg M-A). Sin Reg M-C ni fixes posteriores.
- Patrón típico de cliente: sim en Web Worker → stream de p1 a la UI → `new Battle(new Generations(Dex))` de `@pkmn/client` + `battle.add(line)` por línea + `LogFormatter` para texto.
- `@pkmn/client`/`protocol`/`view` **sí nos sirven** aunque el sim corra en Node: son independientes del sim y parsean el protocolo estándar.

---

## 3. Calculadora de daño: @smogon/calc

- v0.12.0 (2026-09-18), MIT.
- **Soporta Champions** como `Generations.get(0)` (`mechanics/champions.ts`): nivel forzado a 50, `evs` = Stat Points, Reg M-C y Megas nuevas incluidas.
- API: `calculate(gen, new Pokemon(gen, 'Garchomp', {item, nature, evs}), new Pokemon(...), new Move(gen, 'Earthquake'), new Field({...}))` → `Result` con tiradas, rangos y descripción.
- Usos: (1) **bot** que puntúa movimientos por daño, (2) **panel de calculadora** en la UI para practicar cálculos.

---

## 4. Bots existentes (inspiración)

| Bot | Licencia | Enfoque | Uso para nosotros |
|---|---|---|---|
| Showdown `RandomPlayerAI` (`sim/tools/random-player-ai.ts`) | MIT | Elecciones aleatorias legales; gestiona team preview, cambios forzados, mega y objetivos en dobles | **Plantilla base** del bot en TS |
| poke-env `MaxBasePowerPlayer` | MIT | Máxima potencia (×1.5 a spread en dobles) | Nivel "fácil" |
| poke-env `SimpleHeuristicsPlayer` | MIT | Puntuación de matchup (tipos, +0.1 si más rápido, 0.4 × diferencia de PS), cambia si score < −2 o con −3 en stats, estima daño, setup a PS llenos, peligros | Nivel "normal", **portable a TS** |
| foul-play (pmariglia) | **GPL-3.0** | MCTS/expectiminimax sobre sets muestreados con `poke-engine` (Rust) | Solo ideas (licencia incompatible para copiar) |
| reuniclusVGC | MIT (abandonado) | DQN sobre poke-env | Notas sobre el espacio de acciones en dobles |

Camino propuesto: reglas + greedy por daño (calc) → lookahead de 1 ply clonando `Battle.fromJSON` → (opcional) MCTS. **El bot solo lee el stream de p2** (información oculta respetada), nunca el omnisciente.

---

## 5. Fuentes de datos

| Fuente | Licencia | Cobertura | Rol |
|---|---|---|---|
| Showdown `data/` + mod `champions` | MIT | Pokédex, movimientos, habilidades, objetos, learnsets, legalidad + **lógica** | **Fuente de verdad** |
| PokeAPI | BSD-3 (código) | Version group `champions` (id 32), learnsets de 319 Pokémon, Megas nuevas, **nombres en español** | i18n (nombres ES) y contraste |
| pkmn/smogon (`sets/championsvgc2026.json`, `championsbattlestadiumsingles.json`…) | Sets © Smogon; usage stats dominio público | Sets competitivos y estadísticas de uso, refresco diario | Sets "estándar" para el bot |
| pkmn/randbats (`gen9championsrandombattle.json`, `…randomdoublesbattle.json`) | — | Sets de random battle | Generación de equipos aleatorios |
| Bulbapedia, Serebii (`/pokemonchampions/`) | Restrictiva, sin API | Referencia | Verificación manual |

**Versionado de datos**: fijar commit de Showdown → script exporta snapshots JSON en build con el SHA registrado → diff en cada actualización.

---

## 6. Sprites y assets

- Showdown: `play.pokemonshowdown.com/sprites/{gen5,ani,ani-back,dex,…}/<id>.png|gif` + sheets de iconos. `@pkmn/img` resuelve URLs; su README pide **alojar copias propias** (al menos los sheets de iconos).
- PokeAPI/sprites: repo CC0 pero las imágenes son © The Pokémon Company. Incluye `versions/generation-ix/champions/` (128 px, con shinies).
- Todo el arte es propiedad de Nintendo/Game Freak/The Pokémon Company. Proyecto **personal y no comercial** → riesgo bajo; **no redistribuir** el arte.

⚠️ Desde esta máquina falló TLS (`SEC_E_UNTRUSTED_ROOT`) contra play.pokemonshowdown.com, data.pkmn.cc y pokeapi.co: **Sophos** filtra DNS e intercepta HTTPS de varios dominios (Serebii, Bulbapedia, Smogon, Showdown…). **npm y GitHub funcionan** (comprobado 2026-10-07). Los scripts de datos y sprites descargan solo desde GitHub (raw / git).

---

## 7. ¿Motor propio desde cero? Tamaño del problema

Datos base de Showdown: 953 movimientos (~420 con código propio), 321 habilidades (~309 con handlers), 583 objetos (~384 con handlers), 35 condiciones, ~113 hooks de eventos distintos. Núcleo del sim ≈ 750 KB de TS (`battle.ts` 114k, `pokemon.ts` 75k, `battle-actions.ts` 71k) y 359 ficheros de test.

Solo Champions: ~349 especies/formas legales (~82 Megas), ~510 movimientos, ~166 objetos (~80 megapiedras).

Partes difíciles: prioridad y sub-orden de eventos, empates de velocidad, objetivos y redirección en dobles, Mega Evolución y recálculo de velocidad, orden de habilidades al entrar, cadenas de Botón Escape/Emergency Exit, debilitamientos y reemplazos, orden de residuales, cambios de forma. Los 39 fixes del mod Champions desde junio muestran lo larga que es la cola de casos raros.

Motores ligeros alternativos: `@pkmn/engine` (Gen I–II), `poke-engine` (singles, incompleto), `pkmn-battle` (juguete). **Ninguno sirve.**

---

## 8. Comparativa de opciones

| | Esfuerzo | Fidelidad Champions | Veredicto |
|---|---|---|---|
| **A. Envolver el sim de Showdown** + UI, bot y teambuilder propios | Semanas | Máxima, mantenida upstream | ✅ **Recomendado** |
| B. Motor propio | Meses–años | Divergencias en casos raros durante mucho tiempo | ❌ |
| C. Motor propio con Showdown como oráculo de tests | El mayor | Comparar por semilla exige replicar el orden exacto de llamadas al RNG | Solo si el objetivo es aprender |

Variantes de A:

- **A1 — Showdown vendorizado (commit fijado) en un servidor Node local** + UI web por WebSocket. Datos al día (Reg M-C). El bot corre junto al sim y puede clonar batallas. Abre la puerta a multijugador en el futuro.
- **A2 — `@pkmn/sim` + `@pkmn/mods/champions` en un Web Worker**. 100% estático (desplegable en GitHub Pages, jugable en móvil), pero con datos de junio 2026 hasta que pkmn sincronice.

Ambas variantes quedan detrás de la misma interfaz `BattleEngine` en nuestro código → se puede cambiar de una a otra sin tocar UI ni bot.

---

## Fuentes

- https://github.com/smogon/pokemon-showdown — `sim/SIMULATOR.md`, `sim/SIM-PROTOCOL.md`, `sim/TEAMS.md`, `config/formats.ts`, `data/mods/champions/`
- https://www.npmjs.com/package/pokemon-showdown
- https://github.com/pkmn/ps (sim, dex, data, mods, client, protocol, view, randoms, img)
- https://github.com/smogon/damage-calc (`calc/src/mechanics/champions.ts`)
- https://github.com/pkmn/smogon, https://github.com/pkmn/randbats
- https://github.com/hsahovic/poke-env, https://github.com/pmariglia/foul-play
- https://pokeapi.co, https://github.com/PokeAPI/sprites
