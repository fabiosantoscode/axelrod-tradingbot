
const localSettings = (() => {
  try {
    return require('../conf.js')
  } catch (e) {}
})()

const investment = .08

module.exports = {
  investment,
  openOpportunity: 0.0003,
  closeOpportunity: 0.0001,
  // Set these two to true so we can choose which exchanges and coins we want to trade
  filter: {
    exchanges: true,
    tickets: true
  },
  exchanges: [
    'binance',
    'poloniex',
    /*
    'gateio',
    'bittrex',
    'kraken',
    'upbit',
    'mercado'
    */
  ],
  tickets: [
    'BTC',
  ],
  ...localSettings
}
