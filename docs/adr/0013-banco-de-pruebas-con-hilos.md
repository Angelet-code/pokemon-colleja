# ADR-0013 — Banco de pruebas: combate entre bots en `engine`, hilos de trabajo y estadística secuencial

- **Estado**: Aceptado (2026-10-09)
- **Contexto previo**: [ADR-0004](0004-bot-por-simulacion.md), [ADR-0010](0010-bot-experto-con-sandbox.md) · **Brief**: [fase 12](../fases/fase-12.md) · **Guía operativa**: [docs/guias/banco.md](../guias/banco.md)

## Contexto

El usuario quiere montar su equipo perfecto con un número: su equipo guardado contra sus rivales guardados, bot contra bot, con el % de victorias por rival y una comparación entre dos versiones del equipo. Al afinar a mano «Collejas pingüi» con scripts sueltos, cada variante costaba ≈ 250 combates y 10–15 min, con núcleos parados, el mismo número de combates en rivales ya decididos y cada versión medida por separado.

Restricciones:

- Nadie puede depender de `tools/*`, así que el servidor no puede usar el arena.
- El nivel 3 piensa de forma síncrona (≈ 1 s por decisión en dobles con estos equipos): cientos de combates en el hilo del servidor lo bloquearían.
- El resultado debe ser reproducible con la semilla, como el arena.

## Decisión

1. **`playBotBattle` en `engine`** (`engine/src/bot-battle.ts`): un combate entre dos agentes ya creados, con sus métricas (`winner` o `'error'`, turnos, elecciones inválidas y no disponibles, tiempo por lado y el replay si falla). `engine` sigue sin depender del bot: solo usa `BattleAgent` de core. El arena pasa a usarlo y da las mismas cifras (comprobado con `--seed baseline`). `teamProblems` (legalidad con mensajes en español) se mueve también a `engine`, porque lo usan el servidor, el banco y el CLI.
2. **Paquete `@colleja/bench`** (solo Node), consumido por el servidor y por `tools/bench`:
   - `BenchScheduler` decide qué combate toca. Es puro: no juega ni conoce hilos.
   - `runBench` reparte los combates en un `BattleRunner` y junta los resultados.
   - `summary.ts` los convierte en la tabla y `stats.ts` tiene la estadística (funciones puras).
3. **Hilos de trabajo** (`WorkerPool`, `node:worker_threads`): tantos como `availableParallelism() − 1`, con una **cola dinámica de combates sueltos** (cada hilo libre coge el siguiente) y nunca más hilos que combates en la primera ronda.
   - Un hilo no hereda el cargador de TypeScript del principal (tsx o Vitest), así que su entrada `worker-entry.mjs` registra `tsx` antes de importar `worker.ts`.
   - Un hilo que muere se sustituye, y su combate cuenta como error.
   - `InlineRunner` juega en el propio hilo (tests y niveles rápidos).
4. **Determinismo con hilos**:
   - Cada combate depende solo de `semilla:rival:modo:índice`, y el lado del equipo alterna con el índice.
   - El **plan** crece por rondas, y cada ronda solo depende de los resultados de las anteriores.
   - Los hilos libres juegan **combates especulativos**: la siguiente ronda tal como la predicen los resultados parciales. Se reutilizan si el plan real los incluye y nunca cuentan si no.
   - Así ningún núcleo espera al combate más lento y la tabla es la misma con 0, 1 o 15 hilos (hay un test que lo comprueba).
5. **Estadística** (cada técnica tiene test):
   - **Total ponderado igual por rival y modo**, no por número de combates.
   - **Reparto de Neyman**: tras el mínimo por rival (6), cada combate va donde más reduce la varianza del total. La varianza usa `(puntos + 1) / (n + 2)` para que un 5/5 no parezca seguro.
   - **Parada secuencial**: tras cada ronda se para si el IC 95 % del total (o de la diferencia A/B) ya está dentro del margen. En A/B también si la diferencia es claramente distinta de 0, con un umbral corregido por Bonferroni sobre el número máximo de rondas. Siempre hay un tope de combates por versión.
   - **A/B en pares**: las dos versiones juegan contra el mismo rival con la misma semilla de combate, el mismo lado y las mismas semillas de bot (números aleatorios comunes). Se mide la **diferencia** por par (varianza muestral más un prior de 0,25). Con el mismo equipo en los dos lados, la diferencia es exactamente 0.
   - Los combates que fallan (un bot que manda `pass` donde no toca) cuentan como **error**, nunca como derrota, y el resumen guarda los 10 primeros con su semilla para reproducirlos.
6. **Servidor**:
   - `BenchManager` lleva un banco a la vez (409 si ya hay uno) en hilos de trabajo, y el hilo del servidor sigue atendiendo.
   - `POST /api/bench` responde `{ benchId }`; el progreso llega por un WebSocket propio (`/ws/bench`, `bench:watch` → `bench:progress`/`bench:result`), con la tabla entera como mucho cada 250 ms.
   - Al acabar (o al cancelar con `DELETE /api/bench/:id`) se guarda en `storage/bench/` con `FileBenchRepository`. Lleva la configuración y los equipos tal como estaban, para comparar versiones más tarde.
   - `BenchSummarySchema` (protocol) replica `BenchSummary` (bench); el servidor deja de compilar si divergen.

## Resultados

Equipo «Collejas pingüi» del usuario, dobles, Ryzen 7 5800X (8 núcleos, 16 hilos), 15 hilos de trabajo:

| Prueba | Resultado | Tiempo |
|---|---|---|
| 5 rivales × 20 combates, nivel 3 contra 3 | 44,0 % ± 9,7 (4 combates con error del bot) | 152 s |
| A/B v1 contra v2, 20 rivales, nivel 3 contra 3, ± 5 | v1 mejor: B − A = −4,2 ± 4,9 (560 combates, para por margen) | 874 s |
| Criba v0–v4, nivel 2 contra 2, 100 por rival (2000 combates por variante) | v4 42,9 · v1 42,8 · v2 38,5 · v0 35,7 · v3 34,7 | ≈ 45 s por variante |

- **La criba con el nivel 2 vale para elegir finalistas**. El nivel 3 de la prueba manual daba v1 ≈ v4 (48–51 %) por encima de v0, v2 y v3 (38–41 %), y el nivel 2 coloca arriba las mismas dos. El orden dentro de las tres peores no coincide, pero el nivel 3 tampoco las separa (diferencias de ≤ 2,5 puntos con ± 8 de ruido). Por eso el CLI ofrece `--screen` (las dos mejores del nivel 2 pasan a la A/B).
- **Rendimiento de los hilos**: 1 hilo da 0,89 s por decisión; 8 hilos, 1,16 s; 15 hilos, 1,05 s. Con 15 hilos se juega ≈ el doble que con 8 (SMT), así que no sobran hilos.
- **Perfil del nivel 3** (un combate de dobles): 30 % en el simulador de Showdown (bifurcaciones del sandbox), 11,5 % en `@smogon/calc` y 11 % en `doubles-sim`. No hay un punto caliente barato.

## Consecuencias

- **El objetivo de la A/B en ≤ 5 min con el nivel 3 contra 3 no se cumple** (≈ 14 min con ± 5). La estadística ya ahorra ≈ 3× frente a medir cada versión por separado: la varianza de la diferencia en pares es ≈ 0,18 por par, frente a ≈ 0,5 sin emparejar, y el reparto de Neyman deja con 7 combates a los rivales que siempre ganan o pierden. Lo que falta es velocidad del nivel 3. Decisión del usuario (2026-10-09): **aceptarlo y documentar el flujo rápido**:
  - criba con el nivel 2 (≈ 1 min por variante);
  - A/B con el nivel 3 y ± 10 (≈ 8 min: manda el mínimo de 6 combates por rival), o tu bot 3 contra rivales 2 (≈ 4 min, pero mide otra cosa: ahí v1 y v2 empatan, +0,8 ± 8,6);
  - acelerar el nivel 3 queda propuesto para la [fase 13](../fases/fase-13.md).
- Los niveles por lado son configurables. La web ofrece solo los dos más altos (decisión del usuario) y el CLI y la API, del 0 al 3 (tests y CI).
- Medir un equipo pesa: con un banco en marcha, la CPU va al 100 %. El servidor sigue respondiendo, pero un combate humano a la vez va algo más lento.
- `@colleja/bench` es solo Node (hilos). La web nunca lo importa: recibe la tabla por el protocolo.
