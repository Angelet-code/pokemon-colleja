# Fase 19 — El nivel 3 valora con lo aprendido (y explica lo comprobado)

> **Brief de la fase.** Escrito el 2026-10-12 al cerrar la fase 17. Sigue a la 17 en el camino del bot; la [fase 18](fase-18.md) (animaciones de combate) es independiente y va en paralelo. Lee antes [AGENTS.md](../../AGENTS.md), la [guía de aprendizaje](../guias/aprendizaje.md), la [guía del bot](../guias/bot.md), [ADR-0019](../adr/0019-valoracion-aprendida-de-replays.md), [ADR-0010](../adr/0010-bot-experto-con-sandbox.md) y [ADR-0011](../adr/0011-nivel-3-con-equipo-completo.md).

## Objetivo

Que el nivel 3 **valore las hojas de su búsqueda con la valoración aprendida** de la fase 17 y que juegue mejor un **4 contra 4 fijado con salidas al azar** (dobles), medido en espejo. Y, con eso, las primeras **explicaciones comprobadas** en combate: una razón solo se enseña si quitarla cambia la decisión.

Es el paso 1 del orden del usuario (jugar bien el 4 contra 4; después la salida; después elegir 4 de 6).

## Punto de partida (verificado al cerrar la fase 17)

- `packages/bot/src/learning/`: `extractFeatures(position, side)` (20 factores, `FEATURES_VERSION = 1`), `spectatorPosition(view, timers, mode)`, `EffectTimers`, y el modelo (`value-model.ts`: `valueLogit`, `winProbability`, `explainValue`, `counterfactual`). Pesos en `learning/models/value-v1.json`.
- **La prueba barata salió bien** (ADR-0019 §7): con todos los factores, la log-loss baja claramente frente al balance de PS, más que la variación entre divisiones, y está calibrado. En los turnos 1–2 **nadie predice nada** (≈ 50 %): ahí decide el emparejamiento de equipos y salidas, no la posición.
- `positionValue` (`search/lookahead.ts`) = material (balance de PS × 100) + `positionWeight` (0,5) × `outlook` del nivel 2 + en individuales `chainWeight` × (cadena − material).
- Arena en espejo: `npm run arena -- --a 3 --b 2 --mode doubles --fixed`. Referencia: **81,0 % ± 2,1** en dobles y 64,2 % ± 2,4 en individuales (1 200 combates por modo).
- `PreviewOption.duels` y `leadChoice`: la salida del bot y su razón real ya van juntas.

## Diseño recomendado

Si te apartas de esto, escribe un ADR (ADR-0021; la 0020 es la de animaciones).

### 1. Posición del bot en combate

- `ownPosition(situation)` (o desde la hoja del sandbox): la misma `Position` que la de espectador, pero con **sus sets exactos** y sus PS exactos; los del rival, como ahora (`OpponentModel` y la deducción de la fase 11: el set más probable o una media por variantes si no es caro).
- `EffectTimers` sobre el log de su perspectiva (la hoja del sandbox tiene su log).
- Test: con la misma información, `ownPosition` y `spectatorPosition` dan los mismos factores salvo los que dependen de su set.

### 2. Valor de hoja aprendido

- Nueva opción en `SEARCH_SETTINGS`: `learnedWeight` (0 por defecto hasta medir). La hoja suma `learnedWeight × valueLogit` (en la escala de puntos de la búsqueda: elegir el factor de conversión, p. ej. que 1 log-odd ≈ lo que vale un Pokémon en material, y documentarlo).
- Variantes a medir (mismas semillas, espejo, ≥ 1 200 combates por variante y confirmar con otra tanda):
  1. Solo material (referencia interna).
  2. Material + `outlook` (lo de hoy).
  3. Material + aprendido.
  4. Aprendido en lugar de `outlook`.
  5. Las tres cosas.
- **Coste**: `extractFeatures` hace hasta ~300 cálculos de daño (cacheados). Mide con `npm run arena:perf` que el nivel 3 siga en ≤ ~1 s de media por decisión; si no, poda los factores caros (p. ej. `answers` solo con los vivos que ya se vieron) o cachea por hoja.
- Si **no mejora**, averiguar por qué antes de rebajar (regla del usuario): ¿las hojas tras 1 turno simulado se parecen a las posiciones de inicio de turno de los replays? ¿Hace falta entrenar con posiciones de autojuego del propio bot?

### 3. Explicaciones comprobadas

- Tras decidir, para la opción elegida y la segunda mejor, `explainValue` de sus hojas y `counterfactual` de cada factor: una razón se enseña **solo si quitar ese factor cambia cuál es la mejor**.
- En términos de partida, nunca con números: «porque así se mueve antes que tu Kingambit bajo Espacio Raro», «para que no te queden dos que le ganen en duelo»…
- Va en `DecisionExplanation` (core y protocol, opcional) y en «Pensamiento del bot». Test: la explicación nunca cambia la decisión (`explain.test.ts`) y cada razón enseñada cambia la decisión al quitarla.

### 4. Más datos si hace falta

- `npm run ladder:fetch -- --limit 10000` sigue donde lo dejó. Ver si la log-loss mejora con más partidas (curva de aprendizaje con 1 000, 2 500, 5 000…).
- Factores nuevos solo si la prueba barata los justifica (sube `FEATURES_VERSION`).

## Tests

- `ownPosition` frente a `spectatorPosition` (arriba).
- La valoración aprendida con `learnedWeight = 0` no cambia ninguna decisión (huellas de `arena:perf`).
- Explicaciones comprobadas: quitar el factor enseñado cambia la mejor opción; la explicación no cambia la decisión.
- El modelo versionado tiene la misma versión y factores que `FEATURES` (test que falla si se cambia un factor sin regenerar).

## Criterios de «hecho»

- Variantes medidas en espejo con dos tandas, cifras en el CHANGELOG y en el ADR-0021, y la elegida (o el diagnóstico de por qué no mejora) decidida con el usuario.
- Nivel 3 ≤ ~1 s de media por decisión.
- Explicaciones comprobadas en «Pensamiento del bot» (si la valoración aprendida decide algo).
- `npm run check` y `npm run e2e` en verde; CI en verde. Docs y brief de la fase 20.

## Fuera de alcance

- Elegir la salida con la valoración (fase siguiente: los turnos 1–2 muestran que hace falta valorar el emparejamiento, no la posición).
- Elegir 4 de 6.
- Predecir qué hará el rival aprendiéndolo de los replays (prioridad del usuario: que **prediga al rival**).
- Autojuego.
- Individuales (pocos replays).
- Opciones antiguas pendientes: G (vista previa menos predecible), C (entrenador de vista previa), A (criba en la web), B (tablas de daños y velocidades), D (aprender tus vistas previas), F (optimizador de Stat Points), H (más arquetipos).
