import { Account, Commitment, Connection, PublicKey } from '@solana/web3.js'
import { Market } from '@project-serum/serum'
import cors from 'cors'
import express from 'express'
import { Tedis, TedisPool } from 'tedis'
import { URL } from 'url'
import { decodeRecentEvents } from './events'
import { MarketConfig, Trade, TradeSide } from './interfaces'
import { RedisConfig, RedisStore, createRedisStore } from './redis'
import { resolutions, sleep } from './time'
import {
  Config,
  getMarketByBaseSymbolAndKind,
  GroupConfig,
  MangoClient,
  PerpMarketConfig,
  FillEvent,
} from '@blockworks-foundation/mango-client'
import BN from 'bn.js'
import notify from './notify'
import LRUCache from 'lru-cache'

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
const fetchInterval = process.env.INTERVAL ? parseInt(process.env.INTERVAL) : 30

console.log({ clusterUrl, fetchInterval })

const programIdV3 = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'

const nativeMarketsV3: Record<string, string> = {
  'BTC/USDT': 'C1EuT9VokAKLiW7i2ASnZUvxDoKuKkCpDDeNxAptuNe4',
  'ETH/USDT': '7dLVkUfBVfCGkFhSXDCq1ukM9usathSgS716t643iFGF',

  'BTC/USDC': 'A8YFbxQYFVqKZaoYJLLUVcQiWP7G2MeEgW5wsAQgMvFw',
  'ETH/USDC': '4tSvZvnbyzHXLMTiFonMyxZoHmFqau1XArcRCVHLZ5gX',
  'SOL/USDC': '9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT',
  'SRM/USDC': 'ByRys5tuUWDgL73G8JBAEfkdFf8JWBzPBDHsBVQ5vbQA',

  'MCAPS/USDC': 'GgzXqy6agt7nnfoPjAEAFpWqnUwLBK5r2acaAQqXiEM8',
  'MNGO/USDC': '3d4rzwpy9iGdCZvgxcu7B1YocYffVLsQXPXkBZKt2zLc',

  'USDT/USDC': '77quYg4MGneUdjgXCunt9GgM1usmrxKY31twEy3WHwcS',
  'FTT/USDC': '2Pbh1CvRVku1TgewMfycemghf6sU9EyuFDcNXqvRmSxc',
  'RAY/USDC': '2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep',
  'COPE/USDC': '6fc7v3PmjZG9Lk2XTot6BywGyYLkBQuzuFKd4FpCsPxk',
  'SBR/USDC': 'HXBi8YBwbh4TXF6PjVw81m8Z3Cc4WBofvauj5SBFdgUs',
  'STEP/USDC': '97qCB4cAVSTthvJu3eNoEx6AY6DLuRDtCoPm5Tdyg77S',

  /*
  'CCAI/USDC': '7gZNLDbWE73ueAoHuAeFoSu7JqmorwCLpNTBXHtYSFTa',
  'FIDA/USDC': 'E14BKBhDWD4EuTkWj1ooZezesGxMW8LPCps4W5PuzZJo',
  'MER/USDC': 'G4LcexdCzzJUKZfqyVDQFzpkjhB1JoCNL8Kooxi9nJz5',
  'renDOGE/USDC': '5FpKCWYXgHWZ9CdDMHjwxAfqxJLdw2PRXuAmtECkzADk',
  'SLRS/USDC': '2Gx3UfV831BAh8uQv1FKSPKS9yajfeeD8GJ4ZNb2o2YP',
  'SNY/USDC': 'DPfj2jYwPaezkCmUNm5SSYfkrkz8WFqwGLcxDDUsN3gA',
  'TULIP/USDC': '8GufnKq7YnXKhnB3WNhgy5PzU9uvHbaaRrZWQK6ixPxW',
  */
}

const symbolsByPk = Object.assign(
  {},
  ...Object.entries(nativeMarketsV3).map(([a, b]) => ({ [b]: a }))
)

async function collectEventQueue(m: MarketConfig, r: RedisConfig) {
  try {
    const store = await createRedisStore(r, m.marketName)
    const marketAddress = new PublicKey(m.marketPk)
    const programKey = new PublicKey(m.programId)
    const connection = new Connection(m.clusterUrl)
    const market = await Market.load(
      connection,
      marketAddress,
      undefined,
      programKey
    )

    async function fetchTrades(
      lastSeqNum?: number
    ): Promise<[Trade[], number]> {
      const now = Date.now()
      const accountInfo = await connection.getAccountInfo(
        market['_decoded'].eventQueue
      )
      if (accountInfo === null) {
        throw new Error(
          `Event queue account for market ${m.marketName} not found`
        )
      }
      const { header, events } = decodeRecentEvents(
        accountInfo.data,
        lastSeqNum
      )
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
        console.log(m.marketName, ts.length)
        for (let i = 0; i < ts.length; i += 1) {
          await store.storeTrade(ts[i])
        }
      }
    }

    while (true) {
      try {
        const lastSeqNum = await store.loadNumber('LASTSEQ')
        const [trades, currentSeqNum] = await fetchTrades(lastSeqNum)
        storeTrades(trades)
        store.storeNumber('LASTSEQ', currentSeqNum)
      } catch (e) {
        notify(`collectEventQueue ${m.marketName} ${e.toString()}`)
      }
      await sleep({ Seconds: fetchInterval })
    }
  } catch (e) {
    notify(`collectEventQueue ${m.marketName} ${e.toString()}`)
  }
}

function collectMarketData(programId: string, markets: Record<string, string>) {
  if (process.env.ROLE === 'web') {
    console.warn('ROLE=web detected. Not collecting market data.')
    return
  }

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

const groupConfig = Config.ids().getGroup('mainnet', 'mainnet.1') as GroupConfig

async function collectPerpEventQueue(r: RedisConfig, m: PerpMarketConfig) {
  const connection = new Connection(clusterUrl, 'processed' as Commitment)

  const store = await createRedisStore(r, m.name)
  const mangoClient = new MangoClient(connection, groupConfig!.mangoProgramId)
  const mangoGroup = await mangoClient.getMangoGroup(groupConfig!.publicKey)
  const perpMarket = await mangoGroup.loadPerpMarket(
    connection,
    m.marketIndex,
    m.baseDecimals,
    m.quoteDecimals
  )

  async function fetchTrades(lastSeqNum?: BN): Promise<[Trade[], BN]> {
    lastSeqNum ||= new BN(0)
    const now = Date.now()

    const eventQueue = await perpMarket.loadEventQueue(connection)
    const events = eventQueue.eventsSince(lastSeqNum)

    const trades = events
      .map((e) => e.fill)
      .filter((e) => !!e)
      .map((e) => perpMarket.parseFillEvent(e))
      .map((e) => {
        return {
          price: e.price,
          side: e.takerSide === 'buy' ? TradeSide.Buy : TradeSide.Sell,
          size: e.quantity,
          ts: e.timestamp.toNumber() * 1000,
        }
      })

    if (events.length > 0) {
      const last = events[events.length - 1]
      const latestSeqNum =
        last.fill?.seqNum || last.liquidate?.seqNum || last.out?.seqNum
      lastSeqNum = latestSeqNum
    }

    return [trades, lastSeqNum as BN]
  }

  async function storeTrades(ts: Trade[]) {
    if (ts.length > 0) {
      console.log(m.name, ts.length)
      for (let i = 0; i < ts.length; i += 1) {
        await store.storeTrade(ts[i])
      }
    }
  }

  while (true) {
    try {
      const lastSeqNum = await store.loadNumber('LASTSEQ')
      const [trades, currentSeqNum] = await fetchTrades(new BN(lastSeqNum || 0))
      storeTrades(trades)
      store.storeNumber('LASTSEQ', currentSeqNum.toString() as any)
    } catch (err) {
      notify(`collectPerpEventQueue ${m.name} ${err.toString()}`)
    }

    await sleep({ Seconds: fetchInterval })
  }
}

if (process.env.ROLE === 'web') {
  console.warn('ROLE=web detected. Not collecting perp market data.')
} else {
  groupConfig.perpMarkets.forEach((m) =>
    collectPerpEventQueue({ host, port, password, db: 0 }, m)
  )
}

const conn = new Tedis({
  host,
  port,
  password,
})

const cache = new LRUCache<string, Trade[]>(
  parseInt(process.env.CACHE_LIMIT ?? '500')
)

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

const priceScales: any = {
  'BTC/USDC': 1,
  'BTC-PERP': 1,

  'ETH/USDC': 10,
  'ETH-PERP': 10,

  'SOL/USDC': 1000,
  'SOL-PERP': 1000,

  'SRM/USDC': 1000,
  'SRM-PERP': 1000,

  'MNGO/USDC': 10000,
  'MNGO-PERP': 10000,

  'USDT/USDC': 10000,
  'USDT-PERP': 10000,
}

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
    pricescale: priceScales[symbol] || 100,
  }
  res.set('Cache-control', 'public, max-age=360')
  res.send(response)
})

app.get('/tv/history', async (req, res) => {
  // parse
  const marketName = req.query.symbol as string
  const market =
    nativeMarketsV3[marketName] ||
    groupConfig.perpMarkets.find((m) => m.name === marketName)
  const resolution = resolutions[req.query.resolution as string] as number
  let from = parseInt(req.query.from as string) * 1000
  let to = parseInt(req.query.to as string) * 1000

  // validate
  const validSymbol = market != undefined
  const validResolution = resolution != undefined
  const validFrom = true || new Date(from).getFullYear() >= 2021
  if (!(validSymbol && validResolution && validFrom)) {
    const error = { s: 'error', validSymbol, validResolution, validFrom }
    console.error({ marketName, error })
    res.status(404).send(error)
    return
  }

  // respond
  try {
    const store = new RedisStore(conn, marketName)

    // snap candle boundaries to exact hours
    from = Math.floor(from / resolution) * resolution
    to = Math.ceil(to / resolution) * resolution

    // ensure the candle is at least one period in length
    if (from == to) {
      to += resolution
    }
    const candles = await store.loadCandles(resolution, from, to, cache)
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
  } catch (e) {
    notify(`tv/history ${marketName} ${e.toString()}`)
    const error = { s: 'error' }
    res.status(500).send(error)
  }
})

app.get('/trades/address/:marketPk', async (req, res) => {
  // parse
  const marketPk = req.params.marketPk as string
  const marketName =
    symbolsByPk[marketPk] ||
    groupConfig.perpMarkets.find((m) => m.publicKey.toBase58() === marketPk)
      ?.name

  // validate
  const validPk = marketName != undefined
  if (!validPk) {
    const error = { s: 'error', validPk }
    res.status(404).send(error)
    return
  }

  // respond
  try {
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
  } catch (e) {
    notify(`trades ${marketName} ${e.toString()}`)
    const error = { s: 'error' }
    res.status(500).send(error)
  }
})

const httpPort = parseInt(process.env.PORT || '5000')
app.listen(httpPort)
