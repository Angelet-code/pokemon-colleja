# Fase 14 — Propuesta de ampliaciones (por elegir)

> **Propuesta, no plan cerrado.** Escrita el 2026-10-09 al cerrar la fase 13. La siguiente sesión debe **preguntar al usuario** qué opción (o combinación) quiere, con la recomendada primero, y después convertir este fichero en el brief de la fase con el formato de [fase-12.md](fase-12.md).
> Lee antes [AGENTS.md](../../AGENTS.md), la [guía del banco](../guias/banco.md) y la del [bot](../guias/bot.md).

## Punto de partida

- El nivel 3 decide ≈ 2× más rápido que en la fase 12 con la misma fuerza ([ADR-0014](../adr/0014-nivel-3-mas-rapido-con-poda.md)): cachés idénticas y **poda sucesiva** de las opciones claramente peores. `npm run arena:perf` mide la velocidad y comprueba con huellas si cambió alguna decisión.
- El banco de pruebas (`/banco`, `npm run bench`) mide tu equipo contra tus rivales guardados, con A/B en pares y criba con el nivel 2 en la terminal (`--screen`).
- Lo que queda caro del nivel 3 es el simulador de Showdown (≈ 40–50 %) y deserializar cada hoja (≈ 15–20 %). Bajarlo exige tocar `vendor/` o simular menos.
- Hay un fallo conocido del bot que arregla otra sesión: en dobles a veces manda `pass` en un hueco que debe actuar (≈ 1 % de los combates). El banco y el arena lo cuentan como error, no como derrota.

## Opciones

### A. Criba y varias versiones en la web (recomendada)

Llevar `--screen` a la página del banco: pegar o elegir 3–6 versiones del equipo, cribarlas con el nivel 2 y comparar las dos mejores con el nivel 3 en una sola prueba, con la tabla de cada fase. Aprovecha que ahora el nivel 3 es el doble de rápido. Es lo que más acerca el «equipo perfecto» que busca el usuario.

### B. Tabla de daños en la web

La matriz de `bench:calc` (`damageMatrix` en `@colleja/bench`) como pantalla: cada Pokémon de tu equipo contra los sets de tus rivales elegidos, hacia los dos lados, con el % de daño y la probabilidad de KO. Una pestaña del banco o del teambuilder, sobre un endpoint nuevo del servidor (la calculadora no va a la web).

### C. Tabla de tipos y de velocidades en el teambuilder

- **Tipos**: debilidades compartidas y huecos de cobertura del equipo.
- **Velocidades**: a quién de tus rivales superas y con cuántos Stat Points. Datos de `@colleja/data` y `championsStats` de core.

### D. Optimizador de Stat Points

Lo mínimo para aguantar un golpe concreto o superar a alguien en velocidad, y el resto al ataque. Se apoya en `estimateDamage` (servidor) y `championsStats`.

### E. Nivel 3 más fuerte con el tiempo ganado

Gastar parte de la velocidad ganada en fuerza: más suposiciones o más opciones propias **solo donde la poda deja pocas**, o una segunda capa de búsqueda en las dos mejores opciones. Medir con el arena (≥ 1 200 combates por modo, dos semillas) contra la referencia actual (≈ 64,7 % en individuales y ≈ 80 % en dobles contra el nivel 2).

## Recomendación

**A**: aprovecha el banco y la velocidad nueva para el objetivo del usuario (montar su equipo). Después **B** o **C**.

## Criterios de «hecho» (los de la opción elegida, más)

- `npm run check` y `npm run e2e` en verde; CI en verde.
- Docs: CHANGELOG, AGENTS, PLAN, README, guías y ADR si hay decisión de arquitectura, y el brief de la fase 15.
