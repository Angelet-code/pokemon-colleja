# Fase 17 — Propuesta de ampliaciones (por elegir)

> **Propuesta, no plan cerrado.** Escrita el 2026-10-11 al cerrar la fase 16 (la E2 de su propuesta). La siguiente sesión debe **preguntar al usuario** qué opción (o combinación) quiere, con la recomendada primero, y después convertir este fichero en el brief de la fase con el formato de [fase-16.md](fase-16.md).
> Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md), la de [herramientas](../guias/herramientas.md) y la del [banco](../guias/banco.md).

## Punto de partida

- El nivel 3 lee los dos equipos enteros ([ADR-0017](../adr/0017-arquetipos-en-la-vista-previa.md)) y, en dobles, juega con el Espacio Raro o el Viento Afín que pone cada grupo.
- Las parejas de salida se simulan 2 contra 2 ([ADR-0018](../adr/0018-parejas-de-salida-simuladas.md)) **solo para explicar**: por qué esperaba tu salida y por qué eligió la suya (combo, KO, presión, Sorpresa, Señuelo, a quién deja atrás). Elegir la salida con esa simulación perdía 2–3 puntos: premia el primer intercambio y no el combate entero.
- `DoublesSim.evaluateLineup` + `SimTrace` responden «¿qué pasa si salen estos contra estos?».
- El arena mide con tus rivales (`--teams rivales`); la predicción de tus grupos y salidas no aprende de ti.

## Opciones

### G. Vista previa del bot menos predecible (recomendada, pedida por el usuario el 2026-10-11)

Con los mismos 6 enfrente, el bot trae casi siempre los mismos Pokémon y los mismos líderes (`noise` de 0–2 puntos sobre coberturas de ≈ 200). Elegir **con probabilidad entre las mejores opciones** (softmax con temperatura sobre las que estén a menos de X puntos de la mejor), con el generador sembrado y los pesos en `PREVIEW_SETTINGS`. Medir que la fuerza no baja (arena con tus rivales y aleatorios) y la variedad (grupos y líderes distintos contra el mismo equipo con semillas distintas).

### C. Entrenador de vista previa

Mientras eliges tu equipo (o antes, en el teambuilder), ver **lo tuyo** con lo que ya calcula el bot: tus mejores parejas de salida contra sus salidas probables con sus razones (`leadReading` desde tu lado), tus amenazas, sus Pokémon más rápidos que los tuyos. Sin revelar sus sets (los supone como hace el bot con los tuyos). Útil también para preparar combates del juego real.

### E3. Salida valorada con el combate entero

Lo que le faltó a la E2: valorar la pareja de salida con lo que pasa después de los primeros turnos. Por ejemplo, simular los primeros turnos y continuar con los supervivientes y el banquillo como la cadena de equipo completo de individuales (`teamChainValue`), o mezclar el valor 2 contra 2 con la cobertura del resto. Medir con el arena (tus rivales y aleatorios, ≥ 1 200 combates, mismas semillas). Investigación: puede no mejorar.

### A. Criba y varias versiones en la web

Llevar `--screen` a la página del banco: pegar o elegir 3–6 versiones del equipo, cribarlas con el nivel 2 y comparar las dos mejores con el nivel 3 en una sola prueba. Es lo que más acerca el «equipo perfecto».

### B. Tabla de daños y velocidades en el teambuilder o el banco

Tu equipo contra cada rival guardado, hacia los dos lados, con el % de daño y la probabilidad de KO, sobre un endpoint del servidor (la calculadora no va a la web).

### D. El nivel 3 aprende tus vistas previas

Guardar qué traes y con qué sales contra cada tipo de equipo y ajustar la predicción con tu historial. Medible: acierto de la predicción en tus combates guardados.

### F. Optimizador de Stat Points

Lo mínimo para aguantar un golpe concreto o superar a alguien en velocidad, y el resto al ataque (`estimateDamage` en el servidor y `championsStats`).

### H. Más arquetipos y razones

`TEAM_ARCHETYPES` no ve Intimidación en bucle, terrenos (Electrogénesis, Psicogénesis…), Cola Somnífera/Otra Vez ni las inmunidades del aliado a los ataques en área; `DoublesSim` no hace que el rival use movimientos de estado. Añadirlos con su test, y los terrenos al modelo (`withTerrain`, como `withWeather`).

## Recomendación

**G** (pedida por el usuario y rápida de medir), con **C** si quiere usar lo que ya sabe el bot para preparar sus propias salidas.

## Criterios de «hecho» (los de la opción elegida, más)

- `npm run check` y `npm run e2e` en verde; CI en verde.
- Docs: CHANGELOG, AGENTS, PLAN, README, guías y ADR si hay decisión de arquitectura, y el brief de la fase 18.
