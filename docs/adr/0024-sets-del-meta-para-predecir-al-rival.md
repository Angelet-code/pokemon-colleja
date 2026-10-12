# ADR-0024 — Los sets del meta como prior del rival

- **Estado**: Aceptado (2026-10-12)
- **Contexto previo**: [ADR-0012](0012-deduccion-de-sets-y-estilo-del-rival.md) (deducción de sets), [ADR-0022](0022-meta-del-ladder-como-rivales.md) (el meta), [ADR-0023](0023-la-salida-no-se-aprende.md) · **Brief**: [fase 22](../fases/fase-22.md) · **Guías**: [bot](../guias/bot.md#nivel-3-qué-deduce-del-rival), [rivales](../guias/rivales.md#meta), [aprendizaje](../guias/aprendizaje.md#sets-del-meta-laddersetseval)

## Contexto

Al usuario le importa que el bot **prediga al rival**, y lo que más limita al nivel 3 es la información oculta: con equipo abierto gana bastante más que con equipo cerrado y deducción. Con equipo cerrado, `OpponentModel` suponía para cada rival los **sets estándar** de `@colleja/data` (los de los combates aleatorios de Showdown más los propios), todos igual de probables y del más ofensivo al menos. Pero desde la fase 20 tenemos las estadísticas de Smogon del ladder de Champions, que dicen qué se juega de verdad.

## Decisión

### 1. Sets del meta con su probabilidad (`@colleja/metagame`, `priors.ts`)

- Por especie, `buildSetPriors` combina las **2 habilidades, 3 objetos y 3 repartos** más usados (que sean legales) con los **4 movimientos** más usados que aprende. Smogon da cada tabla por separado, así que el peso de un set es el **producto de sus cuotas** (independencia).
- Las Megas cuentan aparte en las estadísticas (quien lleva la piedra cuenta como la Mega): entran con su piedra y la habilidad de la base, con el peso de su uso frente al de la especie. Todo va bajo la **especie base** (`salamence`, no `salamencemega`).
- Se quedan los **6 sets más probables** por especie, con los pesos normalizados a 1. Solo especies con ≥ 30 equipos. Todos pasan `checkSetIssues`.
- **Van en la instantánea** (`MetagameSnapshot.sets`, por modo), no en un fichero aparte: salen de las mismas estadísticas y se actualizan a la vez. El campo es opcional: una instantánea vieja se lee igual (sin sets, el bot usa los estándar). `GET /api/metagame` no los envía a la web (solo los usa el bot).

### 2. El bot los usa (`OpponentModel`)

- `BotOptions.setPriors` (`SetPriors`: especie base → sets con peso): **datos planos**; el bot sigue siendo apto para navegador y nunca lee disco.
- Con priors, los candidatos son los del meta **en orden de probabilidad**, filtrados por lo revelado con la misma cascada de filtros (Mega, objeto, habilidad, movimientos). En cada paso de la cascada se prueban **primero los del meta y después los estándar**. Así un movimiento raro revelado no tira los objetos del meta: se quita antes el filtro de movimientos y el movimiento visto se pone encima del set.
- `weightedCandidates` da el peso de cada candidato (1 para los estándar). La deducción del nivel 3 (`inferBeliefs`) parte de **esos pesos** en lugar de un prior uniforme. Las variantes de reparto heredan el peso del set del que salen.
- Sin priors, todo idéntico: mismas huellas en `arena:perf`.
- **«Lo más probable primero»** y no «lo más ofensivo primero»: en la prueba barata, el primero por probabilidad acierta el objeto un 78,6 % frente al 76,7 % del primero por ofensiva, y la deducción ya reparte el resto por probabilidad.
- **Los estándar no entran junto a los del meta** (`STANDARD_SHARE = 0`): dejarles un 20 % del prior perdió 3 puntos con equipos del meta y no ganó nada con aleatorios (ver la medida). Queda `BotOptions.standardShare` como gancho de medida (`arena --a-standard-share`).

### 3. Quién los pasa

- **Servidor**: al crear el bot de un combate, con la instantánea activa (`BattleRoomInfo.metagameSets` apunta cuál). Sin instantánea, o con una sin sets, los estándar.
- **Banco** (web y terminal): igual, para los dos bots. Cada combate lleva solo los priors de las especies que juegan (viaja a un hilo). `BenchSetup.metagameSets` apunta la instantánea.
- **Arena**: `--a-priors meta` / `--b-priors meta`, y `--teams meta` para jugar con los equipos del meta activo.

## La prueba barata (`npm run ladder:sets:eval`)

Antes de tocar el bot: en los replays públicos de dobles **de octubre** (posteriores a las estadísticas de septiembre: sin fuga), rating ≥ 1 500, lo que acaba revelado de cada Pokémon frente a lo que cada modelo supone **sin haber visto nada**. «1.º» es el primer candidato; «prob.» es la probabilidad que el modelo da a lo que se ve.

1 598 partidas, 12 083 Pokémon (96,4 % con sets del meta):

| Modelo | Objeto (1.º / prob.) | Habilidad (1.º / prob.) | Movimientos (1.º / prob.) |
|---|---|---|---|
| Sets estándar | 34,5 % / 41,9 % | 95,4 % / 95,8 % | 62,2 % / 62,0 % |
| **Meta (lo más probable)** | **78,6 % / 71,3 %** | 96,1 % / 95,1 % | **81,7 % / 81,3 %** |
| Meta (lo más ofensivo) | 76,7 % / 71,3 % | 96,1 % / 95,1 % | 81,6 % / 81,3 % |

5 718 objetos, 4 183 habilidades (especies con más de una, sin Mega) y 21 692 movimientos. El meta acierta **más del doble de objetos** y un tercio más de movimientos. Las habilidades ya se acertaban (casi todas las especies juegan la misma). Los repartos no se ven en un replay: los juzga la medida en el arena.

## La medida (nivel 3 contra nivel 3)

Variante: el nivel 3 con los sets del meta (`--a-priors meta`) contra el nivel 3 de hoy, en espejo (`--fixed`), dobles, 15 arenas de 80 combates por tanda: 600 pares cada una, 0 errores.

| Equipos | Tanda | Bot A gana |
|---|---|---|
| Del meta (`--teams meta`) | `t1` | **59,5 % ± 2,5** |
| Del meta | `t2` | **59,3 % ± 2,5** |
| Tus rivales guardados (`--teams rivales`, 27) | `t1` | **55,1 % ± 2,5** |
| Aleatorios (sets estándar) | `t1` | 46,6 % ± 2,5 |
| Del meta, con el 20 % del prior a los estándar | `t1` | 56,6 % ± 2,6 |
| Aleatorios, con el 20 % del prior a los estándar | `t1` | 46,9 % ± 2,4 |

- Con equipos del meta gana **≈ 9,4 puntos**, confirmado en dos tandas. Es el caso optimista: los sets de esos equipos son los más usados de las mismas estadísticas.
- Con tus rivales (sets tuyos, el caso de la web) gana **≈ 5 puntos**.
- Con equipos aleatorios pierde **≈ 3,4 puntos**. Esos equipos se montan con los propios sets estándar, así que el modelo de siempre acierta el set casi por construcción; una persona no juega así. Mezclar los estándar en el prior no lo arregla: lo que falla son sobre todo los Pokémon aún no vistos, que nada corrige hasta que salen.
- Velocidad: igual que el nivel 3 de hoy (≈ 0,65 s por decisión con 15 arenas a la vez; ≈ 0,2 s en un hilo). Sin priors, las mismas decisiones (huellas de `arena:perf`).

**Decisión del usuario (2026-10-12): activarlo siempre** que haya una instantánea del meta con sets, en los combates de la web y en el banco.

## Consecuencias

- El bot predice mejor tus sets desde el turno 0 y se ve en «Lo que cree de tu equipo»: ahora salen los sets del meta.
- **El resultado depende de la instantánea activa**: un banco apunta cuál usó (`setup.metagameSets`); compara solo bancos con la misma. Actualizar el meta regenera los sets; una instantánea anterior a esta fase no los tiene (el bot vuelve a los estándar) hasta que se actualice.
- El arena mide sin meta salvo con `--a-priors meta`/`--b-priors meta`: las cifras de referencia anteriores siguen valiendo.
- Con equipos aleatorios en el arena (sets estándar), el nivel 3 con el meta es algo peor: para medir otras variantes, usa los dos bots con el mismo modelo.
- Pendiente: la calculadora de «Calcular» desde el combate sigue suponiendo los sets estándar (la web no recibe los del meta), y los compañeros del meta todavía no predicen qué trae el rival en la vista previa.
