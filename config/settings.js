
module.exports = {
  openOpportunity: .01,
  closeOpportunity: .0025,
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
    'USDT'
  ]
}
