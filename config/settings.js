
module.exports = {
  openOpportunity: .04,
  closeOpportunity: .02,
  // Set these two to true so we can choose which exchanges and coins we want to trade
  filter: {
    exchanges: true,
    tickets: true
  },
  exchanges: [
    'kraken',
    'coss',
    'poloniex',
    /*
    'gateio',
    'binance',
    'bittrex',
    'kraken',
    'upbit',
    'mercado'
    */
  ],
  tickets: [
    'BTC',
    'DASH',
    'LTC',
    'USDT'
  ]
}
