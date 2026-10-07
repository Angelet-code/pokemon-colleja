# Guía: servidor y app web

Cómo se juega en el navegador y cómo está montado. Las decisiones de arquitectura están en [ADR-0005](../adr/0005-servidor-web-y-narracion.md). El editor de equipos, los rivales guardados y las herramientas de práctica tienen sus guías: [teambuilder](teambuilder.md), [rivales](rivales.md) y [herramientas](herramientas.md).

## Uso

```bash
npm run dev       # servidor (127.0.0.1:3001) + web con Vite (http://127.0.0.1:5173)
npm run build     # compila la web en apps/web/dist
npm start         # compila la web y la sirve desde el servidor (http://127.0.0.1:3001)
```

En la pantalla de inicio:

1. Elige el modo.
2. Elige tu equipo:
   - **Guardado**: uno de los que creaste en **Equipos** ([teambuilder](teambuilder.md)). Vale para los dos modos si es legal.
   - **Pegado**: en formato export de Showdown, o pulsa "Equipo aleatorio". La línea `EVs:` son los Stat Points de Champions.
3. Elige el rival: aleatorio, **guardado** (uno de tus [rivales](rivales.md); se aplica su dificultad, que puedes cambiar) o pegado.
4. Elige la dificultad y las opciones de práctica: vista previa, equipo abierto, nombre y semilla.

La web recuerda el último equipo y las opciones (`localStorage`).

En el combate:

- Los menús salen de la petición del motor: movimientos con tipo y PP, Megaevolucionar, objetivos en dobles (posición por posición, con "← Atrás") y cambios.
- **Teclado**: 1–4 movimientos (u objetivos al apuntar), 5–9 cambios, Esc atrás.
- Barra superior: **Deshacer**, **Rebobinar a…** un turno, **Rendirse** y **Replay**. El replay solo se puede descargar o **guardar** ("Guardar replay", para verlo en [Replays](herramientas.md)) al terminar, porque contiene la información oculta del rival.
- Bajo los controles, **"¿Por qué hizo eso el bot?"**: lo que valoró el bot en cada turno ya jugado ([herramientas](herramientas.md)).
- Pantalla final: revancha (misma configuración, otra semilla), replay o volver al inicio.
- **Nombres ES/EN** en la cabecera: cambia el idioma de los nombres; la interfaz y el log siguen en español. También se puede cambiar el tema (oscuro o claro).
- Si recargas la página o se corta la conexión, la web vuelve a engancharse al combate mientras el servidor siga arrancado.

Los sprites se sirven desde `assets/sprites/` (`npm run data:sprites`). Sin ellos, la web muestra las iniciales.

## Arquitectura

```
apps/web (React)  ──REST /api/*──▶  apps/server (Fastify)
        │          ◀─WebSocket /ws─▶   BattleManager → BattleRoom
        │                                 ├─ BattleSession (engine) · p1 = jugador
        │                                 └─ createBot (bot)        · p2 = bot
        └─ core (BattleView, getSlotOptions, checkTeam) · narration (log) · protocol (zod)
```

| Pieza | Qué hace |
|---|---|
| `@colleja/protocol` | Esquemas zod de los mensajes WebSocket y REST, y sus tipos. `parseClientMessage` valida lo que llega del navegador (errores en español) |
| `@colleja/narration` | `Narrator`: líneas del protocolo → entradas del log (`turn`, `major`, `minor`, `end`) con las plantillas de Showdown en español o inglés, más un `BattleView` actualizado. Nombres para mostrar (`speciesName`, `moveName`…). Lo usan la web y el CLI |
| `apps/server` | `buildServer()` (sin escuchar, para los tests) y `main.ts`. REST: `GET /api/meta`, `POST /api/teams/validate`, `POST /api/teams/random` y el CRUD de equipos y rivales guardados (`/api/teams` y `/api/opponents`, ver [teambuilder](teambuilder.md) y [rivales](rivales.md)). WebSocket `/ws`. Sirve `/sprites/*` y, si existe, `apps/web/dist` |
| `apps/web` | Inicio (`features/setup`), combate (`features/battle`: store Zustand, campo, menús, vista previa, log y barra de herramientas) equipos y rivales (`features/teams`), calculadora (`features/calc`) y replays (`features/replays`) |

### Mensajes

| Cliente → servidor | Servidor → cliente |
|---|---|
| `battle:start` (modo, equipo en texto **o** `teamId` de uno guardado, rival aleatorio, pegado o guardado (`opponentId`), nivel, opciones, semilla, nombre) | `battle:started` (id, jugadores, tus sets y los del rival con equipo abierto) |
| `battle:choose` (`Choice` de core) | `battle:update` (líneas nuevas de p1, petición actual, `status`) |
| `battle:undo` · `battle:rewind` (turno) | `battle:snapshot` (log completo, petición, `status`) |
| `battle:forfeit` · `battle:export` · `battle:resume` | `battle:replay` (al terminar) · `battle:error` (`team`, `choice`, `state`, `not-found`, `message`, `internal`) |

`status` lleva el turno, los turnos a los que se puede rebobinar, a cuál iría "deshacer", si ha terminado y quién ganó.

### Reglas

- **La web solo importa paquetes aptos para navegador** (`core`, `data`, `protocol`, `narration`). Nunca `engine`, `showdown` ni módulos `node:`; lo comprueba `apps/web/test/dependencies.test.ts`.
- **El servidor solo envía la perspectiva p1** y las peticiones de p1 (`BattleRoom`). Un test compara lo recibido con `getLog('p1')` y comprueba que los PS del rival llegan en porcentaje.
- El store de la web **solo cambia con mensajes del servidor**: la UI no adivina el resultado de una elección. `busy` bloquea los controles hasta la respuesta.
- Las cifras que se muestran (tipo, potencia, precisión, PP) salen de la petición y de `@colleja/data`, nunca de memoria.
- El servidor escucha en `127.0.0.1` (variables `SERVER_PORT` y `SERVER_HOST`). La web usa `WEB_PORT` (por defecto 5173).

## Añadir una pantalla

1. Crea `apps/web/src/features/<nombre>/<Nombre>Page.tsx`. El estado propio va en un store Zustand junto a la pantalla; las preferencias globales, en `stores/settings.ts`.
2. Añade la ruta en `apps/web/src/app/App.tsx`.
3. Si necesita datos del servidor:
   - Añade el esquema del cuerpo y el tipo de la respuesta en `packages/protocol/src/rest.ts`.
   - Añade la ruta en `apps/server/src/routes/`.
   - Añade la llamada en `apps/web/src/lib/api.ts`.
   - Tests con `app.inject` en `apps/server/test/`.
4. Componentes con los bloques de `components/ui.tsx` y los tokens de color de `styles.css` (`bg-panel`, `text-muted`, `border-border`, `text-accent`…), que funcionan en los dos temas.
5. Tests de componentes con Testing Library: añade `// @vitest-environment happy-dom` en la primera línea del fichero `.test.tsx`.

## Tests relevantes

| Fichero | Qué cubre |
|---|---|
| `packages/protocol/test/protocol.test.ts` | Ida y vuelta de cada mensaje y rechazo de los mal formados |
| `packages/narration/test/narration.test.ts` | Plantillas en español con gramática (artículos, "del", Mega), inglés, nombres en otro idioma, fallback y combates completos sin marcadores sin resolver |
| `apps/server/test/server.test.ts` | REST, un combate completo por WebSocket en cada modo contra el nivel 2, información oculta, equipos ilegales, elección rechazada, deshacer, rebobinar, reconexión, rendirse, replay y limpieza |
| `apps/web/test/*.test.ts(x)` | `ChoiceDraft`, menús de acción en dobles (objetivos, Mega, atrás, teclado, cambios forzados), vista previa, store, reglas de dependencias, el teambuilder ([su guía](teambuilder.md#tests-relevantes)) y los rivales ([su guía](rivales.md#tests-relevantes)) |
