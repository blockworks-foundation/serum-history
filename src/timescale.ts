import {batch} from './candle';
import {BufferStore, Candle, CandleStore, KeyValStore, Trade, TradeSide} from './interfaces';
import {DATE, ENUM, FLOAT, INTEGER, Op, STRING} from "sequelize";

export class TimescaleStore implements CandleStore, BufferStore, KeyValStore {
  tradesRepository: any;
  marketName: string;

  constructor(sequelize: any, marketName: any) {
    this.tradesRepository = sequelize.define('trades', {
      id: {
        type: INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      symbol: STRING,
      price: FLOAT,
      size: FLOAT,
      side: ENUM('None', 'Buy', 'Sell'),
      timestamp: DATE,
    },{
      schema: "serum_history",
      tableName: "trades",
      timestamps: false,
      createdAt: false,
      updatedAt: false,
    });

    this.marketName=marketName;
  };

  // interface CandleStore

  async storeTrade(t: Trade): Promise<void> {
    await this.tradesRepository.create({
      symbol: this.marketName,
      price: t.price,
      size: t.size,
      side: TradeSide[t.side],
      timestamp: t.ts
    })
  };

  async loadCandles(resolution: number, from: number, to: number): Promise<Candle[]> {
    const trades =  await this.findTradesForCriteria(from, to);

    const candles: Candle[] = [];
    while (from + resolution <= to) {
      let candle = batch(trades, from, from+resolution);
      if (candle) {
        candles.push(candle);
      }
      from += resolution;
    }
    return candles;
  };

  async loadRecentTrades(): Promise<Trade[]> {
    const nowEpoch = Date.now().valueOf();
    const ydayEpoch = new Date(new Date().setDate(new Date().getDate()-1)).valueOf();
    return this.findTradesForCriteria(ydayEpoch, nowEpoch);
  };

  // interface BufferStore

  async storeBuffer(ts: number, b: Buffer): Promise<void> {
    throw new Error("Not implemented!")
  };

  // interface KeyValStore

  async storeNumber(key: string, val: number): Promise<void> {
    throw new Error("Not implemented!")
  };

  async loadNumber(key: string): Promise<number | undefined> {
    throw new Error("Not implemented!")
  };

  // internal

  private async findTradesForCriteria(fromEpoch: number, toEpoch: number) {
    // https://sequelize.org/master/manual/model-querying-basics.html
    const tradesMatchingCriteria = await this.tradesRepository.findAll({
      where: {
        [Op.and]:
            [{symbol: this.marketName},
              {timestamp: {[Op.gt]: fromEpoch}},
              {timestamp: {[Op.lte]: toEpoch}}]
      }
    })

    return tradesMatchingCriteria.map((t:any) => ({
      price: t.price,
      side: t.side,
      size: t.size,
      ts: t.timestamp.valueOf() ,
    } as Trade));
  }
}