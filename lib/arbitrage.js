'use strict';

const assert = require('assert')
const fs = require('fs')
const util = require('util')
const lodash = require('lodash')
const colors = require('colors')
const big = require('big.js')
const config = require('../config/settings')
const log = require('./logger')
const { exchange } = require('./exchanges')

const minute = 60 * 1000
const hour = 60 * minute

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
    const investment = 0.01  // XXX: TODO de-hardcode this by reading real balance
    for (const ticket of tickets) {
      try {
        const prices = await getPrices(ticket)
        const opportunity = getOpportunity({ prices, ticket, investment });
        if (!opportunity) continue; // rare case
        if (
          opportunity.gain >= config.openOpportunity
          && !openOpportunities.find(({ id }) => id === opportunity.id)
          && await validateOpportunityHistory({ opportunity, investment })
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
  const strategies = new WeakMap()
  while (true) {
    // Don't just keep polling
    await wait(10000 / (openOpportunities.length || 1))
    for (const opportunity of openOpportunities) {
      try {
        const strategy = strategies.get(opportunity) || closeStrategy(opportunity)
        strategies.set(opportunity, strategy)
        const prices = await getPrices(opportunity.ticket)
        const gap = getUpdatedGap({ prices, opportunity })
        const doClose = strategy.next(gap).done
        if (doClose) {
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

async function validateOpportunityHistory({ opportunity, investment }) {
  const [
    exchangeShort,
    exchangeLong
  ] = [
    exchange(opportunity.bestAsk.exchangeName),
    exchange(opportunity.bestBid.exchangeName)
  ]

  if (opportunity.bestBid.volume < minVolume || opportunity.bestAsk.volume < minVoume) {
    log.info({ type: 'low-volume', id: opportunity.id })
    return false
  }

  const symbol = opportunity.ticket.symbol

  const startTime = Date.now() - hour
  const [
    candlesticksShort,
    candlesticksLong
  ] = await Promise.all([
    exchangeShort.fetchOHLCV(symbol, '5m', startTime),
    exchangeLong.fetchOHLCV(symbol, '5m', startTime),
  ])

  // https://github.com/ccxt/ccxt/wiki/Manual#ohlcv-structure
  const getClosingPrice = candle => candle[4]
  const getGap = ([a, b]) =>
    /* XXX: minor issue: gap might be negative and that's a good thing */
    Math.abs(getClosingPrice(a) - getClosingPrice(b)) * investment

  for (const candlePair of lodash.zip(candlesticksShort, candlesticksLong)) {
    if (getGap(candlePair) < config.closeOpportunity) {
      return true
    }
  }

  log.info({
    type: 'gap-never-closes',
    opportunity,
  }, 'invalid gap for ' + opportunity.id + ': gap hasnt been closing below ' + config.closeOpportunity)

  return false
}

const emergencyClose = 4 * hour
const spinLimit = 15 * minute
function* closeStrategy(opportunity) {
  const getAge = () =>
    Date.now() - new Date(opportunity.openedAt)

  // yield* spinUntilGapWidensAgain() effectively waits until the gap
  // widens a little bit
  function* spinUntilGapWidensAgain(initialGap) {
    const spinEnd = getAge() + spinLimit
    let prevGap = initialGap
    let gap = prevGap
    while (prevGap >= gap && getAge() < spinEnd) {
      prevGap = gap
      gap = yield
    }
    const gapDiff = initialGap - gap
    if (gapDiff < 0) {
      log.warn({ type: 'spin-lost-money', gapDiff }, 'lost money while calling spinUntilGapWidensAgain')
    } else {
      log.info({ type: 'spin-won-money', gapDiff }, 'got some more money while calling spinUntilGapWidensAgain')
    }
  }

  let gap
  while (true) {
    gap = yield
    if (getAge() > emergencyClose) break;
    const proportion = gap / opportunity.gap
    if (
      getAge() > emergencyClose * 0.75 && proportion < 0.85
      || getAge() > emergencyClose * 0.5 && proportion < 0.7
      || getAge() > emergencyClose * 0.25 && proportion < 0.5
    ) {
      log.info({
        type: 'gap-not-closing',
        age: getAge(),
        proportion
      }, 'gap hasn\'t been closing but we can still turn a profit')
      yield* spinUntilGapWidensAgain(gap)
      return
    }
    if (gap <= config.closeOpportunity) {
      yield* spinUntilGapWidensAgain(gap)
      return;
    }
  }

  yield* spinUntilGapWidensAgain(gap)
  const gapDiff = opportunity.gap - gap
  if (gapDiff < 0) {
    log.warn({ gapDiff }, 'lost money in emergency close')
  } else {
    log.info({ gapDiff }, 'emergency close')
  }
}

const getGap = ({ bestBid, bestAsk, investment }) =>
  big(bestBid.bid).mul(investment).minus(big(bestAsk.ask).mul(investment))

function getUpdatedGap({ prices, opportunity }) {
  const bestAsk = prices.find(p => p.exchangeName === opportunity.bestAsk.exchangeName)
  const bestBid = prices.find(p => p.exchangeName === opportunity.bestBid.exchangeName)

  return getGap({ bestAsk, bestBid, investment: opportunity.investment })
}

// Might return a negative opportunity, it's up to the caller to validate or use the negative opportunity
function getOpportunity({ prices, ticket, investment }) {
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

  const getCost = (exchangeName) => {
    const { taker, maker } = exchange(exchangeName).markets[ticket.symbol]
    return big(Math.max(taker, maker)).times(investment)
  }

  const buyCost = getCost(bestAsk.exchangeName)
  // TODO take into account avg cost of longing
  const sellCost = getCost(bestBid.exchangeName)

  const cost = buyCost.plus(sellCost)

  const gap = getGap({ bestBid, bestAsk, investment })

  const gain = gap.minus(cost)

  const opportunity = Object.seal({
    id: oppId,
    investment,
    ticket,
    bestAsk,
    bestBid,
    gap: Number(gap),
    cost: Number(cost),
    gain: Number(gain),
    openedAt: null,
    closedAt: null,
    closeGap: null,
  })

  return opportunity
}

function writeOpportunitiesFile() {
  fs.writeFileSync('data/opportunities.json', JSON.stringify(openOpportunities, null, 2))
}
