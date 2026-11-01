# ADR-0027 — Conocer los sets del rival apenas ayuda al nivel 3 (parada en el techo)

- **Estado**: Aceptado (2026-11-01)
- **Contexto previo**: [ADR-0012](0012-deduccion-de-sets-y-estilo-del-rival.md) (deducción), [ADR-0024](0024-sets-del-meta-para-predecir-al-rival.md) (sets del meta), [ADR-0025](0025-que-trae-el-rival-no-importa.md) (qué trae el rival) · **Brief**: [fase 25](../fases/fase-25.md) · **Guía**: [bot](../guias/bot.md#arena-npm-run-arena)

## Contexto

Con equipo cerrado, el nivel 3 supone para el rival los sets del meta (fase 22) y los pesa por lo que observa (deducción, fase 11). Antes de mejorar la deducción, la fase 25 quería saber cuánto queda por ganar: el techo de conocer los sets exactos. La única cifra era vieja (fase 10–11, individuales, contra el nivel 2: 70,7 % con equipo abierto frente a 67,1 %).

## Techo (oráculo en el arena)

Gancho de medida `BotOptions.rivalSets` (`SituationOptions.rivalSets`): los sets reales del rival entran en `OpponentModel` como con equipo abierto, pero **solo para ese bot**: el rival de sus copias (`rivalContext`) sigue sin ver los sets del bot. Así las suposiciones de la búsqueda, la deducción y la vista previa usan los sets reales. En el arena, `--a-oracle-sets` se lo da al bot A con el equipo del B. Sin el gancho, el código es el de antes (`context.opponentTeam ?? null`).

Nivel 3 con el oráculo contra el nivel 3 de hoy (con el modelo de la fase 24), los dos con los sets del meta, dobles, espejo (`--fixed`), 15 arenas de 80 combates por tanda:

| Tanda | Equipos | Pares | Bot A con los sets reales |
|---|---|---|---|
| `t1` | Meta | 600 | 51,2 % ± 2,4 |
| `t2` | Meta | 600 | 49,7 % ± 2,4 |
| `r1` | Rivales guardados del usuario | 600 | **55,3 % ± 2,3** |

- **Con equipos del meta, ≈ 50,4 % con 1 200 pares**: cuando el rival juega sets del meta, la suposición de la fase 22 ya acierta lo que importa.
- **Con los rivales guardados (equipos de torneo), ≈ +5 puntos**: sus sets se apartan del meta y ahí la suposición falla.
- Tiempo: ≈ 0,55–0,6 s por decisión, sin diferencia entre los dos bots.

## Decisión

- **Parada** (decisión del usuario, 2026-11-01): no se mejora la deducción en esta fase. El techo contra el meta es ≈ 0 y los 5 puntos con equipos de torneo no se reparten aún (objetos, movimientos o repartos).
- Se quedan las herramientas: `BotOptions.rivalSets` y `arena --a-oracle-sets` (gancho de medida) con su test (`packages/bot/test/rival-sets.test.ts`).

## Consecuencias

- De la información oculta del rival, la salida (fase 21), lo que trae (fase 23) y sus sets contra el meta (esta fase) valen ≈ 0 para el nivel 3. Lo que queda: los sets **raros** (≈ 5 puntos contra equipos de torneo) y lo que hará el rival cada turno.
- Si se retoma: repartir los 5 puntos con oráculos parciales (solo objetos, solo movimientos, solo repartos) sobre `--teams rivales`, y mejorar lo que más pese (repartos más finos, sets condicionados por los compañeros, verosimilitud de daño y velocidad).
- Siguiente fase: la vista previa trae juntas las piezas de un combo ([fase 26](../fases/fase-26.md)), pendiente desde la fase 24.
