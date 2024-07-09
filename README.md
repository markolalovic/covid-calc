The source code for COVID Calculator - A visual tool to explore and analyze the potential impacts of COVID-19

Link to the tool: [https://covidcalc.pages.dev/](https://covidcalc.pages.dev/)

---

## How-to
Data - the tool comes preloaded with all the data for visualizations: see the python scripts in src directory.

App.svelte - main component for the user interface made in [Svelte](https://svelte.dev):

* imports data from stores.js previously created by prepare_*_data.py scripts
* reactively calculates estimates for chosen parameters

Visualizations are made using D3 and live in separate Svelte components.

Compile in order to convert it to JavaScript.

*Note that you will need to have [Node.js](https://nodejs.org) installed.*

## Local build

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
