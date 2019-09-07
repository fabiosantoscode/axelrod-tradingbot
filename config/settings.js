
module.exports = {
  checkInterval: 1,
  // Was 4 initially
  openOpportunity: 0.005,
  // Was 2 initially
  closeOpportunity: 0.005,
  // Set these two to true so we can choose which exchanges and coins we want to trade
  filter: {
    exchanges: true,
    tickets: true
  },
  exchanges: [
    'gateio',
    'binance',
    'poloniex'
  ],
  tickets: [
    'BTC'
  ]
}
