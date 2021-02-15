
import { Candle, Trade } from "./interfaces";


export function batch(ts: Trade[], start: number, end: number): Candle | undefined {

  const batchTrades = ts.filter(t => t.ts >= start && t.ts < end);

  if (batchTrades.length == 0) {
    return undefined;
  } else {
    let t0 = batchTrades[0];
    let c = { open: t0.price,
              close: t0.price,
              high: t0.price,
              low: t0.price,
              volume: t0.size,
              vwap: t0.price * t0.size,
              start, end };

    batchTrades.slice(1).forEach(t => {
      c.close = t.price;
      c.high = Math.max(c.high, t.price);
      c.low = Math.min(c.low, t.price);
      c.volume += t.size;
      c.vwap += t.price * t.size;
    });

    c.vwap /= c.volume;

    return c;
  }
}
