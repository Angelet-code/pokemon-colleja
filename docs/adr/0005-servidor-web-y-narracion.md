# ADR-0005 — Servidor, web y narración del combate

- **Estado**: Aceptado (2026-10-08)
- **Guía operativa**: [docs/guias/web.md](../guias/web.md)

## Contexto

La fase 5 lleva el combate al navegador: un servidor Node local con el motor y el bot, y una app web React que habla con él. El plan (PLAN §3.4 y §4) suponía que la web reconstruiría el estado del combate con `@pkmn/client` y que el log se escribiría con `@pkmn/view`. Había que decidir además:

- la forma de los mensajes;
- cómo garantizar que el jugador no recibe información oculta;
- cómo se escribe el log en español.

### Spike de `@pkmn/client` (2026-10-07)

Se probó contra 80 combates reales del motor (15.592 líneas).

- **A favor**: con `new Generations(Dex, () => true)` procesa todo sin errores y reconoce las 55 Megas que aparecieron. Por defecto las filtra, porque las marca como `Future`.
- **En contra**:
  - Sus datos de movimientos son los de Escarlata/Púrpura: 434 de 511 difieren de Champions (PP), y 21 en potencia, precisión o tipo.
  - `@pkmn/dex` pesa ≈1,8 MB y duplica `@colleja/data`.
  - `LogFormatter` (`@pkmn/view`) lleva las plantillas en inglés empaquetadas, sin forma de cambiarlas.

## Decisión

1. **Estado en el cliente: `BattleView` de `core`**, no `@pkmn/client`. Es apto para navegador, ya lo usan los bots y el CLI y está alineado con nuestros datos. La web lo reconstruye con las líneas de la perspectiva p1. Los datos propios (PS exactos, PP, objeto, habilidad) salen de la petición. Las cifras que se muestran (tipo, potencia, precisión) salen de `@colleja/data`.
2. **Narración: port de `BattleTextParser` del cliente oficial de Showdown** (MIT) en un paquete nuevo, `@colleja/narration`, apto para navegador y compartido por la web y el CLI.
   - Las plantillas de `data/text` (inglés y español, con su gramática: artículos, género, forma "classified" de los objetos) se exportan con el pipeline a `packages/data/generated/text/`.
   - Los 27 huecos en español que importan se completan en `packages/data/overrides/battle-text.es.json`. Los demás caen al inglés campo a campo.
   - Los nombres salen de nuestra i18n (los mismos que ve la UI), en un idioma que puede ser distinto del de las plantillas: el selector ES/EN cambia los nombres, y el log sigue en español.
   - Ajustes propios del port:
     - Contracción "de el/a el" → "del/al".
     - Sin artículo delante de los nombres de los jugadores.
     - El nombre de la forma Mega (la línea `-mega` solo trae la especie base).
     - Porcentaje de daño calculado con `BattleView`.
3. **Protocolo (`@colleja/protocol`, zod)**:
   - Los mensajes del cliente se validan estrictamente.
   - El servidor responde a cada acción con un único `battle:update` (líneas nuevas, petición actual y `status`).
   - Tras deshacer, rebobinar o reconectar envía un `battle:snapshot` (log completo).
   - Un cliente sin estado propio es más simple y no puede desincronizarse.
4. **Información oculta en el servidor**: la sala (`BattleRoom`) solo reenvía la perspectiva `p1` del protocolo y las peticiones de p1. El replay, que lleva el log omnisciente, **solo se puede descargar cuando el combate ha terminado**. Un test lo comprueba línea a línea: lo recibido es igual a `getLog('p1')` y los PS del rival llegan solo en porcentaje.
5. **Combates en memoria**, uno por socket:
   - Se puede reconectar (`battle:resume`) mientras el servidor siga vivo. El id se guarda en `sessionStorage` y sobrevive a una recarga de la página.
   - Los combates sin jugador conectado durante 30 minutos se descartan.
   - Persistirlos no compensa todavía.
6. **Rendirse**: `BattleSession.forfeit(side)` usa `Battle.lose` de Showdown. No queda en el input log, así que rebobinar "deshace" la rendición.
7. **Servidor solo en `127.0.0.1`**, sin autenticación (uso local). Usa sus propias variables de entorno (`SERVER_PORT`, `SERVER_HOST`), porque las herramientas que arrancan servidores de desarrollo suelen fijar `PORT` para la web.

## Consecuencias

- La web no depende de `@pkmn/*` y el bundle solo lleva nuestros datos (≈1,2 MB sin comprimir, ≈300 KB con gzip). Si `BattleView` necesita seguir algo nuevo (volátiles, turnos restantes), se amplía en `core` con tests, y lo aprovechan también los bots.
- La narración es tan completa como el cliente de Showdown: en 240 combates narrados (ambos lados, ambos idiomas) no queda ningún marcador sin resolver.
- Al actualizar Showdown, `npm run data:build` trae las plantillas nuevas. Si una override deja de corresponder a un efecto conocido, el build falla.
- `parseCondition` (core) entiende ahora el color de la barra de PS que Champions añade justo al 20 % y al 50 % (`50/100y`). Antes daba `NaN` y afectaba también a los bots.
