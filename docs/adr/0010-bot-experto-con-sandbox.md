# ADR-0010 — Bot nivel 3 "Experto": un turno por adelantado con el simulador real

- **Estado**: Aceptado (2026-10-08)
- **Guía operativa**: [docs/guias/bot.md](../guias/bot.md)
- **Ampliado por**: [ADR-0011](0011-nivel-3-con-equipo-completo.md) (hojas y relevos con el equipo completo en individuales)

## Contexto

La fase 9 pedía un rival más fuerte que el nivel 2 ([ADR-0004](0004-bot-por-simulacion.md)), que valora cada opción con una simulación aproximada (daño esperado, sin cambios del rival, sin críticos ni efectos secundarios, sin volátiles). Había que decidir:

- cómo usar el simulador real (Showdown) para mirar por delante sin que el bot vea información oculta;
- dónde vive ese código, si `@colleja/bot` es apto para navegador y solo `engine` puede tocar Showdown;
- cómo valorar las posiciones resultantes y cuánto puede costar cada decisión (el usuario aceptó hasta ~3 s, y pidió que el bot piense mientras el jugador elige).

## Decisión

1. **El motor ofrece un sandbox; el bot solo ve una interfaz.** `core` define `BattleSandbox`/`SandboxBattle`/`RivalAssumption` (tipos puros) y `AgentContext.sandbox?`. `engine` lo implementa (`sandbox.ts`) y lo pone en el contexto **solo al elegir movimientos** (con la cola de acciones vacía). El nivel 3 (`ExpertAgent`, `search/`) vive en `@colleja/bot`, que sigue siendo apto para navegador y sin dependencia de `engine`. Sin sandbox juega como el nivel 2.
2. **Un fork no tiene información oculta.** `fork(suposición, semilla)` parte de `Battle.toJSON()` de la posición real y:
   - sustituye el set de cada rival visto (por nombre) por el supuesto: se borran del JSON los campos derivados del set (stats, movimientos con PP llenos, objeto, habilidad salvo tras cambiar de forma, PS) y se recalculan con `setSpecies` para la forma actual (Mega incluida); los rivales no vistos se sustituyen enteros;
   - pone los PS del rival al **porcentaje que ve el jugador** (`getHealth().shared`);
   - usa un generador aleatorio nuevo, vuelve a sortear la duración del sueño de acuerdo con los turnos ya dormidos, olvida las elecciones ya hechas en el turno y vacía `inputLog` (que lleva los dos equipos).
   Lo propio, el campo y lo revelado se quedan. Un test exige que el nivel 3 decida **lo mismo y con la misma explicación** cuando el rival oculta movimientos, naturaleza o Stat Points distintos.
3. **Búsqueda a un turno** (`searchMoves`): para unas pocas suposiciones de los sets rivales (`rivalAssumptions`: la primera, el set más ofensivo de cada uno como el nivel 2; las siguientes bajan por la lista; los no vistos se barajan), el bot forka la posición, obtiene las respuestas probables del rival (el nivel 2 jugando el lado del rival en el fork, con pesos softmax de su puntuación) y juega el turno real con cada opción propia contra respuestas muestreadas de forma estratificada. Cada posición resultante, tras los relevos forzosos (los del nivel 2), vale **balance de PS × 100 + 0,5 × el cambio que el nivel 2 espera desde ahí**, ±200 si el combate termina. Se elige la media más alta.
   - El "cambio esperado" es la puntuación de la mejor opción del nivel 2 **menos la que tendría si no pasara nada** (`singlesBaseline`: PS del activo y del siguiente en la cadena de duelos frente al rival en el campo; `doublesBaseline`: los propios frente a los rivales en el campo). Sumar la puntuación tal cual contaba dos veces los PS de esos Pokémon (ya están en el balance) y dejaba al nivel 3 en un 50 %.
4. **Suerte común por acción.** Con un solo resultado aleatorio por hoja, el ruido (±30–50 puntos por opción) superaba las diferencias entre opciones y el nivel 3 no ganaba al 2 en individuales (48,6 %). En un fork, cada acción del turno saca sus números de un flujo propio (semilla + turno + quién actúa): todas las opciones propias se comparan con la misma suerte del rival (el mismo crítico, el mismo fallo), como números aleatorios comunes.
5. **Caché de daño por contenido.** `estimateDamage` es pura y las hojas repiten los mismos cálculos: una caché por clave de contenido (atacante, defensor, movimiento, campo) redujo el tiempo por decisión a la mitad.
6. **El bot piensa mientras el jugador elige.** Cuando los dos lados eligen a la vez, la sala envía primero el turno al jugador y después hace decidir al bot (su elección espera a la del jugador). Las decisiones en las que el jugador no participa (un relevo del bot) siguen yendo antes.
7. **Reproducible**: todas las semillas de los forks salen del generador del bot; el esfuerzo es fijo (suposiciones, opciones, turnos por opción), nunca por reloj.

## Resultados

Arena contra el nivel 2, equipos aleatorios con vista previa, equipo cerrado, semillas distintas de las del ajuste, sin elecciones inválidas:

| Modo | Combates | Victorias del nivel 3 | IC 95 % | ms por decisión (media / máx.) |
|---|---|---|---|---|
| Individuales | 602 | **61,8 %** | ≈ 58–66 % | ≈ 300 / 1000 |
| Dobles | 308 | **78,6 %** | ≈ 74–83 % | ≈ 430 / 620 |

Lo que se probó para llegar ahí está en el [CHANGELOG](../../CHANGELOG.md) (fase 9). En resumen: el ruido de un solo resultado por hoja tapaba todo (48,6 %); con suerte común y más muestras se llegó a un 50 % y más muestras ya no ayudaban; el salto vino de corregir la evaluación (cambio esperado en vez de estimación absoluta) y de bajar su peso a 0,5. La temperatura de las respuestas del rival y una estimación simétrica apenas cambian el resultado. Configuración por modo en `SEARCH_SETTINGS`: individuales, 3 suposiciones × 8 turnos por opción; dobles, 2 × 4 sobre las 12 mejores parejas del nivel 2.

## Consecuencias

- Mejorar el nivel 3 es, sobre todo, mejorar la estimación del nivel 2 (sus hojas) o el modelo de respuestas del rival; el turno buscado ya usa todas las mecánicas reales.
- El bot sigue siendo síncrono: mientras piensa, el servidor no atiende otros mensajes (que esperan en la cola de la sala). Para un único jugador local es aceptable; si molestara, el siguiente paso es un hilo de trabajo.
- La vista previa y los relevos siguen siendo los del nivel 2.

## Alternativas descartadas

- **Nivel 3 dentro de `engine`** (o un paquete nuevo que dependa de `engine`): rompería la separación (los bots aptos para navegador, `createBot` para todos los niveles) y daría al bot acceso al combate real.
- **Reconstruir un `Battle` desde la vista del jugador**: habría que recrear volátiles, duraciones y contadores a mano; partir del estado real y borrar lo oculto es más fiel y más simple.
- **MCTS o más de un turno**: el coste por hoja (≈1,5 ms de turno + la estimación del nivel 2) no da para tanto con el presupuesto de tiempo.
- **Un mundo "mediano" determinista** (todas las tiradas a la mitad): sin ruido, pero trata los movimientos con 70–90 % de precisión como si siempre acertaran.
