# Pokemon Colleja Simulator — Guía para agentes

Simulador de combates de **Pokémon Champions** (individuales y dobles) para practicar contra un bot. Antes de cambiar nada relevante, lee [docs/PLAN.md](docs/PLAN.md): contiene la arquitectura, la hoja de ruta por fases y las decisiones tomadas.

## Estado

- Fase 0 (investigación y plan) ✅
- Fase 1 (cimientos) ✅
- Siguiente: **Fase 2 (pipeline de datos)**. Ver PLAN §5 y §8.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias y prepara Showdown (postinstall → `npm run setup`) |
| `npm run setup` / `setup:force` | Sincroniza el submódulo, instala sus dependencias y compila `dist/` con tipos (idempotente) |
| `npm run smoke` | Combates headless de Champions (fixtures + aleatorios). Admite `-- --random N --seed X --verbose` |
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
- Los learnsets de Champions difieren de los de Escarlata/Púrpura (por ejemplo, Incineroar no aprende Knock Off). La verdad la tiene el validador o `Dex.mod('champions')`, nunca la memoria.
- No hay Teracristalización. La Mega Evolución sí existe, una por combate.
- Formatos usados: `gen9championsbssregmc` (individuales: 6 → elegir 3) y `gen9championsvgc2026regmc` (dobles: 6 → elegir 4). Están en `CHAMPIONS_FORMATS`.

## Actualizar Showdown (nueva regulación o fixes)

1. `git -C vendor/pokemon-showdown fetch --depth 1 origin master`, y luego `git -C vendor/pokemon-showdown checkout FETCH_HEAD`.
2. `npm run setup:force` y después `npm run check`.
3. Commit del nuevo puntero del submódulo (`chore(showdown): bump to <sha>`) y entrada en el CHANGELOG.

## Red de este equipo

Sophos bloquea o intercepta Serebii, Bulbapedia, Smogon, play.pokemonshowdown.com, data.pkmn.cc, pokeapi.co… **npm y GitHub funcionan.** Descarga los datos y los sprites desde repos de GitHub (raw o git).
