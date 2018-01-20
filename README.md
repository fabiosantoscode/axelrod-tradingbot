# AXELROD TRADING BOT
*Trading Bot for Cryptocurrency*

[![AUR](https://img.shields.io/aur/license/yaourt.svg)]() 
[![node (tag)](https://img.shields.io/node/v/passport/latest.svg)]()
[![npm](https://img.shields.io/npm/v/npm.svg?style=plastic)]()

## Why Axelrod?
The name was inspired by the protagonist of the series [Billions](http://www.imdb.com/title/tt4270492/), whose billionaire Axelrod is able to discover the best moves to profit from the market.

## Running application

1) Install dependencies running the command: `npm install`

2) Configure the exchanges and currencies that will be monitored, in the file: `config/settings.json` 

    * *For see all opportunities, disable filters.*

3) Now, execute the command `npm start`

## Exchanges

We use the [ccxt](https://github.com/ccxt/ccxt/wiki/Manual#exchanges) library, so all exchanges that do not require token and secrecy are integrated.

## Disclaimer
> Axelrod Trading Bot is not to be used as financial advice or a guide for any financial investments, it's a experiment. Use at your own risk!