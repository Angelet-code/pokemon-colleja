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
| **3. Dominio + motor + CLI jugable** | ⏭️ **Siguiente**: [docs/fases/fase-3.md](docs/fases/fase-3.md) |
| 4–8 y futuro | Pendientes (PLAN §8) |

### Protocolo de cierre de fase

1. `npm run check` en verde. Si añades algo ejecutable, inclúyelo en el check o en los tests.
2. Documentación:
   - `CHANGELOG.md`: entrada de la fase.
   - `docs/PLAN.md`: marca la fase ✅ en §8, pon al día la estructura (§3.2) y los riesgos si han cambiado.
   - `AGENTS.md`: tabla de estado, comandos nuevos y reglas o particularidades nuevas.
   - `README.md`: línea de estado y comandos de usuario.
   - Guías (`docs/guias/`) y ADRs (`docs/adr/`) si aplica.
3. **Escribe el brief de la siguiente fase** en `docs/fases/fase-(N+1).md`, con el mismo formato que `fase-3.md`: objetivo, punto de partida, hechos verificados, diseño recomendado, tests, criterios de "hecho" y fuera de alcance. Así la siguiente sesión puede empezar sin contexto.
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

## Puesta en marcha

Requisitos: **Node ≥ 24** y **git**.

```bash
git clone --recurse-submodules https://github.com/Angelet-code/pokemon-colleja.git
cd pokemon-colleja
npm install          # instala dependencias y además compila Showdown (postinstall)
npm run check        # lint + typecheck + tests + smoke: debe salir en verde
npm run data:sprites # opcional: sprites en assets/ (solo hacen falta para la UI)
```

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
packages/   → librerías: showdown (puente al motor), data (datos del juego); core, engine y bot en la fase 3+
tools/      → scripts: setup, smoke, data-pipeline (cli, arena… en fases siguientes)
vendor/pokemon-showdown → submódulo git fijado a un commit (NO editar)
docs/       → PLAN, research/, adr/, guias/, fases/ (briefs de cada fase)
storage/    → datos del usuario (equipos, replays): local, no versionado
assets/     → sprites descargados: local, no versionado
```

- **Solo `packages/showdown` toca `vendor/`.** El resto importa `@colleja/showdown`. Esto es una regla dura.
- `@colleja/showdown` es Node-only (usa `createRequire`). Nunca se importa desde `apps/web` ni desde `packages/core`.
- **`@colleja/data` es apto para navegador**: solo lee los JSON generados. Los datos del juego (roster, movimientos, nombres en español…) **se consultan ahí**, nunca a mano ni de memoria.
- `packages/data/generated/` **no se edita a mano**: se regenera con `npm run data:build`. Las correcciones van en `packages/data/overrides/` (sets propios en formato export y nombres en español).
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
- Formatos usados: `gen9championsbssregmc` (individuales: 6 → elegir 3) y `gen9championsvgc2026regmc` (dobles: 6 → elegir 4). Están en `CHAMPIONS_FORMATS`. Más hechos verificados del motor (reglas `@@@`, `inputLog`, elección de equipo, sintaxis de las elecciones) en [docs/fases/fase-3.md](docs/fases/fase-3.md).

## Actualizar Showdown (nueva regulación o fixes)

1. `git -C vendor/pokemon-showdown fetch --depth 1 origin master`, y luego `git -C vendor/pokemon-showdown checkout FETCH_HEAD`.
2. `npm run setup:force`, luego `npm run data:build` (y revisa el diff de los datos), y después `npm run check`. El test de consistencia falla si se te olvida regenerar los datos.
3. Commit del nuevo puntero del submódulo junto con los datos regenerados (`chore(showdown): bump to <sha>`) y entrada en el CHANGELOG.

## Red del equipo del usuario

En el PC del usuario, Sophos bloquea o intercepta Serebii, Bulbapedia, Smogon, play.pokemonshowdown.com, data.pkmn.cc, pokeapi.co… **npm y GitHub funcionan.** Descarga los datos y los sprites desde repos de GitHub (raw o git). Si investigas en la web y un sitio falla, es por eso.
