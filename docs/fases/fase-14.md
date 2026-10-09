# Fase 14 — El nivel 3 piensa en la vista previa

> **Brief de la fase.** Escrito el 2026-10-09 a partir de la petición del usuario, que sustituyó a la [propuesta de ampliaciones](fase-15.md) (sus opciones pasan a la fase 15).
> Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md), la de [herramientas](../guias/herramientas.md), [ADR-0011](../adr/0011-nivel-3-con-equipo-completo.md) y [ADR-0012](../adr/0012-deduccion-de-sets-y-estilo-del-rival.md).

## Objetivo

Que en la vista previa el nivel 3 **ya esté pensando en tu equipo**: quiénes son atacantes físicos y especiales, quién es más rápido que quién, quién deja KO de un golpe a quién, qué traerás y con quién empezarás. Que **elija mejor** con eso y que se pueda **ver** en una pestaña «Pensamiento del bot», aparte del registro: el «por qué el bot ha hecho esto» desde antes del turno 1.

## Decisión del usuario (2026-10-09)

1. **Enseñar y decidir**: el análisis alimenta la elección del nivel 3, medida con el arena; si no mejora, se queda el análisis visible y la elección de antes.
2. Se ve **al empezar el combate** (como el resto de explicaciones), ocultando lo no revelado del bot con equipo cerrado.
3. **Pestaña junto al registro** («Registro | Pensamiento del bot») con la vista previa y la explicación de cada turno.
4. Contenido: **roles** de tu equipo, **velocidades**, **KOs en los dos sentidos**, **amenazas y plan**, y lo que cree de tus sets.

## Punto de partida

- La vista previa del nivel 3 era la del nivel 2: cobertura por duelos (`selectByCoverage`), sin pensar en qué traería el jugador y sin explicación.
- La explicación (`DecisionExplanation`) existía desde el turno 1 en un desplegable bajo los controles, con «Cómo lo pensó» y «Lo que cree de tu equipo» (fases 8, 11 y 13).

## Hechos verificados

- En la vista previa no hay sandbox: el nivel 3 decide con los modelos analíticos (duelos y cadena de equipo completo). Son baratos: la vista previa nueva tarda ≈ 25 ms (individuales) y ≈ 15 ms (dobles).
- `inferBeliefs` sin observaciones da un prior uniforme sobre los sets estándar de cada especie (o el real con equipo abierto): sirve para el intervalo de velocidad y para «Lo que cree de tu equipo» antes de ver nada.
- La sala solo envía explicaciones de decisiones resueltas: la de la vista previa (turno 0) llega con el turno 1. `redactExplanation` se aplica cada vez con la vista del jugador.
- Medir: varios arenas a la vez escribiendo con `>>` en el mismo fichero se pisan en Windows (MSYS); cada proceso necesita su fichero. Arrancar 14 `npx tsx` a la vez falla a veces al arrancar: mejor `node --import tsx` y reintentos.

## Diseño aplicado

1. **Predicción** (`search/preview.ts`, `planPreview`): matriz de duelos; tus grupos por cobertura desde tu lado (softmax + reparto uniforme); tus líderes por softmax del duelo medio de cada conjunto de líderes. Pesos en `PREVIEW_SETTINGS`.
2. **Elección**: individuales, cada grupo propio con cada líder por la cadena de equipo completo contra tus grupos y líderes probables (una Mega por lado en cada alineación). Dobles, como el nivel 2: las tres variantes con la predicción (cobertura ponderada, mezcla, líderes contra tus líderes probables) perdían fuerza.
3. **Lectura** (`analysis/preview-read.ts`, `readPreview`): roles, velocidades, mejores golpes en los dos sentidos, peligro y probabilidades. Tipos en core (`PreviewAnalysis`, acción `bring`, `kind: 'team'`), censura en `redactExplanation` y esquema en protocol.
4. **Web**: pestañas en la columna derecha, panel con selector «Antes del combate / Turno N», frases de la vista previa y una ficha por cada Pokémon tuyo.

## Tests

- `packages/bot/test/preview.test.ts`: grupo válido con sus líderes en los dos modos, probabilidades coherentes, orden por peligro, roles y velocidades con equipo abierto, **sin mirar tus sets con equipo cerrado**, la explicación no cambia la decisión; `roleOf` y `compareSpeed`.
- `packages/bot/test/explain.test.ts`: el nivel 3 explica su vista previa (los demás no).
- `apps/server/test/tools.test.ts`: la explicación de la vista previa llega con el turno 1 y sin los Pokémon ni los movimientos del bot que no has visto.
- `packages/protocol/test/protocol.test.ts`: ida y vuelta de una explicación de vista previa.
- `apps/web/test/tools.test.tsx`: frases, fichas y selector «Antes del combate».

## Criterios de «hecho»

- El nivel 3 con la vista previa nueva **no pierde fuerza** contra el nivel 2 (mismas semillas que con la de antes, 1 200 combates por modo) y, si la gana, se queda.
- La explicación de la vista previa se ve al empezar el combate, sin información oculta.
- `npm run check` y `npm run e2e` en verde; CI en verde.
- Docs: ADR-0015, guías del bot, herramientas y web, CHANGELOG, AGENTS, PLAN, README y el brief de la fase 15.

> **Estado**: ✅ cerrada el 2026-10-10.
> - Individuales: el nivel 3 contra el 2 pasa de **62,5 % a 66,2 %** (mismas semillas, 1 204 combates por variante; mejora en las dos mitades).
> - Dobles: con la predicción, 79,7–80,3 % frente a 81,6 %: se queda la elección del nivel 2 (idéntica a antes), y la predicción solo se enseña.
> - Detalle en [ADR-0015](../adr/0015-vista-previa-del-nivel-3.md) y el [CHANGELOG](../../CHANGELOG.md).

## Fuera de alcance (ampliaciones posibles para después)

Ver la [propuesta de la fase 15](fase-15.md): criba en la web, tabla de daños y velocidades, entrenador en la vista previa, que el nivel 3 aprenda tus vistas previas, vista previa en dobles con la simulación 2 contra 2 y optimizador de Stat Points.
