# Fase 18 — Animaciones de combate

> **Brief de la fase.** Escrito el 2026-10-12 a petición del usuario y cerrado el mismo día (resultado al final, en «Criterios de “hecho”»). Es independiente de la [fase 17](fase-17.md) (solo toca `apps/web`) y se puede hacer antes, después o en paralelo.
> Lee antes [AGENTS.md](../../AGENTS.md), la [guía de la web](../guias/web.md) (sobre todo «Sistema de diseño»), [ADR-0005](../adr/0005-servidor-web-y-narracion.md), [ADR-0009](../adr/0009-sistema-de-diseno.md) y [ADR-0020](../adr/0020-animaciones-de-combate.md).

## Objetivo

Que el combate **se vea**: quién se mueve primero y quién después, qué ataque usa cada uno y qué le pasa al objetivo (daño, eficacia, crítico, fallo, Protección, curación, estados, cambios de características, clima, campo, cambios, debilitamientos y Mega Evolución). Las animaciones tienen que ser **rápidas** y **bonitas**, al nivel de un juego bien acabado y no de una demo.

## Decisión del usuario (2026-10-12)

1. **Animaciones propias por plantillas** (opción 2 de las tres propuestas), sin portar las de Showdown ni añadir librerías de terceros.
2. **Rápidas**: no quiere esperar. Mejor rápidas que lentas, y con opción de ir más rápido.
3. **Bien hechas**: con calidad de verdad (anticipación, impacto y partículas con la luz del tipo), no un destello genérico. Quiere ver Hidrobomba, Surf, Lanzallamas, Protección y Drenadoras reconocibles a la primera.
4. Sustituye a la decisión de la fase 5 («animaciones mínimas», [fase-5.md](fase-5.md)).

## Punto de partida

- `battle-store.ts` recibe las líneas del protocolo de p1 en cada `battle:update` y las aplica **todas a la vez** (`narrator.pushAll`): el campo salta al estado final del turno.
- `Field.tsx` pinta el escenario (`.stage`, plataformas, `PokemonSprite`, `HpCard`). Las únicas animaciones son la anchura de la barra de PS (500 ms) y la opacidad al debilitarse.
- `styles.css` ya anula transiciones y animaciones con `prefers-reduced-motion`.
- El visor de replays (`replays/ReplayViewerPage.tsx`, `replay-steps.ts`) salta de turno en turno sin animación.

## Hechos verificados (2026-10-12)

- `@colleja/data` tiene **511 movimientos** con todo lo que necesita una plantilla: `type`, `category`, `target` (`normal` 347, `self` 60, `allAdjacentFoes` 23, `allAdjacent` 16, `all` 18, `allySide` 8, `foeSide` 4…), `flags` (`contact`, `punch`, `bite`, `slicing`, `sound`, `pulse`, `bullet`, `wind`…), `drain`, `recoil`, `multihit`, `selfSwitch` y `priority`.
- Los **60 movimientos más usados** en los sets estándar (por número de sets) empiezan así: Protección (298), Desarme, A Bocajarro, Danza Espada, Terremoto, Psíquico, Rayo, Ida y Vuelta, Respiro, Llamarada, Fuego Fatuo, Plancha Corporal, Sorpresa, Maquinación, Onda Trueno, Paz Mental, Bola Sombra, Otra Vez, Lanzamugre, Vozarrón, Pájaro Osado, Poltergeist, Bomba Lodo, Trampa Rocas, Roca Afilada, Cometa Draco, Cabeza de Hierro, Puño Drenaje, Avalancha, Envite Ígneo, Onda Ígnea, Onda Certera, Fuerza Lunar, Brillo Mágico, Tierra Viva, Danza Dragón, Hidrobomba, Golpe Cuerpo, Viento Hielo, Pulso Umbrío, Golpe Bajo, Espacio Raro, Fuerza Equina, Viento Afín, Hidroariete, Carantoña, Voltiocambio, Doble Filo, Recuperación, Viraje, Corpulencia, Escaldar, Triturar, Rayo Hielo, Psicocarga, Mofa, Latigazo, Energibola, Cuerpo Pesado y Defensa Férrea. El script de esta cuenta está en el ADR.
- La web no tiene dependencias de animación. Web Animations API (`element.animate`) y Canvas 2D están en todos los navegadores que usamos (y en Chromium de Playwright). En happy-dom no existen: la lógica que se testea tiene que ser pura.
- Las líneas que llegan son solo las de p1: animar a partir de ellas **no revela nada** que el registro no diga ya.

## Diseño recomendado

Ver [ADR-0020](../adr/0020-animaciones-de-combate.md). Si te apartas de esto, actualiza el ADR.

### 1. Del protocolo a una línea de tiempo (puro, con tests)

`apps/web/src/features/battle/animation/timeline.ts`: `planTurn(lines) → Beat[]`.

- Un **beat** es un bloque de líneas que se enseña de golpe al terminar su animación, con su **señal** (`Cue`): `move` (quién, a quién, movimiento, en área o no, fallo, bloqueado por Protección), `hit` (objetivo, % de PS perdido, eficacia, crítico), `heal`, `drain`, `status`, `boost`/`unboost`, `switch-in`/`switch-out`/`drag`, `faint`, `mega`, `weather`, `terrain`, `field` (Espacio Raro…), `side` (Viento Afín, pantallas, Trampa Rocas), `reveal` (habilidad u objeto que se activa) y `none`.
- Un `|move|` se agrupa con sus consecuencias inmediatas (`-damage`, `-supereffective`, `-crit`, `-miss`, `-activate|…|Protect`, `-heal` de drenaje, retroceso) hasta la siguiente acción mayor: así el golpe y la bajada de PS van en el mismo beat.
- Las líneas sin animación (`|t:|`, `|request|`, `|upkeep|`…) se pegan al beat siguiente: nunca cuestan tiempo.
- Las posiciones se nombran con el `ident` del protocolo (`p2a`, `p1b`), y el campo las expone con `data-slot` para medirlas.

### 2. Del movimiento a una plantilla (catálogo puro, con tests)

`animation/catalog.ts`: `animationFor(moveId) → MoveAnimation` (plantilla y parámetros). Se resuelve en este orden:

1. **Firma propia** para los más usados y los que el usuario nombró (lista inicial: los 60 de arriba más Surf, Lanzallamas, Drenadoras, Detección, Reflejo, Pantalla de Luz, Velo Aurora, Danza Lluvia, Día Soleado, Tormenta de Arena, Paisaje Nevado, Refuerzo, Señuelo, Polvo Ira y Sustituto).
2. **Por forma** (flags y objetivo): `punch` (puño con estela), `bite` (mandíbulas), `slicing` (tajo en arco), `sound` (anillos), `pulse` (onda), `bullet` (proyectil), `wind` (ráfaga), `contact` (embestida), ataques en área (onda que barre el lado rival o todo el campo), `self` (aura), `allySide`/`foeSide` (efecto de lado).
3. **Por tipo y categoría**: especial a distancia (haz o proyectil), físico (embestida con impacto) o de estado (aura del color del tipo).

Test: **los 511 movimientos** resuelven a una plantilla, ninguna lanza error y el catálogo no repite claves.

### 3. Motor de efectos (navegador)

`animation/stage.ts` y `animation/fx/`:

- **Sprites y tarjetas con Web Animations API**: embestida (anticipación con *squash*, avance y vuelta), retroceso al recibir, parpadeo de golpe, temblor, salida y entrada con destello, caída al debilitarse y Mega con halo y silueta blanca.
- **Una sola capa `<canvas>`** sobre el escenario para partículas, haces, ondas y estelas: sistema de partículas propio y reutilizable (sin reservar memoria en cada frame), mezcla aditiva (`lighter`) para la luz, ajustado a `devicePixelRatio`, y con un bucle `requestAnimationFrame` que **se detiene cuando no hay nada que pintar**.
- **Paleta por tipo** (`animation/palette.ts`): núcleo, brillo y sombra de cada tipo, derivados de `lib/type-colors.ts` (la única excepción permitida a los tokens, igual que los colores de tipo).
- **Clima y campo persistentes**: lluvia, sol, arena y nieve de fondo muy sutiles mientras duren, y un tinte del escenario con Espacio Raro. Siempre detrás de los sprites y sin tapar las tarjetas de PS.

### 4. Dirección de arte (lo que hace que se vea bien)

- **Lectura primero**: al empezar cada acción, un **rótulo con el nombre del movimiento** entra desde el lado del que lo usa (voltio para ti y magenta para el rival, como el resto de la web). Es lo que dice de un vistazo quién se movió antes.
- **Anticipación → acción → impacto → reposo**: cada plantilla tiene las cuatro fases. El impacto lleva un **parón de golpe** (40–80 ms), un **fotograma de impacto** (silueta blanca del objetivo) y un **temblor** proporcional al % de PS perdido.
- **Eficacia y crítico se ven**: supereficaz con impacto más grande y una etiqueta corta; poco eficaz, impacto apagado; crítico con destello en estrella; fallo con el objetivo apartándose y el proyectil pasando de largo; Protección con un escudo hexagonal que se ilumina donde choca.
- **La barra de PS baja en el impacto**, no antes, y a la velocidad elegida.
- **Curvas de movimiento propias** (`ease-out` rápido para entrar, un *overshoot* corto para los rebotes) en tokens de `styles.css`, no curvas lineales.
- Nada de texto de relleno: los únicos textos son el rótulo del movimiento y las etiquetas de eficacia.

### 5. Duración y control

- Ajuste **«Animaciones»** en `stores/settings.ts`: `normal` · `rápidas` (×0,5) · `no` (instantáneo). Con `prefers-reduced-motion`, por defecto `no`.
- Presupuesto en `normal`: **≤ 700 ms por acción** (la mayoría 450–600 ms), cambios ≤ 350 ms, debilitamiento ≤ 400 ms. Un turno de individuales cabe en ≈ 1,5 s y uno de dobles en ≈ 2,5–3 s.
- **Saltar**: un clic en el escenario (o `Espacio`) termina el turno al instante. Elegir una acción, deshacer, rebobinar o reconectar también vacía la cola.
- Si la pestaña está oculta, la cola se aplica sin animar.

### 6. Store: lo recibido y lo enseñado

- El store sigue cambiando **solo con mensajes del servidor**: la animación solo **retrasa enseñar** las líneas que ya llegaron, nunca adivina nada.
- `battle:update` deja las líneas nuevas en una **cola**; el reproductor (`animation/player.ts`) las aplica beat a beat al `Narrator`, así que el campo **y el registro** avanzan al mismo paso que la animación.
- El panel de acciones aparece cuando la cola se vacía (el bot ya piensa mientras tanto en el servidor, así que no se pierde tiempo). `battle:snapshot` y el cambio de idioma cancelan la cola y aplican todo.
- Tests (happy-dom, con un reproductor falso que termina cada beat al momento): el orden de los beats, que el registro avance con ellos, que saltar aplique todo y que un snapshot cancele la cola.

### 7. Visor de replays y galería

- En el visor, **avanzar un turno lo anima**; saltar a otro turno, no.
- **Galería** (`/animaciones`, fuera del menú): elige movimiento, quién lo usa y contra quién, individuales o dobles, velocidad y repetición. Sirve para revisar todas las plantillas sin jugar y para el **punto de control con el usuario**.

### Orden de trabajo

1. Línea de tiempo, store con cola y rótulo del movimiento, embestida y golpe genéricos. Ya se ve quién va antes.
2. Motor de partículas, paleta por tipo y plantillas por forma. Galería.
3. **Revisión con el usuario en la galería** (Hidrobomba, Surf, Lanzallamas, Protección, Drenadoras, Terremoto, A Bocajarro, Sorpresa, Espacio Raro) antes de hacer el resto de firmas.
4. Firmas propias, clima y campo, Mega y debilitamientos. Ajuste de tiempos.
5. Visor de replays, ajuste «Animaciones» y E2E.

## Tests

- `apps/web/test/animation-timeline.test.ts`: logs reales de individuales y dobles (de los fixtures del motor) → beats esperados. Orden por velocidad, golpe en área a dos objetivos, Protección que bloquea, fallo, crítico, drenaje, debilitamiento y cambio forzado.
- `apps/web/test/animation-catalog.test.ts`: los 511 movimientos tienen plantilla y las firmas existen en `@colleja/data`.
- `apps/web/test/battle-store.test.ts` (o el que corresponda): cola, saltar, snapshot y cambio de idioma.
- `tools/e2e/specs/`: los E2E siguen en verde. Fijan `Animaciones: no` para no depender de tiempos y hay uno nuevo que juega un turno con `rápidas` y comprueba que el panel de acciones aparece al terminar.
- Rendimiento a mano, en la galería con DevTools: 60 fps en un turno de dobles con clima, sin tareas largas (> 50 ms).

## Criterios de «hecho»

- ✅ Se ve quién actúa primero y qué movimiento usa en cada acción, en los dos modos (rótulo del movimiento, orden de beats; test de la línea de tiempo con turnos reales).
- ✅ Los 511 movimientos animan con una plantilla coherente con su tipo y su forma (test), y los de la lista de firmas tienen la suya (92 firmas).
- ✅ Revisión del usuario (paso 3): le gustaron y pidió más variedad. Se añadieron golpes elementales, absorber desde el rival, carga de los épicos y gestos del cuerpo en los de estado (recorrido «Variaciones» de la galería).
- ✅ Presupuesto de tiempo cumplido a ×1 (≤ 700 ms por acción; turnos de 1,5–3 s); ×2 y «No» funcionan; saltar es inmediato.
- ✅ La animación no cambia lo que manda el servidor ni lo que se ve al final del turno (tests de la cola del store).
- ✅ Sin dependencias nuevas en `apps/web`. El rótulo y las etiquetas usan tokens, con contraste AA en los dos temas.
- ✅ `npm run check` (437 tests) y `npm run e2e` (8) en verde.
- ✅ Docs: CHANGELOG, AGENTS, PLAN, README, guía de la web y ADR-0020.

## Fuera de alcance

- Sonido.
- Animaciones de los sprites en sí (GIF o sprites animados): se siguen usando los estáticos.
- Portar las animaciones del cliente de Showdown.
- Animar la vista previa de equipos o el teambuilder.
