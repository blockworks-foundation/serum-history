#!/usr/bin/env bash

docker run -v $(pwd)/data/redis:/data\
 -p 6379:6379 --name serum_history_redis -d redis;