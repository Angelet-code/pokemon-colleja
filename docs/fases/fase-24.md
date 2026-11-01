# Fase 24 — Los movimientos de estado que el nivel 2 no entendía

> **Brief de la fase.** Escrito el 2026-11-01, cuando el usuario montó equipos en torno a Intercambio (doble Intimidación con Wyrdeer; Sableye y Mr. Rime con Incineroar) y vio que el bot no sabía jugarlos. Sustituye al techo de los sets, que pasa a la [fase 25](fase-25.md). Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md), [ADR-0004](../adr/0004-bot-por-simulacion.md) (nivel 2 por simulación) y [ADR-0010](../adr/0010-bot-experto-con-sandbox.md) (nivel 3).

## Objetivo

Que el bot juegue (y espere del rival) los movimientos de estado que hoy cree inútiles, para que pueda jugar en torno al plan de su equipo: Intercambio con Intimidación, Última Palabra, Vasta Guardia, Llanto Falso, Danza Lluvia… Medido nivel 3 contra nivel 3.

## Punto de partida (verificado el 2026-11-01)

- El nivel 3 solo busca entre las `ownOptions` (12) mejores parejas del nivel 2 (`rankedOptions`, `search/lookahead.ts`), y las respuestas del rival también son las mejores del nivel 2 desde su lado. Lo que el nivel 2 valora a 0 **nunca llega a la búsqueda**, aunque el sandbox (Showdown real) lo valoraría bien.
- `DoublesSim.statusEffect` (`analysis/doubles-sim.ts`) solo entiende `SETUP_MOVES`, `STATUS_MOVES`, curación propia, Viento Afín, Espacio Raro, Refuerzo, Señuelo y pantallas (`analysis/move-knowledge.ts`). El resto vale 0.
- Con los sets del meta (`storage/metagame/2026-09-1760.json`), **el 19 % del uso de movimientos de estado** no se entiende. Los más usados: Vasta Guardia, Otra Vez, Última Palabra, Danza Lluvia, Llanto Falso, Mofa, Disparo Demora, Pulso Cura, Mismo Destino, Truco, Fría Acogida, Canto Mortal, Intercambio.
- El bot **no conoce Intimidación** en ningún sitio (ni al entrar ni con Intercambio) ni la prioridad de **Bromista**.
- Comprobado en el motor: Intercambio entre dos Pokémon con Intimidación activa las dos (−2 por turno); Intercambio entre Mr. Rime (Antibarrera) e Incineroar quita las pantallas y saca Intimidación; con Bromista, Intercambio sobre el aliado va antes que el rival y el aliado recibe Bromista.
- En 6 combates nivel 3 contra nivel 3 con el equipo «Doble Intimidación», el bot no usó Intercambio ni una vez.

## Diseño recomendado

Si te apartas de esto, escribe un ADR (ADR-0026).

1. **Cambios de stats al rival y al aliado** por tabla (`move-knowledge.ts`, como `SETUP_MOVES`): Última Palabra, Llanto Falso, Encanto, Chirrido, Rugido de Guerra, Onda Anómala… y Decoración/Motivación para el aliado. Una función común de bajada de stats con las reacciones del objetivo: Cuerpo Puro, Corte Fuerte, Fuerza Mental, Competitivo (+2 Ataque), Tenacidad (+2 Ataque Especial), Respondón, Coraza Reflejo…
2. **Habilidades de entrada** en la simulación: Intimidación (con Perro Guardián, Intrépido, Despiste, Ritmo Propio…) y Antibarrera al cambiar y al recibirlas.
3. **Intercambio** (y Imitación de habilidad / Abatidoras si es barato): intercambia `ability` de los dos y aplica sus entradas. El daño ya usa `ability` (Energía Pura, Potencia se pasan solas). Cuerpo Áureo lo bloquea.
4. **Bromista**: +1 de prioridad a los de estado; falla contra rivales Siniestro.
5. **Vasta Guardia**, **Danza Lluvia y compañía** (clima con `situation.withWeather`), **Pulso Cura** al aliado, **Otra Vez** si el rival tiene un último movimiento conocido.
6. Un ajuste numérico en `SEARCH_SETTINGS` (`statusModel`, 1/0) para medir: con 0, **decisiones idénticas a hoy** (huellas de `arena:perf`). El arena necesita `--b-settings`.
7. Un **test de cobertura**: cada movimiento de estado de los sets estándar o está modelado o está en una lista explícita de no modelados con su motivo.

## Tests

- Unidad de `DoublesSim`: Intercambio con dos Intimidaciones baja −2; Bromista adelanta; Cuerpo Áureo bloquea; Competitivo sube; Vasta Guardia para un ataque en área; Danza Lluvia cambia el daño.
- Cobertura de movimientos de estado (punto 7).
- `explain.test.ts`, `expert.test.ts` en verde. Con `statusModel: 0`, mismas huellas que antes del cambio.

## Criterios de «hecho»

- Nivel 3 contra nivel 3 en espejo (variante contra el de hoy con `statusModel: 0`), dos tandas, equipos del meta con sets del meta; si no pierde, se activa. Cifras en el CHANGELOG y un ADR.
- El bot usa Intercambio con el equipo «Doble Intimidación» (comprobado en combates).
- `npm run check` en verde y CI en verde. Docs y brief de la fase 25 al día.

## Fuera de alcance

- Que la vista previa traiga juntas las piezas de un combo (decide por duelos uno contra uno).
- Los movimientos de estado del rival en los turnos de seguimiento (el rival sigue atacando con su mejor ataque).
- Mofa, Truco, Canto Mortal, Sustituto, Relevo y Transformación (necesitan modelar más de lo que da la simulación de tres turnos).
