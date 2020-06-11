export const lineChart = (selection, props) => {
  const {
    colorValue,
    colorScale,
    yValue,
    title,
    xValue,
    xAxisLabel,
    yAxisLabel,
    margin,
    width,
    height,
    data,
    nested,
    selectedColorValues,
    selectedCountries,
  } = props;

  const splitIndexes = {
    'Brazil': 91,
    'Egypt': 92,
    'France': 91,
    'Germany': 92,
    'Italy': 92,
    'Japan': 91,
    'Philippines': 92,
    'Turkey': 92,
    'United Kingdom': 92,
    'United States': 96};
   

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  function numberFormat(number) {
    if (number > 10000) {
      return d3.format('.3s')(number).replace('G', 'B');
    }
    else {
      return number;
    }
  }
  
  // filter data for x and y scales
  function isSelected(name) {
    return selectedColorValues.includes(name);
  }

  const xScale = d3.scaleTime()
    .domain(d3.extent(data.filter(
      d => isSelected(d.country)
    ), xValue))
    .range([0, innerWidth])
    .nice();

  const yScale = d3.scaleLinear()
    .domain(d3.extent(data.filter(
      d => isSelected(d.country)
    ), yValue))
    .range([innerHeight, 0])
    .nice();

  const g = selection.selectAll('.container').data([null]);
  const gEnter = g.enter()
    .append('g')
      .attr('class', 'container');
  gEnter.merge(g)
    .attr('transform', `translate(${margin.left},${margin.top})`);
    
  const xAxis = d3.axisBottom(xScale)
    .ticks(5)
    .tickFormat(d3.timeFormat('%b %d'))
    .tickSize(-innerHeight)
    .tickPadding(15);

  const yAxis = d3.axisLeft(yScale)
    .tickSize(-innerWidth)
    .tickFormat(numberFormat)
    .tickPadding(10);

  const yAxisGEnter = gEnter
    .append('g')
      .attr('class', 'y-axis');
  const yAxisG = g.select('.y-axis');
  yAxisGEnter
    .merge(yAxisG)
      .call(yAxis)
      .selectAll('.domain').remove();

  yAxisGEnter
    .append('text')
      .attr('class', 'axis-label')
      .attr('y', -60)
      .attr('fill', 'black')
      .attr('transform', `rotate(-90)`)
      .attr('text-anchor', 'middle')
    .merge(yAxisG.select('.axis-label'))
      .attr('x', -innerHeight / 2)
      .text(yAxisLabel);

  const xAxisGEnter = gEnter
    .append('g')
      .attr('class', 'x-axis');
  const xAxisG = g.select('.x-axis');
  xAxisGEnter
    .merge(xAxisG)
      .call(xAxis)
      .attr('transform', `translate(0,${innerHeight})`)
      .select('.domain').remove();

  xAxisGEnter
    .append('text')
      .attr('class', 'axis-label')
      .attr('y', 80)
      .attr('fill', 'black')
    .merge(xAxisG.select('.axis-label'))
      .attr('x', innerWidth / 2)
      .text(xAxisLabel);

  const lineGenerator = d3.line()
    .x(d => xScale(xValue(d)))
    .y(d => yScale(yValue(d)))
    .curve(d3.curveBasis);
    
  function generatePaths(d) {
    return lineGenerator(d.values);
  }

  function getRange(dataCountry, type) {
    if (type === 'continuous') {
      return d3.range(0, splitIndexes[dataCountry.key])
    } else {
      return d3.range(splitIndexes[dataCountry.key] + 1, 
        dataCountry.values.length)
    }
  }

  function getIndexes(nested, type) {
    const allIndexes = d3.range(10);
    let indexes = [];

    if (type === 'selected') {
      allIndexes.forEach(i => {
        const country = nested[i].key;
        if (selectedCountries.includes(country)) {
          indexes.push(i);
        }
      });
    } else if (type === 'dashed') {
      allIndexes.forEach(i => {
        const country = nested[i].key;
        if (selectedColorValues.includes(country) && !selectedCountries.includes(country)) {
          indexes.push(i);
        }
      });      
    } else {
      allIndexes.forEach(i => {
        const country = nested[i].key;
        if (selectedColorValues.includes(country)) {
          indexes.push(i);
        }
      });
    }
    return indexes;
  }

  function melt(nested, type) {
    const data = [];
    let filterRange = [];
    let allCountries = [];

    // TODO: show only paths from selectedColorValues!
    // filter on selectedColorValues
    allCountries = getIndexes(nested, type);
    allCountries.forEach(i => { 
      const values = nested[i].values
      
      const filtered = [];
      filterRange = getRange(nested[i], type)
      filterRange.forEach(j => {
        filtered.push(values[j]);
      });

      const row = {
        key: nested[i].key,
        values: filtered
      }
      data.push(row);
    });

    return data;
  };

  const linePathsCont = g.merge(gEnter)
    .selectAll('.continuous').data(melt(nested, 'continuous'));
  const linePathsContEnter = linePathsCont
    .enter().append('path')
      .attr('class', 'continuous');
  const linePathsContUpdate = linePathsContEnter.merge(linePathsCont);
  linePathsContUpdate.attr('d', generatePaths)
      .attr('stroke', d => colorScale(d.key))
      .attr('opacity', d =>
        selectedColorValues.includes(colorValue(d))
          ? 1
          : 0.1
      );
  linePathsCont.exit().remove();

  
  const linePathsSelected = g.merge(gEnter)
    .selectAll('.dashed').data(melt(nested, 'selected'));  
  const linePathsSelectedEnter = linePathsSelected
    .enter().append('path')
      .attr('class', 'dashed');
  const linePathsSelectedUpdate = linePathsSelectedEnter.merge(linePathsSelected);
  
  if (melt(nested, 'selected').length > 0) {
    linePathsSelectedUpdate.attr('d', generatePaths)
    .attr('stroke', d => colorScale(d.key))
    .attr('opacity', d =>
      selectedColorValues.includes(colorValue(d))
        ? 1
        : 0.1
    );

    let totalLength = linePathsSelectedUpdate.node().getTotalLength();
    // solution from: https://www.visualcinnamon.com/2016/01/animating-dashed-line-d3
    const dashing = "6, 6";
    let dashLength =
      dashing
          .split(/[\s,]/)
          .map(function (a) { return parseFloat(a) || 0 })
          .reduce(function (a, b) { return a + b });
    let dashCount = Math.ceil( totalLength / dashLength );
    let newDashes = new Array(dashCount).join( dashing + " " );
    let dashArray = newDashes + " 0, " + totalLength;

    linePathsSelectedUpdate
      .attr('stroke-dashoffset', totalLength)
      .attr('stroke-dasharray', dashArray)
      .transition().duration(500).ease(d3.easeLinear)
      .attr('stroke-dashoffset', 0);
    
    linePathsSelected.exit().remove();
  } else {
    linePathsSelected.exit().remove();
  }
  


  const linePathsDashed = g.merge(gEnter)
    .selectAll('.alldashed').data(melt(nested, 'dashed')); 
  const linePathsDashedEnter = linePathsDashed
    .enter().append('path')
      .attr('class', 'alldashed');
  const linePathsDashedUpdate = linePathsDashedEnter.merge(linePathsDashed);
  
  if (melt(nested, 'dashed').length > 0) {
    linePathsDashedUpdate
    .attr('d', generatePaths)
    .attr('stroke', d => colorScale(d.key))
    .attr('opacity', d =>
      selectedColorValues.includes(colorValue(d))
        ? 1
        : 0.1
    );
  }
  linePathsDashed.exit().remove();

  gEnter
    .append('text')
      .attr('class', 'title')
      .attr('x', -100)
      .attr('y', -30)
    .merge(g.select('.title'))
      .text(title);
}
