#!/usr/bin/python3
# preparedemographicsdata.py - Scrapes populationpyramid.net to get demographics:
#   age distribution for each country
# and saves it in data/population-pyramids

## install packages
# pip install selenium
# pip install geckodriver-autoinstaller
#import geckodriver_autoinstaller
# geckodriver_autoinstaller.install()
# '/home/marko/.local/lib/python3.8/site-packages/geckodriver_autoinstaller/v0.26.0/geckodriver'

from selenium import webdriver
from selenium.webdriver.firefox.options import Options

import os
import json

import numpy as np
import pandas as pd


def scrape(driver, from_url, fname, link_text):
    '''
    Scrapes:
        * file with name: fname
        * using link text: link_text
        * from website: from_url
    e.g.:
        scrape(driver=webdriver.Firefox(),
               from_url='https://www.populationpyramid.net/',
               fname='africa/2019',
               link_text='Excel CSV')
    '''
    url = from_url + fname
    try:
        print('Getting to: ' + url)
        driver.get(url)
        file_link = driver.find_element_by_link_text(link_text)
        file_link.click() # set driver options to go directly to scrape directory
        print('Found file ' + fname)
    except:
        print('Haven\'t found file ' + fname)

def scrape_pop_pyramids():
    '''
    Scrapes populationpyramid.net to get demographics: age distributions.
    '''
    download_dir = '/nfs/general/repos/covid-19/data/population-pyramids'
    options = Options()
    options.set_preference("browser.download.folderList", 2) # not to use default downloads dir
    options.set_preference("browser.download.manager.showWhenStarting", False) # turn off showing downloads
    options.set_preference("browser.download.dir", download_dir) # set downloads dir
    options.set_preference("browser.helperApps.neverAsk.saveToDisk", "text/csv");
    options.add_argument('--headless')

    driver = webdriver.Firefox(options=options) # executable_path=r'/usr/local/bin/geckodriver'

    from_url = 'https://www.populationpyramid.net/'
    link_text='Excel CSV'

    country_names = get_country_names()

    print('Scraping population pyramids')
    for country in country_names:
        scrape(driver=driver,
               from_url=from_url,
               fname=country + '/2019',
               link_text=link_text)
    print('Done')

def get_country_names():
    '''
    Returns a list of country names from a file.
    '''
    path = 'data/population-pyramids/'
    fname = 'country_names.text'
    with open(path + fname) as file:
        country_names = file.readlines()

    country_names = [name.strip() for name in country_names]

    for char in ['/', '\'', '(', ')', '.', ',']:
            country_names = [name.replace(char, "") for name in country_names]

    country_names = [name.lower() for name in country_names]
    return country_names


# scrape_pop_pyramids() # already scraped
