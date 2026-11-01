# ADR-0026 — El nivel 2 entiende los movimientos de estado que se juegan

- **Estado**: Aceptado (2026-11-01)
- **Contexto previo**: [ADR-0004](0004-bot-por-simulacion.md) (nivel 2 por simulación), [ADR-0010](0010-bot-experto-con-sandbox.md) (nivel 3 con sandbox) · **Brief**: [fase 24](../fases/fase-24.md) · **Guía**: [bot](../guias/bot.md#qué-modela-la-simulación-nivel-2)

## Contexto

El usuario montó equipos en torno a Intercambio (Wyrdeer con otro Pokémon con Intimidación: −2 de Ataque por turno; Sableye con Bromista y Mr. Rime con Antibarrera junto a Incineroar) y el nivel 3 no usó Intercambio ni una vez en 6 combates.

La causa: el nivel 3 solo busca entre las 12 mejores parejas del nivel 2 (`rankedOptions`), y las respuestas del rival también son las mejores del nivel 2 desde su lado. `DoublesSim` valoraba a 0 todo movimiento de estado que no fuera de los suyos (mejoras propias, estados, curación, Viento Afín, Espacio Raro, Refuerzo, Señuelo, pantallas). Con los sets del meta, **el 19 % del uso de movimientos de estado** caía ahí: Vasta Guardia, Otra Vez, Última Palabra, Danza Lluvia, Llanto Falso, Mofa, Pulso Cura, Canto Mortal, Intercambio… Lo que el nivel 2 no entiende nunca llega al sandbox, aunque Showdown lo valoraría bien. Y el bot tampoco conocía Intimidación (ni al entrar) ni la prioridad de Bromista.

## Decisión

Corregir el modelo del nivel 2 (como pide ADR-0004), no añadir bonificaciones. En `DoublesSim` (dobles), con tablas en `move-knowledge.ts`:

- **Cambios de stats al objetivo** (`TARGET_BOOST_MOVES`): Última Palabra, Rugido de Guerra, Encanto, Llanto Falso, Chirrido, Onda Anómala… al rival, y Decoración, Motivación y Niebla Aromática al aliado. Las bajadas que causa un rival pasan por sus reacciones: Respondón las invierte, Cuerpo Puro y Humo Blanco las paran, Corte Fuerte y Sacapecho paran la suya, Coraza Reflejo las devuelve, Competitivo (+2 Ataque) y Tenacidad (+2 Ataque Especial) responden.
- **Habilidades que se mueven** (`ABILITY_MOVES`): Intercambio, Imitación y Danza Amiga cambian `ability` (el daño ya la usa: Energía Pura o Potencia se pasan solas) y **las habilidades que llegan se activan** como en Showdown (primero la del objetivo): Intimidación, Antibarrera (quita las pantallas de los dos lados, `Situation.withoutScreens`) y las de clima. Las que no se pueden mover (`FIXED_ABILITIES`) no se mueven.
- **Entradas**: Intimidación, Antibarrera y clima también al cambiar en el turno 1. Intimidación respeta Fuerza Mental, Despiste, Ritmo Propio, Intrépido, Perro Guardián (+1 Ataque) y Cobardía.
- **Bromista**: +1 de prioridad a los de estado; falla contra rivales de tipo Siniestro.
- **Bloqueos**: Protección (movimientos con `protect`), Cuerpo Áureo, Espejo Mágico (con `reflectable`; se modela como fallo, no como rebote).
- **Vasta Guardia y Anticipo** paran los ataques en área y los de prioridad ese turno; **Danza Lluvia** y compañía cambian el clima (`situation.withWeather`); **Pulso Cura** cura la mitad; **Otra Vez** bloquea al rival en su último movimiento (si es de estado o Protección, no hace nada los turnos siguientes).
- Lo que sigue sin modelar está en `UNMODELLED_STATUS_MOVES` con su motivo (Mofa, Truco, Canto Mortal, Sustituto, Relevo, trampas…). Un test exige que cada movimiento de estado de los sets estándar esté en un sitio o en el otro.
- **Ajuste de medida** `SEARCH_SETTINGS.statusModel` (1; `Situation.statusModel`): con 0, el modelo de antes, con **las mismas decisiones** (huellas de `arena:perf`, 12 combates de dobles). El arena gana `--b-settings` para enfrentar la variante al nivel 3 de antes. El nivel 2 (y las explicaciones de la salida) lo usan siempre.

## Medidas

Nivel 3 con el modelo contra el nivel 3 con `statusModel: 0`, los dos con los sets del meta, dobles, espejo (`--fixed`), 15 arenas en paralelo:

| Tanda | Equipos | Pares | Nivel 3 con el modelo |
|---|---|---|---|
| `t1` | Meta | 600 | 49,2 % ± 2,3 |
| `t2` | Meta | 600 | 50,2 % ± 2,5 |
| `t3` | «Doble Intimidación» contra «Intercambio (PC)» | 300 | 51,8 % ± 2,4 |

- Con equipos del meta, **empate** (≈ 49,7 % con 1 200 pares): entender estos movimientos no le da fuerza medible en general.
- Con los equipos del usuario que giran en torno a Intercambio, a favor pero dentro del ruido. En `--fixed` cada combate trae 4 de 6 al azar con salida al azar: muchas veces las piezas del combo no coinciden.
- Antes no usaba Intercambio nunca; con el modelo lo usa cuando toca (doble Intimidación, pasarle Intimidación a un aliado tras una Danza Espada del rival).
- Tiempo: ≈ 0,65 s por decisión en dobles en el arena (+3–5 %).

## Consecuencias

- **Activado** (decisión del usuario, 2026-11-01): no pierde fuerza, el bot sabe jugar equipos de combos de estado y espera del rival Última Palabra, Vasta Guardia o Intercambio.
- Las respuestas del rival las sigue eligiendo el nivel 2 desde su lado: ahora incluyen estos movimientos. Los movimientos de estado del rival **en los turnos de seguimiento** siguen sin modelarse (allí cada uno usa su mejor ataque).
- Al añadir un movimiento de estado a un set estándar, el test de cobertura obliga a modelarlo o a apuntar por qué no.
- Si se cambia algo de este modelo, se mide como cualquier variante del nivel 3: contra el de hoy, en espejo y con dos tandas (`--b-settings '{"statusModel":0}'` sirve para comparar con el de antes).
- Pendiente: que la vista previa traiga juntas las piezas de un combo (decide por duelos uno contra uno).
