<div align="center">

<h1><i>Sprout in the Hedge Maze</i></h1>

<sub>A SPROUT MINIGAME · painterly indigo storybook · race against twilight</sub>

</div>

---

A small browser game where **Sprout** — a luminous flower-spirit — walks a procedurally
generated hedge maze, finds the treats each guardian craves, and tries to make it home
before twilight falls. Some side dead-ends are pitfalls; some pitfalls are unlucky;
some are very, very lucky.

Built to be embedded as an iframe on a personal site.

## Playing

| | |
|---|---|
| Move | `↑ ↓ ← →` or `W A S D` |
| Pick up | walk onto a treat |
| Pass a guardian | hold the treat it craves — walk into it to trade |
| Win | reach the heart of the maze before the dusk meter fills |
| Lose | get caught by twilight |

## What's in the maze

- A **12 × 12** procedurally generated hedge grid that can take any of five shapes
  *(rect, L, T, plus, organic)* — the bounding box hides which one until you start uncovering corridors
- A **dark spotlight** lit halo around Sprout, with a persistent dim breadcrumb on tiles
  you've visited
- Up to five mythical **guardians** — *dragon, kirin, jackalope, ghost, serpent, pixie* —
  each with a particular taste
- **Treats** — *glowberry, moonpetal, honeydrop, dewdrop, firefly jar, spice cap, stardust* —
  tucked in side dead-ends
- **Required treats** (the ones a guardian wants) are guaranteed to sit in a dead-end whose
  junction onto the main path is *strictly upstream* of that guardian, so the run is always
  solvable
- A **dusk meter** that ticks against you the whole run

## Pitfalls

Some required treats have an **invisible pitfall** one step before them. Sprout falls in
without warning and lands in a small sub-maze.

| | What happens |
|---|---|
| `unlucky` | A small maze to navigate. Single exit returns you to the entry. Dusk kept ticking. |
| `lucky · moon` | + 5 seconds on the dusk meter. |
| `lucky · star` | Sprout becomes **celestial** — guardians kneel as she walks past. |
| `lucky · shortcut` | Drops Sprout beside the deepest still-uncollected required treat. |
| `ultra lucky` | Drops Sprout at the maze exit. **Home.** |

After one use a pitfall is spent — the entry tile becomes ordinary and Sprout can step
through it to reach the treat that was behind it.

## Embedding

The game is a static site. Build, host the `dist/` folder anywhere, and embed it:

```html
<iframe
  src="https://yourdomain.com/sprout-maze/"
  width="760"
  height="820"
  loading="lazy"
  sandbox="allow-scripts"
  title="Sprout in the Hedge Maze">
</iframe>
```

The game never talks to the parent window — `sandbox="allow-scripts"` is enough.

## Tech

- **Vite + TypeScript**, vanilla JS for Sprout herself
- **SVG** for the maze art (hedges + leaves + blossoms + guardians + treats), generated
  procedurally from a seed so visuals are stable for a given run
- **Canvas** overlay for the fog spotlight + breadcrumb trail
- Sprout is the same flower-spirit pet from my personal site, mounted in
  *controlled* mode so the game drives her position via `moveTo(x, y)` and `snap(x, y)`
- Everything respects `prefers-reduced-motion`

## Running locally

```sh
npm install
npm run dev      # http://localhost:5180/
npm run build    # → dist/
npm run preview  # serve the built dist/
```

## Source map

```
src/
  main.ts         · bootstrap
  game.ts         · state machine, input, frames, pitfall logic, win/lose
  maze.ts         · recursive backtracker, BFS, region masks, placement helpers
  render.ts       · maze SVG + fog canvas + marker layer
  sprout-art.ts   · leaf, bloom, treatSVG, creatureSVG, palette
  sprout.js       · the flower-spirit (extended with controlled mode + snap)
  sprout.d.ts     · matching TS declarations
  types.ts        · Item / Creature / Pitfall + vocabulary
  style.css       · all the cosmetics
public/
  assets/
    bg-dark.png   · the page background
index.html        · game frame + HUD chrome
```

## Tuning knobs

Most game feel lives at the top of `src/game.ts`:

| | |
|---|---|
| `CELLS_W`, `CELLS_H` | maze grid size |
| `SUB_CELLS` | sub-maze size |
| `DUSK_MS` | how long until twilight falls |
| `MOON_BONUS_MS` | dusk seconds restored by the moon pitfall |
| `PITFALL_PER_ITEM` | fraction of required treats that get a pitfall |
| `KIND_WEIGHTS` | how often each pitfall kind shows up |
| `SPROUT_SCALE` | how big Sprout renders relative to a tile |

---

<div align="center">
<i>Home before moonset.</i>
</div>
