# Banco de pruebas de equipos

El banco juega **tu equipo guardado contra tus rivales guardados**, bot contra bot, y da el **% de victorias por rival y en total** con su intervalo de confianza. También compara **dos versiones** de un equipo en pares. Sirve para pasar de «creo que mi equipo es bueno» a un número y ver contra qué rival flojea.

Diseño y cifras: [ADR-0013](../adr/0013-banco-de-pruebas-con-hilos.md).

## En la web (`/banco`)

1. **Tu equipo**: uno guardado y legal.
2. **Comparar con** (opcional): otro equipo guardado o una versión pegada como texto. Es la **versión B**; tu equipo es la A.
3. **Modo** y **rivales**: por defecto, todos los rivales legales del modo (en «Ambos», todos). Puedes quitar los que no quieras.
4. **Niveles**: el de tu bot y el de los rivales, entre Táctico (2) y Experto (3). Con los dos en Experto la diferencia la marca el equipo. La dificultad guardada de cada rival no se usa.
5. **Precisión**:
   - **± 10** (por defecto) o **± 5**: para cuando el intervalo del total (o de la diferencia B − A) llega a ese margen. ± 5 cuesta unas 4 veces más combates.
   - **Fijo**: un número de combates por rival.

La tabla se llena en vivo, con el rival más flojo arriba (en A/B, donde B pierde más). Cada fila tiene un botón para **jugar contra ese rival**, que abre «Nuevo combate» con tu equipo, ese rival y su nivel. Se puede **cancelar**, y lo jugado se guarda igual.

Cada banco terminado o cancelado va al **historial del equipo**, con la configuración y los equipos tal como estaban. Desde ahí se puede abrir o borrar.

Un banco a la vez: usa todos los núcleos menos uno. El servidor sigue atendiendo mientras tanto.

## En la terminal

```bash
npm run bench -- --team "Collejas pingüi"                                # sus rivales del modo, ± 5
npm run bench -- --team v1.json --versus v2.json --margin 5              # A/B en pares
npm run bench -- --team <id> --opponents <id,nombre> --battles 20        # combates fijos
npm run bench -- --team v1.json --screen v2.json,v3.json,v4.json        # criba con el nivel 2 y A/B de las dos mejores
npm run bench:calc -- --team "Collejas pingüi" --member jolteon         # matriz de daño, sin combates
npm run bench -- --help
```

- `--team`/`--versus` aceptan un id o un nombre de equipo guardado, o un fichero (JSON guardado, `{ "members": […] }` o texto exportado). Los rivales siempre son los guardados (`--opponents all` por defecto: los del modo).
- `--level`/`--rival-level` (0–3, por defecto 3), `--min` (6), `--max` (40 por rival y modo), `--seed`, `--threads` (0: sin hilos) y `--json <fichero>` (resultado completo).
- `STORAGE_DIR` cambia la carpeta de equipos y rivales, como en el servidor.
- Los combates con error salen al final con su semilla. Para reproducir uno: `BattleSession.create` con esa semilla, los dos equipos y el equipo en el lado indicado. Los bots usan las semillas `<semilla>:team` y `<semilla>:opponent`.

## Flujo recomendado para afinar un equipo

Con el nivel 3 contra el 3, cada decisión cuesta ≈ 0,5 s (con 15 hilos; ≈ 1 s antes de la [fase 13](../adr/0014-nivel-3-mas-rapido-con-poda.md)). Una A/B contra 20 rivales con ± 5 tarda ≈ 7 min (antes ≈ 14). Para ir más rápido:

1. **`bench:calc`** para descartar sets malos sin combatir: a quién no haces daño y quién te tumba de un golpe.
2. **Criba con el nivel 2** (`--screen`, ≈ 1 min por variante con 2000 combates): las dos mejores pasan a la A/B. Comprobado en la fase 12: el nivel 2 coloca arriba las mismas dos variantes que el nivel 3.
3. **A/B con el nivel 3** entre las finalistas. Con ± 10 tarda ≈ 4 min contra 20 rivales (manda el mínimo de 6 combates por rival; ≈ 8 min antes de la fase 13); con tu bot en 3 contra rivales en 2, menos aún, pero ojo: con rivales en nivel 2 cambia lo que se mide (en la fase 12, v1 y v2 empataban así y con los dos en 3 ganaba v1), así que la decisión final, con los dos en 3. Con menos rivales, proporcionalmente menos.
4. Si la diferencia queda dentro del ruido, las versiones son equivalentes contra esos rivales: elige por otros motivos.

## Cómo funciona

- **Combate entre bots**: `playBotBattle` (engine), el mismo que usa el arena.
- **Hilos**: `WorkerPool` (`node:worker_threads`) con una cola de combates sueltos. Cada hilo libre coge el siguiente y nadie espera al más lento.
- **Semillas**: cada combate depende solo de `semilla:rival:modo:índice`. El lado de tu equipo alterna (p1 en los pares, p2 en los impares) para anular la ventaja de lado.
- **Rondas**: primero 6 combates por rival y modo. Después, rondas que van a los rivales más inciertos (reparto de Neyman). Tras cada ronda se comprueba si el intervalo ya está dentro del margen. En A/B también se para si la diferencia ya es claramente distinta de 0, con un umbral corregido por el número de veces que se mira.
- **Especulación**: mientras se cierra una ronda, los hilos libres juegan la siguiente tal como la predicen los resultados parciales. Solo cuenta lo que el plan real incluye, así que **la tabla es la misma con cualquier número de hilos**.
- **Total**: la media de los rivales (cada rival y modo pesa igual), no de los combates.
- **A/B**: las dos versiones juegan cada combate con la misma semilla, el mismo lado y los mismos bots, y se mide la diferencia en cada par. Con dos versiones iguales, la diferencia es exactamente 0.
- **Errores**: un combate que el bot no puede terminar (p. ej. manda `pass` donde no toca) no cuenta en el %. Se informa aparte con su semilla.

## Código

| Sitio | Qué hay |
|---|---|
| `packages/engine/src/bot-battle.ts` | `playBotBattle`, `TimedAgent` |
| `packages/bench/src/stats.ts` | Wilson, diferencias en pares, total por estratos, Neyman, regla de parada |
| `packages/bench/src/scheduler.ts` | `BenchScheduler`: plan por rondas y especulación (puro) |
| `packages/bench/src/bench.ts` | `runBench`, `planStrata` (rivales ilegales saltados) |
| `packages/bench/src/pool.ts`, `worker.ts`, `worker-entry.mjs` | Hilos de trabajo |
| `packages/bench/src/damage-matrix.ts` | `damageMatrix` (`bench:calc`) |
| `apps/server/src/bench/` | `BenchManager` y `FileBenchRepository` (`storage/bench/`) |
| `apps/server/src/routes/bench.ts`, `bench-socket.ts` | `/api/bench` y `/ws/bench` |
| `packages/protocol/src/bench.ts` | Esquemas (replican los tipos de `@colleja/bench`) |
| `apps/web/src/features/bench/` | Página, tabla y formulario (`bench-form.ts`, puro y testeado) |
| `tools/bench/` | `npm run bench` y `npm run bench:calc` |
