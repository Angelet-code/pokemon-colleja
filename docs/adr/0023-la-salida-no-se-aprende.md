# ADR-0023 — La salida no se aprende de replays (y apenas importa para el bot)

- **Estado**: Aceptado (2026-10-12)
- **Contexto previo**: [ADR-0015](0015-vista-previa-del-nivel-3.md), [ADR-0018](0018-parejas-de-salida-simuladas.md), [ADR-0019](0019-valoracion-aprendida-de-replays.md), [ADR-0021](0021-valoracion-aprendida-en-la-busqueda.md) · **Brief**: [fase 21](../fases/fase-21.md) · **Guías**: [aprendizaje](../guias/aprendizaje.md#salidas-ladderleads), [bot](../guias/bot.md#arena-npm-run-arena)

## Contexto

El plan del usuario era, por orden: jugar bien el 4 contra 4 (fases 17–19), después la salida y por último elegir 4 de 6. La fase 21 debía aprender de replays el **emparejamiento de salidas** y elegir con él la pareja de salida del nivel 3 en dobles. Antes de tocar el bot había que pasar una prueba barata, y si no salía bien, parar y decidirlo con el usuario.

## Qué se hizo

### 1. Factores de salida (`learning/lead-features.ts`)

Doce factores de una «posición de salida»: las dos parejas en el campo al empezar el turno 1. Desde un lado se conoce el grupo propio (sus cuatro) y del rival se ve su salida y su vista previa, con los huecos sin ver pesados (`withOwnBack` en `position.ts`).

Todos son situaciones, nunca especies:
- quién se mueve antes;
- KOs (antes de moverse y en total) y daño entre las salidas;
- duelos 1 contra 1 de la salida contra el equipo rival;
- respuestas del banquillo a la salida rival;
- Sorpresa y clima en la salida;
- Espacio Raro y Viento Afín en la salida, por lo que favorecen al grupo.

Dos factores solo dependen de los grupos (`teamDuels`, `teamSpeed`), así que separan el **emparejamiento de grupos** de lo que aporta la salida. Tests: sin especies (Meowstic y Meowstic-F dan lo mismo), cambian con la Velocidad, son espejo desde los dos lados, y cambiar quién sale no mueve los factores de grupo.

### 2. Posiciones de salida de los replays (`npm run ladder:leads`)

- Una fila por lado (`datasets/ladder/leads-v1.jsonl`): 11 992 salidas de 5 996 partidas.
- El grupo propio sale del replay entero (es información de ese lado) y los sets se suponen solo con la vista previa.
- Test: quitar los cambios posteriores del rival no cambia nada.

### 3. La prueba barata (`npm run ladder:leads:eval`, 10 divisiones por partida)

| Modelo | log-loss | Acierto |
|---|---|---|
| Siempre 50 % | 0,6931 | 50,0 % |
| Duelos de la salida (lo que usa `leadChoice`) | 0,6933 | 50,9 % |
| Emparejamiento de grupos | 0,6931 | 51,7 % |
| Grupos + duelos | 0,6932 | 51,2 % |
| Todos los factores | 0,6930 (± 0,0018) | 51,6 % |

**Nada predice al ganador en el turno 1.** La correlación más alta de un factor con ganar es 0,04, y los factores se calculan bien. Con todo el entrenamiento, «Todos» no mejora a «Grupos». En el ladder, al principio decide sobre todo el nivel de cada jugador, y desde fuera los sets solo se suponen. Encaja con la fase 17: en los turnos 1–2 nadie predecía nada.

### 4. ¿Cuánto importa la salida para el bot? (`arena --fixed-group`)

- Nuevo modo del arena: grupos fijos como `--fixed` (los mismos en los dos combates del par, con la misma semilla), pero **cada bot elige su salida** entre sus cuatro. `--a-leads`/`--b-leads random` la sortea en su lugar.
- El bot gana una opción de medida, `BotOptions.fixedGroup` (niveles 2 y 3: traer exactamente esas posiciones y elegir solo quién sale). Sin ella las decisiones son idénticas: todas las huellas de `arena:perf` iguales.

En espejo, 600 pares por medida (semillas `t1-0…14`):

| Medida | Bot A gana |
|---|---|
| Nivel 3 con salida **al azar** contra nivel 3 eligiendo su salida | **48,4 % ± 2,4** |
| Nivel 2 con salida **al azar** contra nivel 2 eligiendo su salida | **48,7 % ± 2,5** |
| Nivel 3 contra nivel 2, los dos eligiendo su salida (referencia) | 81,1 % ± 2,1 |

Elegir la salida como hoy vale **≈ 1,5 puntos** frente al azar dentro del grupo, al borde del ruido. Por tanto, el techo de mejorar la salida es pequeño.

## Decisión

- **No se cambia cómo elige la salida el nivel 3** (decisión del usuario, 2026-10-12): los replays no la enseñan y para el bot vale poco.
- Se quedan las herramientas: `lead-features.ts`, `ladder:leads` y `ladder:leads:eval`, `arena --fixed-group` y `BotOptions.fixedGroup`. Sirven para medir el techo de cualquier decisión de vista previa antes de invertir en ella.
- **Desde ahora, las variantes del bot se miden nivel 3 contra nivel 3** (la variante contra el de hoy, en espejo y con dos tandas), por decisión del usuario. El nivel 2 gana ≈ 17 % de las veces y lo que se le gana puede ser explotar sus fallos: queda solo como criba barata.
- La siguiente fase ataca lo que más limita al nivel 3, la información oculta: suponer los sets del meta en lugar de los estándar ([fase 22](../fases/fase-22.md)).

## Consecuencias

- La salida del bot sigue siendo la de las fases 15–17 (los dos mejores duelos de su grupo, con su razón real en `leadChoice`).
- Medir con el nivel 3 en los dos lados cuesta ≈ 18 min por 1 200 combates en dobles (16 núcleos), frente a 9 min contra el nivel 2.
- Un fallo antiguo apareció en el arena: el nivel 3 responde «pass» a la petición de **Plegaria Vital** (elegir a quién revivir). No depende de esta fase y queda como tarea aparte.
