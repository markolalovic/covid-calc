window.CovidTopTabs = (() => {
  const SECTIONS = {
    CONTEXT: "estimates-in-context",
    AGE: "mortality-by-age",
    RISKS: "risks-by-country"
  };

  function isMortalityReady() {
    return (
      window.MortalityByAge &&
      window.MortalityByAge.isReady &&
      window.MortalityByAge.isReady()
    );
  }

  function showChart(section) {
    d3.select("#estimates-context-chart")
      .style("display", section === SECTIONS.CONTEXT ? null : "none");

    d3.select("#mortality-by-age-chart")
      .style("display", section === SECTIONS.AGE ? null : "none");

    d3.select("#risks-by-country-chart")
      .style("display", section === SECTIONS.RISKS ? null : "none");

    d3.select("#non-ported-placeholder").remove();
  }

  function showRightPanel(section) {
    const usesCovidControls =
      section === SECTIONS.CONTEXT ||
      section === SECTIONS.AGE;

    const usesRiskControls =
      section === SECTIONS.RISKS;

    d3.select("#shared-covid-controls-container")
      .style("display", usesCovidControls ? null : "none");

    d3.select("#risks-country-controls-container")
      .style("display", usesRiskControls ? null : "none");

    // not using generic  controls for current tabs
    d3.select("#non-covid-controls")
      .style("display", "none");

    d3.selectAll("#non-covid-controls .tab-pane")
      .classed("active", false);

    // legends live under charts
    d3.select("#right-side-legend")
      .style("display", "none");
  }

  function renderVisibleChart(section) {
    if (
      section === SECTIONS.CONTEXT &&
      window.EstimatesContext &&
      isMortalityReady()
    ) {
      window.EstimatesContext.render({ reset: true });
      return;
    }

    if (
      section === SECTIONS.AGE &&
      isMortalityReady()
    ) {
      window.MortalityByAge.render({ reset: true });
      return;
    }

    if (
      section === SECTIONS.RISKS &&
      window.RisksByCountry
    ) {
      window.RisksByCountry.render({ reset: true });
    }
  }

  function showSection(section) {
    d3.select("#meta")
      .classed("risks-layout", section === "risks-by-country");

    showChart(section);
    showRightPanel(section);
    renderVisibleChart(section);
  }

  function getActiveSection() {
    const activeLink =
      document.querySelector(".-tabs li.active a") ||
      document.querySelector(".nav-tabs li.active a");

    if (!activeLink) {
      return SECTIONS.CONTEXT;
    }

    const href = activeLink.getAttribute("href");

    if (!href || !href.startsWith("#")) {
      return SECTIONS.CONTEXT;
    }

    return href.replace("#", "");
  }

  function bind() {
    $('a[data-toggle="tab"]').on("shown.bs.tab", function (event) {
      const href = event.target.getAttribute("href");

      if (!href || !href.startsWith("#")) {
        return;
      }

      showSection(href.replace("#", ""));
    });

    showSection(getActiveSection());

    document.addEventListener("covid:mortalityready", () => {
      showSection(getActiveSection());
    });
  }

  return {
    bind,
    showSection
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  window.CovidTopTabs.bind();
});