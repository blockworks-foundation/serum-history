import { Account, Connection, PublicKey } from '@solana/web3.js';
import { Market } from '@project-serum/serum';
import { IDS } from '@mango/client';
import { Tedis } from 'tedis';
import { Order, Trade } from './interfaces';
import { RedisStore } from './redis';

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const MINUTES = 60*1000;

class OrderBuffer {
  cache: Map<string, number>;
  cleanupInterval: number;
  lastCleanup: number;
  timeToLive: number;

  constructor(timeToLive = 10*MINUTES, cleanupInterval = 30*MINUTES) {
    this.cache = new Map();
    this.cleanupInterval = cleanupInterval;
    this.lastCleanup = Date.now();
    this.timeToLive = timeToLive;
  }

  // returns a list of unique trades that have not been observed by the order buffer
  // guarantees to not emit a new trade even if the same fills have been supplied twice
  filterNewTrades(fills: Order[]) : Trade[] {

    const now = Date.now();
    const takerOrders = fills.filter(o => !o.eventFlags.maker);
    const allTrades = takerOrders.map( o => {
      return { id: o.orderId.toString(16), price: o.price, size: o.size, ts: now };
    });
    const newTrades = allTrades.filter(t => !this.cache.has(t.id));

    // store newTrades in cache
    newTrades.forEach(t => this.cache.set(t.id, now));

    // cleanup cache
    if (now > this.lastCleanup + this.cleanupInterval) {
      let staleCacheEntries: string[] = [];
      this.cache.forEach((ts: number, key: string, _)  => {
        if (ts > now + this.timeToLive) {
          staleCacheEntries.push(key);
        }
      });

      staleCacheEntries.forEach((key) => {
        this.cache.delete(key);
      });

      this.lastCleanup = now;
    }

    return newTrades;
  }
}

// process data from cluster as it arrives
async function observeMarket(clusterUrl: string, programId: string, marketName:string, marketPk: string, tradeCb: (trades: Trade[]) => void) {
  const marketAddress = new PublicKey(marketPk);
  const programKey = new PublicKey(programId);

  const connection = new Connection(clusterUrl);
  console.log({ marketName, connection });

  const market = await Market.load(connection, marketAddress, undefined, programKey);
  console.log({ marketName, market });

  const orderBuffer = new OrderBuffer();
  while (true) {
    try {
      let fills = await market.loadFills(connection);
      let trades = orderBuffer.filterNewTrades(fills);
      if (trades.length > 0) {
        tradeCb(trades);
      }
    } catch (err) {
      const error = err.toString().split('\n', 1)[0];
      console.error({ marketName, error });
    }

    await sleep(5000);
  }
}

const { log, error } = console;
console.log = (...args: any[]) => log.bind(console)(new Date(), ...args);
console.error = (...args: any[]) => log.bind(error)(new Date(), ...args);

let network = "mainnet-beta"
let clusterUrl = IDS['cluster_urls'][network];
let programId = IDS[network]['dex_program_id'];
Object.entries(IDS[network]['spot_markets']).forEach(e => {
  const [marketName, marketPk] = e;
  console.log('start processing', {network, clusterUrl, marketName, marketPk});
  const connection = new Tedis({
    port: 6379,
    host: "127.0.0.1"});
  const store = new RedisStore(connection, marketName);
  observeMarket(clusterUrl, programId, marketName as string, marketPk as string, async (trades) => {
    console.log({marketName, trades});
    for (let i = 0; i < trades.length; i += 1) {
      await store.store(trades[i]);
    }
  });
});

