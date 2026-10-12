# ADR-0019 — Valoración aprendida de replays: factores de partida sin especies

- **Estado**: Aceptado (2026-10-12)
- **Contexto previo**: [ADR-0010](0010-bot-experto-con-sandbox.md), [ADR-0011](0011-nivel-3-con-equipo-completo.md), [ADR-0012](0012-deduccion-de-sets-y-estilo-del-rival.md), [ADR-0018](0018-parejas-de-salida-simuladas.md) · **Brief**: [fase 17](../fases/fase-17.md) · **Guías**: [aprendizaje](../guias/aprendizaje.md), [bot](../guias/bot.md)

## Contexto

El nivel 3 simula en copias del combate y valora cada hoja con `positionValue`: balance de PS más lo que espera el nivel 2 y, en individuales, la cadena de equipo completo. Todo escrito a mano, y los últimos parches a mano ya no ganaban (arquetipos en la fase 15, salida simulada en la 16). Además, el bot explicaba su salida con la simulación 2 contra 2 pero la elegía con los duelos uno a uno.

El usuario decidió (2026-10-12) cambiar de método: mantener la búsqueda y **aprender la valoración** de partidas reales de Champions (después, refinarla con autojuego), con un modelo **explicable por factores de partida** que no dependa de especies, y que la explicación diga **lo que de verdad decide**.

## Decisión

### 1. La explicación de la salida dice su razón real

- `leadChoice` (`search/lead-reasons.ts`) → `PreviewAnalysis.leads.choice` (`LeadChoice`): sus dos líderes son los de su grupo que mejor rinden uno a uno contra tu equipo, con a quién gana y a quién teme cada uno (duelos de ≥ 25 puntos) y a quién deja atrás. Sale de `PreviewOption.duels`, **los mismos duelos que ordenaron el grupo**.
- La simulación 2 contra 2 de su salida (`leads.own`) se enseña aparte, como **«Qué espera que pase»**. La de tu salida esperada sigue igual: esa predicción sí sale de la simulación.
- Con equipo cerrado, `redactExplanation` quita la razón si un líder no se ha visto y deja en `behind` solo los vistos.

### 2. Medir en espejo (`npm run arena -- --fixed`)

- `FixedLineupAgent` (`tools/arena`, sin tocar el bot ni el motor) responde a la vista previa con **4 fijos** (3 en individuales) y una **salida al azar**, sacados de la semilla de cada equipo del par.
- Cada par se juega dos veces cambiando los bots de asiento, con las **mismas salidas y la misma semilla de combate**. El informe «Por pares» da cuántos pares gana cada bot por los dos lados y el ± a partir de los pares.
- Referencia, nivel 3 contra nivel 2, 1 200 combates por modo (600 pares, semillas `ref1`–`ref6`):

| Modo | % del nivel 3 | ± por pares | ± como combates sueltos | Gana los dos / reparten / pierde los dos |
|---|---|---|---|---|
| Dobles (4 contra 4) | **81,0 %** | 2,1 | 2,2 | 380 / 212 / 8 |
| Individuales (3 contra 3) | **64,2 %** | 2,4 | 2,7 | 214 / 341 / 45 |

  Con tanta diferencia de fuerza, el espejo apenas baja el ruido (el nivel 3 gana casi siempre los dos asientos): rinde más al comparar variantes parecidas, que es para lo que se usará en la fase 19.

### 3. Datos: replays públicos de dobles

- `tools/ladder` (solo Node): `search.json` del formato `gen9championsvgc2026regmc`, rating ≥ 1400, ≤ 1 petición por segundo, reanudable. Los replays van a `datasets/ladder/` (no versionado; no es `storage/`, que son tus datos).
- Individuales no: hay muy pocos replays.

### 4. Posiciones de espectador

- Al empezar cada turno, `BattleView` del log y `spectatorPosition`: los sets de los dos lados se suponen con `OpponentModel` a partir de lo revelado **hasta ese turno**; los no vistos de la vista previa pesan lo que los huecos sin ver. Una fila por lado.
- **Diferencias con el combate**, aceptadas: en combate el bot conoce su propio set exacto y sus PS exactos; aquí no se usa la deducción por daño de la fase 11 (necesita la perspectiva de un jugador). Las formas cosméticas que no están en los datos (p. ej. `vivillonhighplains`) hacen saltar el replay.

### 5. Factores en situaciones (`learning/features.ts`)

- 20 factores, cada uno visto desde un lado (positivo = bueno, 0 = neutro): PS, vivos y PS en el campo; quién se mueve antes en el campo y con el banquillo (con el campo actual); turnos de Espacio Raro a favor del más lento, Viento Afín y pantallas (`EffectTimers`, porque `BattleView` no cuenta turnos); clima propio; KO de un golpe en los dos sentidos y moviéndose antes; daño del mejor golpe en los dos sentidos; rivales a los que alguien gana en un duelo rápido; mejoras; estados; Mega disponible; Sorpresa disponible.
- **Ni especies ni nombres de movimiento**: un Pokémon solo entra por su velocidad, su daño (`estimateDamage`) y sus tipos en esa posición; Sorpresa se reconoce por sus datos. Si cambian stats o meta, se recalculan y el modelo sigue valiendo.
- `FEATURES_VERSION` versiona las posiciones y el modelo.
- **El duelo no es el del nivel 2**: `duelScore` necesita una `Situation`, que necesita la petición de un jugador. El «duelo rápido» compara golpes para tumbar y quién se mueve antes.

### 6. Modelo por factores en TypeScript

- **Regresión logística** con L2 (1 sobre los pesos escalados), entrenada con **Newton** en lugar de descenso por gradiente: con 20 factores converge en pocos pasos, sin semilla ni tasa de aprendizaje, y siempre igual. El proyecto sigue siendo de un solo lenguaje.
- Sin centrar: cada factor solo se divide por su desviación cuadrática, así que el 0 neutro tiene contribución 0 y `counterfactual` es exactamente la contribución (`explainValue`).
- Pesos en `packages/bot/src/learning/models/value-v1.json` con sus metadatos (partidas, fechas, ratings, métricas).

### 7. La prueba barata

**4 999 partidas** de dobles (rating 1 400–1 879, del 25-09 al 11-10-2026; 32 sin ganador o con una forma que falta en los datos se saltan), **72 266 posiciones** por lado. Prueba con el 20 % de las partidas, 5 divisiones por partida (`npm run ladder:eval`):

| Modelo | Log-loss (± entre divisiones) | Acierto | Error de calibración |
|---|---|---|---|
| Siempre 50 % | 0,693 | 50,0 % | — |
| Balance de PS (lo que domina `positionValue`) | 0,619 (± 0,006) | 63,7 % | 0,011 |
| PS y vivos (`hp`, `alive`, `fieldHp`) | 0,597 (± 0,006) | 65,0 % | 0,013 |
| **Todos los factores** | **0,566** (± 0,011) | **68,4 %** | 0,017 |

- **Mejora frente al balance de PS: 0,053** de log-loss (entre 0,041 y 0,062 según la división), unas cinco veces la variación entre divisiones. Calibrado: en cada décimo de probabilidad, lo predicho y lo ganado difieren ≤ 3 puntos (algo prudente en los extremos: 5,6 % → 2,3 %, 94,4 % → 97,7 %).
- **Por turno** (división `s1`): turnos 1–2, 0,671 frente a 0,689 (57 % de acierto: casi nada se sabe aún); 3–5, 0,547 frente a 0,611; 6+, 0,446 frente a 0,541. **Al principio decide el emparejamiento** (equipos y salidas), no la posición: lo tiene que aprender otra cosa (la salida, más adelante).
- **Por rating**: mejora en los tres tramos (< 1 500, 1 500–1 599, ≥ 1 600).
- **Pesos** (por desviación típica, en log-odds): Pokémon en pie +1,15; mejoras de características +0,35; PS en el campo y **rivales a los que alguien gana en duelo** +0,26; PS totales +0,18; estados +0,17; Espacio Raro a favor +0,09; KO de un golpe ±0,09; pantallas +0,07; Mega disponible +0,06; KO moviéndose antes, daño y Viento Afín ±0,05; velocidad en el campo +0,04; Sorpresa −0,04 (casi siempre en un Pokémon recién entrado tras un KO); velocidad del banquillo y clima ≈ 0.
- El modelo versionado (`value-v1.json`, división `s1`): log-loss de prueba 0,547 frente a 0,609 del balance de PS, 70,0 % de acierto.
- **No hay referencia del `outlook` del nivel 2**: necesita una `Situation`, que se construye desde la petición de un jugador (sus sets y PS exactos); una posición de espectador no la tiene. Se medirá dentro del bot, en la fase 19.

**Criterio para seguir: cumplido** (mejora clara y más grande que la variación entre divisiones; calibrado). Recomendación: seguir con la fase 19 (la valoración aprendida en las hojas del nivel 3, medida en espejo).

## Consecuencias

- Hay una base medible para que el nivel 3 valore sus hojas con lo aprendido (fase 19), medida en espejo.
- Los factores sirven también al jugador: «¿por qué esta posición es buena?» en términos de partida.
- El dataset es local: quien clone el repositorio lo descarga con `npm run ladder:fetch` (≈ 2 h para 5 000 partidas). El modelo versionado no lo necesita.
- La posición de espectador supone sets estándar: un equipo con sets raros se valora con lo que parece.
