import { Game } from './Game/Game.js'

const canvas = document.getElementById('game')
const game = Game.getInstance({ canvas })
game.start()

window.__GAME__ = game
