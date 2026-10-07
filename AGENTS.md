# Pokemon Colleja Simulator — Guía para agentes

Simulador de combates de **Pokémon Champions** (individuales y dobles) para practicar contra un bot. Antes de cambiar nada relevante, lee [docs/PLAN.md](docs/PLAN.md): contiene la arquitectura, la hoja de ruta por fases y las decisiones tomadas.

## Estado

- Fase 0 (investigación y plan) ✅
- Fase 1 (cimientos) ✅
- Fase 2 (pipeline de datos) ✅. Ver [docs/guias/datos.md](docs/guias/datos.md).
- Siguiente: **Fase 3 (dominio + motor)**. Ver PLAN §3.5 y §8.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias y prepara Showdown (postinstall → `npm run setup`) |
| `npm run setup` / `setup:force` | Sincroniza el submódulo, instala sus dependencias y compila `dist/` con tipos (idempotente) |
| `npm run smoke` | Combates headless de Champions (fixtures + aleatorios). Admite `-- --random N --seed X --verbose` |
| `npm run data:build` | Regenera `packages/data/generated/` desde Showdown + PokeAPI (determinista). Después, revisa el diff |
| `npm run data:sprites` | Descarga los sprites a `assets/sprites/` (no versionado). Admite `-- --shiny` y `-- --force` |
| `npm test` | Vitest (`{packages,apps,tools}/*/test/**/*.test.ts`) |
| `npm run typecheck` | `tsc --noEmit` en cada workspace (TypeScript 7) |
| `npm run lint` / `lint:fix` | Biome (formato + lint) |
| `npm run check` | lint + typecheck + test + smoke. Ejecútalo antes de dar algo por terminado |

## Estructura y reglas de dependencias

```
apps/       → aplicaciones (web, server). Pueden depender de packages/*
packages/   → librerías. core no depende de nada del proyecto
tools/      → scripts (setup, smoke, data-pipeline, arena, cli)
vendor/pokemon-showdown → submódulo git fijado a un commit (NO editar)
docs/       → plan, investigación, ADRs
```

- **Solo `packages/showdown` toca `vendor/`.** El resto importa `@colleja/showdown`. Esto es una regla dura.
- `@colleja/showdown` es Node-only (usa `createRequire`). Nunca se importa desde `apps/web`.
- **`@colleja/data` es apto para navegador**: solo lee los JSON generados. Los datos del juego (roster, movimientos, nombres en español…) **se consultan ahí**, nunca a mano ni de memoria.
- `packages/data/generated/` **no se edita a mano**: se regenera con `npm run data:build`. Las correcciones van en `packages/data/overrides/` (sets propios en formato export y nombres en español).
- El pipeline importa `@colleja/data/schema` (tipos y constantes), nunca `@colleja/data`, porque este carga los JSON que el propio pipeline genera.
- Los paquetes internos se consumen como fuente TS (`"exports": "./src/index.ts"`), sin build. Se ejecutan con `tsx` y se testean con Vitest.

## Convenciones

- Código, identificadores y comentarios técnicos en **inglés**. Documentación y UI en **español**.
- TypeScript `strict` + `noUncheckedIndexedAccess`. Sin `any`. Imports de tipos con `import type`. Módulos de Node con prefijo `node:`.
- Ficheros en `kebab-case`, tipos en `PascalCase`. Tests en `<workspace>/test/*.test.ts`.
- Cada decisión de arquitectura relevante se documenta en un ADR (`docs/adr/NNNN-titulo.md`). Cada fase o cambio de datos va al [CHANGELOG](CHANGELOG.md).
- Commits con Conventional Commits (`feat(bot): …`, `fix(engine): …`, `chore(showdown): bump to <sha>`).

## Particularidades de Champions (errores típicos)

- **No hay IVs ni EVs, hay Stat Points**: 66 en total y 32 como máximo por stat. Showdown los guarda en el campo `evs` del set. Los IVs están fijos a 31 y el nivel es 50.
- **Hay que validar los equipos antes de combatir.** `TeamValidator.get(formatid).validateTeam(sets)` aplica `Adjust Level Down = 50` y la legalidad. `BattleStream` **no valida**: sin validar, un set sin `Level` se jugaría a nivel 100.
- Los learnsets de Champions difieren de los de Escarlata/Púrpura (por ejemplo, Incineroar no aprende Knock Off). La verdad la tienen `@colleja/data` (`canLearn`) o el validador, nunca la memoria.
- Hay 20 efectos con texto propio de Champions (Fiebre Dorada, Sorpresa…). Para esos no se usa el texto de los juegos principales.
- No hay Teracristalización. La Mega Evolución sí existe, una por combate.
- Formatos usados: `gen9championsbssregmc` (individuales: 6 → elegir 3) y `gen9championsvgc2026regmc` (dobles: 6 → elegir 4). Están en `CHAMPIONS_FORMATS`.

## Actualizar Showdown (nueva regulación o fixes)

1. `git -C vendor/pokemon-showdown fetch --depth 1 origin master`, y luego `git -C vendor/pokemon-showdown checkout FETCH_HEAD`.
2. `npm run setup:force`, luego `npm run data:build` (y revisa el diff de los datos), y después `npm run check`. El test de consistencia falla si se te olvida regenerar los datos.
3. Commit del nuevo puntero del submódulo junto con los datos regenerados (`chore(showdown): bump to <sha>`) y entrada en el CHANGELOG.

## Red de este equipo

Sophos bloquea o intercepta Serebii, Bulbapedia, Smogon, play.pokemonshowdown.com, data.pkmn.cc, pokeapi.co… **npm y GitHub funcionan.** Descarga los datos y los sprites desde repos de GitHub (raw o git).
