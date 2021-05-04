import { Account, Connection, PublicKey } from "@solana/web3.js"
import { Market, decodeEventQueue } from "@project-serum/serum"
import cors from "cors"
import express from "express"
import { Tedis, TedisPool } from "tedis"
import { URL } from "url"
import { Order, Trade, TradeSide } from "./interfaces"
import { RedisConfig, RedisStore, createRedisStore } from "./redis"
import { encodeEvents } from "./serum"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const MINUTES = 60 * 1000

class OrderBuffer {
  cache: Map<string, number>
  cleanupInterval: number
  lastCleanup: number
  timeToLive: number

  constructor(timeToLive = 10 * MINUTES, cleanupInterval = 30 * MINUTES) {
    this.cache = new Map()
    this.cleanupInterval = cleanupInterval
    this.lastCleanup = Date.now()
    this.timeToLive = timeToLive
  }

  // returns a list of unique trades that have not been observed by the order buffer
  // guarantees to not emit a new trade even if the same fills have been supplied twice
  filterNewTrades(fills: Order[]): Trade[] {
    const now = Date.now()
    const takerOrders = fills.filter((o) => !o.eventFlags.maker)
    const allTrades = takerOrders.map((o) => {
      return {
        id: o.orderId.toString(16),
        price: o.price,
        side: o.side === "buy" ? TradeSide.Buy : TradeSide.Sell,
        size: o.size,
        ts: now,
      }
    })
    const newTrades = allTrades.filter((t) => !this.cache.has(t.id))

    // store newTrades in cache
    newTrades.forEach((t) => this.cache.set(t.id, now))

    // cleanup cache
    if (now > this.lastCleanup + this.cleanupInterval) {
      let staleCacheEntries: string[] = []
      this.cache.forEach((ts: number, key: string, _) => {
        if (ts > now + this.timeToLive) {
          staleCacheEntries.push(key)
        }
      })

      staleCacheEntries.forEach((key) => {
        this.cache.delete(key)
      })

      this.lastCleanup = now
    }

    return newTrades
  }
}

interface MarketConfig {
  clusterUrl: string
  programId: string
  marketName: string
  marketPk: string
}

async function collectTrades(m: MarketConfig, r: RedisConfig) {
  const store = await createRedisStore(r, m.marketName)
  const marketAddress = new PublicKey(m.marketPk)
  const programKey = new PublicKey(m.programId)
  const connection = new Connection(m.clusterUrl)
  const market = await Market.load(connection, marketAddress, undefined, programKey)

  async function storeTrades(ts: Trade[]) {
    if (ts.length > 0) {
      console.log(m.marketName, ts.length)
      for (let i = 0; i < ts.length; i += 1) {
        await store.storeTrade(ts[i])
      }
    }
  }

  const orderBuffer = new OrderBuffer()
  while (true) {
    try {
      let fills = await market.loadFills(connection)
      let trades = orderBuffer.filterNewTrades(fills)
      storeTrades(trades)
    } catch (err) {
      const error = err.toString().split("\n", 1)[0]
      console.error(m.marketName, { error })
    }

    await sleep(10000)
  }
}

async function collectEventQueue(m: MarketConfig, r: RedisConfig) {
  const store = await createRedisStore(r, m.marketName)
  const marketAddress = new PublicKey(m.marketPk)
  const programKey = new PublicKey(m.programId)
  const connection = new Connection(m.clusterUrl)
  const market = await Market.load(connection, marketAddress, undefined, programKey)

  while (true) {
    try {
      const accountInfo = await connection.getAccountInfo(market["_decoded"].eventQueue)
      if (accountInfo === null) {
        throw new Error(`Event queue account for market ${m.marketName} not found`)
      }
      const events = decodeEventQueue(accountInfo.data, 1000).filter((e) => e.eventFlags.fill)
      if (events.length > 0) {
        const encoded = encodeEvents(events)
        store.storeBuffer(Date.now(), encoded)
      }
    } catch (err) {
      const error = err.toString().split("\n", 1)[0]
      console.error(m.marketName, { error })
    }
    await sleep(10000)
  }
}

const redisUrl = new URL(process.env.REDISCLOUD_URL || "redis://localhost:6379")
const host = redisUrl.hostname
const port = parseInt(redisUrl.port)
let password: string | undefined
if (redisUrl.password !== "") {
  password = redisUrl.password
}

const network = "mainnet-beta"
const clusterUrl = process.env.RPC_ENDPOINT_URL || "https://solana-api.projectserum.com"
const programIdV3 = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"

const marketsV3: Record<string, string> = {
  "BTC/USDT": "5r8FfnbNYcQbS1m4CYmoHYGjBtu6bxfo6UJHNRfzPiYH",
  "ETH/USDT": "71CtEComq2XdhGNbXBuYPmosAjMCPSedcgbNi5jDaGbR",
}

const nativeMarketsV3: Record<string, string> = {
  "BTC/USDT": "C1EuT9VokAKLiW7i2ASnZUvxDoKuKkCpDDeNxAptuNe4",
  "ETH/USDT": "7dLVkUfBVfCGkFhSXDCq1ukM9usathSgS716t643iFGF",
  "BTC/USDC": "A8YFbxQYFVqKZaoYJLLUVcQiWP7G2MeEgW5wsAQgMvFw",
  "ETH/USDC": "4tSvZvnbyzHXLMTiFonMyxZoHmFqau1XArcRCVHLZ5gX",
  "SOL/USDC": "9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT",
  "SOL/USDT": "HWHvQhFmJB3NUcu1aihKmrKegfVxBEHzwVX6yZCKEsi1",
  "SRM/USDC": "ByRys5tuUWDgL73G8JBAEfkdFf8JWBzPBDHsBVQ5vbQA",
  "SRM/USDT": "AtNnsY1AyRERWJ8xCskfz38YdvruWVJQUVXgScC1iPb",
  "RAY/USDT": "teE55QrL4a4QSfydR9dnHF97jgCfptpuigbb53Lo95g",
  "MCAPS/USDC": "GgzXqy6agt7nnfoPjAEAFpWqnUwLBK5r2acaAQqXiEM8",
}

const symbolsByPk = Object.assign(
  {},
  ...Object.entries(marketsV3).map(([a, b]) => ({ [b]: a })),
  ...Object.entries(nativeMarketsV3).map(([a, b]) => ({ [b]: a }))
)

function collectMarketData(programId: string, markets: Record<string, string>) {
  Object.entries(markets).forEach((e) => {
    const [marketName, marketPk] = e
    const marketConfig = { clusterUrl, programId, marketName, marketPk } as MarketConfig
    collectTrades(marketConfig, { host, port, password, db: 0 })
    //collectEventQueue(marketConfig, { host, port, password, db: 1});
  })
}

collectMarketData(programIdV3, marketsV3)
collectMarketData(programIdV3, nativeMarketsV3)

interface TradingViewHistory {
  s: string
  t: number[]
  c: number[]
  o: number[]
  h: number[]
  l: number[]
  v: number[]
}

const app = express()
app.use(cors())

const max_conn = parseInt(process.env.REDIS_MAX_CONN || "") || 200;
const redisConfig = { host, port, password, db: 0, max_conn }
const pool = new TedisPool(redisConfig)

const HOURS = 60 * MINUTES
const resolutions: { [id: string]: number | undefined } = {
  "1": 1 * MINUTES,
  "3": 3 * MINUTES,
  "5": 5 * MINUTES,
  "15": 15 * MINUTES,
  "30": 30 * MINUTES,
  "60": 1 * HOURS,
  "120": 2 * HOURS,
  "180": 3 * HOURS,
  "240": 4 * HOURS,
  "1D": 24 * HOURS,
}

app.get("/tv/config", async (req, res) => {
  const response = {
    supported_resolutions: Object.keys(resolutions),
    supports_group_request: false,
    supports_marks: false,
    supports_search: true,
    supports_timescale_marks: false,
  }
  res.send(response)
})

app.get("/tv/symbols", async (req, res) => {
  const symbol = req.query.symbol as string
  const response = {
    name: symbol,
    ticker: symbol,
    description: symbol,
    type: "Spot",
    session: "24x7",
    exchange: "Mango",
    listed_exchange: "Mango",
    timezone: "Etc/UTC",
    has_intraday: true,
    supported_resolutions: Object.keys(resolutions),
    minmov: 1,
    pricescale: 100,
  }
  res.send(response)
})

app.get("/tv/history", async (req, res) => {
  // parse
  const marketName = req.query.symbol as string
  const marketPk = nativeMarketsV3[marketName] || marketsV3[marketName]
  const resolution = resolutions[req.query.resolution as string] as number
  let from = parseInt(req.query.from as string) * 1000
  let to = parseInt(req.query.to as string) * 1000

  // validate
  const validSymbol = marketPk != undefined
  const validResolution = resolution != undefined
  const validFrom = true || new Date(from).getFullYear() >= 2021

  // respond
  if (!(validSymbol && validResolution && validFrom)) {
    const error = { s: "error", validSymbol, validResolution, validFrom }
    console.error({ req, error })
    res.status(500).send(error)
    return
  }

  try {
    const conn = await pool.getTedis()
    try {
      const store = new RedisStore(conn, marketName)

      // snap candle boundaries to exact hours
      from = Math.floor(from / resolution) * resolution
      to = Math.ceil(to / resolution) * resolution

      // ensure the candle is at least one period in length
      if (from == to) {
        to += resolution
      }
      const candles = await store.loadCandles(resolution, from, to)
      const response = {
        s: "ok",
        t: candles.map((c) => c.start / 1000),
        c: candles.map((c) => c.close),
        o: candles.map((c) => c.open),
        h: candles.map((c) => c.high),
        l: candles.map((c) => c.low),
        v: candles.map((c) => c.volume),
      }
      res.send(response)
      return
    } finally {
      pool.putTedis(conn)
    }
  } catch (e) {
    console.error({ req, e })
    const error = { s: "error" }
    res.status(500).send(error)
  }
})

app.get("/trades/address/:marketPk", async (req, res) => {
  try {
    const conn = await pool.getTedis()
    try {
      const marketPk = req.params.marketPk as string
      const marketName = symbolsByPk[marketPk]
      const store = new RedisStore(conn, marketName)
      const trades = await store.loadRecentTrades()
      const response = {
        success: true,
        data: trades.map((t) => {
          return {
            market: marketName,
            marketAddress: marketPk,
            price: t.price,
            size: t.size,
            side: t.side == TradeSide.Buy ? "buy" : "sell",
            time: t.ts,
            orderId: "",
            feeCost: 0,
          }
        }),
      }
      res.send(response)
      return
    } finally {
      pool.putTedis(conn)
    }
  } catch (e) {
    console.error({ req, e })
    const error = { s: "error" }
    res.status(500).send(error)
  }
})

const httpPort = parseInt(process.env.PORT || "5000")
app.listen(httpPort)
