'use strict';

const assert = require('assert')
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
    await wait(500)
    for (const ticket of tickets) {
      try {
        const prices = await getPrices(ticket)
        const opportunity = getOpportunity({ prices, ticket, side: 'open' });
        if (!opportunity) continue; // rare case
        if (
          opportunity.gain >= configs.openOpportunity
          && opportunity.absGap >= 1e-6
          && !openOpportunities.find(({ id }) => id === opportunity.id)
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
        await wait(1000)
      }
    }
  }
}

exports.closeOpportunitiesLoop = async ({ getPrices }) => {
  const previousGaps = new WeakMap()
  while (true) {
    // Don't just keep polling
    await wait(10000 / (openOpportunities.length || 1))
    for (const opportunity of openOpportunities) {
      try {
        const prices = await getPrices(opportunity.ticket)
        const gap = getOpportunityGap({ prices, opportunity })
        const prevGap = previousGaps.get(opportunity) || NaN
        if (gap !== prevGap) {
          previousGaps.set(opportunity, gap)
          log.info({
            type: 'open-op-gap',
            symbol: opportunity.ticket.symbol,
            gap: gap,
            absGap: opportunity.absGap,
            originalGap: opportunity.gap
          })
        }
        if (gap <= configs.closeOpportunity) {
          openOpportunities = openOpportunities.filter(opp => opp !== opportunity)
          writeOpportunitiesFile()
          opportunity.closedAt = new Date().toISOString()
          opportunity.closeGap = gap
          log.info({ type: 'close', opportunity })
        }
      } catch (error) {
        log.error(error)
      }
    }
  }
}

const getCost = (exchangeName, symbol) => {
  const { taker, maker } = exchange(exchangeName).markets[symbol]
  return Math.max(taker, maker)
}

const getGap = ({ bestBid, bestAsk }) =>
  big(1).minus(big(bestBid.bid).div(bestAsk.ask))

function getOpportunityGap({ prices, opportunity }) {
  opportunity = {...opportunity}

  const bestAsk = prices.find(p => p.exchangeName === opportunity.bestAsk.exchangeName)
  const bestBid = prices.find(p => p.exchangeName === opportunity.bestBid.exchangeName)

  return getGap({ bestAsk, bestBid })
}

// Might return a negative opportunity, it's up to the caller to validate or use the negative opportunity
function getOpportunity({ prices, ticket }) {
  prices = prices.filter(({ volume }) => volume > 0.1)

  const bestBid = lodash.maxBy(prices, 'bid')

  if (!bestBid) return

  const bestAsk = lodash.minBy(
    prices.filter(({ exchangeName }) => exchangeName !== bestBid.exchangeName),
    'ask'
  )

  if (!bestAsk) return

  if (bestAsk.ask === 0) {
    return
  }

  const oppId = ticket.symbol + '-' + bestAsk.exchangeName + '-' + bestBid.exchangeName

  // we short at bestBid.exchangeName and long at bestAsk.exchangeName
  // Their prices will eventually normalise

  const buyCost = getCost(bestAsk.exchangeName, ticket.symbol)
  // TODO take into account avg cost of longing
  const sellCost = getCost(bestBid.exchangeName, ticket.symbol)

  const cost = big(buyCost).plus(sellCost)

  const absGap = big(bestAsk.ask).minus(bestBid.bid)
  const gap = getGap({ bestBid, bestAsk })

  const gain = gap.minus(gap.times(cost))

  const opportunity = Object.seal({
    id: oppId,
    ticket,
    bestAsk,
    bestBid,
    cost: Number(cost),
    gain: Number(gain),
    gap: Number(gap),
    absGap: Number(absGap),
    openedAt: null,
    closedAt: null,
    closeGap: null,
  })

  return opportunity
}

function writeOpportunitiesFile() {
  fs.writeFileSync('data/opportunities.json', JSON.stringify(openOpportunities, null, 2))
}
