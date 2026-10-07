# ADR-0003 — Sesión de combate síncrona sobre `Battle`; agentes y vista en `core`

- **Estado**: Aceptado (2026-10-07)
- **Guía operativa**: [docs/guias/combate.md](../guias/combate.md)

## Contexto

La fase 3 necesita una sesión de combate reutilizable por el CLI, el servidor (fase 5) y el arena de bots (fase 4), con:

- validación de equipos antes de combatir;
- protocolo separado por perspectiva (cada jugador ve sus PS exactos y los del rival en %);
- elecciones tipadas que se comprueban antes de mandarlas;
- **rebobinado** al inicio de cualquier turno y replays reproducibles.

Showdown ofrece dos formas de jugar: `BattleStream` (asíncrona, por texto, la que usa el servidor de Showdown y nuestro `tools/smoke`) y el objeto `Battle` (síncrono), que es lo que `BattleStream` envuelve por dentro.

## Decisión

1. **`BattleSession` (en `@colleja/engine`) usa directamente `Battle`**, no `BattleStream`:
   - `battle.choose(side, texto)` es síncrono y devuelve si la elección se aceptó. Cada llamada recoge la salida del callback `send` y la procesa en orden (`update` → protocolo; `sideupdate` → peticiones y errores).
   - Al acabar cada operación el estado es consistente: no hay carreras entre streams, los tests son sencillos y el arena de bots va rápido (≈40 ms por combate con bots aleatorios).
   - La separación por perspectiva (`|split|pN`) se reimplementa en `splitByPerspective` con la misma semántica que `extractChannelMessages` de Showdown.
2. **Rebobinar = reconstruir.** La sesión guarda, para cada turno, cuántas líneas de elección llevaba `battle.inputLog` al empezar (`|turn|N`). Para volver al turno N crea un `Battle` nuevo con la misma semilla y los mismos equipos y reaplica ese prefijo. Mismo resultado garantizado por el determinismo de Showdown. Al reconstruir no se emiten eventos de protocolo, solo uno final de `rewind`.
3. **Sin vista previa** se resuelve en dos partes: se quita la regla `Team Preview` (`@@@!Team Preview`) para que cada jugador solo vea su equipo, y la sesión responde automáticamente con el orden por defecto, porque el motor sigue pidiendo elegir mientras exista `pickedTeamSize`. `Open Team Sheets` se quita siempre: es una función del servidor de Showdown; nuestro "equipo abierto" consiste en pasar los sets del rival en el contexto del agente.
4. **`BattleAgent`, `AgentContext`, `Choice`, las peticiones tipadas, `getSlotOptions`/`validateChoice` y `BattleView` viven en `@colleja/core`**, no en `engine`:
   - Los bots (`@colleja/bot`) y la UI web solo pueden depender de `core` (apto para navegador), y necesitan exactamente esas piezas.
   - `engine` las usa para comprobar las elecciones antes de mandarlas; Showdown sigue siendo la autoridad final.
5. **`validateTeam` devuelve `{ ok, problems }`.** Los sets normalizados por el validador son un detalle interno del motor (`validateForBattle`) y no salen de `engine`, para no filtrar el modelo de Showdown.
6. Una elección rechazada no rompe la sesión: `choose` devuelve `{ ok: false, errors }` y la sesión sigue esperando. `[Unavailable choice]` es legítimo (depende de información oculta, por ejemplo una habilidad que atrapa y aún no se ha revelado): Showdown manda una petición nueva y el agente vuelve a elegir.

## Consecuencias

- Una sola implementación sirve para CLI, servidor, arena y tests, sin código asíncrono en el núcleo. El servidor de la fase 5 solo tiene que reenviar eventos y elecciones.
- Rebobinar cuesta reconstruir el combate desde el principio. Con combates de ≈40 ms es instantáneo; si alguna vez pesara, se puede guardar un `Battle.toJSON()` por turno como caché.
- Dependemos de la API interna de `Battle` (`choose`, `setPlayer`, `sendUpdates`, `inputLog`, callback `send`). Está aislada en `session.ts` y cubierta por tests (determinismo, rebobinado, perspectivas, elecciones inválidas).
- `tools/smoke` sigue usando `BattleStream` + `RandomPlayerAI` de Showdown a propósito: comprueba el motor tal cual, independiente de nuestro código.

## Alternativas descartadas

- **`BattleStream` en la sesión**: obliga a todo el código a ser asíncrono y a sincronizar tres streams (p1, p2 y omnisciente) para saber cuándo ha terminado de procesarse una elección. No aporta nada fuera del servidor de Showdown.
- **Rebobinar con `Battle.toJSON()` por turno**: más rápido, pero duplica estado y es más frágil ante cambios internos de Showdown. Queda como optimización futura.
- **Envolver `RandomPlayerAI` de Showdown como bot nivel 0**: depende de los streams y de Node. El port tipado (`RandomAgent`) usa `core`, funciona en el navegador y es la base de los niveles 1 y 2.
