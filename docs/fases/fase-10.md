# Fase 10 — Pulido de herramientas y nivel 3 más fuerte en individuales

> **Brief de traspaso.** Escrito al empezar la fase 10 (2026-10-08), a partir de la propuesta de ampliaciones que cerró la fase 9 (el usuario eligió las opciones **A** y **B**). Lee antes [AGENTS.md](../../AGENTS.md), [ADR-0008](../adr/0008-herramientas-de-practica.md) y [ADR-0010](../adr/0010-bot-experto-con-sandbox.md).

## Objetivo

1. **A. Pulido de las herramientas de práctica**: abrir la calculadora desde un combate, críticos y más efectos en la calculadora, renombrar replays y tests E2E de los flujos principales.
2. **B. Nivel 3 más fuerte en individuales**: ≥ 65 % contra el nivel 2 en individuales (≥ 600 combates) sin pasar de ~1 s de media por decisión, y sin empeorar en dobles.

## Decisiones de producto (2026-10-08)

- **«Abrir en la calculadora»** abre `/calculadora` en una **pestaña nueva**, precargada con tu Pokémon activo atacando al del rival (PS, estado, cambios de características, Mega) y el campo (clima, campo, pantallas del rival). El combate no se toca. Con equipo cerrado, el rival lleva lo visto más su set estándar (lo mismo que supone el bot); con equipo abierto, su set real.
- **E2E con Playwright**: comando aparte (`npm run e2e`, descarga Chromium la primera vez) y un job propio en la CI. `npm run check` no cambia.
- **Nivel 3**: media de **≤ ~1 s por decisión** (máximo acordado: ~3 s).

## Punto de partida (verificado)

- Calculadora: `POST /api/calc` con `estimateDamage` de `@colleja/bot` (`apps/server/src/routes/calc.ts`); estado en `apps/web/src/features/calc/calc-store.ts`, persistido en `localStorage` (`colleja:calc`). Esquemas en `packages/protocol/src/calc.ts`.
- `estimateDamage(attacker, defender, move, field)` traduce a `@smogon/calc` (`toCalcSide`, `toCalcField`), con caché por contenido (`calcKey`, `fieldKey`). `@smogon/calc` admite `Move({ isCrit })` y, por lado, `isHelpingHand`, `isFriendGuard`; en el campo, `isGravity`, `isMagicRoom`, `isWonderRoom` (ya leídos de `pseudoWeather`).
- Combate en la web: `battle:started` trae `team` (tus sets) y `opponentTeam` (solo con equipo abierto); `BattleView` (core) da del rival especie, PS en %, estado, cambios, objeto/habilidad/movimientos revelados y Mega; el campo y las condiciones de cada lado.
- El modelo del rival del bot es `OpponentModel` (`packages/bot/src/analysis/opponent-model.ts`): solo depende de `core` y `data`. Importarlo desde la web por el índice de `@colleja/bot` arrastraría `@smogon/calc` al bundle.
- Replays: `ReplayContentSchema.name` ya existe; no hay ruta para cambiarlo. `FileJsonRepository` tiene `update`.
- Nivel 3: `searchMoves` (`packages/bot/src/search/lookahead.ts`), hoja = balance de PS × 100 + 0,5 × cambio esperado por el nivel 2 (`outlook`), que solo mira el activo y el siguiente de la cadena contra el rival en el campo: **ignora el banquillo rival**. Relevos y vista previa son del nivel 2. Referencia: 61,8 % en individuales (602 combates), 78,6 % en dobles.

## Diseño

### A. Herramientas

1. **Calculadora**:
   - `CalcRequest` gana `crit` (golpe crítico) y en el campo `helpingHand` y `friendGuard` (solo dobles), `gravity`, `magicRoom` y `wonderRoom`. `estimateDamage` acepta `{ crit }` (y entra en la clave de la caché); `FieldState` gana `sideEffects` para Mano Amiga y Compiescudo. El bot no los usa.
   - La web muestra los nuevos controles en «Campo» y el interruptor «Crítico».
2. **Abrir en la calculadora** (`features/calc/from-battle.ts`, puro y testeado): construye el estado de la calculadora desde `BattleView`, tu equipo y el del rival si es abierto. El set supuesto del rival sale de `OpponentModel`, exportado aparte (`@colleja/bot/opponent-model`) para no arrastrar la calculadora al bundle. Botón «Calcular» en el marcador del combate; en dobles, un menú con las parejas (tu activo → rival activo). Escribe el estado en el store (persistido) y abre `/calculadora` en una pestaña nueva.
3. **Renombrar replays**: `PATCH /api/replays/:id` con `{ name }` (`RenameReplayRequestSchema` en protocol) y la acción «Renombrar» en la lista y en el visor.
4. **E2E** (`tools/e2e`, `@colleja/e2e`, Playwright): el servidor de producción (`npm run build` + servidor) con carpetas de `storage` temporales (variable de entorno nueva `STORAGE_DIR` del servidor), bot de nivel 0. Flujos: combate completo (vista previa, movimientos, rendirse, guardar replay), teambuilder (importar, editar, guardar), replays (renombrar, ver, borrar), calculadora (crítico) y «Calcular» desde el combate.

### B. Nivel 3 en individuales

- Medir con un arena paralelo (varias semillas, ≥ 600 combates por variante) y apuntar cada variante en el CHANGELOG.
- Primera idea: **hoja con el equipo entero**: una cadena de duelos de equipo completo (`analysis/team-chain.ts`: los activos se enfrentan con daño esperado y, al caer uno, su lado saca su mejor respuesta al superviviente) con los Pokémon que quedan de los dos lados en el fork (el rival como se supone). Se mezcla con el balance de PS.
- Si no basta: relevos forzosos con búsqueda (sandbox también en peticiones de cambio), reparto adaptativo de muestras, o el modelo de respuestas del rival.
- Si no se llega al 65 %, **averiguar qué falla** antes de rebajar el objetivo (decisión del 2026-10-08).

## Tests

- `estimateDamage` con crítico y los efectos nuevos (contra `@smogon/calc` directamente); la caché distingue crítico.
- `POST /api/calc` con los campos nuevos; `PATCH /api/replays/:id` (200, 400, 404).
- `from-battle.ts`: individuales y dobles, equipo cerrado (lo visto + set estándar, nada oculto) y abierto (set real), Mega, PS, estado y campo.
- Web: renombrar en la lista; menú «Calcular».
- Bot: `teamChainValue`; los tests del nivel 3 (invariancia, determinismo) siguen en verde.
- E2E: los flujos de arriba.

## Criterios de "hecho"

- [x] `npm run check` en verde y `npm run e2e` en verde en local y en la CI.
- [x] Calculadora con crítico, Refuerzo (Mano Amiga), Compiescolta, Gravedad, Zona Mágica y Zona Extraña.
- [x] «Calcular» en el combate abre la calculadora precargada en otra pestaña sin filtrar información oculta.
- [x] Replays renombrables.
- [~] Nivel 3 ≥ 65 % contra el 2 en individuales: 65,8 % en la semilla de validación (600 combates), ≈ 64,4 % en 1800 combates con tres semillas; 0,54 s de media; dobles 81,3 % (antes 78,6 %). Cerrado así por decisión del usuario ([ADR-0011](../adr/0011-nivel-3-con-equipo-completo.md)).
- [x] Documentación: CHANGELOG, PLAN, AGENTS, README, guías (herramientas, bot) y ADR-0011; brief de la fase 11.

> **Estado**: ✅ cerrada el 2026-10-08. Resultados y lo aprendido en el [CHANGELOG](../../CHANGELOG.md).

## Fuera de alcance

- Modo clásico IV/EV/Tera, PWA, estadísticas de uso, bot en un hilo de trabajo (opciones C–F de la propuesta).
