# ADR-0028 — Golpes críticos en la simulación del nivel 2

- **Estado**: Aceptado (2026-11-01)
- **Contexto previo**: [ADR-0004](0004-bot-por-simulacion.md) (bot por simulación), [ADR-0026](0026-movimientos-de-estado-del-nivel-2.md) (movimientos de estado) · **Brief**: [fase 26](../fases/fase-26.md) · **Guía**: [bot](../guias/bot.md#qué-modela-la-simulación-nivel-2)

## Contexto

El daño esperado del nivel 2 (y de las hojas del nivel 3) ignoraba los críticos. Con la probabilidad base (1/24) apenas importa, pero hay equipos que viven de ellos: Sirfetch'd con Puerro y Dragoaliento del aliado critica siempre, Periscopio y Afortunado suben el grado, y los movimientos con índice alto (Tajo Umbrío, Ataque Aéreo…) critican a menudo. El bot infravaloraba esos equipos en el banco y nunca jugaba Foco Energía ni Dragoaliento (la simulación los valoraba a 0, así que el nivel 3 no los buscaba).

## Decisión

- **Probabilidad por grado** como en Showdown (gen 7+): 0 → 1/24, 1 → 1/8, 2 → 1/2, ≥ 3 → siempre. `critChance` (`analysis/damage.ts`) suma el índice del movimiento (`critRatio − 1`), Periscopio (+1), Puerro con Farfetch'd o Sirfetch'd (+2), Afortunado (+1) y `Combatant.critBoost` (Foco Energía +2; Dragoaliento +1, o +2 si el que lo recibe es Dragón). Armadura Batalla y Caparazón dejan la probabilidad en 0.
- **Daño mixto**: `estimateDamage` con `critChance` repite las tiradas normales `1/p − 1` veces junto a las críticas, así que la media, el mínimo, el máximo y la probabilidad de KO salen de una sola distribución. Los movimientos que siempre critican ya los resuelve `@smogon/calc`.
- **El grado 0 se ignora** (por debajo de 1/8 se usa el cálculo normal): contarlo doblaría las llamadas a la calculadora en casi todos los golpes para ≈ 2 % de daño extra repartido igual entre los dos lados.
- **Foco Energía y Dragoaliento se juegan**: `CRIT_BOOST_MOVES` (`move-knowledge.ts`) y `withCritBoost` (`duel.ts`) los aplican en `DoublesSim` (a sí mismo o al aliado) y en el plan de individuales (`singles-plan.ts`). No se acumulan entre sí.
- **El combate los sigue**: `BattleView.critBoost` (core) lee `-start|…|move: Focus Energy` y `move: Dragon Cheer` y lo pone a 0 al retirarse; `Situation` lo pasa a los combatientes de los dos lados.
- **Interruptor de medida**: `SEARCH_SETTINGS.critModel` (1) y `SituationOptions.critModel`. Con 0, decisiones idénticas a las de antes (huellas de `arena:perf`). El nivel 2 lo usa siempre.
- Los factores de la valoración aprendida (`learning/features.ts`) siguen **sin críticos**: el modelo se entrenó así y cambiarlo exigiría subir `FEATURES_VERSION` y reentrenar.

## Medidas

Nivel 3 con críticos contra el nivel 3 sin ellos (`--b-settings '{"critModel":0}'`), en espejo (`--fixed`), 15 arenas de 80 combates por tanda (600 pares):

| Tanda | Equipos | Bot A con críticos |
|---|---|---|
| `t1` | Meta, dobles (sets del meta en los dos) | 50,7 % ± 2,3 |
| `t2` | Meta, dobles (otra semilla) | 49,8 % ± 2,4 |
| `crit` | Equipos de críticos (Sirfetch'd con Archaludon o Dragapult, Absol con Afortunado y Periscopio…), dobles | 49,8 % ± 2,1 |
| `singles` | Meta, individuales | 50,7 % ± 2,2 |

Empate en todas. Tiempo por decisión igual en los dos bots (≈ 0,6–0,77 s con 15 arenas en paralelo); en un hilo, `arena:perf` no ve diferencia más allá del ruido.

## Consecuencias

- Activado (decisión del usuario): no da fuerza, pero el modelo es más fiel, el bot juega Foco Energía y Dragoaliento cuando renta y el banco valora bien los equipos de críticos.
- Que no gane en el arena es esperable: con los sets del meta los críticos de grado ≥ 1 son raros y, en los equipos que viven de ellos, los dos bots golpean con los mismos atacantes.
- Si se quisiera contar el grado 0, hacerlo solo en las hojas (no en la criba del nivel 2) y medir el coste.
