-- should be a no-op in most cases, since e.g. timescale/timescaledb:latest-pg12
-- already comes with it
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- map to enum TradeSide in typescript code
CREATE TYPE SIDE AS ENUM('None', 'Buy', 'Sell');

CREATE SCHEMA serum_history;

-- postgres and corresponding timescale table
CREATE TABLE IF NOT EXISTS serum_history.trades
(
    id        SERIAL,
    -- e.g. BTC/USDC
    symbol    TEXT,
    price     REAL,
    size      REAL,
    side      SIDE,
    -- will store data in UTC, using timestamp since its more human readable than
    -- e.g. unix timestamp
    timestamp timestamptz
);
-- see https://docs.timescale.com/api/latest/hypertable/create_hypertable/
SELECT create_hypertable('serum_history.trades', 'timestamp');