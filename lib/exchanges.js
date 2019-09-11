
const assert = require('assert')
const ccxt = require('ccxt');

const _exchangeCache = {}
const exchange = exchangeName => {
  const exchangeKeys = require('../.exchange-keys.json')
  if (exchangeName in _exchangeCache) {
    return _exchangeCache[exchangeName]
  }
  if (!(exchangeName in ccxt)) throw new Error('Exchange ' + exchangeName + ' not supported in ccxt')
  const exchange = new ccxt[exchangeName]({
    ...exchangeKeys[exchangeName],
    enableRateLimit: true
  })
  assert(exchange.has.fetchOHLCV)
  assert(exchange.fetchOHLCV)
  return (_exchangeCache[exchangeName] = exchange)
}

module.exports = { exchange }
