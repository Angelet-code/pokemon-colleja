# ADR-0009 — Sistema de diseño de la web: «retransmisión de torneo»

- **Estado**: Aceptado (2026-10-08)
- **Guía operativa**: [docs/guias/web.md](../guias/web.md#sistema-de-diseño)

## Contexto

La web nació fase a fase con clases de Tailwind repetidas en cada pantalla (`rounded-xl border bg-panel`, botones y avisos copiados a mano), una fuente de sistema y muchos textos explicativos que repetían lo que ya decía la interfaz. El usuario la consideraba genérica («diseño primerizo de IA») y pidió rehacerla desde cero, sin textos redundantes.

Se exploraron tres direcciones en un lienzo de Claude Design (inicio y combate de cada una):

- **A · Retransmisión de torneo**: tinta casi negra, acento voltio, tipografía condensada, esquinas biseladas.
- **B · Hoja de scouting**: editorial suizo en claro, cifras en monoespaciada, tablas densas.
- **C · Arcade**: contornos negros gruesos, sombras sólidas, etiquetas en píxel.

## Decisión

1. **Dirección A** (decisión de producto, 2026-10-08). El combate es un *broadcast* de VGC: marcador arriba, escenario con plataformas, controles debajo y registro a la derecha (se mantiene la disposición «al estilo Showdown» de ADR-0005).
2. **Tokens en `apps/web/src/styles.css`**, en `:root` (claro) y `.dark` (oscuro, por defecto), expuestos a Tailwind con `@theme inline`:
   - Superficies: `bg`, `surface`, `surface-2`, `surface-3`; líneas `line`, `line-strong`; texto `text`, `muted`, `faint`.
   - Lados: `accent` (relleno voltio, con `on-accent` encima) y `accent-fg` (el acento como texto, que en claro es oliva para que contraste); `rival` (magenta) para el bot.
   - Estados `good`, `warn`, `bad`; barras de PS `hp-good`, `hp-warn`, `hp-bad`; escenario `stage`, `stage-floor`, `stage-line`.
   - Todos los textos cumplen WCAG AA (≥ 4,5:1) sobre las cuatro superficies en los dos temas.
3. **Tipografía**: Barlow (texto) y Barlow Condensed (títulos, cifras, etiquetas, botones), empaquetadas con `@fontsource` (sin red en tiempo de ejecución). Utilidades `display` (titular condensado en mayúsculas) y `eyebrow` (etiqueta pequeña espaciada).
4. **Forma**: radios pequeños (2–6 px), líneas finas, sin sombras de color. El corte en diagonal (`chamfer`) es la firma y solo se usa en la acción principal. Iconos propios de trazo (`components/icons.tsx`), nunca emojis ni flechas Unicode.
5. **Componentes en `components/ui.tsx`**: `Button`/`buttonClass` (primary, secondary, ghost, danger; sm, md, lg), `IconButton`, `Panel`, `PageHeader`, `Segmented` (con `hint`), `Checkbox` (interruptor), `Field`, `TextInput`, `Select`, `inputClass`/`textareaClass`, `Chip`, `LegalityChip`, `Notice`, `Loading`, `Empty`. Además `TeamSlots` (seis huecos de equipo). Las pantallas componen estos bloques y no repiten cadenas de clases.
6. **Textos**: fuera subtítulos, *hints* obvios y explicaciones que repiten la interfaz. Las descripciones largas pasan a `title` (p. ej. la de cada dificultad). Un estado se dice con un `Chip` («Legal», «2 problemas», «Cambios sin guardar»), no con una frase.
7. **Movimiento**: solo transiciones cortas de color, la barra de PS y la entrada de paneles (`rise`), todo anulado con `prefers-reduced-motion`.

## Alternativas descartadas

- **B · Hoja de scouting**: muy legible y densa, pero fría para un juego y peor en oscuro, que es el tema por defecto.
- **C · Arcade**: la más lúdica, pero cansa en sesiones largas y compite con los sprites.
- **Librería de componentes externa** (shadcn, Radix…): añade dependencias y un aspecto reconocible; los pocos componentes que hacen falta son sencillos y ya eran accesibles.
