#!/bin/bash
# downloadprojections.sh - download IHME projections files

#     https://ihmecovid19storage.blob.core.windows.net/latest/ihme-covid19.zip
addr="https://ihmecovid19storage.blob.core.windows.net/latest/"
fname="ihme-covid19"
ftype=".zip"
date=$(date +"%Y-%m-%d")

curl -o "${fname}-${date}${ftype}" "${addr}${fname}${ftype}"

