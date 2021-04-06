import BN from 'bn.js';

export interface Order {
  orderId: BN;
  price: number;
  side: 'buy' | 'sell';
  size: number;
  eventFlags: { maker: boolean };
};

export enum TradeSide {
  None = 0,
  Buy  = 1,
  Sell = 2
}

export interface Trade {
  id?: string;
  price: number;
  side: TradeSide;
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
  storeTrade: (t: Trade) => Promise<void>;
  loadCandles: (resolution: number, from: number, to:number) => Promise<Candle[]>;
};


export interface BufferStore {
  storeBuffer: (ts: number, b: Buffer) => Promise<void>;
};

