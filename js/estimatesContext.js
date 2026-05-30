window.EstimatesContext = (() => {
  let contextData = null;
  let renderScheduled = false;
  let pendingRenderOptions = {};

  const state = {
    view: "causesOfDeath"
  };

  const colors = [
    "#E6A35C", // COVID-19 estimate, orange
    "#B7A6D1", // comparison item, lavender
    "#B7A6D1"  // fallback
  ];

  const configs = {
    causesOfDeath: {
      title: "Causes of Death",
      estimateUnit: "Deaths",
      estimateValue: (results) => results.totalDeaths,
      titleListName: "Cause",
      titleListNumber: "Deaths",
      note: "Deaths due to other causes are for 2017."
    },
    causesOfYearsLost: {
      title: "Causes of Years of Life Lost",
      estimateUnit: "Yrs of Life Lost",
      estimateValue: (results) => results.totalYearsLost,
      titleListName: "Cause",
      titleListNumber: "Yrs of Life Lost",
      note: "Years of life lost comparison items are based on 2016 disease-burden data."
    },
    riskFactorsYearsLost: {
      title: "Risk Factors in Years of Life Lost",
      estimateUnit: "Yrs of Life Lost",
      estimateValue: (results) => results.totalYearsLost,
      titleListName: "Risk",
      titleListNumber: "Yrs of Life Lost",
      note: "Risk-factor comparison items are based on 2016 disease-burden data."
    }
  };

  function tooltipNumber(value) {
    return d3.format(",.0f")(value);
  }

  function numberWithCommas(x) {
    return Math.round(x)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function numberISO(x) {
    return d3.format(".3s")(x).replace("G", "B");
  }

  function numberFormatter(x) {
    if (Math.abs(x) < 1_000_000) {
      return numberWithCommas(x);
    }

    return numberISO(x);
  }

  function getCountryData(country) {
    if (!contextData || !contextData.countries) {
      return null;
    }

    return contextData.countries[country] || contextData.countries.World || null;
  }

  function buildCompareData(results, mortalityState) {
    const config = configs[state.view];
    const country = mortalityState.country;
    const countryData = getCountryData(country);

    if (!countryData) {
      throw new Error(`No context data found for ${country}.`);
    }

    const comparisonItems = countryData[state.view] || [];

    const covidEstimate = {
      name: "COVID-19 (estimate)",
      number: Math.round(config.estimateValue(results)),
      type: "estimate"
    };

    return [
      covidEstimate,
      ...comparisonItems.map((d) => ({
        name: d.name,
        number: d.number,
        type: "other"
      }))
    ];
  }

  // helper for small screen change to mobile
  function interpolateLayout(width) {
    const minWidth = 520;
    const maxWidth = 900;

    const t = Math.max(
      0,
      Math.min(1, (width - minWidth) / (maxWidth - minWidth))
    );

    return {
      left: Math.round(55 + 25 * t),
      right: Math.round(140 + 90 * t),
      rightColumnOffset: Math.round(185 + 75 * t)
    };
  }

  function renderVisualList(compareData, mortalityState, options = {}) {
    const config = configs[state.view];

    // const svg = d3.select("svg.compare");
    const { svg, width } = window.ResponsiveSvg.configure("svg.compare", {
      minWidth: 360,
      maxWidth: 900,
      height: 420
    });

    const layout = interpolateLayout(width);

    const renderedWidth = svg.node().getBoundingClientRect().width || width;
    const scale = renderedWidth / width;
    const chartLeft = Math.round(layout.left * scale);

    d3.select("#estimates-context-chart")
      .style("--chart-left", `${chartLeft}px`);

    d3.select("#estimates-context-inline-legend")
      .style("--chart-rendered-width", `${renderedWidth}px`)
      .style("--chart-left", `${chartLeft}px`);

    d3.select("#estimates-context-summary")
      .style("--chart-rendered-width", `${renderedWidth}px`)
      .style("--chart-left", `${chartLeft}px`);

    if (options.reset) {
      svg.interrupt();
      svg.selectAll("*").interrupt();
      svg.selectAll("*").remove();
    }

    const rowDuration =
      options.interactive ? 300 :
      options.reset ? 200 :
      160;

    const barDuration =
      options.interactive ? 40 :
      options.reset ? 200 :
      120;

    svg.call(window.visualList, {
      dataList: compareData,
      titleListName: config.titleListName,
      titleListNumber: config.titleListNumber,
      titleListMain: `COVID-19 vs. ${config.title} in ${mortalityState.country}`,
      sortList: true,
      reverseRange: false,
      rightColumnOffset: layout.rightColumnOffset,
      xValue: (d) => d.number,
      yValue: (d) => d.name,
      tooltipText: (d) => {
        if (state.view === "causesOfDeath") {
          return `${d.name}
    Estimated number of deaths: ${tooltipNumber(d.number)}`;
        }

        return `${d.name}
    Estimated years of life lost: ${tooltipNumber(d.number)}`;
      },
      margin: {
        top: 70,
        right: layout.right,
        bottom: 0,
        left: layout.left
      },
      barPadding: 0.2,
      verticalSpacing: 55,
      transitionDuration: rowDuration,
      barTransitionDuration: barDuration,
      colors
    });
  }

  // new render summary
  function renderSummary(compareData, results, mortalityState) {
    const config = configs[state.view];

    let comparisonText;

    if (state.view === "causesOfDeath") {
      comparisonText = "Comparison deaths due to other causes are for the year of 2017.";
    } else if (state.view === "causesOfYearsLost") {
      comparisonText = "Comparison years of life lost due to other causes are for the year of 2016.";
    } else {
      comparisonText = "Comparison years of life lost due to other risk factors are for the year of 2016.";
    }

    const covidText =
      state.view === "causesOfDeath"
        ? "Estimated COVID-19 deaths under the currently selected assumptions."
        : "Estimated COVID-19 years of life lost under the currently selected assumptions.";

    d3.select("#estimates-context-inline-legend").html(`
      <div class="chart-legend-row">
        <span class="legend-swatch covid-estimate"></span>
        <span>${covidText}</span>
      </div>
      <div class="chart-legend-row">
        <span class="legend-swatch context-other"></span>
        <span>${comparisonText}</span>
      </div>
    `);

    // d3.select("#estimates-context-summary").html(`
    //   <span class="parameter-text">
    //     Adjust the parameters to update the COVID-19 estimate in context.
    //   </span>
    // `);
  }

  function render(options = {}) {
    if (!contextData) {
      return;
    }

    if (
      !window.MortalityByAge ||
      !window.MortalityByAge.isReady ||
      !window.MortalityByAge.isReady()
    ) {
      return;
    }

    const results = window.MortalityByAge.getResults();
    const mortalityState = window.MortalityByAge.getState();

    if (!results || !mortalityState) {
      return;
    }

    const compareData = buildCompareData(results, mortalityState);

    renderVisualList(compareData, mortalityState, options);
    renderSummary(compareData, results, mortalityState);
  }

  function scheduleRender(options = {}) {
    pendingRenderOptions = {
      ...pendingRenderOptions,
      ...options
    };

    if (renderScheduled) {
      return;
    }

    renderScheduled = true;

    requestAnimationFrame(() => {
      const options = pendingRenderOptions;

      renderScheduled = false;
      pendingRenderOptions = {};

      render(options);
    });
  }

  function bindSubtabs() {
    d3.selectAll("[data-context-view]").on("click.estimatesContext", function (event) {
      event.preventDefault();

      state.view = this.dataset.contextView;

      d3.selectAll(".estimates-context-subtabs li")
        .classed("active", false);

      d3.select(this.parentNode)
        .classed("active", true);

      render({ reset: true });
    });
  }

  function bindEstimateChanges() {
    document.addEventListener("covid:estimatechange", () => {
      const isVisible =
        d3.select("#estimates-context-chart").style("display") !== "none";

      if (isVisible) {
        scheduleRender({ interactive: true });
      }
    });
  }

  function bindMortalityReady() {
    document.addEventListener("covid:mortalityready", () => {
      render({ reset: true });
    });
  }

  async function loadData() {
    contextData = await d3.json("data/estimates-context.json");
  }

  async function init() {
    await loadData();
    bindSubtabs();
    bindEstimateChanges();
    bindMortalityReady();
    render({ reset: true });
  }

  return {
    init,
    render
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  window.EstimatesContext.init().catch((error) => {
    console.error(error);
    d3.select("#estimates-context-summary").text(error.message);
  });
});