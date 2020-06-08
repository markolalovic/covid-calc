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
    app_dict['subtitle'] = "A visual tool to explore and analyze the potential impacts of COVID-19"

    # tab items
    app_dict['tabItem0'] = "Mortality by Age"
    app_dict['tabItem1'] = "Estimates in Context"
    app_dict['tabItem2'] = "Risks by Country"
    app_dict['tabItem3'] = "Poverty Proj."
    app_dict['tabItem4'] = "Deaths Proj."
    app_dict['tabItem5'] = "Hyp. Scenarios"
    app_dict['tabItem6'] = "Ex. Interpretations"

    app_dict['location'] = "Location"
    app_dict['selectLocation'] = "Select location"
    app_dict['locationDescription'] = "The impact of COVID-19 varies between countries."
    app_dict['infectionRate'] = "Infection rate"
    app_dict['infectionRateDescription'] = "Proportion of all people contracting the novel coronavirus."
    app_dict['over60InfectionRate'] = "Over 60 infection rate"
    app_dict['below60InfectionRate'] = "Below 60 infection rate"
    app_dict['over60Description'] = "Proportion of all people over the age of 60 contracting the novel coronavirus."
    app_dict['proportionIsThen'] = "The proportion of people below 60 infected is then"
    app_dict['proportionIsThenDescription'] = "Since it depends on both overall infection rate and infection rate of people over 60."

    app_dict['basedOn'] = "Based on"
    app_dict['basedOnContinued1'] = "fatality rates and "
    app_dict['basedOnContinued2'] = "age distribution and other selected input parameters, we can expect: "
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
        And hover over map to get information about the country it represents."

    app_dict['projectedPovery'] = "Projected increases by country due to coronavirus impact on the world economy \
        in the number of people living in extreme poverty, \
        that is an income below the international poverty line of $1.90 per day."
    app_dict['sources'] = "Sources: "
    app_dict['projectedPoveryByRegion'] = "Projected poverty increases by region due to coronavirus impact on world economy."

    app_dict['projectionsCaption'] = "Projections of total deaths from COVID-19. Click on the legend to select or deselect a country."
    app_dict['source'] = "Source:"


    app_dict['reset'] = "Reset"

    app_dict['infectedTitle'] = "Expected Number of Infected by Age"
    app_dict['deathsTitle'] = "Expected Number of Deaths by Age"
    app_dict['age'] = "Age"
    app_dict['infected'] = "Infected"
    app_dict['deaths'] = "Deaths"

    app_dict['projectionsTitle'] = "Projections of Total Deaths Over Time by Country"
    app_dict['date'] = "Date"
    app_dict['totDeaths'] = "Total deaths"
    app_dict['totDeathsProj'] = "Total deaths (projected)"

    app_dict['titleListMain'] = "How COVID-19 Compares With "
    app_dict['titleListName'] = "Cause"
    app_dict['titleListRisk'] = "Risk"
    app_dict['titleListNumber'] = " in "
    app_dict['yearsOfLifeLost'] = "Yrs of Life Lost"
    app_dict['inCountry'] = " in "

    app_dict['compareItems0'] = "Causes of Death"
    app_dict['compareItems1'] = "Causes of Years of Life Lost"
    app_dict['compareItems2'] = "Risk Factors in Years of Life Lost"

    app_dict['covid19Cause'] = "COVID-19 (estimate)"
    app_dict['enterDescribtion'] = "Enter description"

    app_dict['yrsOfLifeLost'] = "Expected Years of Life Lost"
    app_dict['yrsOfLifeLostCosts'] = "Potential Costs"
    app_dict['scenariosDescription'] = "Description of scenario"

    app_dict['povertyTitle'] = "Potential Millions Pushed Into Extreme Poverty Due to COVID-19 by "
    app_dict['country'] = "Country"
    app_dict['region'] = "Region"
    app_dict['people'] = "People"

    # poverty increase by country
    app_dict['india'] = "India"
    app_dict['nigeria'] = "Nigeria"
    app_dict['drCongo'] = "Democratic Republic of Congo"
    app_dict['ethiopia'] = "Ethiopia"
    app_dict['bangladesh'] = "Bangladesh"
    app_dict['tanzania'] = "Tanzania"
    app_dict['madagascar'] = "Madagascar"
    app_dict['indonesia'] = "Indonesia"
    app_dict['kenya'] = "Kenya"
    app_dict['mozambique'] = "Mozambique"
    app_dict['uganda'] = "Uganda"
    app_dict['southAfrica'] = "South Africa"

    # regions
    app_dict['subSahAfrica'] = "Sub-Saharan Africa"
    app_dict['southAsia'] = "South Asia"
    app_dict['eastAsiaPacific'] = "East Asia & Pacific"
    app_dict['latinCaribbean'] = "Latin America & Caribbean"
    app_dict['middleEastNorthAfrica'] = "Middle East & North Africa"
    app_dict['europeCentralAsia'] = "Europe & Central Asia"
    app_dict['northAmerica'] = "North America"


    app_dict['mainProjRegions'] = "Causes of Death"
    app_dict['nameProjRegions'] = "Causes of Years of Life Lost"
    app_dict['numberProjRegions'] = "Risk Factors in Years of Life Lost"

    # rest of parameters
    app_dict['fatalityRates'] = "Fatality rates"
    app_dict['fatalityRatesDescription'] = "Select estimates of risk of death from infection with the novel coronavirus."\
    " Estimates vary between countries and over time."\
    " Wider testing can reduce CFR estimates."

    app_dict['varyFRs'] = "Vary selected fatality rates"
    app_dict['varyFRsDescription1'] = "Try increasing the risk of deaths, e.g. to 50%, "\
    " for low-income country or overwhelmed healthcare."
    app_dict['varyFRsDescription2'] = "Or decreasing, e.g. to -50%, "\
    " for expected improved treatments and better healthcare."

    app_dict['resetDescription'] = "Set all input parameters back to their initial values."

    app_dict['elimination'] = "Probability of eliminating COVID-19"
    app_dict['eliminationDescription1'] = "Probability of achieving complete elimination "\
    " of COVID-19 disease before it manages to infect"
    app_dict['eliminationDescription2'] = "of population."

    app_dict['infectionUntil'] = "Infection rate until elimination"
    app_dict['infectionUntilDescription'] = "Proportion of population that still gets infected even in the event"\
    " of achieving complete elimination."\
    " Note: First increase the probability of elimination"\
    " for this parameter to take effect."

    app_dict['hideExport'] = "Hide Export"
    app_dict['export'] = "Export"
    app_dict['exportDescription'] = "Export Hypothetical COVID-19 Scenarios in JSON format."
    app_dict['export1'] = "Hide Export"
    app_dict['export1'] = "Hide Export"

    app_dict['scenariosCaption'] = "You can set input parameters that describe a hypothetical scenario and add it to"\
    " the table for comparison."\
    " There are 3 examples of hypothetical scenarios for the selected location and fatality risks."\
    " Results should be interpreted with caution, see Example Interpretations."

    app_dict['exampleScenario0'] = "Scenario 0: Do nothing, as a baseline"
    app_dict['exampleScenario1'] = "Scenario 1: Protect people over 60, "\
    " compensate by exposing those below 60, consider also years of life lost"
    app_dict['exampleScenario2'] = "Scenario 2: Elimination to 90%, consider also money saved"


    app_dict['mapTitle'] = "COVID-19 Risks by Country"
    app_dict['mapItems0'] = "Proportion of people over 60 by Country"
    app_dict['mapItems1'] = "Low Income Risk by Country"

    app_dict['povertyItems0'] = "By Country"
    app_dict['povertyItems1'] = "By Region"

    return app_dict



save_data()
