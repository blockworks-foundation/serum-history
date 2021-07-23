import {TradeSide} from './interfaces'
import {DATE, ENUM, FLOAT, INTEGER, STRING} from "sequelize";

const Sequelize = require('sequelize')
const sequelize = new Sequelize(process.env.TIMESCALE_URL || 'postgres://postgres:password@localhost:5432/postgres',
    {
        dialect: 'postgres',
        logging: false,
        protocol: 'postgres',
    })
sequelize.authenticate().then(() => {
    console.log('Connection to timescale has been established successfully.');
    bulkLoad();
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


async function bulkLoad() {
    const nowEpochSeconds = Math.floor(Date.now().valueOf() / 1000);
    const oneDaySeconds = 60 * 60 * 24;
    const nowMinusOneMonthAgoEpochSeconds = nowEpochSeconds - oneDaySeconds * 30;
    for (let epoch = nowMinusOneMonthAgoEpochSeconds; epoch < (nowEpochSeconds + oneDaySeconds); epoch = epoch + 60 * 60 * 24) {
        let dateToLog = new Date(0);
        dateToLog.setUTCSeconds(epoch);
        console.log(`bulk loading for all markets for ${dateToLog.toDateString()}`)

        const batch = []
        for (var marketName of marketNames) {
            for (let i = 0; i < 60 * 60 * 24; i=i+10) {
                let dateToSet = new Date(0);
                dateToSet.setUTCSeconds(epoch);
                batch.push({
                    symbol: marketName,
                    price: Math.random() * 100,
                    size: Math.random() * 100,
                    side: TradeSide[Math.floor(Math.random() * 3)],
                    timestamp: dateToSet
                })
            }
        }
        await tradesRepository.bulkCreate(batch)
    }
}
