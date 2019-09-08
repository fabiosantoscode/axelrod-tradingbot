
module.exports = {
  // Was .04 initially
  openOpportunity: 0.001,
  // Was .02 initially
  closeOpportunity: 0,
  // Set these two to true so we can choose which exchanges and coins we want to trade
  filter: {
    exchanges: true,
    tickets: true
  },
  exchanges: [
    'kraken',
    'coss',
    /*
    'gateio',
    'binance',
    'bittrex',
    'kraken',
    'upbit',
    'mercado'
    */
  ].sort(),
  tickets: [
    'LTC',
    'ETH',
    'XMR',
    'BCH',
    'BSV',
    'DOGE'
  ].sort()
}
