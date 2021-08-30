import { Base64TradeCoder } from './base64'
const coder = new Base64TradeCoder()

import { batch } from './candle'
import {
  BufferStore,
  Candle,
  CandleStore,
  KeyValStore,
  Trade,
} from './interfaces'
import { Tedis } from 'tedis'

export interface RedisConfig {
  host: string
  port: number
  db: number
  password?: string
}

export class RedisStore implements CandleStore, BufferStore, KeyValStore {
  connection: Tedis
  symbol: string

  constructor(connection: Tedis, symbol: string) {
    this.connection = connection
    this.symbol = symbol
  }

  keyForDay(ts: number): string {
    const d = new Date(ts)
    return `${
      this.symbol
    }-${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
  }

  keyForTrade(t: Trade): string {
    return this.keyForDay(t.ts)
  }

  keyMatchForCandle(resolution: number, from: number): string {
    const keys = [this.keyForBuffer(from), this.keyForBuffer(from + resolution)]
    for (let i = 0; i < Math.min(keys[0].length, keys[1].length); i += 1) {
      if (keys[0][i] != keys[1][i]) {
        return keys[0].substr(0, i) + '*'
      }
    }
    return keys[0]
  }

  keysForCandles(resolution: number, from: number, to: number): string[] {
    const keys = new Set<string>()
    while (from < to) {
      keys.add(this.keyForDay(from))
      from += resolution
    }
    keys.add(this.keyForDay(to))
    return Array.from(keys)
  }

  keyForBuffer(ts: number): string {
    return `${this.symbol}-${ts}`
  }

  // interface CandleStore

  async storeTrade(t: Trade): Promise<void> {
    await this.connection.rpush(this.keyForTrade(t), coder.encode(t))
  }

  async loadCandles(
    resolution: number,
    from: number,
    to: number
  ): Promise<Candle[]> {
    const keys = this.keysForCandles(resolution, from, to)
    const tradeRequests = keys.map((k) => this.connection.lrange(k, 0, -1))
    const tradeResponses = await Promise.all(tradeRequests)
    const trades = tradeResponses.flat().map((t) => coder.decode(t))
    const candles: Candle[] = []
    while (from + resolution <= to) {
      let candle = batch(trades, from, from + resolution)
      if (candle) {
        candles.push(candle)
      }
      from += resolution
    }
    return candles
  }

  async loadRecentTrades(): Promise<Trade[]> {
    const today = Date.now()
    const yesterday = today - 24 * 60 * 60 * 1000
    const keys = [this.keyForDay(yesterday), this.keyForDay(today)]
    const tradeRequests = keys.map((k) => this.connection.lrange(k, 0, -1))
    const tradeResponses = await Promise.all(tradeRequests)
    const trades = tradeResponses
      .flat()
      .slice(-50)
      .reverse()
      .map((t) => coder.decode(t))
    return trades
  }

  // interface BufferStore

  async storeBuffer(ts: number, b: Buffer): Promise<void> {
    const key = this.keyForBuffer(ts)
    await this.connection.set(key, b.toString('base64'))
  }

  // interface KeyValStore

  async storeNumber(key: string, val: number): Promise<void> {
    await this.connection.set(`${this.symbol}-NUM-${key}`, val.toString())
  }

  async loadNumber(key: string): Promise<number | undefined> {
    const result = await this.connection.get(`${this.symbol}-NUM-${key}`)
    if (result) return result as number
    else return undefined
  }
}

export async function createRedisStore(
  config: RedisConfig,
  symbol: string
): Promise<RedisStore> {
  const conn = new Tedis({
    host: config.host,
    port: config.port,
    password: config.password,
  })
  await conn.command('SELECT', config.db)
  return new RedisStore(conn, symbol)
}
