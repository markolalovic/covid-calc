window.ResponsiveSvg = (() => {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getContainerWidth(svgNode) {
    const parent = svgNode.parentElement;

    if (!parent) {
      return Number(svgNode.getAttribute("width")) || 700;
    }

    const rect = parent.getBoundingClientRect();
    return Math.floor(rect.width);
  }

  function configure(svgSelector, options = {}) {
    const svg = d3.select(svgSelector);
    const node = svg.node();

    if (!node) {
      return { svg, width: 0, height: 0 };
    }

    const minWidth = options.minWidth || 320;
    const maxWidth = options.maxWidth || 1000;
    const defaultHeight = options.height || 500;

    const containerWidth = getContainerWidth(node);
    const width = clamp(containerWidth, minWidth, maxWidth);
    const height = defaultHeight;

    svg
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMin meet");

    return { svg, width, height };
  }

  return { configure };
})();
