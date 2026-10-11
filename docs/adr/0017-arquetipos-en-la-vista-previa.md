# ADR-0017 — Arquetipos en la vista previa: leer el equipo entero y jugar con su control de velocidad

- **Estado**: Aceptado (2026-10-11)
- **Contexto previo**: [ADR-0015](0015-vista-previa-del-nivel-3.md), [ADR-0016](0016-clima-en-la-vista-previa.md) · **Brief**: [fase 15 (E1)](../fases/fase-15.md) · **Guías**: [bot](../guias/bot.md#nivel-3-vista-previa), [herramientas](../guias/herramientas.md#pensamiento-del-bot-pantalla-de-combate)

## Contexto

La vista previa del nivel 3 suma **duelos 1 contra 1**: cada Pokémon se valora solo, sin compañero. No ve los planes de equipo de dobles (Espacio Raro con atacantes lentos, Viento Afín con atacantes rápidos, potenciarse tras Sorpresa o Señuelo); solo el clima cuenta ([ADR-0016](0016-clima-en-la-vista-previa.md)). Así puede dejar fuera al inductor de Espacio Raro y a sus atacantes, y no prevé que el jugador traiga una pareja pensada para ir junta.

El usuario pidió (2026-10-11) una **valoración general del equipo** como primera aproximación, antes de simular parejas (E2): qué pinta tiene, qué arquetipo puede ser, qué 4 encajan entre sí y qué pareja de salida monta el plan. Decisiones:

1. Se **enseña y decide si mejora** (medido con el arena); si no, solo se enseña.
2. Se mide con **tus rivales guardados** (arquetipos reales) y con equipos aleatorios (que casi nunca forman arquetipos: solo comprueban que no se pierde fuerza).
3. Se ve en **«Pensamiento del bot»**: la lectura de tu equipo; la del suyo solo con equipo abierto o en el replay (con equipo cerrado revelaría sus sets).
4. Lectura en los dos modos; **decide solo en dobles**.

## Decisión

### 1. Lectura del equipo (`analysis/team-read.ts`)

- **Arquetipos** (`TeamArchetype`): `trickroom`, `tailwind`, `rain`, `sun`, `sand`, `snow` y `setup` (potenciarse con apoyo).
- **Papel de cada miembro** (`readMembers`), como probabilidad sobre los sets que el bot considera (los tuyos con equipo cerrado; los suyos, conocidos):
  - Quién lo **pone**: Espacio Raro / Viento Afín (el movimiento), el clima (Llovizna, Sequía, Chorro Arena, Nevada), Señuelo o Polvo Ira (1) y Sorpresa (0,4) para `setup`.
  - Quién lo **aprovecha**: atacantes (≥ 2 ataques) con velocidad < 90 en Espacio Raro; de 75 a 149 en Viento Afín (desde 150, solo 0,3); con Nado Rápido, Clorofila, Ímpetu Arena, Quitanieves… o ataques del mismo tipo que potencia el clima (0,7), movimientos del clima (Trueno, Rayo Solar, Velo Aurora…) o tipos que el clima refuerza (Roca en arena, Hielo en nieve, 0,5); atacantes con mejoras de ataque o velocidad para `setup`. Nadie aprovecha su propio arquetipo.
- **Fuerza** (`archetypeStrength`, 0–1) = probabilidad de que alguien lo ponga × la parte de los aprovechadores que necesita (2 en Espacio Raro y Viento Afín, que duran cuatro turnos; 1 en el resto).
- **Lectura** (`readTeam` → `TeamReading`): los arquetipos con fuerza ≥ 0,4 (de más a menos), con quién los pone y quién los aprovecha; el **grupo** de 4 (3 en individuales) que mejor los mantiene juntos (empates por la cobertura) y, en dobles, la **pareja de salida** que arranca el plan (el control de velocidad necesita a su inductor en el campo; el clima y `setup`, a las dos piezas). Empates de pareja, por el duelo medio.

### 2. Lo que decide: el control de velocidad como parte del modelo

Primera variante: sumar puntos a la cobertura de un grupo por cada arquetipo completo (`synergy`) y al duelo medio de una pareja de salida por el plan que arranca (`leadSynergy`). **No ganaba fuerza** (ver «Resultados»): los duelos seguían jugándose sin Espacio Raro, así que los atacantes lentos seguían valiendo poco.

Se queda lo mismo que con el clima ([ADR-0016](0016-clima-en-la-vista-previa.md)): el campo es parte del **modelo**, no una bonificación.

- `Situation.withSpeedControl({ trickRoom, tailwind })`: la misma situación con Espacio Raro y Viento Afín (de un lado) exactamente así. Comparte vistas con `withWeather` (`withField`, clave por clima, terreno, `pseudoWeather` y condiciones de cada lado).
- **Dobles**: los duelos de un grupo propio se mezclan con los mismos duelos bajo el control de velocidad que pone ese grupo: `duelo + parte × (duelo con Espacio Raro − duelo)`, con `parte = fieldShare × fuerza del arquetipo en el grupo` (y lo mismo con su Viento Afín). `fieldShare` = 0,5 (dura cuatro turnos de un combate de ≈ 7). Lo mismo para predecir tus grupos (con tu Viento Afín en tu lado).
- `fieldShare` va por arquetipo (`{ trickRoom, tailwind }`) en `PREVIEW_SETTINGS`; `new ExpertAgent({ preview: { fieldShare } })` lo cambia para medir. La bonificación se quitó de los ajustes: `groupSynergy` y `leadSynergy` solo sirven a la lectura.
- La pareja de salida sigue siendo la de mejor duelo medio (ahora con el control de velocidad del grupo). Con la bonificación de líderes, el inductor salía siempre, pero tampoco ganaba fuerza: montar la salida es la E2.
- **Individuales**: sin cambios (`fieldShare` 0; la lectura se enseña).
- Coste: ≈ 14 ms por vista previa en dobles (+1–3 ms).

### 3. Explicación

- `PreviewAnalysis.teams = { rival: TeamReading; own?: TeamReading }` (core y protocol, opcional: los replays viejos siguen valiendo).
- `redactExplanation` quita `teams.own` con equipo cerrado: nombra sus movimientos y habilidades. Lo tuyo no se censura.
- La web lo cuenta con frases (`teamStory`): «Tu equipo parece de Espacio Raro: lo pone Farigiraf y lo aprovechan Torkoal y Kingambit», «Los que mejor encajan para ese plan: … con … de salida». «Parece» desde una fuerza de 0,7; por debajo, «podría ser».

### 4. Medir con tus rivales (`npm run arena -- --teams rivales`)

El arena puede jugar con un conjunto de equipos en lugar de aleatorios: tus rivales guardados del modo (`--teams rivales`) o los ficheros de una carpeta. Cada par de combates saca dos equipos distintos al azar (por semilla).

## Resultados

Arena, nivel 3 contra nivel 2 en dobles, **mismas semillas** para cada variante (50 combates por semilla; cada par de equipos dos veces cambiando de lado). «Rivales» = tus 26 rivales de dobles guardados (`--teams rivales`, semillas `p1`–`p36`); «aleatorios» = `teamgen` (semillas `a1`–`a6`, `b1`–`b6`, `c1`–`c12`, `d1`–`d12`). La base reproduce exactamente las decisiones de antes (mismo resultado combate a combate en `p1`).

| Variante | Rivales | Aleatorios |
|---|---|---|
| Base (como la fase 14 con clima) | 76,3 / 77,5 / 76,8 → **76,9 %** | 79,8 / 79,3 / 81,2 → **80,1 %** |
| Bonificación de grupo (40/30/20) y de líderes | 76,2 % (1.ª tanda) | 78,3 % |
| Campo (Espacio Raro y Viento Afín a 0,5) + bonificación de líderes | 77,7 % (1.ª tanda) | 78,3 % |
| **Campo (Espacio Raro y Viento Afín a 0,5)** | 79,7 / 78,2 / 78,0 → **78,6 %** (+1,7) | 78,5 / 78,0 / 81,2 → **79,2 %** (−0,9) |
| Solo Viento Afín (0,5) | 78,3 / 78,0 → 78,2 % (+1,3) | 79,7 / 78,3 → 79,0 % (−0,6) |
| Solo Espacio Raro (0,5) | 77,7 % (1.ª tanda) | 78,8 % |
| Espacio Raro 0,25 y Viento Afín 0,5 | 79,0 % (1.ª tanda) | 78,7 % |

- La bonificación sola no cambia nada con los rivales: los atacantes lentos seguían valiendo poco en duelos sin Espacio Raro.
- El modelo de campo gana con tus rivales en las tres tandas (+3,4, +0,7, +1,2) y pierde poco con los aleatorios (−1,3, −1,3, 0), dentro del ruido (± 2 con 600 combates por tanda). Los aleatorios llevan un inductor con Pokémon lentos por casualidad, sin plan; tus rivales, no. Se queda: los rivales guardados son los equipos que se parecen a los de verdad.
- Medir: arrancar 48 `npx tsx` a la vez funciona, pero el navegador no carga la web mientras tanto (CPU al 100 %).

## Consecuencias

- El nivel 3 en dobles trae a quien pone Espacio Raro o Viento Afín cuando su grupo tiene con quién aprovecharlo (sin el campo, dejaba fuera a Farigiraf y se quedaba con sus atacantes lentos).
- No siempre **sale** con el inductor: la pareja de salida sigue siendo la de mejor duelo medio. Valorar parejas 2 contra 2 es la E2 ([fase 16](../fases/fase-16.md)).
- `Situation.withSpeedControl` y `withWeather` son la forma de preguntar «¿y con este campo?». Los terrenos siguen sin modelarse en la vista previa.
- La lectura es heurística (listas de movimientos y umbrales de velocidad): un plan que no esté en `TEAM_ARCHETYPES` (Intimidación + Contoneo, Cola Somnífera…) no se ve.
