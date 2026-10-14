# ADR-0025 — Saber qué trae el rival no ayuda al nivel 3

- **Estado**: Aceptado (2026-10-12)
- **Contexto previo**: [ADR-0015](0015-vista-previa-del-nivel-3.md) (vista previa), [ADR-0023](0023-la-salida-no-se-aprende.md) (techo de la salida), [ADR-0024](0024-sets-del-meta-para-predecir-al-rival.md) (sets del meta) · **Brief**: [fase 23](../fases/fase-23.md) · **Guías**: [bot](../guias/bot.md#arena-npm-run-arena), [aprendizaje](../guias/aprendizaje.md#qué-trae-el-rival-ladderbringeval)

## Contexto

En dobles, el rival enseña 6 en la vista previa y trae 4. El nivel 3 no sabe cuáles: en cada suposición de la búsqueda (`search/assumptions.ts`), las especies aún no vistas entran en un orden al azar, todas igual de probables. La fase 23 quería predecir qué trae el rival con lo que se trae en el ladder. Como en la fase 21, primero el techo y una prueba barata.

## Techo (oráculo en el arena)

Gancho de medida `BotOptions.rivalBrought` (especies que trajo el rival, no sus sets): `Situation` deja en la vista previa del rival solo esas, así que las suposiciones, los rivales que se valoran y la posición aprendida ya no cuentan con los que se quedaron fuera. En el arena, `--a-oracle` (con `--fixed` o `--fixed-group`) se lo da al bot A con el grupo real del B.

Nivel 3 con el oráculo contra el nivel 3 de hoy, los dos con los sets del meta, dobles, espejo, equipos del meta, 15 arenas de 80 combates por tanda:

| Tanda | Bot A gana |
|---|---|
| `t1` | 51,1 % ± 2,4 |
| `t2` | 49,7 % ± 2,4 |

**≈ 50,4 % con 1 200 pares**: saber exactamente qué trajo el rival no le da nada medible al nivel 3. Lo probable: los 2 de atrás suelen salir pronto, la búsqueda mira 1–2 turnos y ya promedia varias suposiciones, y valorar de más a uno que no está pesa poco frente a lo que hay en el campo.

## Prueba barata (`npm run ladder:bring:eval`)

Replays públicos de dobles (rating ≥ 1 400); solo los lados cuyos 4 llegaron a salir. Ajuste con los de antes del 1 de octubre (3 598 lados) y prueba con los de después (6 097). «Aciertos»: de los que predice, cuántos trajo.

| Predictor | 4 de 6 antes del combate (aciertos / log-loss) | Los 2 de atrás tras ver la salida (aciertos / log-loss) |
|---|---|---|
| Uniforme (lo de hoy) | 68,8 % / 0,637 | 51,7 % / 0,693 |
| Por especie (lo que se trae cada una) | 71,3 % / 0,618 | **61,7 %** / 0,651 |
| Por posición en la vista previa | 68,8 % / 0,635 | 54,6 % / 0,687 |
| Especie + posición | 71,2 % / 0,622 | 60,7 % / 0,650 |
| Especie + compañeros de salida | 71,3 % / 0,618 | 61,8 % / **0,635** |

Antes del combate apenas hay señal; con la salida vista, la especie y sus compañeros aciertan ≈ 10 puntos más que el azar. Se puede predecir, pero el techo dice que al bot no le sirve.

## Decisión

- **El bot no cambia**: sigue sorteando las especies no vistas (decisión del usuario, 2026-10-12, tras confirmar el techo con dos tandas).
- Se quedan las herramientas: `BotOptions.rivalBrought` y `arena --a-oracle` (gancho de medida; sin él, mismas decisiones en `arena:perf`) y `npm run ladder:bring:eval`.
- No se añaden probabilidades de traer a la instantánea del meta.

## Consecuencias

- Las dos decisiones de la vista previa del rival (su salida, fase 21, y su grupo, esta fase) valen ≈ 0 para el nivel 3 en combate. Lo que queda de información oculta son **los sets** (la fase 22 ganó 5–9 puntos ahí) y **lo que hará el rival** en cada turno.
- Siguiente paso propuesto: medir cuánto falta en los sets (un oráculo de sets frente a los sets del meta) antes de mejorar la deducción ([fase 24](../fases/fase-24.md)).
