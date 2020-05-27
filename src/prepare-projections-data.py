#!/usr/bin/python3
# prepareprojections.py - Saves to data directory projections.csv:
# date,country,totdea_mean
# 2019-12-13,United States,0.0
# 2019-12-14,United States,0.0
# 2019-12-15,United States,0.0
# 2019-12-16,United States,0.0
# 2019-12-17,United States,0.0
# 2019-12-18,United States,0.0
# 2019-12-19,United States,0.0
# 2019-12-20,United States,0.0
# 2019-12-21,United States,0.0

import numpy as np
import pandas as pd
import pprint

def get_index(of_date, in_dates):
    '''
    Returns index of date *of_date* in dates *in_dates*, e.g.
    get_index('2020-01-03', ['2020-01-01', '2020-01-02', '2020-01-03'])
    = 2
    '''
    for i in range(len(in_dates)):
        if in_dates[i] == of_date:
            return i

def get_split_index(y1, y2):
    '''
    Find index when projections start, that is when `y1 != y2`.
    '''
    for i in range(len(y1)):
        if abs(y1[i] - y2[i]) > 2: # watch out they have +-2 for actual
            break
    return i

def split(y, split_index):
    '''
    Split y in 2 lines:
        - actual deaths: y_actual
        - projected deaths: y_proj
    '''
    y_actual = y[0:split_index]
    y_proj = y[(split_index):len(y)] # split_index - 1, to glue the curves together
    return y_actual, y_proj


def join_population_sizes(num_of_countries=7):
    ihme_df = pd.read_csv('data/Hospitalization_all_locs.csv',
                          usecols = ['location_name',
                                    'date',
                                    'totdea_mean',
                                    'totdea_lower',
                                    'totdea_upper'])

    pop_df = pd.read_csv('data/country_population_size.csv') # get population sizes

    # fix names in ihme_df to match those in pop_df
    ihme_df.loc[ihme_df['location_name'] == 'United States of America', 'location_name'] = 'United States'

    # inner join on country name
    joined_df = pd.merge(left=pop_df, right=ihme_df, left_on='country', right_on='location_name')

    # tester
    pop_cnames = pop_df['country'].tolist()
    ihme_locations = list(set(ihme_df['location_name'].tolist()))
    d1 = set(joined_df['country'].tolist())
    d2 = set(ihme_locations).intersection(set(pop_cnames))
    assert d1 == d2


    subset_df = joined_df[['rank', 'country', 'population']]
    subset_df.shape

    head_df = subset_df.drop_duplicates(subset="country").head(num_of_countries)
    print(head_df)

    head_countries = head_df['country'].tolist()
    head_df.shape

    head_joined = pd.merge(left=head_df, right=ihme_df, left_on='country', right_on='location_name')

    return (head_countries, head_joined)

def export_to_csv(num_of_countries, start_end_dates):
    head_countries, head_joined = join_population_sizes(num_of_countries)

    split_indexes = {}
    dates = []
    totdea_means = []
    names = []

    for cname in head_countries:
        proj = head_joined[ head_joined['location_name'] == cname ]

        start_index = get_index(start_end_dates[0], proj['date'].tolist())
        end_index = get_index(start_end_dates[1], proj['date'].tolist())

        dates += proj[start_index:(end_index + 1)]['date'].tolist()
        totdea_means += proj[start_index:(end_index + 1)]['totdea_mean'].tolist()
        size = len(proj[start_index:(end_index + 1)]['date'].tolist())
        names += [cname for _ in range(size)]

        y1 = proj[start_index:(end_index + 1)]['totdea_lower'].tolist()
        y2 = proj[start_index:(end_index + 1)]['totdea_upper'].tolist()

        split_indexes[cname] = get_split_index(y1, y2)

    projections_df = pd.DataFrame(list(zip(dates, names, totdea_means)),
                columns=['date', 'country', 'totdea_mean'])

    print('Saving projections.csv to ./data/')
    projections_df.to_csv(r'./data/projections.csv', index = False)

    print('const splitIndexes = ')
    pprint.pprint(split_indexes)

# lets start with 4th of March and end with 4th of August 2020
start_end_dates = '2020-03-04', '2020-07-31' # 08-04
num_of_countries = 10

export_to_csv(num_of_countries, start_end_dates)
