export const visualList = (selection, props) => {
  const xScale = d3.scaleLinear();
  const yScale = d3.scaleBand();
  // selection.style('background-color', 'gainsboro');

  // unpack parameters
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
    colors
  } = props;

  const transition = d3.transition()
    .duration(transitionDuration)
    .ease(d3.easeLinear);

  const widthSVG = +selection.attr('width');

  let rightAlignBy;
  if (sortList) {
    rightAlignBy = widthSVG - 200;
  } else {
    rightAlignBy = widthSVG - 120;
  }

  const lineExtendBy = 80;

  // functions
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

  function numberText(d) {
    return `${numberFormatter(d.number)}`;
  }

  function nameText(d, i) {
    if (sortList) {
      return `${i+1}. ${d.name}`;
    } else {
      return `${d.name}`;
    }
  }
  

  function setWeight(d) {
    if (d.type === 'estimate') {
      return '800';
    } else {
      return 'normal';
    }
  }

  const colorGrey = 'rgba(221, 221, 221, 0.8)';

  function setFill(d, i) {
    if (d.type === 'estimate') {
      return colors[0];
    } else if (d.type === 'over60') {
      return colors[2];
    } else if (d.type === 'other' || d.type === 'below60') {
      return colors[1];
    } else if (d.type === 'poverty') {
      return colors[i];
    } else {
      return colors[2];
    }
  }

  function setStroke(d, i) {
    if (d.type === 'estimate') {
      return colors[0];
    } else if (d.type === '2020-04-21' || d.type === 'over60') {
      return colors[2];
    } else if (d.type === 'other' || d.type === 'below60') {
      return colors[1];
    } else if (d.type === 'poverty') {
      return colors[i];
    } else {
      return colorGrey;
    }
  }

  // title main
  const titleMain = selection.selectAll('.title-main')
    .data([null]);
  const titleMainEnter = titleMain.enter()
    .append('text')
    .attr('class', 'title-main')
    .attr('transform', `translate(${margin.left}, 0)`)
    .attr('x', 0)
    .attr('y', 15)
    .style('font-size', '16px')
    .style('font-weight', '800')
    .style('fill', 'rgba(72,72,72,1)')
    .style('font-family', 'Roboto, sans-serif');
  titleMainEnter
    .merge(titleMain)
    .text(titleListMain);

  // title name
  const titleName = selection.selectAll('.title-name')
    .data([null]);
  const titleNameEnter = titleName.enter()
    .append('text')
    .attr('class', 'title-name')
    .attr('transform', `translate(${margin.left}, 0)`)
    .attr('x', 0)
    .attr('y', 50)
    .style('font-size', '14px')
    .style('font-weight', '800')
    .style('fill', 'rgba(72,72,72,1)')
    .style('font-family', 'Roboto, sans-serif');
  titleNameEnter
    .merge(titleName)
    .text(titleListName);

  // title number
  const titleNumber = selection.selectAll('.title-number')
    .data([null]);
  const titleNumberEnter = titleNumber.enter()
    .append('text')
    .attr('class', 'title-number')
    .attr('transform', `translate(${margin.left}, 0)`)
    .attr('x', rightAlignBy) // no - 50
    .attr('y', 50)
    .style('font-size', '14px')
    .style('font-weight', '800')
    .style('fill', 'rgba(72,72,72,1)')
    .style('font-family', 'Roboto, sans-serif');
  titleNumberEnter
    .merge(titleNumber)
    .text(titleListNumber);


  // add fat grey line under title
  const line = selection.selectAll('line')
    .data([null]);
  const lineEnter = line.enter()
    .append('rect')
    .attr('class', 'line-title')
    .attr('fill', 'grey')
    .attr('stroke', 'grey')
    .attr('width', rightAlignBy + lineExtendBy)
    .attr('rx', '0.7') // playing with rounded corners
    .attr('x', 0)
    .attr('height', 0.1)
    .attr('transform', `translate(${margin.left}, 60)`)
  lineEnter
    .merge(line);

  if (sortList) {
    dataList.sort((a, b) => d3.descending(xValue(a), xValue(b)));
  }

  const width = +selection.attr('width');
  let innerWidth = width - margin.left - margin.right;
  const innerHeight = verticalSpacing * dataList.length;

  // some last adjustments of bar width
  if (!sortList) {
    innerWidth *= 0.8;
  } else {
    innerWidth *= 1;
  }

  xScale
    .domain([0, d3.max(dataList, xValue)])
    .range([0, innerWidth]);

  if (reverseRange) {
    yScale
      .paddingInner(barPadding)
      .paddingOuter(barPadding / 2)
      .domain(dataList.map(yValue))
      .range([innerHeight / 2, 0]);
  } else {
    yScale
      .paddingInner(barPadding)
      .paddingOuter(barPadding / 2)
      .domain(dataList.map(yValue))
      .range([0, innerHeight / 2]);
  }


  let g = selection.selectAll('g').data([null]); // solves join problems with constant width
  g = g.enter().append('g') // reassign g to be the merged selection
    .merge(g)
    .attr('transform', `translate(${margin.left}, ${margin.top})`);

  // APPLY DUPLICATED LOGIC ON GROUP ELEMENT
  // and pass the transformation to childrens
  const groups = g.selectAll('g')
    .data(dataList, yValue); // key = yValue = name for object constancy in animations
  const groupsExit = groups.exit();
  groupsExit
    .remove();
  const groupsEnter = groups
    .enter().append('g')
    .attr('transform', d => `translate(0, ${yScale(yValue(d))})`);
  groups
    .merge(groupsEnter)
    .transition(transition)
    .attr('transform', d => `translate(0, ${yScale(yValue(d))})`);

  // add bars behind the text elements as children of groups elements
  const rects = groupsEnter
    .append('rect') // append elts and set content on enter
      .attr('class', 'hover-rect')
      .attr('fill', setFill)
      .attr('stroke', setStroke)
      .attr('width', 0) // 0 or d => xScale(xValue(d))
      .attr('rx', '0.7') // playing with rounded corners
      .attr('x', d => rightAlignBy - xScale(xValue(d)))
    .merge(groups.select('.hover-rect'))
      .attr('height', yScale.bandwidth())
      .transition().duration(400).ease(d3.easeLinear)
      .attr('x', d => rightAlignBy - xScale(xValue(d)))
      .attr('width', d => xScale(xValue(d)));
  groupsExit.select('.hover-rect')
    .transition(transition)
    .attr('width', 0);

  // add lines below elements
  const lines = groupsEnter
    .append('rect') // append elts and set content on enter
      .attr('class', 'line-rect')
      .attr('fill', 'grey')
      .attr('width', rightAlignBy + lineExtendBy)
      .attr('rx', '0.7')
      .attr('x', 0)
      .attr('transform', `translate(0, 25)`)
    .merge(groups.select('line-rect'))
      .attr('height', 0.4) // 0.1
      .transition(transition)
  groupsExit.select('line-rect')
    .transition(transition)
    .attr('width', 0);

  // set stroke on background fill=none same as Radial Normalized Stacted
  const textBackground =  groupsEnter
    .append('text') // append elts and set content on enter
      .attr('class', 'background')
      .attr('x', 1) // minor corrections
      .style('font-weight', setWeight)
      .attr('dy', '0.32em') // center wrt tick line
      .style('fill', 'none')
      .attr('stroke', 'white')
      .attr('stroke-width', 0.1) // TODO: set nicer
      .attr('stroke-linejoin', 'round')
      .style('font-size', '14px')
      .style('font-family', 'Roboto, sans-serif')
    .merge(groups.select('.background')) // for update selections (existing DOM elts)
      .attr('y', yScale.bandwidth() / 2) // center text within the bars
      .text(nameText);

  // add text elements as children of groups elements
  const textForeground =  groupsEnter
    .append('text') // append elts and set content on enter
      .attr('class', 'foreground')
      .attr('x', 1) // minor corrections
      .style('font-family', 'Sans-Serif')
      .style('font-weight', setWeight)
      .attr('dy', '0.32em') // center wrt tick line
      .style('font-size', '14px')
      .style('font-family', 'Roboto, sans-serif')
    .merge(groups.select('.foreground')) // for update selections (existing DOM elts)
      .attr('y', yScale.bandwidth() / 2) // center text within the bars
      .text(nameText);


  // Align right deathsText
  const textBackgroundNumber =  groupsEnter
    .append('text') // append elts and set content on enter
      .attr('class', 'backgroundnumber')
      .style('font-weight', setWeight)
      .attr('dy', '0.32em') // center wrt tick line
      .style('fill', 'none')
      .attr('stroke', 'white')
      .attr('stroke-width', 0.5) // TODO: set nicer
      .attr('stroke-linejoin', 'round')
      .style('font-size', '14px')
      .style('font-family', 'Roboto, sans-serif')
    .merge(groups.select('.backgroundnumber')) // for update selections (existing DOM elts)
      .attr('x', rightAlignBy + 5) // minor corrections
      .attr('y', yScale.bandwidth() / 2) // center text within the bars
      .text(numberText);

  // add text elements as children of groups elements
  const textForegroundNumber =  groupsEnter
    .append('text') // append elts and set content on enter
      .attr('class', 'foregroundnumber')
      .style('font-weight', setWeight)
      .attr('dy', '0.32em') // center wrt tick line
      .style('font-size', '14px')
      .style('fill', 'rgba(72,72,72,1)')
      .style('font-family', 'Roboto, sans-serif')
    .merge(groups.select('.foregroundnumber')) // for update selections (existing DOM elts)
      .attr('x', rightAlignBy + 5) // minor corrections
      .attr('y', yScale.bandwidth() / 2) // center text within the bars
      .text(numberText);
}
