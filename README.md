# SW Tools

A Summoners War rune analyzer, rune builder, siege speed calculator and RTA match analyzer. It's a static page with no build step and no server. Your data stays in your browser.

Open `index.html`, or host the folder anywhere (GitHub Pages works).

| Tab | What it does |
|---|---|
| **Import** | Load a SWEX JSON export. Shows account summary (rune efficiency, speed subs). |
| **Runes** | Every rune with efficiency and max efficiency, filterable and sortable. |
| **Builder** | Current stats for a monster, plus an optimizer: pick sets, slot 2/4/6 mains and minimum stats, then maximize one stat. |
| **Siege Speed** | Shows the minimum rune speed needed to outspeed an enemy defense (leads included). A speed tuner simulates opening turn order with ATB boosts and finds the minimum speed for one unit to move before another. |
| **RTA** | Paste or load a match log (CSV/JSON) to get win rate, first-pick and second-pick win rate, per-monster pick/win/ban rates and the best pairs. |

RTA log format (CSV, lists separated by `|`):

```
result,picks,opp_picks,bans,opp_bans,first
win,Lushen|Verdehile|Tiana|Bastet|Seara,Chilling|Trinity|Leo|Riley|Fran,Seara,Verdehile,me
```

## Formulas

- Efficiency is `(1 + Σ sub/maxSub) / 2.8`, the standard SWOP/SWARFARM formula. Grinds and innate stats are counted.
- Combat speed is `base + rune speed + ceil(base × lead%)`. Swift adds `ceil(base × 25%)`.
- Turn order: each tick, ATB += speed × 7%. A unit takes its turn at 100 ATB, and the highest ATB goes first. Equal speed counts as a loss, because in game a tie is a coin flip.

## Dev

`node test.js` runs the logic checks in `sw.js`.

Monster names and icons are fetched from the SWARFARM API and cached. If that fetch fails, monsters are shown by ID.
