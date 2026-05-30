window.CovidResizeCharts = (() => {
  let frame = null;

  function activeSection() {
    const active = document.querySelector(".main-tabs li.active a");

    if (!active) {
      return "estimates-in-context";
    }

    return active.getAttribute("href").replace("#", "");
  }

  function renderActiveChart() {
    const section = activeSection();

    if (
      section === "estimates-in-context" &&
      window.EstimatesContext
    ) {
      window.EstimatesContext.render({ interactive: true });
    }

    if (
      section === "mortality-by-age" &&
      window.MortalityByAge &&
      window.MortalityByAge.isReady &&
      window.MortalityByAge.isReady()
    ) {
      window.MortalityByAge.render({ interactive: true });
    }

    if (
      section === "risks-by-country" &&
      window.RisksByCountry
    ) {
      window.RisksByCountry.render({ reset: true });
    }
  }

  function scheduleRender() {
    if (frame) {
      cancelAnimationFrame(frame);
    }

    frame = requestAnimationFrame(() => {
      frame = null;
      renderActiveChart();
    });
  }

  function bind() {
    window.addEventListener("resize", scheduleRender);
  }

  return { bind };
})();

document.addEventListener("DOMContentLoaded", () => {
  window.CovidResizeCharts.bind();
});