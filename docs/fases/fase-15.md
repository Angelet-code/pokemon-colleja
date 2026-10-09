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

### E. Vista previa del nivel 3 en dobles

En dobles, la predicción de tu vista previa no mejoró la elección (fase 14): el modelo de duelos no ve lo que hace buena a una pareja de salida. Valorar las parejas propias contra tus parejas probables con la simulación 2 contra 2 (`doubles-sim`) y medirlo con el arena (≥ 1 200 combates, mismas semillas que la referencia de 81,6 %).

### F. Optimizador de Stat Points

Lo mínimo para aguantar un golpe concreto o superar a alguien en velocidad, y el resto al ataque. Se apoya en `estimateDamage` (servidor) y `championsStats`.

## Recomendación

**A** para el objetivo del usuario (montar su equipo); después **B** (reutiliza la lectura de la vista previa) o **C**.

## Criterios de «hecho» (los de la opción elegida, más)

- `npm run check` y `npm run e2e` en verde; CI en verde.
- Docs: CHANGELOG, AGENTS, PLAN, README, guías y ADR si hay decisión de arquitectura, y el brief de la fase 16.
