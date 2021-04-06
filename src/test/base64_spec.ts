import { Base64TradeCoder, Base64CandleCoder } from '../base64';
import { TradeSide } from '../interfaces';

const t = {id: '1234567890', price: 0.1234567, side: TradeSide.Buy, size: 1234567, ts: Date.now()};
const c = {open: 0.12345, close: 0.123456, high:  0.1234567, low:  0.12345678,
           volume: 1234567, vwap: 0.123456789, start: 1234567890, end: 1234567899};

describe('Base64TradeCoder', () => {
  it('encodes to 20 bytes', () => {
    let e = new Base64TradeCoder().encode(t);
    expect(e.length).toBe(20);
  });

  it('preserves price,size,ts', () => {
    let e = new Base64TradeCoder().encode(t);
    let d = new Base64TradeCoder().decode(e);
    expect(d.price).toBeCloseTo(t.price, 7);
    expect(d.size).toBeCloseTo(t.size, 7);
    expect(d.ts).toBe(t.ts);
  });
});

describe('Base64CandleCoder', () => {
  it('encodes to 48 bytes', () => {

    let e = new Base64CandleCoder().encode(c);
    expect(e.length).toBe(48);
  });

  it('preserves data', () => {
    let e = new Base64CandleCoder().encode(c);
    let d = new Base64CandleCoder().decode(e);
    expect(d.open).toBeCloseTo(c.open, 7);
    expect(d.close).toBeCloseTo(c.close, 7);
    expect(d.high).toBeCloseTo(c.high, 7);
    expect(d.low).toBeCloseTo(c.low, 7);
    expect(d.volume).toBeCloseTo(c.volume, 7);
    expect(d.vwap).toBeCloseTo(c.vwap, 7);
    expect(d.start).toBe(c.start);
    expect(d.end).toBe(c.end);
  });
});


