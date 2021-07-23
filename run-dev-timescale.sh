#!/usr/bin/env bash

# to recreate
# docker rm -f serum_history_timescale;
# docker volume rm serum_history_timescale;

docker run -v serum_history_timescale:/var/lib/postgresql/data\
 -d --name serum_history_timescale -p 5432:5432\
 -e POSTGRES_PASSWORD=password -e POSTGRES_HOST_AUTH_METHOD=password\
 timescale/timescaledb:latest-pg12;