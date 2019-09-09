'use strict';

const fs = require('fs')
const util = require('util')
const lodash = require('lodash')
const colors = require('colors')
const configs = require('../config/settings')
const { exchange } = require('./exchanges')

let openOpportunities = [];

try {
  openOpportunities = JSON.parse(fs.readFileSync('data/opportunities.json', 'utf-8'))
} catch (e) {
  console.log('Could not find data/opportunities.json, starting with an empty file.')
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
          console.log(JSON.stringify({ type: 'open', opportunity }))
          openOpportunities.push(opportunity)
          writeOpportunitiesFile()
        }
      } catch (e) {
        console.error(e)
      }
      if (openOpportunities.length) {
        // We're observing opportunities, the other loop is more important
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
        console.log(JSON.stringify({ type: 'close', opportunity }))
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
    console.log('Couldnt find a best ask for ' + ticket.symbol)
    return
  }

  const oppId = ticket.symbol + '-' + bestAsk.exchangeName + '-' + bestBid.exchangeName

  // short at bestBid.exchangeName and long at bestAsk.exchangeName
  // Their prices will eventually normalise

  const amount = 1 / bestAsk.ask;

  // TODO turn the muls into a div
  // (since there's a 1/ask above)
  const bought = bestAsk.ask * amount;
  const sold = bestBid.bid * amount;

  const cost = (bought * getCost(bestAsk.exchangeName, ticket.symbol))
    + (sold * getCost(bestBid.exchangeName, ticket.symbol))

  const gain = sold - (bought + cost)

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
