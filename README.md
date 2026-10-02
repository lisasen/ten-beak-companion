# The Ten Beak Companion

An Owlbear Rodeo extension for Ved's free-world board game. It handles the bookkeeping while players keep the thrill of rolling real dice.

## What it does

- Creates heroes with 200–300 starting max HP and up to three balanced abilities.
- Spawns one opponent or a numbered group from a reusable GM library.
- Tracks HP, gold, damage toward the next 750-damage upgrade, inns, death, and revival.
- Gives kill gold only once to the hero who lands the final blow: 50 for an enemy, 150 for an army, and 300 for a mini-boss.
- Ends the game when Calamity Phantomé is defeated.
- Keeps dice physical. The GM enters the rolled damage using 10/20/30/40/50/100 buttons or a custom result.

## Run locally

```bash
npm install
npm run dev
```

Open the displayed local URL to preview the companion. To test inside Owlbear Rodeo, expose the local server over HTTPS and install its `manifest.json` URL.

## Build and test

```bash
npm run check
npm test
npm run build
```

## Playing

1. The GM opens **Create & Spawn**, creates a hero or opponent, and can save common opponents as templates.
2. In **Battle**, choose the adventurer and opponent.
3. Choose an attack, roll the physical action die, and—if successful—roll the physical damage die.
4. The GM clicks the damage result. The companion subtracts HP, records only actual damage, awards the final-blow gold once, and announces upgrades.
5. Double-click a roster card for GM actions such as an inn stay, revival, leveling, or the death penalty.

Movement, story decisions, enemy group actions, and special card wording remain under the GM's control.
