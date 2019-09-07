'use strict';

const lodash = require('lodash');
const configs = require('../config/settings');
const colors = require('colors');
const util = require('util');
const json2csv = require('json2csv');
const fs = require('fs');

let lastOpportunities = [];

try {
  lastOpportunities = JSON.parse(fs.readFileSync('data/opportunities.json', 'utf-8'))
} catch (e) {
  console.log('Could not find data/opportunities.json, starting with an empty file.')
  lastOpportunities = []
}

exports.getOrder = async function({ prices, ticket, funds }) {
  const bestBid = lodash.maxBy(prices, 'bid');
  const bestAsk = lodash.minBy(prices, 'ask');

  if (bestBid.bid > bestAsk.ask) {
    const amount = funds / bestAsk.ask;

    const bought = bestAsk.ask * amount;
    const sould = bestBid.bid * amount;

    const cost = (bought * bestAsk.cost) + (sould * bestBid.cost);

    const estimatedGain = (sould - (bought + cost)).toFixed(2);
    const percentage = ((estimatedGain / funds) * 100).toFixed(2);

    const opportunity = {
      id: ticket + '-' + bestAsk.exchangeName + '-' + bestBid.exchangeName,
      created_at: new Date(),
      ticket,
      amount: Number(amount.toFixed(8)),
      buy_at: bestAsk.exchangeName,
      ask: bestAsk.ask,
      sale_at: bestBid.exchangeName,
      bid: bestBid.bid,
      gain: Number(percentage),
      estimated_gain: estimatedGain
    }

    let index = lastOpportunities.indexOf(opportunity.id);
    if (index == -1 && percentage >= configs.openOpportunity) {
      register(opportunity);
      lastOpportunities.push(opportunity.id);
      writeOpportunitiesFile()

      return ['buy', opportunity]
    } else if (index != -1 && percentage <= configs.closeOpportunity) {
      lastOpportunities.splice(index, 1);
      writeOpportunitiesFile()

      return ['sell', opportunity]
    }
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
    fs.appendFileSync('data/arbitrage.csv', csv);
  } catch (error) {
    console.error(error)
  }
}

function writeOpportunitiesFile() {
  fs.writeFileSync('data/opportunities.json', JSON.stringify(lastOpportunities, null, 2))
}
