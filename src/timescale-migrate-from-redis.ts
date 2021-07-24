import {TradeSide} from './interfaces'
import {DATE, ENUM, FLOAT, INTEGER, STRING} from "sequelize";
import {TedisPool} from "tedis";
import {URL} from "url";
import {Base64TradeCoder} from "./base64";


const Sequelize = require('sequelize')
const sequelize = new Sequelize(process.env.TIMESCALE_URL || 'postgres://postgres:password@localhost:5432/postgres',
    {
        dialect: 'postgres',
        logging: false,
        protocol: 'postgres',
    })
sequelize.authenticate().then(() => {
    console.log('Connection to timescale has been established successfully.');
    bulkMigrate();
}).catch((err: any) => {
    console.error('Unable to connect to the timescale database:', err);
})


const marketNames = ['BTC/USDT',
    'ETH/USDT',
    'SOL/USDT',
    'SRM/USDT',
    'RAY/USDT',
    'BTC/USDC',
    'ETH/USDC',
    'SOL/USDC',
    'SRM/USDC',
    'RAY/USDC',
    'MCAPS/USDC',
];

const tradesRepository = sequelize.define('trades', {
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
}, {
    schema: "serum_history",
    tableName: "trades",
    timestamps: false,
    createdAt: false,
    updatedAt: false,
});


async function bulkMigrate() {
    const redisUrl = new URL(process.env.REDISCLOUD_URL || 'redis://localhost:6379')
    const host = redisUrl.hostname
    const port = parseInt(redisUrl.port)
    let password: string | undefined
    if (redisUrl.password !== '') {
        password = redisUrl.password
    }

    const coder = new Base64TradeCoder();

    const max_conn = parseInt(process.env.REDIS_MAX_CONN || '') || 200
    const redisConfig = {host, port, password, db: 0, max_conn}
    const pool = new TedisPool(redisConfig)

    const conn = await pool.getTedis()
    const keys = await conn.keys("*");

    for (const key of keys) {
        if (!key.match('[A-Z]+\\/[A-Z]+-([\\d]{4})-([\\d]{1,2})-([\\d]{1,2})')) {
            console.log(`skipping ${key}`)
            continue
        }

        console.log(`copying ${key}`)
        const batch = []
        const tradesForDayForMarket = await conn.lrange(key, 0, -1);
        var trades = tradesForDayForMarket.flat().map(t => coder.decode(t));
        for (const trade of trades) {
            batch.push({
                symbol: key.split("-")[0],
                price: trade.price,
                size: trade.size,
                side: TradeSide[trade.side],
                timestamp: trade.ts
            })
        }
        await tradesRepository.bulkCreate(batch)
    }
}
