# Fase 21 — La salida con lo aprendido

> **Brief de la fase.** Escrito el 2026-10-12 al cerrar la fase 19 como fase 20; pasó a ser la 21 cuando el usuario adelantó el meta ([fase 20](fase-20.md)). Es el paso 2 del orden del usuario: jugar bien el 4 contra 4 (fases 17–19) ✅, **después la salida**, y por último elegir 4 de 6. Lee antes [AGENTS.md](../../AGENTS.md), la [guía de aprendizaje](../guias/aprendizaje.md), la [guía del bot](../guias/bot.md#nivel-3-vista-previa), [ADR-0015](../adr/0015-vista-previa-del-nivel-3.md), [ADR-0018](../adr/0018-parejas-de-salida-simuladas.md), [ADR-0019](../adr/0019-valoracion-aprendida-de-replays.md) y [ADR-0021](../adr/0021-valoracion-aprendida-en-la-busqueda.md).

## Objetivo

Que el nivel 3, en dobles, con su grupo de 4 ya decidido, **elija la pareja de salida** (y quién queda atrás) con una valoración aprendida del **emparejamiento** de salidas, y que eso gane en espejo frente a la salida de hoy. La explicación de la salida («Por qué salió con…») debe seguir diciendo lo que de verdad decide.

## Punto de partida (verificado al cerrar la fase 19)

- La valoración aprendida (`VALUE_MODEL`, 20 factores, `value-v1.json`) **no predice nada en los turnos 1–2** (log-loss 0,671 frente a 0,689 del 50 %; ADR-0019 §7): al principio decide el emparejamiento de equipos y salidas, no la posición. Por eso no sirve tal cual para elegir la salida.
- El nivel 3 la usa en las hojas de su búsqueda en dobles (`learnedWeight = 1`, ADR-0021): 83,0 / 83,8 % contra el nivel 2 en espejo con **salidas al azar** (`arena --fixed`).
- Hoy, en dobles, el grupo se elige como el nivel 2 (`planPreview`: con la predicción perdía) y la pareja de salida son los dos de su grupo que mejor rinden **uno a uno** contra tu equipo (`leadChoice`, `PreviewOption.duels`). Simular parejas 2 contra 2 para elegir (`LeadPlanner`, fase 16) **perdía 2–3 puntos** con tus rivales: solo explica.
- `tools/arena/src/fixed-lineup.ts`: `FixedLineupAgent` fija **grupo y salida** (`fixedLineup`, por semilla). Para medir la salida hace falta fijar solo el grupo y dejar que cada bot ordene su salida.
- Los replays (`datasets/ladder/`, 5 000 partidas de dobles ≥ 1400) tienen la vista previa de los dos lados (`|poke|`), qué cuatro sacó cada uno (al ir saliendo) y la pareja de salida (`|switch|` antes del turno 1). El modelo de posiciones está saturado con ≈ 1 000 partidas (fase 19): un modelo de emparejamiento tiene otros factores y su propia curva.

## Diseño recomendado

Si te apartas de esto, escribe un ADR (ADR-0023).

### 1. Medir la salida (arena)

- `--fixed-group` (o `--fixed leads=bot`): cada equipo lleva el mismo grupo de 4 en los dos combates del par, pero **cada bot elige su pareja de salida** de entre esos 4 (la vista previa se responde con el grupo fijo y el orden que elija el bot; `teamChoice` con el orden). Así un par en espejo mide solo la salida (y el juego).
- Referencia: el nivel 3 de hoy contra el nivel 2 en ese modo (dos tandas de 1 200 combates).

### 2. Factores del emparejamiento (situaciones, nunca especies)

- Una «posición de salida»: las dos parejas en el campo y los dos de atrás de cada lado, al empezar el turno 1. Factores candidatos (todos con `estimateDamage` y velocidades, como los de posición): quién se mueve antes en cada duelo de la salida, KOs de un golpe y de dos en los dos sentidos, Sorpresa y Protección disponibles, quién pone Espacio Raro, Viento Afín o clima en la salida y a quién beneficia, cobertura de los de atrás contra la salida rival, duelos ganados uno a uno contando los de atrás.
- `ladder:leads` (nuevo): de cada replay, la salida de cada lado con sus factores y el resultado (desde los dos lados). Sets supuestos con `OpponentModel` solo con lo revelado **antes del turno 1** (lo que se ve en la vista previa y al salir): nunca lo que pasa después.
- La prueba barata: ¿predice al ganador en el turno 1 mejor que el 50 % y que «quién gana los duelos uno a uno» (lo que usa `leadChoice`)? Con varias divisiones por partida y su curva de aprendizaje. **Si no, parar y decidirlo con el usuario** antes de tocar el bot.

### 3. Elegir la salida con lo aprendido

- Para su grupo de 4, cada una de sus 6 parejas contra las salidas probables del jugador (la predicción de la fase 14/16, con sus pesos): valor esperado del emparejamiento aprendido. Variantes a medir en espejo (dos tandas): la de hoy, solo lo aprendido, y lo aprendido mezclado con los duelos de hoy.
- La explicación sale del mismo cálculo: «Por qué salió con…» con los factores que deciden (comprobados como en la fase 19: un factor solo se enseña si quitarlo cambia la pareja elegida). Si cambias cómo elige la salida, cambia también su razón (`leads.test.ts`).

### 4. Razones con nombre (si da tiempo)

- Las razones comprobadas de la fase 19 son de factor («se mueve antes que los tuyos en el campo»). Guardar, para el factor que decide, **qué Pokémon lo provocan** en la hoja media (p. ej. quién pasa a moverse antes) para decir «antes que tu Kingambit bajo Espacio Raro». Censurado como el resto con equipo cerrado.

## Tests

- Arena: con `--fixed-group`, mismo grupo en los dos combates del par y cada bot elige su orden (test de `fixed-lineup`).
- Factores de salida sin especies (Meowstic y Meowstic-F dan lo mismo; subir la Velocidad cambia quién se mueve antes), vistos desde los dos lados como espejo.
- Posiciones de salida de un replay recortado: cortar el log tras el turno 1 da los mismos factores (nada del futuro).
- La salida elegida y su razón salen del mismo cálculo; una razón enseñada cambia la pareja al quitarla; la explicación no cambia la decisión.

## Criterios de «hecho»

- Prueba barata del emparejamiento con cifras en el ADR-0023 (y la decisión de seguir o no, con el usuario).
- Si sigue: variantes medidas en espejo con dos tandas, cifras en el CHANGELOG y la elegida decidida con el usuario. Nivel 3 ≤ ~1 s de media por decisión.
- «Por qué salió con…» dice lo que decidió.
- `npm run check` y `npm run e2e` en verde; CI en verde. Docs y brief de la fase 22.

## Fuera de alcance

- Elegir 4 de 6 (paso 3 del usuario, fase siguiente).
- Autojuego (posible fase propia si los factores de partida no dan más).
- Individuales (pocos replays).
- Predecir qué hará el rival aprendiéndolo de los replays (prioridad del usuario: que **prediga al rival**; candidata a fase propia).
- Opciones antiguas pendientes: G (vista previa menos predecible), C (entrenador de vista previa), A (criba en la web), B (tablas de daños y velocidades), D (aprender tus vistas previas), F (optimizador de Stat Points), H (más arquetipos).
