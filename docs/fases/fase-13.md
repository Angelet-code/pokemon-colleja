# Fase 13 — Propuesta de ampliaciones (por elegir)

> **Propuesta, no plan cerrado.** Escrita el 2026-10-09 al cerrar la fase 12. La siguiente sesión debe **preguntar al usuario** qué opción (o combinación) quiere, con la recomendada primero, y después convertir este fichero en el brief de la fase con el formato de [fase-12.md](fase-12.md).
> Lee antes [AGENTS.md](../../AGENTS.md), [ADR-0013](../adr/0013-banco-de-pruebas-con-hilos.md) y la [guía del banco](../guias/banco.md).

## Punto de partida

- El banco de pruebas funciona en la web (`/banco`) y en la terminal (`npm run bench`, `--screen`, `npm run bench:calc`), con hilos de trabajo, parada temprana, reparto de Neyman y A/B en pares.
- **Lo que limita al usuario es la velocidad del nivel 3**: ≈ 1 s por decisión en dobles con 15 hilos (0,9 s con uno). Una A/B contra 20 rivales con ± 5 tarda ≈ 14 min, y el objetivo era 5. El usuario aceptó cerrar así la fase 12 y pidió que medir variantes sea **rápido sin perder calidad**.
- Perfil de un combate de dobles con el nivel 3 (`node --cpu-prof`):
  - 30 % en el simulador de Showdown (`battle.js`: `getCallback` 14 %, `findEventHandlers`, `runEvent`), por las bifurcaciones del sandbox;
  - 11,5 % en `@smogon/calc` (`extend`, `calculateChampions`);
  - 11 % en `analysis/doubles-sim.ts` (`autoAction`, `turn`, `targets`);
  - 4 % deserializando el estado (`state.js`) y 2,5 % en `deepClone`.
- Hay un fallo conocido del bot que lo arregla otra sesión: en dobles a veces manda `pass` en un hueco que debe actuar (≈ 1–2 % de los combates del banco). El banco lo cuenta como error, no como derrota.

## Opciones

### A. Nivel 3 más rápido sin cambiar sus decisiones (recomendada)

Objetivo: la A/B de la fase 12 (v1 contra v2, 20 rivales, ± 5) en **≤ 7 min**, ≈ 2× más rápido, con **el mismo `inputLog`** en los combates de referencia (el bot decide exactamente igual).

Ideas, de más a menos prometedora (medir cada una con el perfil):

- **Sandbox**: reutilizar el estado deserializado entre las muestras de una misma opción, o clonar con `Battle` en vez de serializar a JSON y volver. Es el código de `engine/src/sandbox.ts`: debe seguir en verde el test de invariancia.
- **`doubles-sim`**: cachear `targets`/`autoAction` por posición dentro de una decisión.
- **Calculadora**: ampliar la caché por contenido de `estimateDamage` (`calcKey`) o evitar `extend` en los objetos que se repiten.
- Medir con `npm run bench -- --threads 1` sobre combates fijos, más un test que compare el `inputLog` antes y después.

### B. Tabla de daños en la web

La matriz de `bench:calc` (`damageMatrix` en `@colleja/bench`) como pantalla: cada Pokémon de tu equipo contra los sets de tus rivales elegidos, hacia los dos lados, con el % de daño y la probabilidad de KO. Sería una pestaña del banco o del teambuilder, sobre un endpoint nuevo en el servidor (la calculadora no va a la web).

### C. Tabla de tipos y de velocidades en el teambuilder

- **Tipos**: debilidades compartidas y huecos de cobertura del equipo.
- **Velocidades**: a quién de tus rivales superas y con cuántos Stat Points. Datos de `@colleja/data` y `championsStats` de core.

### D. Optimizador de Stat Points

Lo mínimo para aguantar un golpe concreto o superar a alguien en velocidad, y el resto al ataque. Se apoya en `estimateDamage` (servidor) y `championsStats`.

### E. Criba y varias versiones en la web

Llevar `--screen` a la página del banco: pegar o elegir 3–6 versiones, cribarlas con el nivel 2 y comparar las dos mejores con el nivel 3 en una sola prueba.

## Recomendación

**A** primero: es lo que el usuario notó y beneficia a todo (banco, arena, combates contra el bot). Después **B** o **E**, que aprovechan el banco ya hecho.

## Criterios de «hecho» (los de la opción elegida, más)

- `npm run check` y `npm run e2e` en verde; CI en verde.
- Docs: CHANGELOG, AGENTS, PLAN, README, guías y ADR si hay decisión de arquitectura, y el brief de la fase 14.
