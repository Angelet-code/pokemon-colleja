# ADR-0001 — Motor de combate: envolver el simulador de Pokémon Showdown

- **Estado**: Aceptado (2026-10-07)
- **Fecha**: 2026-10-07
- **Contexto de investigación**: [03-stack-tecnico.md](../research/03-stack-tecnico.md), [01-pokemon-champions.md](../research/01-pokemon-champions.md)

## Contexto

Queremos un simulador fiel a **Pokémon Champions** (individuales y dobles) con todas las mecánicas: stats, objetos, habilidades, estados, climas, campos, Mega Evolución, objetivos en dobles, etc.

El simulador de Pokémon Showdown (MIT):

- Ya implementa Champions en `data/mods/champions/` con formatos VGC (dobles) y BSS (individuales) de la regulación vigente.
- Recibe fixes del mod Champions cada semana (39 commits entre junio y octubre de 2026).
- Contiene ~420 movimientos, ~309 habilidades y ~384 objetos con lógica propia, un sistema de eventos con ~113 hooks y 359 ficheros de test.

Escribir un motor equivalente es un proyecto de meses o años y divergiría en casos raros durante mucho tiempo.

## Decisión

1. **El motor de combate es el sim de Showdown**, vendorizado como submódulo git en `vendor/pokemon-showdown` y **fijado a un commit concreto** de `master` (npm va meses por detrás en Champions).
2. Nuestro código **nunca depende de Showdown directamente** salvo en un único paquete adaptador (`packages/engine`), que implementa una interfaz propia `BattleEngine`. UI, bot, teambuilder y datos hablan con nuestros tipos de dominio.
3. El sim corre en un **servidor Node local** (variante A1). La interfaz `BattleEngine` permite añadir más adelante una implementación en navegador con `@pkmn/sim` en un Web Worker (variante A2) sin tocar la UI ni el bot.
4. Lo que **sí construimos nosotros**: UI de combate, teambuilder, gestión de equipos y rivales, bot, pipeline de datos, i18n en español, herramientas de práctica (rebobinar turno, calculadora, replays).
5. Actualizar el motor = mover el commit fijado + regenerar snapshots de datos + pasar la batería de tests. Se documenta en el CHANGELOG.

## Implementación (fase 1)

- **Submódulo** superficial `vendor/pokemon-showdown`, fijado a `c046106` (2026-10-06).
- `tools/setup` (lo lanza `postinstall`) ejecuta `npm ci --ignore-scripts` dentro del vendor para no compilar módulos nativos opcionales. Después ejecuta `node build` y genera los `.d.ts` de `sim/index` y `sim/tools/random-player-ai`. Un fichero de sello, guardado por commit, hace que el proceso sea idempotente.
- `packages/showdown` (`@colleja/showdown`) es el puente único: carga el `dist/` CommonJS con `createRequire` y reexporta valores y tipos. Ningún otro paquete importa de `vendor/`.

## Consecuencias

**Positivas**

- Fidelidad máxima desde el día uno, mantenida por la comunidad.
- Combates deterministas por semilla → tests reproducibles, rebobinar turnos, replays.
- `Battle.toJSON/fromJSON` permite al bot simular jugadas futuras.
- Gratis: validador de equipos, formatos clásicos de Gen 9 (con IVs/EVs y Tera) si algún día se quieren.

**Negativas / riesgos**

- Dependemos del protocolo de texto de Showdown (estable desde hace años; lo aislamos con `@pkmn/protocol` + `@pkmn/client`).
- Hace falta un proceso Node para jugar (aceptable: app local). Mitigación: variante A2 si se quiere modo estático/móvil.
- No aprendemos a implementar las mecánicas a bajo nivel. Si en el futuro interesa, la opción C (motor propio con Showdown como oráculo) sigue abierta gracias a la interfaz `BattleEngine`.

## Alternativas descartadas

- **B. Motor propio desde cero**: coste enorme, fidelidad inferior durante mucho tiempo.
- **A2 como opción inicial (`@pkmn/sim` en navegador)**: datos congelados en junio 2026 (sin Reg M-C ni fixes). Se mantiene como evolución futura.
