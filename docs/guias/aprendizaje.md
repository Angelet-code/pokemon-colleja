# Guía: valoración aprendida de replays

Desde la fase 17 ([ADR-0019](../adr/0019-valoracion-aprendida-de-replays.md), [brief](../fases/fase-17.md)) el proyecto aprende a valorar posiciones de combate a partir de **partidas reales de Champions** (los replays públicos de Showdown), en lugar de sumar más reglas a mano. La valoración es un **modelo por factores de partida**: explicable, con un peso por factor y sin especies.

En la fase 17 se midió si merecía la pena (la «prueba barata»). Desde la [fase 19](../fases/fase-19.md) ([ADR-0021](../adr/0021-valoracion-aprendida-en-la-busqueda.md)) el nivel 3 la usa en dobles para valorar las hojas de su búsqueda (con su posición exacta, `ownPosition`) y para explicar qué factor decidió cada jugada (ver la [guía del bot](bot.md#valoración-aprendida)).

## Flujo

```bash
npm run ladder:fetch       # descarga replays de dobles (≥ 1400 de rating) a datasets/ladder/
npm run ladder:positions   # cada turno de cada replay → factores, desde los dos lados
npm run ladder:train       # entrena el modelo y lo guarda en packages/bot/src/learning/models/
npm run ladder:eval        # la prueba barata: ¿acierta el ganador mejor que el balance de PS?
```

- **`datasets/`** es local y no se versiona (como `storage/`, pero no son tus datos: se pueden volver a descargar). El modelo entrenado (`value-v<N>.json`, unos pocos KB) **sí se versiona**.
- **Nada de red en el check**: los tests usan un replay recortado a mano (`tools/ladder/test/fixtures/`, con los jugadores renombrados) y un `fetch` falso.

### Descarga (`ladder:fetch`)

- Recorre `https://replay.pokemonshowdown.com/search.json?format=…&before=…` (páginas de 51) y baja cada replay de `/<id>.json`, **como mucho una petición por segundo**, con una cabecera `User-Agent` propia.
- **Reanudable**: no baja lo que ya tiene y guarda en `.cursor` hasta dónde llegó; la siguiente tanda sigue con replays más antiguos (`--from-newest` empieza por los nuevos). Reintenta los fallos pasajeros del servidor.
- Opciones: `--limit 5000` (por tanda), `--min-rating 1400`, `--format`, `--interval`.
- Si falla con `SEC_E_UNTRUSTED_ROOT`, es la VPN del equipo: desactívala y vuelve a lanzar.
- Los replays de individuales (`gen9championsbssregmc`) son aún muy pocos (≈ 3 000–6 000 en total).

### Posiciones (`ladder:positions`)

- `tools/ladder/src/positions.ts`: lee el log de cada replay con `BattleView` y, al empezar cada turno, saca la posición **desde cada lado**, con lo que sabía un espectador hasta ese momento.
- Los sets de los dos lados se suponen como el bot supone los del rival (`OpponentModel`: el set estándar que encaja con lo revelado hasta ese turno). En combate, el bot conocerá su propio set exacto: es la única diferencia entre las posiciones de las que aprende y las que valorará.
- Los que solo se vieron en la vista previa cuentan con el peso de los huecos sin ver (si llevó 4 y han salido 2, cada uno de los otros 4 de la vista previa pesa ½).
- Salida: `datasets/ladder/positions-v<FEATURES_VERSION>.jsonl`, una línea por posición y lado (`id`, `turn`, `side`, `rating`, `won`, `x`).

### Entrenar y medir (`ladder:train`, `ladder:eval`)

- **División por partida** (80/20, sembrada): nunca se entrena con un turno y se evalúa con otro de la misma partida.
- `ladder:eval` compara con las mismas posiciones: siempre 50 %, **solo el balance de PS** (lo que domina hoy `positionValue`), PS y vivos, y todos los factores. Da log-loss, acierto y calibración en varias divisiones (`--seeds`), por tramo de turno y de rating, la tabla de calibración y los pesos.
- `ladder:train` entrena con la división `--seed` (por defecto `s1`) y guarda el modelo con sus metadatos: partidas, fechas, ratings, métricas de prueba y la referencia.

## Factores (`packages/bot/src/learning/features.ts`)

Reglas:

- **Situaciones, nunca especies ni nombres de movimiento**: un Pokémon entra solo por lo que significa en esa posición (su velocidad con el campo actual, su daño con `estimateDamage`, sus tipos). Si un update cambia stats o el meta, los factores se recalculan con los datos nuevos y el modelo sigue valiendo. Incluso Sorpresa se reconoce por lo que hace (prioridad +3, retroceso seguro y poca potencia). Lo comprueba `packages/bot/test/features.test.ts` (Meowstic y Meowstic-F con el mismo set dan los mismos factores; subir la Velocidad cambia quién se mueve antes).
- **Desde un lado**: positivo es bueno para ese lado y **0 es neutro**. Visto desde el otro lado, los factores simétricos cambian de signo y los «a favor»/«en contra» se intercambian.
- **Con versión** (`FEATURES_VERSION`): si cambias un factor, súbela; las posiciones y el modelo se regeneran con su número.
- Apto para navegador: **el bot usará la misma función en combate**.

| Factor | Qué mide |
|---|---|
| `hp`, `alive`, `fieldHp` | PS y Pokémon en pie de cada equipo (con los que no han salido) y PS en el campo |
| `fieldSpeed`, `teamSpeed` | Quién se mueve antes, en el campo y contando el banquillo, con el campo actual (Espacio Raro, Viento Afín, clima, parálisis, mejoras, Pañuelo Elección) |
| `trickRoom`, `tailwind`, `screens` | Turnos que quedan de Espacio Raro (a favor de quien sea más lento), Viento Afín y pantallas (`EffectTimers`, `learning/timers.ts`) |
| `weather` | El clima actual lo puso alguien de su equipo |
| `koFor`, `koAgainst`, `koFirstFor`, `koFirstAgainst` | Rivales en el campo que tumba de un golpe (≥ 50 %) y suyos que el rival tumba; y lo mismo moviéndose antes |
| `damageFor`, `damageAgainst` | Parte de los PS de cada rival en el campo que se lleva su mejor golpe, y al revés |
| `answers` | Rivales a los que alguien suyo gana en un duelo rápido (golpes para tumbar y quién se mueve antes) |
| `boosts`, `status`, `mega`, `fakeOut` | Mejoras de características en el campo, problemas de estado, Mega aún disponible y Sorpresa disponible |

## Modelo (`packages/bot/src/learning/value-model.ts`)

- **Regresión logística** con regularización L2, entrenada con el método de Newton: unas decenas de factores convergen en pocos pasos y siempre igual.
- La valoración es una **suma**: `explainValue` da la contribución exacta de cada factor y `counterfactual` cuánto cambia la valoración sin uno (llevado a 0). Son la base de las explicaciones comprobadas: una razón solo se enseña si quitarla cambia la decisión.
- Los pesos se guardan en `packages/bot/src/learning/models/value-v<N>.json` con su versión de factores. El bot usa el de `learning/shipped-model.ts` (`VALUE_MODEL`): si subes `FEATURES_VERSION`, regenera el modelo y cambia esa importación, y vuelve a medir el nivel 3 en espejo.
- Cada factor tiene su `reason` (`FEATURES`): la frase de partida que se enseña cuando ese factor decide una jugada.

## Salidas (`ladder:leads`)

Fase 21 ([ADR-0023](../adr/0023-la-salida-no-se-aprende.md)):

- `npm run ladder:leads` saca de cada replay la **posición de salida** de cada lado: las dos parejas al empezar el turno 1, el grupo propio conocido (del replay entero) y del rival su salida y su vista previa. Los factores son los de `learning/lead-features.ts` y van a `datasets/ladder/leads-v<N>.jsonl`.
- `npm run ladder:leads:eval` (`-- --seeds 10 --min-rating 1500`) entrena cuatro modelos (duelos de la salida, grupos, grupos más duelos y todos) y los compara con el 50 %, con varias divisiones por partida y curva de aprendizaje.
- **Resultado**: nada predice al ganador en el turno 1 (log-loss 0,6930 frente a 0,6931). Por eso la salida del bot no se aprende de replays.

## Sets del meta (`ladder:sets:eval`)

Fase 22 ([ADR-0024](../adr/0024-sets-del-meta-para-predecir-al-rival.md)): `npm run ladder:sets:eval` (`-- --min-rating 1500 --after 2026-10-01`) compara, sin haber visto nada de cada rival, lo que suponen los sets estándar y los del meta activo (`MetagameSnapshot.sets`) con lo que acaba revelado en los replays: objeto, habilidad y movimientos, con el primer candidato y con la probabilidad que el modelo da a lo visto. Usa replays posteriores al mes de las estadísticas para que no haya fuga. Resultado con el meta de 2026-09: objeto 78,6 % frente a 34,5 %, movimientos 81,7 % frente a 62,2 %, habilidad igual.

## Qué trae el rival (`ladder:bring:eval`)

Fase 23 ([ADR-0025](../adr/0025-que-trae-el-rival-no-importa.md)): `npm run ladder:bring:eval` (`-- --split 2026-10-01 --min-rating 1500`) toma de cada replay la vista previa de seis de cada lado y los cuatro que trajo (solo los lados cuyos cuatro llegaron a salir). Ajusta los predictores con los replays anteriores a `--split` y los prueba con los posteriores: uniforme, por especie (lo que se trae cada una), por posición en la vista previa, especie + posición y especie + compañeros de salida. Dos preguntas: los 4 de 6 antes del combate y los 2 de atrás una vez vista la salida. Resultado: antes del combate casi nada (71,3 % frente a 68,8 %); tras la salida, 61,7 % frente a 51,7 %. Pero el techo en el arena (`--a-oracle`) es ≈ 0, así que el bot no lo usa.

## ¿Más datos?

Curva de aprendizaje (fase 19, misma división de prueba): log-loss 0,559 con 500 partidas, 0,551 con 1 000, 0,550 con 2 000 y 0,546 con 4 000 (`s1`; igual en `s2` y `s3`). Con estos 20 factores **el modelo está saturado desde ≈ 1 000 partidas**: descargar más replays no lo mejora. Lo que puede mejorarlo son factores nuevos que la prueba barata justifique o posiciones de autojuego del propio bot.
