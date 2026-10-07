# Guía: datos del juego (`packages/data`)

Todos los datos de Pokémon Champions que usa la app (especies, movimientos, objetos, learnsets, sets estándar, nombres en español…) se **generan** con un pipeline y se guardan en git en `packages/data/generated/`. **No se editan a mano.** Las correcciones manuales van en `packages/data/overrides/`.

Decisión de arquitectura: [ADR-0002](../adr/0002-pipeline-de-datos.md).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run data:build` | Regenera `packages/data/generated/` (≈2 s; la primera vez descarga los CSV de PokeAPI a una caché local) |
| `npm run data:sprites` | Descarga los sprites a `assets/sprites/` (no versionado). Admite `-- --shiny` y `-- --force` |

Después de un `data:build`, revisa siempre el diff de `packages/data/generated/`: refleja exactamente qué ha cambiado en los datos del juego.

## Fuentes (todas fijadas a un commit)

| Fuente | Commit fijado en | Aporta |
|---|---|---|
| Showdown, mod `champions` | Submódulo `vendor/pokemon-showdown` | Legalidad, stats, movimientos, objetos, learnsets, formatos, sets aleatorios, textos en inglés, nombres de respaldo en español |
| PokeAPI (CSV en GitHub) | `tools/data-pipeline/sources.json` | Nombres oficiales y descripciones del juego en español, ids de sprites |
| PokeAPI/sprites | `tools/data-pipeline/sources.json` | Renders de Champions (128 px), iconos y sprites de objetos |

## Ficheros generados

| Fichero | Contenido |
|---|---|
| `meta.json` | Commits de origen, regulación, recuentos y nombres sin traducción |
| `species.json` | 269 especies seleccionables (231 nº de Pokédex), 82 Megas y 7 formas de combate |
| `moves.json` | 511 movimientos legales (con PP de Champions: 8/12/16/20) |
| `abilities.json`, `items.json`, `natures.json` | 215 habilidades · 166 objetos (81 megapiedras) · 25 naturalezas |
| `typechart.json` | Tabla de tipos 18×18 (sin Stellar: no hay Tera) |
| `learnsets.json` | Movimientos aprendibles por especie seleccionable |
| `formats.json` | Individuales (6 → 3) y dobles (6 → 4): nivel 50, Stat Points 66/32, reglas y temporizador |
| `standard-sets.json` | Sets estándar por modo y especie (≈490 en individuales y ≈460 en dobles) |
| `i18n/{es,en}.json` | Nombres por idioma (especies, movimientos, habilidades, objetos, naturalezas, tipos, stats) |
| `i18n/{es,en}.descriptions.json` | Descripciones de movimientos, habilidades y objetos |

API de acceso, apta para navegador: `import { getSpecies, getName, getStandardSets… } from '@colleja/data'`.

## Reglas que aplica el pipeline

**Legalidad.** Una especie es legal si en el mod `champions` no tiene `isNonstandard` y no es una forma cosmética. Las Megas y las formas de combate solo se incluyen si su forma base es legal; Showdown deja algunas (Meloetta-Pirouette, Ogerpon-Tera…) sin marcar aunque su base no esté en Champions. En el caso de las Megas, además, su megapiedra tiene que ser legal.

**Movimientos.** Se incluye la unión de los learnsets de Champions de todas las especies seleccionables, quitando los que están marcados como no estándar, y además Combate (Struggle). Los PP se calculan con la fórmula del propio motor (`battle.calculatePP`).

**Sets estándar.** Se generan así:
1. Por cada rol de los *random sets* de Champions de Showdown se genera un set concreto con el generador oficial: 4 movimientos y objeto. La semilla es determinista para cada modo, especie e intento.
2. Se fuerza el nivel 50 y se calculan Stat Points y naturaleza con la heurística de `tools/data-pipeline/src/sets/spread.ts`:

   | Perfil | Reparto | Naturaleza |
   |---|---|---|
   | Ofensivo rápido | 32 ataque · 32 Vel · 2 PS | +Vel, −ataque no usado |
   | Ofensivo resistente | 32 PS · 32 ataque · 2 defensa más baja | +ataque, −el otro |
   | Soporte | 32 PS · 17 Def · 17 DefEsp | +defensa más baja, −ataque no usado |
   | Soporte rápido | 32 PS · 32 Vel · 2 defensa más baja | +Vel, −ataque no usado |

   Con Espacio Raro, Giro Bola o Repr. Metal, los puntos de Velocidad pasan a PS y la naturaleza baja Velocidad.
3. **Cada set se valida con el validador de Champions.** Los intentos ilegales se descartan.
4. Los sets de Mega se guardan bajo la especie base (`charizard` → sets con `mega: "charizardmegay"`).

**Nombres en español.** Para especies y formas el orden de preferencia es:
1. Nombre oficial de PokeAPI. Los nombres de forma se convierten en nombre completo: "Forma de Alola" → "Raichu de Alola", "Forma Filo" → "Aegislash (Forma Filo)".
2. Convención oficial derivada: "Mega-Raichu X", "Tauros de Paldea (Raza Acuática)".
3. `overrides/i18n.es.json`.

En el resto de tipos de nombre: PokeAPI, luego la traducción de Showdown (`data/text/es`) y luego los overrides. Lo que quede sin traducir se muestra en inglés en tiempo de ejecución y aparece en `meta.json → missingSpanishNames`. Ahora mismo solo falta la habilidad Aura Guard.

**Descripciones.**
- En inglés salen de Showdown, resueltas para Champions; ahí hay 20 efectos con texto propio de Champions.
- En español se usa el texto del juego de PokeAPI, **excepto** en esos 20 efectos que Champions cambia (Fiebre Dorada, Sorpresa…). En esos casos el texto de los juegos principales sería falso, así que se muestra el inglés.

## Sprites (`npm run data:sprites`)

- `assets/sprites/pokemon/<id>.png`: renders de Champions, 128 px. Hay uno para cada especie; Mimikyu-Busted usa el de la forma base.
- `assets/sprites/icons/<id>.png`: iconos de Gen 8, 68×56 px. **Faltan 93**, los de las especies de Gen 9 y las Megas nuevas: no existen en PokeAPI. La UI usará el render reducido como respaldo.
- `assets/sprites/items/<id>.png`: **faltan 40**, las megapiedras nuevas de Leyendas Z-A. La UI mostrará solo el nombre.
- `assets/sprites/manifest.json` lista los respaldos y los que faltan.
- El arte es © Nintendo/The Pokémon Company. Solo se usa en local y no se sube a git.

## Tests que protegen los datos

- `packages/data/test/data.test.ts` comprueba:
  - Recuentos del roster.
  - Cambios propios de Champions: learnsets, PP, precisión de Fiebre Dorada, objetos que no existen.
  - Formatos, tabla de tipos e i18n.
  - Coherencia de todos los sets estándar.
- `tools/data-pipeline/test/consistency.test.ts` **regenera desde el motor fijado** y compara con lo que hay en git. Si alguien actualiza Showdown sin ejecutar `data:build`, el test falla con un aviso. Además pasa cada set estándar por el validador de Champions.
- `tools/data-pipeline/test/units.test.ts` cubre el parser de CSV, la heurística de Stat Points, los nombres derivados y el JSON estable.

## Actualizar (nueva regulación, parche, PokeAPI)

1. Si cambia Showdown, mueve el submódulo (ver [AGENTS.md](../../AGENTS.md)). Si cambia PokeAPI, actualiza el commit en `tools/data-pipeline/sources.json`.
2. Si cambia la regulación, actualiza `REGULATION` en `tools/data-pipeline/src/config.ts` y los ids de formato en `packages/showdown/src/formats.ts`.
3. Ejecuta `npm run data:build` y revisa el diff de `packages/data/generated/`.
4. Ajusta los tests de recuentos si el roster ha cambiado y ejecuta `npm run check`.
5. Añade una entrada al CHANGELOG.
