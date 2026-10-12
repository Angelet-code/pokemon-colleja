# Pokemon Colleja Simulator — Guía para agentes

Simulador de combates de **Pokémon Champions** (individuales y dobles) para practicar contra un bot. El plan completo (arquitectura, hoja de ruta por fases y decisiones) está en [docs/PLAN.md](docs/PLAN.md).

## ▶ Cómo continuar

El proyecto avanza **por fases** (PLAN §8). Cuando te pidan *"continúa con la fase N"*:

1. Lee este fichero entero y después el **brief de la fase**: `docs/fases/fase-N.md`. Contiene el objetivo, el diseño recomendado, los hechos ya verificados y los criterios de "hecho".
2. Prepara el entorno (ver "Puesta en marcha") y comprueba que `npm run check` está en verde **antes** de tocar nada.
3. Implementa la fase. Si tomas una decisión de arquitectura distinta a la del brief o el plan, escribe un ADR.
4. Cierra la fase con el **protocolo de cierre** (más abajo).

### Estado

| Fase | Estado |
|---|---|
| 0. Investigación y plan | ✅ ([docs/research/](docs/research/)) |
| 1. Cimientos (monorepo, Showdown vendorizado, smoke) | ✅ |
| 2. Pipeline de datos (`@colleja/data`) | ✅ ([guía](docs/guias/datos.md)) |
| 3. Dominio + motor + CLI jugable | ✅ ([guía](docs/guias/combate.md), [ADR-0003](docs/adr/0003-sesion-de-combate.md)) |
| 4. Bot (niveles 1–2, teamgen, arena) | ✅ ([guía](docs/guias/bot.md), [ADR-0004](docs/adr/0004-bot-por-simulacion.md)) |
| 5. Servidor + UI de combate (MVP) | ✅ ([guía](docs/guias/web.md), [ADR-0005](docs/adr/0005-servidor-web-y-narracion.md)) |
| 6. Teambuilder y equipos guardados | ✅ ([guía](docs/guias/teambuilder.md), [ADR-0006](docs/adr/0006-equipos-guardados-y-teambuilder.md)) |
| 7. Rivales guardados | ✅ ([guía](docs/guias/rivales.md), [ADR-0007](docs/adr/0007-rivales-guardados.md)) |
| 8. Herramientas de práctica | ✅ ([guía](docs/guias/herramientas.md), [ADR-0008](docs/adr/0008-herramientas-de-practica.md)) |
| Rediseño de la web | ✅ ([guía](docs/guias/web.md#sistema-de-diseño), [ADR-0009](docs/adr/0009-sistema-de-diseno.md)) |
| 9. Bot nivel 3 "Experto" | ✅ ([brief](docs/fases/fase-9.md), [ADR-0010](docs/adr/0010-bot-experto-con-sandbox.md), [guía](docs/guias/bot.md)) |
| 10. Pulido de herramientas y nivel 3 más fuerte | ✅ ([brief](docs/fases/fase-10.md), [ADR-0011](docs/adr/0011-nivel-3-con-equipo-completo.md), guías de [herramientas](docs/guias/herramientas.md) y [bot](docs/guias/bot.md)) |
| 11. El nivel 3 predice al rival (sets y estilo) | ✅ ([brief](docs/fases/fase-11.md), [ADR-0012](docs/adr/0012-deduccion-de-sets-y-estilo-del-rival.md), [guía](docs/guias/bot.md)) |
| 12. Banco de pruebas de equipos | ✅ ([brief](docs/fases/fase-12.md), [ADR-0013](docs/adr/0013-banco-de-pruebas-con-hilos.md), [guía](docs/guias/banco.md)) |
| 13. Nivel 3 más rápido | ✅ ([brief](docs/fases/fase-13.md), [ADR-0014](docs/adr/0014-nivel-3-mas-rapido-con-poda.md), [guía](docs/guias/bot.md#velocidad-npm-run-arenaperf)) |
| 14. El nivel 3 piensa en la vista previa | ✅ ([brief](docs/fases/fase-14.md), [ADR-0015](docs/adr/0015-vista-previa-del-nivel-3.md), guías del [bot](docs/guias/bot.md#nivel-3-vista-previa) y de [herramientas](docs/guias/herramientas.md)) |
| 15. El nivel 3 lee el equipo entero (arquetipos) | ✅ ([brief](docs/fases/fase-15.md), [ADR-0017](docs/adr/0017-arquetipos-en-la-vista-previa.md), guías del [bot](docs/guias/bot.md#nivel-3-vista-previa) y de [herramientas](docs/guias/herramientas.md)) |
| 16. Por qué esa salida (parejas simuladas, E2) | ✅ ([brief](docs/fases/fase-16.md), [ADR-0018](docs/adr/0018-parejas-de-salida-simuladas.md), guías del [bot](docs/guias/bot.md#nivel-3-vista-previa) y de [herramientas](docs/guias/herramientas.md)) |
| 17. Medir bien y aprender a valorar con replays | ✅ ([brief](docs/fases/fase-17.md), [ADR-0019](docs/adr/0019-valoracion-aprendida-de-replays.md), [guía](docs/guias/aprendizaje.md)) |
| 18. Animaciones de combate (independiente de la 17) | ✅ ([brief](docs/fases/fase-18.md), [ADR-0020](docs/adr/0020-animaciones-de-combate.md), [guía](docs/guias/web.md#animaciones-de-combate)) |
| 19. El nivel 3 valora con lo aprendido | ✅ ([brief](docs/fases/fase-19.md), [ADR-0021](docs/adr/0021-valoracion-aprendida-en-la-busqueda.md), guías del [bot](docs/guias/bot.md#valoración-aprendida) y de [aprendizaje](docs/guias/aprendizaje.md)) |
| 20. El meta (rivales que se actualizan solos y banco sin sesgo) | ✅ ([brief](docs/fases/fase-20.md), [ADR-0022](docs/adr/0022-meta-del-ladder-como-rivales.md), guías de [rivales](docs/guias/rivales.md#meta) y del [banco](docs/guias/banco.md#contra-el-meta)) |
| 21. La salida con lo aprendido (parada en la prueba barata) | ✅ ([brief](docs/fases/fase-21.md), [ADR-0023](docs/adr/0023-la-salida-no-se-aprende.md), guías de [aprendizaje](docs/guias/aprendizaje.md#salidas-ladderleads) y del [bot](docs/guias/bot.md#arena-npm-run-arena)) |
| 22. Sets del meta para predecir al rival | ✅ ([brief](docs/fases/fase-22.md), [ADR-0024](docs/adr/0024-sets-del-meta-para-predecir-al-rival.md), guías del [bot](docs/guias/bot.md#nivel-3-qué-deduce-del-rival) y de [rivales](docs/guias/rivales.md#meta)) |
| 23. Qué trae el rival (parada en el techo) | ✅ ([brief](docs/fases/fase-23.md), [ADR-0025](docs/adr/0025-que-trae-el-rival-no-importa.md), guías del [bot](docs/guias/bot.md#arena-npm-run-arena) y de [aprendizaje](docs/guias/aprendizaje.md#qué-trae-el-rival-ladderbringeval)) |
| **24. Cuánto falta en los sets del rival** | ⏭️ **Siguiente**: brief en [docs/fases/fase-24.md](docs/fases/fase-24.md) |

### Protocolo de cierre de fase

1. `npm run check` en verde. Si añades algo ejecutable, inclúyelo en el check o en los tests.
2. Documentación:
   - `CHANGELOG.md`: entrada de la fase.
   - `docs/PLAN.md`: marca la fase ✅ en §8, pon al día la estructura (§3.2) y los riesgos si han cambiado.
   - `AGENTS.md`: tabla de estado, comandos nuevos y reglas o particularidades nuevas.
   - `README.md`: línea de estado y comandos de usuario.
   - Guías (`docs/guias/`) y ADRs (`docs/adr/`) si aplica.
3. **Escribe el brief de la siguiente fase** en `docs/fases/fase-(N+1).md`, con el mismo formato que `fase-9.md` (si no hay fase planificada, una propuesta de ampliaciones como `fase-10.md`): objetivo, punto de partida, hechos verificados, diseño recomendado, tests, criterios de "hecho" y fuera de alcance. Así la siguiente sesión puede empezar sin contexto.
4. Commits con Conventional Commits y **push a `origin/main`** (el usuario trabaja así). La CI de GitHub ejecuta `npm run check` en cada push: compruébala.

## Preferencias del usuario

- Habla con el usuario **en español**. Documentación y UI en español; el código, en inglés.
- Quiere el proyecto **muy ordenado, limpio, escalable y documentado**.
- Las decisiones de producto relevantes (alcance, UX, cambios de plan) se le **preguntan** antes de implementarlas, con una opción recomendada.
- Decisiones ya tomadas (2026-10-07):
  - Envolver el motor de Showdown ([ADR-0001](docs/adr/0001-motor-de-combate.md)).
  - App web local con servidor Node.
  - Solo Stat Points de Champions; el modo clásico IV/EV queda para el futuro.
  - Nombres en español con selector de inglés.
  - Sets estándar "cualesquiera" por ahora: el usuario los editará más adelante.
  - Bot: el rival por defecto es el **nivel más alto** (2); los equipos aleatorios llevan **como mucho dos megapiedras** (era una hasta el 2026-10-09); el bot **no conoce los sets del rival** con equipo cerrado (solo con equipo abierto).
  - Web (2026-10-07): pantalla de combate al estilo Showdown (campo arriba, controles abajo, log a la derecha), tema oscuro por defecto con opción clara, animaciones mínimas, y el selector ES/EN cambia los **nombres** (la interfaz y el log siguen en español).
  - Teambuilder (2026-10-08): un equipo con problemas **se guarda como borrador** (solo se exige legalidad para combatir); el modo del equipo es el **preferido** y vale para los dos si es legal; lista a la izquierda y ficha a la derecha; botón de set sugerido.
  - Rivales (2026-10-08): **colección aparte** con su dificultad (se pueden copiar de tus equipos); **solo se guarda la dificultad**, no las opciones de práctica; en el inicio **se aplica la dificultad del rival y se puede cambiar**; un rival generado **hay que guardarlo** para combatir contra él.
  - Rediseño (2026-10-08): dirección **«retransmisión de torneo»** (opción A de las tres del lienzo de Claude Design): tinta casi negra, voltio para el jugador, magenta para el rival, tipografía condensada; **sin textos explicativos redundantes**.
  - Herramientas (2026-10-08): calculadora **en el servidor**; replays guardados **solo si el usuario lo pide**; explicación del bot **tras cada turno**; visor de replays omnisciente con interruptor "Como jugador"; con equipo cerrado, la explicación **oculta lo no revelado**.
  - Bot nivel 3 (2026-10-08): es el **rival por defecto**; puede pensar **hasta ~3 s** por decisión y debe pensar **mientras el jugador elige**; si una mejora no llega al objetivo, **averiguar qué falla** antes de rebajarlo.
  - Fase 10 (2026-10-08): «Calcular» abre la calculadora **en otra pestaña**; E2E con Playwright **aparte del check** (`npm run e2e`) y con su job en la CI; el nivel 3 con **≤ ~1 s de media**. El nivel 3 se quedó en ≈ 64 % contra el 2 en individuales (objetivo 65 %): el usuario decidió **cerrar con lo conseguido** y dejar la deducción de sets del rival para otra fase. Le importa que el bot **prediga al rival** (qué hará, a quién cambiará, qué Pokémon y sets tiene).
  - Fase 11 (2026-10-08): deducción de sets y estilo del rival **solo en el nivel 3**; se enseña **lo que cree de tu equipo**; variantes de reparto para sets propios. Objetivo ≥ 67 % cumplido (67,1 %).
  - Fase 12 (2026-10-08): el **banco de pruebas de equipos** (para ayudarle a montar su equipo perfecto), después de cerrar la 11. Otras ideas para más adelante: tablas de tipos, velocidades y daños, y optimizador de Stat Points.
  - Banco (2026-10-09): en la **web y en la terminal**; en la web, el nivel de cada lado se elige **entre los dos más altos**; **margen con parada temprana**; resultados **guardados** (historial por equipo); **A/B en pares**. Le importa que medir variantes sea **rápido sin perder calidad**. La A/B con el nivel 3 tarda ≈ 14 min con ± 5 (objetivo 5 min): **aceptado**, con el flujo rápido documentado (criba con el nivel 2, ± 10); acelerar el nivel 3 queda propuesto.
  - Fase 13 (2026-10-09): **acelerar el nivel 3**. Con decisiones idénticas el techo era ≈ 1,4× (Showdown y deserializar ≈ 60 %): el usuario aceptó **decisiones distintas con la misma fuerza** medida en el arena (poda sucesiva). Resultado ≈ 2×; la A/B de la fase 12 baja a ≈ 7 min.
  - PC de Bill (2026-10-11): sección `/pc` con las **especies** que tiene en el juego (solo especies, solo para saberlo) e interruptor **«Solo PC de Bill»** en el teambuilder.
  - Clima (2026-10-11): el nivel 3 valora el clima de los setters en la vista previa ([ADR-0016](docs/adr/0016-clima-en-la-vista-previa.md)); un rival guardado **no fija** qué trae ni con quién empieza: el bot elige siempre.
  - Fase 17 (2026-10-12): cambio de método. En lugar de más reglas a mano, **valoración aprendida** de replays reales de Champions (después, autojuego), con la búsqueda del nivel 3 intacta. Orden: jugar bien un **4 contra 4 fijado con salidas al azar**, después la salida y por último elegir 4 de 6. Modelo **por factores de partida** (explicable; una razón solo se enseña si quitarla cambia la decisión). Factores en **situaciones, nunca por especie**, para que sobreviva a updates de stats y del meta. La explicación de la salida del bot debe decir **lo que de verdad decide**.
  - Animaciones (2026-10-12, fase 18): **propias por plantillas** (sin portar Showdown ni añadir librerías), **rápidas** (ajuste ×1 · ×2 · No, y saltar con un clic o Espacio) y **bien hechas** (anticipación, impacto y luz del tipo). Se revisan en la galería `/animaciones`. Sustituye a «animaciones mínimas» de la fase 5.
  - Fase 19 (2026-10-12): la valoración aprendida **sumada** a la de antes (material y `outlook`) en las hojas del nivel 3, **solo en dobles** (`learnedWeight = 1`): +2,4 puntos en espejo contra el nivel 2 (dos tandas). Explicaciones **comprobadas**: una razón solo se enseña si quitarla cambia la jugada.
  - Meta (2026-10-12, fase 20): los rivales guardados **sesgaban el banco** (pesos iguales, núcleos repetidos, lejos del ladder). Rivales en **dos secciones**: «Mis rivales» (editables) y **«Meta»** (solo lectura, con peso por frecuencia; se copian a «Mis rivales»). Fuente: **estadísticas de Smogon a 1760** (sets) y **replays** (equipos de 6). Se actualiza con **botón y comando**, nunca al arrancar. Va **antes** de la salida con lo aprendido (fase 21).
  - Fase 21 (2026-10-12): la salida aprendida de replays no predice nada y, para el bot, elegir la salida vale ≈ 1,5 puntos: **no se cambia la salida**. **Desde ahora, toda variante del bot se mide nivel 3 contra nivel 3** (la variante contra el de hoy, en espejo y con dos tandas); el nivel 2 solo como criba (el usuario lo ve «malísimo»). Siguiente: los sets del meta en el modelo del rival (fase 22).
  - Fase 22 (2026-10-12): el bot supone para el rival los **sets del meta** con su probabilidad (+9 puntos con equipos del meta, +5 con tus rivales, −3 con aleatorios de sets estándar). El usuario decidió **activarlo siempre** que haya meta, en la web y en el banco.
  - Fase 23 (2026-10-12): saber qué 4 trae el rival vale ≈ 0 para el nivel 3 (oráculo: 51,1 y 49,7 %, dos tandas pedidas por el usuario). **Parada**: el bot sigue sorteando las no vistas. Siguiente: el techo de los sets (fase 24).
  - Fase 20 (2026-10-12): hecha como se decidió. Contra el meta, los equipos del usuario bajan entre 7 y 14 puntos frente a sus rivales guardados (el orden no cambia). El banco sigue con **«Mis rivales» por defecto**; «Meta» se elige en «Contra».
  - Fase 16 (2026-10-11): la opción **E2** (parejas de salida simuladas). La explicación, **en términos de partida, nunca con puntuaciones**: por un combo, para presionar o tumbar a alguien, para evitar algo, «si pasa X, Y hace Z». Elegir la salida con la simulación perdía: **solo explica**.
  - Fase 15 (2026-10-11): la opción **E1** (leer el equipo entero: arquetipos, el grupo que encaja y la pareja de salida) antes que simular parejas (E2); **enseña y decide si mejora**; se mide con **tus rivales guardados y aleatorios**; se ve solo en **«Pensamiento del bot»** (no en el teambuilder); **lectura en los dos modos, decide solo en dobles**. También pidió una vista previa **menos predecible** (opción G de la fase 16).
  - Fase 14 (2026-10-09): el nivel 3 **piensa en la vista previa** (en lugar de la propuesta de ampliaciones, que pasa a la fase 15): el análisis de tu equipo **se enseña y decide** (medido con el arena); se ve **al empezar el combate**, ocultando lo no revelado; en una **pestaña junto al registro** («Pensamiento del bot»); contenido: roles, velocidades, KOs en los dos sentidos, amenazas y plan, y lo que cree de tus sets.

## Puesta en marcha

Requisitos: **Node ≥ 24** y **git**.

```bash
git clone --recurse-submodules https://github.com/Angelet-code/pokemon-colleja.git
cd pokemon-colleja
npm install          # instala dependencias y además compila Showdown (postinstall)
npm run check        # lint + typecheck + tests + smoke: debe salir en verde
npm run data:sprites # opcional: sprites en assets/ (solo hacen falta para la UI)
npm run dev          # servidor + web: http://127.0.0.1:5173
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias y prepara Showdown (postinstall → `npm run setup`) |
| `npm run setup` / `setup:force` | Sincroniza el submódulo, instala sus dependencias y compila `dist/` con tipos (idempotente) |
| `npm run dev` | Servidor (127.0.0.1:3001, con recarga) + web con Vite (http://127.0.0.1:5173) a la vez ([guía](docs/guias/web.md)). La galería de animaciones está en `/animaciones` (fuera del menú). Los equipos guardados van a `storage/teams/` ([guía](docs/guias/teambuilder.md)), los rivales a `storage/opponents/` ([guía](docs/guias/rivales.md)) y el PC de Bill a `storage/collection/` ([guía](docs/guias/teambuilder.md#pc-de-bill)). Calculadora, replays y explicación del bot: [guía](docs/guias/herramientas.md) |
| `npm run build` / `npm start` | Compila la web (`apps/web/dist`) / la compila y la sirve desde el servidor en http://127.0.0.1:3001 |
| `npm run play` | Combate en la terminal contra el bot. Admite `-- --mode doubles --bot 0\|1\|2\|3 --team <fichero> --opponent-team <fichero>\|random --seed X --no-preview --open-team-sheets --auto` ([guía](docs/guias/combate.md)) |
| `npm run bench` | Banco de pruebas: tu equipo guardado (o un fichero) contra tus rivales guardados, bot contra bot en hilos de trabajo. Admite `-- --team <id\|nombre\|fichero> --versus <…> --opponents all\|<ids> --mode --level --rival-level --margin 5 --battles N --screen <ficheros> --seed --threads --json <fichero>` ([guía](docs/guias/banco.md)). `npm run bench:calc -- --team …` da la matriz de daño sin combatir |
| `npm run arena` | Torneo bot contra bot con equipos aleatorios. Admite `-- --a 3 --b 2 --mode singles\|doubles\|both --battles N --seed X --teams rivales\|<carpeta> --fixed --json <fichero>` (`--teams`: tus rivales guardados o los equipos de una carpeta en lugar de aleatorios; `--fixed`: **modo de medida**, 4 fijos con salida al azar y cada par en espejo; `--fixed-group`: igual, pero cada bot elige su salida (`--a-leads`/`--b-leads random` la sortea); `--json`: cada combate con su par y sus salidas; `--a-settings '{"learnedWeight":0}'`: una variante de la búsqueda del nivel 3 sobre `SEARCH_SETTINGS`; `--a-priors meta`/`--b-priors meta`: el bot supone los sets del meta; `--teams meta`: los equipos del meta activo; `--a-oracle`: con `--fixed`, el bot A sabe qué especies trajo el B) ([guía](docs/guias/bot.md)). El nivel 3 tarda ≈ 0,15–0,2 s por decisión en un hilo: para cientos de combates, lanza varios arenas en paralelo con semillas distintas |
| `npm run arena:perf` | Velocidad de un nivel en combates fijos (un hilo) y **huella** de cada combate: `-- --save <fichero>` antes de un cambio y `-- --compare <fichero>` después dice cuánto más rápido va y si cambió alguna decisión; admite `--a-settings` ([guía](docs/guias/bot.md#velocidad-npm-run-arenaperf)) |
| `npm run ladder:fetch` | Descarga replays públicos de dobles de Champions (rating ≥ 1400) a `datasets/ladder/`, a una petición por segundo y reanudable. Admite `-- --limit 5000 --min-rating 1400 --from-newest` ([guía](docs/guias/aprendizaje.md)) |
| `npm run ladder:leads` / `ladder:leads:eval` | Posiciones de salida de cada replay (`leads-v<N>.jsonl`) y su prueba barata contra el 50 %, los duelos y el emparejamiento de grupos (`-- --seeds 10 --min-rating 1500`) ([guía](docs/guias/aprendizaje.md#salidas-ladderleads)) |
| `npm run ladder:positions` / `ladder:train` / `ladder:eval` | Factores de cada turno de cada replay (`positions-v<N>.jsonl`), entrenamiento de la valoración aprendida (`packages/bot/src/learning/models/value-v<N>.json`) y la prueba barata contra el balance de PS (`-- --seeds 5`) ([guía](docs/guias/aprendizaje.md)) |
| `npm run ladder:sets:eval` | Prueba barata de los sets supuestos (estándar frente a los del meta activo) contra lo que revelan los replays. Admite `-- --min-rating 1500 --after 2026-10-01` ([guía](docs/guias/aprendizaje.md#sets-del-meta-laddersetseval)) |
| `npm run ladder:bring:eval` | Prueba barata de qué trae el rival: 4 de 6 antes del combate y los 2 de atrás tras la salida, por especie, posición y compañeros. Admite `-- --split 2026-10-01 --min-rating 1500` ([guía](docs/guias/aprendizaje.md#qué-trae-el-rival-ladderbringeval)) |
| `npm run meta:update` | Instantánea del meta (`storage/metagame/<mes>-<corte>.json`): estadísticas de Smogon del último mes (corte 1760) y unos 300 replays nuevos de dobles (≈ 1 por segundo). Admite `-- --month 2026-09 --cutoff 1760 --teams 24 --replays 0 --min-rating 1500`. Lo mismo hace el botón «Actualizar meta» de la web ([guía](docs/guias/rivales.md#meta)) |
| `npm run smoke` | Combates headless de Champions (fixtures + aleatorios). Admite `-- --random N --seed X --verbose` |
| `npm run data:build` | Regenera `packages/data/generated/` desde Showdown + PokeAPI (determinista). Después, revisa el diff |
| `npm run data:sprites` | Descarga los sprites a `assets/sprites/` (no versionado). Incluye los shiny (`-- --no-shiny` los omite). Admite `-- --force` |
| `npm test` | Vitest (`{packages,apps,tools}/*/test/**/*.test.{ts,tsx}`; los de componentes con `// @vitest-environment happy-dom`). Fuzz del bot más largo: `BOT_FUZZ_BATTLES=1000 npx vitest run packages/bot` |
| `npm run typecheck` | `tsc --noEmit` en cada workspace (TypeScript 7) |
| `npm run lint` / `lint:fix` | Biome (formato + lint) |
| `npm run check` | lint + typecheck + test + smoke. Ejecútalo antes de dar algo por terminado |
| `npm run e2e` | Compila la web y ejecuta los tests E2E de Playwright (`tools/e2e/specs/`) contra el servidor real con `STORAGE_DIR` temporal. La primera vez: `npm run e2e:install` (descarga Chromium). No está en el check; la CI lo ejecuta en su propio job ([guía](docs/guias/herramientas.md#tests-e2e-playwright)) |

## Estructura y reglas de dependencias

```
apps/       → aplicaciones (web, server). Pueden depender de packages/*
packages/   → librerías: showdown (puente al motor), data (datos del juego), core (dominio), engine (sesiones), bot, teamgen, narration (log), protocol (mensajes web ↔ servidor), bench (banco de pruebas), metagame (el meta del ladder)
tools/      → scripts: setup, smoke, data-pipeline, cli, arena, bench, ladder (replays y valoración aprendida), metagame (meta:update), dev, e2e (Playwright)
vendor/pokemon-showdown → submódulo git fijado a un commit (NO editar)
docs/       → PLAN, research/, adr/, guias/, fases/ (briefs de cada fase)
storage/    → datos del usuario (teams/, opponents/, replays/, bench/, collection/ y metagame/: equipos, rivales, replays, bancos guardados, el PC de Bill y el meta): local, no versionado
assets/     → sprites descargados: local, no versionado
datasets/   → replays públicos descargados y sus posiciones (npm run ladder:*): local, no versionado
```

- **Solo `packages/showdown` toca `vendor/`.** El resto importa `@colleja/showdown`. Esto es una regla dura.
- `@colleja/showdown` es Node-only (usa `createRequire`). Nunca se importa desde `apps/web` ni desde `packages/core`.
- **Capas** (ver PLAN §3.3): `core` → `data`; `bot` → `core`, `data`, `@smogon/calc`; `teamgen` → `core`, `data`; `narration` → `core`, `data`; `protocol` → `core` (tipos), `zod`; `engine` → `core`, `data`, `showdown`; `bench` → `core`, `data`, `engine`, `bot`; `metagame` → `core`, `data`, `engine`, `bot`, `teamgen`, `protocol`; apps y tools → lo que necesiten. Nadie depende de `apps/*` ni de `tools/*`. `engine` y `teamgen` pueden ser dependencias **de desarrollo** de `bot` (sus tests juegan combates).
- **`@colleja/core`, `@colleja/bot`, `@colleja/teamgen`, `@colleja/narration` y `@colleja/protocol` son aptos para navegador**: sin `node:*` ni Showdown. **`apps/web` solo importa paquetes aptos para navegador** (nunca `engine`, `showdown` ni `node:*`; lo comprueba `apps/web/test/dependencies.test.ts`). `@colleja/engine` es solo Node y es el **único paquete de dominio que importa `@colleja/showdown`** (además de `tools/smoke` y `tools/data-pipeline`). `@colleja/bench` también es solo Node (hilos de trabajo), y `@colleja/metagame` (ficheros, red y el validador).
- **`@colleja/data` es apto para navegador**: solo lee los JSON generados. Los datos del juego (roster, movimientos, nombres en español…) **se consultan ahí**, nunca a mano ni de memoria.
- `packages/data/generated/` **no se edita a mano**: se regenera con `npm run data:build`. Las correcciones van en `packages/data/overrides/` (sets propios en formato export, nombres en español y plantillas de mensajes de combate en español que falten en Showdown).
- El pipeline importa `@colleja/data/schema` (tipos y constantes), nunca `@colleja/data`, porque este carga los JSON que el propio pipeline genera.
- Los paquetes internos se consumen como fuente TS (`"exports": "./src/index.ts"`), sin build. Se ejecutan con `tsx` y se testean con Vitest. Un paquete nuevo necesita su `package.json` (`@colleja/<nombre>`, `"type": "module"`, script `typecheck`) y su `tsconfig.json` (extiende `../../tsconfig.base.json`). Después hay que ejecutar `npm install` para enlazarlo.

## Convenciones

- Código, identificadores y comentarios técnicos en **inglés**. Documentación y UI en **español**.
- TypeScript `strict` + `noUncheckedIndexedAccess`. Sin `any`. Imports de tipos con `import type`. Módulos de Node con prefijo `node:`.
- Ficheros en `kebab-case`, tipos en `PascalCase`. Tests en `<workspace>/test/*.test.ts`.
- Cada decisión de arquitectura relevante se documenta en un ADR (`docs/adr/NNNN-titulo.md`). Cada fase o cambio de datos va al [CHANGELOG](CHANGELOG.md).
- Commits con Conventional Commits (`feat(bot): …`, `fix(engine): …`, `chore(showdown): bump to <sha>`).

## Particularidades de Champions (errores típicos)

- **No hay IVs ni EVs, hay Stat Points**: 66 en total y 32 como máximo por stat. Showdown los guarda en el campo `evs` del set. Los IVs están fijos a 31 y el nivel es 50.
  - `PS = Base + SP + 75`
  - El resto: `floor((Base + SP + 20) × naturaleza)`
- **Hay que validar los equipos antes de combatir.** `TeamValidator.get(formatid).validateTeam(sets)` aplica el nivel 50 y la legalidad. `BattleStream` **no valida**: sin validar, un set sin `Level` se jugaría a nivel 100.
- Los learnsets de Champions difieren de los de Escarlata/Púrpura (por ejemplo, Incineroar no aprende Knock Off). La verdad la tienen `@colleja/data` (`canLearn`) o el validador, nunca la memoria.
- Hay 20 efectos con texto propio de Champions (Fiebre Dorada, Sorpresa…). Para esos no se usa el texto de los juegos principales.
- No hay Teracristalización. La Mega Evolución sí existe, una por combate.
- Formatos usados: `gen9championsbssregmc` (individuales: 6 → elegir 3) y `gen9championsvgc2026regmc` (dobles: 6 → elegir 4). Están en `CHAMPIONS_FORMATS`, pero **solo `engine/src/formats.ts` construye formatids** (con sus reglas `@@@`). Más hechos verificados del motor (reglas `@@@`, `inputLog`, elección de equipo, sintaxis de las elecciones) en [docs/fases/fase-3.md](docs/fases/fase-3.md).

## Particularidades del motor de combate

- **Todo combate pasa por `BattleSession.create`**, que valida los equipos. No crees `Battle`/`BattleStream` a mano fuera de `engine` (salvo `tools/smoke`, que prueba Showdown en crudo).
- Las elecciones se mandan como `Choice` tipada (se comprueban con `validateChoice`) o como texto de Showdown. Una rechazada devuelve `{ ok: false }` y la sesión sigue esperando.
- `[Unavailable choice]` **no es un bug**: depende de información oculta (p. ej. una habilidad que atrapa aún no revelada) y Showdown manda una petición nueva. `[Invalid choice]` sí lo es.
- Los bots solo ven su perspectiva (`AgentContext`). Nunca les pases el log omnisciente.
- Los equipos fixture de `tools/smoke/fixtures/` son también el equipo por defecto del jugador en el CLI y los usan los tests de `core` y `engine`: si los cambias, que sigan siendo legales en ambos modos. El rival del CLI usa por defecto un equipo de `teamgen`.
- Los tests de combate usan semillas fijas. Si un cambio altera un log de referencia, comprueba que es intencionado.

## Particularidades del bot

- **Todo bot se crea con `createBot(nivel, { seed })`** (o sus clases). Misma semilla y misma situación → misma decisión: los combates entre bots son reproducibles. El nivel 3 tiene esfuerzo fijo (`SEARCH_SETTINGS`), **nunca por reloj**.
- El nivel 2 decide **simulando** con daño esperado ([ADR-0004](docs/adr/0004-bot-por-simulacion.md)). Para mejorarlo, corrige el modelo (`analysis/duel.ts`, `doubles-sim.ts`), no añadas bonificaciones sueltas, y **mídelo con el arena** contra el nivel anterior (≥ 300 combates por modo; ±5 %).
- El daño lo calcula `@smogon/calc` 0.12.0 con Champions como **generación 0**: los Stat Points van en `evs`. `analysis/damage.ts` es el único sitio que habla con la calculadora. Su test de contraste (`packages/bot/test/calc.test.ts`) debe seguir en verde al actualizar Showdown o la calculadora.
- El modelo del rival solo usa lo que el bot puede ver (`BattleView` de su perspectiva) y los sets estándar. Nunca le pases el log omnisciente ni el equipo rival con equipo cerrado.
- Los tests de fuerza son cortos en el check (40 combates por modo); las cifras de referencia (500 por modo) se apuntan en el CHANGELOG al cambiar el bot. El nivel 3 no tiene test de fuerza en el check (sería lento): sus tests usan `LIGHT_SEARCH` (`packages/bot/test/helpers.ts`) y sus cifras van al CHANGELOG.
- **Nivel 3 y sandbox** ([ADR-0010](docs/adr/0010-bot-experto-con-sandbox.md)): el bot solo usa la interfaz `BattleSandbox` de `core` (`AgentContext.sandbox`); **la implementación vive en `engine/src/sandbox.ts`** y es la que garantiza que un fork no tiene información oculta (sets supuestos, PS del rival en %, generador nuevo con suerte común por acción, sueño sorteado otra vez, sin elecciones ya hechas ni `inputLog`). Si tocas el sandbox, que siga en verde el test de invariancia (`packages/bot/test/expert.test.ts`: misma decisión aunque cambie lo que oculta el rival). El sandbox solo existe al elegir movimientos.
- **Deducción y estilo del rival** ([ADR-0012](docs/adr/0012-deduccion-de-sets-y-estilo-del-rival.md)): solo del nivel 3 (`Situation` con `beliefs: 'infer'`; sin eso, nivel 2 intacto). Salen **solo del log de la perspectiva del bot** (`inference/`): mismo log → mismas creencias y mismo estilo. Una observación que no cuadra nunca descarta un set (verosimilitud 0,05), porque hay efectos que el modelo no conoce. `RivalStyle` es estado del agente durante un combate.
- Para mejorar el nivel 3, mejora la valoración de sus hojas (la estimación del nivel 2 y la **cadena de equipo completo**, `analysis/team-chain.ts`, [ADR-0011](docs/adr/0011-nivel-3-con-equipo-completo.md)) o el modelo del rival, y mídelo con el arena contra el nivel 2. Más muestras por opción ya no ayudan. Lo que más le limita sigue siendo la información oculta (con equipo abierto, 70,7 % frente al 67,1 % con equipo cerrado y deducción). Los pesos y el esfuerzo están en `SEARCH_SETTINGS` (`chainWeight`, `loopPenalty`…), nunca en constantes sueltas.
- **Velocidad** ([ADR-0014](docs/adr/0014-nivel-3-mas-rapido-con-poda.md)): una optimización que no deba cambiar decisiones se comprueba con `npm run arena:perf -- --compare` (huellas del `inputLog`). La **poda sucesiva** (`pruneAfter`, `pruneMargin` en `SEARCH_SETTINGS`) deja de buscar las opciones claramente peores; si cambias `turns`, revísala y mide la fuerza. En el código caliente evita cierres con nombre (`const f = () => …` dentro de un bucle): tsx los envuelve en `__name` cada vez. La caché de daño por clase de PS (`EXACT_HP_MOVES`) tiene su test: si actualizas la calculadora, que siga en verde.
- **Vista previa del nivel 3** ([ADR-0015](docs/adr/0015-vista-previa-del-nivel-3.md)): `planPreview` (`search/preview.ts`) predice tus grupos y líderes (cobertura desde tu lado, softmax con reparto uniforme) y, en individuales, elige contra eso con la cadena de equipo completo (+3,7 puntos); en dobles elige como el nivel 2 (con la predicción perdía). Sus pesos están en `PREVIEW_SETTINGS`. `readPreview` (`analysis/preview-read.ts`) construye la lectura de la explicación. Con equipo cerrado no mira tus sets: lo comprueba `packages/bot/test/preview.test.ts`. Los niveles 0–2 no explican su vista previa.
- **Clima** ([ADR-0016](docs/adr/0016-clima-en-la-vista-previa.md)): en la vista previa del nivel 3 y en la cadena de equipo completo, el clima lo ponen los setters que entran (`weatherOf`/`weatherAfter` en `analysis/combatant.ts`; el más lento gana). Para valorar algo con otro clima usa `situation.withWeather(clima)`, nunca otra `Situation` ni `field` a mano. Sin esto, un equipo de lluvia nunca traía a Pelipper y el banco salía inflado (95 % → 7,5 %).
- **Arquetipos** ([ADR-0017](docs/adr/0017-arquetipos-en-la-vista-previa.md)): `analysis/team-read.ts` lee el equipo entero (quién pone y quién aprovecha Espacio Raro, Viento Afín, cada clima y potenciarse con apoyo) para la explicación (`readTeam`). En dobles, los duelos de un grupo se mezclan con los mismos bajo su Espacio Raro o Viento Afín (`fieldShare` en `PREVIEW_SETTINGS`); para preguntar «¿y con Espacio Raro?» usa `situation.withSpeedControl(…)`. Sumar puntos sueltos por arquetipo no ganaba nada: cambia el modelo. **Algo de equipo se mide también con tus rivales** (`npm run arena -- --teams rivales`): los aleatorios casi nunca forman arquetipos.
- **Salidas simuladas** ([ADR-0018](docs/adr/0018-parejas-de-salida-simuladas.md)): `DoublesSim.evaluateLineup` juega una alineación fuera del combate y `SimTrace` apunta lo que pasa; `search/lead-plan.ts` y `LeadPlanner` (preview) juegan parejas 2 contra 2; `search/lead-reasons.ts` saca las razones. **Solo explican**: elegir la salida así perdía 2–3 puntos con tus rivales, y se calcula perezosamente al explicar (`PreviewPlan.leads`), así que el arena y el banco no lo pagan. Las razones del bot son **de partida** (KO, presión, combo, a quién deja atrás), nunca puntuaciones.
- **Salida propia, razón real** (fase 17): «Por qué salió con…» sale de `leadChoice` (`search/lead-reasons.ts`), con los **mismos duelos** que ordenaron su grupo (`PreviewOption.duels`). Lo simulado 2 contra 2 de su salida se enseña aparte como «Qué espera que pase». Si cambias cómo elige la salida, cambia también su razón (lo comprueba `packages/bot/test/leads.test.ts`).
- **Valoración aprendida en la búsqueda** ([ADR-0021](docs/adr/0021-valoracion-aprendida-en-la-busqueda.md)): en dobles, cada hoja suma `learnedWeight` × `LOGIT_POINTS` × `valueLogit` de `ownPosition` (sus sets exactos; los del rival, los de la suposición de esa copia). El modelo es `VALUE_MODEL` (`learning/shipped-model.ts`): si cambias factores o reentrenas, **vuelve a medir el nivel 3 en espejo** (dos tandas). Con `learnedWeight = 0` no se calcula nada (huellas idénticas). Lo aprendido solo empata con material + `outlook`; sumado gana: no quites los otros términos sin medir.
- **Explicaciones comprobadas** (fase 19): `SearchResult.learned` lleva la contribución de cada factor a cada opción y `checkedReasons` solo enseña un factor si quitarlo cambia la mejor opción (`DecisionExplanation.decisive`). La frase de cada factor es su `reason` en `FEATURES`, sin números. Lo comprueban `checked-reasons.test.ts` y `explain.test.ts` (con el aprendido, mismo `inputLog` con y sin explicaciones).
- **Sets del meta** ([ADR-0024](docs/adr/0024-sets-del-meta-para-predecir-al-rival.md)): `BotOptions.setPriors` (especie base → sets con peso) son **datos planos**; el bot nunca lee disco. Los pasan el servidor (`BattleManager`, instantánea activa) y el banco (`BenchConfig.setPriors`; cada trabajo lleva solo las especies del combate). Con priors, `OpponentModel` prueba los del meta antes que los estándar en cada paso de la cascada de filtros, y `weightedCandidates` da el prior de la deducción. Sin priors, decisiones idénticas (huellas). Para medir una variante del nivel 3, que los dos bots tengan el mismo modelo del rival (los dos con `--a-priors`/`--b-priors meta` o ninguno).
- **Mide nivel 3 contra nivel 3** (fase 21, decisión del usuario): una variante del nivel 3 se decide contra el nivel 3 de hoy, en espejo y con dos tandas, nunca contra el nivel 2 (solo criba). `BotOptions.fixedGroup` es un gancho de medida (traer ese grupo y elegir solo la salida): sin él, decisiones idénticas. Igual `BotOptions.rivalBrought` (fase 23, [ADR-0025](docs/adr/0025-que-trae-el-rival-no-importa.md)): `Situation` deja en la vista previa del rival solo lo que trajo (`arena --a-oracle`). Antes de invertir en una predicción, **mide su techo con un oráculo** así.
- **Mide en espejo** (fase 17): `npm run arena -- --fixed` fija 4 por equipo con una salida al azar y juega cada par dos veces cambiando los bots de asiento con la misma semilla de combate. El informe «Por pares» da el ± a partir de los pares. Úsalo para variantes de juego (no de vista previa). Referencia del nivel 3 contra el 2: ≈ 83,4 % en dobles (fase 19) y 64,2 % en individuales. Para variantes, ≈ 15 arenas en paralelo de 80 combates (semillas `t1-0`…`t1-14`) con `--json` y suma por pares; el espejo apenas baja el ruido de una diferencia, así que confirma con una segunda tanda.
- **Mide con cuidado**: 600 combates dan ±2 puntos de ruido. Compara variantes con la misma semilla y confirma con otra antes de quedarte una (en la fase 10, una mejora de +1 en una semilla fue −3 en otra). El arena puede tardar mucho si dos bots entran en un bucle de cambios: el nivel 3 los penaliza (`loopPenalty`).

## Particularidades del servidor y la web

- **El bot piensa mientras el jugador elige**: la sala (`advance`) envía primero el turno y después hace decidir al bot cuando los dos eligen a la vez; las decisiones sin el jugador (relevos del bot) van antes. Lo comprueba `apps/server/test/battle-room.test.ts`.
- **El servidor solo envía la perspectiva p1** y las peticiones de p1 (`apps/server/src/battles/battle-room.ts`). El replay (log omnisciente) solo se entrega con el combate terminado. Hay un test que lo comprueba: si tocas la sala, que siga en verde.
- Los mensajes van por `@colleja/protocol` (zod): un mensaje nuevo se añade allí primero, con su test de ida y vuelta. El servidor responde a cada acción con un `battle:update` y, tras deshacer, rebobinar o reconectar, con un `battle:snapshot`.
- El estado del combate en la web sale de `BattleView` (core) y el log de `@colleja/narration` (port de `BattleTextParser` de Showdown). **No uses `@pkmn/client`/`@pkmn/dex`**: sus datos no son los de Champions ([ADR-0005](docs/adr/0005-servidor-web-y-narracion.md)). Las cifras que se muestran salen de la petición o de `@colleja/data`.
- El store de la web solo cambia con mensajes del servidor; nunca adivines el resultado de una elección en el cliente.
- Para los bots en el servidor (o en cualquier bucle humano contra bot), usa `decideFor` de `engine`: reintenta tras `[Unavailable choice]`.
- El servidor escucha en `127.0.0.1` y usa `SERVER_PORT`/`SERVER_HOST` (no `PORT`, que las herramientas de desarrollo suelen fijar para la web). La web usa `WEB_PORT`. `STORAGE_DIR` lleva equipos, rivales, replays, bancos y el PC de Bill a otra carpeta (los E2E usan una temporal). Con `npm run dev`, el servidor recibe `WEB_DEV_URL` y redirige las páginas a Vite en lugar de servir `apps/web/dist` (que puede ser una compilación vieja).
- Champions añade el color de la barra de PS al 20 % y al 50 % justos (`50/100y`): usa siempre `parseCondition` de `core` para leer condiciones.

## Particularidades del diseño de la web

- **Todo color sale de los tokens** de `apps/web/src/styles.css` (`bg-surface`, `text-faint`, `border-line`, `text-accent-fg`, `text-rival`…), nunca de un hex suelto (salvo los colores de tipo de `lib/type-colors.ts`). Lo tuyo usa `accent`/`accent-fg`; lo del rival, `rival`. `accent` es un relleno (con `text-on-accent` encima); como texto usa `accent-fg`.
- **Los bloques están en `components/ui.tsx`** (`Button`/`buttonClass`, `Panel`, `Segmented`, `Chip`, `Notice`…) y los iconos en `components/icons.tsx`. No repitas cadenas de clases ni uses emojis o flechas Unicode como iconos.
- **Sin textos de relleno**: ni subtítulos ni *hints* que repitan la interfaz. Un estado es un `Chip`; una explicación larga, un `title`.
- Todo texto nuevo debe cumplir **contraste AA** (≥ 4,5:1) sobre `bg`, `surface`, `surface-2` y `surface-3` en los dos temas ([ADR-0009](docs/adr/0009-sistema-de-diseno.md)).

## Particularidades de las animaciones de combate

- **La animación solo retrasa enseñar** ([ADR-0020](docs/adr/0020-animaciones-de-combate.md), [guía](docs/guias/web.md#animaciones-de-combate)): las líneas de un `battle:update` van a una cola del store y se aplican al `Narrator` beat a beat; la petición, el estado y las explicaciones llegan al terminar su último beat. El store sigue cambiando solo con mensajes del servidor. `battle:snapshot`, salir o cambiar el idioma vacían la cola. Lo comprueba `apps/web/test/battle-store.test.ts` con un animador falso.
- **Lo que se anima sale de las líneas de p1** (`planBeats`, `animation/timeline.ts`): nunca revela nada que el registro no diga. Toda línea acaba en un beat (test).
- **Cada movimiento tiene animación** (`animationFor`, `animation/catalog.ts`): firma propia, después por forma (flags y objetivo) y por último por tipo y categoría. Un test exige que los 511 movimientos resuelvan a una plantilla que existe. Una firma nueva se añade en `SIGNATURES` y se revisa en la galería. El tipo de un golpe lo pinta `elements.ts` y los gestos de los de estado, `motions.ts`: ahí se añade una variante antes que en una firma suelta. Los épicos (`epic`) cargan antes y pueden llegar a ≈ 1 s.
- **El dibujo no se testea en happy-dom** (Canvas y Web Animations no existen allí): la lógica (línea de tiempo, catálogo, cola, galería) es pura y con tests; el dibujo se revisa en `/animaciones` y lo ejercitan los E2E (`tools/e2e/specs/animations.spec.ts`). Los demás E2E van con las animaciones apagadas (`storageState` de `playwright.config.ts`).
- **El campo marca sus partes** para el escenario: `data-slot` (`p2a`…) en cada Pokémon activo, `data-fx="sprite"` en lo que se mueve y `data-fx="content"` en lo que tiembla. Las animaciones de sprites (Web Animations) se cancelan al acabar cada beat: el estado final siempre es el que dibuja React.
- Los colores de los efectos salen de `animation/fx/palette.ts` (derivados de los colores de tipo, la excepción admitida); el rótulo y las etiquetas usan los tokens (`fx-banner`, `fx-label` en `styles.css`). Duraciones: ≤ 700 ms por acción escritas en la plantilla, que es la velocidad de ×2 (×1 las reproduce a la mitad, `ANIMATION_FACTOR`); el bucle del canvas se para cuando no hay nada que pintar.

## Particularidades de los equipos y rivales guardados y el teambuilder

- **Lo guardado pasa por un repositorio**: `TeamRepository` (`apps/server/src/teams/team-repository.ts`), `OpponentRepository` (`apps/server/src/opponents/opponent-repository.ts`) y `CollectionRepository` (`apps/server/src/collection/collection-repository.ts`: el PC de Bill, una sola colección con id fijo `pc`), todos sobre `FileJsonRepository` (`apps/server/src/storage/json-repository.ts`). Nunca escribas ficheros a mano desde otra parte. Un fichero por elemento en `storage/<colección>/<id>.json`; el nombre del fichero es el id y solo admite letras, números y guiones (`SavedIdSchema`). Una colección nueva es un `JsonFileFormat` y una subclase.
- **Los tests nunca escriben en `storage/`**: usa `testServer()`, `tempTeamsDir()`, `tempOpponentsDir()`, `tempReplaysDir()`, `tempBenchDir()` y `tempCollectionDir()` de `apps/server/test/helpers.ts` (carpetas temporales).
- **Legalidad informada, no impuesta**: se guarda cualquier equipo que cumpla los límites estructurales de `TeamSchema` (6 miembros, 4 movimientos, 0–32 SP por stat). Los `problems` (core y después el validador de Showdown, con `teamProblems`) van en cada respuesta, y la legalidad solo se exige al empezar un combate.
- El texto importado pasa por `fitTeamToLimits` (core), que recorta lo que no cabe y devuelve cada ajuste para enseñárselo al usuario.
- Para mostrar un problema junto a su campo usa `checkTeamIssues`/`checkSetIssues` (core). No partas los textos de `checkTeam`.
- Las operaciones del editor van en `apps/web/src/features/teams/team-draft.ts` (puras y testeadas); los componentes solo las llaman. Para comparar borradores usa `sameDraft` (zod reordena las claves al validar).
- **Un rival es un equipo más `botLevel`, en plano** (`OpponentContentSchema = TeamContentSchema.extend({ botLevel })`). El editor es el mismo: `TeamEditorPage` recibe un `EditorDestination` (`TEAM_DESTINATION` u `OPPONENT_DESTINATION`) que dice dónde cargar y guardar. No dupliques el editor ni la lista (`SavedListLayout`, `SavedCard`).
- **La dificultad del combate es siempre `botLevel` de `battle:start`**: con un rival guardado (`opponent: { kind: 'saved', opponentId }`) la web la rellena con la del rival, y el servidor no la lee del fichero.

## Particularidades de las herramientas de práctica

- **La calculadora es `estimateDamage` de `@colleja/bot`** en el servidor (`POST /api/calc`). No añadas `@smogon/calc` a la web ni otra fórmula de daño. **La web nunca importa el índice de `@colleja/bot`** (arrastraría la calculadora): solo entradas ligeras como `@colleja/bot/opponent-model` (lo comprueba `apps/web/test/dependencies.test.ts`).
- **«Calcular» desde el combate solo usa lo que ve el jugador** (`features/calc/from-battle.ts`): `BattleView` de p1, su equipo y el del rival solo con equipo abierto; los sets supuestos salen de `OpponentModel`. Los efectos de un turno de la calculadora (Refuerzo, Compiescolta) van en `FieldState.boosts` y los combates no los rellenan.
- Los E2E usan nombres accesibles (`getByRole`, `getByLabel`), el bot de nivel 0 y nunca esperas fijas. Si cambias un texto o una etiqueta de la UI, revisa `tools/e2e/specs/`.
- **Una explicación nunca cambia una decisión**: los bots guardan lo que ya calcularon y construyen la explicación en `explain()`, bajo demanda y sin tocar el generador aleatorio. `packages/bot/test/explain.test.ts` juega con y sin explicaciones y exige el mismo `inputLog`.
- **La explicación es información oculta**: la sala (`BattleRoom`) solo envía las de turnos ya resueltos y, con equipo cerrado, pasadas por `redactExplanation` (core). Si tocas la sala, que siga en verde el test de `apps/server/test/tools.test.ts`. La de la vista previa (turno 0, `kind: 'team'`) llega con el turno 1: sin los Pokémon del bot que no han salido (`hiddenOwn`) ni sus movimientos no usados, y sin la lectura de su propio equipo (`teams.own`, revelaría sus sets). De su salida (`leads.own`) se quitan los planes y movimientos que aún no ha usado y los Pokémon no vistos; lo que lee de tu equipo (y tu salida esperada) no se censura.
- El panel del bot es la pestaña **«Pensamiento del bot»** de la columna derecha (`BotExplanation`, con `header` para las pestañas; en móvil, «Bot» en las pestañas de arriba). El visor de replays usa `ExplanationList`.
- **Los replays solo los crea el servidor** a partir de una sala terminada (`battle:save-replay`); no hay `POST /api/replays`. `ReplayDataSchema` (protocol) replica `ReplayData` (engine): si cambias uno, cambia el otro y sube la versión.

## Particularidades de la valoración aprendida

- Todo vive en `packages/bot/src/learning/` (apto para navegador) y `tools/ladder/` (solo Node: red y ficheros). [ADR-0019](docs/adr/0019-valoracion-aprendida-de-replays.md), [guía](docs/guias/aprendizaje.md).
- **Los factores son situaciones, nunca especies ni nombres de movimiento** (`learning/features.ts`): velocidades, daños (`estimateDamage`), tipos y campo calculados en esa posición. Una mecánica se reconoce por sus datos (Sorpresa: prioridad +3, retroceso seguro, poca potencia), no por su id. Lo comprueba `packages/bot/test/features.test.ts`.
- Cada factor se ve **desde un lado**: positivo es bueno para él y 0 es neutro. Si cambias o añades uno, **sube `FEATURES_VERSION`** y regenera posiciones y modelo (`ladder:positions`, `ladder:train`); el test del modelo versionado falla si no.
- El modelo es una **suma** (regresión logística): `explainValue` y `counterfactual` son exactos. No metas factores que no se puedan explicar en términos de partida.
- `ownPosition` (bot) y `spectatorPosition` (replays) deben construir la misma posición salvo los sets del propio bot y qué trajo (`own-position.test.ts`): si cambias una, cambia la otra.
- Con estos 20 factores el modelo está saturado desde ≈ 1 000 partidas (curva de la fase 19): para mejorarlo, factores nuevos o autojuego, no más replays.
- **Divide por partida**, nunca por posición (`splitByBattle`). Compara siempre con el balance de PS en las mismas posiciones y con varias divisiones.
- Las posiciones de los replays son de **espectador**: los sets de los dos lados se suponen con `OpponentModel` y solo con lo revelado hasta ese turno (el test de `tools/ladder` corta el log y exige las mismas posiciones). Nunca uses lo que pasa después.
- **Nada de red en el check**: los tests usan `tools/ladder/test/fixtures/` (replays recortados y con los jugadores renombrados) y un `fetch` falso. La descarga va a ≤ 1 petición por segundo con `User-Agent` propio; si falla con `SEC_E_UNTRUSTED_ROOT`, es la VPN.

## Particularidades del banco de pruebas

- **Todo combate entre bots pasa por `playBotBattle` (engine)**: el arena y el banco. Los agentes llegan ya creados (engine no depende del bot).
- El banco ([ADR-0013](docs/adr/0013-banco-de-pruebas-con-hilos.md), [guía](docs/guias/banco.md)) juega en **hilos de trabajo** (`WorkerPool`). Un hilo no hereda el cargador de TypeScript: su entrada `worker-entry.mjs` registra `tsx`. En los tests, `threads: 0` (`InlineRunner`) o pocos hilos; el servidor de los tests usa `benchThreads: 0`.
- **El resultado depende solo de la semilla**: cada combate, de `semilla:rival:modo:índice`, y el plan crece por rondas que solo miran rondas cerradas. Los combates especulativos nunca cuentan. Si tocas `BenchScheduler`, que siga en verde el test de determinismo con distinto número de hilos.
- La estadística vive en `packages/bench/src/stats.ts` (funciones puras con test). El total pesa **igual por rival y modo**. Los combates con error **nunca cuentan como derrota**.
- `BenchSummarySchema` (protocol) replica `BenchSummary` (bench): si cambias uno, cambia el otro (el servidor deja de compilar si divergen). Los bancos los guarda solo el servidor (`FileBenchRepository`, `storage/bench/`) y hay **uno a la vez**.
- El progreso va por su propio WebSocket (`/ws/bench`, `bench:watch`), que responde enseguida con el estado actual: reconectar no necesita nada más.
- El nivel 3 es caro (≈ 1 s por decisión en dobles con 15 hilos). Para medir variantes rápido: criba con el nivel 2 (`--screen`, comprobado que elige las mismas finalistas que el 3) y márgenes de ± 10.

## Particularidades del meta

- **Todo vive en `@colleja/metagame`** (solo Node) y `tools/metagame` ([ADR-0022](docs/adr/0022-meta-del-ladder-como-rivales.md), [guía](docs/guias/rivales.md#meta)). `storage/metagame/` **solo lo escribe `FileMetagameStore`** (el comando y el servidor), una instantánea por mes y corte. El servidor nunca la modifica por la API: no hay `PUT` ni `DELETE`; para editar un equipo se copia a «Mis rivales».
- **La instantánea es pura y determinista** (`buildSnapshot`): mismas estadísticas y replays → misma instantánea, sea cual sea el orden (test). La fecha se pasa desde fuera.
- **Sets**: lo más usado **que sea legal** en `@colleja/data` (habilidad de la especie, objeto sin repetir, reparto dentro de 66/32, movimientos que aprende). Una Mega se monta como la base con su piedra y la habilidad de la base. Todo equipo pasa por `teamProblems`: si no es legal, se descarta y se cuenta.
- **Equipos**: en dobles, arquetipos de equipos reales de replays (4 de 6 en común) con el peso de su grupo; en individuales (no hay replays con rating alto), crecidos por compañeros con Bayes ingenuo. Como mucho dos Megas por equipo.
- **Nada de red en el check ni en los E2E**: los tests usan `packages/metagame/test/fixtures/` (estadísticas recortadas), un Smogon falso y replays en carpetas temporales; el servidor de los tests recibe `metagameUpdate`/`metagameLatest` falsos y los E2E arrancan con `METAGAME_LATEST=off`. Si la descarga falla con `SEC_E_UNTRUSTED_ROOT`, es la VPN.
- **La descarga de replays** (`fetchReplays`, `FolderReplayStore`) vive aquí y la usan también `tools/ladder` y el servidor; `until` completa con los más nuevos sin tocar el cursor de `ladder:fetch`.
- **Sets probables** (`priors.ts`, `buildSetPriors`, fase 22): van en `MetagameSnapshot.sets` (opcional). Pesos que suman 1 por especie, legales (`checkSetIssues`), por especie base. `GET /api/metagame` no los envía a la web.
- **Banco con pesos**: `BenchOpponent.weight` (por defecto 1) y `modes`. El total y el reparto de Neyman normalizan los pesos; con pesos iguales, todo es idéntico a antes (test). Contra el meta, `setup.metagame` guarda la instantánea: compara solo bancos con la misma.

## Actualizar Showdown (nueva regulación o fixes)

1. `git -C vendor/pokemon-showdown fetch --depth 1 origin master`, y luego `git -C vendor/pokemon-showdown checkout FETCH_HEAD`.
2. `npm run setup:force`, luego `npm run data:build` (y revisa el diff de los datos, incluidas las plantillas de `generated/text/`), y después `npm run check`. El test de consistencia falla si se te olvida regenerar los datos.
3. Commit del nuevo puntero del submódulo junto con los datos regenerados (`chore(showdown): bump to <sha>`) y entrada en el CHANGELOG.

## Red del equipo del usuario

La red es normal. A veces el usuario activa una VPN (Sophos) para otro proyecto que bloquea Serebii, Smogon, Showdown, PokeAPI… (`SEC_E_UNTRUSTED_ROOT`). Si un sitio falla así, avísale en lugar de buscar rodeos. Los scripts de datos y sprites siguen descargando de GitHub (raw o git) porque es reproducible.
