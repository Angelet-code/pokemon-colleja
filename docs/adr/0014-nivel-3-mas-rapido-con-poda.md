# ADR-0014 — Nivel 3 más rápido: cachés idénticas y poda sucesiva de opciones

- **Estado**: Aceptado (2026-10-09)
- **Contexto previo**: [ADR-0010](0010-bot-experto-con-sandbox.md), [ADR-0011](0011-nivel-3-con-equipo-completo.md), [ADR-0013](0013-banco-de-pruebas-con-hilos.md) · **Brief**: [fase 13](../fases/fase-13.md) · **Guía operativa**: [docs/guias/bot.md](../guias/bot.md)

## Contexto

El banco de pruebas (fase 12) está limitado por el nivel 3: una A/B de dobles contra 20 rivales con ± 5 tardaba ≈ 14 min. El brief pedía ≈ 2× **sin cambiar ninguna decisión** (mismo `inputLog`).

Perfil de un combate (`node --cpu-prof`, 12 combates por modo contra el nivel 2):

- El **simulador de Showdown** jugando los turnos de las bifurcaciones se lleva el 36 % (individuales) y el 48 % (dobles). Es coste por turno simulado: ≈ 6 400 búsquedas de *callbacks* de efectos (`getCallback`) por turno. Sustituir `getCallback` en tiempo de ejecución por una versión con caché no ganó nada.
- **Deserializar** cada hoja (`Battle.fromJSON`) se lleva otro 15–22 %. El formato ya estaba en caché (probado).
- El resto (≈ 40 %) es nuestro: la valoración del nivel 2 en cada hoja, la calculadora y construir `Situation`.

Con decisiones idénticas el techo es ≈ 1,4×: para ir más rápido hay que **simular menos turnos**. El usuario eligió permitir decisiones distintas si la **fuerza medida en el arena no cambia**.

## Decisión

### 1. Optimizaciones idénticas (mismo `inputLog`)

- **Caché de tiradas por clase de PS** (`analysis/damage.ts`): además de la caché exacta, otra por contenido con los PS reducidos a lleno / ≤ 1/3 / entre medias, que son los únicos umbrales que lee la calculadora salvo en `EXACT_HP_MOVES` (Divide Dolor, Sacrificio, Estallido, Salpicar, Azote, Inversión y Prensa Metálica, que van con los PS exactos). `koChance` se calcula otra vez con los PS exactos. `test/damage-cache.test.ts` comprueba que ningún otro movimiento, habilidad u objeto de los datos cambia sus tiradas dentro de una clase.
- **Sin cierres con nombre en los bucles calientes** (`duel.ts`, `doubles-sim.ts`): tsx compila con `keepNames` y llama a `__name` (un `Object.defineProperty`) cada vez que se crea uno. Claves del campo en caché por `FieldState`.
- Resultado: 1,25× en individuales y 1,12× en dobles, con las mismas huellas.

### 2. Poda sucesiva (`search/lookahead.ts`)

- La búsqueda recorre los turnos **por orden**: en cada turno, todas las suposiciones y todas las opciones que siguen vivas, con la misma semilla y la misma respuesta del rival para todas.
- Tras `pruneAfter` turnos completos, y después de cada turno, se descartan las opciones cuya media queda más de `pruneMargin` puntos por debajo de la mejor (`stillPromising`). Las descartadas conservan su media parcial (la explicación las enseña).
- Valores: individuales `pruneAfter: 2`, `pruneMargin: 30` (de 8 turnos); dobles `pruneAfter: 1`, `pruneMargin: 30` (de 4). Con `pruneAfter: 0` se busca todo como antes.

### 3. Medir sin tocar las decisiones

- Cada combate entre bots tiene una **huella** (`BotBattleResult.fingerprint`, SHA-256 del `inputLog`).
- `npm run arena:perf` juega combates fijos de un nivel contra otro en un hilo, da el tiempo por decisión (reloj y CPU) y, con `--compare`, dice si alguna huella cambió. La CPU es menos sensible a otros programas abiertos que el reloj; aun así, para comparar dos versiones conviene **alternar** las ejecuciones.

## Resultados

Velocidad (`npm run arena:perf`, un hilo, 12 combates por modo, frente al código de la fase 12):

| | Individuales | Dobles |
|---|---|---|
| Solo optimizaciones idénticas | 1,25× | 1,12× |
| + poda | **2,10×** (294 → 140 ms) | **2,07×** (390 → 188 ms) |

Fuerza (nivel 3 contra nivel 2, arena, 600 combates por semilla, mismas semillas con y sin poda):

| | Sin poda | Con poda |
|---|---|---|
| Individuales `s1` / `s2` | 64,8 / 64,3 % | 64,3 / 65,3 % |
| Dobles `d1` / `d2` | 80,5 / 80,5 % | 80,5 / 79,3 % |
| **Total (1 200 por modo)** | **64,6 / 80,5 %** | **64,8 / 79,9 %** |

Las diferencias están dentro del ruido (± 2–3 puntos con 1 200 combates).

## Consecuencias

- El nivel 3 decide ≈ 2× más rápido con la misma fuerza: el banco, el arena y los combates contra el bot se benefician.
- Las decisiones ya no son las de la fase 12 (las huellas cambian), pero siguen siendo **deterministas** por semilla.
- `pruneAfter`/`pruneMargin` son dos pesos más de `SEARCH_SETTINGS`; si se cambia el esfuerzo (`turns`), hay que revisarlos.
- Una optimización futura que se anuncie como idéntica se comprueba con `npm run arena:perf -- --compare`.
- Lo que queda caro es el simulador de Showdown; reducirlo exigiría tocar `vendor/` o simular menos.
