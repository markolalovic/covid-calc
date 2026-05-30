#!/usr/bin/env python3

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / "data" / "population-pyramids"
OUTPUT_FILE = ROOT / "data" / "demographics.json"

AGE_GROUPS = [
    "0-9",
    "10-19",
    "20-29",
    "30-39",
    "40-49",
    "50-59",
    "60-69",
    "70-79",
    "80+",
]


def age_bucket(age_label):
    if age_label == "100+":
        return "80+"

    start = int(age_label.split("-")[0])

    if start >= 80:
        return "80+"

    lower = (start // 10) * 10
    return f"{lower}-{lower + 9}"


def read_population_file(path):
    grouped = {age_group: 0 for age_group in AGE_GROUPS}

    with path.open(newline="") as f:
        reader = csv.DictReader(f)

        for row in reader:
            bucket = age_bucket(row["Age"])
            male = int(float(row["M"]))
            female = int(float(row["F"]))
            grouped[bucket] += male + female

    return [grouped[age_group] for age_group in AGE_GROUPS]


def country_name_from_path(path):
    # "United States-2019.csv" -> "United States"
    return path.name.removesuffix("-2019.csv")


def main():
    countries = {}

    for path in sorted(INPUT_DIR.glob("*-2019.csv")):
        country = country_name_from_path(path)
        countries[country] = read_population_file(path)

    output = {
        "ageGroups": AGE_GROUPS,
        "countries": countries,
    }

    OUTPUT_FILE.write_text(json.dumps(output, indent=2))
    print(f"Wrote {OUTPUT_FILE}")
    print(f"Countries: {len(countries)}")


if __name__ == "__main__":
    main()