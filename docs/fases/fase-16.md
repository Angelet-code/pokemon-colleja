# Fase 16 — Propuesta de ampliaciones (por elegir)

> **Propuesta, no plan cerrado.** Escrita el 2026-10-11 al cerrar la fase 15 (la E1 de su propuesta). La siguiente sesión debe **preguntar al usuario** qué opción (o combinación) quiere, con la recomendada primero, y después convertir este fichero en el brief de la fase con el formato de [fase-15.md](fase-15.md).
> Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md), la de [herramientas](../guias/herramientas.md) y la del [banco](../guias/banco.md).

## Punto de partida

- El nivel 3 lee los dos equipos enteros en la vista previa ([ADR-0017](../adr/0017-arquetipos-en-la-vista-previa.md)): arquetipos (Espacio Raro, Viento Afín, climas, potenciarse con apoyo), quién los pone y quién los aprovecha, el grupo que mejor los mantiene y la pareja de salida. Lo enseña en «Pensamiento del bot» (`teamStory`).
- En dobles, los duelos de un grupo se mezclan con los mismos duelos bajo el Espacio Raro o el Viento Afín que pone (`fieldShare`); la pareja de salida sigue siendo la de mejor duelo medio. Sumar puntos sueltos por arquetipo no ganaba fuerza.
- El arena puede jugar con tus rivales guardados (`--teams rivales`): son la referencia para medir algo de equipo, porque los aleatorios casi nunca forman arquetipos.
- La predicción de tus grupos sigue siendo un modelo de cobertura: no aprende de cómo eliges tú.
- El banco (`/banco`, `npm run bench`) mide tu equipo contra tus rivales; `--screen` (criba con el nivel 2) solo existe en la terminal.

## Opciones

### E2. Parejas de salida simuladas (recomendada, segunda parte de la E de la fase 15)

Valorar las parejas de salida propias contra tus parejas probables con la simulación 2 contra 2 (`doubles-sim`, que ya modela Sorpresa, Refuerzo, redirección, Viento Afín, Espacio Raro, pantallas y ataques en área) o con el sandbox, partiendo de los candidatos de `readTeam` (para no simular las 15 × 6 combinaciones). Es lo que falta para que la salida monte el plan (Sorpresa + potenciador, inductor + atacante). Medir con el arena con `--teams rivales` y con aleatorios (≥ 1 200 combates cada uno, mismas semillas que la referencia de la fase 15).

### G. Vista previa del bot menos predecible (pedida por el usuario el 2026-10-11)

Hoy el bot elige en la vista previa **la opción de más puntuación** más un ruido pequeño (`PREVIEW_SETTINGS.noise`: 0–1 punto en individuales, 0–2 en dobles, sobre coberturas de ≈ 200 puntos). Con los mismos 6 enfrente trae casi siempre los mismos Pokémon y los mismos líderes. Elegir **con probabilidad entre las mejores opciones** (softmax con temperatura sobre las que estén a menos de X puntos de la mejor), con el generador sembrado y los pesos en `PREVIEW_SETTINGS`. Medir que la fuerza no baja (arena) y la variedad (grupos y líderes distintos contra el mismo equipo con semillas distintas). Cabe junto a **D**.

### A. Criba y varias versiones en la web

Llevar `--screen` a la página del banco: pegar o elegir 3–6 versiones del equipo, cribarlas con el nivel 2 y comparar las dos mejores con el nivel 3 en una sola prueba, con la tabla de cada fase. Es lo que más acerca el «equipo perfecto».

### B. Tabla de daños y velocidades en el teambuilder o el banco

La lectura de la vista previa ya calcula, para dos equipos, quién es más rápido y quién tumba a quién. Llevarla a una pantalla propia: tu equipo contra cada rival guardado, hacia los dos lados, con el % de daño y la probabilidad de KO. Sobre un endpoint del servidor (la calculadora no va a la web).

### C. Entrenador en la vista previa y «Pinta del equipo» en el teambuilder

Mientras eliges tu equipo, ver **lo tuyo** de la lectura del bot (tus amenazas, sus Pokémon más rápidos que los tuyos, a quién tumbas) sin revelar sus sets. Y en el editor, un panel con la lectura de tu equipo (`readTeam` es puro y apto para navegador, pero vive en el índice de `@colleja/bot`: haría falta una entrada ligera como `@colleja/bot/opponent-model`): arquetipo, piezas que faltan, el grupo que mejor encaja y la pareja de salida. El usuario no lo eligió en la fase 15 (solo «Pensamiento del bot»).

### D. El nivel 3 aprende tus vistas previas

Guardar qué Pokémon traes y con cuál empiezas contra cada tipo de equipo, y ajustar la predicción (`pickTemperature`, preferencias por Pokémon) con tu historial. Medible: acierto de la predicción en tus combates guardados.

### F. Optimizador de Stat Points

Lo mínimo para aguantar un golpe concreto o superar a alguien en velocidad, y el resto al ataque. Se apoya en `estimateDamage` (servidor) y `championsStats`.

### H. Más arquetipos en la lectura

`TEAM_ARCHETYPES` no ve Intimidación en bucle (Intimidación + cambios), terrenos (Electrogénesis, Psicogénesis…), Cola Somnífera/Otra Vez, ni las inmunidades del aliado a los ataques en área (Terremoto con un volador). Añadirlos a `team-read.ts` con su test, y los terrenos al modelo (`withTerrain`, como `withWeather`).

## Recomendación

**E2** (completa la vista previa en dobles, que es lo que el usuario pidió en dos pasos), con **G** si cabe. Para montar su equipo, **A**.

## Criterios de «hecho» (los de la opción elegida, más)

- `npm run check` y `npm run e2e` en verde; CI en verde.
- Docs: CHANGELOG, AGENTS, PLAN, README, guías y ADR si hay decisión de arquitectura, y el brief de la fase 17.
