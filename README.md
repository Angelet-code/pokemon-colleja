# Pokemon Colleja Simulator

Simulador de combates de **Pokémon Champions** para practicar en individuales y dobles contra un bot: equipos propios, rivales aleatorios o editados a medida y todas las mecánicas del juego (Stat Points, Megas, objetos, habilidades, estados, climas, campos…).

> Proyecto personal, no comercial. Pokémon y todos sus nombres, imágenes y marcas son propiedad de Nintendo, Game Freak, Creatures y The Pokémon Company.

## Estado

✅ Fase 0 (investigación y plan) · ✅ Fase 1 (cimientos) · ✅ Fase 2 (datos) · ⏭️ Fase 3 (dominio + motor). Ver [CHANGELOG](CHANGELOG.md).

## Puesta en marcha

Requisitos: **Node ≥ 24** y git.

```bash
git clone --recurse-submodules https://github.com/Angelet-code/pokemon-colleja.git
cd pokemon-colleja
npm install
```

`npm install` también prepara el motor: sincroniza el submódulo de Showdown, instala sus dependencias y lo compila.

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

Descarga los sprites (renders de Champions, iconos y objetos) a `assets/`, que no se versiona.

Los datos del juego ya vienen generados en `packages/data/generated/`. Para regenerarlos tras actualizar Showdown o PokeAPI: `npm run data:build`. Más detalle en la [guía de datos](docs/guias/datos.md).

## Documentación

- [Plan del proyecto](docs/PLAN.md): arquitectura, stack, hoja de ruta y decisiones
- Investigación:
  - [Pokémon Champions (Reg M-C)](docs/research/01-pokemon-champions.md)
  - [Mecánicas de combate](docs/research/02-mecanicas-combate.md)
  - [Stack técnico](docs/research/03-stack-tecnico.md)
  - Anexos: [roster](docs/research/anexos/champions-roster-regmc.md) · [objetos](docs/research/anexos/champions-objetos-regmc.md)
- Guías: [datos del juego](docs/guias/datos.md)
- Decisiones de arquitectura: [ADR-0001: motor de combate](docs/adr/0001-motor-de-combate.md) · [ADR-0002: pipeline de datos](docs/adr/0002-pipeline-de-datos.md)

## Créditos

- Motor de combate: [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) (MIT)
- Calculadora: [@smogon/calc](https://github.com/smogon/damage-calc) (MIT)
- Utilidades de protocolo y cliente: [pkmn](https://github.com/pkmn/ps) (MIT)
- Datos i18n y sprites: [PokeAPI](https://pokeapi.co)
