# ADR-0015 — Vista previa del nivel 3: predecir lo que traes y explicar lo que lee

- **Estado**: Aceptado (2026-10-09)
- **Contexto previo**: [ADR-0011](0011-nivel-3-con-equipo-completo.md), [ADR-0012](0012-deduccion-de-sets-y-estilo-del-rival.md), [ADR-0008](0008-herramientas-de-practica.md) · **Brief**: [fase 14](../fases/fase-14.md) · **Guías**: [bot](../guias/bot.md#nivel-3-vista-previa), [herramientas](../guias/herramientas.md#pensamiento-del-bot-pantalla-de-combate)

## Contexto

Hasta la fase 13 el nivel 3 elegía su equipo en la vista previa como el nivel 2: cada uno de sus Pokémon contra cada especie del jugador (duelos con daño esperado) y el grupo que mejor cubre a las seis (`selectByCoverage`). No pensaba en **qué traería el jugador** ni en el orden de salida, y no explicaba nada: la explicación empezaba en el turno 1.

El usuario quiere que en la vista previa el bot **ya esté pensando** en tu equipo (atacantes físicos y especiales, quién es más rápido que quién, quién deja KO de un golpe a quién) y que se pueda ver, aparte del registro, como «pensamiento del bot». Decisiones del usuario (2026-10-09):

1. El análisis **se enseña y además decide**: el nivel 3 lo usa para elegir sus Pokémon y su líder, medido con el arena; si no mejora, se queda el análisis visible y la elección de antes.
2. Se ve **al empezar el combate**, como el resto de explicaciones: con equipo cerrado se oculta lo no revelado del bot.
3. Va en una **pestaña junto al registro** («Registro | Pensamiento del bot»), con la explicación de cada turno; desaparece el desplegable de debajo de los controles.
4. Contenido: roles, velocidades, KOs en los dos sentidos, amenazas y plan, y lo que cree de tus sets.

## Decisión

### 1. Predecir lo que traes (`search/preview.ts`)

- Matriz de duelos `duelScore` de sus seis contra tus seis (la del nivel 2, con los sets que supone de los tuyos: estándar con equipo cerrado, los reales con equipo abierto).
- **Tus grupos**: cada grupo posible de tus seis (3 en individuales, 4 en dobles) puntúa como la cobertura del nivel 2 vista desde tu lado contra sus seis. Probabilidad: softmax de esa puntuación (`pickTemperature`) mezclada con un reparto uniforme (`pickUniform`), porque un jugador no siempre elige «lo mejor».
- **Tus líderes**: dentro de cada grupo, softmax del duelo medio de cada conjunto de líderes (`leadTemperature`; en dobles, parejas).
- De ahí salen, para cada Pokémon tuyo, la probabilidad de que lo traigas y de que empieces con él.

### 2. Elegir con esa predicción

- **Individuales**: cada grupo propio de tres con cada líder posible se valora con la **cadena de equipo completo** (`teamChainValue`, [ADR-0011](0011-nivel-3-con-equipo-completo.md)) contra tus `groups` grupos más probables, cada uno con cada líder, ponderado por su probabilidad. Una Megaevolución por lado: en una alineación solo el primer portador de megapiedra pelea como Mega.
- **Dobles**: como el nivel 2 (cobertura de tus seis; lideran los dos con mejor duelo medio). Se probó ponderar la cobertura por la probabilidad de que traigas a cada uno y elegir los líderes contra tus líderes probables: perdía fuerza (ver «Resultados»).
- Un poco de ruido (`noise`, con el generador sembrado) para no ser previsible. Los pesos están en `PREVIEW_SETTINGS` (por modo); `ExpertOptions.preview` los cambia. Coste: ≈ 25 ms en individuales y ≈ 15 ms en dobles.

### 3. Explicar lo que leyó (`analysis/preview-read.ts`, core, protocol)

- `DecisionExplanation` gana `kind: 'team'`, la acción `bring` (un Pokémon que trae; `lead` si empieza) y `preview: PreviewAnalysis`:
  - `rivals`: tus seis, del más peligroso al menos (duelo medio contra sus seis), con su **rol** (físico, especial, mixto o apoyo, por sus ataques e inversión), su **velocidad** (intervalo entre los sets que cree que llevas, en su forma de combate y con su objeto), movimientos de apoyo destacados y las probabilidades de traerlo y de empezar con él.
  - `own`: sus seis con su velocidad.
  - `matchups`: para cada pareja, quién es más rápido (`faster`, `slower`, `tie` o `depends` según tu reparto) y el mejor golpe de cada lado (movimiento, % mínimo y máximo, golpes para KO y probabilidad de KO de un golpe).
  - Además, `beliefs` de tus seis (lo que cree de tus sets antes de ver nada).
- Se construye bajo demanda con lo ya calculado, sin tocar el generador: no cambia la decisión.
- **Información oculta** (`redactExplanation`): con equipo cerrado, sus Pokémon que aún no has visto en el campo desaparecen de `own` y `matchups` (`hiddenOwn` dice cuántos), sus movimientos no usados se quitan de sus golpes y sus `bring` no vistos pasan a `hidden`. Lo tuyo (roles, velocidades, probabilidades, creencias) es tu propio equipo: no se censura. El replay guardado lo trae todo.

### 4. La web

- Columna derecha con pestañas **Registro | Pensamiento del bot**; en móvil, **Combate | Registro | Bot**. El panel elige la decisión («Antes del combate» o «Turno N», la última por defecto).
- La vista previa se cuenta con frases («Esperaba que trajeras…», «Lo que más temía…», «Eligió…») y una ficha por cada Pokémon tuyo: más rápidos y más lentos que él, quién lo tumba de un golpe o en dos y a quién tumba él.

## Resultados

Arena, nivel 3 contra nivel 2, **mismas semillas** con la vista previa de antes y la nueva (14 semillas × 86 combates = 1 204 por modo y variante, cada par de equipos dos veces cambiando de lado):

| | Antes | Nueva |
|---|---|---|
| Individuales | 62,5 % | **66,2 %** (+3,7). Por mitades de semillas: 63,9 → 65,5 y 61,0 → 66,8 |
| Dobles: cobertura ponderada por la predicción + líderes contra tus líderes probables | 81,6 % | 79,7 % (−1,9) |
| Dobles: mitad ponderada, mitad igual | 81,6 % | 80,3 % (−1,3) |
| Dobles: cobertura igual (nivel 2) + líderes contra tus líderes probables | 81,6 % | 80,1 % (−1,6) |

- En individuales la vista previa nueva mejora en las dos mitades: se queda.
- En dobles las tres variantes pierden, incluida la que solo cambia los líderes: el modelo de duelos 1 contra 1 no ve lo que hace buena a una pareja de salida (Sorpresa, Viento Afín, Espacio Raro, redirección). Se queda la elección del nivel 2; `planPreview` la replica con el mismo ruido (200 de 200 vistas previas idénticas a antes) y la predicción solo se usa para explicar.
- Medir: varios arenas escribiendo con `>>` en el mismo fichero se pisan en Windows; cada proceso escribe el suyo.

## Consecuencias

- En individuales el nivel 3 ya no comparte la vista previa del nivel 2 (en dobles, sí). Los niveles 0–2 no explican su vista previa.
- Mejorar la vista previa en dobles exige valorar parejas de salida con algo más que duelos (la simulación 2 contra 2 de `doubles-sim`, sin rival conocido): queda propuesto.
- `TurnExplanation.kind` admite `team` y las acciones `bring`: los replays viejos siguen valiendo; uno nuevo no se lee con un esquema viejo.
- La predicción de tus grupos es un modelo sencillo (cobertura): no aprende de tus vistas previas anteriores. Se podría ajustar con tu historial (fuera de alcance).
