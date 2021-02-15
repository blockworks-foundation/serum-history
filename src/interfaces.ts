import BN from 'bn.js';

export interface Order {
  orderId: BN;
  price: number;
  size: number;
  eventFlags: { maker: boolean };
};

export interface Trade {
  id?: string;
  price: number;
  size: number;
  ts: number;
};

export interface Coder<T> {
  encode: (t: T) => string;
  decode: (s: string) => T;
};

export interface Candle {
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  vwap: number;
  start: number;
  end: number;
};

export interface CandleStore {
  store: (t: Trade) => Promise<void>;
  load: (resolution: number, from: number, to:number) => Promise<Candle[]>;
};

