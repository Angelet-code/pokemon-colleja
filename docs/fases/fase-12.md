# Fase 12 — Banco de pruebas de equipos

> **Brief de la fase.** Escrito el 2026-10-08 al cerrar la fase 11, con la decisión del usuario.
> Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md) (sección del arena), la del [teambuilder](../guias/teambuilder.md) y la de [rivales](../guias/rivales.md).

## Objetivo

Ayudar al usuario a **montar su equipo perfecto** con una medida objetiva: el bot juega **tu equipo guardado** contra **tus rivales guardados** durante N combates y da el **% de victorias por rival y por modo**, con su intervalo de confianza. Así «creo que mi equipo es bueno» pasa a ser un número, y el usuario ve contra qué rival flojea su equipo. También puede comparar dos versiones del equipo.

## Decisión del usuario (2026-10-08)

- Fase elegida después de la 11: el banco de pruebas es lo primero para ayudarle a crear su equipo. Las demás ideas (tabla de tipos, tabla de velocidades, tabla de daños, optimizador de Stat Points) quedan como ampliaciones posibles para después.
- **Por preguntar al empezar** (con opción recomendada):
  1. **Dónde**: en la web, con una pantalla nueva y progreso en vivo (recomendado), o solo como comando (`npm run bench`).
  2. **Quién juega cada lado**: el mismo nivel en los dos (recomendado: el 3, para que la diferencia sea el equipo) o cada rival con su `botLevel` guardado.
  3. **Cuántos combates por rival** por defecto (recomendado 20, ≈ ±20 puntos; con 100, ±10) y si se ofrece «más precisión».
  4. Si los **resultados se guardan** (historial por equipo para comparar versiones) o solo se ven en el momento.
  5. Si la **comparación de dos versiones** (A/B) entra en esta fase (recomendado: sí, es el uso real; ver «Prueba manual» más abajo) y si el banco **para solo** cuando la respuesta ya está clara.
- Actualización (2026-10-08, tras afinar a mano el equipo «Collejas pingüi»): al usuario le pareció **muy lento** medir variantes y pidió que el banco sea **rápido sin perder calidad**. Eligió rehacer este brief con las mejoras de abajo antes de implementar (opción A frente a un script rápido).

## Punto de partida

- `tools/arena` (`arena.ts`) juega bot contra bot con **equipos aleatorios** de `teamgen`. Cada pareja de equipos se juega dos veces, intercambiando equipos, para **anular** la ventaja del equipo: justo lo contrario de lo que quiere el banco.
- `playOut` (engine) lleva un combate entre dos agentes hasta el final y reintenta tras `[Unavailable choice]`. `BattleSession.create` valida los equipos.
- Equipos y rivales guardados: `TeamRepository` y `OpponentRepository` (`apps/server`, `storage/teams` y `storage/opponents`). Un rival es un equipo más `botLevel`. La legalidad (`problems`) va en cada respuesta y solo se exige para combatir.
- Tiempo del nivel 3: ≈ 0,4 s por decisión en individuales y 0,55 s en dobles, ≈ 4–9 s por combate entre dos niveles 3 (el doble de decisiones que contra el 2).

## Hechos verificados

- **Nadie puede depender de `tools/*`** (regla de capas): el servidor no puede importar `tools/arena`. El bucle de un combate bot contra bot (crear agentes, sesión, contar elecciones inválidas, `playOut`) tiene que vivir en un paquete. Lo natural es `engine`, que ya tiene `playOut`, con el arena y el banco como consumidores.
- **No hay `worker_threads` en el proyecto.** El nivel 3 piensa de forma **síncrona**: cientos de combates en el hilo del servidor lo bloquearían (ni WebSocket ni API). El banco necesita **hilos de trabajo** (`node:worker_threads`, `os.availableParallelism()`). Para medir, en la fase 11 se lanzaron 8–16 procesos del arena en paralelo con semillas distintas.
- El nivel 3 tiene esfuerzo fijo (`SEARCH_SETTINGS`): con la misma semilla los resultados son **reproducibles**, aunque se repartan entre hilos, si la semilla de cada combate sale de `semilla:rival:modo:índice`.
- La vista previa la elige el bot (`team-selection.ts`, la del nivel 2): el banco mide el equipo de 6 **con la elección del bot**, no la del usuario.
- Ruido: con n combates, el IC 95 % de un % cercano al 50 % mide ≈ ±98/√n puntos (`wilsonInterval` del arena).

### Prueba manual (2026-10-08): qué se hizo y qué falló

Se optimizó el equipo de dobles «Collejas pingüi» del usuario contra sus 19 rivales de dobles guardados con scripts sueltos (no versionados, en `storage/tmp-analysis/`: `bench.ts` juega un equipo contra cada rival, `matrix.ts` y `sp.ts` sacan matrices de daño y comparan repartos de SP con `estimateDamage`; `v0.json`…`v4.json` son las variantes). Sirven de prototipo y de **caso de prueba** con resultados conocidos (nivel 3 contra nivel 3, 12–14 combates por rival, semillas `s1` y `s2`):

| Variante | Cambio | `s1` | `s2` |
|---|---|---|---|
| v0 | Equipo original | 39,8 % | — |
| v1 | Sets optimizados (lo que se aplicó) | 48,4 % | 51,4 % |
| v2 | v1 + Electroweb en Jolteon y Flash Cannon en Empoleon | — | 38,4 % |
| v3 | v1 + Electroweb en Jolteon y Knock Off en Gliscor | — | 40,9 % |
| v4 | v1 con Chispazo en vez de Rayo (el equipo actual) | 48,1 % | 50,4 % |

Lo que costó y por qué (cada variante ≈ 250 combates ≈ 10–15 min de reloj con 16 núcleos):

- **Reparto en bloques fijos**: 5 procesos por variante con 4 rivales cada uno. Los núcleos que terminaban se quedaban parados esperando al bloque más lento.
- **Mismo número de combates en todos los rivales**: un 13/14 o un 0/14 estaba claro a los 5 combates; el resto no aportaba información.
- **Cada variante medida por separado y hasta el final**, aunque a mitad ya se veía que era peor (v2, v3). Y comparar dos % sueltos exige muchos más combates que medir la diferencia en pares.
- **Combates perdidos por un fallo del bot**: el nivel 3 manda `pass` en un hueco que debe actuar (rivales con Sylveon y Hiperrayo: probablemente el turno de recarga). Se está arreglando en otra sesión; el banco debe contar esos combates como «error» y **no** como derrotas (así lo hacía `bench.ts`).
- El script dejaba siempre al usuario en p1 (no alternaba lados) y usaba el `botLevel` de cada rival (todos 3).
- Los subagentes no aceleran esto: el cuello de botella es la CPU, no quién lanza los combates.

## Diseño recomendado

### 1. Combate entre bots en `engine` (`engine/src/bot-battle.ts`)

- `playBotBattle({ mode, seed, options, p1: { team, agent }, p2: { team, agent } })` → `{ winner, turns, invalidChoices, unavailableChoices, ms, decisionMs }`. Es lo que hoy hace `playArenaBattle` sin generar equipos. `tools/arena` pasa a usarlo, y sus tests y cifras no deben cambiar.
- `engine` no puede depender de `bot` (la capa es al revés): los agentes se pasan ya creados, así que solo dependen de la interfaz `BattleAgent` de `core`.

### 2. Banco (`packages/bench` o `apps/server/src/bench/`)

- Para cada rival y cada modo legal del equipo, juega N combates **sin intercambiar equipos** y alternando el lado (p1/p2) para anular la ventaja de lado.
- Por rival y modo da victorias, derrotas, empates, % con IC de Wilson, turnos medios y errores. También el total ponderado.
- Pool de **hilos de trabajo** (tantos como `availableParallelism() − 1`) que juegan combates sueltos. El hilo principal reparte el trabajo, junta los resultados y avisa del progreso. Se puede **cancelar**.
- **Cola dinámica de combates sueltos**, no bloques: cada hilo libre coge el siguiente combate (rival, modo, índice). Así ningún núcleo espera al más lento. Los combates largos (bucles de cambios) se ordenan al principio si se conocen de una ejecución anterior; si no, da igual.
- Determinista con la semilla, como el arena: el resultado depende solo de `semilla:rival:modo:índice`, nunca del orden en que terminan los hilos. El total se calcula al final sobre los combates jugados, ordenados.

### 2b. Medir más con menos combates (sin perder calidad)

Todo esto se apoya en estadística estándar; cada técnica se activa por opción y tiene test.

- **Comparación A/B en pares**: dos versiones del equipo juegan contra el mismo rival con **la misma semilla de combate y el mismo lado** (números aleatorios comunes). Se informa de la **diferencia** por rival y total con su IC (pares: desviación de las diferencias, o bootstrap por rival). Las versiones se pueden pasar como dos equipos guardados o como un equipo más un texto exportado.
- **Parada temprana (secuencial)**: el banco mira el resultado cada K combates y para cuando el IC del total (o de la diferencia A/B) ya está por debajo del margen pedido, o cuando la diferencia es claramente distinta de 0. Para no hacer trampa al mirar varias veces, usa un umbral corregido (p. ej. límites de O'Brien-Fleming o Bonferroni sobre los puntos de control). Respeta un mínimo de combates por rival.
- **Reparto adaptativo entre rivales** (estratificado): tras un mínimo por rival (p. ej. 6), los combates siguientes van a los rivales con más incertidumbre (proporcional a √(p·(1−p)), reparto de Neyman). El total se pondera **igual por rival**, no por número de combates, así que el reparto no lo sesga.
- **Criba barata**: con muchas variantes, primero juega todas con el nivel 2 contra el nivel 2 (milisegundos por decisión) y solo las 2–3 mejores pasan al nivel 3. **Antes de ofrecerlo**, comprobar que el nivel 2 ordena las variantes igual que el nivel 3 (caso de prueba: v0–v4 de la tabla de arriba; si no las ordena bien, la criba queda fuera).
- **Cálculos antes que combates** (CLI primero, la web después): matriz de daño de cada miembro contra los sets de los rivales elegidos, con `estimateDamage`, como hacía `matrix.ts`. Descarta sets malos sin simular. Es el embrión de la «tabla de daños» de las ampliaciones.

Meta: comparar dos versiones de un equipo contra 19 rivales con el nivel 3 en **≤ 5 min** con un margen de ±5 puntos en la diferencia (frente a los ~15 min por variante de la prueba manual).

### 3. Servidor y protocolo

- `POST /api/bench` con `{ teamId, opponentIds, modes, battles, botLevel, seed? }` → `{ benchId }`. El progreso y el resultado llegan por **WebSocket** (`bench:progress`, `bench:result`), definidos primero en `@colleja/protocol` con su test de ida y vuelta. `DELETE /api/bench/:id` lo cancela.
- Un equipo o rival ilegal en un modo se informa y se salta: no aborta el banco.
- Si se decide guardar resultados: colección `storage/bench/` con su `JsonFileFormat` y su repositorio (como los replays), sin escribir ficheros a mano.

### 4. Web

- Pantalla «Banco» (o una pestaña del equipo en el teambuilder): eliges equipo, rivales (todos por defecto), modo y combates. Ves una tabla por rival con una barra de % y su IC, que se llena en vivo, y un total.
- Diseño del sistema actual ([ADR-0009](../adr/0009-sistema-de-diseno.md)): tokens, `ui.tsx`, sin textos de relleno, contraste AA. El rival en `rival` y lo tuyo en `accent`.
- Desde un rival flojo, un botón para **jugar contra él** (combate normal con ese rival).

### 5. CLI

- `npm run bench -- --team <fichero|id> --opponents <ids|all> --mode singles|doubles|both --battles N --level 3 --seed X`, útil para pruebas y para la CI (con el nivel 0 o el 1, rápidos).
- Opciones de 2b: `--versus <fichero|id>` (A/B en pares), `--margin <puntos>` (parada temprana), `--adaptive`, `--screen <nivel>` (criba) y `npm run bench:calc -- --team … --opponents …` (matriz de daño).

## Tests

- `playBotBattle`: mismo resultado que el arena antes del cambio (las cifras de referencia de `tools/arena/test` no cambian).
- Banco: reparto por rival y modo, lados alternos, total, rivales ilegales saltados, determinismo con la misma semilla aunque cambie el número de hilos, cancelación, combates con error fuera del %.
- Estadística (funciones puras, sin combates): IC de la diferencia en pares, regla de parada con datos sintéticos (con dos versiones iguales para casi nunca antes de tiempo; con una diferencia grande para pronto), reparto de Neyman y total ponderado por rival.
- A/B: con el mismo equipo en los dos lados la diferencia es exactamente 0 (misma semilla, mismos combates).
- Servidor: `POST /api/bench` con equipo inexistente (404) o vacío (400). El progreso llega en orden, y el resultado es igual al del banco directo. Siempre con el nivel 0 y carpetas temporales (`testServer()`).
- Protocolo: ida y vuelta de los mensajes nuevos.
- Web: la tabla se llena con el progreso. E2E corto con el nivel 0 (un rival, 2 combates).

## Criterios de «hecho»

- Las decisiones abiertas del usuario resueltas e implementadas.
- Un banco de 5 rivales × 20 combates con el nivel 3 tarda **≤ ~2 min** en el equipo del usuario (16 hilos) y el servidor sigue atendiendo mientras tanto.
- Una comparación A/B contra los 19 rivales de dobles del usuario con el nivel 3 da la diferencia con ±5 puntos en **≤ 5 min**. Repetir v1 contra v2 de la prueba manual debe dar v1 mejor.
- La criba con el nivel 2 solo se ofrece si se ha comprobado que ordena v0–v4 como el nivel 3 (anotado en el CHANGELOG).
- `npm run check` y `npm run e2e` en verde; CI en verde.
- Docs: ADR-0013 (hilos de trabajo y combate entre bots en `engine`), guía nueva `docs/guias/banco.md`, CHANGELOG, AGENTS, PLAN, README y el brief de la fase 13.

> **Estado**: ✅ cerrada el 2026-10-09.
> - Decisiones del usuario: en la web y en la terminal; en la web, niveles entre los dos más altos; margen con parada temprana; resultados guardados; A/B en esta fase.
> - 5 rivales × 20 con el nivel 3: 152 s (≈ 2 min rozado).
> - A/B v1 contra v2 con ± 5: v1 mejor (−4,2 ± 4,9) en ≈ 14 min. **No llega a 5 min**: el usuario lo aceptó y quedó documentado el flujo rápido.
> - La criba con el nivel 2 elige las mismas finalistas que el nivel 3, y se ofrece (`--screen`).
> - Detalle en [ADR-0013](../adr/0013-banco-de-pruebas-con-hilos.md) y el [CHANGELOG](../../CHANGELOG.md).

## Fuera de alcance (ampliaciones posibles para después)

- **Tabla de tipos** en el teambuilder: debilidades compartidas y huecos de cobertura.
- **Tabla de velocidades**: a quién superas y con cuántos Stat Points.
- **Optimizador de Stat Points**: lo mínimo para aguantar un golpe o superar a alguien en velocidad, y el resto al ataque.
- **Tabla de daños**: cada uno de tus Pokémon contra las amenazas de tus rivales (sobre `/api/calc`).
- Que el banco elija la vista previa como el usuario, o que pruebe variantes del equipo él solo.
