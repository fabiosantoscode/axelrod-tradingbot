'use strict';

const market = require('./core/market');

(async function main() {
  console.log('Axelrod Trading Bot - Follow the money!');
  console.log('=======================================');

  try {
    await market.initialize();
  } catch (error) {
    console.error(error);
    process.exit(1)
  }
})();
