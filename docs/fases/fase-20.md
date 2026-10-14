# Fase 20 — El meta: rivales que se actualizan solos y un banco sin sesgo

> **Brief de la fase.** Escrito el 2026-10-12, tras cerrar la fase 19, a petición del usuario: el banco mide contra sus rivales guardados y estos **no representan el meta** (y varios se repiten). Adelanta esta fase a «la salida con lo aprendido», que pasa a ser la [fase 21](fase-21.md). Lee antes [AGENTS.md](../../AGENTS.md), la [guía del banco](../guias/banco.md), la [de rivales](../guias/rivales.md), la [de aprendizaje](../guias/aprendizaje.md), [ADR-0007](../adr/0007-rivales-guardados.md) y [ADR-0013](../adr/0013-banco-de-pruebas-con-hilos.md).

## Objetivo

1. Una sección **«Meta»** en los rivales, **de solo lectura**, que se regenera con datos reales (equipos con su arquetipo y su **peso** = frecuencia en el meta), aparte de **«Mis rivales»** (los de hoy, editables).
2. Que el banco pueda medir **«Contra el meta»** con el total **pesado por frecuencia** (el % esperado contra el meta), el desglose por arquetipo y los peores enfrentamientos. «Contra mis rivales» sigue como hoy.

## Decisiones del usuario (2026-10-12)

- Rivales en **dos secciones**: «Mis rivales» (editables) y «Meta» (no se tocan; se pueden **copiar** a «Mis rivales» y se puede combatir contra ellos).
- Se actualiza con **botón «Actualizar meta» en la web y comando** (`npm run meta:update`), nunca solo al arrancar (red, VPN, reproducibilidad). Avisa si hay un mes nuevo.
- Meta = estadísticas de Smogon con **corte 1760** (no Bo3: menos combates).
- Va **antes** de la salida con lo aprendido.

## Punto de partida (verificado el 2026-10-12)

- **Sesgo de hoy**: el banco pesa **igual cada rival** (`stratifiedEstimate`, `packages/bench/src/stats.ts`) y el reparto de Neyman también usa pesos iguales. De los 27 rivales guardados, 26 son de dobles y 1 de individuales (aleatorio). 17 parejas comparten ≥ 4 especies y 7 comparten 5 (p. ej. «Uso 1», «Fuerte 3» y «Fuerte 5»: Garchomp, Raichu, Rillaboom y Volcarona).
- **Frente al ladder** (6 009 replays de `datasets/ladder/`, ≥ 1400, % de equipos que lo llevan en la vista previa): Rillaboom 62 % en los rivales / 41 % en el ladder, Raichu 38 / 19, Garchomp 35 / 23, Gholdengo 31 / 17; en cambio Charizard 4 / 22, Golisopod 4 / 21, Farigiraf 12 / 22 y Tyranitar 4 / 10.
- **Smogon publica estadísticas de Champions cada mes**: `https://www.smogon.com/stats/<AAAA-MM>/chaos/<formato>-<corte>.json` con `gen9championsvgc2026regmc` (dobles) y `gen9championsbssregmc` (individuales), cortes 0/1500/1630/1760 y variantes `…bo3`. En 2026-09, dobles a 1760: 1,63 M combates. Por especie: `usage`, `Raw count`, `Abilities`, `Items`, **`Spreads`** (`Naturaleza:hp/atk/def/spa/spd/spe` en **Stat Points**), `Moves`, `Teammates` (de dos en dos) y `Checks and Counters`. Los nombres son de Showdown (`Salamence-Mega`, `Indeedee-F`…). Las cifras de `Abilities`/`Items`/`Moves`/`Spreads` son recuentos ponderados: normaliza por especie.
- Smogon **no da equipos de 6**: solo compañeros por pares. Los **replays** sí (`|poke|p1|…` de la vista previa), y `tools/ladder` ya sabe descargarlos (≤ 1 petición/s, reanudable).
- Rivales: `OpponentRepository` sobre `FileJsonRepository` (`storage/opponents/<id>.json`, `{ version, updatedAt, opponent: { name, mode, ruleset, members, botLevel } }`). Banco: `BenchConfig.opponents: BenchOpponent[]`, estratos = rival × modo, `BenchSummarySchema` (protocol) replica `BenchSummary`.
- Es el meta del **ladder de Showdown**, no el del juego. Las listas de torneos con hojas abiertas serían «lo que se juega de verdad», pero no está comprobado que haya una fuente reproducible: fuera de alcance salvo que sea trivial.

## Diseño recomendado

Si te apartas de esto, escribe un ADR (ADR-0022).

### 1. Instantánea del meta (`tools/meta`, solo Node)

- `npm run meta:update -- --month 2026-09 --cutoff 1760 [--teams 30]`: descarga los dos `chaos` del mes (dobles e individuales; por defecto el último mes publicado) y usa los replays de `datasets/ladder/` (si faltan o son viejos, ofrece `ladder:fetch -- --from-newest`).
- **Equipos**: los grupos de 6 especies de los replays (formas mega normalizadas a su base) agrupados por **núcleo** (p. ej. 4 de 6 en común) → arquetipos con su frecuencia. De cada arquetipo, el equipo más representativo (el medoide). Se quedan los N más frecuentes; el **peso** de cada uno es la frecuencia de su arquetipo (renormalizada). En individuales, igual con replays de `bssregmc` si hay suficientes; si no, equipos construidos con `Teammates` (codicioso desde las especies más usadas) y dilo en el ADR.
- **Sets**: para cada especie, lo más usado de `chaos`: habilidad, objeto, reparto + naturaleza, y los 4 movimientos más usados que sean legales juntos. **Como mucho una megapiedra efectiva por combate**: si el equipo lleva dos megas, las dos piedras (como en el ladder), igual que el teamgen. Cada equipo **pasa por el validador** de Showdown en su modo; si no es legal, se corrige con la siguiente opción más usada o se descarta (y se cuenta en el informe).
- **Nombres**: «Meta · <arquetipo>» con las dos especies más características y el clima o control de velocidad si lo hay (reutiliza `readTeam`/arquetipos de `analysis/team-read.ts`: situaciones, no especies).
- Determinista: mismos ficheros de entrada → misma instantánea (test con fixtures recortados, sin red).
- Guarda `storage/meta/<AAAA-MM>-<corte>/` con `snapshot.json` (fuente, mes, corte, combates, fecha) y un fichero por equipo (`{ name, mode, members, weight, archetype }`). La instantánea **activa** es la última; las anteriores se conservan (los bancos guardados apuntan a la suya).

### 2. Servidor y web

- `MetaRepository` (solo lectura para la API, sobre `FileJsonRepository`) y `GET /api/meta` (instantánea activa y sus equipos), `POST /api/meta/update` (lanza la actualización; progreso y errores de red con mensaje claro, p. ej. VPN), `POST /api/meta/:id/copy` (lo copia a «Mis rivales»).
- **Rivales**: dos secciones con `Segmented` («Mis rivales» · «Meta»). En «Meta»: chip con el mes, el corte y el peso de cada equipo; sin editar ni borrar; botones «Copiar a mis rivales» y «Combatir». El combate contra un equipo del meta: `opponent: { kind: 'meta', snapshotId, teamId }` (nuevo en protocol, con su test de ida y vuelta); la dificultad la elige el usuario (por defecto el nivel 3).
- Botón «Actualizar meta» con su estado (y el aviso «hay un mes nuevo» si `GET /api/meta` lo detecta al abrir la sección, con una petición a Smogon como mucho una vez al día).

### 3. Banco «Contra el meta»

- `BenchOpponent.weight?` (por defecto igual) y `stratifiedEstimate` con **pesos** (normalizados por modo y después igual entre modos); el reparto de Neyman, con los mismos pesos (`n_h ∝ w_h·σ_h`). Test: con pesos iguales, el resultado de hoy idéntico (mismo resumen con la misma semilla).
- Web y terminal: rivales = «Mis rivales» (como hoy) o «Meta» (`--opponents meta`). El resumen guarda la instantánea usada; en el historial, solo se comparan bancos con la misma instantánea (o se avisa).
- Resultado: el total pesado (% esperado contra el meta), una tabla por arquetipo (peso, %, ±) y **los 3 peores enfrentamientos**.
- Opcional: en «Mis rivales», marcar sus duplicados (≥ 5 especies en común) como aviso en el banco.

## Tests

- `tools/meta`: con un `chaos` y unos replays recortados en `tools/meta/test/fixtures/` (sin red), la instantánea es determinista, los pesos suman 1 por modo, todos los equipos son legales, como mucho las megas permitidas y los nombres no dependen del orden de entrada.
- `stats.ts`: estimación y Neyman con pesos; pesos iguales = resultado de hoy.
- Banco: con `--opponents meta`, el total usa los pesos (`InlineRunner`, pocos combates).
- Servidor: la sección «Meta» no se puede modificar (`PUT`/`DELETE` → 405/404), copiar crea un rival nuevo editable; combatir contra un equipo del meta solo envía la perspectiva p1 (como siempre). Los tests usan carpetas temporales (`tempMetaDir()`).
- Protocol: `opponent.kind = 'meta'` de ida y vuelta.
- E2E: abrir «Meta», copiar un equipo a «Mis rivales» (con una instantánea fixture en `STORAGE_DIR`; sin red).

## Criterios de «hecho»

- `npm run meta:update` genera la instantánea de 2026-09 a 1760 en los dos modos; cifras en el ADR-0022 (cuántos equipos, cuánto del meta cubren, cuántos se descartaron).
- El banco «Contra el meta» con un equipo del usuario, en la web y en la terminal, y una comparación con «Contra mis rivales» en el CHANGELOG (¿cambia el orden de las variantes?).
- `npm run check` y `npm run e2e` en verde; CI en verde. Docs (guías de rivales y banco, AGENTS, PLAN, README) y el brief de la fase 21 al día.

## Fuera de alcance

- Datos del juego real o listas de torneos (salvo una fuente reproducible trivial).
- Sets por variantes (más de un set por especie) y predecir el meta: un set, el más usado.
- La salida con lo aprendido ([fase 21](fase-21.md)) y elegir 4 de 6.
- Usar el meta para el bot (p. ej. que `OpponentModel` suponga sets del meta en lugar de los estándar): muy prometedor para que **prediga al rival**, candidata a la fase siguiente.
