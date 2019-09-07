'use strict';

const lodash = require('lodash')
const async = require('async')
const ccxt = require('ccxt');
const configs = require('../config/settings');
const arbitrage = require('./arbitrage');
const colors = require('colors');
const retries = require('./retries')

const INTERVAL = configs.checkInterval > 0
  ? Number(configs.checkInterval)
  : 1

exports.initialize = async function() {
  console.info('\nLoading exchanges and tickets...');
  const tickets = await prepareTickets();
  for (const ticket of tickets) {
    await (async function loop(isFirstExecution) {
      try {
        await startArbitrageByTicket(ticket, isFirstExecution);
      } catch (e) {
        console.error(e)
      }
      setTimeout(loop, INTERVAL * 60 * 1000)
    })(true)
  }
  console.info('Bot started.');
}

async function startArbitrageByTicket(ticket, isFirstExecution) {
  try {
    if (isFirstExecution) {
      console.log(ticket.symbol + ':', ticket.exchanges)
    }
    const prices = await Promise.all(ticket.exchanges.map((exchange) =>
        fetchDataByTicketAndExchange(ticket.symbol, exchange)))

    const [buyOrSell, opportunity] = await arbitrage.getOrder({ prices, ticket, funds: 1000 })

    if (buyOrSell) {
      const orderType = buyOrSell === 'buy' ? colors.red(buyOrSell) : colors.green(buyOrSell)
      console.log('ORDER: ' + orderType + ' ' + opportunity.amount + ' ' + opportunity.ticket.symbol, opportunity)
    }
  } catch (error) {
    console.error(colors.red('Error:'), error.message);
  }
}

async function fetchDataByTicketAndExchange(ticket, exchangeName) {
  const market = await retries(async () => {
    const exchange = new ccxt[exchangeName]();
    return exchange.fetchTicker(ticket);
  })

  if (!market) {
    throw new Error('Exchange ' + exchangeName + ' did not return market for ' + ticket)
  }

  return {
    exchangeName,
    ticket,
    cost: 0.005,  // Fábio: assume slightly larger cost and go with it
    bid: market.bid,
    ask: market.ask
  }
}

async function prepareTickets() {
  let api = {}
  let exchanges = [];

  if (configs.filter.exchanges) {
    exchanges = configs.exchanges;
  } else {
    exchanges = ccxt.exchanges;
  }

  for (const exchangeName of exchanges) {
    try {
      await retries(async () => {
        api[exchangeName] = new ccxt[exchangeName]();
        await api[exchangeName].loadMarkets();
      })
    } catch (error) {
      console.error(colors.red('Error:'), error.message);
      exchanges.splice(exchanges.indexOf(exchangeName), 1);
    }
  }

  let symbols = [];

  const allSymbols = lodash.uniq(
    exchanges
      .map(name => api[name].symbols)
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
        .filter(name => api[name].symbols.includes(symbol))
      return exchangesTradingSymbol.length >= 2
    })
    .sort()

  const tickets = arbitrables.map(symbol => {
    const exchangesTradingThis = []

    for (const name of exchanges)
      if (api[name].symbols.includes(symbol))
        exchangesTradingThis.push(name);

    return { symbol, exchanges: exchangesTradingThis }
  });

  console.info('Exchanges:', colors.green(exchanges.length), '| Tickets:', colors.green(tickets.length));
  return tickets;
}
