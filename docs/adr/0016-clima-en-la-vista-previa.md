# ADR-0016 — El clima de los setters en la vista previa y la cadena de equipo

- **Estado**: Aceptado (2026-10-11)
- **Contexto previo**: [ADR-0015](0015-vista-previa-del-nivel-3.md), [ADR-0011](0011-nivel-3-con-equipo-completo.md), [ADR-0004](0004-bot-por-simulacion.md) · **Guía**: [bot](../guias/bot.md#nivel-3-vista-previa)

## Contexto

Bug encontrado el 2026-10-11: en dobles, el nivel 3 nunca traía a **Pelipper (Llovizna)** del rival guardado «M-7 · Lluvia Mega-Swampert» (Pelipper, Mega-Swampert con Nado Rápido, Archaludon, Rillaboom, Incineroar, Grimmsnarl). El banco daba un 82,5 % a «Collejas pingüi (Bellibolt)» contra ese rival, pero forzando la salida Pelipper + Swampert (`--no-preview`) el equipo perdía 0 de 20: **los resultados del banco contra equipos de clima estaban inflados**.

Causa: la vista previa valora a cada Pokémon con duelos 1 contra 1 (`duelScore`) en el campo de la vista previa, que **no tiene clima**. Pelipper puntuaba como un Pokémon flojo (−93 … +28) y Mega-Swampert se valoraba en seco (media 48 frente a 72 con lluvia: Nado Rápido y los movimientos de Agua). El grupo con Pelipper quedaba segundo (375 frente a 380) y no salía nunca. La cadena de equipo completo de individuales (`teamChainValue`) tenía el mismo hueco: un relevo con Llovizna no cambiaba el tiempo.

## Decisión

El clima es parte del **modelo**, no una bonificación:

1. **Setters** (`analysis/combatant.ts`): `weatherOf` (Llovizna → lluvia, Sequía → sol, Chorro Arena → tormenta de arena, Nevada → nieve) y `weatherAfter`: cuando varios entran a la vez, las habilidades se activan del más rápido al más lento, así que **se queda el clima del setter más lento**; sin setters, el clima no cambia.
2. **`Situation.withWeather(clima)`**: la misma situación con otro clima en el campo (cachés de daño nuevas; las vistas se comparten). Velocidad (Nado Rápido, Clorofila…) y daño (`@smogon/calc`) ya leían el clima del campo.
3. **Vista previa del nivel 3** (`search/preview.ts`):
   - Cada pareja de la matriz de duelos se juega en el clima de sus setters (lo que lee la explicación y la predicción de tus grupos).
   - **Dobles**: cada grupo propio de cuatro se valora con su cobertura **en el clima que traen sus setters** (y, en cada duelo, el del rival si también es setter). Así Nado Rápido solo cuenta si el grupo lleva a Pelipper. Los líderes siguen siendo los dos de mejor duelo medio, ahora en ese clima.
   - **Individuales**: cada alineación empieza en el clima de los dos líderes.
4. **Cadena de equipo completo** (`teamChainValue`): cuando entra un relevo setter, cambia el clima de los duelos siguientes. Los relevos forzosos del nivel 3 en individuales valoran al que entra en su clima.

Fuera de esto: el nivel 2 (y los niveles 0–1) no cambian su vista previa; `doubles-sim` ya usaba el clima del campo durante el combate, y la búsqueda del nivel 3 juega los turnos con el simulador real, que aplica las habilidades de entrada. La duración del clima (5 u 8 turnos) no se modela en los duelos.

Se descartó que un rival guardado pudiera **fijar** qué trae y con quién empieza (decisión del usuario, 2026-10-11): el bot sigue eligiendo siempre.

## Resultados

Banco, «Collejas pingüi (Bellibolt)» contra «M-7 · Lluvia Mega-Swampert», nivel 3 contra 3, dobles, 40 combates, semilla `s1`:

| | Antes | Ahora |
|---|---|---|
| Tu equipo gana | 95,0 % (38-2) | **7,5 %** (3-37) |

En la vista previa del rival, los seis mejores grupos llevan a Pelipper (el mejor: Mega-Swampert, Archaludon, Pelipper y Rillaboom, 507 puntos frente a 380 del mejor de antes).

Arena, nivel 3 contra nivel 2 con equipos aleatorios, mismas semillas antes y después (6 semillas × 50 combates por modo y conjunto). Solo cambian los combates con setters (≈ 20 % de los equipos aleatorios lleva uno y casi ninguno lleva quien lo aproveche):

| | Semillas `a1`–`a6` | Semillas `b1`–`b6` | Total |
|---|---|---|---|
| Individuales, antes → ahora | 66,4 → 66,4 % | 68,8 → 67,8 % | 67,6 → 67,1 % (−0,5) |
| Dobles, antes → ahora | 80,7 → 79,3 % | 79,3 → 80,3 % | 80,0 → 79,8 % (−0,2) |

Sin cambio de fuerza contra el nivel 2 (el ruido con 600 combates es de ± 2 puntos): el arreglo se queda por los equipos de clima, que los aleatorios casi nunca forman.

## Consecuencias

- Los bancos guardados contra rivales de clima **ya no valen**: hay que repetirlos.
- Viento Afín, Espacio Raro, Sorpresa o la redirección siguen sin valorarse en la vista previa de dobles (los duelos 1 contra 1 no los ven, ADR-0015); valorar parejas de salida con la simulación 2 contra 2 sigue propuesto.
- `Situation.withWeather` es la forma de preguntar «¿y con este clima?»: no se construye otra `Situation` ni se toca `field` a mano.
- Los terrenos de entrada (Surge) no se modelan todavía; se añadirían igual (`withTerrain`).
