# ADR-0012 — Nivel 3: deducción de los sets del rival y adaptación a su estilo

- **Estado**: Aceptado (2026-10-08)
- **Contexto previo**: [ADR-0010](0010-bot-experto-con-sandbox.md), [ADR-0011](0011-nivel-3-con-equipo-completo.md) · **Brief**: [fase 11](../fases/fase-11.md) · **Guía operativa**: [docs/guias/bot.md](../guias/bot.md)

## Contexto

Al cerrar la fase 10, el nivel 3 ganaba al nivel 2 ≈ 64,4 % en individuales con equipo cerrado, frente a un 70,7 % con equipo abierto. La diferencia es **información oculta**: el bot suponía siempre el set más ofensivo de cada rival (`OpponentModel.candidates[0]`) y repartía sus suposiciones con `index % n`, aunque lo visto en el combate (el daño de cada golpe, quién se movió antes) descartara ese set.

El usuario pidió además que el bot **prediga al rival**: no solo sus sets, sino cómo juega. Si siempre hace lo evidente, esperar lo evidente; si intenta adivinar la jugada del bot, tenerlo en cuenta.

Objetivo de la fase: ≥ 67 % en individuales con ≥ 1200 combates y otra semilla, sin empeorar dobles (81 %) y con ≤ ~1 s de media por decisión. Solo el nivel 3: el nivel 2 sigue fijo como referencia del arena.

## Decisión

1. **Observaciones** (`inference/observations.ts`): se recorre el log de la perspectiva del bot con un `BattleView` y se extraen:
   - los **golpes** (atacante, defensor, movimiento, crítico, daño exacto o en %, KO), con el estado de ese momento;
   - el **orden** de los movimientos de la misma prioridad en un turno.
   
   Los casos ambiguos se descartan: multigolpe (y Amor Filial), daño indirecto (`[from]`), Refuerzo, Premonición y, para el orden, los turnos con Garra Rápida, Baya Chiri, Mano Rápida, Espacio Raro, Cede Paso u Último Lugar.
2. **Creencias** (`inference/beliefs.ts`, `inferBeliefs` → `SetBeliefs`): para cada rival visto o de la vista previa, los candidatos de `OpponentModel` con su **probabilidad**.
   - **Prior uniforme**, como `teamgen`. La **cláusula de objeto** descarta los objetos ya mostrados por otro rival.
   - **Verosimilitud** por observación: 1 si alguna de las 16 tiradas de `estimateDamage` (o el orden por velocidad) lo explica, con la tolerancia de redondeo del %; `CONTRADICTION_LIKELIHOOD` (0,05) si no, para tolerar efectos no modelados.
   - Una megapiedra que el rival no usa pudiendo pierde peso (`UNUSED_MEGA_LIKELIHOOD`).
   - Con **sets propios**, si ningún candidato lo explica todo, entran **variantes de reparto** del mejor (`spreadVariants`: ataque al máximo, rápido, atacante resistente, defensa física, defensa especial y Pañuelo Elección si el objeto no se conoce) con un prior menor.
   - Se queda con 8 hipótesis por rival y se calcula **una vez por decisión** real.
3. **Uso en la búsqueda**: `Situation` acepta `beliefs: 'infer'`. Entonces el combatiente supuesto es el set más probable, y `FoeMember.weights` lleva las probabilidades. `rivalAssumptions` reparte las suposiciones por **cuantiles** de esas probabilidades, también para los no vistos de la vista previa. Sin `beliefs` (el nivel 2) todo sigue igual.
4. **Estilo del rival** (`inference/style.ts`, `RivalStyle`):
   - En cada búsqueda el nivel 3 apunta qué esperaba del rival: su respuesta **evidente** (la mejor del nivel 2 desde su lado) y su **contrapredicción** (la que más daño hace a la opción evidente del bot, entre sus `counterCandidates` mejores).
   - En el turno siguiente lee en el log qué hizo el rival y lleva la cuenta, con priors beta suaves.
   - Con eso ajusta `rivalReplies` (`styleAdjustment`): un rival evidente baja la temperatura del softmax (×0,25–2) y uno que contrapredice más de lo que daría el azar recibe hasta un 60 % de peso en su contrapredicción.
   - Es estado del agente durante un combate: se olvida lo posterior a un rebobinado.
5. **Explicación**: `DecisionExplanation.beliefs` (core, opcional en `TurnExplanationSchema`) lleva, por cada Pokémon del jugador visto, las 2–3 hipótesis más probables. La web las muestra en «Lo que cree de tu equipo». No se redactan: son del equipo del jugador.

## Resultados

Arena contra el nivel 2, equipos aleatorios con vista previa, equipo cerrado. Cada variante se mide con las mismas semillas que su referencia:

| Prueba | Fase 11 | Fase 10 (referencia) |
|---|---|---|
| Individuales, semilla 1 (1193 combates) | **67,7 %** | 64,2 % |
| Individuales, semilla 2 (1194) | **66,5 %** | — |
| **Individuales, total (2387)** | **67,1 %** | ≈ 64,4 % (fase 10, 1800) |
| Hojas con el set del fork (`leaf`, semilla 1) | 67,1 % (descartada) | — |
| Dobles, semillas d1 + d2 (608) | **80,8 %** (78,6 / 82,9) | 80,3 % (80,9 / 79,6) |
| Dobles d1 sin estilo / sin deducción (304) | 80,3 / 82,9 % | — |

Tiempo medio por decisión, sin otros procesos: **0,41 s en individuales y 0,55 s en dobles**.

## Consecuencias

- Objetivo cumplido en individuales (67,1 % en dos semillas) y dobles sin cambios (las diferencias entre variantes quedan dentro del ruido de ±4,5 puntos de 304 combates).
- El nivel 3 deja de ser determinista solo por posición: depende también de lo que vio en el combate (su estilo y sus creencias). Sigue siendo reproducible: mismo log de perspectiva → mismas creencias y mismo estilo. El test de invariancia (`expert.test.ts`) sigue en verde: lo oculto no cambia la decisión.
- Las creencias no usan nada oculto: solo el log de la perspectiva del bot y los sets estándar.
- Queda hueco hasta el techo con equipo abierto (70,7 %). Lo siguiente sería ordenar qué no vistos trajo el rival por lo que le conviene, que en la fase 10 dio ruido y aquí no se ha vuelto a medir.

## Alternativas descartadas

- **Hojas con las creencias fijadas al set de la suposición** (`leaf`): 67,1 % frente a 67,7 % con la misma semilla. Era la recomendación del brief; no aporta y se quitó.
- **Verosimilitud cero** para un set que contradice una observación: un efecto no modelado (un objeto raro, una habilidad) descartaría el set real para siempre.
- **Deducción y estilo también en el nivel 2**: fuera de alcance por decisión del usuario; el nivel 2 es la referencia fija del arena.
