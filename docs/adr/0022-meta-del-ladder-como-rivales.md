# ADR-0022 — El meta del ladder como rivales y banco pesado

- **Estado**: Aceptado (2026-10-12)
- **Contexto previo**: [ADR-0007](0007-rivales-guardados.md), [ADR-0013](0013-banco-de-pruebas-con-hilos.md), [ADR-0019](0019-valoracion-aprendida-de-replays.md) · **Brief**: [fase 20](../fases/fase-20.md) · **Guías**: [rivales](../guias/rivales.md#meta), [banco](../guias/banco.md#contra-el-meta)

## Contexto

El banco medía un equipo contra los rivales guardados del usuario, **todos con el mismo peso** (`stratifiedEstimate`). Esos rivales no representaban el meta, y además varios se repetían. De los 26 de dobles, 17 parejas comparten 4 especies o más y 7 comparten 5. Comparados con 6 009 replays de dobles (rating ≥ 1400), sobraban Raichu-Y y Garchomp-Z (Rillaboom 62 % frente a 41 %, Raichu 38 % frente a 19 %) y faltaban el sol de Charizard (4 % frente a 22 %), Golisopod (4 % frente a 21 %) y Farigiraf (12 % frente a 22 %). Afinar un equipo con ese banco era afinarlo contra un meta inventado.

El usuario decidió (2026-10-12):

- Los rivales tienen **dos secciones**: «Mis rivales», editables, y **«Meta»**, de solo lectura y regenerable.
- El meta sale de las **estadísticas de Smogon con corte 1760**.
- Se actualiza con **un botón y un comando**, nunca al arrancar.
- Esta fase va **antes** que la salida con lo aprendido, que pasa a ser la fase 21.

## Decisión

### 1. De dónde sale el meta (`@colleja/metagame`, solo Node)

- **Sets**: el `chaos` mensual de Smogon (`https://www.smogon.com/stats/<mes>/chaos/<formato>-1760.json`). En septiembre de 2026 recoge 1,63 M combates en dobles y 69 000 en individuales. De cada especie se toma lo más usado que sea legal en Champions (`@colleja/data`):
  - La habilidad.
  - El objeto, sin repetir (Item Clause).
  - El primer reparto que cabe en los límites de Stat Points (66 en total, 32 por stat).
  - Los 4 movimientos más usados que aprende.

  Smogon cuenta como Mega al Pokémon que lleva su piedra (`Salamence-Mega`). La Mega se monta como la especie base con la piedra y con la habilidad de la base, porque Intimidación actúa antes de megaevolucionar.
- **Equipos de dobles: replays** (`|poke|` de la vista previa, rating ≥ 1500, los 4 000 equipos más recientes). Smogon solo da compañeros de dos en dos y los replays dan equipos de seis reales.
  - **Arquetipos**: equipos que comparten **4 de 6** especies con un equipo central, que es el que más equipos sin asignar tiene a esa distancia (codicioso y determinista; un grupo necesita al menos 3 equipos).
  - Cada arquetipo se representa con **su equipo central, que es real**, y **pesa lo que su grupo**.
  - La Mega de cada miembro se supone si se lleva como Mega en al menos la mitad de los casos (como mucho 2 por equipo, igual que `teamgen`).
- **Equipos de individuales: compañeros**. No hay replays de BSS con rating alto: en una muestra de 400 replays recientes ninguno pasaba de 1400, porque los buenos jugadores no los publican.
  - Cada equipo crece desde una especie muy usada. En cada paso añade la más probable dados **todos** los miembros que ya tiene, como si cada uno informara por separado (Bayes ingenuo: `log P(c) + Σ log(P(c | m) / P(c))`).
  - Con la media simple de `P(c | m)` todos los equipos acababan con el mismo núcleo (Salamence, Gholdengo, Primarina). Con Bayes ingenuo hay 24 equipos distintos.
  - Se descartan los equipos que comparten 5 especies con uno ya elegido.
  - El peso es el uso de la especie de partida. Es aproximado y se dice en la interfaz.
- Cada equipo **pasa por el validador** (`teamProblems`); si no es legal, se toma el siguiente candidato y se cuenta como descartado.
- **Nombres en español**: el arquetipo leído como lo lee el nivel 3 (Espacio Raro, Viento Afín, lluvia, sol, arena o nieve; `readMembers`/`archetypeStrength` de ADR-0017) y dos miembros clave. Primero van las Megas, y en individuales la especie de partida. Ejemplo: «Lluvia · Mega-Golisopod + Mega-Swampert».
- **Determinista**: las mismas estadísticas y los mismos replays dan la misma instantánea, sea cual sea el orden de entrada (test).
- La descarga de replays (`fetchReplays`, `FolderReplayStore`) se **mueve de `tools/ladder` a `@colleja/metagame`**, porque la usa también el servidor. Gana `until`: completar con los más nuevos hasta el último guardado, sin tocar el cursor de `ladder:fetch`.

### 2. Dónde se guarda

- `storage/metagame/<mes>-<corte>.json`: **un fichero por instantánea** con todos sus equipos, en lugar de uno por equipo como decía el brief (una instantánea se lee y se compara entera). `{ version, updatedAt, snapshot }`, como el resto de `storage/`.
- **Un solo escritor**: `FileMetagameStore` de `@colleja/metagame`, que usan el comando y el servidor (que no puede depender de `tools/`). La escritura es atómica (fichero temporal y renombrado). La activa es la del mes más reciente y, dentro del mes, la de corte más alto. Las anteriores se conservan para el historial del banco.

### 3. Servidor y web

- `GET /api/metagame`: la instantánea activa con sus equipos, su peso y su legalidad, cacheados por instantánea.
- `POST /api/metagame/update`: arranca la actualización en segundo plano, una a la vez (409 si ya hay una); la web consulta el estado cada 1,5 s.
- `GET /api/metagame/latest`: el último mes de Smogon, cacheado un día. `METAGAME_LATEST=off` lo apaga en los E2E.
- `POST …/teams/:id/copy`: copia un equipo a «Mis rivales». **No hay `PUT` ni `DELETE`**.
- En combate, el rival es `opponent: { kind: 'metagame', snapshotId, teamId }`.
- Rivales: `Segmented` «Mis rivales · Meta» (`?seccion=meta`). La pantalla de inicio gana el rival «Meta».

### 4. Banco pesado

- `BenchOpponent` gana `weight` (1 por defecto) y `modes` (un equipo del meta solo juega en su modo); `Stratum` gana `weight`.
- `stratifiedEstimate` **normaliza los pesos** (por defecto iguales). El reparto de Neyman reparte con `w² σ² / (n (n + 1))`. Con pesos iguales, el resultado es **idéntico** al de antes (test).
- Petición: `opponentIds` **o** `metagame: { snapshotId }`, exactamente uno de los dos. El `setup` guarda la instantánea y el peso de cada rival; el historial marca los bancos contra el meta (`metagameId`).
- El resultado enseña el peso de cada rival y **«Donde más pierdes»**: los rivales con mayor peso × derrotas, en puntos del total.
- En la terminal: `npm run bench -- --opponents meta` (o `meta:<id>`).

## Resultado (septiembre de 2026, corte 1760)

`npm run meta:update` tarda ≈ 40 s con 30 replays nuevos (≈ 1 s por replay más; 300 por defecto).

| Modo | Fuente | Equipos | Cubren | Descartados |
|---|---|---|---|---|
| Dobles | 4 000 equipos de replays (≥ 1500) | 24 | 68 % de los equipos | 0 |
| Individuales | Compañeros (sin replays) | 24 | — | 0 |

En dobles aparecen el sol de Charizard (5 equipos con Mega-Charizard Y), la lluvia de Golisopod y Swampert, Espacio Raro con Farigiraf y Gardevoir, y arena con Tyranitar. El más común es Mega-Floette con Rillaboom (13,6 %).

**Contra mis rivales frente a contra el meta** (dobles, nivel 2 contra 2, 20 combates por rival, semilla `f20`):

| Equipo | Contra mis rivales (26) | Contra el meta (24, pesado) |
|---|---|---|
| Collejas pingüi | 59,2 % ± 3,7 | **46,9 % ± 4,7** |
| Collejas pingüi (Bellibolt) | 58,8 % ± 3,8 | **45,1 % ± 5,1** |
| Viento Ninja | 45,4 % ± 3,7 | **38,4 % ± 4,6** |

El orden de los tres equipos es el mismo, pero **contra el meta todos bajan entre 7 y 14 puntos**: los rivales guardados eran más fáciles que el meta real. Donde más puntos pierden, los tres empiezan por **Mega-Floette + Rillaboom** (13,6 % del meta: Collejas pingüi gana el 30 % y pierde 9,5 puntos del total ahí), seguido de Viento Afín con Mega-Salamence y Mega-Raichu Y (Collejas pingüi), la lluvia de Golisopod y Swampert (Bellibolt, 0 %) y Espacio Raro con Golisopod y Charizard (Viento Ninja). Ninguno de esos arquetipos estaba bien representado en los rivales guardados.

## Consecuencias

- El banco puede medir **contra lo que se juega**, con cada arquetipo pesado por su frecuencia. «Mis rivales» sigue sirviendo para preparar enfrentamientos concretos.
- Es el meta del **ladder de Showdown**, no el del juego. Con corte 1760 es el de los mejores jugadores del ladder.
- En individuales, los equipos son plausibles pero no reales y sus pesos son aproximados. Si algún día hay replays de BSS con rating alto, se usarán sin tocar nada: `MIN_SAMPLES` decide.
- Un set por especie: no hay variantes del mismo Pokémon en el meta.
- Queda propuesto que el bot suponga los sets del meta en lugar de los estándar, para predecir mejor al rival.
