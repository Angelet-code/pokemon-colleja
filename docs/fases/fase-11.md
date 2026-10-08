# Fase 11 — Siguiente ampliación (propuesta para elegir)

> **Brief de traspaso.** Escrito al cerrar la fase 10 (2026-10-08). Este brief **no fija la fase**: propone ampliaciones con su diseño de partida para que el usuario elija una (o varias, por orden).
> Lee antes [AGENTS.md](../../AGENTS.md) y [PLAN.md](../PLAN.md) §2.2, §6, §8 y §11. Cuando el usuario elija, convierte la opción en un brief completo (`fase-11.md` reescrito con objetivo, hechos verificados, diseño, tests y criterios de "hecho") **antes** de implementar, y pregúntale las decisiones de producto que salgan.

## Punto de partida (ya hecho)

| Área | Estado |
|---|---|
| Combate | Individuales y dobles de Champions (Reg M-C) en el navegador y en la terminal, con deshacer, rebobinar, replays y explicación del bot |
| Bot | Niveles 0–3. El 3 "Experto" (por defecto) mira un turno por adelantado con el simulador real y valora las posiciones también con el equipo entero de los dos lados ([ADR-0010](../adr/0010-bot-experto-con-sandbox.md), [ADR-0011](../adr/0011-nivel-3-con-equipo-completo.md)). Cifras en el CHANGELOG de la fase 10 |
| Herramientas | Calculadora (críticos, efectos de dobles y de campo) que se abre desde el combate, replays renombrables, explicación del bot |
| Calidad | Tests unitarios y de componentes en `npm run check`, smoke, **E2E con Playwright** (`npm run e2e`) y CI con los dos jobs |

## Opciones

### A. El bot deduce lo que oculta el rival (recomendada)

- **Para qué**: es lo que más limita al nivel 3. Con equipo abierto gana al nivel 2 un 70,7 % en individuales; con equipo cerrado, ≈ 64 % (CHANGELOG de la fase 10). Al usuario le importa que el bot **prediga al rival**: qué hará, a quién cambiará y qué Pokémon y sets tiene.
- **Diseño de partida**:
  - **Sets**: descartar candidatos de `OpponentModel` con lo observado además de lo revelado: el daño recibido y hecho (¿cuadra con esa naturaleza y esos Stat Points?), quién se movió antes (velocidad: Pañuelo Elección, naturaleza), recuperaciones (Restos), y dar a cada candidato un peso en vez de "el más ofensivo primero". El nivel 3 repartiría sus suposiciones según esos pesos.
  - **Qué Pokémon trajo**: se probó en la fase 10 ordenar los no vistos según lo que le conviene traer al rival (la vista previa del nivel 2 desde su lado) y no mejoró de forma clara (+1 y −3 puntos en dos semillas). Revisar con los pesos de arriba.
  - Medirlo también con equipo abierto como techo.
- **Riesgos**: deducir con daño exige repetir el cálculo con cada candidato (caché por contenido ya existe); el ruido del arena obliga a medir con ≥ 1200 combates.

### B. Modo clásico IV/EV/Tera

- **Para qué**: practicar también formatos de Escarlata/Púrpura.
- **Diseño de partida**: `RulesetId` nuevo con su `StatCalculator` (la estrategia por formato ya existe en `core/team/stats.ts`), formatos de Showdown nuevos en `engine/formats.ts`, learnsets y sets del juego principal en el pipeline, y el teambuilder con EVs/IVs/Tera según el ruleset. El sandbox y el nivel 3 funcionarían sin cambios (usan el motor real); el nivel 2, la cadena de equipo y la calculadora tendrían que entender la Teracristalización.
- **Riesgos**: es casi duplicar los datos y la validación.

### C. App instalable (PWA) y uso desde el móvil

- **Para qué**: abrirla desde el móvil en la red de casa.
- **Diseño de partida**: manifiesto y service worker; opción del servidor para escuchar en la red local (hoy solo `127.0.0.1`, decisión de seguridad); revisar las pantallas a 375 px (los E2E pueden añadir un proyecto móvil de Playwright). Con el nivel 3 pensando en el servidor, el móvil solo muestra.
- **Riesgos**: exponer el servidor en la red local exige pensar en quién puede conectarse.

### D. Rivales a partir de estadísticas de uso

- **Para qué**: rivales que se parezcan a lo que se juega de verdad, y un modelo del rival mejor (el nivel 3 sacaría partido de saber qué sets son probables).
- **Diseño de partida**: descargar en el pipeline las estadísticas de uso de Champions (si existen para Reg M-C) y generar sets y equipos por uso en `teamgen`; usar las frecuencias en `OpponentModel` (y con ellas, los pesos de las suposiciones del nivel 3).
- **Riesgos**: fuente externa que puede no existir aún o cambiar de formato; la VPN del usuario bloquea esas webs a veces (AGENTS.md).

### E. El bot en un hilo de trabajo

- **Para qué**: que el servidor no quede bloqueado mientras piensa el nivel 3 (síncrono, ≈ 0,3–1 s por decisión).
- **Diseño de partida**: un `worker_thread` por sala o un pool que reciba el `AgentContext` (el sandbox tendría que crearse dentro del worker a partir del estado serializado).
- **Riesgos**: el sandbox vive sobre el `Battle` real; pasarlo a otro hilo exige serializarlo con cuidado de no filtrar información oculta.

### F. Nivel 3 en dobles y en las decisiones que aún son del nivel 2

- **Para qué**: en dobles el nivel 3 ya gana con holgura, pero sus relevos y su vista previa siguen siendo los del nivel 2, y la cadena de equipo solo existe en individuales.
- **Diseño de partida**: una estimación de equipo completo para dobles (parejas en lugar de duelos), la vista previa de dobles con ella y el sandbox también en las peticiones de cambio forzoso.
- **Riesgos**: medir cada idea cuesta cientos de combates; en dobles cada decisión ya ronda 0,4 s.

## Pregunta para el usuario

- **¿Qué ampliación quieres ahora?** Recomendación: **A** si lo que más te importa es que el bot juegue mejor; **C** si quieres jugar desde el móvil; **D** si quieres rivales más realistas (y ayuda también a la A).

## Al cerrar la fase

Sigue el **protocolo de cierre de fase** de [AGENTS.md](../../AGENTS.md): docs, CHANGELOG, el brief de la siguiente fase en `docs/fases/fase-12.md` (o una nueva propuesta como esta), commit y push.
