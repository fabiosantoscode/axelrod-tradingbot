'use strict'

const assert = require('assert')
const lodash = require('lodash')
const async = require('async')
const ccxt = require('ccxt')
const colors = require('colors')
const configs = require('../config/settings')
const arbitrage = require('./arbitrage')
const log = require('./logger')
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
  return Promise.all(ticket.exchanges.map(async (exchangeName) => {
    const ticker = await retries(() => exchange(exchangeName).fetchTicker(ticket.symbol))
    assert(ticker)
    return Object.freeze({
      exchangeName,
      bid: ticker.bid,
      ask: ticker.ask,
      volume: ticker.quoteVolume,
    })
  }))
}

async function prepareTickets() {
  const exchanges = configs.exchanges

  await Promise.all(exchanges.map(async exchangeName => {
    try {
      await retries(() => exchange(exchangeName).loadMarkets())
    } catch (error) {
      log.error(error)
      exchanges.splice(exchanges.indexOf(exchangeName), 1)
    }
  }))

  if (exchanges.length < 2) {
    throw new Error('not enough exchanges: ' + JSON.stringify(exchanges))
  }

  const symbols = []

  const allSymbols = lodash.uniq(
    exchanges
      .map(exchangeName => exchange(exchangeName).symbols)
      .reduce((a, b) => a.concat(b), [])
  )

  allSymbols.forEach(symbol => {
    // TODO it's not recommended to split by the slash
    const [baseCoin, quoteCoin] = symbol.split('/')
    configs.tickets.forEach(configTicket => {
      if (quoteCoin === configTicket) {
        symbols.push(symbol)
      }
    })
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
        exchangesTradingThis.push(exchangeName)

    return { symbol, exchanges: exchangesTradingThis }
  })

  log.info({
    type: 'start',
    exchanges,
    tickets: tickets.map(t => t.symbol),
    ticketCount: tickets.length
  })

  return tickets
}
