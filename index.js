'use strict';

const log = require('./lib/logger')
const market = require('./lib/market');

market.initialize().catch(error => {
  log.error(error)
  process.exitCode = 1
})
