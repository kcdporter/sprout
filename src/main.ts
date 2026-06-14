import { startGame } from './game'
import './style.css'

const stage = document.querySelector<HTMLElement>('#mzStage')!
startGame(stage)
