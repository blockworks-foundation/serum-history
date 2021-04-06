import { RedisStore } from '../redis';
import { TradeSide } from '../interfaces';
import { Tedis } from "tedis";

const SECONDS = 1000;
const DAYS = 86400000;
const YEARS = 365*DAYS;
const ts = [{id: '0', price: 1.2, side: TradeSide.Buy, size: 3.4, ts: 1234567890000},
            {id: '1', price: 2.3, side: TradeSide.Buy, size: 4.5, ts: 1234567890000-0.8*DAYS},
            {id: '2', price: 3.4, side: TradeSide.Buy, size: 5.6, ts: 1234567890000+1*DAYS},
            {id: '3', price: 4.5, side: TradeSide.Buy, size: 6.7, ts: 1234567890000+3*DAYS}];
const s = new RedisStore({} as Tedis, 'ABC/DEF');

describe('RedisStore', () => {
  it('stores trades in buckets per day', () => {
    let keys = ts.map(t => s.keyForTrade(t));

    expect(keys[0]).toBe('ABC/DEF-2009-1-13');
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
    expect(keys[0]).not.toBe(keys[3]);
    expect(keys[2]).not.toBe(keys[3]);
  });

  it('iterates trades for candles in buckets per day', () => {
    let from = ts[0].ts;
    let to = from + 1.2*DAYS;
    let keys = s.keysForCandles(DAYS, from, to);
    expect(keys).toEqual(['ABC/DEF-2009-1-13',
                          'ABC/DEF-2009-1-14',
                          'ABC/DEF-2009-1-15']);
  });

  it('iterates trades for candles preserving order', () => {
    let from = ts[0].ts;
    let to = from + 1*YEARS;
    let keys = s.keysForCandles(DAYS, from, to);
    expect(keys[0]).toEqual('ABC/DEF-2009-1-13');
    expect(keys[keys.length-1]).toEqual('ABC/DEF-2010-1-13');
  });

  it('stores buffers in keys per millisecond', () => {
    expect(s.keyForBuffer(ts[0].ts)).toEqual('ABC/DEF-1234567890000');
  });

  it('iterates events for a single candle', () => {
    let from = ts[0].ts;
    let keyMatch = s.keyMatchForCandle(DAYS, from);
    expect(keyMatch).toEqual('ABC/DEF-1234*');
  });
});
