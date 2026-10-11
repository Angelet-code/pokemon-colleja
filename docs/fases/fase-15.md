# Fase 15 — Propuesta de ampliaciones (por elegir)

> **Propuesta, no plan cerrado.** Escrita el 2026-10-09 al cerrar la fase 14. La siguiente sesión debe **preguntar al usuario** qué opción (o combinación) quiere, con la recomendada primero, y después convertir este fichero en el brief de la fase con el formato de [fase-14.md](fase-14.md).
> Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md), la de [herramientas](../guias/herramientas.md) y la del [banco](../guias/banco.md).

## Punto de partida

- El nivel 3 piensa en la vista previa ([ADR-0015](../adr/0015-vista-previa-del-nivel-3.md)): predice qué traerás y con quién empezarás, elige contra eso y lo explica en la pestaña «Pensamiento del bot» (roles, velocidades, quién tumba a quién, qué temía, qué eligió, lo que cree de tus sets).
- La predicción de tus grupos es un modelo de cobertura con incertidumbre (`PREVIEW_SETTINGS`): no aprende de cómo eliges tú.
- El banco (`/banco`, `npm run bench`) mide tu equipo contra tus rivales guardados; `--screen` (criba con el nivel 2) solo existe en la terminal.
- Lo que más limita al nivel 3 sigue siendo la información oculta y el coste del simulador (≈ 140 / 190 ms por decisión en un hilo).

## Opciones

### A. Criba y varias versiones en la web (recomendada)

Llevar `--screen` a la página del banco: pegar o elegir 3–6 versiones del equipo, cribarlas con el nivel 2 y comparar las dos mejores con el nivel 3 en una sola prueba, con la tabla de cada fase. Es lo que más acerca el «equipo perfecto».

### B. Tabla de daños y velocidades en el teambuilder o el banco

La lectura de la vista previa ya calcula, para dos equipos, quién es más rápido y quién tumba a quién. Llevarla a una pantalla propia: tu equipo contra cada rival guardado (o contra los Pokémon más usados), hacia los dos lados, con el % de daño y la probabilidad de KO. Sobre un endpoint del servidor (la calculadora no va a la web).

### C. Entrenador en la vista previa

Mientras eliges tu equipo, ver **lo tuyo** de la lectura del bot (tus amenazas, sus Pokémon más rápidos que los tuyos, a quién tumbas) sin revelar sus sets. Era la opción «durante la preview» que el usuario no eligió en la fase 14: proponerla como ayuda opcional.

### D. El nivel 3 aprende tus vistas previas

Guardar qué Pokémon traes y con cuál empiezas contra cada tipo de equipo, y ajustar la predicción (`pickTemperature`, preferencias por Pokémon) con tu historial. Medible: acierto de la predicción en tus combates guardados.

### E. Vista previa del nivel 3 en dobles: arquetipos y combos (ampliada el 2026-10-11)

Hoy la vista previa suma **duelos 1 contra 1**: cada Pokémon se valora solo, sin compañero. No ve combos (Espacio Raro + lentos, Viento Afín + rápidos, Sorpresa + potenciador, Señuelo/Polvo Ira + potenciador, Intimidación, ataques a varios objetivos con un aliado inmune, debilidades cubiertas). Solo el clima cuenta como efecto de equipo ([ADR-0016](../adr/0016-clima-en-la-vista-previa.md)). Así puede dejar fuera a un inductor de Espacio Raro y su atacante lento, y tampoco prevé que el jugador traiga una pareja pensada para ir junta. En el combate sí juega esos combos (`doubles-sim` en el nivel 2, el motor real en el 3), pero no elige el equipo para montarlos. En la fase 14, la predicción con duelos perdía fuerza en dobles.

El usuario pidió hacerlo **en dos pasos**, el primero como aproximación:

**E1. Valoración general del equipo (primero).** Leer cada equipo de 6 en su conjunto, sin simular:
- **Qué pinta tiene**: arquetipo probable (Espacio Raro, Viento Afín, lluvia/sol/arena/nieve, ofensivo puro, equilibrado, Sorpresa + potenciador, redirección + potenciador…) con su confianza, a partir de movimientos, habilidades, objetos y velocidades (de los sets supuestos con equipo cerrado; `move-knowledge.ts` ya tiene parte de las listas).
- **Qué 4 encajan entre sí**: puntuación de sinergia de cada grupo de 4 (piezas del arquetipo juntas, inductor con sus beneficiados, debilidades cubiertas, inmunidades a los ataques en área del aliado) y las **parejas de salida** que montan el plan.
- Usos: (1) predecir tu grupo y tus líderes mezclando la sinergia con la cobertura actual; (2) elegir su propio grupo y sus líderes igual; (3) enseñarlo en «Pensamiento del bot» («tu equipo parece Espacio Raro: Pokémon X lo pone, Y y Z lo aprovechan»). Reutilizable en el teambuilder o el banco para tu propio equipo (enlaza con **B** y **C**).
- Funciones puras con tests por arquetipo (equipos fixture de cada uno). Los pesos, en `PREVIEW_SETTINGS`. Medir con el arena (≥ 1 200 combates en dobles, mismas semillas que la referencia de 81,6 %) que no pierde fuerza; y la predicción, por acierto en combates guardados si hay datos.

**E2. Parejas simuladas (después).** Valorar sus parejas de salida contra tus parejas probables con la simulación 2 contra 2 (`doubles-sim`) o el sandbox, partiendo de los candidatos que dé E1 (para no simular las 15 × 6 combinaciones). Medir con el arena igual.

### F. Optimizador de Stat Points

Lo mínimo para aguantar un golpe concreto o superar a alguien en velocidad, y el resto al ataque. Se apoya en `estimateDamage` (servidor) y `championsStats`.

### G. Vista previa del bot menos predecible (pedida por el usuario el 2026-10-11)

Hoy el bot elige en la vista previa **la opción de más puntuación** más un ruido pequeño (`PREVIEW_SETTINGS.noise`: 0–1 punto en individuales, 0–2 en dobles, sobre coberturas de ≈ 200 puntos). Con los mismos 6 enfrente trae casi siempre los mismos Pokémon y los mismos líderes: solo cambia en casi empates. Un jugador puede leerlo y aprovecharlo.

- Elegir **con probabilidad entre las mejores opciones** (estrategia mixta): por ejemplo, softmax con temperatura sobre las opciones que estén a menos de X puntos de la mejor, en lugar de quedarse siempre con la primera. Todo con el generador sembrado (misma semilla → misma elección) y los pesos en `PREVIEW_SETTINGS`.
- Vale para los dos modos (en dobles, sobre la cobertura del nivel 2; en individuales, sobre la cadena de equipo completo).
- **Medir con el arena** contra la referencia (mismas semillas, ≥ 600 combates por modo) que la fuerza no baja más allá del ruido, y medir la variedad: cuántos grupos y líderes distintos elige contra el mismo equipo con semillas distintas.
- Cabe junto a **D** (aprender tus vistas previas): un bot que aprende de ti y tú que no puedes leerle.

## Recomendación

**A** para el objetivo del usuario (montar su equipo); después **B** (reutiliza la lectura de la vista previa) o **C**.

## Criterios de «hecho» (los de la opción elegida, más)

- `npm run check` y `npm run e2e` en verde; CI en verde.
- Docs: CHANGELOG, AGENTS, PLAN, README, guías y ADR si hay decisión de arquitectura, y el brief de la fase 16.
