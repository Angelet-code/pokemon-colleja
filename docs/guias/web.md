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
- Marcador superior: los dos jugadores, el turno y **Deshacer**, **Rebobinar** a un turno, **Rendirse**, **Replay** y salir. El replay solo se puede descargar o **guardar** ("Guardar replay", para verlo en [Replays](herramientas.md)) al terminar, porque contiene la información oculta del rival.
- En la columna derecha, pestañas **Registro** y **Pensamiento del bot**: lo que valoró el bot en la vista previa y en cada turno ya jugado ([herramientas](herramientas.md)). En móvil, las pestañas de arriba son Combate, Registro y Bot.
- **Animaciones**: cada turno se ve acción a acción, en el orden en que pasa (ver [Animaciones de combate](#animaciones-de-combate)). El control ×1 · ×2 · No del marcador cambia la velocidad; un clic en el campo, Espacio o «Saltar animación» enseñan el turno entero al instante.
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
| `apps/web` | Inicio (`features/setup`), combate (`features/battle`: store Zustand, campo, menús, vista previa, log, barra de herramientas y animaciones en `animation/`), equipos y rivales (`features/teams`), calculadora (`features/calc`), replays (`features/replays`) y galería de animaciones (`features/animations`) |

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
- **El bot piensa mientras eliges**: cuando los dos lados eligen a la vez, la sala envía primero el turno al jugador y después decide el bot (su elección espera a la tuya). Sus decisiones sin ti (un relevo) van antes. Lo comprueba `apps/server/test/battle-room.test.ts`.
- **El servidor solo envía la perspectiva p1** y las peticiones de p1 (`BattleRoom`). Un test compara lo recibido con `getLog('p1')` y comprueba que los PS del rival llegan en porcentaje.
- El store de la web **solo cambia con mensajes del servidor**: la UI no adivina el resultado de una elección. `busy` bloquea los controles hasta la respuesta.
- Las cifras que se muestran (tipo, potencia, precisión, PP) salen de la petición y de `@colleja/data`, nunca de memoria.
- El servidor escucha en `127.0.0.1` (variables `SERVER_PORT` y `SERVER_HOST`). La web usa `WEB_PORT` (por defecto 5173). Con `npm run dev`, el servidor no sirve `apps/web/dist` (podría ser una compilación vieja): redirige las páginas a Vite (`WEB_DEV_URL`).

## Animaciones de combate

Decisión en [ADR-0020](../adr/0020-animaciones-de-combate.md). Animaciones propias, rápidas y sin dependencias: Web Animations para mover sprites y una capa Canvas 2D con un sistema de partículas propio para los efectos.

```
battle:update ─▶ cola del store ─▶ planBeats(lines) ─▶ Animator.play(beat)
                                     (timeline.ts)      ├─ animationFor(move) (catalog.ts)
                                                        ├─ playMove / switch / faint / mega… (templates.ts, player.ts)
                                                        └─ commit() → Narrator.pushAll → campo y registro
```

| Pieza | Dónde | Qué hace |
|---|---|---|
| Línea de tiempo | `features/battle/animation/timeline.ts` | `planBeats`: líneas de p1 → *beats*. Un `|move|` se agrupa con sus golpes (daño, eficacia, crítico, fallo, Protección, drenaje, retroceso) y con lo que causa sin `[from]` (subidas, estados, clima, campo); los cambios seguidos entran juntos; las líneas sin efecto (`|turn|`, `|upkeep|`…) van con el beat de al lado. Puro |
| Catálogo | `animation/catalog.ts` | `animationFor(id)`: plantilla y estilo. Firmas (`SIGNATURES`, los ~60 más usados y los que pediste), después por forma (`punch`, `bite`, `slicing`, `sound`, `pulse`, `bullet`, `wind`, `contact`, área) y por tipo y categoría. Puro |
| Elementos y gestos | `animation/elements.ts`, `animation/motions.ts` | El toque de cada tipo en los golpes (estela en el puño o el colmillo e impacto en su materia) y los gestos del cuerpo de los de estado (`agility`, `afterimage`, `shrink`, `grow`, `shell`, `dance`, `flex`, `spin`, `plot`, `spark`) |
| Plantillas | `animation/templates.ts` | 19 plantillas (`strike`, `orb`, `stream`, `beam`, `bolt`, `rings`, `wave`, `quake`, `fall`, `burst`, `aura`, `shield`, `hex`, `seed`, `side`, `field`, `support`, `clap`, `drain`) con anticipación, entrega, impacto y reposo. El impacto compartido pinta lo que pasó a cada objetivo (golpe, fallo, Protección, inmune) y hace el `commit` |
| Reproductor | `animation/player.ts` | `Animator.play(beat)`: movimientos, cambios, debilitamientos, Mega, subidas, estados, daño residual, clima, campo y habilidades u objetos revelados. Siempre hace el `commit` y deja los sprites en reposo |
| Escenario | `animation/stage.ts`, `FxLayer.tsx` | Posiciones (`data-slot`), animaciones de sprites, temblor, rótulo del movimiento y etiquetas («Supereficaz», «Atq +2»…). Monta las capas: clima detrás, efectos delante y la capa del rótulo |
| Efectos | `animation/fx/` | `engine.ts` (partículas y efectos con reloj propio, que se para sin nada que pintar), `effects.ts` (haz, torrente, rayo, tajo, onda, escudo hexagonal, retícula de Espacio Raro…), `weather.ts` (lluvia, sol, arena y nieve de fondo) y `palette.ts` (luz de cada tipo) |
| Galería | `features/animations/` | `/animaciones`: cualquier movimiento, por cualquiera y contra cualquiera, con el resultado elegido; «Recorrido» reproduce los de la revisión. Usa las mismas piezas que un combate (`gallery-lines.ts` escribe las líneas) |

Reglas:

- **Solo se retrasa lo recibido**: el store aplica las líneas al `Narrator` cuando el beat hace `commit` y la petición al acabar la actualización. Snapshot (deshacer, rebobinar, reconectar), salir y cambiar el idioma vacían la cola.
- Velocidad: preferencia `animations` de `stores/settings.ts` (`normal`, `fast`, `off`; `off` por defecto con «reducir movimiento» del sistema). Con la pestaña oculta no se anima.
- Las duraciones se escriben en las plantillas a la velocidad de ×2; ×1 las reproduce a la mitad (`ANIMATION_FACTOR`: 0,5 y 1).
- Presupuesto escrito: ≤ 700 ms por acción y ≈ 1 s los épicos (`epic` en el catálogo: potencia ≥ 120, carga o recarga, o la lista `EPIC`), que cargan antes (`bigCharge`). A ×1 se ve el doble: ≤ 1,4 s por acción, un turno de individuales ≈ 3–5 s y de dobles ≈ 5–6 s. La barra de PS baja en el impacto (`--fx-hp-ms`).
- Los que absorben (`drain` en los datos) siempre devuelven la energía al usuario, aunque no cure (con los PS al máximo no hay línea `-heal`).
- En tema claro las luces se pintan encima (`source-over`) en lugar de sumarse, para que se vean sobre el suelo claro.
- Para una firma nueva: añádela en `SIGNATURES` (o un estilo en su plantilla), revísala en `/animaciones` en los dos temas y en dobles, y mira que no pase de 700 ms escritos.

## Añadir una pantalla

1. Crea `apps/web/src/features/<nombre>/<Nombre>Page.tsx`. El estado propio va en un store Zustand junto a la pantalla; las preferencias globales, en `stores/settings.ts`.
2. Añade la ruta en `apps/web/src/app/App.tsx`.
3. Si necesita datos del servidor:
   - Añade el esquema del cuerpo y el tipo de la respuesta en `packages/protocol/src/rest.ts`.
   - Añade la ruta en `apps/server/src/routes/`.
   - Añade la llamada en `apps/web/src/lib/api.ts`.
   - Tests con `app.inject` en `apps/server/test/`.
4. Componentes con los bloques de `components/ui.tsx` y los tokens de `styles.css` (ver [Sistema de diseño](#sistema-de-diseño)), que funcionan en los dos temas.
5. Tests de componentes con Testing Library: añade `// @vitest-environment happy-dom` en la primera línea del fichero `.test.tsx`.

## Sistema de diseño

Estética de «retransmisión de torneo» ([ADR-0009](../adr/0009-sistema-de-diseno.md)): tinta casi negra, voltio para ti, magenta para el rival y tipografía condensada para cifras y títulos.

| Pieza | Dónde | Uso |
|---|---|---|
| Tokens | `src/styles.css` (`:root` claro, `.dark` oscuro) | `bg`, `surface`, `surface-2`, `surface-3`, `line`, `line-strong`, `text`, `muted`, `faint`, `accent` (relleno) + `on-accent`, `accent-fg` (acento como texto), `rival`, `good`, `warn`, `bad`, `hp-*`. En Tailwind: `bg-surface`, `text-faint`, `border-line`, `text-accent-fg`… |
| Tipos | `@fontsource/barlow` y `barlow-condensed` (importados en `main.tsx`) | `font-sans` (Barlow), `font-display` (condensada); utilidades `display` (titular) y `eyebrow` (etiqueta) |
| Forma | `styles.css` | `chamfer` (corte diagonal, solo la acción principal), `range` (deslizadores), `stage` y `platform` (campo de batalla), `rise` (entrada) |
| Componentes | `components/ui.tsx` | `Button`/`buttonClass`, `IconButton`, `Panel`, `PageHeader`, `Segmented`, `Checkbox` (interruptor), `Field`, `TextInput`, `Select`, `Chip`, `LegalityChip`, `Notice`, `Loading`, `Empty` |
| Iconos | `components/icons.tsx` | Trazo de 1,75 sobre 24 px, `currentColor`. Nunca emojis ni flechas Unicode |

Reglas:

- **No repitas cadenas de clases**: si un patrón aparece dos veces, va a `ui.tsx`. Para un `Link` con aspecto de botón, `buttonClass(variante, tamaño)`.
- **Sin textos de relleno**: nada de subtítulos que repiten el título ni *hints* obvios. Un estado es un `Chip`; una descripción larga, un `title`.
- **Contraste AA**: todo texto ≥ 4,5:1 sobre las cuatro superficies en los dos temas. Si añades un color, compruébalo en claro y en oscuro.
- **Lados**: lo tuyo usa `accent`/`accent-fg`; lo del rival, `rival`.

## Tests relevantes

| Fichero | Qué cubre |
|---|---|
| `packages/protocol/test/protocol.test.ts` | Ida y vuelta de cada mensaje y rechazo de los mal formados |
| `packages/narration/test/narration.test.ts` | Plantillas en español con gramática (artículos, "del", Mega), inglés, nombres en otro idioma, fallback y combates completos sin marcadores sin resolver |
| `apps/web/test/animation-timeline.test.ts` | Beats de turnos reales: orden, golpe en área, Protección, fallo, crítico, drenaje, Mega, ninguna línea perdida |
| `apps/web/test/animation-catalog.test.ts` | Los 511 movimientos tienen plantilla, las firmas existen y cada plantilla tiene animación |
| `apps/web/test/animation-gallery.test.ts` | La galería escribe cada movimiento como un beat de movimiento y con el resultado pedido; daño por beat |
| `apps/web/test/battle-store.test.ts` | La cola de animaciones: beat a beat, la petición al final, saltar, snapshot y sin animaciones |
| `apps/server/test/server.test.ts` | REST, un combate completo por WebSocket en cada modo contra el nivel 2, información oculta, equipos ilegales, elección rechazada, deshacer, rebobinar, reconexión, rendirse, replay y limpieza |
| `apps/web/test/*.test.ts(x)` | `ChoiceDraft`, menús de acción en dobles (objetivos, Mega, atrás, teclado, cambios forzados), vista previa, store, reglas de dependencias, el teambuilder ([su guía](teambuilder.md#tests-relevantes)) y los rivales ([su guía](rivales.md#tests-relevantes)) |
