# Fase 11 — El nivel 3 deduce lo que oculta el rival y se adapta a su estilo

> **Brief de la fase.** Escrito el 2026-10-08 a partir de la propuesta A del cierre de la fase 10, con las decisiones del usuario.
> Lee antes [AGENTS.md](../../AGENTS.md), [ADR-0010](../adr/0010-bot-experto-con-sandbox.md), [ADR-0011](../adr/0011-nivel-3-con-equipo-completo.md) y la [guía del bot](../guias/bot.md).

## Objetivo

Que el nivel 3 **prediga al rival**:

1. **Sets**: deducir qué set lleva cada Pokémon rival con lo que ha visto (daño recibido y hecho, quién se movió antes, objetos de otros Pokémon) y repartir sus suposiciones según esa probabilidad, en lugar de suponer siempre «el más ofensivo».
2. **Estilo**: aprender durante el combate cómo juega el rival. Si siempre hace lo evidente, esperar lo evidente; si intenta adivinar nuestra jugada, jugar en torno a eso (petición del usuario del 2026-10-08).
3. **Qué trajo**: revisar con los pesos nuevos qué Pokémon no vistos es más probable que haya traído.

Y **enseñarlo**: en «Por qué jugó así el bot», qué set cree que lleva cada uno de tus Pokémon.

## Decisiones del usuario (2026-10-08)

- La deducción y la adaptación son **solo del nivel 3**. El nivel 2 no cambia: es la referencia fija del arena.
- **Se enseña** lo que deduce el bot de tus Pokémon, en «Por qué jugó así el bot» (solo habla de tus Pokémon: no revela nada oculto del rival).
- Con **sets propios** (no estándar), si ningún candidato cuadra con lo observado, el bot prueba **variantes de reparto** (más ataque, más defensa, más velocidad, Pañuelo…).
- **Fase 12 ya decidida**: al cerrar esta fase, el brief de `fase-12.md` es el **banco de pruebas de equipos** (no una propuesta abierta): el bot juega tu equipo guardado contra tu lista de rivales guardados N combates con el arena y da el % de victorias por rival y por modo. Ideas relacionadas para después (tabla de tipos, de velocidades y de daños; optimizador de Stat Points): mencionarlas como ampliaciones posibles.
- **Objetivo**: nivel 3 contra nivel 2 con equipo cerrado **≥ 67 % en individuales** (hoy ≈ 64,4 % en 1800 combates; techo con equipo abierto 70,7 %), medido con **≥ 1200 combates** y confirmado con otra semilla, **sin empeorar dobles** (81 %) y con **≤ ~1 s de media** por decisión. Si no se llega, averiguar qué falla e informar pronto con datos.

## Punto de partida

- `OpponentModel.candidates` (`analysis/opponent-model.ts`) filtra los sets estándar con lo revelado (Mega, objeto, habilidad, movimientos) y los ordena **del más ofensivo al menos**. `Situation` usa el primero como `combatant` y hasta tres como `variants`.
- `rivalAssumptions` (`search/assumptions.ts`) toma el candidato `index % n` en la suposición `index`: la primera es siempre la más ofensiva. Los no vistos se barajan.
- Las respuestas del rival en la búsqueda (`rivalReplies`, `search/lookahead.ts`) son las mejores del nivel 2 jugando su lado, con pesos softmax de temperatura fija (`replyTemperature` 10).
- Las hojas de la búsqueda crean `Situation` nuevas que vuelven a suponer el set más ofensivo, aunque el fork tenga otro.

## Hechos verificados

- **Sets estándar**: 260 especies por modo. En individuales, 110 tienen un solo set, 97 dos, 35 tres y 18 cuatro o más; de las 150 con varios, 95 difieren en reparto o naturaleza y 121 en objeto (dobles: 149 / 90 / 142). Ej.: Garchomp tiene seis (Casco Dentado defensivo, Baya Ziuela, dos Megas distintas…).
- **`teamgen` elige sets uniformemente** (baraja todos y coge con cláusulas): en el arena, el set real de cada rival está entre los candidatos y el **prior uniforme** es el correcto.
- **Cláusula de objeto**: los formatos de Champions usan `Flat Rules` con `Item Clause = 1` (`vendor/.../data/rulesets.ts`): un objeto revelado en un Pokémon descarta ese objeto en el resto.
- **Log de una perspectiva** (comprobado con `playOut`): PS propios exactos (`|-damage|p1a: Medicham|28/137`) y del rival en % entero (`|-damage|p2a: Victreebel|90/100`); `|-crit|` y `|-supereffective|` van **antes** de su `|-damage|`; los daños indirectos llevan `[from]` (`[from] item: Life Orb`); un KO es `0 fnt` (solo da una cota inferior del daño).
- El orden de los `|move|` de un turno dice quién fue más rápido entre movimientos de la misma prioridad (salvo Garra Rápida, Prankster y similares: tolerancia).
- `estimateDamage` ya cachea por contenido y devuelve las 16 tiradas (`rolls`); acepta `{ crit }`.

## Diseño recomendado

### 1. Deducción de sets (`packages/bot/src/inference/`)

- `observations.ts`: recorre el log de la perspectiva del bot con un `BattleView` y extrae, con el estado del momento (cambios de características, objeto, campo, estado):
  - **Golpes**: atacante, defensor, movimiento, crítico, daño (exacto si el defensor es del bot; en % si es del rival) y si fue KO. Se descartan los ambiguos: multigolpe, sustituto, daño con `[from]`.
  - **Orden**: pares de movimientos de lados distintos en el mismo turno con la misma prioridad, sin Espacio Raro cambiando a mitad.
- `beliefs.ts`: `inferBeliefs(...)` → `SetBeliefs`: para cada rival (visto, y los no vistos de la vista previa), los candidatos con su **probabilidad**. Prior uniforme sobre los candidatos de `OpponentModel`, descartando objetos ya revelados en otro Pokémon. Verosimilitud por observación: 1 si cuadra con alguna tirada (con tolerancia de redondeo del %), ε (≈ 0,05) si no, para tolerar efectos no modelados.
- **Variantes de reparto** (sets propios): si el mejor candidato no explica alguna observación, se añaden variantes del más probable (ataque al máximo, defensa física, defensa especial, velocidad, Pañuelo Elección si el objeto no se conoce y la cláusula lo permite) y se ponderan igual.
- Se calcula **una vez por decisión real** del nivel 3 y se reutiliza en la búsqueda.

### 2. Uso en el nivel 3

- `Situation` acepta `beliefs` opcionales: candidatos ordenados por probabilidad (`FoeMember.weights`) y el `combatant` es el más probable. Sin `beliefs`, todo como hoy (nivel 2).
- `rivalAssumptions` reparte las suposiciones por **cuantiles** de la probabilidad (estratificado), no por `index % n`.
- Las `Situation` de las hojas usan **el set de la suposición del fork** (creencias fijadas), no el más ofensivo.
- Qué trajo el rival: probar a ordenar los no vistos por probabilidad (lo que conviene traer contra nuestra vista previa) y medir. Si no mejora, se documenta y se deja.

### 3. Estilo del rival (`inference/style.ts`)

- En cada decisión de movimientos el nivel 3 apunta lo que **esperaba** del rival: su respuesta más evidente (la mejor del nivel 2 desde su lado) y la que mejor responde a **nuestra** jugada evidente (la mejor del nivel 2 para nosotros).
- En el turno siguiente lee en el log qué hizo el rival (movimiento o cambio voluntario) y lo clasifica: evidente, contrapredicción u otra cosa.
- Con esos recuentos (prior suave para no sobrerreaccionar al principio) ajusta las respuestas del rival en `rivalReplies`: un rival **evidente** baja la temperatura (más peso a la mejor respuesta); uno que **predice** mezcla la contrapredicción con peso proporcional a su frecuencia. Parámetros en `SEARCH_SETTINGS`.
- Determinista: mismo log → mismo estilo. Es estado del agente durante un combate y se reinicia al empezar otro.

### 4. Explicación

- `DecisionExplanation.beliefs?` (core): por cada Pokémon tuyo visto, las 2–3 hipótesis más probables (objeto, naturaleza, Stat Points destacados, movimientos supuestos y %). Opcional en `TurnExplanationSchema` (los replays viejos siguen valiendo; no cambia la versión).
- Web: bajo las opciones de «Por qué jugó así el bot», «Lo que cree de tu equipo» con chips por hipótesis. Solo del nivel 3; sin redacción (es tu equipo).

## Medición

- `npm run arena -- --a 3 --b 2 --mode singles --battles 600 --seed X` en paralelo (16 hilos) con semillas distintas. Variantes contra la configuración de la fase 10 con **las mismas semillas**, confirmando con otra antes de quedarse una. Techo con `--open-team-sheets`.
- Dobles: 300 combates para comprobar que no empeora.
- Precisión de la deducción: % de rivales cuyo set real es el más probable a mitad y al final del combate (script de diagnóstico, no versionado).

## Tests

- Observaciones: golpes, críticos, KO, `[from]` descartado, orden por velocidad, sobre logs reales de `BattleSession`.
- Creencias: un daño que solo cuadra con un reparto lo deja casi seguro; la cláusula de objeto descarta; un Pañuelo se deduce de un orden imposible sin él; las variantes aparecen solo cuando nada cuadra; nunca usa información oculta (invariancia: mismo log de perspectiva → mismas creencias aunque cambie el equipo real).
- Estilo: un rival guionizado «evidente» y otro que «predice» se clasifican bien.
- Nivel 3: el test de invariancia de `expert.test.ts` sigue en verde; determinismo; explicaciones sin cambiar decisiones (`explain.test.ts`).
- Protocolo: ida y vuelta con `beliefs`; web: el panel las muestra.

## Criterios de «hecho»

- Objetivo del usuario cumplido (≥ 67 % en individuales con ≥ 1200 combates y otra semilla; dobles ≥ 81 % ± ruido; ≤ ~1 s de media), o diagnóstico con datos y decisión del usuario.
- `npm run check` y `npm run e2e` en verde; CI en verde.
- Docs: ADR-0012, guía del bot, CHANGELOG con cifras, AGENTS, PLAN, README y brief de la fase 12.

## Fuera de alcance

- Que el nivel 2 deduzca o se adapte.
- Estadísticas de uso externas (opción D de la propuesta).
- Aprender el estilo del rival entre combates (solo dentro de uno).
