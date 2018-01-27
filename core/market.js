'use strict';

const ccxt = require('ccxt');
const configs = require('../config/settings');
const arbitrage = require('./arbitrage');
const colors = require('colors');

exports.initialize = async function() {
  try {
    const tickets = await prepareTickets();
    console.info('Tickets to be monitored:', tickets.length);
    for (let ticket of tickets) {
      try {
        startArbitrageByTicket(ticket);
        setInterval(function() {
          startArbitrageByTicket(ticket)
        }, (configs.checkInterval > 0 ? configs.checkInterval : 1) * 60000);
      } catch (error) {
        console.error(colors.red('Error:'), error.message);
      }
    }
    console.info('Bot started.')
  } catch (error) {
    console.error(colors.red('Error:'), error.message);
  }
}

async function startArbitrageByTicket(ticket) {
  try {
    let promises = ticket.exchanges.map(async (exchange) =>
      Promise.resolve(await fetchDataByTicketAndExchange(
        ticket.symbol, exchange)));

    Promise.all(promises).then((response) => {
      arbitrage.checkOpportunity(response);
    }).catch((error) => {
      console.error(colors.red('Error:'), error.message);
    });
  } catch (error) {
    console.error(colors.red('Error:'), error.message);
  }
}

async function fetchDataByTicketAndExchange(ticket, exchangeName) {
  const exchange = new ccxt[exchangeName]();
  const market = await exchange.fetchTicker(ticket);

  return {
    name: exchangeName,
    ticket: ticket,
    cost: 0.005,
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

  for (let name of exchanges) {
    try {
      let exch = new ccxt[name]();
      api[name] = exch;
      let markets = await exch.loadMarkets();
      if (!configs.filter.exchanges) {
        exchanges.push(name);
      }
    } catch (error) {
      console.error(colors.red('Error:'), error.message);
    }
  }

  let symbols = [];
  ccxt.unique(ccxt.flatten(exchanges.map(name => api[name].symbols))).filter(symbol =>
    ((configs.filter.tickets) ? configs.tickets.map(tn =>
      (symbol.indexOf(tn) >= 0) ? symbols.push(symbol) : 0) : symbols.push(symbol)));

  let arbitrables = symbols.filter(symbol => exchanges.filter(name =>
    (api[name].symbols.indexOf(symbol) >= 0)).length > 1).sort((id1, id2) =>
    (id1 > id2) ? 1 : ((id2 > id1) ? -1 : 0));

  let tickets = arbitrables.map(symbol => {
    let row = {
      symbol,
      exchanges: []
    };
    for (let name of exchanges)
      if (api[name].symbols.indexOf(symbol) >= 0)
        row.exchanges.push(name);
    return row
  });

  return tickets;
}