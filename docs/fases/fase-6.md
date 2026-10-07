# Fase 6 — Teambuilder (editor de equipos con Stat Points y persistencia)

> **Brief de traspaso.** Escrito al cerrar la fase 5 (2026-10-08) para que una sesión nueva pueda empezar sin contexto previo.
> Lee antes [AGENTS.md](../../AGENTS.md) (reglas y comandos), [PLAN.md](../PLAN.md) §3.7 (persistencia) y §7.2 (teambuilder), y la [guía de la web](../guias/web.md), que explica cómo están montados el servidor y la app.
> Las decisiones de diseño son **recomendaciones**. Si al implementar encuentras algo mejor, adelante, pero documéntalo en un ADR.

## Objetivo

Crear un equipo legal **desde cero** en el navegador, guardarlo y usarlo en combate (PLAN §8: "Crear un equipo legal desde cero y usarlo en combate").

1. **Persistencia de equipos** en el servidor: `storage/teams/*.json`, detrás de un `TeamRepository`, con CRUD en `/api/teams`.
2. **Teambuilder** en la web:
   - Lista de equipos.
   - Editor de cada Pokémon: especie, habilidad, objeto, naturaleza, **Stat Points con stats en vivo**, movimientos filtrados por learnset, mote, género y shiny.
   - Validación en vivo.
   - Importar y exportar en formato Showdown.
3. **Inicio**: elegir un equipo guardado además de pegarlo.

## Punto de partida (ya hecho)

| Pieza | Qué ofrece |
|---|---|
| `@colleja/core` | `PokemonSet` y `Team` (`id`, `name`, `mode`, `ruleset`, `members`, `notes`), `parseShowdownTeam`/`formatShowdownTeam`/`formatShowdownSet`, `checkSet`/`checkTeam` (problemas en español: especie, habilidad, objeto, naturaleza, movimientos por learnset, Stat Points y cláusulas), `getStatPointLimits(mode)`, `totalStatPoints`, `remainingStatPoints`, `setStatPoint` (recorta al límite), `statPointProblems`, `championsStats(set, { species })` (también con la especie Mega), `natureModifier`, `emptyStatTable` |
| `@colleja/data` | `listSpecies('standard')` (269 seleccionables; Megas y formas de combate aparte), `getSpecies` (tipos, stats base, `abilities` (en Champions vale cualquiera, también la oculta), `gender` fijo o `null`, `megas`, `requiredItem`), `getLearnset`/`canLearn` (las Megas usan el de su forma base), `getMove` (tipo, categoría, potencia, precisión, PP de Champions), `listItems` (166, con `category`: `mega-stone`, `berry`, `gem`, `held`; las megapiedras incluyen `megaEvolutions`), `listNatures` (`plus`/`minus`), `getName(kind, id, 'es' \| 'en')`, `getDescription`, `getStandardSets(species, mode)` (≈490 en individuales y ≈460 en dobles: sirven de "sets sugeridos") y `getFormat(mode).statPoints` (66 en total, 32 por stat) |
| `@colleja/protocol` | Patrón de los esquemas REST (`ValidateTeamRequestSchema`…) y `ApiError` |
| `apps/server` | `buildServer()`, rutas en `src/routes/`, `readTeam(text, mode)` (parseo, `checkTeam` y validador de Showdown), `parseBody` con errores 400 en español. Tests con `app.inject` |
| `apps/web` | Router (`app/App.tsx`), `components/ui.tsx` (`Button`, `Panel`, `Segmented`, `Checkbox`, `RichText`), `PokemonIcon`/`PokemonSprite`, `lib/api.ts`, `stores/settings.ts` (`namesLocale`), `features/setup/TeamInput.tsx` (textarea con comprobación en vivo), tokens de color en `styles.css` para los dos temas |
| `storage/` | Carpeta local no versionada (`storage/*` en `.gitignore`, con `.gitkeep`). Los replays del CLI ya van en `storage/replays/` |

## Hechos verificados (no los redescubras)

- **Stat Points** (Champions): 66 en total y 32 como máximo por stat. Se guardan en `statPoints` y Showdown los lee de `evs`. `PS = base + SP + 75` y el resto `floor((base + SP + 20) × naturaleza)`, a nivel 50. `championsStats` ya lo calcula y está contrastado con el motor en todos los sets estándar.
- La validación definitiva es la de Showdown (`validateTeam` del motor, en el servidor). `checkTeam` de core es rápida y en español: úsala en vivo en el editor, y el servidor valida al guardar y al empezar el combate. Los mensajes del validador de Showdown están en inglés (el servidor los prefija con "Validador de Showdown:").
- Los nombres del export de Showdown son los ingleses (`formatShowdownTeam`). El import acepta el formato de Showdown, con la línea `EVs:` como Stat Points.
- La web ya lleva todos los datos en el bundle (≈1,2 MB sin comprimir; los learnsets y los sets estándar son la mayor parte). Si el editor lo hace crecer mucho, carga learnsets y sets bajo demanda (`import()` dinámico) en lugar de añadir endpoints.
- Las especies Mega no se eligen: se elige la base con su megapiedra (`getSpecies(base).megas`, `requiredItem`). Para mostrar los stats de la Mega, `championsStats(set, { species: megaId })`.
- Hay Item Clause y Species Clause (por número de Pokédex). `checkTeam` ya las comprueba.

## Diseño recomendado

### A. Persistencia (`apps/server`)

- `TeamRepository` (interfaz) con `list()`, `get(id)`, `save(team)` y `delete(id)`, y una implementación `FileTeamRepository(dir)`.
  - Un fichero por equipo: `storage/teams/<id>.json` con `{ team: Team, export: string, updatedAt }`, legible y editable a mano (PLAN §3.7).
  - Escritura atómica: escribir en un temporal y renombrar.
  - Ids `crypto.randomUUID()`.
- Rutas:
  - `GET /api/teams` (resumen: id, nombre, modo, especies, válido o no).
  - `GET /api/teams/:id`.
  - `POST /api/teams` (crear desde un `Team` o desde texto de Showdown).
  - `PUT /api/teams/:id`.
  - `DELETE /api/teams/:id`.
  - Cada respuesta incluye los `problems` del equipo.
- Esquemas en `@colleja/protocol`: `PokemonSetSchema` (forma y límites básicos; la legalidad la decide `checkTeam` o el validador), `TeamSchema` y los cuerpos y respuestas.
- `battle:start` acepta también `teamId` como alternativa a `team` (texto): el servidor lo lee del repositorio.
- La carpeta se configura en `buildServer({ teamsDir })`: los tests usan una carpeta temporal.

### B. Teambuilder (`apps/web/src/features/teams/`)

- **Rutas**: `/equipos` (lista) y `/equipos/:id` (editor). Enlace en la cabecera.
- **Lista**: tarjetas con iconos, nombre, modo y estado (válido o con N problemas), y acciones nuevo, duplicar, borrar (con confirmación), importar desde texto y "usar en combate" (va al inicio con el equipo elegido).
- **Editor**: 6 huecos (con un botón para añadir). Al elegir uno se abre su ficha:
  - **Especie**: buscador con nombres en español e inglés, icono y tipos, solo `listSpecies('standard')`. Al cambiar de especie se conservan los movimientos legales.
  - **Habilidad**: las de `species.abilities`, con su descripción.
  - **Objeto**: buscador con categorías. Las megapiedras solo para su especie, y aviso de Item Clause si otro miembro ya lo lleva.
  - **Naturaleza**: con el stat que sube y el que baja.
  - **Stat Points**: un control por stat (deslizador + número, de 0 a 32) con el total restante (66). Stats finales en vivo con `championsStats` y la naturaleza marcada. Si lleva megapiedra, también los stats de la Mega.
  - **Movimientos**: 4 buscadores filtrados por `getLearnset`, con tipo, categoría, potencia, precisión y PP.
  - Mote, género (si no es fijo) y shiny.
  - **"Cargar set sugerido"** desde `getStandardSets(species, mode)`.
  - Problemas de `checkSet`/`checkTeam` en vivo, junto al campo que los causa.
  - Importar y exportar el equipo (o un Pokémon) en texto de Showdown.
  - Guardado explícito ("Guardar") con aviso al salir con cambios sin guardar.
- **Estado**: un store Zustand del borrador. Las operaciones de edición, puras y testeables, en `team-draft.ts` (como `choice-draft.ts`).
- **Inicio**: selector "Equipo guardado / Pegar texto". Con uno guardado, `battle:start` lleva `teamId`.

## Tests mínimos

| Workspace | Tests |
|---|---|
| server | `FileTeamRepository` en una carpeta temporal (crear, listar, actualizar, borrar y escritura atómica). CRUD con `inject` (400 con cuerpo mal formado, 404 con id inexistente, problemas en la respuesta). `battle:start` con `teamId` |
| protocol | Ida y vuelta de `TeamSchema` y de los cuerpos nuevos. Rechazo de Stat Points fuera de rango o más de 4 movimientos |
| web | `team-draft` (cambiar de especie conserva los movimientos legales, `setStatPoint` respeta 66/32, megapiedra según la especie). Componentes: editor de Stat Points (total restante y stats en vivo), buscador de movimientos (solo learnset), import y export, y la lista (borrar con confirmación) |

## Criterios de "hecho"

- [ ] Desde `/equipos`, crear un equipo de 6 desde cero (sin pegar texto), verlo validado en vivo, guardarlo y, tras reiniciar el servidor, seguir teniéndolo.
- [ ] Usar ese equipo en un combate desde el inicio, en individuales y en dobles.
- [ ] Importar un export de Showdown, editarlo y exportarlo de nuevo, con la ida y vuelta intacta.
- [ ] Stats en vivo iguales a los del motor (ya garantizado por `championsStats`; un test de componente lo cubre).
- [ ] `npm run check` y la CI en verde. Guía `docs/guias/web.md` ampliada (o una nueva `teambuilder.md`).

## Decisiones de producto para preguntar al usuario (con recomendación)

- **¿Se puede guardar un equipo con problemas?** Recomendación: sí, como borrador marcado ("3 problemas"); solo se exige legalidad para combatir.
- **¿Un equipo es de un modo o vale para los dos?** Recomendación: guarda el modo preferido, pero se puede usar en ambos si es legal (las reglas de equipo son las mismas; cambia cuántos se eligen).
- **Disposición del editor.** Recomendación: lista de los 6 a la izquierda y ficha del Pokémon elegido a la derecha (como el teambuilder de Showdown). En móvil, una cosa cada vez.
- **¿Sets sugeridos de los sets estándar?** Recomendación: sí, el botón "Cargar set sugerido", porque ayuda a empezar rápido.

## Al cerrar la fase

Sigue el **protocolo de cierre de fase** de [AGENTS.md](../../AGENTS.md): docs, CHANGELOG, el brief de la fase 7 en `docs/fases/fase-7.md`, commit y push.

## Fuera de alcance de esta fase

Rivales guardados y presets de dificultad (fase 7, que reutilizará este editor), calculadora y lista de replays (fase 8), modo clásico IV/EV/Tera, compartir equipos online y E2E con Playwright.
