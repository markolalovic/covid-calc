#!/usr/bin/python3
# preparecomparedata.py - Prepares countries data for compare by age and
# estimates in context components as a dictionary and saves it to
# data/comparedata.npy as a numpy object.

'''
Keys in comparedata:

## country properties
* names
* life_exp
* demographics

## major causes of death
* major_causes
* major_deaths

## major diseases
* disease_names
* disease_DALYs

## major risks
* risk_factors
* risk_DALYs
'''

import numpy as np
import pandas as pd
import os
import csv
import json
import pprint


def get_yll(CFRs, demographics, deaths, life_expcs):
    '''
    Returns estimated years of life lost in the folowing way
    * let D be the event that person died from covid
    * let A_i be the event that persons age is in age group i
    then
    YLL = deaths * ( sum_i Pr(A_i | D) * life exp_i )
    '''
    cfr_mean = CFRs.apply(np.mean, axis=0)
    cfr_mean = np.round(cfr_mean, 4)

    prDA = cfr_mean/100

    demographics = np.array(demographics)
    pA = demographics / np.sum(demographics)

    prD = np.sum(prDA * pA)

    # estimated probabilities of a person who died in country being in some age group
    prAD = prDA * pA / prD
    # print(str(prAD))

    yll = deaths * np.sum( prAD * life_expcs )
    yll = round(yll, 2)

    return yll

def load_data():
    '''
    Loads CSVs and scraped demographics and returns:
    * latest_date
    * CFRs
    * life_expcs
    * total_deaths_dict
    * major_df
    * life_exp_df
    * disease_df
    * risk_df
    * pyramid_file_names
    '''
    age_groups = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+']
    column_names = age_groups
    row_names    = ['china', 'korea', 'italy', 'spain']
    matrix = np.array([[0, 0.2, 0.2, 0.2, 0.4, 1.3, 3.6, 8, 14.8],
                       [0, 0, 0, 0.11, 0.08, 0.5, 1.8, 6.3, 13],
                       [0, 0, 0, 0.3, 0.4, 1, 3.5, 12.8, 20.2],
                       [0, 0, 0.22, 0.14, 0.3, 0.4, 1.9, 4.8, 15.6]])
    CFRs = pd.DataFrame(matrix, columns=column_names, index=row_names)
    print('CFRs: ')
    print(str(CFRs) + '\n')

    # global life expectacies from WHO
    # https://www.who.int/gho/mortality_burden_disease/life_tables/life_tables/en/
    life_expcs = [71.625, 62.950, 53.550, 44.400, 35.375, 26.625, 18.600, 11.950, 6.975]

    # https://ourworldindata.org/coronavirus-data
    total_deaths_covid_df = pd.read_csv('../data/total-deaths-covid-19.csv')
    latest_date = total_deaths_covid_df['Date'].tolist()[-1]
    print('Using latest date: ' + latest_date)

    # use only the latest total deaths
    total_deaths_covid_df = total_deaths_covid_df[ total_deaths_covid_df['Date'] == latest_date ]

    # make a dictionary 'Country name': total deaths' e.g. {'Afghanistan': 220 }
    total_deaths_names = total_deaths_covid_df['Entity'].tolist()
    total_deaths_values = total_deaths_covid_df['Total confirmed deaths due to COVID-19 (deaths)'].tolist()
    total_deaths_dict = dict(zip(total_deaths_names, total_deaths_values))

    # https://ourworldindata.org/causes-of-death
    major_df = pd.read_csv('../data/annual-number-of-deaths-by-cause.csv')
    major_df = major_df[ major_df['Year'] == 2017 ]

    life_exp_df = pd.read_csv('../data/life-expectancy.csv')
    life_exp_df = life_exp_df[ life_exp_df['Year'] == 2019 ]

    # https://ourworldindata.org/grapher/burden-of-disease-by-cause
    disease_df = pd.read_csv('../data/burden-of-disease-by-cause.csv')
    disease_df = disease_df[ disease_df['Year'] == 2016 ]

    # https://ourworldindata.org/grapher/disease-burden-by-risk-factor
    risk_df = pd.read_csv('../data/disease-burden-by-risk-factor.csv')
    risk_df = risk_df[ risk_df['Year'] == 2016 ]

    # load scraped country names for demographics
    pyramid_file_names = os.popen('ls ../data/population-pyramids').read().split()

    return (latest_date, CFRs, life_expcs, total_deaths_dict,
            major_df, life_exp_df, disease_df, risk_df,
            pyramid_file_names)


def preprocess():
    '''
    Preprocess data about causes, life expectancy, diseaseDALYs, riskDALYs
    '''
    (latest_date, CFRs, life_expcs, total_deaths_dict,
     major_df, life_exp_df, disease_df, risk_df,
     pyramid_file_names) = load_data()

    # remove (deaths), (DALYs) from column names
    major_df.columns = [old_name.replace(' (deaths)', '') for old_name in list(major_df.columns)]
    disease_df.columns = [old_name.replace(' (DALYs)', '') for old_name in list(disease_df.columns)]
    risk_df.columns = [old_name.replace(' (DALYs)', '') for old_name in list(risk_df.columns)]

    # remove un-needed
    for col in ['Code', 'Year']:
        del major_df[col]
        del disease_df[col]
        del risk_df[col]

    # remove all missing values columns
    temp_df = major_df.dropna(axis=1, how='all')
    all_missing_causes = set(major_df.columns).difference(set(temp_df.columns))
    if all_missing_causes:
        print('No data about causes: ' + str(all_missing_causes))
        major_df = major_df.dropna(axis=1, how='all')

    temp_df = disease_df.dropna(axis=1, how='all')
    all_missing_diseases = set(disease_df.columns).difference(set(temp_df.columns))
    if all_missing_diseases:
        print('No data about diseases: ' + str(all_missing_diseases))
        disease_df = disease_df.dropna(axis=1, how='all')

    temp_df = risk_df.dropna(axis=1, how='all')
    all_missing_risks = set(risk_df.columns).difference(set(temp_df.columns))
    if all_missing_risks:
        print('No data about risks: ' + str(all_missing_risks))
        risk_df = risk_df.dropna(axis=1, how='all')

    return (latest_date, CFRs, life_expcs, total_deaths_dict,
            major_df, life_exp_df, disease_df, risk_df,
            pyramid_file_names)


def prepare_compare_data():
    (latest_date, CFRs, life_expcs, total_deaths_dict,
     major_df, life_exp_df, disease_df, risk_df,
     pyramid_file_names) = preprocess()

    # to what cause is missing in which countries
    missing_causes = {}       # = {'cause': ['country_1', ..., 'country_k']}
    missing_diseases = {}     # = {'disease': ['country_1', ..., 'country_k']}
    missing_risks = {}        # = {'risk': ['country_1', ..., 'country_k']}

    for cause in list(major_df.columns):
        missing_causes[cause] = []

    for disease in list(disease_df.columns):
        missing_diseases[disease] = []

    for risk in list(risk_df.columns):
        missing_risks[risk] = []

    # prepare dictionaries:
    names_dict = {}         # = {id: name}
    life_exp_dict = {}      # = {id: life_expectancy}
    demographics_dict = {}  # = {id: population_pyramid_list}

    major_causes_dict = {}  # = {id: major_causes_list}
    major_deaths_dict = {}  # = {id: major_deaths_list}

    disease_names_dict = {} # = {id: disease_names_list}
    disease_DALYs_dict = {} # = {id: disease_DALYs_list}

    risk_factors_dict = {}  # = {id: risk_factors_list}
    risk_DALYs_dict = {}    # = {id: risk_DALYs_list}

    id = 0;  # country id, start with 0
    for pyramid_file_name in pyramid_file_names:
        name = pyramid_file_name
        for ch in ['-', '2019', '.csv']:    # remove -, 2019, .csv
            name = name.replace(ch, '')
        name = name.replace('_', ' ')       # replace underscore with space

        print(str(id) + ': ' + name)

        #
        ## name
        #
        names_dict[id] = name

        #
        ## life expectancy
        #
        if name not in list(life_exp_df['Entity']):
            print('Life expectancy data missing for ' + name)
            break
        life_exp_row = life_exp_df[ life_exp_df['Entity'] == name ]
        life_exp = life_exp_row['Life expectancy (years)'].iloc[0]

        if pd.isnull(life_exp):
            print('Life expectancy data missing for ' + name)
            break

        life_exp_dict[id] = life_exp

        #
        ## demographics
        #
        # read data pyramid numbers from csv
        pop_nums = []
        with open('../data/population-pyramids/' + pyramid_file_name) as pop_file:
            pop_reader = csv.reader(pop_file, delimiter=',')
            for row in pop_reader:
                pop_nums.append(row)

        # sum for males and females
        demographics = []
        for i in range(1, 17, 2):
            demographics.append(int(pop_nums[i:(i+2)][0][1]) + int(pop_nums[i:(i+2)][0][2]) \
                        + int(pop_nums[i:(i+2)][1][1]) + int(pop_nums[i:(i+2)][1][2]))

        # combine for 80+
        all_80_plus = 0
        for i in range(17, len(pop_nums)):
            all_80_plus += int(pop_nums[i][1]) + int(pop_nums[i][2])
        demographics.append(all_80_plus)

        demographics_dict[id] = demographics


        #
        ## major causes and deaths
        #
        # first check if we have major causes data for this country
        if name not in list(major_df['Entity']):
            print('Major causes data missing for ' + name)
            break

        major_row = major_df[ major_df['Entity'] == name ]

        # add to missing causes if it's missing for this country
        if major_row.isnull().sum().sum():
            for missing_cause in list(major_row.columns[major_row.isnull().any()]):
                missing_causes[missing_cause].append(name)

        major_row = major_row.fillna(0)
        del major_row['Entity']

        major_column = major_row.T # transpose

        major_column.columns = ['Val'] # rename
        major_column = major_column.sort_values(by=['Val'], ascending=False) # sort
        major_column['Val'] = major_column['Val'].apply(lambda x: round(x, 0)) # round
        major_column = major_column[:10] # choose only top 10 causes

        # append the latest estimate of deaths for COVID-19 cause
        if name not in total_deaths_dict.keys():
            print('No data about total deaths from COVID-19 for country ' + name)
        else:
            covid_deaths = total_deaths_dict[name]
            covid_cause = 'COVID-19 until ' + latest_date
            covid_cause_row = pd.DataFrame({'Val': [covid_deaths]}, index=[covid_cause])
            major_column = major_column.append(covid_cause_row)
        major_column = major_column.sort_values(by=['Val'], ascending=False) # sort again

        major_deaths = major_column.Val.tolist()
        major_deaths_dict[id] = [int(n) for n in major_deaths] # make it int for plots
        major_causes_dict[id] = list(major_column.index.values)

        #
        ## diseases names and DALYs
        #
        # first check if we have disease data for this country
        if name not in list(disease_df['Entity']):
            print('Disease data missing for ' + name)
            break

        disease_row = disease_df[ disease_df['Entity'] == name ]

        # add to missing diseases if it's missing for this country
        if disease_row.isnull().sum().sum():
            for missing_disease in list(disease_row.columns[disease_row.isnull().any()]):
                missing_diseases[missing_disease].append(name)

        disease_row = disease_row.fillna(0)

        del disease_row['Entity']
        disease_column = disease_row.T # transpose
        disease_column.columns = ['Val'] # rename
        disease_column = disease_column.sort_values(by=['Val'], ascending=False) # sort
        disease_column['Val'] = disease_column['Val'].apply(lambda x: round(x, 0)) # round
        disease_column = disease_column[:10] # choose only top 10 diseases

        # append the latest estimate of deaths for COVID-19 cause
        if name in total_deaths_dict.keys():
            covid_deaths = total_deaths_dict[name]
            covid_disease = 'COVID-19 until ' + latest_date
            yll = get_yll(CFRs, demographics, covid_deaths, life_expcs)
            covid_disease_row = pd.DataFrame({'Val': [yll]}, index=[covid_disease])
            disease_column = disease_column.append(covid_disease_row)
        disease_column = disease_column.sort_values(by=['Val'], ascending=False) # sort again

        disease_DALYs = disease_column.Val.tolist()
        disease_DALYs_dict[id] = [int(n) for n in disease_DALYs] # to integer for plots
        disease_names_dict[id] = list(disease_column.index.values)

        #
        ## risk names and DALYs
        #
        # first check if we have risks data for this country
        if name not in list(risk_df['Entity']):
            print('Risk data missing for ' + name)
            break

        risk_row = risk_df[ risk_df['Entity'] == name ]

        # add to missing risks if it's missing for this country
        if risk_row.isnull().sum().sum():
            for missing_risk in list(risk_row.columns[risk_row.isnull().any()]):
                missing_risks[missing_risk].append(name)

        risk_row = risk_row.fillna(0)

        del risk_row['Outdoor air pollution'] # we already have it in Air polution (indoor and outdoor)
        del risk_row['Indoor air pollution'] # same
        del risk_row['Entity']
        risk_column = risk_row.T # transpose
        risk_column.columns = ['Val'] # rename
        risk_column = risk_column.sort_values(by=['Val'], ascending=False) # sort
        risk_column['Val'] = risk_column['Val'].apply(lambda x: round(x, 0)) # round
        risk_column = risk_column[:10] # choose only top 10 risks

        # append the latest estimate of deaths for COVID-19 cause
        if name in total_deaths_dict.keys():
            covid_deaths = total_deaths_dict[name]
            covid_risk = 'COVID-19 until ' + latest_date
            yll = get_yll(CFRs, demographics, covid_deaths, life_expcs)
            covid_risk_row = pd.DataFrame({'Val': [yll]}, index=[covid_risk])
            risk_column = risk_column.append(covid_risk_row)
        risk_column = risk_column.sort_values(by=['Val'], ascending=False) # sort again

        risk_DALYs = risk_column.Val.tolist()
        risk_DALYs_dict[id] = [int(n) for n in risk_DALYs] # to integer for plots
        risk_factors_dict[id] = list(risk_column.index.values)

        #
        ## next country properties
        #
        id += 1

    # if there is any missing data:
    for cause, countries in missing_causes.items():
        if countries:
            print('No cause data about ' + cause + ' in countries: ['
                + countries[0] + ', '
                + countries[1] + ', ..., '
                + countries[-1] + ']')

    for disease, countries in missing_diseases.items():
        if countries:
            print('No disease data about ' + disease + ' in countries: ['
                + countries[0] + ', '
                + countries[1] + ', ..., '
                + countries[-1] + ']')

    for risk, countries in missing_risks.items():
        if countries:
            print('No risk data about ' + risk + ' in countries: ['
                + countries[0] + ', '
                + countries[1] + ', ..., '
                + countries[-1] + ']')

    # save all data in one data dict:
    comparedata = {}

    comparedata["names"] = names_dict
    comparedata["life_exp"] = life_exp_dict
    comparedata["demographics"] = demographics_dict
    comparedata["major_causes"] = major_causes_dict
    comparedata["major_deaths"] = major_deaths_dict
    comparedata["disease_names"] = disease_names_dict
    comparedata["disease_DALYs"] = disease_DALYs_dict
    comparedata["risk_factors"] = risk_factors_dict
    comparedata["risk_DALYs"] = risk_DALYs_dict

    np.save('../data/comparedata.npy', comparedata)


prepare_compare_data()
