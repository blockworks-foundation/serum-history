import {Connection, PublicKey} from '@solana/web3.js'
import {Market} from '@project-serum/serum'
import cors from 'cors'
import express from 'express'
import {TedisPool} from 'tedis'
import {URL} from 'url'
import {decodeRecentEvents} from './events'
import {MarketConfig, Trade, TradeSide} from './interfaces'
import {createRedisStore, RedisConfig, RedisStore} from './redis'
import {maxCandles, resolutions, sleep} from './time'
import {TimescaleStore} from "./timescale";
import {performance} from "perf_hooks";
import {TimescaleEventsStore} from "./timescale-events";

async function collectEventQueue(m: MarketConfig, r: RedisConfig) {
  const store = await createRedisStore(r, m.marketName)
  const tsStore = await new TimescaleStore(sequelize, m.marketName)
  const marketAddress = new PublicKey(m.marketPk)
  const programKey = new PublicKey(m.programId)
  const connection = new Connection(m.clusterUrl)
  const market = await Market.load(
    connection,
    marketAddress,
    undefined,
    programKey
  )

  async function fetchTrades(lastSeqNum?: number): Promise<[Trade[], number]> {
    const now = Date.now()
    const accountInfo = await connection.getAccountInfo(
      market['_decoded'].eventQueue
    )
    if (accountInfo === null) {
      throw new Error(
        `Event queue account for market ${m.marketName} not found`
      )
    }
    const { header, events } = decodeRecentEvents(accountInfo.data, lastSeqNum)
    const takerFills = events.filter(
      (e) => e.eventFlags.fill && !e.eventFlags.maker
    )
    const trades = takerFills
      .map((e) => market.parseFillEvent(e))
      .map((e) => {
        return {
          price: e.price,
          side: e.side === 'buy' ? TradeSide.Buy : TradeSide.Sell,
          size: e.size,
          ts: now,
        }
      })
    /*
    if (trades.length > 0)
      console.log({e: events.map(e => e.eventFlags), takerFills, trades})
    */
    return [trades, header.seqNum]
  }

  async function storeTrades(ts: Trade[]) {
    if (ts.length > 0) {
      for (let i = 0; i < ts.length; i += 1) {
        var t0 = performance.now()
        await store.storeTrade(ts[i])
        var t1 = performance.now()
        // console.log("Call to redis:storeTrades took " + (t1 - t0) + " milliseconds.")

        var t0 = performance.now()
        await tsStore.storeTrade(ts[i])
        var t1 = performance.now()
        // console.log("Call to timescale:storeTrades took " + (t1 - t0) + " milliseconds.")
      }
    }
  }

  while (true) {
    try {
      const lastSeqNum = await store.loadNumber('LASTSEQ')
      const [trades, currentSeqNum] = await fetchTrades(lastSeqNum)
      storeTrades(trades)
      store.storeNumber('LASTSEQ', currentSeqNum)
    } catch (err) {
      console.error(m.marketName, err.toString())
    }
    await sleep({
      Seconds: process.env.INTERVAL ? parseInt(process.env.INTERVAL) : 10,
    })
  }
}

const redisUrl = new URL(process.env.REDISCLOUD_URL || 'redis://localhost:6379')
const host = redisUrl.hostname
const port = parseInt(redisUrl.port)
let password: string | undefined
if (redisUrl.password !== '') {
  password = redisUrl.password
}

const network = 'mainnet-beta'
const clusterUrl =
  process.env.RPC_ENDPOINT_URL || 'https://solana-api.projectserum.com'
const programIdV3 = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'

const nativeMarketsV3: Record<string, string> = {
  'BTC/USDT': 'C1EuT9VokAKLiW7i2ASnZUvxDoKuKkCpDDeNxAptuNe4',
  'ETH/USDT': '7dLVkUfBVfCGkFhSXDCq1ukM9usathSgS716t643iFGF',
  'SOL/USDT': 'HWHvQhFmJB3NUcu1aihKmrKegfVxBEHzwVX6yZCKEsi1',
  'SRM/USDT': 'AtNnsY1AyRERWJ8xCskfz38YdvruWVJQUVXgScC1iPb',
  'RAY/USDT': 'teE55QrL4a4QSfydR9dnHF97jgCfptpuigbb53Lo95g',
  'BTC/USDC': 'A8YFbxQYFVqKZaoYJLLUVcQiWP7G2MeEgW5wsAQgMvFw',
  'ETH/USDC': '4tSvZvnbyzHXLMTiFonMyxZoHmFqau1XArcRCVHLZ5gX',
  'SOL/USDC': '9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT',
  'SRM/USDC': 'ByRys5tuUWDgL73G8JBAEfkdFf8JWBzPBDHsBVQ5vbQA',
  'RAY/USDC': '2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep',
  'MCAPS/USDC': 'GgzXqy6agt7nnfoPjAEAFpWqnUwLBK5r2acaAQqXiEM8',
}

const symbolsByPk = Object.assign(
  {},
  ...Object.entries(nativeMarketsV3).map(([a, b]) => ({ [b]: a }))
)

function collectMarketData(programId: string, markets: Record<string, string>) {
  Object.entries(markets).forEach((e) => {
    const [marketName, marketPk] = e
    const marketConfig = {
      clusterUrl,
      programId,
      marketName,
      marketPk,
    } as MarketConfig
    collectEventQueue(marketConfig, { host, port, password, db: 0 })
  })
}

collectMarketData(programIdV3, nativeMarketsV3)

const max_conn = parseInt(process.env.REDIS_MAX_CONN || '') || 200
const redisConfig = { host, port, password, db: 0, max_conn }
const pool = new TedisPool(redisConfig)

const Sequelize = require('sequelize')
const sequelize = new Sequelize(process.env.TIMESCALE_URL || 'postgres://postgres:password@localhost:5432/postgres',
    {
      dialect: 'postgres',
      logging: false,
      protocol: 'postgres',
      dialectOptions: {
        // todo: decide if we want this or not
        // ssl: {
        //   require: true,
        //   rejectUnauthorized: false
        // }
      }
    })
sequelize.authenticate().then(() => {
  console.log('Connection to timescale has been established successfully.');
}).catch((err: any) => {
  console.error('Unable to connect to the timescale database:', err);
})

const sequelizeCloud = new Sequelize(process.env.TIMESCALE_CLOUD_URL,
    {
      dialect: 'postgres',
      logging: false,
      protocol: 'postgres',
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    })
sequelizeCloud.authenticate().then(() => {
  console.log('Connection to timescale has been established successfully.');
}).catch((err: any) => {
  console.error('Unable to connect to the timescale database:', err);
})

const app = express()
app.use(cors())

app.get('/tv/config', async (req, res) => {
  const response = {
    supported_resolutions: Object.keys(resolutions),
    supports_group_request: false,
    supports_marks: false,
    supports_search: true,
    supports_timescale_marks: false,
  }
  res.set('Cache-control', 'public, max-age=360')
  res.send(response)
})

app.get('/tv/symbols', async (req, res) => {
  const symbol = req.query.symbol as string
  const response = {
    name: symbol,
    ticker: symbol,
    description: symbol,
    type: 'Spot',
    session: '24x7',
    exchange: 'Mango',
    listed_exchange: 'Mango',
    timezone: 'Etc/UTC',
    has_intraday: true,
    supported_resolutions: Object.keys(resolutions),
    minmov: 1,
    pricescale: 100,
  }
  res.set('Cache-control', 'public, max-age=360')
  res.send(response)
})

app.get('/tv/history', async (req, res) => {
  // parse
  const marketName = req.query.symbol as string
  const marketPk = nativeMarketsV3[marketName]
  const resolution = resolutions[req.query.resolution as string] as number
  let from = parseInt(req.query.from as string) * 1000
  let to = parseInt(req.query.to as string) * 1000

  const fromDate = new Date(0)
  fromDate.setUTCMilliseconds(from)
  const toDate = new Date(0)
  toDate.setUTCMilliseconds(to)
  console.log("")
  console.log(`${req.query.symbol} - res: ${req.query.resolution}, from: ${fromDate.toUTCString()} , to: ${toDate.toUTCString()}`)

  // validate
  const validSymbol = marketPk != undefined
  const validResolution = resolution != undefined
  const validFrom = true || new Date(from).getFullYear() >= 2021
  const candlesToCompute = (to - from) / resolution;
  const validRange = candlesToCompute < maxCandles;
  if (!(validSymbol && validResolution && validFrom && validRange)) {
    const error = { s: 'error', validSymbol, validResolution, validFrom, validRange }
    console.error({ marketName, error })
    res.status(400).send(error)
    return
  }

  // respond
  try {
    const conn = await pool.getTedis()
    try {

      // snap candle boundaries to exact hours
      from = Math.floor(from / resolution) * resolution
      to = Math.ceil(to / resolution) * resolution

      // ensure the candle is at least one period in length
      if (from == to) {
        to += resolution
      }

      var t0 = performance.now()
      const store = new RedisStore(conn, marketName)
      const throwAwayCandles = await store.loadCandles(resolution, from, to)
      var t1 = performance.now()
      console.log("Call to redis:loadCandles took " + (t1 - t0) + " milliseconds.")

      var t0 = performance.now()
      const tsStore = new TimescaleStore(sequelize, marketName)
      const throwAwayCandles2 = await tsStore.loadCandles(resolution, from, to);
      var t1 = performance.now()
      console.log("Call to serum-history:timescaleStore:loadCandles took " + (t1 - t0) + " milliseconds.")

      const marketAddress = new PublicKey('C1EuT9VokAKLiW7i2ASnZUvxDoKuKkCpDDeNxAptuNe4')
      const programKey = new PublicKey(programIdV3)
      const connection = new Connection(clusterUrl)
      const market = await Market.load(
          connection,
          marketAddress,
          undefined,
          programKey
      )
      var t1 = performance.now()

      var t0 = performance.now()
      const tsEventsStore = new TimescaleEventsStore(sequelizeCloud, marketName, market)
      const candles = await tsEventsStore.loadCandles(resolution, from, to);
      var t1 = performance.now()
      console.log("Call to trade-history:timescaleEventsStore:loadCandles took " + (t1 - t0) + " milliseconds.")



      const response = {
        s: 'ok',
        t: candles.map((c) => c.start / 1000),
        c: candles.map((c) => c.close),
        o: candles.map((c) => c.open),
        h: candles.map((c) => c.high),
        l: candles.map((c) => c.low),
        v: candles.map((c) => c.volume),
      }
      res.set('Cache-control', 'public, max-age=1')
      res.send(response)
      return
    } finally {
      pool.putTedis(conn)
    }
  } catch (e) {
    console.error({ req, e })
    const error = { s: 'error' }
    res.status(500).send(error)
  }
})

app.get('/trades/address/:marketPk', async (req, res) => {
  // parse
  const marketPk = req.params.marketPk as string
  const marketName = symbolsByPk[marketPk]

  // validate
  const validPk = marketName != undefined
  if (!validPk) {
    const error = { s: 'error', validPk }
    console.error({ marketPk, error })
    res.status(404).send(error)
    return
  }

  // respond
  try {
    const conn = await pool.getTedis()
    try {
      var t0 = performance.now()
      const store = new RedisStore(conn, marketName)
      const throwAwayTrades = await store.loadRecentTrades()
      var t1 = performance.now()
      console.log("Call to redis:loadRecentTrades took " + (t1 - t0) + " milliseconds.")

      var t0 = performance.now()
      const tsStore = new TimescaleStore(sequelize, marketName)
      const trades = await tsStore.loadRecentTrades()
      var t1 = performance.now()
      console.log("Call to timescale:loadRecentTrades took " + (t1 - t0) + " milliseconds.")

      const response = {
        success: true,
        data: trades.map((t) => {
          return {
            market: marketName,
            marketAddress: marketPk,
            price: t.price,
            size: t.size,
            side: t.side == TradeSide.Buy ? 'buy' : 'sell',
            time: t.ts,
            orderId: '',
            feeCost: 0,
          }
        }),
      }
      res.set('Cache-control', 'public, max-age=5')
      res.send(response)
      return
    } finally {
      pool.putTedis(conn)
    }
  } catch (e) {
    console.error({ req, e })
    const error = { s: 'error' }
    res.status(500).send(error)
  }
})

const httpPort = parseInt(process.env.PORT || '5000')
app.listen(httpPort)
