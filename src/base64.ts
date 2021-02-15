import { Candle, Trade, Coder } from './interfaces';

export class Base64TradeCoder implements Coder<Trade> {
  constructor() {};

  encode(t: Trade): string {
    const buf = Buffer.alloc(14);
    buf.writeFloatLE(t.price, 0);
    buf.writeFloatLE(t.size, 4);
    buf.writeUIntLE(t.ts, 8, 6);
    const base64 = buf.toString('base64');
    return base64;
  };

  decode(s: string): Trade {
    const buf = Buffer.from(s, 'base64');
    const trade = {
      price: buf.readFloatLE(0),
      size: buf.readFloatLE(4),
      ts: buf.readUIntLE(8, 6)
    };
    return trade;
  };
};


export class Base64CandleCoder implements Coder<Candle> {
  constructor() {};

  encode(c: Candle): string {
    const buf = Buffer.alloc(36);
    buf.writeFloatLE(c.open, 0);
    buf.writeFloatLE(c.close, 4);
    buf.writeFloatLE(c.high, 8);
    buf.writeFloatLE(c.low, 12);
    buf.writeFloatLE(c.volume, 16);
    buf.writeFloatLE(c.vwap, 20);
    buf.writeUIntLE(c.start, 24, 6);
    buf.writeUIntLE(c.end, 30, 6);
    const base64 = buf.toString('base64');
    return base64;
  };

  decode(s: string): Candle {
    const buf = Buffer.from(s, 'base64');
    const candle = {
      open: buf.readFloatLE(0),
      close: buf.readFloatLE(4),
      high: buf.readFloatLE(8),
      low: buf.readFloatLE(12),
      volume: buf.readFloatLE(16),
      vwap: buf.readFloatLE(20),
      start: buf.readUIntLE(24, 6),
      end: buf.readUIntLE(30, 6)
    };
    return candle;
  };

}
