import {batch} from './candle';
import {BufferStore, Candle, CandleStore, KeyValStore, Trade} from './interfaces';
import {BOOLEAN, DATE, DOUBLE, INTEGER, Op, STRING} from "sequelize";
import BN from "bn.js";
import {performance} from "perf_hooks";
import {RedisStore} from "./redis";

export class TimescaleEventsStore implements CandleStore, BufferStore, KeyValStore {
    sequelize: any;
    eventsRepository: any;
    marketName: string;
    market: any;

    constructor(sequelize: any, marketName: any, market: any) {
        this.sequelize = sequelize;
        this.eventsRepository = sequelize.define('event', {
            id: {
                type: INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            bid: BOOLEAN,
            baseCurrency: STRING,
            quoteCurrency: STRING,
            maker: BOOLEAN,
            nativeQuantityReleased: DOUBLE,
            nativeQuantityPaid: DOUBLE,
            nativeFeeOrRebate: DOUBLE,
            orderId: STRING,
            loadTimestamp: DATE,
        }, {
            schema: "public",
            tableName: "event",
            timestamps: false,
            createdAt: false,
            updatedAt: false,
        });

        this.marketName = marketName;
        this.market = market;
    };

    // interface CandleStore

    async storeTrade(t: Trade): Promise<void> {
        throw new Error("Not implemented!")
    };

    async loadCandles(resolution: number, from: number, to: number): Promise<Candle[]> {
        const trades = await this.findTradesForCriteria(from, to);

        const candles: Candle[] = [];
        while (from + resolution <= to) {
            let candle = batch(trades, from, from + resolution);
            if (candle) {
                candles.push(candle);
            }
            from += resolution;
        }
        return candles;
    };

    async loadRecentTrades(): Promise<Trade[]> {
        const nowEpoch = Date.now().valueOf();
        const ydayEpoch = new Date(new Date().setDate(new Date().getDate() - 1)).valueOf();
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
        const baseCurrencySymbol = this.marketName.split("/")[0];
        const quoteCurrencySymbol = this.marketName.split("/")[1];

        const from = new Date(0);
        from.setUTCMilliseconds(fromEpoch);

        const to = new Date(0);
        to.setUTCMilliseconds(toEpoch);

        var t0 = performance.now()
        // https://sequelize.org/master/manual/model-querying-basics.html
        const eventsMatchingCriteria = await this.eventsRepository.findAll({
            where: {
                [Op.and]:
                    [{baseCurrency: baseCurrencySymbol},
                        {quoteCurrency: quoteCurrencySymbol},
                        {loadTimestamp: {[Op.gt]: from}},
                        {loadTimestamp: {[Op.lte]: to}}]
            }
        })
        var t1 = performance.now()
        console.log("|¯ Call to trade-history:timescaleEventsStore:this.eventsRepository took " + (t1 - t0) + " milliseconds.")

        // TODO: this is terrible copy pasta to just make it work
        function parseFillEvent(market:any, event: any) {
            function divideBnToNumber(numerator: any, denominator: any) {
                const quotient = numerator.div(denominator).toNumber();
                const rem = numerator.umod(denominator);
                const gcd = rem.gcd(denominator);
                return quotient + rem.div(gcd).toNumber() / denominator.div(gcd).toNumber();
            }


            let size, price, side, priceBeforeFees;
            if (event.bid) {
                side = 'buy';
                priceBeforeFees = event.maker
                    ? new BN(event.nativeQuantityPaid).add(new BN(event.nativeFeeOrRebate))
                    : new BN(event.nativeQuantityPaid).sub(new BN(event.nativeFeeOrRebate));
                price = divideBnToNumber(priceBeforeFees.mul(market._baseSplTokenMultiplier), market._quoteSplTokenMultiplier.mul(new BN(event.nativeQuantityReleased)));
                size = divideBnToNumber(new BN(event.nativeQuantityReleased), market._baseSplTokenMultiplier);
            } else {
                side = 'sell';
                priceBeforeFees = event.maker
                    ? new BN(event.nativeQuantityReleased).sub(new BN(event.nativeFeeOrRebate))
                    : new BN(event.nativeQuantityReleased).add(new BN(event.nativeFeeOrRebate));
                price = divideBnToNumber(priceBeforeFees.mul(market._baseSplTokenMultiplier), market._quoteSplTokenMultiplier.mul(new BN(event.nativeQuantityPaid)));
                size = divideBnToNumber(new BN(event.nativeQuantityPaid), market._baseSplTokenMultiplier);
            }
            return {
                ...event,
                side,
                price,
                feeCost: market.quoteSplSizeToNumber(new BN(event.nativeFeeOrRebate)) *
                    (event.maker ? -1 : 1),
                size,
            };
        }


        var t0 = performance.now()
        const tradesMatchingCriteria = eventsMatchingCriteria.map((e:any)=> parseFillEvent(this.market,e));
        var t1 = performance.now()
        console.log("|¯ Call to trade-history:timescaleEventsStore:parseFillEvent took " + (t1 - t0) + " milliseconds.")

        return tradesMatchingCriteria.map((t: any) => ({
            price: t.price,
            side: t.side,
            size: t.size,
            ts: t.dataValues.loadTimestamp.valueOf(),
        } as Trade));
    }


}
