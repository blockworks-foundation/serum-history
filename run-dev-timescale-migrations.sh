#!/usr/bin/env bash

docker run --rm -v $(pwd)/migrations:/flyway/sql flyway/flyway\
 -url=jdbc:postgresql://host.docker.internal:5432/postgres\
 -user=postgres -password=password migrate
