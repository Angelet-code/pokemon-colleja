# Pokémon Champions — Held items usable in battle (Regulation Set M-C, game v1.2.x)

Generated 2026-10-07.

**Sources**
- Pokémon Showdown `data/mods/champions/items.ts` (current, M-C) + base `data/items.ts` / `data/text/items.ts` for names and effect text: https://github.com/smogon/pokemon-showdown/tree/master/data/mods/champions
- `data/mods/championsregmb/items.ts` (Reg M-B) and `data/mods/champions/items.ts` @ commit 4f12cc3 (2026-04-21, Reg M-A) to derive the "Added" column.
- Official v1.2.0 notice ("Pokémon and held items have been added for Regulation Set M-C"): https://news.pokemon-home.com/en/page/817.html ; official Reg M-C notice (duplicate held items not allowed): https://news.pokemon-home.com/en/page/816.html
- Cross-check: WikiDex "Lista de objetos de Pokémon Champions" (covers M-A/M-B only at time of check): https://www.wikidex.net/wiki/Lista_de_objetos_de_Pok%C3%A9mon_Champions ; M-C additions (12 held items) also reported by press coverage.

**Totals:** 166 items = 56 held items + 28 Berries + 1 Gem + 81 Mega Stones (M-A: 117 total, M-B: +31, M-C: +18).
Item Clause: no two Pokémon on a team may hold the same item. Effect text below is mainline (PS) text; Champions keeps mainline item effects except where noted.

**Notable mainline items NOT in Champions (per PS data):** Choice Band, Choice Specs, Assault Vest, Booster Energy, Weakness Policy, Clear Amulet, Covert Cloak, Safety Goggles, Loaded Dice, Eviolite, Toxic Orb, Flame Orb, Mirror Herb, Throat Spray, Black Sludge, Eject Pack, Room Service, Protective Pads, Punching Glove, Ability Shield, Heavy-Duty Boots.

| Item | Category | Effect (mainline text) | Added | Champions-specific notes |
|---|---|---|---|---|
| Air Balloon | Held item | Holder is immune to Ground-type attacks. Pops when holder is hit. | M-C |  |
| Big Root | Held item | Holder gains 1.3× HP from draining/Aqua Ring/Ingrain/Leech Seed/Strength Sap. | M-B |  |
| Binding Band | Held item | Holder's partial-trapping moves deal 1/6 max HP per turn instead of 1/8. | M-C |  |
| Black Belt | Held item | Holder's Fighting-type attacks have 1.2× power. | M-A |  |
| Black Glasses | Held item | Holder's Dark-type attacks have 1.2× power. | M-A |  |
| Bright Powder | Held item | The accuracy of attacks against the holder is 0.9×. | M-A |  |
| Charcoal | Held item | Holder's Fire-type attacks have 1.2× power. | M-A |  |
| Choice Scarf | Held item | Holder's Speed is 1.5×, but it can only select the first move it executes. | M-A |  |
| Damp Rock | Held item | Holder's use of Rain Dance lasts 8 turns instead of 5. | M-B |  |
| Dragon Fang | Held item | Holder's Dragon-type attacks have 1.2× power. | M-A |  |
| Eject Button | Held item | If holder survives a hit, it immediately switches out to a chosen ally. Single use. | M-C | Champions-specific implementation in PS mod (switch-out logic tweaked: self-switch moves still work when Eject Button triggers; does not trigger on future moves) |
| Electric Seed | Held item | If the terrain is Electric Terrain, raises holder's Defense by 1 stage. Single use. | M-C |  |
| Expert Belt | Held item | Holder's attacks that are super effective against the target do 1.2× damage. | M-B |  |
| Fairy Feather | Held item | Holder's Fairy-type attacks have 1.2× power. | M-A |  |
| Focus Band | Held item | Holder has a 10% chance to survive an attack that would KO it with 1 HP. | M-A |  |
| Focus Sash | Held item | If holder's HP is full, will survive an attack that would KO it with 1 HP. Single use. | M-A |  |
| Grassy Seed | Held item | If the terrain is Grassy Terrain, raises holder's Defense by 1 stage. Single use. | M-C |  |
| Hard Stone | Held item | Holder's Rock-type attacks have 1.2× power. | M-A |  |
| Heat Rock | Held item | Holder's use of Sunny Day lasts 8 turns instead of 5. | M-B |  |
| Icy Rock | Held item | Holder's use of Snowscape lasts 8 turns instead of 5. | M-B |  |
| Iron Ball | Held item | Holder is grounded, Speed halved. If Flying type, takes neutral Ground damage. | M-B |  |
| King's Rock | Held item | Holder's attacks without a chance to flinch gain a 10% chance to flinch. | M-A |  |
| Leek | Held item | If held by a Farfetch’d or Sirfetch’d, its critical hit ratio is raised by 2 stages. | M-C |  |
| Leftovers | Held item | At the end of every turn, holder restores 1/16 of its max HP. | M-A |  |
| Life Orb | Held item | Holder's attacks do 1.3× damage, and it loses 1/10 its max HP after the attack. | M-B |  |
| Light Ball | Held item | If held by a Pikachu, its Attack and Sp. Atk are doubled. | M-A |  |
| Light Clay | Held item | Holder's use of Aurora Veil, Light Screen, or Reflect lasts 8 turns instead of 5. | M-B |  |
| Magnet | Held item | Holder's Electric-type attacks have 1.2× power. | M-A |  |
| Mental Herb | Held item | Cures holder of Attract, Disable, Encore, Heal Block, Taunt, Torment. Single use. | M-A |  |
| Metal Coat | Held item | Holder's Steel-type attacks have 1.2× power. | M-A |  |
| Metronome | Held item | Damage of moves used on consecutive turns is increased. Max 2× after 5 turns. | M-B |  |
| Miracle Seed | Held item | Holder's Grass-type attacks have 1.2× power. | M-A |  |
| Misty Seed | Held item | If the terrain is Misty Terrain, raises holder's Sp. Def by 1 stage. Single use. | M-C |  |
| Muscle Band | Held item | Holder's physical attacks have 1.1× power. | M-B |  |
| Mystic Water | Held item | Holder's Water-type attacks have 1.2× power. | M-A |  |
| Never-Melt Ice | Held item | Holder's Ice-type attacks have 1.2× power. | M-A |  |
| Poison Barb | Held item | Holder's Poison-type attacks have 1.2× power. | M-A |  |
| Psychic Seed | Held item | If the terrain is Psychic Terrain, raises holder's Sp. Def by 1 stage. Single use. | M-C |  |
| Quick Claw | Held item | Each turn, holder has a 20% chance to move first in its priority bracket. | M-A |  |
| Red Card | Held item | If holder survives a hit, attacker is forced to switch to a random ally. Single use. | M-C |  |
| Rocky Helmet | Held item | If holder is hit by a contact move, the attacker loses 1/6 of its max HP. | M-C |  |
| Scope Lens | Held item | Holder's critical hit ratio is raised by 1 stage. | M-A |  |
| Sharp Beak | Held item | Holder's Flying-type attacks have 1.2× power. | M-A |  |
| Shed Shell | Held item | Holder cannot be prevented from choosing to switch out by any effect. | M-B |  |
| Shell Bell | Held item | After an attack, holder gains 1/8 of the damage in HP dealt to other Pokemon. | M-A |  |
| Silk Scarf | Held item | Holder's Normal-type attacks have 1.2× power. | M-A |  |
| Silver Powder | Held item | Holder's Bug-type attacks have 1.2× power. | M-A |  |
| Smooth Rock | Held item | Holder's use of Sandstorm lasts 8 turns instead of 5. | M-B |  |
| Soft Sand | Held item | Holder's Ground-type attacks have 1.2× power. | M-A |  |
| Spell Tag | Held item | Holder's Ghost-type attacks have 1.2× power. | M-A |  |
| Terrain Extender | Held item | Holder's use of Electric/Grassy/Misty/Psychic Terrain lasts 8 turns instead of 5. | M-C |  |
| Twisted Spoon | Held item | Holder's Psychic-type attacks have 1.2× power. | M-A |  |
| White Herb | Held item | Restores all lowered stat stages to 0 when one is less than 0. Single use. | M-A |  |
| Wide Lens | Held item | The accuracy of attacks by the holder is 1.1×. | M-B |  |
| Wise Glasses | Held item | Holder's special attacks have 1.1× power. | M-B |  |
| Zoom Lens | Held item | The accuracy of attacks by the holder is 1.2× if it moves after its target. | M-B |  |
| Aspear Berry | Berry | Holder is cured if it is frozen. Single use. | M-A |  |
| Babiri Berry | Berry | Halves damage taken from a supereffective Steel-type attack. Single use. | M-A |  |
| Charti Berry | Berry | Halves damage taken from a supereffective Rock-type attack. Single use. | M-A |  |
| Cheri Berry | Berry | Holder cures itself if it is paralyzed. Single use. | M-A |  |
| Chesto Berry | Berry | Holder wakes up if it is asleep. Single use. | M-A |  |
| Chilan Berry | Berry | Halves damage taken from a Normal-type attack. Single use. | M-A |  |
| Chople Berry | Berry | Halves damage taken from a supereffective Fighting-type attack. Single use. | M-A |  |
| Coba Berry | Berry | Halves damage taken from a supereffective Flying-type attack. Single use. | M-A |  |
| Colbur Berry | Berry | Halves damage taken from a supereffective Dark-type attack. Single use. | M-A |  |
| Haban Berry | Berry | Halves damage taken from a supereffective Dragon-type attack. Single use. | M-A |  |
| Kasib Berry | Berry | Halves damage taken from a supereffective Ghost-type attack. Single use. | M-A |  |
| Kebia Berry | Berry | Halves damage taken from a supereffective Poison-type attack. Single use. | M-A |  |
| Leppa Berry | Berry | Restores 10 PP to the first of the holder's moves to reach 0 PP. Single use. | M-A |  |
| Lum Berry | Berry | Holder cures itself if it has a non-volatile status or is confused. Single use. | M-A |  |
| Occa Berry | Berry | Halves damage taken from a supereffective Fire-type attack. Single use. | M-A |  |
| Oran Berry | Berry | Restores 10 HP when at 1/2 max HP or less. Single use. | M-A |  |
| Passho Berry | Berry | Halves damage taken from a supereffective Water-type attack. Single use. | M-A |  |
| Payapa Berry | Berry | Halves damage taken from a supereffective Psychic-type attack. Single use. | M-A |  |
| Pecha Berry | Berry | Holder is cured if it is poisoned. Single use. | M-A |  |
| Persim Berry | Berry | Holder is cured if it is confused. Single use. | M-A |  |
| Rawst Berry | Berry | Holder is cured if it is burned. Single use. | M-A |  |
| Rindo Berry | Berry | Halves damage taken from a supereffective Grass-type attack. Single use. | M-A |  |
| Roseli Berry | Berry | Halves damage taken from a supereffective Fairy-type attack. Single use. | M-A |  |
| Shuca Berry | Berry | Halves damage taken from a supereffective Ground-type attack. Single use. | M-A |  |
| Sitrus Berry | Berry | Restores 1/4 max HP when at 1/2 max HP or less. Single use. | M-A |  |
| Tanga Berry | Berry | Halves damage taken from a supereffective Bug-type attack. Single use. | M-A |  |
| Wacan Berry | Berry | Halves damage taken from a supereffective Electric-type attack. Single use. | M-A |  |
| Yache Berry | Berry | Halves damage taken from a supereffective Ice-type attack. Single use. | M-A |  |
| Normal Gem | Gem | Holder's first successful Normal-type attack will have 1.3× power. Single use. | M-C |  |
| Abomasite | Mega Stone | Mega Evolves: Abomasnow → Abomasnow-Mega | M-A |  |
| Absolite | Mega Stone | Mega Evolves: Absol → Absol-Mega | M-A |  |
| Absolite Z | Mega Stone | Mega Evolves: Absol → Absol-Mega-Z | M-C |  |
| Aerodactylite | Mega Stone | Mega Evolves: Aerodactyl → Aerodactyl-Mega | M-A |  |
| Aggronite | Mega Stone | Mega Evolves: Aggron → Aggron-Mega | M-A |  |
| Alakazite | Mega Stone | Mega Evolves: Alakazam → Alakazam-Mega | M-A |  |
| Altarianite | Mega Stone | Mega Evolves: Altaria → Altaria-Mega | M-A |  |
| Ampharosite | Mega Stone | Mega Evolves: Ampharos → Ampharos-Mega | M-A |  |
| Audinite | Mega Stone | Mega Evolves: Audino → Audino-Mega | M-A |  |
| Banettite | Mega Stone | Mega Evolves: Banette → Banette-Mega | M-A |  |
| Barbaracite | Mega Stone | Mega Evolves: Barbaracle → Barbaracle-Mega | M-B |  |
| Baxcalibrite | Mega Stone | Mega Evolves: Baxcalibur → Baxcalibur-Mega | M-C |  |
| Beedrillite | Mega Stone | Mega Evolves: Beedrill → Beedrill-Mega | M-A |  |
| Blastoisinite | Mega Stone | Mega Evolves: Blastoise → Blastoise-Mega | M-A |  |
| Blazikenite | Mega Stone | Mega Evolves: Blaziken → Blaziken-Mega | M-B |  |
| Cameruptite | Mega Stone | Mega Evolves: Camerupt → Camerupt-Mega | M-A |  |
| Chandelurite | Mega Stone | Mega Evolves: Chandelure → Chandelure-Mega | M-A |  |
| Charizardite X | Mega Stone | Mega Evolves: Charizard → Charizard-Mega-X | M-A |  |
| Charizardite Y | Mega Stone | Mega Evolves: Charizard → Charizard-Mega-Y | M-A |  |
| Chesnaughtite | Mega Stone | Mega Evolves: Chesnaught → Chesnaught-Mega | M-A |  |
| Chimechite | Mega Stone | Mega Evolves: Chimecho → Chimecho-Mega | M-A |  |
| Clefablite | Mega Stone | Mega Evolves: Clefable → Clefable-Mega | M-A |  |
| Crabominite | Mega Stone | Mega Evolves: Crabominable → Crabominable-Mega | M-A |  |
| Delphoxite | Mega Stone | Mega Evolves: Delphox → Delphox-Mega | M-A |  |
| Dragalgite | Mega Stone | Mega Evolves: Dragalge → Dragalge-Mega | M-B |  |
| Dragoninite | Mega Stone | Mega Evolves: Dragonite → Dragonite-Mega | M-A |  |
| Drampanite | Mega Stone | Mega Evolves: Drampa → Drampa-Mega | M-A |  |
| Eelektrossite | Mega Stone | Mega Evolves: Eelektross → Eelektross-Mega | M-B |  |
| Emboarite | Mega Stone | Mega Evolves: Emboar → Emboar-Mega | M-A |  |
| Excadrite | Mega Stone | Mega Evolves: Excadrill → Excadrill-Mega | M-A |  |
| Falinksite | Mega Stone | Mega Evolves: Falinks → Falinks-Mega | M-B |  |
| Feraligite | Mega Stone | Mega Evolves: Feraligatr → Feraligatr-Mega | M-A |  |
| Floettite | Mega Stone | Mega Evolves: Floette-Eternal → Floette-Mega | M-A |  |
| Froslassite | Mega Stone | Mega Evolves: Froslass → Froslass-Mega | M-A |  |
| Galladite | Mega Stone | Mega Evolves: Gallade → Gallade-Mega | M-A |  |
| Garchompite | Mega Stone | Mega Evolves: Garchomp → Garchomp-Mega | M-A |  |
| Garchompite Z | Mega Stone | Mega Evolves: Garchomp → Garchomp-Mega-Z | M-C |  |
| Gardevoirite | Mega Stone | Mega Evolves: Gardevoir → Gardevoir-Mega | M-A |  |
| Gengarite | Mega Stone | Mega Evolves: Gengar → Gengar-Mega | M-A |  |
| Glalitite | Mega Stone | Mega Evolves: Glalie → Glalie-Mega | M-A |  |
| Glimmoranite | Mega Stone | Mega Evolves: Glimmora → Glimmora-Mega | M-A |  |
| Golisopite | Mega Stone | Mega Evolves: Golisopod → Golisopod-Mega | M-C |  |
| Golurkite | Mega Stone | Mega Evolves: Golurk → Golurk-Mega | M-A |  |
| Greninjite | Mega Stone | Mega Evolves: Greninja → Greninja-Mega | M-A |  |
| Gyaradosite | Mega Stone | Mega Evolves: Gyarados → Gyarados-Mega | M-A |  |
| Hawluchanite | Mega Stone | Mega Evolves: Hawlucha → Hawlucha-Mega | M-A |  |
| Heracronite | Mega Stone | Mega Evolves: Heracross → Heracross-Mega | M-A |  |
| Houndoominite | Mega Stone | Mega Evolves: Houndoom → Houndoom-Mega | M-A |  |
| Kangaskhanite | Mega Stone | Mega Evolves: Kangaskhan → Kangaskhan-Mega | M-A |  |
| Lopunnite | Mega Stone | Mega Evolves: Lopunny → Lopunny-Mega | M-A |  |
| Lucarionite | Mega Stone | Mega Evolves: Lucario → Lucario-Mega | M-A |  |
| Lucarionite Z | Mega Stone | Mega Evolves: Lucario → Lucario-Mega-Z | M-C |  |
| Malamarite | Mega Stone | Mega Evolves: Malamar → Malamar-Mega | M-B |  |
| Manectite | Mega Stone | Mega Evolves: Manectric → Manectric-Mega | M-A |  |
| Mawilite | Mega Stone | Mega Evolves: Mawile → Mawile-Mega | M-B |  |
| Medichamite | Mega Stone | Mega Evolves: Medicham → Medicham-Mega | M-A |  |
| Meganiumite | Mega Stone | Mega Evolves: Meganium → Meganium-Mega | M-A |  |
| Meowsticite | Mega Stone | Mega Evolves: Meowstic → Meowstic-M-Mega, Meowstic-F → Meowstic-F-Mega | M-A |  |
| Metagrossite | Mega Stone | Mega Evolves: Metagross → Metagross-Mega | M-B |  |
| Pidgeotite | Mega Stone | Mega Evolves: Pidgeot → Pidgeot-Mega | M-A |  |
| Pinsirite | Mega Stone | Mega Evolves: Pinsir → Pinsir-Mega | M-A |  |
| Pyroarite | Mega Stone | Mega Evolves: Pyroar → Pyroar-Mega | M-B |  |
| Raichunite X | Mega Stone | Mega Evolves: Raichu → Raichu-Mega-X | M-B |  |
| Raichunite Y | Mega Stone | Mega Evolves: Raichu → Raichu-Mega-Y | M-B |  |
| Sablenite | Mega Stone | Mega Evolves: Sableye → Sableye-Mega | M-A |  |
| Salamencite | Mega Stone | Mega Evolves: Salamence → Salamence-Mega | M-C |  |
| Sceptilite | Mega Stone | Mega Evolves: Sceptile → Sceptile-Mega | M-B |  |
| Scizorite | Mega Stone | Mega Evolves: Scizor → Scizor-Mega | M-A |  |
| Scolipite | Mega Stone | Mega Evolves: Scolipede → Scolipede-Mega | M-B |  |
| Scovillainite | Mega Stone | Mega Evolves: Scovillain → Scovillain-Mega | M-A |  |
| Scraftinite | Mega Stone | Mega Evolves: Scrafty → Scrafty-Mega | M-B |  |
| Sharpedonite | Mega Stone | Mega Evolves: Sharpedo → Sharpedo-Mega | M-A |  |
| Skarmorite | Mega Stone | Mega Evolves: Skarmory → Skarmory-Mega | M-A |  |
| Slowbronite | Mega Stone | Mega Evolves: Slowbro → Slowbro-Mega | M-A |  |
| Staraptite | Mega Stone | Mega Evolves: Staraptor → Staraptor-Mega | M-B |  |
| Starminite | Mega Stone | Mega Evolves: Starmie → Starmie-Mega | M-A |  |
| Steelixite | Mega Stone | Mega Evolves: Steelix → Steelix-Mega | M-A |  |
| Swampertite | Mega Stone | Mega Evolves: Swampert → Swampert-Mega | M-B |  |
| Tyranitarite | Mega Stone | Mega Evolves: Tyranitar → Tyranitar-Mega | M-A |  |
| Venusaurite | Mega Stone | Mega Evolves: Venusaur → Venusaur-Mega | M-A |  |
| Victreebelite | Mega Stone | Mega Evolves: Victreebel → Victreebel-Mega | M-A |  |
