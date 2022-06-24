# Serum History

Collects and aggregates trades from serum dex for display in a tradingview chart.
This is powering the charts on [mango.markets](https://mango.markets).
Feel free to improve and extend for the benefit for the larger solana ecosystem.

** Note: This does not include a functioning trading view to inspect the
data.** Check the [mango markets gui code](https://github.com/blockworks-foundation/mango-ui-v2/blob/main/components/TradingView/index.tsx) for a reference how to use this API to display a TradingView.

## Installation

To run this project you first need to install Redis, you can use these [Installation Instructions](https://redis.io/docs/getting-started/#install-redis) if you do not already have it installed.

Next you will need to install the required node_modules using either npm or yarn.

Using npm:

```
npm install
```

Using yarn:

```
yarn 
```

To run the project in developer mode:

```
npm run dev
```

## Configuration

* Markets: are configured by using the IDS.json in the Mango client library. To 
  use a custom list of markets add support for your protocol to loadMarkets in 
  config.ts.

* All other configuration should be handled via environment variables.
  So far the following variables exist:

```
REDISCLOUD_URL: redis connection url
REDIS_MAX_CONN: maximum number of concurrent connections used by the redis pool
RPC_ENDPOINT_URL: solana rpc connection url
INTERVAL: time in seconds to wait between event queue polls
```

## Questions / Suggestions?

👋 Reach us on our [discord](https://discord.gg/cbDHKCnGJU)
