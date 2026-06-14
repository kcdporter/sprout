import { startGame } from './game'
import './style.css'

// Theme — dark by default. Honors prefers-color-scheme on first visit, then
// the user's choice (persisted to localStorage). The `data-theme` attribute
// on <html> is what the CSS keys off of.
const THEME_KEY = 'sprout-theme'
function applyTheme(t: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', t)
}
const saved = localStorage.getItem(THEME_KEY) as 'dark' | 'light' | null
const initial = saved ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
applyTheme(initial)

document.getElementById('btnTheme')?.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
  applyTheme(next)
  localStorage.setItem(THEME_KEY, next)
})

const stage = document.querySelector<HTMLElement>('#mzStage')!
startGame(stage)
