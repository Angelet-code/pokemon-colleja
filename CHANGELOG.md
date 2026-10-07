# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Sin publicar]

### Fase 2 — Pipeline de datos (2026-10-07)

#### Añadido

- `packages/data` (`@colleja/data`): datos de Champions Reg M-C generados y versionados, con una API tipada apta para navegador:
  - `getSpecies`, `getLearnset`, `canLearn`, `getStandardSets`, `getName`, `getDescription`, `getTypeEffectiveness`…
  - 269 especies seleccionables (231 nº de Pokédex), 82 Megas y 7 formas de combate.
  - 511 movimientos con los PP de Champions, 215 habilidades, 166 objetos (81 megapiedras) y 25 naturalezas.
  - Tabla de tipos, learnsets y los formatos de individuales (6 → 3) y dobles (6 → 4).
- Sets estándar: ≈490 en individuales y ≈460 en dobles, uno por rol de los *random sets* de Champions. Llevan Stat Points y naturaleza heurísticos, y **todos están validados** con el validador de Champions.
- Español:
  - Nombres oficiales de PokeAPI, con la traducción de Showdown como respaldo y nombres derivados para las Megas de Z-A y las formas regionales.
  - Descripciones del juego, salvo en los 20 efectos que Champions modifica (ahí se usa el texto de Champions en inglés).
- `packages/data/overrides/` para sets propios (formato export de Showdown) y para corregir nombres en español.
- `tools/data-pipeline`:
  - `npm run data:build` (determinista; PokeAPI fijada por commit y descargada desde GitHub).
  - `npm run data:sprites` (renders de Champions, iconos y objetos en `assets/`, no versionado).
- Tests:
  - De los datos (recuentos, cambios de Champions, i18n, coherencia de los sets).
  - Del pipeline (CSV, heurística de Stat Points, nombres).
  - Uno de **consistencia** que regenera los datos desde el motor y detecta si están desactualizados.
- Documentación: `docs/guias/datos.md` y ADR-0002.

### Fase 1 — Cimientos (2026-10-07)

#### Añadido

- Repositorio git y monorepo con npm workspaces (`packages/*`, `apps/*`, `tools/*`).
- Tooling: TypeScript 7 (`strict`, Bundler), Biome 2 (formato y lint), Vitest 5, tsx. Node ≥ 24.
- Pokémon Showdown vendorizado como submódulo git superficial en `vendor/pokemon-showdown`, **fijado a `c046106`** (2026-10-06, Reg M-C).
- `tools/setup`: setup idempotente de Showdown (submódulo + `npm ci --ignore-scripts` + build + tipos). Se ejecuta en `postinstall`.
- `packages/showdown` (`@colleja/showdown`): puente único y tipado hacia el simulador, con los formatos Champions en `CHAMPIONS_FORMATS`.
- `tools/smoke`: combates headless deterministas entre bots aleatorios de Showdown.
  - Dos equipos fixture legales, validados en BSS Reg M-C y en VGC Reg M-C.
  - Combates aleatorios con sets de random battle de Champions.
  - Recuento de Megaevoluciones.
- Tests:
  - Fórmula de Stat Points verificada a través del motor.
  - Límites de SP del validador.
  - Legalidad de los fixtures.
  - Determinismo por semilla.
- `AGENTS.md` / `CLAUDE.md` con comandos, reglas de dependencias y particularidades de Champions.

### Fase 0 — Investigación y plan (2026-10-07)

#### Añadido

- `docs/PLAN.md`: arquitectura, stack, hoja de ruta y decisiones.
- Investigación en `docs/research/`:
  - Pokémon Champions Reg M-C.
  - Mecánicas Gen 9.
  - Stack técnico.
  - Anexos con el roster y los objetos.
- ADR-0001: envolver el simulador de Showdown.
