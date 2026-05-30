#!/usr/bin/env python3

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

OUTPUT_FILE = DATA_DIR / "estimates-context.json"

CAUSES_FILE = DATA_DIR / "annual-number-of-deaths-by-cause.csv"
DISEASE_FILE = DATA_DIR / "burden-of-disease-by-cause.csv"
RISK_FILE = DATA_DIR / "disease-burden-by-risk-factor.csv"

TOP_N = 10


def clean_column_name(name):
    return (
        name
        .replace(" (deaths)", "")
        .replace(" (DALYs)", "")
        .strip()
    )


def read_rows(path):
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def parse_number(value):
    if value is None or value == "":
        return None

    try:
        return round(float(value))
    except ValueError:
        return None


def top_items_for_row(row, excluded_columns):
    items = []

    for column, value in row.items():
        clean_name = clean_column_name(column)

        if column in excluded_columns or clean_name in excluded_columns:
            continue

        number = parse_number(value)

        if number is None:
            continue

        items.append({
            "name": clean_name,
            "number": number,
            "type": "other"
        })

    items.sort(key=lambda d: d["number"], reverse=True)
    return items[:TOP_N]


def build_dataset(path, year, excluded_columns):
    rows = read_rows(path)

    countries = {}

    for row in rows:
        if str(row.get("Year")) != str(year):
            continue

        country = row.get("Entity")

        if not country:
            continue

        countries[country] = top_items_for_row(row, excluded_columns)

    return countries


def main():
    causes = build_dataset(
        CAUSES_FILE,
        year=2017,
        excluded_columns={"Entity", "Code", "Year"}
    )

    disease_causes = build_dataset(
        DISEASE_FILE,
        year=2016,
        excluded_columns={"Entity", "Code", "Year"}
    )

    risk_factors = build_dataset(
        RISK_FILE,
        year=2016,
        excluded_columns={
            "Entity",
            "Code",
            "Year",
            # Same logic as old prepare-compare-data.py:
            # these are already covered by the combined air pollution category.
            "Outdoor air pollution",
            "Outdoor air pollution (DALYs)",
            "Indoor air pollution",
            "Indoor air pollution (DALYs)",
        }
    )

    countries = sorted(
        set(causes.keys())
        | set(disease_causes.keys())
        | set(risk_factors.keys())
    )

    output = {
        "countries": {
            country: {
                "causesOfDeath": causes.get(country, []),
                "causesOfYearsLost": disease_causes.get(country, []),
                "riskFactorsYearsLost": risk_factors.get(country, []),
            }
            for country in countries
        },
        "datasets": {
            "causesOfDeath": {
                "label": "Causes of Death",
                "year": 2017,
                "unit": "Deaths"
            },
            "causesOfYearsLost": {
                "label": "Causes of Years of Life Lost",
                "year": 2016,
                "unit": "Yrs of Life Lost"
            },
            "riskFactorsYearsLost": {
                "label": "Risk Factors in Years of Life Lost",
                "year": 2016,
                "unit": "Yrs of Life Lost"
            }
        }
    }

    OUTPUT_FILE.write_text(json.dumps(output, indent=2))
    print(f"Wrote {OUTPUT_FILE}")
    print(f"Countries: {len(countries)}")


if __name__ == "__main__":
    main()