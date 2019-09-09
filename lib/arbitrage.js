'use strict';

const fs = require('fs')
const util = require('util')
const lodash = require('lodash')
const colors = require('colors')
const big = require('big.js')
const configs = require('../config/settings')
const log = require('./logger')
const { exchange } = require('./exchanges')

let openOpportunities = [];

try {
  openOpportunities = JSON.parse(fs.readFileSync('data/opportunities.json', 'utf-8'))
} catch (e) {
  log.info({ type: 'no-opportunities-file' })
  openOpportunities = []
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

exports.openOpportunitiesLoop = async function({ tickets, getPrices }) {
  while (true) {
    for (const ticket of tickets) {
      try {
        const prices = await getPrices(ticket)
        const opportunity = getOpportunity({ prices, ticket });
        if (opportunity.gain >= configs.openOpportunity
          && !openOpportunities.find(o => o.id === opportunity.id)
        ) {
          opportunity.openedAt = new Date().toISOString()
          log.info({ type: 'open', opportunity })
          openOpportunities.push(opportunity)
          writeOpportunitiesFile()
        }
      } catch (e) {
        log.error(e)
      }
      if (openOpportunities.length) {
        // We're observing open opportunities,
        // so we should allow them to be observed
        await wait(5000)
      }
    }
  }
}

exports.closeOpportunitiesLoop = async ({ getPrices }) => {
  while (true) {
    while (!openOpportunities.length) await wait(500)
    for (const oldOpp of openOpportunities) {
      const prices = await getPrices(oldOpp.ticket)
      const opportunity = getOpportunity({ prices, ticket: oldOpp.ticket })
      if (opportunity.gain <= configs.closeOpportunity) {
        openOpportunities = openOpportunities
          .filter(opp => opp.id !== oldOpp.id)
        writeOpportunitiesFile()
        opportunity.openedAt = oldOpp.openedAt
        opportunity.closedAt = new Date().toISOString()
        log.info({ type: 'close', opportunity })
      }
    }
  }
}

const getCost = (exchangeName, symbol) => {
  const { taker, maker } = exchange(exchangeName).markets[symbol]
  return Math.max(taker, maker)
}

function getOpportunity({ prices, ticket }) {
  const bestBid = lodash.maxBy(prices, 'bid')
  const bestAsk = lodash.minBy(prices.filter(p => p.exchangeName !== bestBid.exchangeName), 'ask')

  if (!bestAsk) {
    log.warn({ type: 'best-ask-not-found', ticket })
    return
  }

  const oppId = ticket.symbol + '-' + bestAsk.exchangeName + '-' + bestBid.exchangeName

  // short at bestBid.exchangeName and long at bestAsk.exchangeName
  // Their prices will eventually normalise

  const amount = big(1).div(bestAsk.ask)

  // TODO turn the muls into a div
  // (since there's a 1/ask above)
  const bought = big(bestAsk.ask).mul(amount)
  const sold = big(bestBid.bid).mul(amount)

  const buyCost = getCost(bestAsk.exchangeName, ticket.symbol)
  const sellCost = getCost(bestBid.exchangeName, ticket.symbol)

  let cost = bought.mul(buyCost).plus(sold.times(sellCost))

  let gain = sold.minus(bought.plus(cost))

  cost = Number(cost)
  gain = Number(gain)

  return Object.seal({
    id: oppId,
    ticket,
    bestAsk,
    bestBid,
    cost,
    gain,
    openedAt: null,
    closedAt: null,
  })
}

function writeOpportunitiesFile() {
  fs.writeFileSync('data/opportunities.json', JSON.stringify(openOpportunities, null, 2))
}
