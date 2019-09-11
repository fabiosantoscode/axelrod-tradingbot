
const investment = .0005

module.exports = {
  investment,
  openOpportunity: investment * .01,
  closeOpportunity: investment * .005,
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
  ]
}
