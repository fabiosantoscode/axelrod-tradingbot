'use strict'

const assert = require('assert')
const fs = require('fs')
const util = require('util')
const fetch = require('node-fetch')
const lodash = require('lodash')
const big = require('big.js')
const config = require('../config/settings')
const log = require('./logger')
const { exchange } = require('./exchanges')

const minute = 60 * 1000
const hour = 60 * minute

let openOpportunities = []

try {
  openOpportunities = JSON.parse(fs.readFileSync('data/opportunities.json', 'utf-8'))
} catch (e) {
  log.info({ type: 'no-opportunities-file' })
  openOpportunities = []
}

function sendSlackMessage(text) {
  const { slackWebhook } = config
  if (!slackWebhook) return
  fetch(slackWebhook, {
    method: 'POST',
    body: JSON.stringify({
      text,
      icon_emoji: ':scales:'
    })
  })
}

function notifyPosition(type, opportunity) {
  log.info({ type, opportunity })
  sendSlackMessage(`[ ${type} ]: ${opportunity.id} gap: ${opportunity.gap}`)
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function waitForGapToWiden({ opportunity, getPrices }) {
  const { gap: initialGap, ticket, bestBid, bestAsk, investment } = opportunity

  let previousGap = initialGap
  let gap = previousGap
  while (previousGap <= gap) {
    previousGap = gap
    gap = getUpdatedGap({
      prices: await getPrices(opportunity.ticket),
      opportunity
    })
  }

  const widening = gap - initialGap

  if (widening > 0) {
    log.info({ type: 'gap-widened-before-open', widening })
  } else {
    log.info({ type: 'gap-shrunk-before-open', widening })
  }

  return gap
}

exports.openOpportunitiesLoop = async function({ tickets, getPrices }) {
  while (true) {
    await wait(500)
    if (openOpportunities.length) continue // one opportunity at a time
    const investment = config.investment
    for (const ticket of tickets) {
      try {
        const prices = await getPrices(ticket)
        const opportunity = getOpportunity({ prices, ticket, investment })
        if (!opportunity) continue // rare case
        if (
          opportunity.gap >= 0
          && !openOpportunities.find(({ id }) => id === opportunity.id)
          && await validateOpportunityHistory({ opportunity, investment })
        ) {
          const gap = await waitForGapToWiden({ opportunity, getPrices })
          if (gap.times(opportunity.cost) >= config.openOpportunity) {
            // OPEN
            opportunity.openedAt = new Date().toISOString()
            openOpportunities.push(opportunity)
            notifyPosition('open', opportunity)
            writeOpportunitiesFile()
          }
        }
      } catch (e) {
        log.error(e)
      }
    }
  }
}

exports.closeOpportunitiesLoop = async ({ getPrices }) => {
  const strategies = new WeakMap()
  while (true) {
    // Don't just keep polling
    while (!openOpportunities.length) await wait(500)
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
          notifyPosition('close', opportunity)
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

  // some exchanges will return more candlesticks than others
  while (candlesticksShort.length > candlesticksLong.length) candlesticksShort.shift()
  while (candlesticksLong.length > candlesticksShort.length) candlesticksLong.shift()

  const pairs = lodash.zip(candlesticksShort, candlesticksLong)
  for (const candlePair of pairs) {
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
    if (getAge() > emergencyClose) break
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
      return
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
const minVolume = 10
function getOpportunity({ prices, ticket, investment }) {
  prices = prices.filter(({ volume }) => volume > minVolume)

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

  const opportunity = Object.seal({
    id: ticket.symbol + '-' + bestAsk.exchangeName + '-' + bestBid.exchangeName,
    investment,
    ticket,
    bestAsk,
    bestBid,
    gap: Number(gap),
    cost: Number(cost),
    openedAt: null,
    closedAt: null,
    closeGap: null,
  })

  return opportunity
}

function writeOpportunitiesFile() {
  fs.writeFileSync('data/opportunities.json', JSON.stringify(openOpportunities, null, 2))
}
