'use strict';

const market = require('./lib/market');

market.initialize().catch(error => {
  console.error(error)
  process.exitCode = 1
})
