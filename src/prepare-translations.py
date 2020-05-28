#!/usr/bin/python3
# preparedicts.py - Prepares translate to dictionary to use as:
# translate_to[language][ data["sources"][id] ] instead of data["sources"][id]

import numpy as np
import pandas as pd
from re import finditer
from googletrans import Translator
languages = ['english', 'spanish', 'chinese']

def get_set(dict_values):
    '''
    Creates first a set from lists of names (causes, diseases, risks) and returns a list of this set.
    e.g. get_set(data['major_causes'].values())
    '''
    s = set()
    for names_list in dict_values:
        for name in names_list:
            s.add(name)
    return list(s)

def camel_case_split(identifier):
    '''
    Source: https://stackoverflow.com/questions/29916065/how-to-do-camelcase-split-in-python
    '''
    matches = finditer('.+?(?:(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|$)', identifier)
    return [m.group(0) for m in matches]

def get_description(field_name):
    '''
    Returns description from JavaScript field names,
    e.g.
    get_description('mainTitle')
    returns 'Main title'
    '''
    field_name_parts = camel_case_split(field_name)
    field_name_parts = list(map(lambda x: x.lower() , field_name_parts))
    field_name_parts[0] = field_name_parts[0].capitalize()
    return ' '.join(field_name_parts)

def prepare_translations_csv():
    '''
    Creates template for translations: english_target.csv
    '''
    data = np.load('../data/data.npy', allow_pickle='TRUE').item()

    descriptions_list = [] # descriptions from keys names
    english_list = [] # list of english words and sentences

    # prepare words for translations of 'app', 'sources', 'ftrs', 'compare_with'
    all_field_names = list(data['app'].keys())
    descriptions_list += list(map(lambda x: get_description(x) , all_field_names))
    english_list += list(data['app'].values())

    all_ftrs = list(data['sources'].values())
    descriptions_list += ['Sources of Fatality Rates'] * len(all_ftrs)
    english_list += all_ftrs

    all_compare_options = list(data['compare_with'].values())
    descriptions_list += ['Option to compare with'] * len(all_compare_options)
    english_list += all_compare_options

    # preprare words for translations of causes, diseases, risk factors
    all_causes = get_set(data['major_causes'].values())
    descriptions_list += ['Cause of death, e.g. homicide'] * len(all_causes)
    english_list += all_causes

    all_diseases = get_set(data['disease_names'].values())
    descriptions_list += ['Cause of years of life lost, e.g. cancer'] * len(all_diseases)
    english_list += all_diseases

    all_risks = get_set(data['risk_factors'].values())
    descriptions_list += ['Risk factor, e.g. smoking'] * len(all_risks)
    english_list += all_risks

    english_english_app = pd.DataFrame.from_dict({
                            'english': english_list,
                            'target': english_list, # target language goes here
                            'description': descriptions_list})
    print('Saving english words for translations: ')
    print(str(english_english_app.head()))
    print('\n')
    english_english_app.to_csv('../data/translations/english_english_app.csv', index = False)

def translate():
    translator = Translator()

    for language in ['spanish', 'chinese']:
        english_target = pd.read_csv('../data/translations/english_english_app.csv')

        # rename column to target language
        english_target.rename(columns={'target': language}, inplace=True)

        # translate
        dummy_tranlations = True
        for i in range(english_target.shape[0]):
            words = english_target.iloc[0]['english']
            if dummy_tranlations: # just write english words to target language columns
                english_target.iloc[0][language] = words
            else: # use google translate api
                if language == 'chinese':
                    translation = translator.translate(words, src='en', dest='zh-CN')
                    english_target.iloc[0][language] = translation.text
                else: # spanish
                    translation = translator.translate(words, src='en', dest='es')
                    english_target.iloc[0][language] = translation.text

        english_target.to_csv('../data/translations/english_' + language + '_app.csv', index = False)

prepare_translations_csv()
# translate()
