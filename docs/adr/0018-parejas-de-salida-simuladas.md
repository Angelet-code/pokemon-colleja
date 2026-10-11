# ADR-0018 — Parejas de salida simuladas 2 contra 2: explican, no deciden

- **Estado**: Aceptado (2026-10-11)
- **Contexto previo**: [ADR-0015](0015-vista-previa-del-nivel-3.md), [ADR-0017](0017-arquetipos-en-la-vista-previa.md), [ADR-0004](0004-bot-por-simulacion.md) · **Brief**: [fase 16 (E2)](../fases/fase-16.md) · **Guías**: [bot](../guias/bot.md#nivel-3-vista-previa), [herramientas](../guias/herramientas.md#pensamiento-del-bot-pantalla-de-combate)

## Contexto

En dobles, el nivel 3 sale con los dos Pokémon de su grupo con mejor duelo 1 contra 1 medio. No ve lo que hace buena a una pareja de salida (Sorpresa con quien se potencia, quien pone Espacio Raro con sus atacantes lentos, dos que tumban a uno entre los dos). La E2 de la fase 16 propone valorar las parejas jugándolas 2 contra 2 con la simulación del nivel 2 (`DoublesSim`).

El usuario pidió además (2026-10-11) que la explicación diga **por qué**, en términos de partida y no con puntuaciones: «por un combo, para presionar a un Pokémon, para poder tumbar a alguien, para evitar algo, porque si pasa X necesitamos Y para Z».

## Decisión

### 1. Simular salidas fuera del combate (`DoublesSim.evaluateLineup`)

- `DoublesSim` acepta una **alineación** (`SimLineup`: dos Pokémon por lado) en lugar de los que están en el campo. Sin cambios para el combate.
- Puede **apuntar lo que pasó** (`SimTrace`): quién tumbó a quién y en qué turno (con quién le hizo daño), el daño de cada uno a cada rival, la Sorpresa que hizo retroceder y los movimientos de estado (Espacio Raro, Viento Afín, Señuelo…).
- `search/lead-plan.ts`: `leadMatchup` juega una pareja contra otra. Prueba las opciones del turno 1 de cada uno (cada movimiento contra cada rival), se queda con las `kept` mejores de cada hueco (con el compañero en piloto automático) y juega las combinaciones. El rival ataca como un jugador que busca el máximo daño, y el balance tras tres turnos es el valor. Determinista, en el clima de los cuatro.
- `LeadPlanner` (`search/preview.ts`) cachea cada cruce y arma las alineaciones (una sola Mega por lado).

### 2. Lo que decide: nada (medido)

Arena, nivel 3 contra nivel 2 en dobles, **mismas semillas** (tus 26 rivales, `p1`–`p12`, y aleatorios, `a1`–`b6`; 600 combates por variante y conjunto). Base = fase 15 (79,7 % y 78,5 %).

| Variante (cómo elige su pareja de salida) | Rivales | Aleatorios |
|---|---|---|
| Base: los dos con mejor duelo medio | **79,7 %** | **78,5 %** |
| La pareja con mejor valor 2 contra 2 frente a tus parejas probables | 77,0 % | 77,7 % |
| La misma, y su valor suma en el grupo (× 0,25) | 76,7 % | 79,0 % |
| Prediciendo tu salida por duelo medio (no simulada) | 77,0 % | — |
| Solo ataques en el turno 1 (sin estado propio) | 77,2 % | — |
| Valor 2 contra 2 + duelo medio | 76,8 % | — |
| Predicción más suave (temperatura 60) | 77,5 % | — |
| Simulación solo para desempatar entre las parejas a ≤ 5 / ≤ 10 puntos de duelo medio de la mejor | 76,5 / 76,5 % | 79,0 / 78,7 % |

Todas las variantes pierden con tus rivales entre 2 y 3 puntos, incluso la que solo cambia un tercio de las salidas (desempate con margen 5). Tampoco es la predicción de tu salida, ni el optimismo con los movimientos de estado propios, ni la temperatura. **Diagnóstico**: tres turnos de 2 contra 2 premian a la pareja que gana el primer intercambio; el duelo medio premia a los Pokémon que rinden contra todo tu equipo (también contra los de atrás), y en el combate entero pesa más eso. Con la regla del usuario («si no mejora, se queda el análisis visible»), **la salida se elige como antes**.

### 3. Lo que explica

- **Tu salida esperada**: tus parejas se juegan 2 contra 2 contra las salidas probables del bot (las de sus 3 mejores grupos, la elegida primero), con un softmax (`leads.temperature`) dentro de cada grupo. Sale la pareja más probable y, para la explicación, sustituye la probabilidad de empezar de cada Pokémon (antes, por duelo medio).
- **Por qué** (`search/lead-reasons.ts` → `LeadReading` con `LeadReason`), para tu pareja esperada contra su salida y para su salida contra tu pareja esperada, del lado de cada pareja:
  - `combo`: el plan que arranca (Espacio Raro, Viento Afín, clima, potenciarse con apoyo) con quién lo pone, quién lo aprovecha y a qué líderes rivales adelanta con él.
  - `ko`: a quién pueden tumbar y en qué turno (primero o segundo), y quién participa.
  - `pressure`: a quién le quitan al menos la mitad sin tumbarlo.
  - `fakeout`, `redirect`: Sorpresa a un rival; Señuelo o Polvo Ira para cubrir al compañero.
  - `avoid`: a quién deja atrás porque un líder rival lo tumba de un golpe.
- **Solo al explicar**: como no decide, la simulación (≈ 60 ms) se hace al construir la explicación (`PreviewPlan.leads` es perezoso). El arena y el banco no la pagan; las decisiones son idénticas a la fase 15 (mismos resultados semilla a semilla).
- **Información oculta**: tu salida esperada es tuya y no se censura. La suya llega con el turno 1, cuando ya están en el campo; con equipo cerrado, `redactExplanation` quita los planes que necesitan un movimiento que aún no ha usado (Espacio Raro, Viento Afín, Sorpresa, Señuelo; el clima se ve al entrar), la Sorpresa y el Señuelo, y los Pokémon que no has visto.
- La web lo cuenta con frases (`leadStory`): «Por qué esperaba que salieras con Slowking y Sylveon (50 %) contra sus Camerupt y Kingambit: Para montar Espacio Raro: tu Slowking lo pone y tus Camerupt, Conkeldurr y Sylveon se mueven antes que su Kingambit. Tu Sylveon puede tumbar a su Kingambit en el segundo turno. Dejarías atrás a tu Conkeldurr porque su Camerupt lo tumba de un golpe.»

## Consecuencias

- El nivel 3 sigue saliendo como el nivel 2 en dobles; la explicación dice por qué esperaba tu salida y qué hace la suya contra ella.
- Mejorar la salida exige valorar lo que pasa **después** de los primeros turnos (la pareja con el resto del equipo detrás), no solo el primer intercambio: queda propuesto ([fase 17](../fases/fase-17.md)).
- `DoublesSim.evaluateLineup` y `SimTrace` sirven para cualquier «¿qué pasaría si salen estos?» (por ejemplo, un entrenador de salidas para el jugador).
- Las razones son heurísticas sobre una simulación de daño esperado: no hay críticos ni cambios del rival, y el rival no usa movimientos de estado.
