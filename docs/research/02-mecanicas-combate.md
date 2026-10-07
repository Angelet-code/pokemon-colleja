# Mecánicas de combate (referencia Gen 9)

> Referencia de las mecánicas "mainline" (Escarlata/Púrpura, Gen 9) que el simulador debe reproducir.
> Las diferencias propias de **Pokémon Champions** están en [01-pokemon-champions.md](01-pokemon-champions.md) y **tienen prioridad** sobre este documento.
>
> Fuentes principales: Bulbapedia (artículos *Stat*, *Damage*, *Status condition*, *Weather*, *Terrain*, *Priority*, *Critical hit*), código de Pokémon Showdown (`sim/battle.ts`, `data/conditions.ts`, `data/moves.ts`) y Smogon research. Cuando haya duda, **la implementación de Showdown es la fuente de verdad** (está contrastada con los juegos por la comunidad de investigación).

---

## 1. Estadísticas

### 1.1 Fórmula de stats (Gen 3+)

```
PS    = floor((2·Base + IV + floor(EV/4)) · Nivel / 100) + Nivel + 10
Otras = floor( (floor((2·Base + IV + floor(EV/4)) · Nivel / 100) + 5) · Naturaleza )
```

- `IV`: 0–31 por stat.
- `EV`: 0–252 por stat, 510 total. Cada 4 EV = +1 punto a nivel 100 (a nivel 50, el primer punto llega con 4 EV y luego cada 8 EV).
- `Naturaleza`: ×1.1 en la stat que sube, ×0.9 en la que baja (floor tras multiplicar). 25 naturalezas, 5 neutras.
- Shedinja siempre tiene 1 PS.
- Competitivo estándar: **nivel 50**.

> ⚠️ Champions usa un sistema propio de reparto de puntos (ver doc 01). El módulo de stats debe ser **intercambiable** (estrategia por formato).

### 1.2 Cambios de características (stages)

| Stage | −6 | −5 | −4 | −3 | −2 | −1 | 0 | +1 | +2 | +3 | +4 | +5 | +6 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Atq/Def/AtEsp/DefEsp/Vel | 2/8 | 2/7 | 2/6 | 2/5 | 2/4 | 2/3 | 1 | 3/2 | 4/2 | 5/2 | 6/2 | 7/2 | 8/2 |
| Precisión/Evasión | 3/9 | 3/8 | 3/7 | 3/6 | 3/5 | 3/4 | 1 | 4/3 | 5/3 | 6/3 | 7/3 | 8/3 | 9/3 |

Los stages se reinician al cambiar de Pokémon (salvo Relevo/Baton Pass).

---

## 2. Fórmula de daño (Gen 5+)

```
base = floor( floor( floor(2·Nivel/5 + 2) · Potencia · A / D ) / 50 ) + 2

daño = base
     × Objetivos      (0.75 si el ataque golpea a >1 objetivo en dobles)
     × Amor Filial    (0.25 en el 2º golpe)
     × Clima          (1.5 / 0.5)
     × Crítico        (1.5)
     × Aleatorio      (entero 85..100, /100, floor)
     × STAB           (1.5; 2.0 con Adaptable; reglas especiales con Tera)
     × Tipo           (0, 0.25, 0.5, 1, 2, 4)
     × Quemadura      (0.5 si físico y el atacante está quemado; no con Agallas ni Fachada)
     × Otros          (pantallas, objetos, habilidades… encadenados)
```

Detalles importantes de implementación:

- Los modificadores se aplican en **aritmética de punto fijo sobre 4096** (`chainModify`) y se redondean con *pokeRound* (redondeo "half down": 0.5 baja). Ej.: Vidasfera = 5324/4096, Cinta Elegida = 6144/4096.
- Hay modificadores sobre **Potencia** (base power), sobre **Ataque**, sobre **Defensa** y sobre el **daño final**; cada grupo se encadena por separado. Showdown los modela como eventos `onBasePower`, `onModifyAtk`, `onModifyDef`, `onModifyDamage`.
- Daño mínimo 1 (salvo inmunidad).
- Crítico: ignora stages negativos de ataque del atacante y positivos de defensa del defensor, e ignora pantallas. La quemadura **sí** se aplica.

### 2.1 Probabilidad de crítico (Gen 7+)

| Nivel de crítico | 0 | +1 | +2 | ≥+3 |
|---|---|---|---|---|
| Probabilidad | 1/24 | 1/8 | 1/2 | 1 |

Fuentes: movimientos con índice de crítico alto (+1), Foco Energía (+2), Aguzar/Laser Focus (crítico seguro el turno siguiente), Afortunado/Super Luck (+1), objetos Periscopio/Scope Lens y Garra Afilada/Razor Claw (+1). Francotirador/Sniper sube el multiplicador a ×2.25.

### 2.2 Precisión

`acierto si random(100) < precisión_mov × mult(stage_precisión − stage_evasión)` (stages combinados, limitados a ±6). Movimientos con precisión `true` (—) nunca fallan.

---

## 3. Orden de turno

1. **Selección** de acción de todos los combatientes (movimiento / cambio / Mega / Tera…).
2. **Cambios** (siempre antes que cualquier movimiento).
3. **Transformaciones** de inicio de turno (Mega Evolución, Teracristalización…) en orden de velocidad.
4. **Movimientos** ordenados por:
   1. **Prioridad** (−7 a +5).
   2. Modificadores dentro del bracket (Garra Rápida, Mano Rápida/Quick Draw, Baya Chiri/Custap; Rezagado/Stall y Cola Plúmbea al final…).
   3. **Velocidad** efectiva (Espacio Raro invierte el orden dentro del bracket).
   4. **Empate de velocidad**: aleatorio.
   - Desde Gen 8 el orden se **recalcula dinámicamente** tras cada acción (si alguien cambia de velocidad a mitad de turno, afecta a los que aún no han actuado).
5. **Efectos de final de turno** (residuales) en un orden fijo: clima, Deseo, Restos/Lodo Negro, Drenadoras, daño de estado, Maldición, ataduras, contadores de pantallas/campos… El orden exacto se toma de `residualOrder` en Showdown.
6. **Sustituciones** de Pokémon debilitados.

### 3.1 Brackets de prioridad (ejemplos)

| Prioridad | Movimientos |
|---|---|
| +5 | Refuerzo (Helping Hand) |
| +4 | Protección, Detección, Escudo Real, Barrera Espinosa… |
| +3 | Sorpresa (Fake Out), Vastaguardia (Wide Guard), Anticipo (Quick Guard) |
| +2 | Velocidad Extrema, Señuelo (Follow Me), Polvo Ira (Rage Powder), Amago |
| +1 | Ataque Rápido, Acua Jet, Golpe Bajo, Shuriken de Agua… |
| 0 | La mayoría |
| −3 | Puño Certero |
| −4 | Alud, Desquite |
| −5 | Contraataque, Manto Espejo |
| −6 | Rugido, Remolino, Cola Dragón, Llave Giro |
| −7 | Espacio Raro (Trick Room) |

Habilidades que alteran prioridad: Bromista (+1 a estado; falla contra tipo Siniestro), Alas Vendaval (+1 Volador a PS llenos), Primer Auxilio/Triage (+3 curación). Campo Psíquico bloquea movimientos con prioridad contra Pokémon en el suelo.

---

## 4. Problemas de estado

### 4.1 No volátiles (persisten tras el cambio; solo uno a la vez)

| Estado | Efecto | Inmunes |
|---|---|---|
| **Quemado** | −1/16 PS por turno; daño físico ×0.5 | Tipo Fuego |
| **Envenenado** | −1/8 PS por turno | Veneno, Acero (salvo Corrosión) |
| **Gravemente envenenado** | −n/16 PS (n = 1,2,3…); n se reinicia al cambiar | Veneno, Acero |
| **Paralizado** | 25% de no moverse; Velocidad ×0.5 | Tipo Eléctrico |
| **Dormido** | No actúa 1–3 turnos (contador oculto) | Campo Eléctrico / Niebla en el suelo, Insomnio, Espíritu Vital… |
| **Congelado** | No actúa; 20% de descongelarse cada turno; ataques de Fuego lo descongelan | Tipo Hielo, sol |

### 4.2 Volátiles (desaparecen al cambiar)

Confusión (2–5 turnos, 33% de autogolpe de 40 de potencia físico sin tipo), Retroceso (flinch), Mofa (3 turnos), Otra Vez (Encore, 3 turnos), Drenadoras (1/8), Sustituto (cuesta 1/4 PS), Maldición fantasma (1/4), Atadura (1/8, 4–5 turnos), Enamoramiento, Tormento, Anulación, Canto Mortal (Perish Song), Bostezo, Foco Láser, Carga, Protección (cadena: probabilidad de éxito 1/3ⁿ en usos consecutivos)…

---

## 5. Climas y campos

### 5.1 Clima (5 turnos; 8 con roca correspondiente)

| Clima | Efectos |
|---|---|
| **Sol** | Fuego ×1.5, Agua ×0.5; no se puede congelar; Rayo Solar sin carga |
| **Lluvia** | Agua ×1.5, Fuego ×0.5; Trueno/Vendaval 100% precisión |
| **Tormenta de arena** | −1/16 PS a quien no sea Roca/Tierra/Acero; Roca DefEsp ×1.5 |
| **Nieve** (Gen 9) | Hielo Def ×1.5; Ventisca 100% precisión; sin daño residual |

Climas extremos (Tierra del Ocaso / Mar del Albor / Ráfaga Delta) solo con habilidades primigenias.

### 5.2 Campos / Terrenos (5 turnos; 8 con Cubrecampos)

Afectan solo a Pokémon **en el suelo** (no Volador, Levitación, Globo Helio…).

| Campo | Efectos |
|---|---|
| **Eléctrico** | Eléctrico ×1.3; impide dormir |
| **Hierba** | Planta ×1.3; cura 1/16 al final del turno; Terremoto/Magnitud/Terratemblor ×0.5 |
| **Psíquico** | Psíquico ×1.3; bloquea prioridad contra objetivos en el suelo |
| **Niebla** | Dragón ×0.5 contra objetivos en el suelo; impide estados no volátiles y confusión |

### 5.3 Pantallas y salas

- **Reflejo / Pantalla Luz / Velo Aurora**: daño ×0.5 en individuales, ×2732/4096 (~0.667) en dobles. 5 turnos (8 con Refleluz/Light Clay). Velo Aurora requiere nieve.
- **Viento Afín (Tailwind)**: Velocidad ×2 durante 4 turnos (el turno en que se usa cuenta).
- **Espacio Raro (Trick Room)**: 5 turnos, los más lentos actúan primero dentro de cada bracket.
- **Gravedad, Zona Mágica (Magic Room), Zona Extraña (Wonder Room)**: 5 turnos.

### 5.4 Peligros de entrada

Trampa Rocas (1/8 × efectividad Roca), Púas (1/8, 1/6, 1/4 según capas), Púas Tóxicas (envenena / envenena gravemente), Red Viscosa (−1 Vel).

---

## 6. Dobles: particularidades

- **Ataques de área (spread)**: daño ×0.75 si golpean a más de un objetivo.
- **Tipos de objetivo** (nomenclatura Showdown, útil para el UI de selección):

| `target` | Significado |
|---|---|
| `normal` | Un Pokémon adyacente (aliado o rival) |
| `adjacentFoe` | Un rival adyacente |
| `any` | Cualquiera (en triples importa; en dobles = normal) |
| `allAdjacentFoes` | Ambos rivales (spread) |
| `allAdjacent` | Todos los adyacentes, aliado incluido (Terremoto) |
| `self`, `adjacentAlly`, `adjacentAllyOrSelf` | Usuario / aliado |
| `allySide`, `foeSide`, `all` | Lado propio / lado rival / campo |
| `randomNormal` | Rival aleatorio (Enfado, Golpe Furia…) |

- **Redirección**: Señuelo, Polvo Ira, Pararrayos, Colector.
- **Soporte clave**: Refuerzo (×1.5), Vastaguardia, Anticipo, Sorpresa, Cambio Banda (Ally Switch), Viento Afín, Espacio Raro, Intimidación.
- Si el objetivo elegido ya no está, el movimiento se redirige al otro rival si es posible (`normal`/`adjacentFoe`).

---

## 7. Habilidades y objetos: modelo de eventos

Showdown modela habilidades, objetos, movimientos y condiciones como **manejadores de eventos** (`onSwitchIn`, `onModifyAtk`, `onBasePower`, `onDamagingHit`, `onResidual`, `onTryHit`, `onFoeTryMove`…) con prioridades y órdenes. Este es el patrón a seguir: **datos declarativos + hooks** en lugar de `if` dispersos por el motor.

Objetos competitivos frecuentes (lista definitiva según Champions en doc 01): Restos, Vidasfera, Cinta/Gafas/Pañuelo Elegido, Banda Focus, Chaleco Asalto, Mineral Evolutivo, Casco Dentado, Seguro Debilidad, Baya Zidra, bayas de reducción de daño, Cinta Experto, Hierba Blanca/Mental/Copia, Capa Furtiva, Amuleto Puro, Dado Trucado, Energía Potenciadora, Megapiedras…

---

## 8. Formato de equipos (estándar de facto: Showdown "export")

```
Garchomp @ Life Orb
Ability: Rough Skin
Level: 50
EVs: 32 Atk / 2 SpD / 32 Spe
Jolly Nature
- Earthquake
- Dragon Claw
- Rock Slide
- Protect
```

En los formatos Champions de Showdown la línea `EVs:` contiene **Stat Points** (máx. 32 por stat, 66 en total), no EVs; no hay `Tera Type` ni `IVs` (fijos a 31). En Gen 9 clásico la misma línea serían EVs reales (p. ej. `252 Atk / 4 SpD / 252 Spe`).

Soportar importación/exportación en este formato desde el primer día: permite copiar equipos desde Showdown, Pikalytics, Victory Road, etc.
