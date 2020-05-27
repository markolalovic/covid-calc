#!/usr/bin/python3
# preparemapdata.py - Data to show on map additional number of people
# living in poverty depending on contraction parameter. Also change legend
# names = color categories and country names based on language change.

'''
## Prepare World Map Data
From files 50m.tsv, 50m.json, poverty_GDP_locs_and_regions.csv create new files:
worldmap-fixed.json, worldmap-fixed.csv

### References:
1. [files](https://unpkg.com/browse/world-atlas@1.1.4/world/)
2. [license](https://unpkg.com/browse/world-atlas@1.1.4/LICENSE.md)
3. [description](https://github.com/topojson/world-atlas)
4. [iso three-digit country codes](https://en.wikipedia.org/wiki/ISO_3166-1_numeric)
'''

import numpy as np
import csv
import pandas as pd
import os
import re
import pprint
import matplotlib.pyplot as plt
from matplotlib.pyplot import figure

def is_missing(iso):
    return iso == '-99'

def prepare_worldmap_json():
    '''
    Three-digit country codes iso_n3 are missing for some countries. Fix by
    giving them new ids. Max iso_n3 id = 894. So start with 1000.

    We have 5 countries with missing ids. Assign:
        Northern Cyprus=1000, Indian Ocean Ter=1001, S.Glacier=1002
    '''
    iso_regex = re.compile(r'"-99"')

    print('Test regex: ')
    print(iso_regex.sub(
        '1000', # first new iso id
        r'"type":"MultiPolygon","arcs":[[[1097]],[[1098]],[[1099]]],"id":"-99"},'
    ))
    print('\n')

    with open(DATAPATH + '.json', 'r') as read_file:
        map_json = read_file.read()

    print('map_json before: ')
    print(map_json[1:100] + ' ... \n')

    # 5 new iso ids
    new_isos = [r'"1000"', r'"1001"', r'"1002"', r'"1003"', r'"1004"']

    map_json_list = map_json.split('{') # split and use regex on parts
    new_map_json_list = []
    k = 0
    for part in map_json_list:
        if r'"-99"' in part:
            new_part = iso_regex.sub(new_isos[k], part)
            k += 1
            new_map_json_list.append(new_part)
        else:
            new_map_json_list.append(part)

    new_map_json = '{'.join(new_map_json_list) # join to get new string

    # length should increase by number of missing ids
    # i.e. occurrences of "-99", since -99 has 3 characters and 1000 has 4
    assert len(new_map_json) == len(map_json) + len(new_isos)
    print('Missing isos: fixed \n')

    print('new_map_json: ')
    print(new_map_json[1:100] + ' ... \n')

    with open(r'./data/worldmap-fixed.json', 'w') as write_file:
        write_file.write(new_map_json)

def prepare_worldmap_csv():
    '''
    Prepare worldmap data:

    * fix missing ids
    * join with poverty data
    * `iso_n3` is padded with 0's! Use '010' instead of '10'
    '''
    worldmap_df = pd.read_csv(DATAPATH + '.tsv',
               sep='\t',
               usecols = ['iso_n3',
                          'income_grp',
                          'name'],
               dtype={'iso_n3': object})

    map_cnames = worldmap_df['name'].tolist()
    map_cnames_missing = [map_cnames[4], map_cnames[0], map_cnames[1],
        map_cnames[2], map_cnames[3]]
    print('Assigning new isos: '
        + str([1001, 1002, 1003, 1004, 1000]) + ' for countries: ')
    print(map_cnames_missing)

    print('worldmap df before: ')
    print(worldmap_df.loc[0:4])
    print('\n')

    worldmap_df.loc[[0, 1, 2, 3, 4], 'iso_n3'] = [1001, 1002, 1003, 1004, 1000]

    # fix income by ranking by risk: 1. Low income, ..., 4. High income
    worldmap_df.loc[worldmap_df['income_grp'] == '5. Low income', 'income_grp'] = '1. Low income'
    worldmap_df.loc[worldmap_df['income_grp'] == '4. Lower middle income', 'income_grp'] = '2. Lower middle income'
    worldmap_df.loc[worldmap_df['income_grp'] == '2. High income: nonOECD', 'income_grp'] = '4. High income'
    worldmap_df.loc[worldmap_df['income_grp'] == '1. High income: OECD', 'income_grp'] = '4. High income'
    print('Fixed countries income ranking by risk: ' +
          str( set( worldmap_df['income_grp'].tolist() ) ) +
          '\n')

    print('worldmap df after: ')
    print(worldmap_df.loc[0:4])
    print('\n')

    fixed_names_df = pd.read_csv(r'./data/fixed_names_df.csv')
    worldmap_df['name'] = fixed_names_df['fixed_name']

    # try setting Antarctica and Greenland to No data
    worldmap_df.loc[worldmap_df['name'] == 'Antarctica', 'income_grp'] = 'No data'
    worldmap_df.loc[worldmap_df['name'] == 'Greenland', 'income_grp'] = 'No data'

    print('Saving worldmap-fixed.csv to ./data/')
    worldmap_df.to_csv(r'./data/worldmap-fixed.csv', index = False)

def get_cid(cname, d):
    '''
    Using for d = data['names']
    '''
    if cname in list(d.values()):
        return list(d.keys())[list(d.values()).index(cname)]
    else:
        return ''

def get_props(data, cnames_map, bounds, risks):
    '''
    Returns proportions of people over 60.
    '''
    lower, middle, upper = bounds

    props = []
    for cname in cnames_map:
        cid = get_cid(cname, data['names'])
        risk = ''
        color = ''
        if cid != '':
            demo = data['demographics'][cid]
            demo = np.array(demo)
            prop = np.sum(demo[6:]) / np.sum(demo)
            prop = np.round(prop, 4)

            if upper < prop:
                risk = risks[4]
            elif middle < prop and prop <= upper:
                risk = risks[3]
            elif lower < prop and prop <= middle:
                risk = risks[2]
            else:
                risk = risks[1]
        else:
            risk = risks[0]
            color = '#d3d3d3' # grey for no data
        props.append(risk)

    return props

def bar_plot(data, cnames_map, bounds, risks):
    '''
    Plots proportions of people over 60.
    '''
    props = get_props(data, cnames_map, bounds, risks)
    print(props[1:10])

    figure(num=None, figsize=(10, 5), dpi=80, facecolor='w', edgecolor='k')
    height = [props.count(risks[0]),
              props.count(risks[1]),
              props.count(risks[2]),
              props.count(risks[3]),
              props.count(risks[4]),]

    y_pos = np.arange(len(risks))

    plt.bar(y_pos, height)
    plt.xticks(y_pos, risks)
    plt.show()

def prepare_color_scale():
    worldmap_df = pd.read_csv(r'./data/worldmap-fixed.csv',
                              dtype={'iso_n3': object})

    # set income_grp colors
    # worldmap_df = worldmap_df.assign(
    #     income_color = lambda dataframe: dataframe['income_grp'].map(lambda inc:
    #             colors_income[int(inc[0]) - 1])
    # )

    cnames_map = worldmap_df['name'].tolist()
    data = np.load('./data/datadict.npy', allow_pickle='TRUE').item()

    # cnames_dict = list(data['names'].values())

    bounds = (0.05, 0.1, 0.2)
    risks = ['No data',
             '<5%',
             '5- 10%',
             '10- 20%',
             '>20%']

    # bar_plot(data, cnames_map, bounds, risks)
    worldmap_df['prop'] = get_props(data, cnames_map, bounds, risks)
    print(worldmap_df.head(5))

    print('Saving worldmap-fixed.csv to ./data/')
    worldmap_df.to_csv(r'./data/worldmap-fixed.csv', index = False)


DATAPATH = './data/world-atlas/50m' # 1:50m is a medium scale
selected_palette_number = 3 # we have 5 color pallets to choose from

prepare_worldmap_json()
prepare_worldmap_csv()
prepare_color_scale()
