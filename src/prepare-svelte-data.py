#!/usr/bin/python3
# preparesveltedata.py - Prepares Svelte stores:
#
#   store_<language>.js for language in languages
#
# and generates files:
#
#   *store_english.js
#   *store_chinese.js
#   *store_spanish.js
#
# so when users visit the website Svelte app comes preloaded with data
#

'''
Each Svelte store file should look like this

  store_english.js:

    import { readable } from 'svelte/store';

    export const englishDictStore = readable({
    	app: {
    		 mainTitle: "Expected Impact of COVID-19: Analyzer",
             ...
    	},
    	fatalityRisks: [
    		 {id: 0,
    		  source: "Imperial College - IF",
    		  ftr: [0.002, 0.006, 0.03, 0.08, 0.15, 0.6, 2.2, 5.1, 9.3] },
              ...
    	],
        countries: [
            {id: 0,
            name: "Afghanistan",
            lifeExpectancy: 64.83,
            demographics: [11040694, ..., 105087],

            majorCauses: ['Cardiovascular diseases', ..., 'Diabetes'],
            majorDeaths: [56119, ..., 5978],

            diseaseNames: ['Neonatal disorders', ..., 'Musculoskeletal disorders'],
            diseaseDALYs: [2949759, ..., 542777],

            riskFactors: ['Air pollution (outdoor & indoor)', ..., 'Child stunting'],
            riskDALYs: [1341395, ..., 455174]}, ...
            ...
    	],
      });
'''


import numpy as np
import pandas as pd
import json
from datetime import datetime
import os
import pprint

languages = ['english', 'spanish', 'chinese', 'portuguese']

def get_translate_to():
    '''
    Creates and returns a dictionary translate_to, to use it as:

        translate_to[target language]['some worlds in english'] returns:
        'some worlds in target language'

    '''
    print('Using files: ' + str(os.listdir('../data/translations')) + '\n')
    translate_to = {}
    for language in languages:
        # read in translated CSVs
        app = pd.read_csv('../data/translations/english_' + language + '_app.csv')
        countries = pd.read_csv('../data/translations/english_' + language + '_countries.csv')

        # create dictionaries
        app_dict = dict(list(zip(list(app['english']),
                                 list(app[language]))))
        countries_dict = dict(list(zip(list(countries['english']),
                                       list(countries[language]))))

        # add to big dictionary
        translate_to[language] = {**app_dict,
                                  **countries_dict}
    return translate_to

def create_svelte_stores():
    '''
    Writes data from dictionaries to Svelte store.
    '''
    data = np.load('../data/data.npy', allow_pickle='TRUE').item()
    # dict_keys(['names', 'life_exp', 'demographics', 'major_causes', 'major_deaths',
    # 'disease_names', 'disease_DALYs', 'risk_factors', 'risk_DALYs', 'app', 'sources',
    # 'ftrs', 'compare_with'])
    translate_to = get_translate_to()

    for language in languages:
        with open('store_' + language + '.js', 'w') as data_file:
            data_file.write('import { readable } from \'svelte/store\';\n\n')

            now = datetime.now()
            dt_string = now.strftime("%Y-%m-%d %H:%M:%S")
            data_file.write('// version = ' + dt_string + ';\n\n')

            data_file.write('export const '+ language + 'DictStore = readable({ \n')

            # write app fields and translations:
            data_file.write('\tapp: {\n')
            for field_name, field_text in data["app"].items():
                data_file.write('\t\t ' + field_name + ': ' + '\"' +
                                translate_to[language][field_text] + '\",\n')
            data_file.write('\t\t},\n')

            # write fatalityRisks:
            data_file.write('\tfatalityRisks: [\n')
            for id in data["sources"].keys():
                data_file.write('\t\t {id: ' + str(id) + ",\n" \
                + '\t\t  source: \"'
                + translate_to[language][data["sources"][id]] + '\",\n' \
                + '\t\t  ftr: ' + str(data["ftrs"][id]) + " },\n")
            data_file.write('\t\t],\n') # finish with list ending ]

            # compare options
            data_file.write('\tcompareOptions: [\n')
            for id in data["compare_with"].keys():
                data_file.write('\t\t {id: ' + str(id) + ",\n" \
                + '\t\t  compareWith: \"' +
                translate_to[language][data["compare_with"][id]] + "\" },\n")
            data_file.write('\t\t],\n') # finish with list ending ]

            # write countries:
            data_file.write('\tcountries: [\n')
            for id in data["names"].keys():
                # prepare string lines
                life_exp = round(data["life_exp"][id], 2)
                life_exp_lst = ['lifeExpectancy', life_exp]
                life_exp_lst = map(str, life_exp_lst)
                life_exp_str = ": ".join(life_exp_lst)

                majorCauses = [ translate_to[language][ cause ] for cause in data["major_causes"][id] ]
                diseaseNames = [ translate_to[language][ disease ] for disease in data["disease_names"][id] ]
                riskFactors = [ translate_to[language][ risk ] for risk in data["risk_factors"][id] ]

                # and write country properties as a concatenated string
                data_file.write('\t\t {id: ' + str(id) + ",\n" \
                + '\t\t  name: \"' +
                translate_to[language][ data["names"][id] ] + '\",\n' \
                + '\t\t  ' + life_exp_str + ',\n' \
                + '\t\t  demographics: ' + str(data["demographics"][id]) + ",\n" \

                + '\t\t  majorCauses: ' + str(majorCauses) + ",\n" \
                + '\t\t  majorDeaths: ' + str(data["major_deaths"][id]) + ",\n"

                + '\t\t  diseaseNames: ' + str(diseaseNames) + ",\n" \
                + '\t\t  diseaseDALYs: ' + str(data["disease_DALYs"][id]) + ",\n"

                + '\t\t  riskFactors: ' + str(riskFactors) + ",\n" \
                + '\t\t  riskDALYs: ' + str(data["risk_DALYs"][id]) + " },\n")

            data_file.write('\t\t],\n') # and finish with list ending ]

            data_file.write('  });\n') # end readable and englishDictStore


create_svelte_stores()
