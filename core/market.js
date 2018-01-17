'use strict';

const ccxt = require ('ccxt');
const arbitrage = require('./arbitrage');

exports.initialize = async function() {
    try {
        
        let tickets = await prepareTickets();
        
        for (let ticket of tickets) {
            try {
                startArbitrageByTicket(ticket);
            } catch (error) {
                console.error('Error:', error.message);
            }
        }
    
    } catch (error) {
        console.error('Error:', error.message);
    }
}

async function prepareTickets() {
    let ids = [];
    let exchanges = {}

    for (let id of ccxt.exchanges) {
        try {
            
            let exchange = new ccxt[id]();

            exchanges[id] = exchange;
    
            let markets = await exchange.loadMarkets();
            
            ids.push(id);
            
        } catch (error) {
            console.error('Error:', error.message);
        }
    }

    let uniqueSymbols = ccxt.unique(ccxt.flatten(ids.map(id => exchanges[id].symbols)));

    let arbitrableSymbols = uniqueSymbols.filter(symbol => ids.filter(id => 
        (exchanges[id].symbols.indexOf(symbol) >= 0)).length > 1)
            .sort((id1, id2) => (id1 > id2) ? 1 : ((id2 > id1) ? -1 : 0));
        
    let tickets = arbitrableSymbols.map (symbol => {
        let row = { symbol, exchanges:[] };
        for (let id of ids)
            if (exchanges[id].symbols.indexOf (symbol) >= 0)
                row.exchanges.push(id);
        return row
    });
    
    return tickets;
}

async function startArbitrageByTicket(ticket) {
    console.log(ticket);
    
    try {
        // Promise.all()
        // .then((response) => {
        //     console.log(response);
        //     arbitrage.checkOpportunity(response);
        // }).catch((error)=> {
        //     console.error('Error:', error.message);
        // });
    } catch (error) {
        console.error('Error:', error.message);
    }   
}

async function fetchDataByTicketAndExchange(ticket, exchangeName) {
  let exchange = new ccxt[exchangeName]();
  const market = await exchange.fetchTicker(ticket);
  
  return {
      name: exchange.constructor.name,
      ticket: ticket,
      cost: 0.005,
      bid: market.bid,
      ask: market.ask
  };
}

