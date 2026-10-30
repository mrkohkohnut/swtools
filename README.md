# SW Tools

A Summoners War rune analyzer, rune builder, siege speed calculator and RTA match analyzer. It's a static page with no build step and no server. Your data stays in your browser.

Open `index.html`, or host the folder anywhere (GitHub Pages works).

| Tab | What it does |
|---|---|
| **Import** | Load a SWEX JSON export. Shows account summary (rune efficiency, speed subs). |
| **Monsters** | Collection summary (count, unique, 6★/L40, per element) and every monster with skill levels, skill-ups left, copies, speed, sets and rune efficiency. |
| **Runes** | Every rune with efficiency and max efficiency, filterable and sortable. |
| **Builder** | Current stats for a monster, plus an optimizer: pick sets, slot 2/4/6 mains and minimum stats, then maximize one stat. |
| **Siege Planner** | Saved teams vs siege defenses. Each monster gets a target build (sets, stat to maximize, min SPD or auto "outspeed the enemy"). Runes are assigned across all planned monsters with no rune used twice, and each team lists the runes to move. Saved in your browser. |
| **Siege Speed** | Shows the minimum rune speed needed to outspeed an enemy defense (leads included). A speed tuner simulates opening turn order with ATB boosts and finds the minimum speed for one unit to move before another. |
| **RTA** | Paste or load a match log (CSV/JSON) to get win rate, first-pick and second-pick win rate, per-monster pick/win/ban rates and the best pairs. |
| **RTA Meta (draft)** | Tested statistics interface with collection paused pending a permitted data source. Designed for pick/ban/win-rate and surviving-pair statistics, with monster, element, sample-size and private-ownership filters. No live dataset is currently connected. |

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

`node --test rta-meta.test.js` checks the public snapshot helpers. A collector has not been enabled; a permitted data source must be configured first.

Monster names and icons are fetched from the SWARFARM API and cached. If that fetch fails, monsters are shown by ID.

## Public RTA collection

The site remains static. The RTA Meta interface reads a versioned aggregate `rta-meta.json` file. No upstream collector or automatic collection job is enabled, and no source dataset has been published. Opening or reloading the tab only requests the local snapshot, not a third-party data service.

SWRT's unauthenticated replay-search interface was technically accessible during research, but its published service agreement restricts copying server data and republication without written consent. Lucksack also explicitly restricts automated scraping, and SWARENA restricts copying/public display. None is used as a redistributed data source. Obtain a source with suitable written permission or an explicit dataset/API license before enabling collection. The current SWRT-specific draft adapter must be updated for whichever permitted source is chosen.

### Metrics and coverage

- **Collected matches** means deduplicated, validated, decided matches actually stored locally. The source's reported total is informational and is never substituted for our sample size.
- **Pick rate:** drafted appearances / sampled matches.
- **Ban rate:** bans received / drafted appearances.
- **Win rate:** wins / post-ban appearances. Banned monsters do not receive wins or losses.
- **First drafts:** the opening monster of the first-pick side; this is different from every monster chosen by that side.
- **Pairs:** two surviving monsters on the same team; win rate uses pair games, not separate monster averages. Correlation does not demonstrate synergy.
- Unknown results and malformed records are excluded. Duplicate battle IDs do not inflate counts. Source replay timestamps are displayed as supplied because their timezone is not documented.
- Collection time and replay-window time are shown separately. A freshly generated snapshot can still contain old upstream matches. The tab warns about snapshots more than two hours old and small samples; it does not claim full-season coverage or live game access.

### Privacy and hosting

Accounts are restored only from this browser's local storage or an explicitly imported SWEX file. The app no longer tries to fetch the bundled `data/account.json`. Neither account imports nor the personal RTA log are sent to the collector.

Publish an explicit allowlist: `index.html`, `app.js`, `sw.js`, `rta-meta.js`, `rta-meta-ui.js`, and the aggregate `rta-meta.json`. Never serve the repository root, `.git`, the collector's private state, raw replay payloads, or `data/account.json`. Public statistics should contain monster IDs, names, elements and aggregate counts—not player names, IDs, portraits, account exports, or raw battle records. The upstream repository's bundled export is unaffected by this deployment boundary.
