# Overrides de datos

Correcciones y añadidos manuales que el pipeline (`npm run data:build`) aplica **encima** de los datos generados a partir de Showdown y PokeAPI. Tras editar un fichero, vuelve a ejecutar `npm run data:build` y revisa el diff de `packages/data/generated/`.

## `standard-sets.json`: sets estándar propios

Los sets estándar se generan automáticamente: uno por cada rol de los *random sets* de Champions de Showdown, con Stat Points y naturaleza heurísticos. Para sustituir los de una especie, añade una entrada en el modo que corresponda (`singles` o `doubles`). La clave es el id de Showdown de la especie seleccionable. El set se escribe en el **formato export de Showdown**, y la línea `EVs:` contiene Stat Points.

```json
{
  "singles": {
    "garchomp": [
      {
        "role": "Atacante rápido",
        "export": "Garchomp @ Life Orb\nAbility: Rough Skin\nEVs: 2 HP / 32 Atk / 32 Spe\nJolly Nature\n- Earthquake\n- Dragon Claw\n- Rock Slide\n- Protect"
      }
    ]
  },
  "doubles": {}
}
```

- Los overrides **sustituyen** todos los sets generados de esa especie en ese modo.
- Para un set de Mega, pon la especie base con su megapiedra (`Charizard @ Charizardite Y`).
- Si un set no es legal en Champions, el build falla e indica el motivo.

## `i18n.es.json`: nombres en español

Sirve para corregir o completar nombres en español que PokeAPI no tiene (el build los lista como `⚠ Sin nombre oficial en español`). La clave es el id de Showdown.

```json
{
  "species": { "raichumegax": "Mega-Raichu X" },
  "moves": {},
  "abilities": {},
  "items": {},
  "natures": {},
  "types": {},
  "stats": {}
}
```

## `battle-text.es.json`: mensajes de combate en español

Completa las plantillas de mensajes de combate que Showdown aún no tiene traducidas (`null, // NEEDS TRANSLATION` en `data/text/es/`). Las usa la narración del log (`@colleja/narration`, [guía de la web](../../../docs/guias/web.md)). La estructura es la misma que la de `packages/data/generated/text/es.json`: tabla (`default`, `moves`, `abilities`, `items`) → efecto → campo → plantilla.

```json
{
  "default": { "default": { "turn": "== Turno {NUMBER} ==" } },
  "moves": { "roost": { "start": "  (¡{POKEMON} pierde el tipo Volador durante este turno!)" } }
}
```

- La sintaxis es la de Showdown: marcadores `{POKEMON}`, `{ITEM}`, `{STAT}`…, con modificadores como `{ITEM:definite:capitalize}` (artículo según el género del objeto) o `{TEAM:de}` ("del lado rival"). Las líneas que empiezan por dos espacios son mensajes secundarios.
- Solo se pueden completar efectos que existen en las plantillas inglesas: un id mal escrito hace fallar el build.
- Lo que no esté traducido ni aquí ni en Showdown se muestra en inglés.
