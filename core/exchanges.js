
const ccxt = require('ccxt');

const _exchangeCache = {}
const exchange = exchangeName => {
  const exchangeKeys = require('../.exchange-keys.json')
  if (exchangeName in _exchangeCache) {
    return _exchangeCache[exchangeName]
  }
  if (!(exchangeName in ccxt)) throw new Error('Exchange ' + exchangeName + ' not supported in ccxt')
  _exchangeCache[exchangeName] = new ccxt[exchangeName]({
    ...exchangeKeys[exchangeName],
    enableRateLimit: true
  })
  return _exchangeCache[exchangeName]
}

module.exports = { exchange }
