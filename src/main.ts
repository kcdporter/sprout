import { startGame } from './game'
import './style.css'

// Embed mode — a layout variant that fills the iframe width instead of using
// the standalone centered fixed-width column. Triggered explicitly via the
// `?embed` (or `?embed=1`) query flag — kept query-only for predictability,
// so the standalone site at /?embed_anything_else stays unchanged.
if (new URLSearchParams(location.search).has('embed')) {
  document.documentElement.classList.add('embed')
}

const stage = document.querySelector<HTMLElement>('#mzStage')!
startGame(stage)
