import { startGame } from './game'
import './style.css'

// Embed mode — when the game is iframed into a host page that has its own
// background. Triggered explicitly via `?embed` in the URL, or implicitly when
// we detect we're not the top window. The `embed` class on <html> drops the
// page background + ambient fireflies so the host shows through; the game
// card and its inner surfaces keep their own opaque styling.
const embedded =
  new URLSearchParams(location.search).has('embed') || window.self !== window.top
if (embedded) document.documentElement.classList.add('embed')

const stage = document.querySelector<HTMLElement>('#mzStage')!
startGame(stage)
