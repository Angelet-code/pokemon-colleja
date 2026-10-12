# ADR-0021 — El nivel 3 valora con lo aprendido y explica lo comprobado

- **Estado**: Aceptado (2026-10-12)
- **Contexto previo**: [ADR-0010](0010-bot-experto-con-sandbox.md), [ADR-0011](0011-nivel-3-con-equipo-completo.md), [ADR-0014](0014-nivel-3-mas-rapido-con-poda.md), [ADR-0019](0019-valoracion-aprendida-de-replays.md) · **Brief**: [fase 19](../fases/fase-19.md) · **Guías**: [bot](../guias/bot.md), [aprendizaje](../guias/aprendizaje.md)

## Contexto

En la fase 17 se aprendió una valoración de posiciones con 4 999 replays de dobles de Champions: una regresión logística sobre 20 factores de partida (sin especies) que predice al ganador mejor que el balance de PS. El nivel 3 seguía valorando las hojas de su búsqueda solo con reglas a mano: material (balance de PS × 100) más `positionWeight` × lo que espera el nivel 2 (`outlook`). Faltaba meter la valoración aprendida en la búsqueda, medirla en espejo y, con ella, explicar lo que de verdad decide.

## Decisión

### 1. La posición del bot en combate (`ownPosition`)

- `ownPosition(situation, timers, assumed?)` (`learning/position.ts`) construye la misma `Position` que la de espectador desde la `Situation` del bot: **sus Pokémon con sus sets, PS y estado exactos** (de la petición) y solo los que trajo; los del rival, como un espectador, pero con el set de la **suposición de esa copia de la búsqueda** (`Assumption.seen`, por nombre) o, sin ella, el más probable de `Situation.foes` (la deducción de la fase 11 en el nivel 3). Los del rival vistos solo en la vista previa pesan los huecos sin ver, como en las posiciones de entrenamiento (`unseenMembers`, compartido).
- Los turnos de los efectos: `EffectTimers` del log real una vez por decisión y, en cada hoja, una copia (`clone()`) con el log de la copia.
- Test (`own-position.test.ts`): con la misma información, los factores que no dependen de ningún set ni de qué trajo coinciden con los de espectador; el lado del rival es idéntico; el propio lleva sus sets exactos.

### 2. Valor de hoja aprendido (`learnedWeight`)

- `SEARCH_SETTINGS` gana `materialWeight` (1) y `learnedWeight`. La hoja vale `materialWeight` × material + `positionWeight` × `outlook` + `learnedWeight` × `LOGIT_POINTS` × `valueLogit` (± 200 si acaba).
- **Escala**: `LOGIT_POINTS = 65` puntos por log-odd. En el modelo, un Pokémon más en pie con sus PS suma ≈ 1,4–1,9 log-odds: así un log-odd vale lo que ≈ ⅔ de Pokémon en material (100 puntos), y el aprendido pesa como el material con peso 1.
- El modelo es `VALUE_MODEL` (`learning/shipped-model.ts`, el `value-v1.json` versionado). Con `learnedWeight = 0` no se calcula nada: decisiones idénticas a la fase 18 (huellas de `arena:perf`).
- Coste: `extractFeatures` por hoja es despreciable al lado del simulador. En un hilo, el nivel 3 en dobles pasa de 210 a **163 ms por decisión** (decide distinto y algunas búsquedas se podan antes).

### 3. Medida (dobles, `arena --fixed`, nivel 3 contra nivel 2)

Dos tandas de 1 200 combates por variante (600 pares en espejo; semillas `t1-0…14` y `t2-0…14`, 80 combates cada una), mismas semillas para todas las variantes. «Frente a hoy» es la diferencia media por par, con su IC 95 %.

| Variante | Ajustes | Tanda 1 | Tanda 2 | Frente a hoy |
|---|---|---|---|---|
| Solo material | `positionWeight 0` | 72,4 % | — | −8,6 ± 2,6 |
| **Hoy** (material + outlook) | — | 81,1 % | 81,0 % | — |
| Solo aprendido | `materialWeight 0, positionWeight 0, learnedWeight 1` | 80,9 % | — | −0,2 ± 2,4 |
| Material + aprendido | `positionWeight 0, learnedWeight 1` | 79,1 % | — | −2,0 ± 2,4 |
| Aprendido + outlook | `materialWeight 0, learnedWeight 1` | — | 80,8 % | −0,3 ± 2,4 |
| **Las tres** (peso 1) | `learnedWeight 1` | **83,0 %** | **83,8 %** | **+1,9 ± 2,3 / +2,8 ± 2,3** |
| Las tres, peso 0,5 | `learnedWeight 0.5` | — | 82,8 % | +1,8 ± 2,2 |
| Las tres, peso 2 | `learnedWeight 2` | — | 82,5 % | +1,5 ± 2,4 |

- **La valoración aprendida sola iguala a la de hoy** (80,9 frente a 81,1): un modelo lineal de 20 factores aprendido de partidas humanas vale lo que el material más la simulación del nivel 2.
- **Sumada a las dos, gana ≈ +2,4 puntos** en 2 400 combates (+1,9 y +2,8 en tandas independientes; juntas ≈ ± 1,6). Los pesos 0,5 y 2 también ganan, algo menos: el óptimo está cerca de 1.
- Decisión del usuario (2026-10-12): **`learnedWeight = 1` en dobles**. En individuales queda en 0 (pocos replays, fuera de alcance): sus decisiones no cambian.
- El espejo apenas baja el ruido de una diferencia (± 2,3 por pares frente a ± 2,1 de cada variante): en cuanto las decisiones divergen, la suerte también.

### 4. Más datos no ayudan a este modelo

Curva de aprendizaje con la misma división de prueba: log-loss 0,559 (500 partidas), 0,551 (1 000), 0,550 (2 000), 0,546 (4 000) en la división `s1`, y lo mismo en `s2` y `s3`. El modelo de 20 factores está **saturado desde ≈ 1 000 partidas**: para mejorar la valoración hacen falta factores nuevos o datos del propio bot (autojuego), no más replays.

### 5. Explicaciones comprobadas (`decisive`)

- Como la valoración es una suma, `searchMoves` acumula, para cada opción, la contribución media de cada factor a su puntuación (`SearchResult.learned`, en puntos; `contributions` en `value-model.ts`). No cambia ningún valor.
- `checkedReasons` (`search/checked-reasons.ts`, pura): un factor es razón **solo si, quitándolo de todas las opciones, la mejor pasa a ser otra**; se guarda cuál y por cuánto, y se enseñan como mucho 3, las más decisivas primero. Un factor que solo acompaña a la decisión o que va en contra no sale.
- Cada factor tiene su razón en términos de partida (`FeatureInfo.reason`: «se mueve antes que los tuyos en el campo», «deja a más de los tuyos a tiro de un golpe»…), sin números.
- `DecisionExplanation.decisive` (core y protocol, opcional): `{ reason, instead }`, con lo que habría elegido sin ese factor. `redactExplanation` censura `instead` como las opciones (movimientos no usados, Pokémon no vistos). En «Pensamiento del bot»: «Frente a «X», eligió «Y» porque así … y …».
- Se calcula en `explain()`, bajo demanda: `explain.test.ts` juega con y sin explicaciones con el aprendido y exige el mismo `inputLog`; `checked-reasons.test.ts` comprueba que quitar cada razón enseñada cambia la mejor opción y que los factores que no deciden no salen.

### 6. Arena con variantes

`npm run arena -- --a 3 --a-settings '{"learnedWeight":0}'` (y `arena:perf`) mide una variante del nivel 3 sin tocar el código: `createBot(3, { settings })`. Solo admite claves de `SEARCH_SETTINGS` con valor numérico.

## Consecuencias

- El nivel 3 en dobles es más fuerte (≈ 83,4 % contra el nivel 2 en espejo) y algo más rápido, y explica qué factor de partida decidió cada jugada cuando lo hay.
- Las razones son de factor, aún genéricas («se mueve antes que los tuyos en el campo»): todavía no nombran a qué Pokémon (p. ej. «antes que tu Kingambit bajo Espacio Raro»). Eso exige guardar por qué cada factor vale lo que vale en cada hoja.
- La referencia del arena en espejo en dobles cambia (81,0 → ≈ 83,4 %); la de individuales no.
- Para mejorar más la valoración: factores nuevos (sube `FEATURES_VERSION` y regenera), o entrenar también con posiciones de autojuego del propio bot. Más replays con estos factores no ayudan.
