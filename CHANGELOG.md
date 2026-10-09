# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Sin publicar]

### Añadido

- **«Cómo lo pensó»** en «Por qué jugó así el bot» (nivel 3): unas frases sencillas con lo que **esperaba que hicieras** (con su probabilidad; en dobles, por Pokémon), a qué dio más peso porque sueles anticiparte, que **descartó el resto** de tus opciones por verlas peores para ti y **por qué eligió** su jugada (la mejor contra lo que más esperaba o la que le cubría ante otra respuesta tuya). La búsqueda ya jugaba contra tus respuestas probables: ahora las devuelve (`SearchResult.expected`) con el valor de cada opción contra cada una, sin cambiar ninguna decisión. `DecisionExplanation` gana `expected` y `ExplainedOption` gana `versus` (opcionales: los replays viejos siguen valiendo).

- En combate, cada movimiento muestra sus **datos** (tipo, categoría, potencia, precisión, PP y efecto) y **cómo afecta a cada rival**: eficacia, daño estimado en % y golpes para KO, con la calculadora del servidor y solo lo que ve el jugador ([guía](docs/guias/herramientas.md#datos-y-efecto-de-los-movimientos-pantalla-de-combate)). El tipo es el final (Piel Feérica convierte Vozarrón en Hada): `POST /api/calc` devuelve `moveType` (`finalMoveType` del bot, fuera de `estimateDamage`).
- En el teambuilder, cada movimiento elegido muestra su tipo, categoría, potencia, precisión, PP y efecto sin abrir el desplegable.
- En combate, cada tarjeta de PS muestra los **tipos** del Pokémon. Siguen los cambios de tipo (Protean, Libero, Empapar, Bosque Maldito, Clonatipo…) hasta que se retira, y los de la Mega Evolución. `BattleView` guarda `typeChange` y `currentTypes` (core) da los tipos actuales.

### Cambiado

- Los equipos aleatorios (`teamgen`) pueden llevar **hasta dos megapiedras** (antes una). El formato no limita las megapiedras (solo prohíbe repetir objeto); solo se megaevoluciona una vez por combate. Decisión de producto del 2026-10-09.
- Los nombres de equipos y rivales admiten como mucho 48 caracteres (antes 60).

### Corregido

- En «Nuevo combate», los nombres largos de equipos y rivales guardados ensanchaban la lista y se salían del panel; ahora se recortan.
- Nivel 1 en dobles: con dos Pokémon capaces de megaevolucionar en el campo, la segunda posición pasaba turno (todas sus opciones llevaban mega). Ahora ataca sin megaevolucionar.
- Niveles 2 y 3 en dobles: en el **turno de recarga** (tras Hiperrayo, Gigaimpacto…) la posición pasaba turno y Showdown rechazaba la elección (combate con error en el banco, ≈ 8 % de los combates con Sylveon). «Recargar» no está en los datos de movimientos y el plan de dobles lo descartaba; ahora es una opción que no hace nada. Test: `packages/bot/test/recharge.test.ts` (los tres niveles, en los dos modos).

- Con `npm run dev`, abrir la web en el puerto del servidor (3001) mostraba `apps/web/dist`, una compilación que podía ser vieja (por ejemplo, con los iconos Gen 8 pixelados en lugar de los renders de Champions). Ahora el servidor de desarrollo redirige las páginas a Vite (`WEB_DEV_URL`, que pone `npm run dev`).

### Fase 13 — Nivel 3 el doble de rápido (2026-10-09)

#### Cambiado

- **El nivel 3 decide ≈ 2× más rápido con la misma fuerza** ([ADR-0014](docs/adr/0014-nivel-3-mas-rapido-con-poda.md), [guía](docs/guias/bot.md#velocidad-npm-run-arenaperf)):
  - **Optimizaciones idénticas** (mismas decisiones, comprobado con huellas): caché de tiradas de daño por clase de PS (lleno, ≤ 1/3, entre medias; los movimientos que dependen de los PS exactos, `EXACT_HP_MOVES`, van aparte), sin cierres con nombre en los bucles calientes del duelo y la simulación de dobles (tsx los envuelve en `__name` cada vez) y claves del campo en caché. 1,25× en individuales y 1,12× en dobles.
  - **Poda sucesiva** en la búsqueda: los turnos se juegan por orden y, tras `pruneAfter` turnos (2 en individuales, 1 en dobles), se dejan de buscar las opciones cuya media queda más de `pruneMargin` (30) puntos por debajo de la mejor. Decisión del usuario: decisiones distintas, pero con la misma fuerza medida en el arena.
- Con equipos de hasta dos megapiedras, la referencia del nivel 3 contra el 2 pasa a ≈ 64,7 % en individuales y ≈ 80 % en dobles.

#### Añadido

- Huella de cada combate entre bots (`BotBattleResult.fingerprint`, SHA-256 del `inputLog`) y `npm run arena:perf`: tiempo por decisión de un nivel en combates fijos (reloj y CPU) y, con `--compare`, si alguna decisión cambió.
- Tests (359 en `npm run check`): las cachés de daño dan lo mismo que la calculadora para todo movimiento, habilidad y objeto; poda (`stillPromising`); huella reproducible.

#### Resultados

| Medida | Antes | Ahora |
|---|---|---|
| `npm run arena:perf` (un hilo), ms por decisión | 294 individuales / 390 dobles | **140 / 188** (2,10× / 2,07×) |
| Nivel 3 contra 2, individuales (1 200 combates, `s1` + `s2`) | 64,6 % (sin poda) | **64,8 %** |
| Nivel 3 contra 2, dobles (1 200 combates, `d1` + `d2`) | 80,5 % (sin poda) | **79,9 %** |
| A/B v1 contra v2 del banco (20 rivales, nivel 3 contra 3, ± 5, 15 hilos) | 874 s, v1 mejor (−4,2 ± 4,9) | **416 s**, v1 mejor (−2,5 ± 4,9) |

Probado y descartado: sustituir `getCallback` de Showdown por una versión con caché (≈ 6 400 llamadas por turno simulado, pero sin ganancia) y reutilizar el formato al deserializar cada hoja (ya estaba en caché). Lo que queda caro es el simulador (≈ 40–50 %) y deserializar cada hoja (≈ 15–20 %).

### Fase 12 — Banco de pruebas de equipos (2026-10-09)

#### Añadido

- **Banco de pruebas** ([ADR-0013](docs/adr/0013-banco-de-pruebas-con-hilos.md), [guía](docs/guias/banco.md)): tu equipo guardado contra tus rivales guardados, bot contra bot, con el % de victorias por rival y modo, su IC 95 % y el total (cada rival pesa igual).
  - **A/B en pares**: dos versiones del equipo con las mismas semillas, lados y bots; se mide la diferencia por par. Con el mismo equipo en los dos lados, la diferencia es exactamente 0.
  - **Parada temprana**: para cuando el IC del total (o de la diferencia) llega al margen, o, en A/B, cuando la diferencia es claramente distinta de 0 (Bonferroni sobre las rondas). Siempre con un tope.
  - **Reparto de Neyman**: tras 6 combates por rival, los siguientes van a los rivales más inciertos.
  - **Hilos de trabajo** (`node:worker_threads`, todos los núcleos menos uno) con una cola de combates sueltos y **combates especulativos**: la tabla es la misma con cualquier número de hilos.
  - Los combates que el bot no termina cuentan como **error**, nunca como derrota, y se guardan con su semilla.
- `@colleja/bench` (paquete nuevo, solo Node) y `playBotBattle` en `engine`, que ahora usa también el arena (mismas cifras). `teamProblems` pasa a `engine`.
- **Web**: pantalla **Banco** (`/banco`) con equipo, versión B (otro equipo o texto), modo, rivales, nivel de cada lado (Táctico o Experto) y precisión (± 10, ± 5 o fijo). La tabla se llena en vivo con el rival más flojo arriba, cada rival tiene «Jugar contra él» y el **historial del equipo** queda en `storage/bench/`.
- **Servidor**: `POST/GET /api/bench`, `GET/DELETE /api/bench/:id` y el WebSocket `/ws/bench` (`bench:watch` → `bench:progress`/`bench:result`). Un banco a la vez (409).
- **Terminal**: `npm run bench` (equipo guardado o fichero, `--versus`, `--margin`, `--battles`, `--screen` para cribar con el nivel 2, `--json`) y `npm run bench:calc` (matriz de daño contra los sets de tus rivales).
- Decisiones de producto: banco en la web y en la terminal; en la web, niveles entre los dos más altos; margen con parada temprana; resultados guardados; A/B dentro de la fase.
- Tests (343 en `npm run check` + 6 E2E): estadística con datos sintéticos (incluida la tasa de paradas falsas con dos versiones iguales), planificador (orden de llegada indiferente), banco con hilos reales, cancelación, rivales ilegales saltados, servidor (404, 400, 409, progreso en orden, resultado igual al del banco directo), protocolo, formulario de la web y un E2E del banco.
- Documentación: [ADR-0013](docs/adr/0013-banco-de-pruebas-con-hilos.md), [guía del banco](docs/guias/banco.md) y la propuesta de la [fase 13](docs/fases/fase-13.md).

#### Medido

Equipo «Collejas pingüi» del usuario, dobles, Ryzen 7 5800X con 15 hilos:

| Prueba | Resultado | Tiempo |
|---|---|---|
| 5 rivales × 20 combates, nivel 3 contra 3 | 44,0 % ± 9,7 | 152 s |
| A/B v1 contra v2, 20 rivales, nivel 3 contra 3, ± 5 | v1 mejor: B − A = −4,2 ± 4,9 (560 combates) | 874 s |
| A/B v1 contra v2, ± 10, nivel 3 contra 3 | v1 mejor: −5,7 ± 8,3 (240 combates: el mínimo de 6 por rival) | 467 s |
| A/B v1 contra v2, ± 10, tu bot 3 contra rivales 2 | sin diferencia: +0,8 ± 8,6 (240 combates) | 248 s |
| Criba v0–v4, nivel 2 contra 2, 2000 combates por variante | v4 42,9 · v1 42,8 · v2 38,5 · v0 35,7 · v3 34,7 % | ≈ 45 s por variante |

- La **criba con el nivel 2** elige las mismas dos variantes (v1 y v4) que el nivel 3 de la prueba manual, así que `--screen` se ofrece. Con los rivales en nivel 2 la ventaja de v1 no aparece: el nivel de los rivales cambia lo que se mide, y la decisión final conviene tomarla con los dos en 3.
- **No se alcanza** el objetivo de la A/B en ≤ 5 min con el nivel 3 contra 3. La estadística ya ahorra ≈ 3×; el resto es el coste del nivel 3 (≈ 1 s por decisión con 15 hilos: 30 % simulador de Showdown, 11,5 % calculadora, 11 % `doubles-sim`). Decisión del usuario: aceptarlo, documentar el flujo rápido y proponer acelerar el nivel 3 en la fase 13.

### Fase 11 — El nivel 3 deduce los sets del rival y se adapta a su estilo (2026-10-08)

#### Añadido

- **Deducción de sets** en el nivel 3 (`packages/bot/src/inference/`, [ADR-0012](docs/adr/0012-deduccion-de-sets-y-estilo-del-rival.md)):
  - `extractObservations` saca del log de la perspectiva del bot los golpes (daño exacto o en %, crítico, KO) y el orden de los movimientos de la misma prioridad.
  - `inferBeliefs` da a cada set candidato de cada rival su probabilidad: prior uniforme, cláusula de objeto, y verosimilitud 1 o 0,05 según alguna tirada o la velocidad explique lo observado. Una megapiedra sin usar pierde peso.
  - Con sets propios, si nada cuadra, entran **variantes de reparto** (ataque, velocidad, resistencia, defensas, Pañuelo Elección).
  - Las suposiciones de la búsqueda se reparten por cuantiles de esa probabilidad, y el set supuesto es el más probable, no el más ofensivo.
- **Estilo del rival** (`RivalStyle`, `styleAdjustment`): el nivel 3 apunta la respuesta evidente del rival y su contrapredicción, y comprueba en el turno siguiente qué hizo. Con un rival evidente afina sus predicciones; con uno que intenta adivinar su jugada, pesa la contrapredicción. `SEARCH_SETTINGS.counterCandidates` (6).
- **«Lo que cree de tu equipo»** en «Por qué jugó así el bot»: las 2–3 hipótesis más probables de cada uno de tus Pokémon (objeto, naturaleza, Stat Points, movimientos y %). `DecisionExplanation.beliefs` (core) y opcional en `TurnExplanationSchema` (los replays viejos siguen valiendo).
- Decisiones de producto: deducción y estilo **solo en el nivel 3**; se enseña lo que deduce de tu equipo; variantes de reparto para sets propios; objetivo ≥ 67 % en individuales. La [fase 12](docs/fases/fase-12.md) será el banco de pruebas de equipos.
- Tests (310 en `npm run check`): observaciones, creencias (incluida la invariancia frente a lo oculto), variantes, cláusula de objeto, estilo y olvido tras rebobinar; ida y vuelta del protocolo con `beliefs`; el panel de la web.
- Documentación: [ADR-0012](docs/adr/0012-deduccion-de-sets-y-estilo-del-rival.md), [guía del bot](docs/guias/bot.md) y brief de la [fase 12](docs/fases/fase-12.md).

#### Cambiado

- **Nivel 3 contra nivel 2** (arena, equipos aleatorios con vista previa, equipo cerrado): **individuales 67,1 %** en 2387 combates con dos semillas (67,7 % y 66,5 %; la configuración de la fase 10 da 64,2 % en la primera). **Dobles 80,8 %** en 608 combates (fase 10 con las mismas semillas: 80,3 %). Tiempo medio por decisión: 0,41 s en individuales y 0,55 s en dobles. Objetivo cumplido.

#### Aprendido

| Variante (individuales, semilla 1, ≈ 1200 combates) | Victorias |
|---|---|
| Fase 10 (sin deducción ni estilo) | 64,2 % |
| **Deducción + estilo** | **67,7 %** |
| … + hojas con el set de la suposición del fork | 67,1 % (descartada) |

En dobles (304 combates por variante, semilla d1), sin estilo 80,3 % y sin deducción 82,9 %: dentro del ruido, así que se deja todo activo en los dos modos.

### Iconos de los objetos (2026-10-08)

- Web: **iconos de los objetos** (`ItemIcon`) en la lista de miembros y el selector de objeto del teambuilder, la ficha del combate, la vista previa de equipos y «Cargar set» de la calculadora.
- `npm run data:sprites`: los 41 objetos sin sprite en PokeAPI (megapiedras nuevas, Pluma Feérica, Puerro) se recortan de la hoja de iconos de Showdown por su `spritenum` (dependencia nueva del pipeline: `pngjs`).
- Web: el manifest de sprites sin `fallbacks.pokemon` (una pasada con todo en caché) ya no rompe la página.

### Fase 10 — Pulido de herramientas y nivel 3 más fuerte en individuales (2026-10-08)

#### Añadido

- **«Calcular» en el combate**: abre la calculadora en **otra pestaña** con tu Pokémon activo atacando al del rival (en dobles, un menú con las parejas), con PS, estado, cambios de características, Mega y el campo. **Sin información oculta**: con equipo cerrado el rival lleva su set estándar más probable (`OpponentModel`, el que supone el bot) con lo revelado encima; con equipo abierto, su set real (`features/calc/from-battle.ts`).
- **Calculadora**: interruptor **Crítico** y **efectos** de campo: Gravedad, Zona Mágica, Zona Extraña y, en dobles, Refuerzo (aliado del atacante) y Compiescolta (aliado del defensor). `estimateDamage` acepta `{ crit }` (con su propia entrada de caché) y `FieldState.boosts`; `CalcRequest` gana `crit`, `helpingHand`, `friendGuard`, `gravity`, `magicRoom` y `wonderRoom`.
- **Renombrar replays** en la lista y en el visor (`PATCH /api/replays/:id` con `{ name }`, `RenameReplayRequestSchema`).
- **Tests E2E con Playwright** (`tools/e2e`, `npm run e2e`; `npm run e2e:install` descarga Chromium): importar un equipo y usarlo, combate contra el nivel 0 con vista previa, un movimiento por atajo, «Calcular», rendirse y guardar el replay; renombrar, ver y borrar el replay; calculadora con crítico y Refuerzo. Corren contra el servidor de producción con `STORAGE_DIR` temporal. **Job propio en la CI** (`e2e`), fuera de `npm run check`.
- Servidor: `STORAGE_DIR` lleva equipos, rivales y replays a otra carpeta.
- `@colleja/bot/opponent-model`: entrada aparte de `OpponentModel` para la web (el índice del paquete arrastraría `@smogon/calc`; un test lo impide).
- Web: `ActionSelect` (menú de acciones del marcador: «Rebobinar», «Calcular»), `IconCalc`, `RenameForm`.
- **Nivel 3** ([ADR-0011](docs/adr/0011-nivel-3-con-equipo-completo.md)):
  - **Cadena de equipo completo** (`analysis/team-chain.ts`, `teamChainValue`): duelos encadenados de los dos equipos enteros. En individuales entra en la valoración de cada hoja (`chainWeight` 0,4) con los banquillos de los dos lados en el fork (`search/lineups.ts`), y decide los **relevos forzosos** del nivel 3.
  - **Penalización de bucles de cambios** (`loopPenalty`, `recentSwitches`): sin ella, dos bots podían cambiar de Pokémon cada turno para siempre (combates de cientos de turnos en el arena).
  - `simulateDuel` acepta los PS de partida aparte (`DuelStart`) y `withFreshness`, para que la cadena reutilice las cachés.
- Decisiones de producto: «Calcular» en otra pestaña; E2E en un comando aparte con su job de CI; nivel 3 con ≤ ~1 s de media; cerrar la fase con lo conseguido en el nivel 3.
- Tests (≈ 300 en `npm run check` + 5 E2E): crítico y efectos contra `@smogon/calc`; `/api/calc` con los campos nuevos; renombrar replays (200, 400, 404) y en la lista; «Calcular» sin información oculta (equipo cerrado y abierto, objeto perdido, campo, parejas en dobles); la web no importa el índice del bot; `teamChainValue` y `recentSwitches`; ida y vuelta del protocolo.
- Documentación: [ADR-0011](docs/adr/0011-nivel-3-con-equipo-completo.md), guías de [herramientas](docs/guias/herramientas.md) y del [bot](docs/guias/bot.md), y la propuesta de la [fase 11](docs/fases/fase-11.md).

#### Cambiado

- **Nivel 3 contra nivel 2** (arena, equipos aleatorios con vista previa, equipo cerrado, sin elecciones inválidas): **individuales 65,8 %** en una semilla nueva (600 combates, IC 95 % ≈ 62–69 %) y **≈ 64,4 %** sumando las tres semillas medidas (1800 combates), frente al 58,5 % de partida en las mismas condiciones; **dobles 81,3 %** (300 combates; antes 78,6 %). Tiempo medio por decisión: 0,54 s en individuales y 0,41 s en dobles. El objetivo era ≥ 65 % sostenido: se cierra con lo conseguido (decisión del usuario) y la deducción de sets del rival queda para la [fase 11](docs/fases/fase-11.md).
- La explicación del nivel 3 describe su valoración con los dos equipos y sus relevos en individuales (`EXPLANATION_METHODS.teamChain`).
- El bundle de la web pasa a ≈ 1,59 MB (≈ 350 KB con gzip).

#### Aprendido al ajustar el nivel 3 (individuales contra el nivel 2, 600 combates por variante, combates de más de 150 turnos como empate)

| Variante | Semilla A | Semilla B |
|---|---|---|
| Fase 9 | 58,4 % | 58,7 % |
| Cadena en la hoja, peso 0,3 / 0,5 / 0,7 / 1 | 64,2 / 62,8 / 59,0 / 52,7 % | — |
| Cadena 0,5 + relevos por cadena | 64,6 % | 62,7 % |
| Cadena 0,5 + penalización de bucles 4 | 64,0 % (la mitad de combates eternos) | — |
| Cadena 0,3 / **0,4** + relevos + bucles | 62,4 / **63,5 %** | 64,2 / **63,9 %** |
| … + el doble de muestras (12 turnos, 4 suposiciones) | — | 62,8 % (el doble de tiempo) |
| … + estimación del nivel 2 con peso 0,3 | — | 63,6 % |
| Cadena **por opción** (cada opción del nivel 2 jugada con los dos equipos), 0,5 sin nivel 2 / 0,3 | — | 60,5 / 63,0 % (más lenta) |
| Vista previa por cadenas contra los grupos probables del rival | 58,5 % | — |
| No vistos ordenados por lo que le conviene traer al rival | 60,3 % | 65,0 % |
| **Con equipo abierto** (techo): fase 9 / configuración elegida | — | 65,9 / **70,7 %** |

La configuración elegida es la de cadena 0,4 + relevos + bucles: 65,8 % en la semilla de validación. La información oculta cuesta ≈ 7 puntos; más muestras no ayudan.

### Fase 9 — Bot nivel 3 "Experto" (2026-10-08)

#### Añadido

- **Nivel 3 "Experto"** (`ExpertAgent`, ahora **el rival por defecto** en la web, el servidor y el CLI): el nivel 2 más un turno por adelantado con el **simulador real**. Bajo varias suposiciones de los sets rivales, juega cada opción contra las respuestas probables del rival (el nivel 2 jugando su lado) y valora cada posición resultante con el balance de PS y el cambio que espera el nivel 2 desde ahí ([ADR-0010](docs/adr/0010-bot-experto-con-sandbox.md)). Explica sus decisiones como los demás.
- Resultados (arena, equipos aleatorios con vista previa, sin elecciones inválidas): **nivel 3 contra nivel 2: 61,8 % en individuales** (602 combates, IC 95 % ≈ 58–66 %) y **78,6 % en dobles** (308 combates, IC ≈ 74–83 %). Tiempo por decisión: 0,3 s de media en individuales y 0,4 s en dobles; máximo ≈ 1 s.
- **Sandbox de combate** (`@colleja/core`: `BattleSandbox`, `SandboxBattle`, `RivalAssumption`; `@colleja/engine`: `sandbox.ts`): `AgentContext.sandbox` permite, al elegir movimientos, forkar la posición real **sin información oculta** (sets del rival supuestos, PS del rival en el % visible, generador aleatorio nuevo con suerte común por acción, duración del sueño sorteada otra vez, sin elecciones ya hechas ni `inputLog`) y clonar forks.
- `@colleja/bot`: `search/assumptions.ts` (`rivalAssumptions`), `search/lookahead.ts` (`searchMoves`, `rankedOptions`, `SEARCH_SETTINGS`), `singlesBaseline`/`doublesBaseline`, `EXPLANATION_METHODS.lookahead`. Nivel 3 en `BOT_LEVELS`, `createBot(3)` y `BotLevelSchema`.
- Tests (285 en total): sandbox (cuándo existe, sustitución de sets vistos y no vistos, PS visibles, reproducible, combate real intacto, posiciones viejas); nivel 3 (**misma decisión y explicación aunque cambie lo que oculta el rival**, sin sandbox = nivel 2, determinismo, combates sin elecciones inválidas, explicación sin cambiar decisiones); la sala envía el turno antes de que piense el bot.
- Documentación: [ADR-0010](docs/adr/0010-bot-experto-con-sandbox.md), guías del [bot](docs/guias/bot.md), de [combates](docs/guias/combate.md) y de la [web](docs/guias/web.md), y la propuesta de la fase 10.

#### Cambiado

- **El bot piensa mientras eliges**: cuando los dos lados eligen a la vez, la sala envía primero el turno al jugador y después decide el bot.
- `estimateDamage` cachea por contenido (atacante, defensor, movimiento y campo): mismas decisiones, la mitad de tiempo en el nivel 3.
- `planSingles` saca a una función (`nextInLine`) quién entraría gratis si cae el activo; el nivel 2 decide igual.
- `npm run play` y `npm run arena` aceptan `--bot 3` / `--a 3` / `--b 3`. Los tests del CLI fijan `--bot 2` para no alargar el check.

#### Aprendido al ajustar el nivel 3 (individuales contra el nivel 2, 280 combates por variante)

| Variante | Victorias |
|---|---|
| Un solo resultado aleatorio por hoja | 48,6 % |
| 8 turnos por opción y suposición; ×2 turnos no cambia nada | 50–51 % |
| Estimación del nivel 2 sumada tal cual, peso 0,5 | 57,1 % |
| **Cambio esperado** por el nivel 2 (estimación − lo que valdría sin cambios), peso 1 / 0,5 / 0,25 | 61,3 / 61,8 / 59,3 % |
| Temperatura de las respuestas del rival 5 / 15 / 30 | 62,1 / 61,8 / 58,2 % |
| Estimación simétrica (también la del rival) | 61,1 % |

En dobles, peso 1 → 75,7 % y peso 0,5 → 81,4 %.

### Rediseño de la web (2026-10-08)

#### Cambiado

- **Interfaz rehecha desde cero** con un sistema de diseño propio, estética de «retransmisión de torneo» ([ADR-0009](docs/adr/0009-sistema-de-diseno.md)), elegida entre tres direcciones exploradas en Claude Design: tinta casi negra, acento voltio para ti y magenta para el rival, Barlow y Barlow Condensed, esquinas biseladas en la acción principal e iconos propios.
- **Inicio** como un versus: tu equipo y el rival frente a frente con sus seis huecos, y una barra inferior con dificultad, opciones y «Combatir».
- **Combate**: marcador (jugadores, turno y herramientas), escenario con plataformas y tarjetas de PS segmentadas, movimientos teñidos por tipo con su atajo de teclado visible, cambios con barra de PS y fin de combate con «Victoria/Derrota» a gran tamaño. Durante la vista previa no se muestra el campo vacío; la elección se ve en huecos con el líder marcado.
- **Equipos, rivales y replays** como listas de filas; **editor** con nombre editable como titular, estado en chips y ficha con sprite sobre el color de su tipo, deslizadores propios de Stat Points y movimientos numerados; **calculadora** con barra del rango de daño sobre los PS del defensor.
- **Textos**: fuera subtítulos, explicaciones y *hints* redundantes; los estados son chips y las descripciones largas, `title`. Algunos nombres cambian: «Por qué jugó así el bot», «Combatir», «De mis equipos», «Nuevo rival».
- Contraste WCAG AA en todos los textos de los dos temas; tema claro revisado.
- **Miniaturas de Pokémon con el render de Champions** en lugar de los iconos de Gen 8. Faltaban 93 iconos (Gen 9 y las Megas nuevas) y su respaldo, el render, salía mucho más grande que el pixel art. `npm run data:sprites` ya no descarga `icons/` (puedes borrar `assets/sprites/icons/`).

#### Añadido

- Web: `components/icons.tsx`, `components/TeamSlots.tsx` y nuevos bloques en `components/ui.tsx` (`buttonClass`, `IconButton`, `PageHeader`, `Field`, `TextInput`, `Select`, `Chip`, `LegalityChip`, `Notice`, `Loading`, `Empty`, `inputClass`, `textareaClass`). Dependencias `@fontsource/barlow` y `@fontsource/barlow-condensed`.

### Fase 8 — Herramientas de práctica (2026-10-08)

#### Añadido

- **Calculadora de daño** (`/calculadora`, enlace en la cabecera): atacante y defensor con la ficha del teambuilder, su estado (Mega, PS, estado alterado, cambios de características) y el campo (modo, clima, campo, pantallas). Calcula los cuatro movimientos del atacante a la vez (rango en PS y %, probabilidad de KO y golpes para KO), con "Intercambiar" y "Cargar de mis equipos". Corre en el servidor (`POST /api/calc`) con el mismo `estimateDamage` que usa el bot.
- **Replays guardados** (`/replays`): "Guardar replay" al terminar un combate (`battle:save-replay` → `battle:replay-saved`), lista con resultado y equipos, descarga y borrado con confirmación, y **visor turno a turno** con el campo, el log y lo que valoró el bot. Ve todo (PS exactos y equipos completos) o "Como jugador". Se guardan en `storage/replays/<id>.json` (`FileReplayRepository`); rutas `GET /api/replays`, `GET/DELETE /api/replays/:id`.
- **"¿Por qué hizo eso el bot?"** en el combate: tras resolverse cada turno, las opciones que valoró el bot con su puntuación y la elegida marcada. Con equipo cerrado, lo que aún no has visto sale como "algo que aún no has visto".
- **Decisiones de producto**: calculadora en el servidor; replays **solo si los pides**; explicación **tras cada turno**; visor que lo muestra todo con interruptor "Como jugador"; lo no revelado se oculta en la explicación.
- `@colleja/core`: `DecisionExplanation`, `TurnExplanation`, `redactExplanation` y `BattleAgent.explain?()`.
- `@colleja/bot`: los tres niveles explican su última decisión (bajo demanda, sin tocar el generador aleatorio); `describeAction`, `EXPLANATION_METHODS`. `planDoubles` devuelve también las parejas evaluadas.
- `@colleja/protocol`: `calc.ts`, `replays.ts` (`ReplayDataSchema`, `ReplayContentSchema`, `TurnExplanationSchema`) y `explanations` en `battle:update`/`battle:snapshot`.
- Tests (270 en total): mismas decisiones con y sin explicación en los tres niveles y dos modos; calculadora = `estimateDamage`; explicaciones solo de turnos resueltos y sin movimientos no vistos; guardar, listar, leer y borrar replays; pasos del visor, panel, store y calculadora en la web.
- Documentación: [guía de herramientas](docs/guias/herramientas.md), [ADR-0008](docs/adr/0008-herramientas-de-practica.md) y el brief de la fase 9 (propuesta de ampliaciones).

#### Cambiado

- `SetEditor` admite no tener botón "Quitar" (`onRemove` opcional) para reutilizarse en la calculadora.
- La cabecera tiene cinco secciones (Combate, Equipos, Rivales, Calculadora, Replays) y se desplaza en horizontal en pantallas estrechas.
- `testServer()` recibe también `replaysDir`.
- El bundle de la web pasa a ≈1,57 MB (≈344 KB con gzip).

### Fase 7 — Rivales guardados (2026-10-08)

#### Añadido

- **Rivales** en la web (`/rivales`, enlace "Rivales" en la cabecera): equipos para el bot con su **dificultad**.
  - **Nuevo rival**: generar uno aleatorio (individuales o dobles), copiar uno de tus equipos, importar texto de Showdown (con nombre, modo y dificultad) o desde cero. El aleatorio y la copia se abren como **borrador sin guardar**.
  - **Editor**: el del teambuilder, con el selector de dificultad en la cabecera y "Usar como rival".
  - **Lista** con iconos, modo, dificultad, fecha y estado, y las acciones usar como rival, editar, duplicar y borrar (con confirmación).
- **Inicio**: el "Equipo rival" puede ser **aleatorio, guardado o pegado**. Al elegir un rival guardado se aplica su dificultad, que se puede cambiar (el inicio recuerda la guardada). `battle:start` acepta `opponent: { kind: 'saved', opponentId }`.
- **Persistencia** (`apps/server`): `OpponentRepository`/`FileOpponentRepository`, un JSON legible por rival en `storage/opponents/<id>.json` (con su export de Showdown). CRUD en `GET/POST /api/opponents`, `POST /api/opponents/import` y `GET/PUT/DELETE /api/opponents/:id`, con los `problems` en cada respuesta. Carpeta configurable con `buildServer({ opponentsDir })`.
- **Decisiones de producto**: los rivales son una **colección aparte**; **solo se guarda la dificultad** (las opciones de práctica son de cada combate); en el inicio **se aplica la dificultad del rival y se puede cambiar**; un rival generado **hay que guardarlo** para combatir contra él.
- `@colleja/protocol`: `OpponentContentSchema` (`TeamContentSchema` + `botLevel`), `SavedOpponentSchema`, `SavedIdSchema`, los cuerpos y respuestas de `/api/opponents` y `OpponentSummary`.
- Web: `EditorDestination` (el editor guarda en equipos o en rivales), `BotLevelSelect`, `useMeta()` y la lista compartida (`SavedListLayout`, `SavedCard`, `ImportSavedDialog`).
- Tests (247 en total): repositorio de rivales, CRUD por HTTP (400, 404, problemas, importar, persistencia tras reiniciar), combate contra un rival guardado en los dos modos (el bot lleva exactamente ese equipo y ese nivel) y errores si no existe o es ilegal; esquemas; store del editor con los dos destinos, "Generar aleatorio", lista de rivales, "Usar como rival" e inicio con rival guardado.
- Documentación: [guía de rivales](docs/guias/rivales.md), [ADR-0007](docs/adr/0007-rivales-guardados.md) y el brief de la fase 8.

#### Cambiado

- **Repositorio genérico** `FileJsonRepository` (`apps/server/src/storage/json-repository.ts`): `FileTeamRepository` y `FileOpponentRepository` son subclases. El formato de los ficheros de equipos no cambia.
- El editor (`TeamEditorPage`, `team-editor-store.ts`) recibe un destino; el store guarda `savedId` en lugar de `teamId`.
- `SavedTeamPicker` sirve para tu equipo y para el rival. `TeamIdSchema` es ahora un alias de `SavedIdSchema` (mensaje "Id no válido.").
- `testServer()` de los tests del servidor recibe `{ teamsDir, opponentsDir }`.

### Fase 6 — Teambuilder y equipos guardados (2026-10-08)

#### Añadido

- **Teambuilder** en la web (`/equipos`, enlace "Equipos" en la cabecera):
  - **Lista** de equipos con iconos, modo, fecha y estado (legal o con N problemas), y acciones nuevo, importar, editar, duplicar, borrar (con confirmación) y **usar en combate**.
  - **Editor** con los Pokémon a la izquierda y la ficha a la derecha (una cosa cada vez en móvil): buscador de especies (español, inglés o número), mote, género, shiny, habilidad con descripción, objeto (megapiedras solo para su especie y aviso de Item Clause), naturaleza, **Stat Points con stats en vivo** (y los de la Mega con su piedra), 4 buscadores de movimientos **filtrados por learnset** con tipo, categoría, potencia, precisión y PP, y **set sugerido** desde los sets estándar.
  - **Problemas en vivo junto al campo** que los causa, con contador por Pokémon. Al guardar se añaden los del validador de Showdown.
  - **Importar y exportar** en formato de Showdown, el equipo entero o un Pokémon. El texto que no cabe (más de 6, más de 4 movimientos, Stat Points de más, motes largos) se ajusta y se avisa de cada cambio.
  - Guardado explícito con aviso al salir con cambios sin guardar.
- **Inicio**: "Tu equipo" puede ser **guardado** o **pegado**. `battle:start` acepta `teamId` en lugar del texto.
- **Persistencia** (`apps/server`): `TeamRepository` y `FileTeamRepository`, un JSON legible por equipo en `storage/teams/<id>.json` (con su export de Showdown), escritura atómica e ids seguros como nombre de fichero. CRUD en `GET/POST /api/teams`, `POST /api/teams/import` y `GET/PUT/DELETE /api/teams/:id`; cada respuesta lleva los `problems` del equipo. Carpeta configurable con `buildServer({ teamsDir })`.
- **Decisiones de producto**: un equipo con problemas **se guarda como borrador** (solo se exige legalidad para combatir); el modo del equipo es el **preferido** y vale para los dos si es legal; editor con lista a la izquierda y ficha a la derecha; botón de set sugerido.
- `@colleja/core`: `checkTeamIssues`/`checkSetIssues` (cada problema con su miembro, campo y tipo) y `fitTeamToLimits` (ajusta texto importado a los límites del editor).
- `@colleja/protocol`: `PokemonSetSchema`, `TeamSchema`, `TeamContentSchema`, `TeamIdSchema` y los cuerpos y respuestas de `/api/teams`.
- Web: componentes `Combobox` (buscador accesible, sin acentos, en los dos idiomas), `Dialog` y `TypeBadge`.
- Tests (231 en total): repositorio en carpeta temporal, CRUD por HTTP (400, 404, problemas, importar, persistencia tras reiniciar), `battle:start` con `teamId` en los dos modos, esquemas, problemas por campo, `fitTeamToLimits`, `team-draft` y componentes (editor de Stat Points, buscador de movimientos, import/export y la lista).
- Documentación: [guía del teambuilder](docs/guias/teambuilder.md), [ADR-0006](docs/adr/0006-equipos-guardados-y-teambuilder.md) y el brief de la fase 7.

#### Cambiado

- `checkTeam` marca a **cada** miembro que repite objeto (Item Clause) en los problemas por campo y no repite el mismo mensaje.
- Las rutas de equipos del servidor pasan a `routes/teams.ts`, y la validación de equipos a `teams/team-problems.ts` (`teamProblems`).
- El bundle de la web pasa de ≈1,2 MB a ≈1,5 MB (≈336 KB con gzip).

### Fase 5 — Servidor y UI de combate: MVP en el navegador (2026-10-08)

#### Añadido

- **`npm run dev`**: servidor + web en http://127.0.0.1:5173. **`npm start`** compila la web y la sirve desde el servidor (http://127.0.0.1:3001). `npm run build` solo compila. El lanzador está en `tools/dev`.
- `apps/web` (React 19, Vite 8, Tailwind 4, Zustand, React Router):
  - **Inicio**: modo, tu equipo pegado en formato Showdown con comprobación en vivo (o uno aleatorio), rival aleatorio o pegado, dificultad (niveles del bot), vista previa, equipo abierto, nombre y semilla. Recuerda el último equipo y las opciones.
  - **Combate** al estilo Showdown:
    - Campo con sprites, PS (exactos los tuyos y en % los del rival), estado, cambios de características, Mega, y objeto y habilidad revelados.
    - Clima, terreno, Espacio Raro y condiciones de cada lado.
    - Equipos en iconos y vista previa (6 → 3/4).
    - Menús desde `getSlotOptions`: movimientos con tipo, PP y categoría, Megaevolucionar, **objetivos en dobles** posición por posición con "Atrás", cambios y cambios forzados.
    - Atajos de teclado (1–4, 5–9, Esc).
    - Log en español y barra con **deshacer**, **rebobinar a un turno**, **rendirse** y **replay**.
    - Pantalla final con revancha.
    - Se reengancha al combate tras una recarga o un corte de conexión.
  - **Decisiones de producto**: estilo Showdown, tema oscuro por defecto con opción clara, animaciones mínimas (barras de PS) y **selector ES/EN de nombres** (la interfaz y el log siguen en español).
- `apps/server` (Fastify 5 + `@fastify/websocket`):
  - REST: `GET /api/meta`, `POST /api/teams/validate`, `POST /api/teams/random`.
  - WebSocket `/ws` con un combate por conexión (`BattleManager`/`BattleRoom`), el bot en p2 y limpieza de combates abandonados.
  - **Solo envía la perspectiva p1**. El replay, que lleva el log omnisciente, solo se entrega al terminar.
  - Escucha en `127.0.0.1` (`SERVER_PORT`/`SERVER_HOST`) y sirve `/sprites/*`.
- `packages/protocol` (`@colleja/protocol`): esquemas zod de todos los mensajes (`battle:start/choose/undo/rewind/forfeit/export/resume` → `battle:started/update/snapshot/replay/error`) y de las peticiones REST, con errores en español.
- `packages/narration` (`@colleja/narration`, apto para navegador): **log con las plantillas de Showdown**.
  - Port tipado de `BattleTextParser` del cliente de Showdown (MIT), con la gramática española (artículos, género, "del/al", forma "classified" de los objetos) y el nombre de la forma Mega.
  - El idioma de los nombres se elige aparte.
  - Incluye el narrador y los nombres que antes vivían en el CLI. **El CLI narra ahora igual que la web.**
- Datos: el pipeline exporta las plantillas de mensajes de combate a `packages/data/generated/text/{es,en}.json` (solo efectos de Champions, ≈70 KB) con `getBattleText`. Las 27 plantillas que faltaban en español se completan en `packages/data/overrides/battle-text.es.json`.
- `engine`:
  - `decideFor(session, side, agent)`: una decisión de un agente, con reintentos tras `[Unavailable choice]`. La usan `playOut`, el CLI y el servidor.
  - `BattleSession.forfeit(side)`.
- Tests (197 en total):
  - Protocolo (ida y vuelta y mensajes mal formados).
  - Narración: español con gramática, inglés, nombres en otro idioma y combates completos sin marcadores sin resolver.
  - Servidor: REST, un combate completo por WebSocket en cada modo contra el nivel 2, **información oculta**, equipos ilegales, elección rechazada, deshacer, rebobinar, reconexión, rendirse y replay.
  - Web: borrador de elección, menús de dobles con Testing Library y happy-dom, vista previa, store y regla de dependencias.
  - `decideFor` y `forfeit`.
- Documentación: [guía de la web](docs/guias/web.md), [ADR-0005](docs/adr/0005-servidor-web-y-narracion.md) y el brief de la fase 6.

#### Cambiado

- La web reconstruye el estado con `BattleView` de `core` en lugar de `@pkmn/client`. El spike de este mostró que sus datos de movimientos son los de Escarlata/Púrpura: 434 de 511 difieren de Champions ([ADR-0005](docs/adr/0005-servidor-web-y-narracion.md)).
- Biome entiende las directivas de Tailwind en el CSS. Vitest incluye tests `.tsx`.

#### Corregido

- `parseCondition` (core) devolvía `NaN` cuando el PS del rival estaba justo al 20 % o al 50 %, porque Champions añade el color de la barra (`50/100y`). Afectaba al estado del campo y a los bots.

### Fase 4 — Bot (niveles 1 y 2), generador de equipos y arena (2026-10-07)

#### Añadido

- `packages/teamgen` (`@colleja/teamgen`, apto para navegador): `generateTeam(modo, { seed })`, equipos aleatorios legales a partir de los sets estándar, deterministas por semilla. Cláusulas de especie y objeto, **como mucho una megapiedra** (decisión de producto) y como mucho 3 miembros débiles al mismo tipo.
- `@colleja/bot`:
  - **Nivel 1, agresivo** (`AggressiveAgent`): el máximo daño esperado por posición, prioridad que asegura KOs, nunca golpea al aliado salvo que sea inmune, Mega en cuanto puede.
  - **Nivel 2, táctico** (`TacticalAgent`): valora cada opción **simulando sus consecuencias** con daño esperado. Duelos en individuales (KO races, cambios que reciben el golpe, sacrificar o salvar, mejoras, estados, recuperación, Protección, Sorpresa) y turnos 2 contra 2 en dobles (concentrar ataques, Protección, Sorpresa, Refuerzo, Señuelo, Viento Afín, Espacio Raro, pantallas, ataques en área). Vista previa por cobertura. Ver [ADR-0004](docs/adr/0004-bot-por-simulacion.md).
  - Análisis compartido: estimador de daño con **`@smogon/calc` 0.12.0** (Champions = generación 0), modelo del rival (sets estándar filtrados por lo revelado, del más ofensivo al menos; el set real con equipo abierto), `createBot` y `BOT_LEVELS` (nombres y descripciones en español).
  - Los bots **no conocen los sets del rival** con equipo cerrado (decisión de producto).
- `tools/arena`: `npm run arena -- --a 2 --b 0 --battles 500` (`--mode singles|doubles|both`, `--seed`, `--no-preview`, `--open-team-sheets`). % de victorias con intervalo de confianza, turnos, tiempos, elecciones inválidas y replays de los combates que fallen en `storage/arena/`.
- `npm run play`: `--bot 0|1|2` (por defecto **2**, decisión de producto) y `--opponent-team random` por defecto.
- `BattleView` (core) sigue además el turno de entrada y el último movimiento de cada Pokémon, y los objetos y habilidades revelados por etiquetas `[from] item:` / `[from] ability:`.
- Tests (130 en total): contraste de la calculadora con el motor (stats en todos los sets estándar y daño real en primeros golpes), modelo del rival, escenarios guionizados de los niveles, fuzz de los niveles 1 y 2 (100 combates por modo) y del 0 (ya con `teamgen`), equipos legales en 300 semillas por modo, arena (recuento, reproducibilidad y una prueba corta de fuerza) y CLI con `--bot`.
- Documentación: `docs/guias/bot.md`, ADR-0004 y el brief de la fase 5 (`docs/fases/fase-5.md`).

#### Resultados del arena (500 combates por modo, semilla `arena`, sin elecciones inválidas)

| A contra B | Individuales | Dobles |
|---|---|---|
| Nivel 2 contra 0 | **93,6 %** (IC 95 %: 91,1–95,4) | **91,8 %** (89,1–93,9) |
| Nivel 1 contra 0 | 93,8 % (91,3–95,6) | 94,0 % (91,6–95,8) |
| Nivel 2 contra 1 | 61,2 % (56,9–65,4) | 67,2 % (63,0–71,2) |

Tiempo por decisión: ≈1,3 ms el nivel 1 y ≈3 ms el nivel 2. Un combate entre bots dura ≈20–50 ms.

#### Cambiado

- El fuzz del nivel 0 usa `teamgen` en lugar de su generador mínimo.

### Fase 3 — Dominio, motor y primer combate jugable (2026-10-07)

#### Añadido

- `packages/core` (`@colleja/core`): dominio puro, apto para navegador.
  - Tipos `PokemonSet`, `Team`, `RulesetId`, `BattleOptions` y `SideId`.
  - Stats de Champions como estrategia por reglamento (`championsStats`, `getStatCalculator`), también para la Mega Evolución.
  - Stat Points: límites leídos del formato, puntos restantes, `setStatPoint` (con recorte) y problemas en español.
  - Import/export en formato Showdown (`parseShowdownTeam`, `formatShowdownTeam`) con problemas en español.
  - Comprobación rápida de equipos para la UI (`checkTeam`): tamaño, cláusulas de especie y objeto, learnsets, habilidades y Stat Points.
  - Peticiones del motor tipadas, elecciones tipadas (`Choice`) con su serializador y parser, `getSlotOptions` (movimientos, objetivos en dobles, cambios, Mega) y `validateChoice`.
  - `BattleView`: estado del combate reconstruido desde el protocolo de una perspectiva.
  - `BattleAgent`/`AgentContext` (interfaz de los jugadores) y `SeededRandom`.
- `packages/engine` (`@colleja/engine`, solo Node):
  - `validateTeam` con el `TeamValidator` de Showdown, conversión de sets y `resolveFormat` (modo + opciones → formatid con reglas `@@@`).
  - `BattleSession` síncrona sobre `Battle`: eventos por perspectiva, pre-comprobación de elecciones, `rewindTo`/`undo`, `exportReplay`/`fromReplay` y opciones de práctica (sin vista previa, equipo abierto).
  - `playOut` para enfrentar dos agentes.
- `packages/bot` (`@colleja/bot`): `RandomAgent`, bot de nivel 0 (port tipado de `RandomPlayerAI`).
- `tools/cli`: `npm run play`, combate en la terminal contra el bot en individuales y dobles, con menús numerados, narración en español, `deshacer`, `rebobinar N`, `exportar` (a `storage/replays/`) y `salir`, también al terminar el combate.
- Tests (101 en total):
  - Stats de core = stats del motor en los ≈950 sets estándar.
  - Determinismo, replays y rebobinado en ambos modos.
  - Fuzz del bot: 200 combates sin elecciones inválidas en `npm run check` (2000 comprobados a mano).
  - CLI `--auto` en ambos modos y una partida humana guionizada.
- Documentación: `docs/guias/combate.md`, ADR-0003 y el brief de la fase 4 (`docs/fases/fase-4.md`).

### Preparación del traspaso (2026-10-07)

#### Añadido

- `docs/fases/fase-3.md`: brief de traspaso de la fase 3 (objetivo, diseño recomendado, tests, criterios de "hecho") con hechos del motor **verificados**:
  - El motor sigue pidiendo elegir equipo aunque se quite la regla Team Preview.
  - Sintaxis de las reglas `@@@`.
  - Formato de `inputLog` para rebobinar.
  - `toJSON`/`fromJSON`.
- `AGENTS.md` reorganizado como punto de entrada: cómo continuar una fase, protocolo de cierre de fase, preferencias del usuario y puesta en marcha.
- CI en GitHub Actions: `npm run check` en cada push y en cada PR.
- Recomendaciones y ajustes de VS Code (Biome, Vitest).

### Fase 2 — Pipeline de datos (2026-10-07)

#### Añadido

- `packages/data` (`@colleja/data`): datos de Champions Reg M-C generados y versionados, con una API tipada apta para navegador:
  - `getSpecies`, `getLearnset`, `canLearn`, `getStandardSets`, `getName`, `getDescription`, `getTypeEffectiveness`…
  - 269 especies seleccionables (231 nº de Pokédex), 82 Megas y 7 formas de combate.
  - 511 movimientos con los PP de Champions, 215 habilidades, 166 objetos (81 megapiedras) y 25 naturalezas.
  - Tabla de tipos, learnsets y los formatos de individuales (6 → 3) y dobles (6 → 4).
- Sets estándar: ≈490 en individuales y ≈460 en dobles, uno por rol de los *random sets* de Champions. Llevan Stat Points y naturaleza heurísticos, y **todos están validados** con el validador de Champions.
- Español:
  - Nombres oficiales de PokeAPI, con la traducción de Showdown como respaldo y nombres derivados para las Megas de Z-A y las formas regionales.
  - Descripciones del juego, salvo en los 20 efectos que Champions modifica (ahí se usa el texto de Champions en inglés).
- `packages/data/overrides/` para sets propios (formato export de Showdown) y para corregir nombres en español.
- `tools/data-pipeline`:
  - `npm run data:build` (determinista; PokeAPI fijada por commit y descargada desde GitHub).
  - `npm run data:sprites` (renders de Champions, iconos y objetos en `assets/`, no versionado).
- Tests:
  - De los datos (recuentos, cambios de Champions, i18n, coherencia de los sets).
  - Del pipeline (CSV, heurística de Stat Points, nombres).
  - Uno de **consistencia** que regenera los datos desde el motor y detecta si están desactualizados.
- Documentación: `docs/guias/datos.md` y ADR-0002.

### Fase 1 — Cimientos (2026-10-07)

#### Añadido

- Repositorio git y monorepo con npm workspaces (`packages/*`, `apps/*`, `tools/*`).
- Tooling: TypeScript 7 (`strict`, Bundler), Biome 2 (formato y lint), Vitest 5, tsx. Node ≥ 24.
- Pokémon Showdown vendorizado como submódulo git superficial en `vendor/pokemon-showdown`, **fijado a `c046106`** (2026-10-06, Reg M-C).
- `tools/setup`: setup idempotente de Showdown (submódulo + `npm ci --ignore-scripts` + build + tipos). Se ejecuta en `postinstall`.
- `packages/showdown` (`@colleja/showdown`): puente único y tipado hacia el simulador, con los formatos Champions en `CHAMPIONS_FORMATS`.
- `tools/smoke`: combates headless deterministas entre bots aleatorios de Showdown.
  - Dos equipos fixture legales, validados en BSS Reg M-C y en VGC Reg M-C.
  - Combates aleatorios con sets de random battle de Champions.
  - Recuento de Megaevoluciones.
- Tests:
  - Fórmula de Stat Points verificada a través del motor.
  - Límites de SP del validador.
  - Legalidad de los fixtures.
  - Determinismo por semilla.
- `AGENTS.md` / `CLAUDE.md` con comandos, reglas de dependencias y particularidades de Champions.

### Fase 0 — Investigación y plan (2026-10-07)

#### Añadido

- `docs/PLAN.md`: arquitectura, stack, hoja de ruta y decisiones.
- Investigación en `docs/research/`:
  - Pokémon Champions Reg M-C.
  - Mecánicas Gen 9.
  - Stack técnico.
  - Anexos con el roster y los objetos.
- ADR-0001: envolver el simulador de Showdown.
