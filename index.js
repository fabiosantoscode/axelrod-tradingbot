'use strict';

const market = require('./lib/market');

console.log('Axelrod Trading Bot - Follow the money!')
console.log('=======================================')

market.initialize().catch(error => {
  console.error(error)
  process.exitCode = 1
})
