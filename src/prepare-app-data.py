#!/usr/bin/python3
# preparedicts.py - Prepares Svelte app field names and field text and
# joins comparedata with some additional data into data.npy

'''
Dictionary keys:

* app
* sources
* ftrs
* compares
'''

import numpy as np

def save_data():
    '''
    Joins compare data and app data into data.npy and saves to data directory.
    '''
    data = np.load('../data/comparedata.npy', allow_pickle='TRUE').item()
    data["app"] = get_app_dict()
    data["sources"], data["ftrs"] = get_fatality_data()
    data["compare_with"] = get_compare_dict()

    np.save('../data/data.npy', data)

def get_fatality_data():
    '''
    Returns fatality rates sources names and estimates for Svelte app
    in the form of two dictionaries:

    * sources_dict
    * ftrs_dict
    '''
    sources_dict = {}   # = {id: source_name}
    ftrs_dict = {}      # = {id: fatality_rates}

    sources_dict[0] = 'Imperial College - IFR'
    ftrs_dict[0] = [0.002, 0.006, 0.03, 0.08, 0.15, 0.6, 2.2, 5.1, 9.3]

    sources_dict[1] = 'China CDC - CFR'
    ftrs_dict[1] = [0, 0.2, 0.2, 0.2, 0.4, 1.3, 3.6, 8, 14.8]

    sources_dict[2] = 'Korea CDC - CFR'
    ftrs_dict[2] = [0, 0, 0, 0.11, 0.08, 0.5, 1.8, 6.3, 13]

    sources_dict[3] = 'JAMA Italy - CFR'
    ftrs_dict[3] = [0, 0, 0, 0.3, 0.4, 1, 3.5, 12.8, 20.2]

    sources_dict[4] = 'MISAN Spain - CFR'
    ftrs_dict[4] = [0, 0, 0.22, 0.14, 0.3, 0.4, 1.9, 4.8, 15.6]

    return sources_dict, ftrs_dict

def get_compare_dict():
    '''
    Returns dictionary of compare options for Svelte app.
    '''
    compare_with_dict = {}
    compare_with_dict[0] = 'Other Major Causes Of Death'
    compare_with_dict[1] = 'Diseases in Years of Life Lost'
    compare_with_dict[2] = 'Risk Factors in Years of Life Lost'
    compare_with_dict[3] = 'Other Countries in the World'

    return compare_with_dict

def get_app_dict():
    '''
    Returns field names and texts for Svelte app.
    '''
    app_dict = {} # { fieldName: field_text }
    app_dict['mainTitle'] = "COVID Calculator"
    app_dict['subtitle'] = "A visual tool to explore and analyze potential impacts of COVID-19"
    app_dict['location'] = "Location"
    app_dict['selectLocation'] = "Select location"
    app_dict['locationDescription'] = "The impact of COVID-19 varies between countries."
    app_dict['infectionRate'] = "Infection rate"
    app_dict['infectionRateDescription'] = "Proportion of all people contracting the novel coronavirus."
    app_dict['over60InfectionRate'] = "Over 60 infection rate"
    app_dict['over60Description'] = "Proportion of all people over the age of 60 contracting the novel coronavirus."
    app_dict['proportionIsThen'] = "The proportion of people below 60 infected is then"
    app_dict['proportionIsThenDescription'] = "Since it depends on both overall infection rate and infection rate of people over 60."
    app_dict['basedOn'] = "Based on"

    app_dict['basedOnContinued1'] = "fatality rates and "
    app_dict['basedOnContinued2'] = "s age distribution and other selected input parameters, the potential expected numbers"
    app_dict['basedOnContinued3'] = "infected and "
    app_dict['basedOnContinued4'] = "deaths or "
    app_dict['basedOnContinued5'] = "years of life lost in "

    app_dict['compareWithOtherCaption1'] = "It is possible that estimated coronavirus deaths will span multiple years."
    app_dict['compareWithOtherCaption2'] = "Deaths due to other causes are for the year of 2017. Source:"
    app_dict['compareWithOtherCaption3'] = "Confirmed deaths due to COVID-19 until May 27, 2020. Source: "
    app_dict['compareWithOtherCaption4'] = "Years of life lost due to other causes are for the year of 2017. Source: "
    app_dict['compareWithOtherCaption5'] = "Years of life lost due to COVID-19 until May 27, 2020. Source: "
    app_dict['authorsCalculations'] = "and authors calculations."
    app_dict['compareWithOtherCaption7'] = "Years of life lost due to other risk factors are for the year of 2017. Source:"

    app_dict['proportionOver60ByCountry'] = "Proportion of People Over 60 Risk by Country"
    app_dict['lowIncomeRiskByCountry'] = "Low Income Risk by Country"
    app_dict['mapCaption'] = "You can hover over legend items to select. You can zoom in and out of map. \
        And hover over map to get information about the country it represents. Source:"

    app_dict['projectedPovery'] = "Projected poverty increases by country due to coronavirus impact on world economy."
    app_dict['sources'] = "Sources: "
    app_dict['projectedPoveryByRegion'] = "Projected poverty increases by region due to coronavirus impact on world economy."

    app_dict['projectionsCaption'] = "Projections of total deaths from COVID-19. Click on the legend to select or deselect a country."
    app_dict['source'] = "Source:"


    app_dict['comparisonTitle'] = "How COVID-19 Compare With "
    app_dict['selectSource'] = "Select source"
    app_dict['prevalence'] = "Proportion of Infected"
    app_dict['reset'] = "Reset"
    app_dict['fatalityRisksSource'] = "Fatality Risks: "
    app_dict['infectedTitle'] = "Expected Infected by Age In: "
    app_dict['deathsTitle'] = "Expected Deaths by Age In: "
    app_dict['yearsOld'] = "yrs"
    app_dict['covid19Cause'] = "COVID-19 estimate"
    app_dict['tableTitle'] = "Total expected numbers in"
    app_dict['enterDescribtion'] = "Enter description"
    app_dict['description'] = "Description"
    app_dict['infected'] = "Expected Number of Infected"
    app_dict['deaths'] = "Expected Number of Deaths"
    app_dict['yrsOfLifeLost'] = "Expected Years of Life Lost"
    app_dict['yrsOfLifeLostCosts'] = "Potential Costs"

    return app_dict

save_data()
