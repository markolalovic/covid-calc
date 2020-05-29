<script>

	/***
	* App.svelte - web app in Svelte for the user interface:
	  - imports data from stores.js previously created by prepare_data.py
	  - reactively calculates estimates for chosen parameters
	  - visualizations using d3
	Compile in order to convert to JavaScript.
	*/

	// data
	import { englishDictStore } from './store_english.js';
	import { chineseDictStore } from './store_chinese.js';
	import { spanishDictStore } from './store_spanish.js';

	// main components
	import CompareByAge from './CompareByAge.svelte'; // Mortality by Age
	import Compare from './Compare.svelte'; // Estimates in Context
	import WorldMap from "./WorldMap.svelte"; // Risks by Country
	import Poverty from './Poverty.svelte'; // Poverty Projections
	import Projections from './Projections.svelte'; // Deaths Projections

	// accessory components and imports
	// import * as d3 from './d3.js';
	import Tabs from "./Tabs.svelte";
	import Subtabs from "./Subtabs.svelte";
	import AutoComplete from "./SimpleAutocomplete.svelte";
	import { fade, fly } from 'svelte/transition';
	import * as animateScroll from "svelte-scrollto"; // for export button on:click scroll down	
	import Square from "./Square.svelte"; // for captions legends
	import LineLegend from "./LineLegend.svelte"; // for captions legends

	const durationIn = 10;  // transition to load components
	const durationOut = 20; // transition to remove elements


	/***
	 * FUNCTIONS, SWITCHES
	 *
	*/
	function resetParameters() {
		pctH = 30;					// proportion of infected case Pr(elimination) = 0
		pctH_60plus = 30; 	// proportion of people over 60 infected
		pctOfChange = 0;		// proportion of increase or decrease fatality risks
		prElimTimes100 = 0; // probability of elimination case Pr(elimination) = 1
		pctU = 0;           // proportion of infected until elimination
	}

	function keepUpWithH() {
		pctH_60plus = pctH; // so that H_below60 doesn't explode
		if (pctH < pctU) {
			pctU = pctH;
		}
	}

	function changeLanguageTo(newLanguage) {
		language = newLanguage;

		// change default location translation
		selectedObject = { 
			id: 163, 
			name: translationMap[newLanguage].countries[163].name
		}; // translations.countries[selectedId].name;

		// change default source object translation
		selectedSourceObject = {
			id: 0, source: translationMap[newLanguage].fatalityRisks[0].source,
			ftr: [0.002, 0.006, 0.03, 0.08, 0.15, 0.6, 2.2, 5.1, 9.3] };
		
		// change enter description
		desc = translationMap[newLanguage].app.enterDescribtion;
	}

	// for formatting big numbers for totals
  function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	}
	
  function numberISO(x) {
    return d3.format('.3s')(x)
             .replace('G', 'B');
  }

  function numberFormatter(x) {
    if (x < Math.pow(10, 6)) {
      return numberWithCommas(x);
    } else {
      return numberISO(x);
    }
  }

	function jsonToConsole(jsonObject) {
		// for exporting data
		console.log(JSON.stringify(jsonObject));
	}

	function addScenario() {
		const newScenario = {
			id: rowsOfScenarios.length,
			loc: selectedLocation,
			frs: translations.fatalityRisks[selectedSourceId].source,
			H: pctH,
			H_60: pctH_60plus,
			H_below: pctH_below60,
			F: pctOfChange,
			Elim: prElimTimes100,
			U: pctU,
			totInf: totalInfected,
			totDeaths: totalDeaths,
			yrsLifeLost: totalYearsLost,
			yrsLifeLostCosts: totalMoneyLost,
			comments: "Scenario " + rowsOfScenarios.length.toString() + ": " + desc};

		rowsOfScenarios = rowsOfScenarios.concat(newScenario);
	}

	let deleteScenario = id => {
		rowsOfScenarios = rowsOfScenarios.filter(scn => scn.id !== id);
	}

	// tab items with labels and values
	$: tabItems = [
    { label: translations.app.tabItem0, value: 0 }, // "Mortality by Age"
    { label: translations.app.tabItem1, value: 1 }, // "Estimates in Context"
		{ label: translations.app.tabItem2, value: 2 }, // "Risks by Country"
		{ label: translations.app.tabItem3, value: 3 }, // "Poverty Proj."
		{ label: translations.app.tabItem4, value: 4 }, // "Deaths Proj."
    { label: translations.app.tabItem5, value: 5 }, // "Hyp. Scenarios"
		{ label: translations.app.tabItem6, value: 6 }, // "Ex. Interpretations"
  ];
  let currentTab = 0; // current active tab

	// export button
	let userNeeds = {
		exportData: false
	};

	function toggleExportData() {
		userNeeds.exportData = !userNeeds.exportData;
		animateScroll.scrollToBottom();
	}

	/***
	 * INITS, REACTIVE DECLARATIONS $:
	 *
	 */
	let selectedLocation = '';
 	$: selectedLocation = translations.countries[selectedId].name;

	let desc = "Enter description"; 	// enter scenario description

	// subscribe to dictionaries in stores.js
	let english = $englishDictStore;
	let chinese = $chineseDictStore;
	let spanish = $spanishDictStore;

	let translationMap = {
		'en': english,
		'zh': chinese,
		'es': spanish };

	let language = 'en';
	$: translations = translationMap[language];

	let defaultLocation = { id: 163, name: "World" }; // world is default location 

	let selectedObject = defaultLocation;
	$: selectedId = selectedObject.id;

	let defaultSourceObject = { id: 0, source: "Imperial College - IFR", ftr: [0.002, 0.006, 0.03, 0.08, 0.15, 0.6, 2.2, 5.1, 9.3] };
	let selectedSourceObject = defaultSourceObject;
	$: selectedSourceId = selectedSourceObject.id;

	let ageGroups = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'];

	$: demographics = translations.countries[selectedId].demographics;
	$: fatalitiesBaseline = translations.fatalityRisks[selectedSourceId].ftr;
	let lifeExpectanciesGlobal = [71.625, 62.950, 53.550, 44.400, 35.375, 26.625, 18.600, 11.950, 6.975];


	/***
	 * PARAMETERS H, pctOfChange, H_60+, H_below60, Pr(Elimination), H_until
	 *
	*/
	$: popSize = demographics.reduce((a, b) => a + b, 0); // population size of the chosen location
	$: d_60plus = (demographics[6] + demographics[7] + demographics[8]) / popSize; // proportion of people over 60

	let pctOfChange = 0; 		// variation of fatality rates
	let pctH = 30; 			    // proportion of population infected
	$: pctH_60plus = Math.round( pctH ); 	 // proportion of people over 60 infected

	// if we decrease proportion of 60+ infected, then proportion of younger people infected increases keeping H_overall fixed
	$: pctH_below60 = Math.round( (pctH - pctH_60plus * d_60plus) / (1 - d_60plus) );

	// derived bounds for pctH_plus based on: 0 <= pctH_below60 <= 1
	$: lowerBound = Math.max( 1, (pctH - 100 * (1 - d_60plus)) / d_60plus);  // has to be more than 0 and ...derive
	$: upperBound = Math.min( pctH / d_60plus, 99 ); 	                     // can't be more than 100% and pctH / d60_plus

	// same story for the case of elimination
	let prElimTimes100 = 0; // probability of elimination

	$: prElim = prElimTimes100 / 100;


	let pctU = 0; // proportion of population infected until
	$: if (pctH < pctU) {
		pctU = pctH;
	}

	// derive from pctH_60plus to keep the number of parameters low
	// then from U_60+/U = H_60+/H we get:
	$: pctU_60plus = (pctH_60plus / pctH) * pctU; // proportion of 60+ people that are infected until elimination
	$: pctU_below60 = (pctU -  pctU_60plus * d_60plus) / (1 - d_60plus); // pct of people below 60 infected until elimination

	$: lowerBoundUntil = Math.max( 1, (pctU - 100 * (1 - d_60plus)) / d_60plus);
	$: upperBoundUntil = Math.min( pctU / d_60plus, 99 );

	/***
	 * CALCULATION of infected, deaths, ... totals
	 *
	 */

	// use pctOfChange to increase / decrease the fatality risks
	$: fatalities = fatalitiesBaseline.map( fat => (fat * (1 + pctOfChange / 100)) );

	// expected number of infected
	// E(#of infected) = Pr(Elim) * demo * pctU + [1 - Pr(Elim)] * demo * pctH
	let infected = [0, 0, 0, 0, 0, 0, 0, 0, 0];
	let i = 0; // for reactive loop when using $: we need to declare it before the loop
	// multiply below60 demographics by pctH_below60 selected proportion of infected
	$: for (i = 0; i < 6; i++) {
			infected[i] = Math.round(
							prElim *  demographics[i] * pctU_below60 / 100           // infections in case of elimination for below 60
				   			+ (1 - prElim) * demographics[i] * pctH_below60 / 100 ); // case of no elimination for below 60
	}
	// multiply 60plus demographics by pctH_60plus selected proportion of infected
	$: for (i = 6; i < 9; i++) {
			infected[i] = Math.round(
							prElim * demographics[i] * pctU_60plus / 100             // infections in case of elimination for 60 plus
				            + (1 - prElim) * demographics[i] * pctH_60plus / 100 );  // no elimination 60+
	}

	// expected number of deaths
	// E(#of deaths) = infected * fatality_risks
	let deaths = [0, 0, 0, 0, 0, 0, 0, 0, 0];
	$: for (i = 0; i < deaths.length; i++) {
		deaths[i] = Math.round( infected[i] * fatalities[i] / 100 );
	}

	// expected years of life lost
	let yearsLost = [0, 0, 0, 0, 0, 0, 0, 0, 0];
	$: for (i = 0; i < deaths.length; i++) {
		yearsLost[i] = Math.round( deaths[i] * lifeExpectanciesGlobal[i] );
	}

	// sum vectors to get totals
	$: totalInfected = Math.round( infected.reduce((a, b) => a + b, 0) );
	$: totalDeaths = Math.round( deaths.reduce((a, b) => a + b, 0) );
	$: totalYearsLost = Math.round( yearsLost.reduce((a, b) => a + b, 0) );
	$: totalMoneyLost = Math.round( 129000 * totalYearsLost / Math.pow(10, 9) );

	// push estimated coronavirus deaths to majorCauses
	$: majorCauses = [translations.app.covid19Cause, ...translations.countries[selectedId].majorCauses];
	$: majorDeaths = [totalDeaths, ...translations.countries[selectedId].majorDeaths];

	// push estimated totalYearsLost TODO: DALYs of coronavirus deaths to diseaseNames
	$: diseaseNames = [translations.app.covid19Cause, ...translations.countries[selectedId].diseaseNames];
	$: diseaseDALYs = [totalYearsLost, ...translations.countries[selectedId].diseaseDALYs];

	// push estimated totalYearsLost TODO: DALYs of coronavirus deaths to riskCauses
	$: riskFactors = [translations.app.covid19Cause, ...translations.countries[selectedId].riskFactors];
	$: riskDALYs = [totalYearsLost, ...translations.countries[selectedId].riskDALYs];

	let compareItems = [{}, {}, {}];
	$: compareItems = [
    { label: translations.app.compareItems0, value: 0 }, // "Causes of Death"
    { label: translations.app.compareItems1, value: 1 }, // "Causes of Years of Life Lost"
    { label: translations.app.compareItems2, value: 2 }, // "Risk Factors in Years of Life Lost"
  ];
  let currentCompare = 0; // current active comparison item

	// to extract types for colors
	$: majorCausesEng = [translationMap['en'].app.covid19Cause, ...translationMap['en'].countries[selectedId].majorCauses];

	// let COVID estimate be 'parameter' color and COVID until be 'until' color
	let compareTypes = [];
	$: for (let i = 0; i < majorCausesEng.length; i++) {
		if (majorCausesEng[i].includes('estimate')) {
			compareTypes[i] = 'estimate';
		} else if (majorCausesEng[i].includes('until')) {
			// compareTypes[i] = 'until';
		} else {
			compareTypes[i] = 'other';
		}
	}

	let compareCauses = [];
	let compareDiseases = [];
	let compareRisks = [];
	$: for (let i = 0; i < majorCauses.length; i++) {
			compareCauses[i] = { name: majorCauses[i], number: majorDeaths[i], type: compareTypes[i] };
	}
	$: for (let i = 0; i < diseaseNames.length; i++) {
			compareDiseases[i] = { name: diseaseNames[i], number: diseaseDALYs[i], type: compareTypes[i] };
	}
	$: for (let i = 0; i < riskFactors.length; i++) {
			compareRisks[i] = { name: riskFactors[i], number: riskDALYs[i], type: compareTypes[i] };
	}

	let compareList = [];
	$: switch (currentCompare) {
		case 0:
			compareList = compareCauses;
			break;
		case 1:
			compareList = compareDiseases;
			break;
		default:
			compareList = compareRisks;
	}

	// compare titles
	let titleListName = '';
	let titleListNumber = '';
	let titleListMain = '';
	$: titleListMain = translations.app.titleListMain
	  + compareItems[currentCompare].label
		+ translations.app.inCountry + selectedLocation;

	$: if (currentCompare === 0) {
		titleListName = translations.app.titleListName;
		titleListNumber = translations.app.deaths;
	} else if (currentCompare === 1) {
		titleListName = translations.app.titleListName;
		titleListNumber = translations.app.yearsOfLifeLost;
	} else {
		titleListName = translations.app.titleListRisk;
		titleListNumber = translations.app.yearsOfLifeLost;
	}

	// ageGroups has numbers the same in all languages
	let ageTypes = [];
	$: for (let i = 0; i < ageGroups.length; i++) {
		if (ageGroups[i].includes('80') || ageGroups[i].includes('70') || ageGroups[i].includes('60')) {
			ageTypes[i] = 'over60';
		} else {
			ageTypes[i] = 'below60';
		}
	}

	let infectedData = [];
	let deathsData = [];
	$: for (let i = 0; i < infected.length; i++) {
		infectedData[i] = { name: ageGroups[i], number: infected[i], type: ageTypes[i] };
		deathsData[i] = { name: ageGroups[i], number: deaths[i], type: ageTypes[i] };
	}

	let infectedTitle = "";
	$: infectedTitle = translations.app.infectedTitle;
	  + ' in ' + selectedLocation;

	let deathsTitle = "";

	let infectedTitleListName = "";
	let infectedTitleListNumber = "";

	let deathsTitleListName = "";
	let deathsTitleListNumber = "";

	$: deathsTitle = translations.app.deathsTitle;
	  + ' in ' + selectedLocation;

  $: infectedTitleListName = translations.app.age;
  $: infectedTitleListNumber = translations.app.infected;

  $: deathsTitleListName = translations.app.age;
  $: deathsTitleListNumber = translations.app.age;

	// projections component 
	let projectionsTitle = '';
	let projectionsCaption = '';
	let projectionsXAxisLabel = '';
	let projectionsYAxisLabel = '';
	let projectionsLegendDeaths = '';
	let projectionsLegendDeathsProjected = '';

	$: projectionsTitle = translations.app.projectionsTitle;
  $: projectionsXAxisLabel = translations.app.date;
	$: projectionsYAxisLabel = translations.app.totDeaths;
	$: projectionsLegendDeaths = translations.app.totDeaths;
	$: projectionsLegendDeathsProjected = translations.app.totDeathsProj;

	// to export scenarios, countries population properties, etc. we just pretty print the JSONs
	$: exportedData = '\"Scenarios\": ' + JSON.stringify(rowsOfScenarios, null, 2);


	/***
	 * SCENARIOS
	 *
	*/

	// prepare example scenarios as a list of parameters, comments, id's ..
	// make a reactive for loop to define $: rowsOfScenarios! the same as infected, deaths, ...
	let inputs = [{}, {}, {}];
	$: inputs = [
	   {id: 0,
			pctH: 60,
			pctH_60plus: 60,
			pctOfChange: 0,
			prElim100: 0,
			pctU: 0,
			comments: translations.app.exampleScenario0},
			// "Scenario 0: Do nothing, as a baseline"
	   {id: 1,
			pctH: 60,
			pctH_60plus: 20,
			pctOfChange: 0,
			prElim100: 0,
			pctU: 0,
			comments: translations.app.exampleScenario1},
			// "Scenario 1: Protect people over 60, compensate by exposing those 
			// below 60, consider also years of life lost"
	   {id: 2,
			pctH: 60,
			pctH_60plus: 60,
			pctOfChange: 0,
			prElim100: 90,
			pctU: 10,
			comments: translations.app.exampleScenario2},
			// "Scenario 2: Elimination to 90%, consider also money saved"
	];

	// initialize all the variables the reactive loop:
	let pctH_below60Example = 0;
	let pctU_below60Example = 0;
	let pctU_60plusExample = 0;
	let prElimExample = 0;
	let fatalitiesExample = [0, 0, 0, 0, 0, 0, 0, 0, 0];
	let infectedExample = [0, 0, 0, 0, 0, 0, 0, 0, 0];
	let deathsExample = [0, 0, 0, 0, 0, 0, 0, 0, 0];
	let yearsLostExample = [0, 0, 0, 0, 0, 0, 0, 0, 0];
	let totalInfectedExample = 0;
	let totalDeathsExample = 0;
	let totalYearsLostExample = 0;
	let totalMoneyLostExample = 0;
	let j = 0;
	let rowsOfScenarios = [{}, {}, {}];

	$: for (i = 0; i < 3; i++) {
		// d_60plus does not depend on input parameters
		pctH_below60Example = Math.round( (inputs[i].pctH - inputs[i].pctH_60plus * d_60plus) / (1 - d_60plus) );

		// pctU_60plusExample = proportion of 60+ people that are infected until elimination
		pctU_60plusExample = (inputs[i].pctH_60plus / inputs[i].pctH) * inputs[i].pctU;
		pctU_below60Example = (inputs[i].pctU -  pctU_60plusExample * d_60plus) / (1 - d_60plus);

		fatalitiesExample = fatalitiesBaseline.map( fat => (fat * (1 + inputs[i].pctOfChange / 100)) );
		prElimExample = inputs[i].prElim100 / 100;

		for (j = 0; j < 6; j ++) {
				infectedExample[j] = Math.round( prElimExample * demographics[j] * pctU_below60Example / 100
								+ (1 - prElimExample) * demographics[j] * pctH_below60Example / 100 );
		}
		for (j = 6; j < 9; j++) {
				infectedExample[j] = Math.round( prElimExample * demographics[j] * pctU_60plusExample / 100
								+ (1 - prElimExample) * demographics[j] * inputs[i].pctH_60plus / 100 );
		}

		for (j = 0; j < deathsExample.length; j++) {
			deathsExample[j] = Math.round( infectedExample[j] * fatalitiesExample[j] / 100 );
		}

		for (j = 0; j < yearsLostExample.length; j++) {
			yearsLostExample[j] = Math.round( deathsExample[j] * lifeExpectanciesGlobal[j] );
		}

		totalInfectedExample = Math.round( infectedExample.reduce((a, b) => a + b, 0) );
		totalDeathsExample = Math.round( deathsExample.reduce((a, b) => a + b, 0) );
		totalYearsLostExample = Math.round( yearsLostExample.reduce((a, b) => a + b, 0) );
		totalMoneyLostExample = Math.round( 129000 * totalYearsLostExample / Math.pow(10, 9) ); // in $< >B or billion format

		rowsOfScenarios[i] = {
			id: inputs[i].id,
			loc: selectedLocation,
			frs: translations.fatalityRisks[selectedSourceId].source,
			H: inputs[i].pctH,            // just copy first five input parameters to output
			H_60: inputs[i].pctH_60plus,
			H_below: pctH_below60Example,
			F: inputs[i].pctOfChange,
			Elim: inputs[i].prElim100,
			U: inputs[i].pctU,
			totInf: totalInfectedExample,
			totDeaths: totalDeathsExample,
			yrsLifeLost: totalYearsLostExample,
			yrsLifeLostCosts: totalMoneyLostExample,
			comments: inputs[i].comments};
	}

	// world map
	let mapTitle = '';
	$: mapTitle = translations.app.mapTitle;

	let mapItems = [{}, {}];
	$: mapItems = [
		{ label: translations.app.mapItems0, value: 0 }, // "Proportion of people over 60 by Country"
		{ label: translations.app.mapItems1, value: 1 } // "Income by Country"
	];
	let selectedRisk = 0;

	
	// poverty
	let povertyItems = [{}, {}];
	$: povertyItems = [
    { label: translations.app.povertyItems0, value: 0 }, // "By Country"
    { label: translations.app.povertyItems1, value: 1 } // "By Region"
  ];
  let currentPoverty = 0;


	// poverty increases by country:
	$: povertyProjCountryNames = [translations.app.india, 
		translations.app.nigeria,
		translations.app.drCongo,
		translations.app.ethiopia,
		translations.app.bangladesh,
		translations.app.tanzania,
		translations.app.madagascar,
		translations.app.indonesia,
		translations.app.kenya,
		translations.app.mozambique,
		translations.app.uganda,
		translations.app.southAfrica];
	let povertyProjCountryNumbers = [8784000, 5023850, 2842320, 1604720, 1221500,
		1139840, 976040, 927000, 915720, 897520, 821600, 721050];

	let povertyProjCountries = []
	$: for (let i = 0; i < povertyProjCountryNames.length; i++) {
			povertyProjCountries[i] = {
				name: povertyProjCountryNames[i],
				number: povertyProjCountryNumbers[i],
				type: 'poverty' };
	}

	// poverty increases by region:
	$: povertyProjRegionNames = [
		translations.app.subSahAfrica,
		translations.app.southAsia,
		translations.app.eastAsiaPacific,
		translations.app.latinCaribbean,
		translations.app.middleEastNorthAfrica,
		translations.app.europeCentralAsia,
		translations.app.northAmerica];

	let povertyProjRegionNumbers = [21994380.0, 10619000.0, 2294580.0, 1796560.0, 867540.0, 665690.0, 313600.0];

	let povertyProjRegions = []
	$: for (let i = 0; i < povertyProjRegionNames.length; i++) {
			povertyProjRegions[i] = {
				name: povertyProjRegionNames[i],
				number: povertyProjRegionNumbers[i],
				type: 'poverty' };
	}

	// Projected Poverty Increases by Country and Region
	let mainProjCountries = '';
	let nameProjCountries = '';
	let numberProjCountries = '';

	let mainProjRegions = '';
	let nameProjRegions = '';
	let numberProjRegions = '';

	$: mainProjCountries = translations.app.projectionsTitle + 
		translations.app.country;
	$: nameProjCountries = translations.app.country;
	$: numberProjCountries = translations.app.people;

	$: mainProjRegions = translations.app.projectionsTitle + 
		translations.app.region;
	$: nameProjRegions = translations.app.region;
	$: numberProjRegions = translations.app.people;

	// color countries by regions
	// 'Sub-Saharan Africa', 'South Asia', 'East Asia & Pacific',
	// 'Latin America & Caribbean', 'Middle East & North Africa', 'Europe & Central Asia', 'North America'
	let colorsProjRegions = ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628'];
	let colorsProjCountries = [colorsProjRegions[1],
		colorsProjRegions[0], colorsProjRegions[0], colorsProjRegions[0],
		colorsProjRegions[1], colorsProjRegions[0], colorsProjRegions[0],
	  colorsProjRegions[2], colorsProjRegions[0], colorsProjRegions[0],
		colorsProjRegions[0], colorsProjRegions[0]];

</script>


<main class="container">

	<div class="row">
		<div class="eight columns title">
			<div class = "child">
				<h3 class="title">{translations.app.mainTitle}</h3>
				<h6 class="parameter-text">{translations.app.subtitle}</h6>
			</div>
		</div>
		<div class="four columns title">
			<div class="child">
				<a href="#zh" class="lang-link" on:click="{
					() => changeLanguageTo('zh')}">中文
				</a>
				<a href="#es" class="lang-link" on:click="{
					() => changeLanguageTo('es')}">Español
					</a>
				<a href="#en" class="lang-link" on:click="{
					() => changeLanguageTo('en')}">English
				</a>
			</div>
		</div>
	</div>

	<div class="row">

		<div class="four columns">
			<div class="child parameter-space-4">
				<label>
					<p class="parameter-title"
						style="text-align:left;">
						{translations.app.selectLocation}
					</p>
					<div class="parameter-text">
						{translations.app.locationDescription}
					</div>
				</label>
				<span class="parameter-text">
					<AutoComplete
						items={translations.countries}
						bind:selectedItem={selectedObject}
						labelFieldName="name"
					/>
				</span>
			</div>
		</div>

		<div class="four columns">
			<div class="child parameter-space-4">

				<label>
					<p class="parameter-title"
						style="text-align:left;">
					  {translations.app.infectionRate}
				    <span class="parameter" style="float:right;">{pctH}%</span>
					</p>
					<div class="parameter-text">
						{translations.app.infectionRateDescription}
					</div>
				</label>
				<input class="pointer u-full-width"
					type=range	bind:value={pctH}	min=1	max=99
					on:click={keepUpWithH} />

			</div>
		</div>

		<div class="four columns">
			<div class="child parameter-space-4">
				<label>
					<p class="parameter-title"
						style="text-align:left;">
						{translations.app.over60InfectionRate}
						<span class="parameter" style="float:right;">{pctH_60plus}%</span>
					</p>
					<div class="parameter-text">
						{translations.app.over60Description}
					</div>
				</label>

				<input
					class="pointer u-full-width"
					type=range
					bind:value={pctH_60plus}
					min={lowerBound}
					max={upperBound}
				/>
				<span class="parameter-text">
					{translations.app.proportionIsThen}
				</span>
				<span class="parameter">{pctH_below60}%</span>
				<span class="parameter-text">
					{translations.app.proportionIsThenDescription}
				</span>
			</div>
		</div>

	</div>

	<div class="row">
		<div class="twelve columns">

			<Tabs bind:activeTabValue={currentTab} items={tabItems} />
			{#if 0 === currentTab}
				<div class="row" in:fade="{{duration: durationIn}}" out:fade="{{duration: durationOut}}">
					<div class="twelve columns">
						<div class="child">
							<CompareByAge
								{infectedData} {infectedTitle}
								{infectedTitleListName} {infectedTitleListNumber}
								{deathsData} {deathsTitle}
								{deathsTitleListName} {deathsTitleListNumber} />
						</div>				
					</div>
				</div>
				<div class="row">
					<div class="one columns">
						<Square text={'60+'} color={'#43a2ca'}/>
						<Square text={'<60'} color={'#d4f0cd'}/>
					</div>
					<div class="ten columns"> 
						<div class="caption">
							<span class="parameter-text">
								{translations.app.basedOn}
								<span class="parameter">{translations.fatalityRisks[selectedSourceId].source}</span>
								{translations.app.basedOnContinued1}
								<span class="parameter">{rowsOfScenarios[0].loc}</span>
								{translations.app.basedOnContinued2}
							</span>
							<span class="emphasize-text">				
								{numberFormatter(totalInfected)}
							</span>
							<span class="parameter-text">
								{translations.app.basedOnContinued3}  
							</span>
							<span class="emphasize-text">								
								{numberFormatter(totalDeaths)}
							</span>
							<span class="parameter-text">
								{translations.app.basedOnContinued4}
							</span>
							<span class="emphasize-text">								
								{numberFormatter(totalYearsLost)}
							</span>	
							<span class="parameter-text">						
								{translations.app.basedOnContinued5}
								<span class="parameter">{selectedLocation}</span>.
							</span>
						</div>
					</div>
				</div>
			{/if}

			{#if 1 === currentTab}
				<div style="margin-top: 5px">
					<Subtabs bind:activeTabValue={currentCompare} items={compareItems} />
				</div>
				<div class="twelve columns" style="text-align: center; margin-top: 25px">
					<div class="child">
						<Compare compareData={compareList}
							{titleListMain} {titleListName} {titleListNumber} />
					</div>
				</div>
				<div class="row">
					<div class="two columns">
						<svg 
						width="{90}" height="{90}"
						style="background-color: white">
						</svg>
					</div>
					<div class="two columns">
						<Square text={'2020+'} color={'#fdc086'} factorWidth={4}/>
						<Square text={'2017'} color={'#beaed4'} factorWidth={4}/>
						<Square text={'<2020-05-27'} color={'#7fc97f'} factorWidth={6}/>
					</div>			
					<div class="eight columns">
						{#if 0 == currentCompare}
							<div class="caption">
								<div class="parameter-text"> 
									{translations.app.compareWithOtherCaption1}
								</div>
								<div class="parameter-text">
									 {translations.app.compareWithOtherCaption2}
									<a href="https://ourworldindata.org/causes-of-death">Our World in Data</a>
								</div>
								<div class="parameter-text">
									{translations.app.compareWithOtherCaption3}
									<a href="https://ourworldindata.org/coronavirus-data">Our World in Data</a>
								</div>
							</div>		
						{/if}
						{#if 1 == currentCompare}
							<div class="caption">
								<div class="parameter-text"> 
									{translations.app.compareWithOtherCaption1}
								</div>
								<div class="parameter-text">
									{translations.app.compareWithOtherCaption4}
									<a href="https://ourworldindata.org/grapher/burden-of-disease-by-cause">Our World in Data</a>
								</div>
								<div class="parameter-text">
									{translations.app.compareWithOtherCaption5}
									<a href="https://ourworldindata.org/coronavirus-data">Our World in Data</a>
									{translations.app.authorsCalculations}
								</div>
							</div>		
						{/if}
						{#if 2 == currentCompare}
							<div class="caption">
								<div class="parameter-text">
									{translations.app.compareWithOtherCaption1}
								</div>
								<div class="parameter-text">
									{translations.app.compareWithOtherCaption7}
									 <a href="https://ourworldindata.org/grapher/disease-burden-by-risk-factor">Our World in Data</a>
								</div>
								<div class="parameter-text">
									{translations.app.compareWithOtherCaption5}
									<a href="https://ourworldindata.org/coronavirus-data">Our World in Data</a>
									{translations.app.authorsCalculations}
								</div>
							</div>
						{/if}				
					</div>
				</div>
			{/if}

			{#if 2 === currentTab}
				<div class = "row" in:fade="{{duration: durationIn}}" out:fade="{{duration: durationOut}}">
					<Subtabs bind:activeTabValue={selectedRisk} items={mapItems} />
					<div class="twelve columns" style="text-align: center; margin-top: 25px">
						<div class="child">
							{#if 0 == selectedRisk}
								<div class='worldmap-title'
									style='font-size: 16;'>
									{translations.app.proportionOver60ByCountry}
								</div>
								<div class="child">
									<WorldMap {mapTitle} {selectedRisk} />
								</div>
							{/if}

							{#if 1 == selectedRisk}
								<div class='worldmap-title'
									style='font-size: 16;'>
									{translations.app.lowIncomeRiskByCountry}
								</div>
								<div class="child">
									<WorldMap {mapTitle} {selectedRisk} />
								</div>
							{/if}

							<div class='caption'>
								<div class="parameter-text">
										{translations.app.mapCaption}
								</div>
								<div class="parameter-text">
									{translations.app.source}
									<a href="https://github.com/topojson/world-atlas">World Atlas TopoJSON</a> 
									{translations.app.authorsCalculations}
								</div>
							</div>

						</div>
					</div>
				</div>
			{/if}

			{#if 3 === currentTab}
				<Subtabs bind:activeTabValue={currentPoverty} items={povertyItems} />
				{#if 0 == currentPoverty}
					<div class="twelve columns" style="text-align: center; margin-top: 25px">
						<div class="child">
								<Poverty compareData={povertyProjCountries}
												titleListMain={mainProjCountries}
												titleListName={nameProjCountries}
												titleListNumber={numberProjCountries}
												colorsList={colorsProjCountries} />
						</div>
					</div>
					<div class="row">
						<div class="one columns">
							<svg 
							width="{90}" height="{90}"
							style="background-color: white">
							</svg>
						</div>							
						<div class="three columns">
							<Square text={translations.app.southAsia} color={'#377eb8'} factorWidth={8}/>
							<Square text={translations.app.subSahAfrica} color={'#e41a1c'} factorWidth={8}/>
							<Square text={translations.app.eastAsiaPacific} color={'#4daf4a'} factorWidth={8}/>
						</div>
						<div class="eight columns">
							<div class='caption'>
								<div class='parameter-text'>
									{translations.app.projectedPovery}
								</div>
								<div class='parameter-text'>
									{translations.app.sources}
									<a href="https://www.imf.org/~/media/Files/Publications/WEO/2020/April/English/execsum.ashx?la=en">IFM</a>, 
									<a href="https://data.worldbank.org/indicator/SI.POV.DDA">POVCAL</a> 
									{translations.app.authorsCalculations}
								</div>
							</div>
						</div>
					</div>
				{/if}
				{#if 1 == currentPoverty}
					<div class="twelve columns" style="text-align: center; margin-top: 25px">
						<div class="child">				
								<Poverty compareData={povertyProjRegions}
												titleListMain={mainProjRegions}
												titleListName={nameProjRegions}
												titleListNumber={numberProjRegions}
												colorsList={colorsProjRegions}/>
						</div>
					</div>
					<div class="row">
						<div class="four columns">
							<svg 
							width="{90}" height="{90}"
							style="background-color: white">
							</svg>
						</div>
						<div class="eight columns">
							<div class='caption'>
								<div class='parameter-text'>
									{translations.app.projectedPovery}
								</div>
								<div class='parameter-text'>
									{translations.app.sources}
									<a href="https://www.imf.org/~/media/Files/Publications/WEO/2020/April/English/execsum.ashx?la=en">IFM</a>, 
									<a href="https://data.worldbank.org/indicator/SI.POV.DDA">POVCAL</a> 
									{translations.app.authorsCalculations}
								</div>
							</div>
						</div>
					</div>									
				{/if}
			{/if}

			{#if 4 === currentTab}
				<div class = "row" in:fade="{{duration: durationIn}}" out:fade="{{duration: durationOut}}">
					<div class="twelve columns">
						<div class="child">
							<Projections 
								projectionsTitle={projectionsTitle}
								projectionsXAxisLabel={projectionsXAxisLabel}
								projectionsYAxisLabel={projectionsYAxisLabel}
								language={language}
							/>
						</div>
					</div>
					<div class="row">
						<div class="one columns">
							<svg 
							width="{90}" height="{90}"
							style="background-color: white">
							</svg>
						</div>							
						<div class="three columns">
							<LineLegend text={projectionsLegendDeaths} 
								type={'continuous'} factorWidth={15}/>
							<LineLegend text={projectionsLegendDeathsProjected} 
								type={'dashed'} factorWidth={15}/>
						</div>
						<div class="eight columns">
							<div class='caption'>
								<div class='parameter-text'>
									{translations.app.projectionsCaption}
								</div>
								<div class='parameter-text'>
									{translations.app.source}
									<a href="http://www.healthdata.org/">IHME</a> 
								</div>
							</div>
						</div>
					</div>
				</div>
			{/if}

			{#if 5 == currentTab}
				<div class="row" in:fade="{{duration: durationIn}}" out:fade="{{duration: durationOut}}">
					<div class="twelve columns">
						<div class="child parameter-text">

							<div class="wtitle">
								Hypothetical COVID-19 Scenarios
							</div>
							<table class="table1">
								<thead>
									<tr>
										<th>{translations.app.location}</th>
										<th>{translations.app.fatalityRates}</th>
										<th>{translations.app.varyFRs}</th>
										<th>{translations.app.infectionRate}</th>
										<th>{translations.app.over60InfectionRate}</th>
										<th>{translations.app.over60InfectionRate}</th>
										<th>{translations.app.elimination}</th>
										<th>{translations.app.infectionUntil}</th>
										<th>{translations.app.infected}</th>
										<th>{translations.app.deaths}</th>
										<th>{translations.app.yrsOfLifeLost}</th>
										<th>{translations.app.yrsOfLifeLostCosts}</th>
										<th>{translations.app.scenariosDescription}</th>
									</tr>
								</thead>
								<tbody>
								{#each rowsOfScenarios as scenario}
									<tr>
										<td><span class="parameter">{scenario.loc}</span></td>
										<td><span class="parameter">{scenario.frs}</span></td>
										<td>{scenario.F}%</td>
										<td>{scenario.H}%</td>
										<td>{scenario.H_60}%</td>
										<td>{scenario.H_below}%</td>
										<td>{scenario.Elim}%</td>
										<td>{scenario.U}%</td>
										<td>{numberFormatter(scenario.totInf)}</td>
										<td>{numberFormatter(scenario.totDeaths)}</td>
										<td>{numberFormatter(scenario.yrsLifeLost)}</td>
										<td>${numberFormatter(scenario.yrsLifeLostCosts)}B</td>
										<td>{scenario.comments}
											{#if scenario.id > 2}
												<button
													class="button"
													on:click={deleteScenario(scenario.id)}>Delete
												</button>
											{/if}
										</td>
									</tr>
								{/each}
								<tr>
									<td><span class="parameter">{selectedLocation}</span></td>
									<td><span class="parameter">{translations.fatalityRisks[selectedSourceId].source}</span></td>
									<td><span class="parameter">{pctOfChange}%</span></td>
									<td><span class="parameter">{pctH}%</span></td>
									<td><span class="parameter">{pctH_60plus}%</span></td>
									<td><span class="parameter">{pctH_below60}%</span></td>
									<td><span class="parameter">{prElimTimes100}%</span></td>
									<td><span class="parameter">{pctU}%</span></td>
									<td><span class="parameter">{numberFormatter(totalInfected)}</span></td>
									<td><span class="parameter">{numberFormatter(totalDeaths)}</span></td>
									<td><span class="parameter">{numberFormatter(totalYearsLost)}</span></td>
									<td><span class="parameter">${numberFormatter(totalMoneyLost)}B</span></td>
									<td><input bind:value={desc}>
										<button class="button" on:click={addScenario}>Add</button>
									</td>
								</tr>
								</tbody>
							</table>
						</div>
						<div class="caption">
							<span class="parameter-text">

							</span>
						</div>

					</div>
				</div>
			{/if}

			{#if 6 == currentTab}
				<div class="row" in:fade="{{duration: durationIn}}" out:fade="{{duration: durationOut}}">
					<div class="twelve columns">
						<div class="child">

							<div class="wtitle">
								Example Interpretations
							</div>
							<table class="table2">
								<thead>
									<tr class="parameter-title">
										<th>Scenario 0: Do nothing, as a baseline</th>
										<th>Scenario 1: Decrease infection rate for people over 60
											and increase for those below 60</th>
										<th>Scenario 2: Increase the probability of elimination</th>
									</tr>
								</thead>
								<tbody>
								<tr>
									<td>
										<span class="parameter-text">
											If by the pandemic's end {rowsOfScenarios[0].H}%
											of all age groups are infected in:
											<span class="parameter">{rowsOfScenarios[0].loc}</span>.
											Then we can expect:
										</span>
										<span class="emphasize-text">
											{numberFormatter(rowsOfScenarios[0].totInf)}
										</span>
										<span class="parameter-text">
											infected.
										</span>
									</td>
									<td>
										<span class="parameter-text">
											If by the pandemic's end only {rowsOfScenarios[1].H_60}%
											of people over 60 have been infected.
											Then to compensate {rowsOfScenarios[1].H_below}%
											of people below 60 need to be infected to achieve
											the {rowsOfScenarios[1].H}% overall proportion of infected.
										</span>
									</td>
									<td>
										<span class="parameter-text">
											Say we manage to increase the probability
											of achieving COVID-19 elimination from 0
											to {rowsOfScenarios[2].Elim}%
											and say that {rowsOfScenarios[2].U}%
											of people get infected until elimination is achieved.
										</span>
									</td>
								</tr>
								<tr>
									<td>
										<span class="parameter-text">
											Based on selected fatality risks
											<span class="parameter">{translations.fatalityRisks[selectedSourceId].source}</span>
											and <span class="parameter">{rowsOfScenarios[0].loc}</span>'s age distribution
											we can expect:
										</span>
										<span class="emphasize-text">
											{numberFormatter(rowsOfScenarios[0].totDeaths)}
										</span>
										<span class="parameter-text">
											lifes lost.
										</span>
									</td>
									<td>
										<span class="parameter-text">
											Then we can expect to save:
											{numberFormatter(rowsOfScenarios[0].totDeaths)} -
											{numberFormatter(rowsOfScenarios[1].totDeaths)} =
										</span>
										<span class="emphasize-text">
											{numberFormatter(rowsOfScenarios[0].totDeaths - rowsOfScenarios[1].totDeaths)}
										</span>
										<span class="parameter-text">
											lifes or achieve
										</span>
										<span class="emphasize-text"> <!-- -100*( after/before - 1 ) = percent of decrease -->
											{ Math.round( -100*(rowsOfScenarios[1].totDeaths / rowsOfScenarios[0].totDeaths - 1) )}%
										</span>
										<span class="parameter-text">
											decrease in risk of death.
										</span>
									</td>
									<td>
										<span class="parameter-text">
											Then we can expect to save:
											{numberFormatter(rowsOfScenarios[0].totDeaths)} -
											{numberFormatter(rowsOfScenarios[2].totDeaths)} =
										</span>
										<span class="emphasize-text">
											{numberFormatter(rowsOfScenarios[0].totDeaths - rowsOfScenarios[2].totDeaths)}
										</span>
										<span class="parameter-text">
											lifes
											or achieve
										</span>
										<span class="emphasize-text">
											{ Math.round( -100*(rowsOfScenarios[2].totDeaths / rowsOfScenarios[0].totDeaths - 1) )}%
										</span>
										<span class="parameter-text">
											decrease in the risk of death.
										</span>
									</td>
								</tr>
								<tr>
									<td>
										<span class="parameter-text">
											Based on global life expectancies and number
											of deaths across age groups we can expect:
										</span>
										<span class="emphasize-text">
											{numberFormatter(rowsOfScenarios[0].yrsLifeLost)}
										</span>
										<span class="parameter-text">
											expected years of life lost.
											We can also estimate expected amount of money lost based on
											expected years of life lost:
										</span>
										<span class="emphasize-text">
											${numberFormatter(rowsOfScenarios[0].yrsLifeLostCosts)}B.
										</span>
									</td>
									<td>
										<span class="parameter-text">
											Since younger people have higher life expectancy than older people,
											increasing the proportion of infected people below 60, increases
											the number of deaths among young people.
											Based on selected fatality risks we can expect to save:
											{numberFormatter(rowsOfScenarios[0].yrsLifeLost)} -
											{numberFormatter(rowsOfScenarios[1].yrsLifeLost)} =
										</span>
										<span class="emphasize-text">
											{numberFormatter(rowsOfScenarios[0].yrsLifeLost - rowsOfScenarios[1].yrsLifeLost)}
										</span>
										<span class="parameter-text">
											years of potential life or achieve
										</span>
										<span class="emphasize-text"> <!-- -100*( after/before - 1 ) = percent of decrease -->
											{Math.round( 100 * rowsOfScenarios[1].yrsLifeLost / rowsOfScenarios[0].yrsLifeLost )}%
										</span>
										<span class="parameter-text">
											decrease in expected years of life lost.
										</span>
									</td>
									<td>
										<span class="parameter-text">
											Based on expected years of life lost
											we can expect to save:
											${numberFormatter(rowsOfScenarios[0].yrsLifeLostCosts)}B -
											${numberFormatter(rowsOfScenarios[2].yrsLifeLostCosts)}B =
										</span>
										<span class="emphasize-text">
											${numberFormatter(rowsOfScenarios[0].yrsLifeLostCosts - rowsOfScenarios[2].yrsLifeLostCosts)}B.
										</span>
										<span class="parameter-text">
											This is also a crude estimate of what a society could aim to invest in
											such a life-saving treatments (e.g. development of vaccines)
											or life-saving interventions (e.g. social distancing).
										</span>
									</td>
								</tr>
								</tbody>
							</table>
						</div>
						<div class="caption">
							<span class="parameter-text">
								Estimates should be interpreted with caution.
								This tool is focused on simple presentation and pedagogical aspects
								and only offers crude estimates. It uses relatively simplistic
								methodology outlined in the Notes below.
							</span>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="row">
		<div class="four columns">
			<div class="child parameter-space-4">

				<label>
					<p class="parameter-title"
						style="text-align:left;">
						{translations.app.fatalityRates}
					</p>
					<div class="parameter-text">
						{translations.app.fatalityRatesDescription}
					</div>
				</label>
				<span class="parameter-text">
					<AutoComplete
						items={translations.fatalityRisks}
						bind:selectedItem={selectedSourceObject}
						labelFieldName="source"
					/>
				</span>
				<span class="parameter-text">

				</span>
			</div>
		</div>
		<div class="four columns">
			<div class="child parameter-space-4">
				<label>
					<p class="parameter-title"
						style="text-align:left;">
						{translations.app.varyFRs}
						<span class="parameter" style="float:right;">{pctOfChange}%</span>
					</p>
					<div class="parameter-text">
							<span class="parameter-text">
								{translations.app.varyFRsDescription1}
							</span>
							<span class="parameter-text">
								{translations.app.varyFRsDescription2}					
							</span>
					</div>
				</label>
				<input class="u-full-width" type=range
					bind:value={pctOfChange} min=-100 max=100/>
			</div>
		</div>
		<div class="four columns">
			<div class="child parameter-space-4">
				<div class="button-class">
					<button class="button" on:click={resetParameters}>{translations.app.reset}
					</button>
				</div>
				<span class="parameter-text">
					{translations.app.resetDescription}
				</span>
			</div>
		</div>
	</div>

	<div class="row">
		<div class="four columns">
			<div class="child parameter-space-4">
				<label>
					<p class="parameter-title"
						style="text-align:left;">
						{translations.app.elimination}
						<span class="parameter" style="float:right;">{prElimTimes100}%</span>
					</p>
					<div class="parameter-text">
						<span class="parameter-text">
							{translations.app.eliminationDescription1}
						</span>
						<span class="parameter">
							{Math.round(pctH)}%
						</span>
						<span class="parameter-text">
							{translations.app.eliminationDescription2}
						</span>
					</div>
				</label>
				<input class="pointer u-full-width" type=range
					bind:value={prElimTimes100} min=0	max=100	/>
			</div>
		</div>
		<div class="four columns">
			<div class="child parameter-space-4">
				<label>
					<p class="parameter-title"
						style="text-align:left;">
							{translations.app.infectionUntil}
						<span class="parameter" style="float:right;">{pctU}%</span>
					</p>
					<div class="parameter-text">
							{translations.app.infectionUntilDescription}
					</div>
				</label>
				<input class="pointer u-full-width"	type=range
					bind:value={pctU} min={0}	max={pctH} />
			</div>
		</div>
		<div class="four columns">
			<div class="child parameter-space-4">
				{#if userNeeds.exportData}
					<button class="button-class" on:click={
						toggleExportData}>
						{translations.app.hideExport}
					</button>
				{/if}
				{#if !userNeeds.exportData}
					<button class="button-class"
					on:click={toggleExportData}>
						{translations.app.export}
					</button>
				{/if}
				<span	class="parameter-text">
						{translations.app.exportDescription}
				</span>
		</div>
	</div>
	{#if userNeeds.exportData}
		<div class="row" in:fly="{{duration: 800}}" out:fly="{{duration: 800}}">
			<div class="twelve columns">
				<textarea bind:value={exportedData}></textarea>
			</div>
		</div>
	{/if}

		<div class="row">
			<div class="twelve columns">
				<div class="child parameter-text"> 
					<div class="wtitle">About</div>
					<p>
						At the time of writing, the impacts of COVID-2019 
						remain largely uncertain and depend on a whole range of possibilities.

						Organizing the overwhelming mass of the available information in the media and literature, 
						coming up with a reasonable working estimates and comparing multiple scenarios can be challenging.

						As an attempt to address this problem I used publicly available data and published information 
						to create this international tool that allows users to derive their own country-specific estimates.
					</p>
					<p>
						Please send me feedback:
						<a href="https://twitter.com/MarkoLalovic/status/1266022718035632128">here</a>.
						
						or email me:
						<a href="mailto:marko.lalovic@yahoo.com?Subject=COVID%20analyzer" target="_top">here</a>.
					</p>
					<p>
						For technical details please refer to:
						<a href="notes.html">notes</a>
						
						or the:
						<a href="https://github.com/markolalovic/covid-calc">source code</a>.
					</p>

					<div class="wtitle">Acknowledgements</div>
					<p>
						Tjaša Kovačević for help with the calculation of expected years of life lost and economic impacts on poverty.
					</p>
					<!-- TODO: references here? -->
				</div>
			</div>
		</div>
</main>


<style type="text/css">
	.pointer {
		cursor: pointer; /* for a hand simbol on slider and maybe tooltips? */
	}
	.row {
		margin-bottom: 5px;
		line-height: 16px;
		font-family: 'Roboto', sans-serif;
	}
	.child {
		margin-left: 2px;
		margin-right: 2px;
	}
	.caption {
		margin-bottom: 20px;
		line-height: 20px;
	}
	.parameter-space-4 {
		padding: 2px 10px 10px 10px;
  	height: auto;
		min-height: 130px;
	}
	table.table1 {
		border-spacing: 0;
		border-collapse: collapse;
	}
	table.table2 {
		border-spacing: 0;
		border-collapse: collapse;
	}
	table.table1 th {
		width:150px;
		padding:5px
	}
	table.table1 td {
		width:150px;
		padding:5px
	}
	.parameter-text {
		font-family: 'Roboto', sans-serif;
    font-weight: 400;
		font-size: 12px;
	}
	.parameter {
		color: #ff3e00;
		font-family: 'Roboto', sans-serif;
		font-weight: 1100;
		font-size: 14px;
		font-style: bold;
	}
	.parameter-title {
		font-family: 'Roboto', sans-serif;
    font-weight: 1100;
		font-size: 14px;
		font-style: bold;
		color: rgba(72,72,72,1);
	}
	.emphasize-text {
		font-family: 'Roboto', sans-serif;
		font-size: 13px;
		font-weight:bold;
	}
	button {
		background-color: rgba(221, 221, 221, 0.8);
		font-family: 'Roboto', sans-serif;
		text-transform: none;
		font-size: 12px;
		display: block;
		padding: 0px 30px;
	}
	.button {
		margin-top: 12px;
		font-family: 'Roboto', sans-serif;
		font-size: 12px;
		text-transform: none;
		background-color: rgba(221, 221, 221, 0.8);
	}
	.title {
		margin-top: 10px;
    font-weight: 400;
		font-family: 'Roboto', sans-serif;
		color: rgba(72,72,72,1);
	}
	.wtitle {
		margin-top: 25px;
		margin-bottom: 10px;
		font-weight: 800;
		font-family: 'Roboto', sans-serif;
		color: rgba(72,72,72,1);
		font-size: 17px;
	}
	.worldmap-title {
		margin-top: 5px;
		margin-bottom: 5px;
		font-weight: 800;
		font-family: 'Roboto', sans-serif;
		color:rgba(72,72,72,1);
		font-size: 17px;
	}
	.lang-link {
		margin-top: 10px;
		font-family: 'Roboto', sans-serif;
		font-size: 14px;
  	padding: 0px 10px;
	}
	textarea {
		width: 100%;
		height: 200px;
	}
</style>