'use strict';

const lodash = require('lodash')
const async = require('async')
const ccxt = require('ccxt');
const configs = require('../config/settings');
const arbitrage = require('./arbitrage');
const colors = require('colors');
const retries = require('./retries')
const { exchange } = require('./exchanges')

exports.initialize = async function() {
  const tickets = await prepareTickets()
  await Promise.all([
    arbitrage.openOpportunitiesLoop({ tickets, getPrices }),
    arbitrage.closeOpportunitiesLoop({ getPrices })
  ])
}

async function getPrices(ticket) {
  return Promise.all(ticket.exchanges.map((exchangeName) =>
    fetchDataByTicketAndExchange(ticket.symbol, exchangeName)))
}

async function fetchDataByTicketAndExchange(ticket, exchangeName) {
  const market = await retries(() => exchange(exchangeName).fetchTicker(ticket))

  if (!market) {
    throw new Error('Exchange ' + exchangeName + ' did not return market for ' + ticket)
  }

  return {
    exchangeName,
    ticket,
    bid: market.bid,
    ask: market.ask
  }
}

async function prepareTickets() {
  let exchanges = [];

  if (configs.filter.exchanges) {
    exchanges = configs.exchanges;
  } else {
    exchanges = ccxt.exchanges;
  }

  await Promise.all(exchanges.map(async exchangeName => {
    try {
      await retries(() => exchange(exchangeName).loadMarkets())
    } catch (error) {
      console.error(colors.red('Error:'), error.message);
      exchanges.splice(exchanges.indexOf(exchangeName), 1);
    }
  }))

  const symbols = []

  const allSymbols = lodash.uniq(
    exchanges
      .map(exchangeName => exchange(exchangeName).symbols)
      .reduce((a, b) => a.concat(b), [])
  )

  allSymbols.forEach(symbol => {
    if (configs.filter.tickets) {
      // TODO it's not recommended to split by the slash
      const [baseCoin, quoteCoin] = symbol.split('/')
      configs.tickets.forEach(configTicket => {
        if (quoteCoin === configTicket) {
          symbols.push(symbol)
        }
      })
    } else {
      symbols.push(symbol)
    }
  })

  const arbitrables = lodash.uniq(
    symbols
      .filter(symbol => {
        const exchangesTradingSymbol = exchanges
          .filter(exchangeName =>
            exchange(exchangeName).symbols.includes(symbol))
        return exchangesTradingSymbol.length >= 2
      })
      .sort(),
  )

  const tickets = arbitrables.map(symbol => {
    const exchangesTradingThis = []

    for (const exchangeName of exchanges)
      if (exchange(exchangeName).symbols.includes(symbol))
        exchangesTradingThis.push(exchangeName);

    return { symbol, exchanges: exchangesTradingThis }
  });

  console.log(JSON.stringify({
    type: 'start',
    exchanges,
    tickets: tickets.map(t => t.symbol),
    ticketCount: tickets.length
  }))
  return tickets;
}
