# Pokemon Colleja Simulator

Simulador de combates de **Pokémon Champions** para practicar en individuales y dobles contra un bot: equipos propios, rivales aleatorios o editados a medida y todas las mecánicas del juego (Stat Points, Megas, objetos, habilidades, estados, climas, campos…).

> Proyecto personal, no comercial. Pokémon y todos sus nombres, imágenes y marcas son propiedad de Nintendo, Game Freak, Creatures y The Pokémon Company.

## Estado

✅ Fase 0 (investigación y plan) · ✅ Fase 1 (cimientos) · ✅ Fase 2 (datos) · ✅ Fase 3 (dominio + motor + combate en terminal) · ✅ Fase 4 (bot de 3 niveles, equipos aleatorios, arena) · ✅ Fase 5 (servidor + UI de combate: **MVP**) · ✅ Fase 6 (teambuilder y equipos guardados) · ✅ Fase 7 (rivales guardados) · ✅ Fase 8 (calculadora, replays y explicación del bot) · ✅ Rediseño de la web · ✅ Fase 9 (bot nivel 3 "Experto", ahora el rival por defecto) · ✅ Fase 10 («Calcular» desde el combate, críticos y efectos en la calculadora, replays renombrables, E2E y un nivel 3 más fuerte en individuales) · ✅ Fase 11 (el nivel 3 deduce tus sets y se adapta a tu estilo) · ✅ Fase 12 (banco de pruebas de equipos) · ✅ Fase 13 (nivel 3 el doble de rápido) · ✅ Fase 14 (el nivel 3 piensa en la vista previa y lo enseña en «Pensamiento del bot») · ✅ Fase 15 (el nivel 3 lee los equipos enteros: Espacio Raro, Viento Afín, climas…) · ✅ Fase 16 (te dice por qué esperaba tu salida y por qué eligió la suya) · ✅ Fase 17 (medir en espejo y aprender a valorar posiciones con replays reales) · ✅ Fase 18 (animaciones de combate) · ✅ Fase 19 (el nivel 3 valora con lo aprendido y te dice qué decidió cada jugada) · ✅ Fase 20 (rivales del meta que se actualizan solos y banco contra el meta) · ✅ Fase 21 (la salida no se aprende de replays y apenas importa) · ✅ Fase 22 (el bot supone los sets que se juegan en el ladder) · ✅ Fase 23 (saber qué trae el rival no ayuda al bot: parada en el techo) · ⏭️ Fase 24 (cuánto falta en los sets del rival). Ver [CHANGELOG](CHANGELOG.md).

## Puesta en marcha

Requisitos: **Node ≥ 24** y git.

```bash
git clone --recurse-submodules https://github.com/Angelet-code/pokemon-colleja.git
cd pokemon-colleja
npm install
```

`npm install` también prepara el motor: sincroniza el submódulo de Showdown, instala sus dependencias y lo compila.

```bash
npm run dev
```

Arranca el servidor local y la web: abre **http://127.0.0.1:5173**, elige uno de tus equipos guardados o pega uno en formato export de Showdown (o genera uno aleatorio), elige rival, dificultad y modo, y juega en el navegador. Hay vista previa, Mega, objetivos en dobles, deshacer, rebobinar a cualquier turno, rendirse y descarga del replay. Cada turno se **anima**: se ve quién se mueve primero y el ataque de cada uno (Hidrobomba, Surf, Protección…), rápido, con el ajuste ×1 · ×2 · No de la barra del combate y un clic (o Espacio) para saltarlo; la galería **http://127.0.0.1:5173/animaciones** reproduce cualquier movimiento. El log se escribe en español con los textos de Showdown, y puedes ver los nombres en inglés. Para servir la versión compilada: `npm start` (http://127.0.0.1:3001). Más en la [guía de la web](docs/guias/web.md).

En **Equipos** (http://127.0.0.1:5173/equipos) creas equipos desde cero o importados de Showdown: especie, habilidad, objeto, naturaleza, **Stat Points con los stats en vivo**, movimientos filtrados por lo que aprende cada Pokémon en Champions, sets sugeridos y validación en vivo. Se guardan en `storage/teams/` y se usan en combate desde el inicio ([guía del teambuilder](docs/guias/teambuilder.md)).

En **PC de Bill** (http://127.0.0.1:5173/pc) apuntas los Pokémon que tienes en el juego; en el teambuilder, «Solo PC de Bill» limita las especies a esos ([guía](docs/guias/teambuilder.md#pc-de-bill)).

En **Rivales** (http://127.0.0.1:5173/rivales) preparas equipos para el bot con su dificultad: genera uno aleatorio, cópialo de tus equipos, impórtalo o créalo, edítalo con el mismo editor y guárdalo. En el inicio eliges ese rival guardado y practicas contra él. La sección **Meta** tiene los equipos del meta del ladder (sets de las estadísticas de Smogon, equipos reales de replays), cada uno con su peso. No se tocan: se actualizan con «Actualizar meta» (o `npm run meta:update`) y se pueden copiar a tus rivales ([guía de rivales](docs/guias/rivales.md)). Con el meta actualizado, el bot supone para tus Pokémon los sets que se juegan en el ladder.

En **Banco** (http://127.0.0.1:5173/banco) el bot juega tu equipo guardado contra tus rivales guardados **o contra el meta** (cada equipo pesado por lo que se juega, con «Donde más pierdes») y te da el **% de victorias por rival y en total**, con su margen de error, mientras la tabla se llena en vivo. También compara **dos versiones** de tu equipo (o una pegada como texto) en los mismos combates, guarda cada prueba en el historial del equipo y te lleva a jugar contra el rival donde flojeas ([guía del banco](docs/guias/banco.md)).

Para aprender de cada combate: **Calculadora** (http://127.0.0.1:5173/calculadora) con las reglas de Champions y el mismo cálculo que usa el bot (críticos, climas, campos, pantallas, Refuerzo, Compiescolta, Gravedad y las zonas), que se abre con **«Calcular»** desde el propio combate con los Pokémon en el campo; **Replays** guardados al terminar, para revivirlos turno a turno y renombrarlos; y la pestaña **«Pensamiento del bot»** en el combate, que enseña lo que leyó de tu equipo en la vista previa (qué pinta tiene y qué plan monta, roles, velocidades, quién tumba a quién, qué esperaba que trajeras y por qué esperaba tu salida) y lo que valoró en cada turno ya jugado, sin revelar lo que aún no has visto ([guía de herramientas](docs/guias/herramientas.md)).

```bash
npm run play
```

Juega un combate en la terminal contra el bot experto (nivel 3, mira cada turno por adelantado con el simulador) con un equipo rival aleatorio. Con `-- --mode doubles` juegas en dobles, con `-- --bot 2` (táctico), `-- --bot 1` (agresivo) o `-- --bot 0` (aleatorio) el rival es más fácil y con `-- --team mi-equipo.txt` usas tu equipo en formato export de Showdown. Durante el combate puedes `deshacer`, `rebobinar N` y `exportar` el replay. Todas las opciones: `npm run play -- --help` y la [guía de combates](docs/guias/combate.md).

```bash
npm run arena -- --a 3 --b 2
```

Enfrenta a dos niveles del bot con equipos aleatorios (o con tus rivales guardados: `-- --teams rivales`) y mide el porcentaje de victorias ([guía de bots](docs/guias/bot.md)). Con `-- --fixed` mide en espejo y con `-- --a-settings '{"learnedWeight":0}'` prueba una variante del nivel 3.

```bash
npm run bench -- --team "Mi equipo" --versus version-b.txt
```

El banco en la terminal: tu equipo contra tus rivales guardados (o contra el meta, con `--opponents meta`), bot contra bot en todos los núcleos, hasta saber el resultado con ± 5 puntos. Con `--screen` criba muchas versiones con el bot táctico y compara las dos mejores, y `npm run bench:calc -- --team "Mi equipo"` saca la matriz de daño contra los sets de tus rivales sin combatir ([guía del banco](docs/guias/banco.md)).

```bash
npm run meta:update
```

Actualiza el meta: estadísticas del último mes de Smogon y unos 300 replays nuevos de dobles (unos 5 minutos). Las instantáneas se guardan en `storage/metagame/` ([guía de rivales](docs/guias/rivales.md#meta)).

```bash
npm run smoke
```

Juega combates de Champions sin interfaz entre bots aleatorios, en individuales y en dobles.

```bash
npm run check
```

Ejecuta lint, typecheck, tests y smoke.

```bash
npm run e2e:install
```

```bash
npm run e2e
```

Tests E2E en el navegador con Playwright (el primero descarga Chromium una vez): compila la web y juega los flujos principales contra el servidor real ([guía de herramientas](docs/guias/herramientas.md#tests-e2e-playwright)). La CI los ejecuta en un job aparte.

```bash
npm run data:sprites
```

Descarga los sprites (renders de Champions normales y shiny, iconos y objetos) a `assets/`, que no se versiona. La web los usa si están; si no, muestra las iniciales.

Los datos del juego ya vienen generados en `packages/data/generated/`. Para regenerarlos tras actualizar Showdown o PokeAPI: `npm run data:build`. Más detalle en la [guía de datos](docs/guias/datos.md).

## Cómo contribuir / continuar

El proyecto avanza por fases. Cada fase pendiente tiene un **brief de traspaso** en [docs/fases/](docs/fases/), con objetivo, diseño, hechos verificados y criterios de "hecho". Las reglas del repositorio y el protocolo para cerrar una fase están en [AGENTS.md](AGENTS.md), que también leen los asistentes de IA (Claude Code lo carga a través de `CLAUDE.md`). La CI de GitHub ejecuta `npm run check` y los E2E en cada push.

## Documentación

- [Plan del proyecto](docs/PLAN.md): arquitectura, stack, hoja de ruta y decisiones
- Investigación:
  - [Pokémon Champions (Reg M-C)](docs/research/01-pokemon-champions.md)
  - [Mecánicas de combate](docs/research/02-mecanicas-combate.md)
  - [Stack técnico](docs/research/03-stack-tecnico.md)
  - Anexos: [roster](docs/research/anexos/champions-roster-regmc.md) · [objetos](docs/research/anexos/champions-objetos-regmc.md)
- Guías: [datos del juego](docs/guias/datos.md) · [combates](docs/guias/combate.md) · [bots](docs/guias/bot.md) · [servidor y web](docs/guias/web.md) · [teambuilder](docs/guias/teambuilder.md) · [rivales](docs/guias/rivales.md) · [herramientas](docs/guias/herramientas.md)
- Decisiones de arquitectura: [ADR-0001: motor de combate](docs/adr/0001-motor-de-combate.md) · [ADR-0002: pipeline de datos](docs/adr/0002-pipeline-de-datos.md) · [ADR-0003: sesión de combate](docs/adr/0003-sesion-de-combate.md) · [ADR-0004: bot por simulación](docs/adr/0004-bot-por-simulacion.md) · [ADR-0005: servidor, web y narración](docs/adr/0005-servidor-web-y-narracion.md) · [ADR-0006: equipos guardados y teambuilder](docs/adr/0006-equipos-guardados-y-teambuilder.md) · [ADR-0007: rivales guardados](docs/adr/0007-rivales-guardados.md) · [ADR-0008: herramientas de práctica](docs/adr/0008-herramientas-de-practica.md) · [ADR-0009: sistema de diseño](docs/adr/0009-sistema-de-diseno.md) · [ADR-0010: bot experto con sandbox](docs/adr/0010-bot-experto-con-sandbox.md) · [ADR-0011: nivel 3 con equipo completo](docs/adr/0011-nivel-3-con-equipo-completo.md)

## Créditos

- Motor de combate: [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) (MIT)
- Calculadora: [@smogon/calc](https://github.com/smogon/damage-calc) (MIT)
- Textos del log: plantillas de [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) y port del `BattleTextParser` del [cliente de Showdown](https://github.com/smogon/pokemon-showdown-client) (MIT)
- Datos i18n y sprites: [PokeAPI](https://pokeapi.co)
