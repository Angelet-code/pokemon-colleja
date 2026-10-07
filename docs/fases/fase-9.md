# Fase 9 — Siguiente ampliación (propuesta para elegir)

> **Brief de traspaso.** Escrito al cerrar la fase 8 (2026-10-08). Con las fases 1–8 el plan original está completo: lo que queda en PLAN §8 es "Futuro". Este brief **no fija la fase**: propone las ampliaciones posibles, con su diseño de partida, para que el usuario elija una (o varias, por orden).
> Lee antes [AGENTS.md](../../AGENTS.md) y [PLAN.md](../PLAN.md) §2.2, §6, §8 y §11. Cuando el usuario elija, convierte la opción en un brief completo (`fase-9.md` reescrito con objetivo, hechos verificados, diseño, tests y criterios de "hecho") **antes** de implementar, y pregúntale las decisiones de producto que salgan.

## Punto de partida (ya hecho)

| Área | Estado |
|---|---|
| Combate | Individuales y dobles de Champions (Reg M-C) en el navegador y en la terminal, con deshacer, rebobinar, replays y explicación del bot |
| Bot | Niveles 0 (aleatorio), 1 (agresivo, daño esperado) y 2 (táctico, simulación con daño esperado; [ADR-0004](../adr/0004-bot-por-simulacion.md)). Arena para medirlos (`npm run arena`) |
| Equipos | Teambuilder con Stat Points, equipos y rivales guardados, calculadora en el servidor |
| Datos | `@colleja/data` regenerable desde Showdown + PokeAPI; sets estándar de Showdown (≈950) |
| Calidad | 270 tests, smoke, CI en cada push |

## Opciones

### A. Bot nivel 3 "Experto" (recomendada)

- **Para qué**: un rival más fuerte cuando el nivel 2 se quede corto. Es lo que más mejora la práctica.
- **Diseño de partida**: lookahead de 1 ply clonando el combate real (`Battle.toJSON`/`fromJSON` dentro de `engine`, nunca fuera) y muestreando los sets del rival compatibles con lo revelado (`OpponentModel`), o MCTS ligero sobre `DoublesSim`. Debe implementar `explain()` como los demás.
- **Hecho cuando**: gana al nivel 2 al menos un 60 % en ≥ 300 combates por modo (arena) en un tiempo por decisión aceptable (p. ej. < 1 s), sin elecciones inválidas.
- **Riesgos**: coste por decisión (clonar `Battle` es caro) e información oculta (el clon no puede usar los sets reales del jugador con equipo cerrado).

### B. Modo clásico IV/EV/Tera

- **Para qué**: practicar también formatos de Escarlata/Púrpura.
- **Diseño de partida**: `RulesetId` nuevo con su `StatCalculator` (la estrategia por formato ya existe en `core/team/stats.ts`), formatos de Showdown nuevos en `engine/formats.ts`, datos de learnsets y sets del juego principal en el pipeline, y el teambuilder con EVs/IVs/Tera según el ruleset.
- **Riesgos**: es casi duplicar los datos y la validación; el bot y la calculadora tendrían que entender la Teracristalización.

### C. App instalable (PWA) y uso desde el móvil

- **Para qué**: abrirla desde el móvil en la red de casa.
- **Diseño de partida**: manifiesto y service worker para la web; opción del servidor para escuchar en la red local (hoy solo `127.0.0.1`, decisión de seguridad); revisar las pantallas en 375 px.
- **Riesgos**: exponer el servidor en la red local exige pensar en quién puede conectarse.

### D. Rivales a partir de estadísticas de uso

- **Para qué**: rivales que se parezcan a lo que se juega de verdad.
- **Diseño de partida**: descargar en el pipeline las estadísticas de uso de Champions (si existen para Reg M-C) y generar sets y equipos por uso en `teamgen`.
- **Riesgos**: fuente externa que puede no existir aún o cambiar de formato; la VPN del usuario bloquea esas webs a veces (AGENTS.md).

### E. Pulido de las herramientas

- "Abrir en la calculadora" desde un combate con los dos Pokémon activos, golpes críticos y más efectos de campo en la calculadora, renombrar replays, E2E con Playwright de los flujos principales.

## Pregunta para el usuario

- **¿Qué ampliación quieres primero?** Recomendación: **A (bot nivel 3)**, porque es lo que más mejora la práctica; después E (pulido) si se quiere algo corto.

## Al cerrar la fase

Sigue el **protocolo de cierre de fase** de [AGENTS.md](../../AGENTS.md): docs, CHANGELOG, el brief de la siguiente fase en `docs/fases/fase-10.md` (o una nueva propuesta como esta), commit y push.
