# ADR-0011 — Nivel 3 en individuales: hojas y relevos con el equipo completo

- **Estado**: Aceptado (2026-10-08)
- **Contexto previo**: [ADR-0010](0010-bot-experto-con-sandbox.md) · **Guía operativa**: [docs/guias/bot.md](../guias/bot.md)

## Contexto

La fase 10 pedía que el nivel 3 ganara al nivel 2 al menos un 65 % en individuales (≥ 600 combates) sin pasar de ~1 s de media por decisión. Partía de un 61,8 % (58,4 % en la semilla de ajuste de esta fase). La fase 9 había dejado claro que más muestras ya no ayudaban: el límite estaba en la valoración de las posiciones.

Al revisar qué valora una hoja se vio el hueco: el balance de PS más el "cambio esperado" del nivel 2, que solo mira el activo propio, el siguiente de su cadena y el rival **en el campo**. Una posición en la que tu activo gana su duelo pero el banquillo rival lo barre valía lo mismo que una en la que no hay respuesta. Lo mismo pasaba con los relevos forzosos (los del nivel 2: el mejor duelo contra el rival en el campo).

Al medir apareció además otro problema: algunos combates no terminaban nunca porque los dos bots **cambiaban cada turno** en bucle (A saca a su respuesta, B saca a la suya, y vuelta a empezar).

## Decisión

1. **Cadena de equipo completo** (`analysis/team-chain.ts`, `teamChainValue`): los activos se enfrentan con el duelo de daño esperado de siempre (`simulateDuel`); cuando uno cae, su lado saca al Pokémon de los que le quedan que mejor gana al superviviente, y así hasta que un lado se queda sin nadie. Devuelve el balance de PS final (× 100) de los dos equipos enteros. Es barata: reutiliza los duelos y sus cachés (los PS se llevan aparte del combatiente, `DuelStart`).
2. **Hojas**: en individuales, el valor de una posición pasa a ser balance + 0,5 × cambio esperado del nivel 2 + **`chainWeight` × (cadena − balance)**, con el banquillo de los dos lados en el fork (el rival, como se supone: los vistos tal cual y los no vistos con los sets de la suposición; `search/lineups.ts`). `chainWeight` está en `SEARCH_SETTINGS` (0 en dobles, donde la cadena de duelos no tiene sentido).
3. **Relevos forzosos en individuales**: el nivel 3 elige al que entra por la cadena de equipo completo, en promedio sobre las suposiciones del rival (`ExpertAgent.chooseReplacements`). Sigue sin sandbox: no le hace falta.
4. **Contra los bucles de cambios**: cada opción con un cambio pierde `loopPenalty` puntos por cada cambio voluntario propio de los últimos 4 turnos (`recentSwitches`, sin contar los relevos tras un KO). Un cambio aislado apenas cuesta; un baile de cambios se corta.

## Resultados

Arena contra el nivel 2 en individuales, equipos aleatorios con vista previa, equipo cerrado, 600 combates por variante, misma semilla de ajuste, combates de más de 150 turnos contados como empate:

| Variante | Victorias |
|---|---|
| Fase 9 (referencia) | 58,4 % |
| Cadena en la hoja, peso 0,3 / 0,5 / 0,7 / 1 | 64,2 / 62,8 / 59,0 / 52,7 % |
| Peso 0,5 + relevos por cadena | 64,6 % |
| Peso 0,5 + penalización de bucles (4) | 64,0 % (la mitad de combates eternos) |
| Peso 0,5 + **vista previa** por cadena contra los grupos probables del rival | 58,5 % (descartada) |
| **Elegida**: peso 0,4 + relevos por cadena + bucles (4) | 63,5 % y 63,9 % (dos semillas de ajuste); **65,8 %** en una semilla nueva |
| La elegida con equipo abierto (techo) | 70,7 % |

En dobles (300 combates) el nivel 3 gana un 81,3 % (78,6 % en la fase 9). Tiempo medio por decisión: 0,54 s en individuales y 0,41 s en dobles. Tabla completa, con las variantes descartadas, en el CHANGELOG de la fase 10.

## Consecuencias

- El objetivo de la fase (≥ 65 % sostenido) queda rozado: ≈ 64,4 % sobre 1800 combates en tres semillas. Lo que falta es sobre todo **información oculta** (con equipo abierto, +7 puntos): la siguiente mejora es deducir los sets del rival por lo observado ([fase 11](../fases/fase-11.md)). El usuario decidió cerrar la fase con esto.

- El nivel 3 de individuales ya no es "el nivel 2 más un turno": sus hojas y sus relevos ven el equipo entero. Mejorar la cadena (por ejemplo, que el que entra reciba un golpe gratis) mejora las dos cosas a la vez.
- La vista previa sigue siendo la del nivel 2: la versión por cadenas, con un modelo de lo que trae el rival, jugó peor.
- La cadena no conoce la regla de una Mega por combate (supone la Mega de todo el que lleve su piedra), igual que el nivel 2.
- El tiempo por decisión sube algo (ver el CHANGELOG); sigue lejos del máximo acordado.

## Alternativas descartadas

- **Más peso a la cadena (≥ 0,7)**: sustituye una estimación precisa del turno siguiente por una muy gruesa de todo el combate y empeora.
- **Vista previa por cadenas**: ver la tabla.
- **Cadena por opción** (cada opción del nivel 2 jugada con los dos equipos en la hoja): más lenta y no mejor.
- **Ordenar los no vistos por lo que le conviene traer al rival**: +1 punto en una semilla y −3 en otra; ruido.
- **Más muestras**: el doble de tiempo, sin mejora.
- **Dos turnos de búsqueda o *rollouts* con el simulador**: no caben en ~1 s por decisión (cada hoja costaría decenas de milisegundos).
