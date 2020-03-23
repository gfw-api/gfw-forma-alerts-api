#!/bin/bash

case "$1" in
    start)
        npm start
        ;;
    develop)
        type docker-compose >/dev/null 2>&1 || { echo >&2 "docker-compose is required but it's not installed.  Aborting."; exit 1; }
        docker-compose -f docker-compose-develop.yml build && docker-compose -f docker-compose-develop.yml up
        ;;
    test)
        type docker-compose >/dev/null 2>&1 || { echo >&2 "docker-compose is required but it's not installed.  Aborting."; exit 1; }
        docker-compose -f docker-compose-test.yml build && docker-compose -f docker-compose-test.yml up --abort-on-container-exit
        ;;
  *)
        echo "Usage: formaAlerts.sh {start|develop|test}" >&2
        ;;
esac

exit 0
