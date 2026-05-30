window.RisksByCountry = (() => {
  let features = null;
  let selectedColorValue = null;
  let zoomBehavior = null;

  const state = {
    view: "prop"
  };

  // new configs
  const configs = {
    prop: {
      title: "Proportion of people over 60 by Country",
      valueLabel: "People over 60",
      value: (d) => d.properties.prop || "No data",

      domain: [">20%", "10- 20%", "5- 10%", "<5%", "No data"],

      labels: {
        ">20%": "1. > 20%",
        "10- 20%": "2. 10 - 20%",
        "5- 10%": "3. 5 - 10%",
        "<5%": "4. < 5%",
        "No data": "No data"
      },

      colors: [
        "rgb(166,97,26)",   // >20%
        "rgb(223,194,125)", // 10-20%
        "rgb(128,205,193)", // 5-10%
        "rgb(1,133,113)",   // <5%
        "darkgrey"          // No data
      ]
    },

    income_grp: {
      title: "Low Income Risk by Country",
      valueLabel: "Income group",
      value: (d) => d.properties.income_grp || "No data",

      // incomeLegend:
      domain: [
        "1. Low income",
        "2. Lower middle income",
        "3. Upper middle income",
        "4. High income",
        "No data"
      ],

      labels: {
        "1. Low income": "1. Low income",
        "2. Lower middle income": "2. Lower middle income",
        "3. Upper middle income": "3. Upper middle income",
        "4. High income": "4. High income",
        "No data": "No data"
      },

      colors: [
        "rgb(166,97,26)",   // 1. Low income
        "rgb(223,194,125)", // 2. Lower middle income
        "rgb(128,205,193)", // 3. Upper middle income
        "rgb(1,133,113)",   // 4. High income
        "darkgrey"          // No data
      ]
    }
  };  

  function normalizeIso(value) {
    if (value === undefined || value === null) {
      return "";
    }

    const str = String(value).trim();

    if (!str) {
      return "";
    }

    const numeric = Number(str);

    if (Number.isFinite(numeric) && numeric < 1000) {
      return String(numeric).padStart(3, "0");
    }

    return str;
  }

  function currentConfig() {
    return configs[state.view] || configs.prop;
  }

  function isVisible() {
    const chart = d3.select("#risks-by-country-chart");

    return !chart.empty() && chart.style("display") !== "none";
  }

  function updateHighlight() {
    const config = currentConfig();

    d3.select("svg.risk-map")
      .selectAll("path.country")
      .attr("opacity", (d) => {
        const value = config.value(d);

        if (!selectedColorValue || selectedColorValue === value) {
          return 1;
        }

        return 0.12;
      })
      .classed("highlighted", (d) => {
        return selectedColorValue && selectedColorValue === config.value(d);
      });

    d3.select("svg.risk-map")
      .selectAll("path.sphere")
      .attr("opacity", selectedColorValue ? 0.05 : 0.1);

    d3.select("#risks-country-inline-legend")
      .selectAll(".risk-legend-item")
      .classed("active", (d) => selectedColorValue === d)
      .style("opacity", (d) => {
        if (!selectedColorValue || selectedColorValue === d) {
          return 1;
        }

        return 0.35;
      });
  }

  // simplified no more inline styles / chart-style layout
  function renderLegend(config, colorScale) {
    const legend = d3.select("#risks-country-inline-legend");

    legend.html("");

    const rows = legend
      .selectAll(".risk-legend-item")
      .data(config.domain)
      .join("div")
      .attr("class", "risk-legend-item")
      .attr("data-risk-value", (d) => d)
      .on("mouseenter", function (event, value) {
        if (!isVisible()) {
          return;
        }

        selectedColorValue = value;
        updateHighlight();
      })
      .on("mouseleave", function () {
        if (!isVisible()) {
          return;
        }

        selectedColorValue = null;
        updateHighlight();
      });

    rows.append("span")
      .attr("class", "legend-swatch")
      .style("background", (d) => colorScale(d));

    rows.append("span")
      .text((d) => config.labels[d] || d);

    updateHighlight();
  }

  function configureMapSvg() {
    const { svg, width, height } = window.ResponsiveSvg.configure("svg.risk-map", {
      minWidth: 340,
      maxWidth: 840,
      height: 560
    });
    
    const renderedWidth = svg.node().getBoundingClientRect().width || width;
    const chartLeft = 32;

    d3.select("#risks-by-country-chart")
      .style("--chart-left", `${chartLeft}px`);

    return { svg, width, height };
  }

  function render(options = {}) {
    if (!isVisible()) {
      return;
    }

    if (!features) {
      return;
    }

    const config = currentConfig();
    const { svg, width, height } = configureMapSvg();

    if (options.reset) {
      selectedColorValue = null;
      svg.interrupt();
      svg.selectAll("*").interrupt();
      svg.selectAll("*").remove();
    }

    const colorScale = d3.scaleOrdinal()
      .domain(config.domain)
      .range(config.colors);

    const projection = d3.geoNaturalEarth1()
      .fitSize([width, height], { type: "Sphere" });

    const pathGenerator = d3.geoPath().projection(projection);

    let root = svg.selectAll("g.risk-map-root")
      .data([null]);

    root = root.enter()
      .append("g")
      .attr("class", "risk-map-root")
      .merge(root);

    let mapLayer = root.selectAll("g.map-layer")
      .data([null]);

    mapLayer = mapLayer.enter()
      .append("g")
      .attr("class", "map-layer")
      .merge(mapLayer);

    zoomBehavior = d3.zoom()
      .scaleExtent([1, 8])
      .on("zoom", (event) => {
        mapLayer.attr("transform", event.transform);
      });

    svg.call(zoomBehavior);

    if (options.reset) {
      svg.call(zoomBehavior.transform, d3.zoomIdentity);
      mapLayer.attr("transform", null);
    }

    const sphere = mapLayer.selectAll("path.sphere")
      .data([{ type: "Sphere" }]);

    sphere.enter()
      .append("path")
      .attr("class", "sphere")
      .merge(sphere)
      .attr("d", pathGenerator)
      .attr("fill", "rgba(189,215,231,1)")
      .attr("stroke", "none");

    const countryPaths = mapLayer.selectAll("path.country")
      .data(features, (d) => d.id);

    countryPaths.exit().remove();

    const countryPathsEnter = countryPaths.enter()
      .append("path")
      .attr("class", "country");

    countryPathsEnter.append("title");

    // country hover behavior
    const countryPathsMerged = countryPathsEnter
      .merge(countryPaths)
      .attr("d", pathGenerator)
      .attr("fill", (d) => colorScale(config.value(d)))
      .attr("stroke", "black")
      .attr("stroke-width", 0.05)
      .on("mouseenter", function () {
        d3.select(this)
          .raise()
          .attr("opacity", 1)
          .attr("stroke", "black")
          .attr("stroke-width", 1)
          .attr("fill", "rgba(228,26,28, 1)");
      })
      .on("mouseleave", function (event, d) {
        d3.select(this)
          .attr("fill", colorScale(config.value(d)))
          .attr("stroke", "black")
          .attr("stroke-width", 0.05);

        updateHighlight();
      });

    countryPathsMerged.select("title")
      .text((d) => {
        const name = d.properties.name || "Unknown";
        const income = d.properties.income_grp || "No data";
        const prop = d.properties.prop || "No data";

        return `${name}
Income: ${income}
People over 60: ${prop}`;
      });

    renderLegend(config, colorScale);
    updateHighlight();
  }

  function bindSubtabs() {
    d3.selectAll("[data-risk-view]").on("click.risksByCountry", function (event) {
      event.preventDefault();

      state.view = this.dataset.riskView;
      selectedColorValue = null;

      d3.selectAll(".risks-country-subtabs li")
        .classed("active", false);

      d3.select(this.parentNode)
        .classed("active", true);

      render({ reset: true });
    });
  }

  function bindResetButton() {
    d3.select("#reset-risk-map").on("click.risksByCountry", function () {
      selectedColorValue = null;
      render({ reset: true });
    });
  }

  async function loadData() {
    const [topology, rows] = await Promise.all([
      d3.json("data/worldmap-fixed.json"),
      d3.csv("data/worldmap-fixed.csv")
    ]);

    const rowsByIso = new Map(
      rows.map((row) => [normalizeIso(row.iso_n3), row])
    );

    features = topojson
      .feature(topology, topology.objects.countries)
      .features
      .map((feature) => {
        const id = normalizeIso(feature.id);
        const row = rowsByIso.get(id);

        feature.id = id;
        feature.properties = {
          ...(feature.properties || {}),
          ...(row || {}),
          name: row?.name || feature.properties?.name || "Unknown",
          income_grp: row?.income_grp || "No data",
          prop: row?.prop || "No data"
        };

        return feature;
      });
  }

  async function init() {
    await loadData();
    bindSubtabs();
    bindResetButton();

    if (isVisible()) {
      render({ reset: true });
    }
  }

  return {
    init,
    render
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  window.RisksByCountry.init().catch((error) => {
    console.error(error);
    d3.select("#risks-country-inline-legend").text(error.message);
  });
});