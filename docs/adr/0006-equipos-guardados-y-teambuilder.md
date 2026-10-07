# ADR-0006 — Equipos guardados y teambuilder

- **Estado**: Aceptado (2026-10-08)
- **Guía operativa**: [docs/guias/teambuilder.md](../guias/teambuilder.md)

## Contexto

La fase 6 añade un editor de equipos en el navegador y su persistencia en el servidor. Había que decidir:

- dónde y cómo se guardan los equipos;
- qué se hace con un equipo ilegal (¿se puede guardar?);
- si un equipo pertenece a un modo;
- cómo muestra el editor cada problema junto al campo que lo causa;
- qué pasa con el texto importado que no cabe en el editor (más de 6 Pokémon, `EVs: 252 Atk` del formato clásico…).

## Decisión

1. **Un fichero JSON por equipo** en `storage/teams/<id>.json` (PLAN §3.7), detrás de la interfaz `TeamRepository` (`list`, `get`, `create`, `update`, `delete`). La implementación es `FileTeamRepository(dir)`:
   - Formato `{ version: 1, updatedAt, team, export }`, legible y editable a mano. `team` es la fuente de verdad. `export` (texto de Showdown) es una copia de cortesía que se reescribe al guardar.
   - **Escritura atómica**: fichero temporal en la misma carpeta y `rename` encima del anterior.
   - Ids `crypto.randomUUID()`. **El nombre del fichero es el id**: solo se aceptan letras, números y guiones (`TeamIdSchema`), así que un id nunca puede salirse de la carpeta.
   - Los ficheros que no cumplen el esquema se ignoran y se avisan en el log del servidor (no tumban la lista).
   - La carpeta se configura con `buildServer({ teamsDir })`; los tests usan una temporal.
2. **Legalidad informada, no impuesta** (decisión de producto): un equipo con problemas se guarda como borrador y cada respuesta lleva sus `problems` (primero `checkTeam` de core, en español; si no hay, el validador de Showdown). Solo se exige legalidad para combatir: el servidor la comprueba al recibir `battle:start`.
3. **Modo preferido** (decisión de producto): el equipo guarda un `mode`, pero se puede usar en los dos si es legal (las reglas de equipo son las mismas; solo cambia cuántos se eligen).
4. **Esquemas en `@colleja/protocol`** (`PokemonSetSchema`, `TeamSchema`, `TeamContentSchema` y los cuerpos). Comprueban la forma y los **límites estructurales** (6 miembros, 4 movimientos, 0–32 Stat Points por stat, mote de 18 caracteres), no la legalidad.
5. **Importar es un endpoint aparte** (`POST /api/teams/import`) en lugar de una unión con `POST /api/teams`: con una unión, zod solo devuelve "Invalid input" y se pierden los errores en español.
6. **El texto importado se ajusta a los límites del editor** con `fitTeamToLimits` (core): recorta a 6 Pokémon y 4 movimientos, Stat Points a 32/66 y motes a 18, y devuelve cada ajuste (`adjustments`) para enseñárselo al usuario. Lo usan la web (importar en el editor) y el servidor (importar desde la lista).
7. **Problemas por campo**: `checkTeamIssues`/`checkSetIssues` (core) dicen a qué miembro y campo (`species`, `ability`, `item`, `nature`, `moves`, `statPoints`) pertenece cada problema, y si es del set, de una cláusula o del tamaño. `checkSet`/`checkTeam` siguen devolviendo los mismos textos a partir de ellos (sin repetir: una cláusula rota por tres miembros es un solo problema).
8. **Web**: las operaciones de edición son funciones puras en `features/teams/team-draft.ts` (como `choice-draft.ts`), y el store Zustand (`team-editor-store.ts`) solo guarda el borrador, la versión guardada y el estado de la petición. Guardado explícito, con aviso al salir con cambios (`useBlocker` y `beforeunload`).
9. **`battle:start` acepta `teamId`** como alternativa a `team` (texto), exactamente uno de los dos. El servidor lee el equipo del repositorio y lo valida.

## Alternativas descartadas

- **SQLite**: más infraestructura para pocos equipos, y los ficheros dejan de ser editables a mano. La interfaz `TeamRepository` permite cambiar más adelante.
- **Guardar solo equipos legales**: obliga a terminar un equipo de una sentada y no deja guardar el trabajo a medias.
- **Equipos ligados a un modo**: duplicaría equipos idénticos para individuales y dobles.
- **Rechazar el texto importado que no cabe**: un export clásico con `EVs: 252 Atk` no se podría ni abrir. Ajustarlo y avisar permite corregirlo en el editor.
- **Cargar learnsets y sets estándar bajo demanda**: el bundle crece de ≈1,2 MB a ≈1,5 MB (≈336 KB con gzip) con el teambuilder, aceptable en local. Queda como mejora si hiciera falta.

## Consecuencias

- Los equipos sobreviven a reinicios del servidor. Los combates siguen en memoria.
- Un equipo guardado puede quedarse ilegal si cambian las reglas (al actualizar Showdown): la lista lo marca con sus problemas y el editor muestra cuáles, sin perder nada.
- La fase 7 (rivales guardados) puede reutilizar el editor, el repositorio y los esquemas: un rival es un equipo más su dificultad.
