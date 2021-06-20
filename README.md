# Serum History

Collects and aggregates trades from serum dex for display in a tradingview chart.
This is powering the charts on [mango.markets](https://mango.markets).
Feel free to improve and extend for the benefit for the larger solana ecosystem.

** Note: This does not include a functioning trading view to inspect the
data.** Check the [mango markets gui code](https://github.com/blockworks-foundation/mango-ui-v2/blob/main/components/TradingView/index.tsx) for a reference how to use this API to display a TradingView.

## Configuration

* Markets: should be added to the dictionaries in src/index.ts
  marketsV3 - for wrapped token denominated markets (deprecated)
  nativeMarketsV3 - for native token denominated markets

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
