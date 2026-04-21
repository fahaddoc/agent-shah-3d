import { Game } from './Game/Game.js'

const canvas = document.getElementById('game')
const game = Game.getInstance({ canvas })
game.start().catch(err => console.error('Game start failed:', err))

window.__GAME__ = game
