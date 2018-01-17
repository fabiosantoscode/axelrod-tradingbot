'use strict';

const market = require('./core/market');

(async function () {

  console.log('Axelrod Trading Bot - Follow the money!');
  console.log('=======================================');
  
  market.initialize();

})();
