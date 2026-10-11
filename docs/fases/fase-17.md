# Fase 17 — Medir bien y aprender a valorar posiciones con replays reales

> **Brief de la fase.** Escrito el 2026-10-12 tras hablar con el usuario sobre la mejor manera de construir un buen bot. Sustituye a la propuesta de ampliaciones que había aquí: sus opciones (G, C, E3, A, B, D, F, H) siguen pendientes y están al final.
> Lee antes [AGENTS.md](../../AGENTS.md), la [guía del bot](../guias/bot.md), [ADR-0010](../adr/0010-bot-experto-con-sandbox.md), [ADR-0011](../adr/0011-nivel-3-con-equipo-completo.md), [ADR-0012](../adr/0012-deduccion-de-sets-y-estilo-del-rival.md) y [ADR-0018](../adr/0018-parejas-de-salida-simuladas.md).

## Objetivo

Preparar la base de un bot que **aprende a valorar posiciones** a partir de partidas reales de Champions, en lugar de sumar más reglas a mano, y comprobar con una prueba barata si merece la pena antes de tocar cómo juega:

1. Un **modo de medida** con menos ruido: 4 contra 4 fijados, salidas al azar y cada partida jugada desde los dos lados.
2. **Replays de dobles de Champions** descargados y convertidos en posiciones.
3. Un **modelo por factores de partida** que predice quién gana una posición, entrenado con esas posiciones.
4. La **prueba barata**: ¿acierta el ganador mejor que la valoración actual? Si no, se para aquí y se replantean los factores.

Además, un arreglo pequeño de honestidad en la explicación de la salida del bot.

## Decisión del usuario (2026-10-12)

1. **Orden de trabajo**: primero que los bots jueguen bien un 4 contra 4 fijado con salidas al azar; después, elegir la salida; después, elegir 4 de 6 con su salida. La vista previa es lo último.
2. **Método**: búsqueda (el nivel 3 sigue simulando con el sandbox) más una **valoración aprendida**: primero de replays de humanos y, más adelante, refinada con autojuego.
3. **Explicable**: un modelo **por factores de partida** (turnos de Espacio Raro, quién se mueve antes, quién tumba a quién…) con un peso aprendido cada uno, no una caja negra. Una razón **solo se enseña si quitarla cambia la decisión**. Siempre en términos de partida, nunca con números.
4. **Situaciones, no Pokémon concretos**: los factores no usan la especie ni el nombre de los movimientos, sino lo que significan en esa posición (velocidades, daños, tipos, campo). Si un update cambia stats o el meta, los factores se recalculan con los datos nuevos y el modelo sigue valiendo.
5. **La explicación tiene que decir lo que de verdad decide**: hoy el bot explica su salida con la simulación 2 contra 2 pero la elige con los duelos uno a uno. Eso se arregla ya.

## Punto de partida

- El nivel 3 elige la jugada simulando en copias del combate (`search/lookahead.ts`). Cada hoja se valora en `positionValue`: balance de PS (material × 100), más `positionWeight × outlook` (lo que el nivel 2 espera de ahí) y, en individuales, la cadena de equipo completo (`chainWeight`). Todo está escrito a mano.
- Los últimos parches a mano no ganaban nada: los puntos por arquetipo (fase 15) y la salida simulada (fase 16, de −2 a −3 puntos).
- Ruido de medida: 600 combates dan ±2–3 puntos. Por pareja de equipos hay menos de un combate de cada set y no se mide nada por salida.
- La salida propia se elige por duelo medio (`search/preview.ts`), pero «Por qué salió con…» (`leadReading` en `search/lead-reasons.ts`, `leadStory` en la web) cuenta razones de la simulación 2 contra 2.

## Hechos verificados (2026-10-12)

- **Replays públicos** en `https://replay.pokemonshowdown.com/search.json?format=<formato>&before=<fecha>` (páginas de 51; hace falta cabecera `User-Agent`; cada replay se baja aparte desde `https://replay.pokemonshowdown.com/<id>.json`):
  - `gen9championsvgc2026regmc` (dobles): ≈ 150 por hora y estable, desde hace ≈ 32 días. **≈ 100 000–120 000** en total. El rating de la muestra va de ≈ 1 000 a ≈ 1 650; con más de ~1 400 quedarían ≈ 15 000–25 000.
  - `gen9championsbssregmc` (individuales): **≈ 3 000–6 000**. Demasiado pocas por ahora.
  - Son de equipo cerrado: solo se ve lo que cada jugador revela, como un espectador.
- **El log de un replay es el protocolo de Showdown** que ya leemos: `BattleView.from(lines)` (core) reconstruye el estado visible turno a turno.
- En la máquina del usuario hay Python 3.14, pero no hace falta: un modelo por factores (regresión logística con unas decenas de factores) se entrena en TypeScript en segundos. **El proyecto sigue siendo de un solo lenguaje.**
- `playBotBattle` (engine) recibe los agentes ya creados: un envoltorio que fija la vista previa no necesita cambiar el motor ni la validación (el equipo sigue siendo de 6).

## Diseño recomendado

Si te apartas de esto, escribe un ADR. La fase deja al menos uno (**ADR-0019**): datos de replays, factores sin especies, modelo por factores entrenado en TypeScript y regla de explicaciones comprobadas.

### 0. Honestidad de la salida (pequeño, primero)

- «Por qué salió con…» dice la razón real: **los que mejor rinden uno a uno contra tu equipo** (con los duelos que de verdad pesaron: a quién gana cada uno y a quién teme), en términos de partida.
- Lo simulado 2 contra 2 se enseña aparte como **«Qué espera que pase»** (KO, presión, Sorpresa, plan), no como el motivo.
- La salida que espera de ti puede seguir con su explicación: esa predicción sí sale de la simulación.
- Test: las razones de la salida propia salen del mismo cálculo que la decide.

### 1. Modo de medida 4 contra 4 (`npm run arena -- --fixed …`)

- Un envoltorio de agente (en `tools/arena`, sin tocar el bot) que en la vista previa elige **4 fijos** y una **salida al azar** (sembrada) y en el resto delega en el bot.
- **Espejo**: cada combate se juega dos veces cambiando los asientos y con la misma salida sorteada. Así se anula la ventaja de equipo y de salida, y el ruido por combate baja mucho.
- Informe por pareja de equipos y por salida (cuántas veces y con qué resultado), además del total.
- Se apunta en el CHANGELOG la cifra de referencia del nivel 3 contra el nivel 2 en este modo, con su ±.

### 2. Descarga de replays (`npm run ladder:fetch`)

- Herramienta nueva `tools/ladder` (solo Node). Recorre `search.json` del formato de dobles, filtra por rating (`--min-rating 1400` por defecto) y baja cada replay **a una petición por segundo como mucho**. Es **reanudable**: no baja lo que ya tiene.
- Carpeta local no versionada: `datasets/ladder/<formato>/<id>.json` (`datasets/` va al `.gitignore`). No va en `storage/`, que son tus datos.
- Si falla con `SEC_E_UNTRUSTED_ROOT`, es la VPN: hay que avisar al usuario.
- Tanda inicial: unas **5 000 partidas** (≈ 1,5 h). Se puede ampliar después.

### 3. Posiciones y factores de partida (`npm run ladder:positions`)

- Por cada replay, al empezar cada turno, se construye la posición con `BattleView` **desde el lado de cada jugador**, con información de espectador: los sets de los dos lados se suponen como hace el bot con el rival (`OpponentModel` y la deducción de la fase 11, a partir del log).
  - En combate, el bot conoce su propio set exacto: es una pequeña diferencia que se documenta en el ADR.
- **Los factores se describen en situaciones, nunca por especie ni por movimiento.** Los valores de cada especie (velocidad, daño, tipos) se calculan al extraerlos con `@colleja/data` y `estimateDamage`. Una lista inicial, revisable:
  - Balance de PS y de Pokémon vivos (campo y banquillo).
  - Turnos de Espacio Raro, Viento Afín, pantallas y clima a favor y en contra.
  - En el campo: cuántos de los míos se mueven antes que cada rival (con el campo actual) y viceversa.
  - Amenazas de KO de un golpe en los dos sentidos (≥ 50 % de probabilidad) y daño máximo esperado.
  - Banquillo: a cuántos rivales gana alguien del mío en un duelo (el duelo del nivel 2) y viceversa.
  - Mejoras y bajadas de stats, estados alterados, Mega disponible o usada, Sorpresa disponible.
  - Turno de la partida.
- Salida: un fichero por lotes (`datasets/ladder/positions-v<N>.jsonl`) con los factores, el resultado desde ese lado, el rating, el id del replay y el turno. Los factores llevan **versión** (`FEATURES_VERSION`): si cambian, se regeneran.
- La extracción vive en `packages/bot/src/learning/features.ts` (apta para navegador), porque **el bot la usará en combate con la misma función**. La lectura de ficheros va en `tools/ladder`.

### 4. Modelo por factores (`npm run ladder:train`)

- **Regresión logística** sobre los factores normalizados, entrenada en TypeScript (descenso por gradiente con regularización L2). Cada factor tiene un peso, y la valoración es su suma: la contribución de cada uno es **exacta**.
- Pesos en `packages/bot/src/learning/models/value-v<N>.json` (versionado, pequeño), con metadatos: versión de factores, partidas, fechas, ratings y métricas.
- `explainValue(factores)` devuelve cada contribución ordenada. `counterfactual(factores, factor)` dice cuánto cambia la valoración sin ese factor (llevado a su valor neutro). Son la base de las explicaciones comprobadas de la fase siguiente.

### 5. La prueba barata (`npm run ladder:eval`)

- División **por partida**, no por posición (80/20, sembrada): nunca entrenar con un turno y evaluar con otro de la misma partida.
- Métricas sobre las posiciones de prueba: log-loss, acierto y calibración, en total, por tramo de turno (1–2, 3–5, 6+) y por tramo de rating.
- Referencias con las mismas posiciones:
  - Solo balance de PS (lo que domina `positionValue`).
  - El `outlook` del nivel 2 si se puede construir la `Situation` desde una posición de replay. Si eso resulta muy caro, se queda en la mínima y se explica por qué.
- **Criterio para seguir**: el modelo mejora la log-loss de la referencia de forma clara (más que la variación entre semillas de la división) y está calibrado. Si no, se apunta en el ADR qué factores faltan y la fase 18 empieza por ahí.

## Tests

- `tools/arena`: el envoltorio elige siempre los 4 fijos y la salida sorteada es la misma con la misma semilla. En el espejo, cada lado juega cada asiento.
- `tools/ladder`: con replays de muestra (fixtures pequeños escritos o recortados a mano en `tools/ladder/test/fixtures/`, sin red), la extracción de posiciones es determinista y los turnos y el ganador son los correctos. La descarga se prueba con un `fetch` falso (reanudar y respetar el ritmo).
- `packages/bot/test/features.test.ts`:
  - Los factores no dependen del nombre de la especie: dos especies con los mismos stats, tipos y movimientos dan los mismos factores.
  - Cambiar la velocidad base en los datos cambia «quién se mueve antes».
  - Con información cerrada, no se usa nada no revelado.
- `packages/bot/test/value-model.test.ts`: el entrenamiento es determinista con la misma semilla y recupera los pesos de un problema sintético. `explainValue` suma exactamente la valoración. `counterfactual` es coherente.
- Salida del bot: las razones de su salida coinciden con los duelos que la decidieron (`leads.test.ts`), y la web enseña aparte «Qué espera que pase» (`explanation-story.test.ts`).
- **Nada de red en el check**: los datos descargados no se usan en los tests.

## Criterios de «hecho»

- La explicación de la salida del bot dice su razón real y separa «Qué espera que pase» (tests).
- `npm run arena -- --fixed …` funciona con espejo y la cifra de referencia está en el CHANGELOG.
- ≥ 5 000 partidas de dobles descargadas, sus posiciones extraídas y un modelo entrenado, con sus métricas y referencias en el ADR-0019 y en el CHANGELOG, **y la decisión de seguir o no**, tomada con el usuario.
- Los factores no contienen especies ni nombres de movimiento (test).
- `npm run check` y `npm run e2e` en verde; CI en verde.
- Docs: CHANGELOG, AGENTS (comandos `ladder:*`, `datasets/`, reglas de factores), PLAN, README, guía del bot (y una guía nueva `docs/guias/aprendizaje.md` si hace falta), ADR-0019 y el brief de la fase 18.

## Fuera de alcance (fases siguientes)

- **Fase 18**: meter la valoración aprendida en `positionValue` del nivel 3 y medirla con el modo 4 contra 4 en espejo. Explicaciones comprobadas en la partida: solo se enseña una razón si quitarla cambia la decisión.
- **Después**:
  - Predecir qué hará el rival aprendiéndolo de los replays (a quién ataca, cuándo protege o cambia): la prioridad del usuario de que **prediga al rival**.
  - Refinar con autojuego.
  - Elegir la salida con la valoración (contando el campo y el banquillo).
  - Elegir 4 de 6.
  - Individuales cuando haya replays suficientes.
  - Modelos más potentes (redes) si el de factores se queda corto, siempre con explicaciones comprobadas.
- **Opciones de la antigua propuesta, aún pendientes**:
  - G: vista previa menos predecible.
  - C: entrenador de vista previa.
  - E3: salida valorada con el combate entero (la cubre la valoración aprendida).
  - A: criba y varias versiones en la web.
  - B: tabla de daños y velocidades.
  - D: aprender tus vistas previas.
  - F: optimizador de Stat Points.
  - H: más arquetipos y razones.
