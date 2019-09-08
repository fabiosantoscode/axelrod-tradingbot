'use strict';

const fs = require('fs')
const util = require('util')
const lodash = require('lodash')
const colors = require('colors')
const json2csv = require('json2csv')
const configs = require('../config/settings')
const { exchange } = require('./exchanges')

let lastOpportunities = [];

try {
  lastOpportunities = JSON.parse(fs.readFileSync('data/opportunities.json', 'utf-8'))
} catch (e) {
  console.log('Could not find data/opportunities.json, starting with an empty file.')
  lastOpportunities = []
}

const getCost = (price, ticket) => {
  const { exchangeName, symbol } = price
  const { taker, maker } = exchange(exchangeName).markets[ticket.symbol]
  return Math.max(taker, maker)
}

exports.getOrder = function({ prices, ticket, funds }) {
  const bestBid = lodash.maxBy(prices, 'bid')
  const bestAsk = lodash.minBy(prices, 'ask')

  if (bestBid.exchangeName === bestAsk.exchangeName) return []

  if (bestBid.bid <= bestAsk.ask) return []

  const amount = funds / bestAsk.ask;

  const bought = bestAsk.ask * amount;
  const sold = bestBid.bid * amount;

  const cost = (bought * getCost(bestAsk, ticket)) + (sold * getCost(bestBid, ticket))

  const estimatedGain = sold - (bought + cost)
  const gainProportion = estimatedGain / funds

  const opportunity = {
    id: ticket.symbol + '-' + bestAsk.exchangeName + '-' + bestBid.exchangeName,
    created_at: new Date(),
    ticket,
    amount: Number(amount.toFixed(8)),
    buy_at: bestAsk.exchangeName,
    ask: bestAsk.ask,
    sale_at: bestBid.exchangeName,
    bid: bestBid.bid,
    percentage: gainProportion * 100,
    estimated_gain: estimatedGain,
    cost
  }

  const haveOpportunity = lastOpportunities.find(opp => opp.id === opportunity.id)
  if (!haveOpportunity && gainProportion >= configs.openOpportunity) {
    register(opportunity)
    lastOpportunities.push(opportunity)
    writeOpportunitiesFile()

    return ['open', opportunity]
  } else if (haveOpportunity && gainProportion <= configs.closeOpportunity) {
    lastOpportunities.splice(index, 1)
    writeOpportunitiesFile()

    return ['close', opportunity]
  }
  return []
}

function register(opportunity) {
  let toCsv = {
    data: opportunity,
    hasCSVColumnTitle: false
  };

  try {
    let csv = json2csv(toCsv) + '\r\n';
    fs.appendFileSync('data/arbitrage.csv', csv)
  } catch (error) {
    console.error(error)
  }
}

function writeOpportunitiesFile() {
  fs.writeFileSync('data/opportunities.json', JSON.stringify(lastOpportunities, null, 2))
}
