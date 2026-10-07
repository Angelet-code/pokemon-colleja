# ADR-0008 — Herramientas de práctica: calculadora, replays guardados y explicación del bot

- **Estado**: Aceptado (2026-10-08)
- **Guía operativa**: [docs/guias/herramientas.md](../guias/herramientas.md)

## Contexto

La fase 8 añade tres herramientas para aprender de cada combate. Había que decidir:

- dónde se calcula el daño;
- cuándo se guarda un replay y qué lleva;
- cómo explica el bot sus decisiones sin cambiarlas;
- cuándo ve el jugador esa explicación y qué parte de ella, porque habla de movimientos del rival que aún no conoce.

## Decisión

1. **Calculadora en el servidor** (decisión de producto): `POST /api/calc` usa `estimateDamage` de `@colleja/bot`, el mismo código con el que decide el bot (Champions = generación 0 de `@smogon/calc`). La web no carga los ≈1,6 MB de datos de la calculadora. Calcula todos los movimientos del atacante a la vez (una petición por movimiento, con un pequeño retardo para no saturar al editar).
2. **Replays guardados solo si los pides** (decisión de producto): al terminar, "Guardar replay" envía `battle:save-replay` por el WebSocket y el servidor guarda la sala terminada con `FileReplayRepository` (`storage/replays/<id>.json`, el mismo repositorio genérico que equipos y rivales). No hay `POST /api/replays`: el servidor es la única fuente de un replay, así no se puede guardar uno inventado. Guardar dos veces el mismo final devuelve el mismo id; tras rebobinar, el nuevo final es otro replay.
3. **Qué lleva un replay**: el `ReplayData` del motor (configuración, semilla, `inputLog`, log omnisciente), el log de la perspectiva del jugador (para verlo "como jugador"), la explicación de cada decisión del bot sin censurar (el combate ya terminó) y datos para la lista (nombre, dificultad, tipo de rival). El esquema vive en `@colleja/protocol` (`ReplayDataSchema` replica `ReplayData`; el servidor lo valida al guardar).
4. **Explicación del bot sin tocar la decisión**: `BattleAgent.explain?()` devuelve la explicación de la última `choose` (`DecisionExplanation` de `core`: método de valoración en español y opciones con su puntuación, la elegida marcada). Los bots solo guardan lo que ya calcularon y la construyen **bajo demanda** (solo el servidor la pide), sin usar el generador aleatorio. Hay un test que juega el mismo combate con y sin explicaciones y exige el mismo `inputLog` en los tres niveles y los dos modos. La vista previa no se explica.
5. **Se muestra tras resolverse cada turno** (decisión de producto). La sala guarda las explicaciones por turno de decisión y solo envía las de turnos ya jugados (`turno de la decisión < turno actual`, o el combate terminado). Van en `battle:update` (las nuevas) y en `battle:snapshot` (todas); al deshacer o rebobinar se descartan las de los turnos que se repiten.
6. **Lo no revelado se oculta** (decisión de producto): con equipo cerrado, `redactExplanation` (core) convierte en `hidden` las opciones con movimientos que el jugador aún no ha visto usar o con Pokémon que no han salido, y quita la Mega si aún no ha ocurrido. Con equipo abierto se ve todo. El visor de replays aplica la misma regla en "Como jugador".
7. **Visor omnisciente con interruptor** (decisión de producto): por defecto muestra el log omnisciente (PS exactos de los dos lados, equipos completos); "Como jugador" usa el log de p1. Las funciones de pasos (`replaySteps`, `replayFrame`) son puras y testeadas.

## Alternativas descartadas

- **Calculadora en el navegador**: sin ida y vuelta, pero el bundle crecería mucho.
- **Guardar todos los replays automáticamente**: el usuario prefirió elegir cuáles guardar.
- **Que `choose` devuelva `{ choice, reasoning }`**: rompería la interfaz de todos los agentes y obligaría a construir la explicación aunque nadie la mire (el arena y los tests de fuerza juegan miles de turnos).
- **Explicación solo al terminar**: el usuario prefirió verla turno a turno.
- **Mostrar todas las opciones del bot**: revelaría sus movimientos antes de usarlos y rompería el principio de información oculta (PLAN §3.1).

## Consecuencias

- La calculadora y el bot nunca discrepan: comparten código y el test de la calculadora compara con `estimateDamage`.
- Los replays guardados se pueden reproducir exactamente (`BattleSession.fromReplay`) y verse turno a turno.
- Un bot nuevo solo necesita implementar `explain()` para aparecer en el panel; si no lo hace, el panel no sale.
- La puntuación de las opciones depende del nivel (daño esperado en el 1, balance de PS simulado en el 2): el método se explica en cada turno.
