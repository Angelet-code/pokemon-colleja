# ADR-0002 — Datos del juego generados y versionados; español desde PokeAPI

- **Estado**: Aceptado (2026-10-07)
- **Guía operativa**: [docs/guias/datos.md](../guias/datos.md)

## Contexto

La UI (teambuilder, pantalla de combate) necesita los datos de Champions en el navegador, en español y sin depender de Showdown, que solo funciona en Node. El bot y el servidor también los usan. Los datos cambian con cada regulación o parche, y queremos ver exactamente qué cambia.

## Decisión

1. Un pipeline (`tools/data-pipeline`) genera **JSON deterministas** en `packages/data/generated/` a partir del commit fijado de Showdown (mod `champions`) y de PokeAPI fijada por commit. Los JSON **se suben a git**: cada actualización deja un diff revisable.
2. `@colleja/data` expone esos JSON con una API tipada y **sin dependencias de Node ni de Showdown**, para que funcione en el navegador. El pipeline usa solo `@colleja/data/schema` (tipos, constantes y `toId`), así no depende de los propios JSON que genera.
3. **Fuente de verdad mecánica: Showdown.** Esto incluye legalidad, PP (fórmula del motor), learnsets, cambios de Champions y textos en inglés.
4. **Fuente del español: PokeAPI.** Aporta los nombres oficiales y los textos del juego. Las traducciones de Showdown sirven de respaldo para nombres, y las formas sin traducción se nombran con las convenciones oficiales.
5. Los textos de efectos **que Champions modifica** no se traducen con los textos de los juegos principales, porque serían incorrectos.
6. **Sets estándar:** se generan con el generador de *random sets* de Champions de Showdown, un set por rol. Stat Points y naturaleza salen de una heurística documentada, y todos los sets pasan por el validador de Champions. Se pueden sustituir con `overrides/standard-sets.json`, que usa el formato export de Showdown.
7. Los sprites se descargan bajo demanda (`npm run data:sprites`) a `assets/`, que **no se versiona** porque el arte tiene copyright.
8. Un test regenera los datos desde el motor y los compara con los que hay en git, así detecta datos desactualizados.

## Consecuencias

- La web carga unos 1,3 MB de JSON sin minificar (unos 150 KB con gzip). Es aceptable para una app local, y se puede trocear más adelante con imports dinámicos.
- Actualizar a una nueva regulación es mecánico: mover el commit, ejecutar `data:build`, revisar el diff y pasar los tests.
- La heurística de Stat Points no es la del metajuego real. Está asumido: el usuario editará los sets.
- Hay dependencia de la estructura interna del generador de Showdown (`randomSets`, `randomSet`). Está aislada en un único módulo (`sets/standard-sets.ts`) detrás de una interfaz mínima.

## Alternativas descartadas

- **Usar el dex de Showdown en el navegador (`@pkmn/dex`)**: sus datos de Champions van atrasados (junio de 2026) y no incluye el español.
- **Copiar el roster y los objetos a mano**: propenso a errores y sin diff automático entre regulaciones.
- **Sets de Smogon (`pkmn/smogon`)**: solo cubren las especies populares y tienen copyright de Smogon. Quedan como posible capa futura.
