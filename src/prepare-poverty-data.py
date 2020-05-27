#!/usr/bin/python3
# preparepovertydata.py - Create lists of projected poverty increases in 2020
# from covid-19:
# * by country
# * by region

import numpy as np
import pandas as pd

## data sources:
# IMF outlook
# https://www.imf.org/~/media/Files/Publications/WEO/2020/April/English/execsum.ashx?la=en

# WorldBank - Povcal
# Millions of people living below $1.9 per day, 1990-2015
# https://data.worldbank.org/indicator/SI.POV.DDAY

def preparepovertydata():
    '''
    Prepares 2 pairs of lists:

    1. by country (top-12):
      poverty_proj_cnames = [India, Nigeria, ..., South Africa]
      poverty_proj_cnumbers = [10M, 8M, ..., 721050]

    2. by region:
      poverty_proj_rnames = [Sub-Saharan Africa, South Asia, ..., North America]
      poverty_proj_rnumbers = [21.99438, 10.61900, ..., 0.31360]
    '''

    # import data sets and join by regions
    imf_df = pd.read_csv('./data/imf_outlook.csv',
                        usecols=['location', 'difference_from_october_2020'])

    povcal_df = pd.read_csv('./data/povcal-poverty.csv',
                         usecols=['countryname', 'region', '2015', 'region_wb'])

    # set of povcal regions should be a subset of imf regions
    # test: povcal - imf == empty?
    povcal_regions = povcal_df['region'].tolist()
    imf_df_regions = imf_df['location'].tolist()
    print('Povcal (WorldBank) regions - IMF regions: ')
    print(str( set(povcal_regions).difference(set(imf_df_regions)) ))
    print('\n')

    # join data frames by region
    povcal_df = pd.merge(left=povcal_df, right=imf_df,
         how='left',
         left_on='region', right_on='location')

    # number of poor in 2015: last year we found available data for all locations
    povcal_df = povcal_df.assign(poverty_2015=lambda x: x['2015'] * 10**6)

    ## calculate projected poverty increases by country
    # proj_poverty_increase = poverty_2015 * ( -difference_from_october_2020 / 100 )
    povcal_df = povcal_df.assign(proj_poverty_increase=
      lambda x: x['poverty_2015'] * ( -x['difference_from_october_2020'] / 100 ) )

    # sort data frame by proj_poverty_increase
    povcal_df = povcal_df.sort_values(by='proj_poverty_increase', ascending=False)
    by_country_df = povcal_df[['countryname', 'proj_poverty_increase']].head(12)

    print('Top 12 countries with most projected poverty increases: ')
    print(by_country_df)
    print('\n')

    # fix names to match those in datadict.npy
    poverty_proj_cnames = by_country_df['countryname'].tolist()
    poverty_proj_cnames[2] = 'Democratic Republic of Congo'

    # test if poverty_proj_cnames - cnames_dict = empty set
    data = np.load('./data/datadict.npy', allow_pickle='TRUE').item()
    cnames_dict = list(data['names'].values())
    print('poverty_proj_cnames - cnames_dict: ')
    print(str( set(poverty_proj_cnames).difference(set(cnames_dict)) ))
    print('\n')

    # projected poverty increases
    poverty_proj_cnumbers = by_country_df['proj_poverty_increase'].tolist()
    poverty_proj_cnumbers = [int(n) for n in poverty_proj_cnumbers] # cast to ints

    print('poverty increases by country: ')
    print(str(poverty_proj_cnames))
    print(str(poverty_proj_cnumbers))
    print('\n')

    ## calculate projected poverty increases by regions
    # group by region and sum
    by_regions_df = \
      povcal_df[['region_wb', 'proj_poverty_increase']].groupby(['region_wb']).sum()

    by_regions_df = \
      by_regions_df.sort_values(by='proj_poverty_increase', ascending=False)

    print('Projected poverty increases by regions: ')
    print(by_regions_df)
    print('\n')

    poverty_proj_rnames = list(by_regions_df.index.values)
    poverty_proj_rnumbers = by_regions_df['proj_poverty_increase'].tolist()

    print('poverty increases by region: ')
    print(str(poverty_proj_rnames))
    print(str(poverty_proj_rnumbers))
    print('\n')


















preparepovertydata()
