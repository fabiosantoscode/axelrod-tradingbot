'use strict';

const lodash = require('lodash')
const async = require('async')
const ccxt = require('ccxt');
const configs = require('../config/settings');
const arbitrage = require('./arbitrage');
const colors = require('colors');
const retries = require('./retries')
const { exchange } = require('./exchanges')

const unacceptableTicket = Symbol('unacceptable ticket')

async function isAcceptable(ticket) {
  const prices = await getPrices(ticket)

  /* Avoid floating point precision issues */
  const acceptable = lodash.minBy(prices, 'ask').ask > 1e-7
  if (!acceptable) {
    console.log('unacceptable: ' + ticket.symbol)
  } else {
    console.log(ticket.symbol, ticket.exchanges)
  }
  return acceptable
}

exports.initialize = async function() {
  console.info('\nLoading exchanges and tickets...')
  let tickets = await prepareTickets()
  tickets = await async.filter(tickets, isAcceptable)
  console.info('Bot started.')
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

  for (const exchangeName of exchanges) {
    try {
      await retries(() => exchange(exchangeName).loadMarkets())
    } catch (error) {
      console.error(colors.red('Error:'), error.message);
      exchanges.splice(exchanges.indexOf(exchangeName), 1);
    }
  }

  const symbols = []

  const allSymbols = lodash.uniq(
    exchanges
      .map(exchangeName => exchange(exchangeName).symbols)
      .reduce((a, b) => a.concat(b), [])
  )

  allSymbols.forEach(symbol => {
    if (configs.filter.tickets) {
      configs.tickets.forEach(configTicket => {
        const [base, quote] = symbol.split('/')
        if (quote === configTicket) {
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
          .filter(exchangeName => exchange(exchangeName).symbols.includes(symbol))
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

  console.info('Exchanges:', colors.green(exchanges.length), '| Tickets:', colors.green(tickets.length));
  return tickets;
}
