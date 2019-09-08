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

const getCost = (price, ticket) => {
  const { exchangeName, symbol } = price
  const { taker, maker } = exchange(exchangeName).markets[ticket.symbol]
  return Math.max(taker, maker)
}

exports.getOrder = function({ prices, ticket }) {
  const bestBid = lodash.maxBy(prices, 'bid')
  const bestAsk = lodash.minBy(prices.filter(p => p.exchangeName !== bestBid.exchangeName), 'ask')

  if (!bestAsk) {
    console.log('Couldnt find a best ask for ' + ticket.symbol)
    return []
  }

  const oppId = ticket.symbol + '-' + bestAsk.exchangeName + '-' + bestBid.exchangeName
  const haveOpenOpportunity = openOpportunities.find(opp => opp.id === oppId)

  // XXX: Maybe we want to sell existing opportunities even when the best ask isn't the best possible ask

  if (bestBid.bid <= bestAsk.ask) return []

  // short at bestBid.exchangeName and long at bestAsk.exchangeName
  // Their prices will eventually normalise

  const funds = 1 // XXX: do we really need the real funds here?
  const amount = funds / bestAsk.ask;

  const bought = bestAsk.ask * amount;
  const sold = bestBid.bid * amount;

  const cost = (bought * getCost(bestAsk, ticket)) + (sold * getCost(bestBid, ticket))

  const gain = sold - (bought + cost)

  const opportunity = {
    id: oppId,
    created_at: new Date(),
    ticket,
    bestAsk,
    bestBid,
    cost,
    gain,
  }

  if (!haveOpenOpportunity && opportunity.gain >= configs.openOpportunity) {
    register(opportunity)
    openOpportunities.push(opportunity)
    writeOpportunitiesFile()

    return ['open', opportunity]
  } else if (haveOpenOpportunity && opportunity.gain <= configs.closeOpportunity) {
    openOpportunities = openOpportunities.filter(opp => opp.id !== oppId)
    writeOpportunitiesFile()

    delete opportunity.gain
    delete opportunity.cost
    delete opportunity.created_at
    return ['close', opportunity]
  }
  return []
}

function writeOpportunitiesFile() {
  fs.writeFileSync('data/opportunities.json', JSON.stringify(openOpportunities, null, 2))
}
