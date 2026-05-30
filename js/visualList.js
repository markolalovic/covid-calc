window.visualList = (selection, props) => {
  const xScale = d3.scaleLinear();
  const yScale = d3.scaleBand();

  const {
    dataList,
    titleListName,
    titleListNumber,
    titleListMain,
    sortList,
    reverseRange,
    xValue,
    yValue,
    margin,
    barPadding,
    verticalSpacing,
    transitionDuration,
    barTransitionDuration,
    rightColumnOffset,
    tooltipText,
    colors
  } = props;

  const rowTransitionDuration = transitionDuration;
  const rectTransitionDuration =
    barTransitionDuration === undefined ? transitionDuration : barTransitionDuration;

  function transitionSelection(selection, duration = rowTransitionDuration) {
    selection.interrupt();

    if (!duration || duration <= 0) {
      return selection;
    }

    return selection
      .transition()
      .duration(duration)
      .ease(d3.easeLinear);
  }

  const widthSVG = +selection.attr("width");

  const defaultRightColumnOffset = sortList ? 200 : 120;
  const resolvedRightColumnOffset =
    rightColumnOffset === undefined ? defaultRightColumnOffset : rightColumnOffset;

  const rightAlignBy = widthSVG - resolvedRightColumnOffset;

  const lineExtendBy = 80;

  function numberWithCommas(x) {
    return Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function numberISO(x) {
    return d3.format(".3s")(x).replace("G", "B");
  }

  function numberFormatter(x) {
    if (Math.abs(x) < Math.pow(10, 6)) {
      return numberWithCommas(x);
    }

    return numberISO(x);
  }

  function numberText(d) {
    return `${numberFormatter(d.number)}`;
  }

  function nameText(d, i) {
    if (sortList) {
      return `${i + 1}. ${d.name}`;
    }

    return `${d.name}`;
  }

  function setWeight(d) {
    if (d.type === "estimate") {
      return "800";
    }

    return "normal";
  }

  const colorGrey = "rgba(221, 221, 221, 0.8)";

  function setFill(d, i) {
    if (d.type === "estimate") {
      return colors[0];
    } else if (d.type === "over60") {
      return colors[2];
    } else if (d.type === "other" || d.type === "below60") {
      return colors[1];
    } else if (d.type === "poverty") {
      return colors[i];
    }

    return colors[2];
  }

  function setStroke(d, i) {
    if (d.type === "estimate") {
      return colors[0];
    } else if (d.type === "2020-04-21" || d.type === "over60") {
      return colors[2];
    } else if (d.type === "other" || d.type === "below60") {
      return colors[1];
    } else if (d.type === "poverty") {
      return colors[i];
    }

    return colorGrey;
  }

  // Mutate a copy, not the caller's array.
  const renderedData = dataList.slice();

  if (sortList) {
    renderedData.sort((a, b) => d3.descending(xValue(a), xValue(b)));
  }

  const width = +selection.attr("width");
  let innerWidth = width - margin.left - margin.right;
  const innerHeight = verticalSpacing * renderedData.length;

  if (!sortList) {
    innerWidth *= 0.8;
  }

  xScale
    .domain([0, d3.max(renderedData, xValue) || 1])
    .range([0, innerWidth]);

  if (reverseRange) {
    yScale
      .paddingInner(barPadding)
      .paddingOuter(barPadding / 2)
      .domain(renderedData.map(yValue))
      .range([innerHeight / 2, 0]);
  } else {
    yScale
      .paddingInner(barPadding)
      .paddingOuter(barPadding / 2)
      .domain(renderedData.map(yValue))
      .range([0, innerHeight / 2]);
  }

  // ---------------------------------------------------------------------------
  // Titles
  // ---------------------------------------------------------------------------

  const titleMain = selection.selectAll(".title-main")
    .data([null]);

  titleMain.enter()
    .append("text")
    .attr("class", "title-main")
    .attr("transform", `translate(${margin.left}, 0)`)
    .attr("x", 0)
    .attr("y", 15)
    .style("font-size", "16px")
    .style("font-weight", "800")
    .style("fill", "rgba(72,72,72,1)")
    .style("font-family", "Roboto, sans-serif")
    .merge(titleMain)
    .text(titleListMain);

  const titleName = selection.selectAll(".title-name")
    .data([null]);

  titleName.enter()
    .append("text")
    .attr("class", "title-name")
    .attr("transform", `translate(${margin.left}, 0)`)
    .attr("x", 0)
    .attr("y", 50)
    .style("font-size", "14px")
    .style("font-weight", "800")
    .style("fill", "rgba(72,72,72,1)")
    .style("font-family", "Roboto, sans-serif")
    .merge(titleName)
    .text(titleListName);

  const titleNumber = selection.selectAll(".title-number")
    .data([null]);

  titleNumber.enter()
    .append("text")
    .attr("class", "title-number")
    .attr("transform", `translate(${margin.left}, 0)`)
    .attr("y", 50)
    .style("font-size", "14px")
    .style("font-weight", "800")
    .style("fill", "rgba(72,72,72,1)")
    .style("font-family", "Roboto, sans-serif")
    .merge(titleNumber)
    .attr("x", rightAlignBy)
    .text(titleListNumber);

  const titleLine = selection.selectAll(".line-title")
    .data([null]);

  titleLine.enter()
    .append("rect")
    .attr("class", "line-title")
    .attr("fill", "grey")
    .attr("stroke", "grey")
    .attr("rx", "0.7")
    .attr("x", 0)
    .attr("height", 0.1)
    .attr("transform", `translate(${margin.left}, 60)`)
    .merge(titleLine)
    .attr("width", rightAlignBy + lineExtendBy);

  // ---------------------------------------------------------------------------
  // Body group
  // ---------------------------------------------------------------------------

  let g = selection.selectAll("g.visual-list-body")
    .data([null]);

  g = g.enter()
    .append("g")
    .attr("class", "visual-list-body")
    .merge(g)
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // ---------------------------------------------------------------------------
  // Rows
  // ---------------------------------------------------------------------------

  const groups = g.selectAll("g.visual-list-row")
    .data(renderedData, yValue);

  const groupsExit = groups.exit();

  groupsExit
    .interrupt()
    .remove();

  const groupsEnter = groups.enter()
    .append("g")
    .attr("class", "visual-list-row")
    .attr("transform", d => `translate(0, ${yScale(yValue(d))})`)
    .style("opacity", 1);

  const groupsMerged = groups.merge(groupsEnter);

  groupsEnter
    .append("title");

  groupsMerged
    .select("title")
    .text((d) => {
      if (tooltipText) {
        return tooltipText(d);
      }

      return `${yValue(d)}: ${numberFormatter(xValue(d))}`;
    });  

  // for smooth ranking transition
  transitionSelection(groupsMerged)
    .attr("transform", d => `translate(0, ${yScale(yValue(d))})`);

  // ---------------------------------------------------------------------------
  // Bars
  // ---------------------------------------------------------------------------

  const rects = groupsEnter
    .append("rect")
    .attr("class", "hover-rect")
    .attr("width", 0)
    .attr("rx", "0.7")
    .attr("x", d => rightAlignBy - xScale(xValue(d)))
    .merge(groups.select(".hover-rect"))
    .attr("height", yScale.bandwidth())
    .attr("fill", setFill)
    .attr("stroke", setStroke);

  transitionSelection(rects, rectTransitionDuration)
    .attr("x", d => rightAlignBy - xScale(xValue(d)))
    .attr("width", d => xScale(xValue(d)));

  transitionSelection(groupsExit.select(".hover-rect"))
    .attr("width", 0);

  // ---------------------------------------------------------------------------
  // Row separator lines
  // ---------------------------------------------------------------------------

  const lines = groupsEnter
    .append("rect")
    .attr("class", "line-rect")
    .attr("fill", "grey")
    .attr("rx", "0.7")
    .attr("x", 0)
    .attr("transform", "translate(0, 25)")
    .merge(groups.select(".line-rect"))
    .attr("height", 0.4);

  transitionSelection(lines)
    .attr("width", rightAlignBy + lineExtendBy);

  transitionSelection(groupsExit.select(".line-rect"))
    .attr("width", 0);

  // ---------------------------------------------------------------------------
  // Row label text
  // ---------------------------------------------------------------------------

  const textForeground = groupsEnter
    .append("text")
    .attr("class", "foreground")
    .attr("x", 1)
    .attr("dy", "0.32em")
    .style("font-weight", setWeight)
    .style("font-size", "14px")
    .style("font-family", "Roboto, sans-serif")
    .merge(groups.select(".foreground"))
    .attr("y", yScale.bandwidth() / 2)
    .style("font-weight", setWeight)
    .text(nameText);

  // ---------------------------------------------------------------------------
  // Right-aligned number text
  // ---------------------------------------------------------------------------

  const textForegroundNumber = groupsEnter
    .append("text")
    .attr("class", "foregroundnumber")
    .attr("dy", "0.32em")
    .style("font-weight", setWeight)
    .style("font-size", "14px")
    .style("fill", "rgba(72,72,72,1)")
    .style("font-family", "Roboto, sans-serif")
    .merge(groups.select(".foregroundnumber"))
    .attr("x", rightAlignBy + 5)
    .attr("y", yScale.bandwidth() / 2)
    .style("font-weight", setWeight)
    .text(numberText);
};