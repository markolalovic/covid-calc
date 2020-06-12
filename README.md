The source code for COVID Calculator - A visual tool to explore and analyze the potential impacts of COVID-19

Link to the tool:
[https://markolalovic.github.io/covid-calc/](https://markolalovic.github.io/covid-calc/)

---


## Prepare Data
In src directory there are 8 python scripts to prepare the data:

* prepare-demographics-data.py
* prepare-compare-data.py
* prepare-map-data.py
* prepare-poverty-data.py
* prepare-projections-data.py
* prepare-app-data.py
* prepare-translations.py
* prepare-svelte-data.py

so the tool comes preloaded with all the data for visualizations.


## Tool
App.svelte - main component for the user interface made in [Svelte](https://svelte.dev):

* imports data from stores.js previously created by prepare_*_data.py scripts
* reactively calculates estimates for chosen parameters

Visualizations are made using D3 and live in separate Svelte components.

Compile in order to convert it to JavaScript.

*Note that you will need to have [Node.js](https://nodejs.org) installed.*


## Get started

Install the dependencies...

```bash
cd covid-calc
npm install
```

...then start [Rollup](https://rollupjs.org):

```bash
npm run dev
```

Navigate to [localhost:5000](http://localhost:5000). You should see the app running. 


## Building and running in production mode

To create an optimised version of the app:

```bash
npm run build
```
