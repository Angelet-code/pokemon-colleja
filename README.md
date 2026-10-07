# Pokemon Colleja Simulator

Simulador de combates de **Pokémon Champions** para practicar en individuales y dobles contra un bot: equipos propios, rivales aleatorios o editados a medida y todas las mecánicas del juego (Stat Points, Megas, objetos, habilidades, estados, climas, campos…).

> Proyecto personal, no comercial. Pokémon y todos sus nombres, imágenes y marcas son propiedad de Nintendo, Game Freak, Creatures y The Pokémon Company.

## Estado

✅ Fase 0 (investigación y plan) · ✅ Fase 1 (cimientos) · ✅ Fase 2 (datos) · ✅ Fase 3 (dominio + motor + combate en terminal) · ✅ Fase 4 (bot de 3 niveles, equipos aleatorios, arena) · ✅ Fase 5 (servidor + UI de combate: **MVP**) · ⏭️ Fase 6 (teambuilder). Ver [CHANGELOG](CHANGELOG.md).

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

Arranca el servidor local y la web: abre **http://127.0.0.1:5173**, pega tu equipo en formato export de Showdown (o genera uno aleatorio), elige rival, dificultad y modo, y juega en el navegador. Hay vista previa, Mega, objetivos en dobles, deshacer, rebobinar a cualquier turno, rendirse y descarga del replay. El log se escribe en español con los textos de Showdown, y puedes ver los nombres en inglés. Para servir la versión compilada: `npm start` (http://127.0.0.1:3001). Más en la [guía de la web](docs/guias/web.md).

```bash
npm run play
```

Juega un combate en la terminal contra el bot táctico (nivel 2) con un equipo rival aleatorio. Con `-- --mode doubles` juegas en dobles, con `-- --bot 1` (agresivo) o `-- --bot 0` (aleatorio) el rival es más fácil y con `-- --team mi-equipo.txt` usas tu equipo en formato export de Showdown. Durante el combate puedes `deshacer`, `rebobinar N` y `exportar` el replay. Todas las opciones: `npm run play -- --help` y la [guía de combates](docs/guias/combate.md).

```bash
npm run arena -- --a 2 --b 0
```

Enfrenta a dos niveles del bot con equipos aleatorios y mide el porcentaje de victorias ([guía de bots](docs/guias/bot.md)).

```bash
npm run smoke
```

Juega combates de Champions sin interfaz entre bots aleatorios, en individuales y en dobles.

```bash
npm run check
```

Ejecuta lint, typecheck, tests y smoke.

```bash
npm run data:sprites
```

Descarga los sprites (renders de Champions, iconos y objetos) a `assets/`, que no se versiona. La web los usa si están; si no, muestra las iniciales.

Los datos del juego ya vienen generados en `packages/data/generated/`. Para regenerarlos tras actualizar Showdown o PokeAPI: `npm run data:build`. Más detalle en la [guía de datos](docs/guias/datos.md).

## Cómo contribuir / continuar

El proyecto avanza por fases. Cada fase pendiente tiene un **brief de traspaso** en [docs/fases/](docs/fases/), con objetivo, diseño, hechos verificados y criterios de "hecho". Las reglas del repositorio y el protocolo para cerrar una fase están en [AGENTS.md](AGENTS.md), que también leen los asistentes de IA (Claude Code lo carga a través de `CLAUDE.md`). La CI de GitHub ejecuta `npm run check` en cada push.

## Documentación

- [Plan del proyecto](docs/PLAN.md): arquitectura, stack, hoja de ruta y decisiones
- Investigación:
  - [Pokémon Champions (Reg M-C)](docs/research/01-pokemon-champions.md)
  - [Mecánicas de combate](docs/research/02-mecanicas-combate.md)
  - [Stack técnico](docs/research/03-stack-tecnico.md)
  - Anexos: [roster](docs/research/anexos/champions-roster-regmc.md) · [objetos](docs/research/anexos/champions-objetos-regmc.md)
- Guías: [datos del juego](docs/guias/datos.md) · [combates](docs/guias/combate.md) · [bots](docs/guias/bot.md) · [servidor y web](docs/guias/web.md)
- Decisiones de arquitectura: [ADR-0001: motor de combate](docs/adr/0001-motor-de-combate.md) · [ADR-0002: pipeline de datos](docs/adr/0002-pipeline-de-datos.md) · [ADR-0003: sesión de combate](docs/adr/0003-sesion-de-combate.md) · [ADR-0004: bot por simulación](docs/adr/0004-bot-por-simulacion.md) · [ADR-0005: servidor, web y narración](docs/adr/0005-servidor-web-y-narracion.md)

## Créditos

- Motor de combate: [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) (MIT)
- Calculadora: [@smogon/calc](https://github.com/smogon/damage-calc) (MIT)
- Textos del log: plantillas de [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) y port del `BattleTextParser` del [cliente de Showdown](https://github.com/smogon/pokemon-showdown-client) (MIT)
- Datos i18n y sprites: [PokeAPI](https://pokeapi.co)
