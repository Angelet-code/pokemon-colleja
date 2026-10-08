# Fase 10 — Siguiente ampliación (propuesta para elegir)

> **Brief de traspaso.** Escrito al cerrar la fase 9 (2026-10-08). El plan original está completo y el bot tiene ya cuatro niveles. Este brief **no fija la fase**: propone ampliaciones con su diseño de partida para que el usuario elija una (o varias, por orden).
> Lee antes [AGENTS.md](../../AGENTS.md) y [PLAN.md](../PLAN.md) §2.2, §6, §8 y §11. Cuando el usuario elija, convierte la opción en un brief completo (`fase-10.md` reescrito con objetivo, hechos verificados, diseño, tests y criterios de "hecho") **antes** de implementar, y pregúntale las decisiones de producto que salgan.

## Punto de partida (ya hecho)

| Área | Estado |
|---|---|
| Combate | Individuales y dobles de Champions (Reg M-C) en el navegador y en la terminal, con deshacer, rebobinar, replays y explicación del bot |
| Bot | Niveles 0–3. El 3 "Experto" (por defecto) mira un turno por adelantado con el simulador real mediante el sandbox del motor ([ADR-0010](../adr/0010-bot-experto-con-sandbox.md)): gana al 2 un 61,8 % en individuales y un 78,6 % en dobles, en 0,3–0,4 s por decisión |
| Equipos | Teambuilder con Stat Points, equipos y rivales guardados, calculadora en el servidor |
| Web | Sistema de diseño propio ([ADR-0009](../adr/0009-sistema-de-diseno.md)) |
| Calidad | 285 tests, smoke, CI en cada push |

## Opciones

### A. Pulido de las herramientas (recomendada si se quiere algo corto)

- "Abrir en la calculadora" desde un combate con los dos Pokémon activos, golpes críticos y más efectos de campo en la calculadora, renombrar replays, E2E con Playwright de los flujos principales.

### B. Nivel 3 más fuerte en individuales

- **Para qué**: en individuales el nivel 3 gana al 2 por poco (61,8 %); en dobles va sobrado.
- **Diseño de partida**: la mejora está en las hojas, no en más muestras (ver la tabla del CHANGELOG de la fase 9): que la estimación del nivel 2 tenga en cuenta el banquillo rival y los cambios del rival; buscar también los **relevos forzosos** y la **vista previa** con el sandbox (hoy son los del nivel 2); reparto adaptativo de muestras entre opciones.
- **Hecho cuando**: ≥ 65 % contra el nivel 2 en individuales (≥ 600 combates) sin pasar de ~1 s de media.
- **Riesgos**: cada idea hay que medirla con cientos de combates (≈ 15 min en paralelo).

### C. Modo clásico IV/EV/Tera

- **Para qué**: practicar también formatos de Escarlata/Púrpura.
- **Diseño de partida**: `RulesetId` nuevo con su `StatCalculator` (la estrategia por formato ya existe en `core/team/stats.ts`), formatos de Showdown nuevos en `engine/formats.ts`, learnsets y sets del juego principal en el pipeline, y el teambuilder con EVs/IVs/Tera según el ruleset. El sandbox y el nivel 3 funcionarían sin cambios (usan el motor real); el nivel 2 y la calculadora tendrían que entender la Teracristalización.
- **Riesgos**: es casi duplicar los datos y la validación.

### D. App instalable (PWA) y uso desde el móvil

- **Para qué**: abrirla desde el móvil en la red de casa.
- **Diseño de partida**: manifiesto y service worker; opción del servidor para escuchar en la red local (hoy solo `127.0.0.1`, decisión de seguridad); revisar las pantallas a 375 px. Con el nivel 3 pensando en el servidor, el móvil solo muestra.
- **Riesgos**: exponer el servidor en la red local exige pensar en quién puede conectarse.

### E. Rivales a partir de estadísticas de uso

- **Para qué**: rivales que se parezcan a lo que se juega de verdad, y un modelo del rival mejor (el nivel 3 sacaría partido de saber qué sets son probables).
- **Diseño de partida**: descargar en el pipeline las estadísticas de uso de Champions (si existen para Reg M-C) y generar sets y equipos por uso en `teamgen`; usar las frecuencias en `OpponentModel`.
- **Riesgos**: fuente externa que puede no existir aún o cambiar de formato; la VPN del usuario bloquea esas webs a veces (AGENTS.md).

### F. El bot en un hilo de trabajo

- **Para qué**: que el servidor no quede bloqueado mientras piensa el nivel 3 (hoy ≈ 0,3–1 s, síncrono).
- **Diseño de partida**: un `worker_thread` por sala o un pool que reciba el `AgentContext` (el sandbox tendría que crearse dentro del worker a partir del estado serializado).
- **Riesgos**: el sandbox vive sobre el `Battle` real; pasarlo a otro hilo exige serializarlo con cuidado de no filtrar información oculta.

## Pregunta para el usuario

- **¿Qué ampliación quieres ahora?** Recomendación: **A** si quieres algo corto y visible; **B** si lo que más te importa es el rival en individuales.

## Al cerrar la fase

Sigue el **protocolo de cierre de fase** de [AGENTS.md](../../AGENTS.md): docs, CHANGELOG, el brief de la siguiente fase en `docs/fases/fase-11.md` (o una nueva propuesta como esta), commit y push.
