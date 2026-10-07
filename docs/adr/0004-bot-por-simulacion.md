# ADR-0004 — Bot táctico por simulación de daño esperado

- **Estado**: Aceptado (2026-10-07)
- **Guía operativa**: [docs/guias/bot.md](../guias/bot.md)

## Contexto

La fase 4 pedía dos niveles nuevos de bot y medirlos con un arena:

- **Nivel 1 (agresivo)**: el máximo daño esperado cada turno.
- **Nivel 2 (táctico)**: el nivel 1 más heurísticas (cambios, Protección, Sorpresa, control de velocidad, estados con valor, coordinación en dobles…).

El brief proponía construir el nivel 2 como el 1 más **bonificaciones heurísticas** por movimiento (p. ej. "+40 a Fuego Fatuo contra un atacante físico", "×(1 − probabilidad de caer antes) al daño"). Se implementó así primero y se midió en el arena:

| Versión del nivel 2 | 2 contra 1, individuales | 2 contra 1, dobles |
|---|---|---|
| Bonificaciones heurísticas (diseño del brief) | 49 % | 57 % |
| Simulación de daño esperado (esta decisión) | **60 %** (1000 combates, IC 57–63 %) | **68 %** |

Con bonificaciones, el nivel 2 no superaba al 1: los pesos eran arbitrarios, no se podían comparar entre sí (¿cuánto vale una quemadura frente a un 40 % de daño?) y cada regla nueva estropeaba otra (el factor de supervivencia empujaba a usar movimientos de estado justo cuando no servían).

## Decisión

1. **El nivel 2 valora cada opción simulando sus consecuencias con daño esperado** (`@smogon/calc`), no con bonificaciones:
   - **Individuales** (`analysis/duel.ts`, `singles-plan.ts`): un duelo entre el Pokémon activo (o el que entra al cambiar) y el rival, turno a turno, con orden por prioridad y velocidad, precisión, retroceso y drenaje, quemadura, parálisis, sueño, Restos, Vida Esfera, bloqueo de objetos Elección y movimientos de primer turno. Si el nuestro cae, el mejor del banquillo termina el duelo. El valor es el balance material (PS propios menos PS rivales).
     - Así se valoran de forma homogénea ataques, mejoras de características, estados, recuperación, Protección, Sorpresa y los cambios (el que entra recibe el golpe que iba para el otro).
     - Trampas, pantallas y control de velocidad se valoran aparte con una estimación fija (no se modelan en el duelo).
   - **Dobles** (`doubles-sim.ts`, `doubles-plan.ts`): se prueba cada pareja de acciones para las dos posiciones y se simulan 3 turnos 2 contra 2. El primer turno usa la pareja; en los siguientes, todos usan su mejor ataque. Cubre concentrar ataques, Protección, Sorpresa, Refuerzo, Señuelo, Viento Afín, Espacio Raro, pantallas, ataques en área que dañan al aliado, estados y cambios.
   - La vista previa elige el grupo que **mejor cubre** a cada especie rival (matriz de duelos), y los relevos tras un KO, el que gana su duelo.
2. **Información oculta**: el bot no conoce los sets del rival (decisión de producto). El modelo del rival (`opponent-model.ts`) filtra los sets estándar por lo revelado (objeto, habilidad, movimientos, Mega) y los ordena **del más ofensivo al menos**: el bot se prepara para lo peor. El nivel 2 promedia cada opción sobre los 3 sets más plausibles. Con equipo abierto usa el set real.
   - `BattleView` (core) registra ahora también los objetos y habilidades revelados por etiquetas `[from] item:` / `[from] ability:` (Vida Esfera, Restos, Intimidación…), el turno de entrada y el último movimiento de cada Pokémon.
   - Un rival que lleva su megapiedra se supone ya megaevolucionado (lo hará en cuanto pueda).
3. **El nivel 1 es el greedy del brief** (máximo daño esperado más bonus de KO, prioridad que asegura KO, nunca golpea al aliado salvo que sea inmune, Mega en cuanto puede). `TacticalAgent` hereda de `AggressiveAgent` y recurre a él si no hay nada que simular.
4. **`@smogon/calc` 0.12.0 es dependencia de `@colleja/bot`** (apto para navegador). Un test contrasta sus stats con `championsStats` en todos los sets estándar y su daño con el que hace el motor en primeros golpes de combates reales.

## Consecuencias

- Cada decisión del nivel 2 cuesta ≈3 ms (individuales y dobles): 500 combates por modo caben en menos de un minuto.
- Añadir una mecánica al bot significa modelarla en la simulación (un efecto más en `duel.ts` o `doubles-sim.ts`), no inventar un peso. Los pesos que quedan son pocos y con unidades claras (% de PS, bonus de KO).
- La simulación es una aproximación: no modela cambios del rival, golpes críticos, efectos secundarios con probabilidad ni volátiles (Sustituto, Mofa…). El nivel 3 (futuro) puede usar el motor real (`Battle.toJSON`/`fromJSON`) para mirar jugadas por delante.
- El rendimiento contra humanos dependerá de lo bien que se adivinen los sets. El modelo pesimista evita sorpresas graves, a costa de jugar a veces demasiado conservador.

## Alternativas descartadas

- **Bonificaciones heurísticas por movimiento** (diseño inicial del brief): medido y descartado, ver la tabla.
- **Lookahead con el motor real** (`Battle.fromJSON` y probar elecciones): mucho más fiel, pero 2–3 órdenes de magnitud más lento y necesita muestrear los sets ocultos. Queda para el nivel 3.
- **Elegir el set rival más probable en vez del más ofensivo**: en las pruebas, subestimar la amenaza (p. ej. un Metagross "de apoyo" que resultaba ser atacante) costaba más combates que sobreestimarla.
