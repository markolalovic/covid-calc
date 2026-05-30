window.MortalityByAge = (() => {
  let lastResults = null;
  let isReady = false;
  let renderScheduled = false;
  let pendingRenderOptions = {};

  const defaults = {
    country: "World",
    sourceId: "0",
    pctH: 30,
    pctH_60plus: 30,
    pctOfChange: 0,
    prElimTimes100: 0,
    pctU: 0,
    view: "deaths"
  };

  function tooltipNumber(value) {
    return d3.format(",.0f")(value);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setControlValue(name, value) {
    const el = document.querySelector(`[data-name="${name}"]`);

    if (!el) {
      return;
    }

    el.value = value;
  }

  function updateControlLabels(results) {
    d3.select("#pctH-value").text(`${state.pctH}%`);
    d3.select("#pctH_60plus-value").text(`${state.pctH_60plus}%`);
    d3.select("#pctOfChange-value").text(`${state.pctOfChange}%`);
    d3.select("#prElimTimes100-value").text(`${state.prElimTimes100}%`);
    d3.select("#pctU-value").text(`${state.pctU}%`);

    const below60 = Number.isFinite(results.pctH_below60)
      ? `${Math.round(results.pctH_below60)}%`
      : "not available";

    d3.select("#pctH_below60-value").text(below60);
  }

  function updateDynamicBounds() {
    const demographics = getSelectedDemographics();
    const popSize = d3.sum(demographics);
    const d_60plus = (demographics[6] + demographics[7] + demographics[8]) / popSize;

    const lowerBound = Math.ceil(
      Math.max(1, (state.pctH - 100 * (1 - d_60plus)) / d_60plus)
    );

    const upperBound = Math.floor(
      Math.min(state.pctH / d_60plus, 99)
    );

    state.pctH_60plus = clamp(Number(state.pctH_60plus), lowerBound, upperBound);

    const over60 = document.querySelector("#control-pctH_60plus");

    if (over60) {
      over60.min = lowerBound;
      over60.max = upperBound;
      over60.value = state.pctH_60plus;
    }

    state.pctU = clamp(Number(state.pctU), 0, Number(state.pctH));

    const until = document.querySelector("#control-pctU");

    if (until) {
      until.max = state.pctH;
      until.value = state.pctU;
    }
  }

  const ageGroups = [
    "0-9",
    "10-19",
    "20-29",
    "30-39",
    "40-49",
    "50-59",
    "60-69",
    "70-79",
    "80+"
  ];

  const fatalitySources = {
    0: {
      source: "Imperial College - IFR",
      ftr: [0.002, 0.006, 0.03, 0.08, 0.15, 0.6, 2.2, 5.1, 9.3]
    },
    1: {
      source: "China CDC - CFR",
      ftr: [0, 0.2, 0.2, 0.2, 0.4, 1.3, 3.6, 8, 14.8]
    },
    2: {
      source: "Korea CDC - CFR",
      ftr: [0, 0, 0, 0.11, 0.08, 0.5, 1.8, 6.3, 13]
    },
    3: {
      source: "JAMA Italy - CFR",
      ftr: [0, 0, 0, 0.3, 0.4, 1, 3.5, 12.8, 20.2]
    },
    4: {
      source: "MISAN Spain - CFR",
      ftr: [0, 0, 0.22, 0.14, 0.3, 0.4, 1.9, 4.8, 15.6]
    }
  };

  const lifeExpectanciesGlobal = [
    71.625,
    62.95,
    53.55,
    44.4,
    35.375,
    26.625,
    18.6,
    11.95,
    6.975
  ];

  const state = {
    country: "World",
    sourceId: "0",
    pctH: 30,
    pctH_60plus: 30,
    pctOfChange: 0,
    prElimTimes100: 0,
    pctU: 0,
    view: "deaths"
  };

  let demographicsData = null;

  const colors = [
    "#E6A35C", // fallback / estimate if ever needed
    "#B3DCB8", // <60, soft green
    "#5EA0C6"  // 60+, blue
  ];

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

  function ageType(ageGroup) {
    return ageGroup === "60-69" || ageGroup === "70-79" || ageGroup === "80+"
      ? "over60"
      : "below60";
  }

  function getSelectedDemographics() {
    if (!demographicsData) {
      throw new Error("Demographics data has not loaded yet.");
    }

    const demographics = demographicsData.countries[state.country];

    if (!demographics) {
      const available = Object.keys(demographicsData.countries).slice(0, 10).join(", ");
      throw new Error(
        `No demographics found for "${state.country}". Available examples: ${available}`
      );
    }

    return demographics;
  }

  function calculate() {
    const demographics = getSelectedDemographics();

    const popSize = d3.sum(demographics);
    const d_60plus = (demographics[6] + demographics[7] + demographics[8]) / popSize;

    const pctH = Number(state.pctH);
    const pctH_60plus = Number(state.pctH_60plus);
    const pctOfChange = Number(state.pctOfChange);
    const prElim = Number(state.prElimTimes100) / 100;
    const pctU = Math.min(Number(state.pctU), pctH);

    const pctH_below60 =
      (pctH - pctH_60plus * d_60plus) / (1 - d_60plus);

    const pctU_60plus = pctH === 0 ? 0 : (pctH_60plus / pctH) * pctU;

    const pctU_below60 =
      (pctU - pctU_60plus * d_60plus) / (1 - d_60plus);

    const source = fatalitySources[state.sourceId] || fatalitySources[0];

    const fatalities = source.ftr.map((fat) => {
      return fat * (1 + pctOfChange / 100);
    });

    const infected = demographics.map((population, i) => {
      if (i < 6) {
        return Math.round(
          prElim * population * pctU_below60 / 100 +
          (1 - prElim) * population * pctH_below60 / 100
        );
      }

      return Math.round(
        prElim * population * pctU_60plus / 100 +
        (1 - prElim) * population * pctH_60plus / 100
      );
    });

    const deaths = infected.map((infectedAgeGroup, i) => {
      return Math.round(infectedAgeGroup * fatalities[i] / 100);
    });

    const yearsLost = deaths.map((deathsAgeGroup, i) => {
      return Math.round(deathsAgeGroup * lifeExpectanciesGlobal[i]);
    });

    const infectedData = infected.map((number, i) => ({
      name: ageGroups[i],
      number,
      type: ageType(ageGroups[i])
    }));

    const deathsData = deaths.map((number, i) => ({
      name: ageGroups[i],
      number,
      type: ageType(ageGroups[i])
    }));

    return {
      demographics,
      popSize,
      d_60plus,
      pctH_below60,
      fatalities,
      infected,
      deaths,
      yearsLost,
      infectedData,
      deathsData,
      totalInfected: d3.sum(infected),
      totalDeaths: d3.sum(deaths),
      totalYearsLost: d3.sum(yearsLost),
      source
    };
  }

  // helper for small screen shift to mobile
  function interpolateAgeLayout(width) {
    const minWidth = 520;
    const maxWidth = 820;

    const t = Math.max(
      0,
      Math.min(1, (width - minWidth) / (maxWidth - minWidth))
    );

    return {
      left: Math.round(70 + 20 * t),
      right: Math.round(115 + 65 * t),
      rightColumnOffset: Math.round(160 + 30 * t)
    };
  }  

  function renderVisualList(
    svgSelector,
    dataList,
    title,
    titleListName,
    titleListNumber,
    options = {}
  ) {
    // const svg = d3.select(svgSelector);
    const { svg, width } = window.ResponsiveSvg.configure(svgSelector, {
      minWidth: 340,
      maxWidth: 780,
      height: 350
    });

    const layout = interpolateAgeLayout(width);

    const renderedWidth = svg.node().getBoundingClientRect().width || width;
    const scale = renderedWidth / width;
    const chartLeft = Math.round(layout.left * scale);

    d3.select("#mortality-by-age-chart")
      .style("--chart-left", `${chartLeft}px`);

    d3.select("#mortality-inline-legend")
      .style("--chart-rendered-width", `${renderedWidth}px`)
      .style("--chart-left", `${chartLeft}px`);

    d3.select("#mortality-summary")
      .style("--chart-rendered-width", `${renderedWidth}px`)
      .style("--chart-left", `${chartLeft}px`);

    if (options.reset) {
      svg.interrupt();
      svg.selectAll("*").interrupt();
      svg.selectAll("*").remove();
    }

    const duration =
      options.interactive ? 40 :
      options.reset ? 200 :
      120;

    svg.call(window.visualList, {
      dataList,
      titleListName,
      titleListNumber,
      titleListMain: title,
      sortList: false,
      reverseRange: true,
      rightColumnOffset: layout.rightColumnOffset,
      xValue: (d) => d.number,
      yValue: (d) => d.name,
      tooltipText: (d) => {
        const measure =
          state.view === "deaths"
            ? "Estimated number of deaths"
            : "Estimated number of infected";

        return `${d.name}
    ${measure}: ${tooltipNumber(d.number)}`;
      },
      margin: {
        top: 70,
        right: layout.right,
        bottom: 0,
        left: layout.left
      },
      barPadding: 0.2,
      verticalSpacing: 55,
      transitionDuration: duration,
      barTransitionDuration: duration,
      colors
    });
  }

  function renderLegend(results) {
    d3.select("#legend")
      .classed("risk-legend", false)
      .html(`
        <li><span class="legend-swatch below60"></span> Below 60</li>
        <li><span class="legend-swatch over60"></span> 60+</li>
        <li><strong>Fatality rates:</strong> ${results.source.source}</li>
        <li><strong>Population:</strong> ${numberFormatter(results.popSize)}</li>
      `);
  }

  // fixing text and alignment
  function renderInlineLegend(results) {
    const measureText =
      state.view === "deaths"
        ? "deaths"
        : "infections";

    d3.select("#mortality-inline-legend").html(`
      <div class="chart-legend-row">
        <span class="legend-swatch over60"></span>
        <span>
          <strong>60+</strong> Estimated COVID-19 ${measureText} for people over the age of 60 under the currently selected assumptions.
        </span>
      </div>
      <div class="chart-legend-row">
        <span class="legend-swatch below60"></span>
        <span>
          <strong>&lt;60</strong> Estimated COVID-19 ${measureText} for people under the age of 60 under the currently selected assumptions.
        </span>
      </div>
    `);
  }

  function bindAgeDistributionTabs() {
    d3.selectAll("[data-age-view]").on("click.mortalityByAge", function (event) {
      event.preventDefault();

      state.view = this.dataset.ageView;

      d3.selectAll(".age-distribution-subtabs li")
        .classed("active", false);

      d3.select(this.parentNode)
        .classed("active", true);

      safeRender({ reset: true });
    });
  }

  function render(options = {}) {
    const results = calculate();

    lastResults = results;

    const ageChartVisible =
      d3.select("#mortality-by-age-chart").style("display") !== "none";

    // fix legend
    if (ageChartVisible) {
      if (state.view === "infected") {
        renderVisualList(
          "svg.age-distribution",
          results.infectedData,
          `Expected Number of Infected by Age in ${state.country}`,
          "Age",
          "Infected",
          options
        );
      } else {
        renderVisualList(
          "svg.age-distribution",
          results.deathsData,
          `Expected Number of Deaths by Age in ${state.country}`,
          "Age",
          "Deaths",
          options
        );
      }

      renderInlineLegend(results);
    }

    updateControlLabels(results);

    document.dispatchEvent(new CustomEvent("covid:estimatechange", {
      detail: {
        state: { ...state },
        results
      }
    }));
  }

  function readControls() {
    d3.selectAll("#shared-covid-controls .covid-control").each(function () {
      const name = this.dataset.name;

      if (!name || !(name in state)) {
        return;
      }

      if (this.type === "range") {
        state[name] = Number(this.value);
      } else {
        state[name] = this.value;
      }
    });
  }

  function bindControls() {
    d3.select("#control-pctH").on("input.mortalityByAge", function () {
      state.pctH = Number(this.value);

      // when the main infection rate changes, the over-60 rate follows it.
      state.pctH_60plus = Math.round(state.pctH);

      if (state.pctU > state.pctH) {
        state.pctU = state.pctH;
      }

      setControlValue("pctH_60plus", state.pctH_60plus);
      setControlValue("pctU", state.pctU);

      scheduleSafeRender({ interactive: true });
    });

    d3.selectAll("#shared-covid-controls .covid-control")
      .filter(function () {
        return this.id !== "control-pctH";
      })
      .on("input.mortalityByAge change.mortalityByAge", function () {
        readControls();
        scheduleSafeRender({ interactive: true });
      });

    d3.select("#reset-mortality-controls").on("click.mortalityByAge", () => {
      Object.assign(state, defaults);

      Object.entries(defaults).forEach(([name, value]) => {
        if (name !== "view") {
          setControlValue(name, value);
        }
      });

      d3.selectAll(".age-distribution-subtabs li")
        .classed("active", false);

      // default subtab: deaths
      d3.select('.age-distribution-subtabs [data-age-view="deaths"]')
        .each(function () {
          d3.select(this.parentNode).classed("active", true);
      });

      safeRender({ reset: true });
    });
  }

  function safeRender(options = {}) {
    try {
      updateDynamicBounds();
      render(options);
    } catch (error) {
      console.error(error);
      d3.select("#mortality-summary").text(error.message);
    }
  }

  function scheduleSafeRender(options = {}) {
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

      safeRender(options);
    });
  }

  async function loadData() {
    demographicsData = await d3.json("data/demographics.json");

    const countryNames = Object.keys(demographicsData.countries || {});

    if (!countryNames.length) {
      throw new Error(
        "No countries found in data/demographics.json. Re-run bin/prepare-mortality-by-age.py after copying population pyramid CSVs."
      );
    }

    const ordered = [
      "World",
      ...countryNames.filter((name) => name !== "World")
    ];

    const countrySelect = d3.select("#control-country");

    countrySelect
      .selectAll("option")
      .data(ordered)
      .join("option")
      .attr("value", (d) => d)
      .text((d) => d);

    state.country = ordered.includes("World") ? "World" : ordered[0];
    countrySelect.property("value", state.country);
  }

  async function init() {
    await loadData();
    bindControls();
    bindAgeDistributionTabs();
    readControls();
    safeRender({ reset: true });

    isReady = true;

    document.dispatchEvent(new CustomEvent("covid:mortalityready"));
  }

  return {
    init,
    render,
    getState: () => ({ ...state }),
    getResults: () => lastResults,
    isReady: () => isReady
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  window.MortalityByAge.init().catch((error) => {
    console.error(error);
    d3.select("#mortality-summary").text(error.message);
  });
});