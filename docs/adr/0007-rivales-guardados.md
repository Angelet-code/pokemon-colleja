# ADR-0007 — Rivales guardados

- **Estado**: Aceptado (2026-10-08)
- **Guía operativa**: [docs/guias/rivales.md](../guias/rivales.md)
- **Amplía**: [ADR-0006](0006-equipos-guardados-y-teambuilder.md) (equipos guardados y teambuilder)

## Contexto

La fase 7 permite practicar contra un equipo concreto: un **rival guardado** es un equipo para el bot con su dificultad. Casi todo existía ya para los equipos del jugador (repositorio de ficheros, esquemas, editor). Había que decidir:

- si un rival es una colección aparte o un equipo marcado;
- cómo se guarda sin duplicar la escritura atómica ni la validación de ids;
- qué forma tiene un rival en el protocolo;
- cómo reutilizar el editor sin copiarlo;
- de dónde sale la dificultad al empezar un combate.

## Decisión

1. **Colección aparte** (decisión de producto): `storage/opponents/<id>.json`, con su CRUD en `/api/opponents`. Se puede crear copiando uno de tus equipos.
2. **Repositorio genérico** `FileJsonRepository<K, T, C>` (`apps/server/src/storage/json-repository.ts`). El esquema, la clave del fichero (`team`, `opponent`), la versión y el export son parámetros (`JsonFileFormat`). `FileTeamRepository` y `FileOpponentRepository` son subclases de pocas líneas. El formato de los ficheros de equipos no cambia (sigue en la versión 1) y sus tests siguen igual.
3. **Un rival es un equipo más su dificultad, en plano**: `OpponentContentSchema = TeamContentSchema.extend({ botLevel })`. El brief proponía `{ name, team: TeamContent, botLevel }`, pero eso repetiría el nombre (el del rival y el de su equipo). En plano, el editor trabaja con el mismo borrador (`TeamDraft` con un `botLevel` opcional) y el servidor reutiliza `teamProblems` y el resumen de los equipos sin adaptar nada.
4. **Solo se guarda la dificultad** (decisión de producto). La vista previa y el equipo abierto son opciones del combate, no del rival.
5. **`battle:start` con `opponent: { kind: 'saved', opponentId }`**. La dificultad sigue viniendo solo en `botLevel`: la web pone la del rival al elegirlo y el usuario la puede cambiar (decisión de producto). Así el servidor tiene una sola fuente de verdad. Un rival inexistente o ilegal da `battle:error` de tipo `team`.
6. **El editor se parametriza con un destino** (`EditorDestination` en `features/teams/editor-destination.ts`): cómo cargar y guardar, la ruta de la lista y los textos. `TeamEditorPage` recibe el destino como prop y, en el de rivales, enseña el selector de dificultad. El store guarda el destino junto al borrador.
7. **Un rival generado o copiado se abre como borrador sin guardar** (decisión de producto): no se puede combatir contra él sin guardarlo. El borrador inicial viaja en el estado de la navegación (`EditorLocationState.initial`), y el aviso de cambios sin guardar lo protege. El rival aleatorio de siempre sigue en el inicio, sin editar.
8. **Lista compartida**: `SavedListLayout`, `SavedCard` e `ImportSavedDialog` sirven a `/equipos` y a `/rivales`, y `SavedTeamPicker` elige tanto tu equipo como el rival en el inicio.

## Alternativas descartadas

- **Equipo marcado como rival**: mezcla tus equipos con los del bot en una sola lista, y la dificultad no tiene sentido en un equipo tuyo.
- **Rival anidado (`{ team, botLevel }`)**: nombre duplicado y un adaptador en cada sitio que ya sabe tratar un equipo.
- **Guardar también las opciones de práctica**: el mismo rival se practica con y sin equipo abierto; atarlas al rival obligaría a duplicarlo.
- **Combatir contra un rival sin guardarlo**: más caminos en el inicio. Para un rival improvisado sigue existiendo el "Pegado".
- **Copiar el repositorio y las rutas de equipos**: la escritura atómica y la validación de ids quedarían duplicadas.

## Consecuencias

- Una tercera colección (por ejemplo, los replays de la fase 8) solo necesita su `JsonFileFormat` y su subclase.
- Un rival puede quedarse ilegal si cambian las reglas, igual que un equipo: se marca en la lista y en el inicio, y el editor muestra por qué.
- El editor cambia de colección según la ruta. Al pasar de una a otra, el aviso de cambios sin guardar sigue funcionando porque mira el store.
