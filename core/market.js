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

exports.initialize = async function() {
  console.info('\nLoading exchanges and tickets...')
  const tickets = await prepareTickets()
  await async.filterLimit(tickets, 1, async ticket => {
    const result = await startArbitrageByTicket(ticket, /* first execution */true)
    return result !== unacceptableTicket
  })
  console.info('Bot started.')
  while (true) {
    for (const ticket of tickets) {
      try {
        await startArbitrageByTicket(ticket);
      } catch (e) {
        console.error(e)
      }
    }
  }
}

async function startArbitrageByTicket(ticket, isFirstExecution) {
  const prices = await Promise.all(ticket.exchanges.map((exchangeName) =>
      fetchDataByTicketAndExchange(ticket.symbol, exchangeName)))

  if (isFirstExecution) {
    const acceptable = lodash.minBy(prices, 'ask').ask > 0.005  /* Avoid floating point precision issues */
    if (acceptable) {
      console.log(ticket.symbol + ':', ticket.exchanges)
    } else {
      console.log('unacceptable: ' + ticket.symbol)
      return unacceptableTicket
    }
  }

  const [openOrClose, opportunity] = arbitrage.getOrder({ prices, ticket, funds: 1000 })

  if (openOrClose) {
    const orderType = openOrClose === 'open' ? colors.red(openOrClose) : colors.green(openOrClose)
    console.log('ORDER: ' + orderType + ' ' + opportunity.amount + ' ' + opportunity.ticket.symbol, opportunity)
  }
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
        if (symbol.split('/').includes(configTicket)) {
          symbols.push(symbol)
        }
      })
    } else {
      symbols.push(symbol)
    }
  })

  const arbitrables = symbols
    .filter(symbol => {
      const exchangesTradingSymbol = exchanges
        .filter(exchangeName => exchange(exchangeName).symbols.includes(symbol))
      return exchangesTradingSymbol.length >= 2
    })
    .sort()

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
