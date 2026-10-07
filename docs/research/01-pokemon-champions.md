# Pokémon Champions: reglas, roster y diferencias con Gen 9

> Investigación del **2026-10-07**, con el juego en **v1.2.x** y la **Regulación M-C** vigente.
> Las reglas de este documento **prevalecen** sobre las mecánicas genéricas de [02-mecanicas-combate.md](02-mecanicas-combate.md).
> La fuente que más pesa es el mod `champions` de Pokémon Showdown (último commit al mod: 2026-10-05). Se ha contrastado con los avisos oficiales (news.pokemon-home.com) y con WikiDex.
>
> Anexos: [roster completo M-C](anexos/champions-roster-regmc.md) · [objetos M-C](anexos/champions-objetos-regmc.md)

---

## 1. Datos generales

| | |
|---|---|
| Lanzamiento | Switch: 2026-04-08 (mejorado en Switch 2). iOS/Android: 2026-06-17, con juego cruzado |
| Modelo | Free-to-play (pack inicial de pago opcional en Switch) |
| Desarrolladora | The Pokémon Works |
| Versión | **1.2.0** (2026-09-08), 1.2.1 en App Store. Mantenimientos sin número de versión el 09-11, el 09-16 y el 10-07 |
| VGC | **Plataforma oficial de VGC** (Regionales desde mayo 2026, Mundial 2026). Los Global Challenges online de la temporada 2027 usan Reg M-C Dobles |

### 1.1 Regulaciones

| Regulación | Vigencia | Cambios principales |
|---|---|---|
| M-A | 2026-04-08 → 06-17 | Roster de lanzamiento: 186 especies y 59 Megas |
| M-B | 06-17 → 09-09 | +22 especies, +16 Megas, +31 objetos |
| **M-C (vigente)** | **09-09 → 2026-12-02** | +23 especies, +6 Megas, +18 objetos. Temporadas M-6, M-7 y M-8 |

La temporada ranked M-7 va del 2026-10-07 al 2026-11-04.

---

## 2. Roster (Reg M-C)

- **231 especies** (números de Pokédex distintos): 186 en M-A, +22 en M-B y +23 en M-C.
- **81 Megaevoluciones oficiales**. Showdown cuenta 82 porque separa Mega Meowstic ♂ y ♀.
  - Incluye Megas nuevas de Leyendas Z-A, por ejemplo Mega Raichu X/Y, Mega Meganium, Mega Feraligatr, Mega Excadrill y Mega Baxcalibur.
  - M-C añade Mega Absol Z, Mega Garchomp Z, Mega Lucario Z, Mega Salamence, Mega Golisopod y Mega Baxcalibur.
- **Formas regionales y alternativas**: Raichu, Ninetales y Persian de Alola; formas de Hisui; Slowbro, Slowking y Stunfisk de Galar; Tauros de Paldea; formas de Rotom; Lycanroc; tamaños de Gourgeist; Toxtricity Grave; hembras de Indeedee, Meowstic y Basculegion; Floette Eterna…
- **Sin legendarios restringidos ni singulares.** Pikachu es el único Pokémon no completamente evolucionado.
- Todas las entradas parecen legales en Reg M-C: los formatos VGC y BSS M-C de Showdown permiten todo el roster del mod. La página oficial de elegibilidad no se pudo abrir desde esta red.

Tabla completa (353 filas, con la regulación en que se añadió cada una y su megapiedra): [anexos/champions-roster-regmc.md](anexos/champions-roster-regmc.md).

> En el código, la legalidad **no se copia a mano**: se genera desde `data/mods/champions/formats-data.ts` de Showdown en el pipeline de datos (ver PLAN, fase 2). El anexo solo sirve como referencia legible.

---

## 3. Estadísticas: Stat Points en lugar de IVs/EVs ⚠️

**Champions no tiene EVs, y los IVs están fijos en 31.** El validador de Showdown rechaza cualquier otro valor. Todo se calcula a **nivel 50**.

| Concepto | Regla |
|---|---|
| **Stat Points (SP)** | Máx. **66 en total**, máx. **32 por stat** |
| PS | `Base + SP + 75` |
| Resto | `floor((Base + SP + 20) × Naturaleza)` (×1.1 / ×0.9 / ×1.0) |
| Equivalencia con mainline | Igual que nivel 50 con IV 31: el primer SP equivale a 4 EV y cada SP siguiente a 8 EV. Es la regla de conversión de HOME |
| Naturalezas | Se cambian libremente (500 VP). Según WikiDex solo **Seria** es neutra; Fuerte, Dócil, Tímida y Rara no están (sin confirmar en fuente oficial) |
| Habilidades | Cualquiera de la especie, oculta incluida (500 VP) |
| Coste en menús | 250 VP por movimiento, 5 VP por SP. Irrelevante para el simulador |

**Impacto en el diseño:** el teambuilder reparte **SP**, no EVs. Showdown guarda los SP en el campo `evs` del set, así que el formato export sigue siendo compatible. El cálculo de stats se aísla en una **estrategia por formato** (`ChampionsStatCalculator` frente a `ClassicStatCalculator`), de modo que añadir un modo clásico con IVs/EVs más adelante sea trivial.

---

## 4. Mecánicas de combate distintas a Escarlata/Púrpura

### 4.1 Mecánicas especiales

- **Solo Mega Evolución**, una vez por combate. Las Megas no revierten al debilitarse.
- **No hay** Teracristalización, Dinamax ni Movimientos Z: aparecen insinuados en el juego pero no se pueden usar.
- Habilidades nuevas de las Megas de Z-A:

| Habilidad | Mega |
|---|---|
| Mega Sol | Mega Meganium |
| Dragonize | Mega Feraligatr |
| Piercing Drill | Mega Excadrill |
| Eelevate | Mega Eelektross |
| Fire Mane | Mega Pyroar |
| Spicy Spray | Mega Scovillain |

### 4.2 Problemas de estado

| Estado | Gen 9 | **Champions** |
|---|---|---|
| Parálisis | 25 % de no moverse | **12,5 % (1/8)**. La velocidad sigue ×0,5 |
| Sueño | 1–3 turnos | Contador sacado de [2, 3, 3]: **duerme 1 turno (1/3) o 2 turnos (2/3)** |
| Congelación | 20 % de descongelarse por turno | **25 % por turno, y siempre se descongela al 3.er turno** |

En el juego no se encontró ninguna Sleep Clause. Las "Flat Rules" de Showdown tampoco la incluyen, aunque falta confirmarlo.

### 4.3 PP

PP fijos de **8, 12, 16 o 20** cuando el PP base mainline es 5, 10, 15 o 20+. No hay Más PP.

- Con 8 PP: Protección, Detección, Escudo Real, Barrera Espinosa, Búnker, Tormenta de Arena, Paisaje Nevado, Deseo, Absorbefuerza y Pico Cañón.
- Con 20 PP: Tajo Umbrío.

### 4.4 Movimientos modificados (≈515 movimientos legales)

**Más potencia:**

| Movimiento | Potencia |
|---|---|
| Ácido Málico, Fuerza G., Látigo Ígneo | 80 → 90 |
| Asalto Barrera | 70 → 90 |
| Mountain Gale (Avalugg de Hisui) | 100 → 120 |
| Patada Tropical | 70 → 85 |
| Cuchillada | 70 → 80 |
| Escaramuza | 90 → 100 |
| Pico Cañón | 100 → 120 |
| Puntada Sombría | 80 → 90 |
| Pulso Noche | 85 → 90 |
| Disparo Certero | 80 → 85 |
| Ataque Óseo | 25 → 30 |
| Marcha Espectral | 60 → 65 |
| Asalto Estelar (Meteor Assault) | 150 → 170 |

**Peores:**

- Fiebre Dorada: 95 % de precisión y −2 AtEsp.
- Fuerza Lunar: 10 % de bajar AtEsp.
- Cabeza de Hierro: 20 % de retroceso.
- Liofilización: ya no congela.
- Garra Nociva: 30 % de causar estado.
- Salazón: la mitad de daño (1/16, o 1/8 contra Agua/Acero).

**Otros cambios:**

- Martillazo y Bomba Caramelo: +5 de precisión.
- Desarrollo pasa a ser tipo Planta; Cepo pasa a ser tipo Acero.
- Hilo Venenoso baja la velocidad 2 niveles.
- Batido puede dirigirse a un aliado.
- Movimientos que pasan a contar como cortantes: Garra Brutal, Garra Dragón, Garra Umbría, Garra Metal y Garra Nociva. Double Shock cuenta como puño. Aullido y Bramido Dragón cuentan como sonido.
- **Sorpresa y Escaramuza no se pueden elegir después del primer turno.**
- Maldición, Otra Vez y Anulación funcionan distinto.
- Vuelven: Escudo Real, Octopresa, Electrificación, Gas Corrosivo y Halloween.
- Parche 1.2.0: Politoed pierde Destructor; Archaludon pierde Manto Espejo y Repr. Metal; Cuchillada pasa a ser usable; Deseo y Absorbefuerza bajan de 12 a 8 PP.

> Los nombres en español se han traducido para este documento y se verificarán contra los datos i18n de PokeAPI. Los identificadores de Showdown (en inglés) son la referencia canónica en el código.

### 4.5 Habilidades modificadas

- Puño Invisible: los movimientos de contacto atraviesan Protección, pero con daño **×0,25**.
- Alma Cura: 50 % de probabilidad (antes 30 %).
- Fuga: ignora los efectos que impiden huir o cambiar.
- Cura Natural y Regeneración se activan sin revelar la habilidad.
- Retirada y Huida: cambian las condiciones de activación.
- Potencia Bruta ya no anula Cólera, Hurto ni Botón Escape.
- El contador de Puño Furia se reinicia al cambiar de Pokémon.

### 4.6 Objetos

- **166 objetos**: 56 objetos de mano, 28 bayas, Gema Normal y 81 megapiedras. Rige la **Item Clause** (no se puede repetir objeto).
- **No están**: Cinta Elegida, Gafas Elegidas, Chaleco Asalto, Energía Potenciadora, Seguro Debilidad, Amuleto Puro, Capa Furtiva, Gafa Protectora, Dado Trucado, Mineral Evolutivo, Toxisfera, Llamasfera, Hierba Copia, Espray Bucal, Lodo Negro, Mochila Escape, Servicio Suite, Paracontacto, Guante de Boxeo, Escudo Habilidad y Botas Gruesas, entre otros.
- **Pañuelo Elegido es el único objeto "Elegido".**
- M-C añade: Puerro, Casco Dentado, Globo Helio, Tarjeta Roja, Banda Atadura, Botón Escape (con lógica propia de Champions), Gema Normal, Cubrecampos y las cuatro semillas de campo.

Lista completa con efectos: [anexos/champions-objetos-regmc.md](anexos/champions-objetos-regmc.md).

---

## 5. Formatos y reglas de combate

| | Individuales | Dobles |
|---|---|---|
| Equipo | 6 | 6 |
| Selección tras la vista previa | **3** | **4** |
| Nivel | 50 (auto) | 50 (auto) |
| Cláusulas | Especies, Objetos | Especies, Objetos |
| ID en Showdown | `gen9championsbssregmc` | `gen9championsvgc2026regmc` (Bo3: `…regmcbo3`) |

- La vista previa del equipo muestra **solo las especies**.
- **Tiempos**: 20 min en total, 7 min por jugador, 45 s por turno y 90 s para la vista previa. Si se acaba el tiempo total, gana quien tenga más Pokémon y, si empatan, más PS.
- **Los PS del rival se ven como porcentaje** (redondeado hacia abajo). La UI tiene que respetarlo: PS exactos para los nuestros y porcentaje para los del rival.
- **Open Team Sheets** solo en eventos presenciales de Play! (sin stats ni naturaleza). En ranked no se usan.
- Otros formatos de Showdown para Champions: `gen9championsou`, `gen9championsuu`, `gen9championsrandombattle`, `gen9championsrandomdoublesbattle`, `gen9championscustomgame`, `gen9championsdoublescustomgame` y varios formatos draft.

**Implicaciones para el modo práctica:**

- Temporizadores **desactivados por defecto**, con opción de activarlos.
- Opción **"ver equipo rival completo"**, para practicar con información abierta.
- Elegir entre la vista previa de 6 → 3/4 o empezar directamente con 3/4 fijos.

---

## 6. Disponibilidad de datos

| Fuente | Qué aporta | Estado |
|---|---|---|
| Showdown `data/mods/champions/` | Roster, learnsets, objetos, movimientos, habilidades, reglas y **lógica** | ✅ Al día (M-C) |
| Showdown `data/random-battles/champions/` | Sets de random battle individuales y dobles (342 especies) | ✅ |
| @smogon/calc (`Generations.get(0)`) | Calculadora de daño con soporte Champions | ✅ M-C (2026-09-09) |
| pkmn/smogon | Sets y estadísticas de uso de VGC y BSS de Champions | ✅ Refresco diario |
| PokeAPI (version group `champions`, id 32) | Learnsets de 319 entradas y nombres en español | ⚠️ Sin verificar si está al día con M-C |
| news.pokemon-home.com (`/en/json/list.json`) | Avisos oficiales | ✅ |
| Serebii, Bulbapedia, Smogon, Victory Road, pokemon.com | Referencia manual | ⛔ Bloqueados por el filtro de red (Sophos) desde este equipo |

> **Nota de red:** en este equipo, Sophos filtra el DNS de varios sitios e intercepta TLS. npm y GitHub funcionan sin problema (comprobado). Los scripts de datos deben descargar desde GitHub (raw o git) y no desde los dominios bloqueados.

---

## 7. Dudas abiertas

- Comportamiento real en el juego de los casos raros que Showdown no modela.
- Qué naturalezas existen exactamente y su nombre oficial ("stat alignment" en inglés, sin confirmar).
- Qué regulación se usó en el Mundial 2026.
- Qué variantes cosméticas existen en el juego (por ejemplo, los diseños de Vivillon).
- Si existe alguna Sleep Clause en el juego.

---

## Fuentes

- https://github.com/smogon/pokemon-showdown/tree/master/data/mods/champions (+ `championsregmb`, `config/formats.ts`, `sim/team-validator.ts`, `sim/dex-formats.ts`)
- https://news.pokemon-home.com/en/page/817.html (v1.2.0) · /816.html (Reg M-C) · /821.html (roster M-C) · /751.html y /776.html (M-A y M-B) · /844.html (mantenimiento 10-07) · /848.html (Global Challenge II)
- https://www.wikidex.net/wiki/Entrenamiento_en_Pok%C3%A9mon_Champions
- https://www.wikidex.net/wiki/Lista_de_Pok%C3%A9mon_de_Pok%C3%A9mon_Champions
- https://champdex.com/guides/stat-points
- https://pocketmonsters.net/news/9606 (temporada M-7)
- https://www.pokeginer.com/en/guides/version-updates/
- https://en.wikipedia.org/wiki/Pok%C3%A9mon_Champions
- https://victoryroad.pro/champions-regulations/ (solo el resumen del buscador)
