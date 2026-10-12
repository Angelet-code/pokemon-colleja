# ADR-0020 — Animaciones de combate propias, por plantillas

- **Estado**: Aceptado (2026-10-12)
- **Brief**: [docs/fases/fase-18.md](../fases/fase-18.md)
- **Sustituye**: la decisión «animaciones mínimas» de la [fase 5](../fases/fase-5.md) y el punto 7 («Movimiento») de [ADR-0009](0009-sistema-de-diseno.md) en lo que toca al combate.
- **Numeración**: el 0019 queda reservado para la [fase 17](../fases/fase-17.md), que se planificó antes.

## Contexto

El campo salta al estado final de cada turno: no se ve quién se movió primero ni qué hizo cada uno sin leer el registro. El usuario quiere ver el orden y el ataque de cada acción (Hidrobomba, Surf, Lanzallamas, Protección, Drenadoras…), con animaciones **rápidas** y **bien hechas**.

Hay tres caminos:

1. **Portar las animaciones del cliente de Showdown** (`battle-animations-moves.ts` y sus imágenes `fx/`). Cubre cientos de movimientos, pero es jQuery muy acoplado a su clase `Battle`, va contra el espíritu de [ADR-0005](0005-servidor-web-y-narracion.md) (nada de clientes de terceros) y la licencia del código y de las imágenes habría que revisarla.
2. **Plantillas propias** que se parametrizan con los datos de cada movimiento (tipo, categoría, objetivo y flags).
3. Una mezcla de las dos.

## Decisión

1. **Plantillas propias** (camino 2, decisión del usuario), **sin dependencias nuevas**: Web Animations API para mover sprites y tarjetas, y una sola capa Canvas 2D con un sistema de partículas propio para los efectos.
2. **La animación sale del protocolo de p1**: `planTurn` convierte las líneas de un `battle:update` en *beats* (acción y sus consecuencias inmediatas). Es una función pura y con tests. No revela nada que no diga ya el registro.
3. **Catálogo por capas**: firma propia para los movimientos más usados (contados en los sets estándar) y los que el usuario nombró. Después, por forma (flags `punch`, `bite`, `slicing`, `sound`, `pulse`, `bullet`, `wind`, `contact`, y el objetivo). Por último, por tipo y categoría. Un test exige que los 511 movimientos tengan plantilla, así que un movimiento nuevo de una regulación nunca se queda sin animación.
4. **El store solo retrasa**: las líneas recibidas van a una cola y se aplican al `Narrator` beat a beat. El campo y el registro avanzan juntos. Se mantiene la regla de que el store solo cambia con mensajes del servidor (ADR-0005): la animación nunca adivina un resultado. Un `battle:snapshot` vacía la cola.
5. **Rápidas por diseño**: ≤ 700 ms por acción en `normal`, ajuste `rápidas` (×0,5) y `no`, saltar con un clic, y `no` por defecto con `prefers-reduced-motion`.
6. **Calidad**: cada plantilla tiene anticipación, acción, impacto y reposo, con parón y fotograma de impacto, temblor proporcional al daño y luz del tipo. Se revisa con el usuario en una galería (`/animaciones`) antes de completar el catálogo.
7. **Colores**: la paleta de efectos sale de los colores de tipo (`lib/type-colors.ts`, la excepción ya admitida en ADR-0009). El rótulo del movimiento usa los tokens de lado (`accent`, `rival`) y cumple AA.

## Consecuencias

- La lógica que decide qué se anima (línea de tiempo, catálogo y cola) es pura y se testea en happy-dom. El dibujo (WAAPI y Canvas) no se puede testear ahí: se revisa en la galería y con los E2E en Chromium.
- Los E2E fijan `Animaciones: no` para no depender de tiempos.
- El panel de acciones aparece al terminar la animación. El bot ya piensa en el servidor mientras tanto ([fase 9](../fases/fase-9.md)), así que no se pierde tiempo.
- Una regulación nueva no necesita trabajo para animar: sus movimientos caen en una plantilla por forma o por tipo. Una firma propia es opcional.

## Implementación (2026-10-12)

- **Línea de tiempo** (`apps/web/src/features/battle/animation/timeline.ts`): `planBeats` agrupa un `|move|` con sus golpes y con lo que causa sin `[from]`. Un bloque (`|`, `|upkeep|`, `|turn|`) lo cierra, para que el clima de fin de turno no se pegue al último ataque. Los cambios seguidos entran juntos y la Mega va en un beat (`detailschange` + `-mega`).
- **Escenario**: `Stage` (DOM) y `FxEngine` (canvas) separados. El canvas de efectos va delante y el del clima detrás. Las luces se suman en oscuro (`lighter`) y se pintan encima en claro. Hecho a mano: torrente de agua con espuma, haz, rayo regenerado cada 45 ms, tajos en media luna, onda que barre el campo, escudo hexagonal, retícula de Espacio Raro, enredaderas, grietas y paneles.
- **Store**: cola de actualizaciones con un contador de generación. Un snapshot, salir o cambiar el idioma invalidan lo que se esté animando. Sin animador (sin campo, «No», pestaña oculta) todo es síncrono como antes, y los tests anteriores no cambiaron.
- **Medido**: 60 fps (16,7 ms de media y de p95) y ninguna tarea larga con Surf, Terremoto, Lanzallamas, Hidrobomba, Espacio Raro y Rayo, en Chromium sin GPU. Un turno real de individuales dura 1,5–2,4 s (con KO, relevo e Intimidación). Uno de dobles con Mega, Protección, crítico, KO, retroceso y relevo dura 3,1 s.
- **E2E**: animaciones apagadas por defecto (`storageState`) y un spec propio con ×2.

## Alternativas descartadas

- **Portar Showdown**: lo más completo desde el primer día, pero acopla la web a código ajeno, choca con ADR-0005 y deja la licencia pendiente.
- **Librería de animación** (GSAP, Motion, PixiJS): ahorran poco frente a WAAPI y un canvas propio para lo que hace falta, y añaden peso y dependencias. Si el sistema de partículas se queda corto en rendimiento, revisar PixiJS con un ADR nuevo.
- **Solo CSS (`@keyframes`)**: vale para mover sprites, pero no para partículas ni para trayectorias calculadas entre dos posiciones que cambian con el tamaño de la ventana.

## Anexo: movimientos más usados

Cuenta de los movimientos en `packages/data/generated/standard-sets.json` (951 sets, 298 movimientos distintos) para elegir las firmas:

```bash
node -e "const s=require('./packages/data/generated/standard-sets.json');const a=[];(function w(o){if(Array.isArray(o))o.forEach(w);else if(o&&typeof o==='object'){if(Array.isArray(o.moves))a.push(o);else Object.values(o).forEach(w)}})(s);const c={};for(const x of a)for(const m of x.moves){const id=String(m.id||m).toLowerCase().replace(/[^a-z0-9]/g,'');c[id]=(c[id]||0)+1}console.log(Object.entries(c).sort((x,y)=>y[1]-x[1]).slice(0,60))"
```
