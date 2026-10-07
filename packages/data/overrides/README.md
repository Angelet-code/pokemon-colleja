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
