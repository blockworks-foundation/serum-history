import BN from 'bn.js';

export interface MarketConfig {
  clusterUrl: string
  programId: string
  marketName: string
  marketPk: string
}

export enum TradeSide {
  None = 0,
  Buy  = 1,
  Sell = 2
}

export interface Trade {
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

export interface KeyValStore {
  storeNumber: (key: string, val: number) => Promise<void>;
  loadNumber: (key: string) => Promise<number | undefined>;
};

