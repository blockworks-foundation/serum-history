import { Base64TradeCoder } from './base64';
const coder = new Base64TradeCoder();

import { batch } from './candle';
import { Candle, CandleStore, Trade } from './interfaces';
import { Tedis } from 'tedis';

export class RedisStore implements CandleStore {
  connection: Tedis;
  symbol: string;

  constructor(connection: Tedis, symbol: string) {
    this.connection = connection;
    this.symbol = symbol;
  };

  async store(t: Trade): Promise<void> {
    await this.connection.rpush(this.keyForTrade(t), coder.encode(t));
  };

  async load(resolution: number, from: number, to: number): Promise<Candle[]> {
    const keys = this.keysForCandles(resolution, from, to);
    const tradeRequests = keys.map(k => this.connection.lrange(k, 0, -1));
    const tradeResponses = await Promise.all(tradeRequests);
    const trades = tradeResponses.flat().map(t => coder.decode(t));
    const candles: Candle[] = [];
    while (from + resolution < to) {
      let candle = batch(trades, from, from+resolution);
      if (candle) {
        candles.push(candle);
      }
      from += resolution;
    }
    return candles;
  };

  keyForTime(ts: number): string {
    const d = new Date(ts);
    return `${this.symbol}-${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  };

  keyForTrade(t: Trade): string {
    return this.keyForTime(t.ts);
  };

  keysForCandles(resolution: number, from: number, to: number): string[] {
    const keys = new Set<string>();
    while (from < to) {
      keys.add(this.keyForTime(from));
      from += resolution
    };
    keys.add(this.keyForTime(to));
    return Array.from(keys);
  };
};
