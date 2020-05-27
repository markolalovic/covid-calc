export const timeSeriesPlot = (selection, props) => {
  const { dataTS, title } = props;

  // render
  const width = +selection.attr('width');
  const height = +selection.attr('height');

  var parseTime = d3.timeParse('%Y-%m-%d')
  const xValue = d => parseTime(d.date);
  const xAxisLabel = 'Date';

  const yLower = d => d.lower;
  const yMean = d => d.mean;
  const yUpper = d => d.upper;

  const split = 68;

  const yAxisLabel = 'Total deaths';

  // 35 top
  const margin = { top: 55, right: 100, bottom: 150, left: 100 };

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const numberFormat = number =>
    d3.format('.3s')(number) // TODO: set .3s if population size < 10M or sth
      .replace('G', 'B'); // replace giga with billion

  const xScale = d3.scaleTime()
    .domain(d3.extent(dataTS, xValue))
    .range([0, innerWidth])
    .nice();

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(dataTS, yUpper) * 1.1])
    .range([innerHeight, 0])
    .nice();

  const g = selection.append('g')
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

  const yAxisG = g.append('g').call(yAxis);
  yAxisG.selectAll('.domain').remove();

  yAxisG.append('text')
      .attr('class', 'axis-label')
      .attr('y', -60)
      .attr('x', -innerHeight / 2)
      .attr('fill', 'black')
      .attr('transform', `rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text(yAxisLabel);

  const xAxisG = g.append('g').call(xAxis)
    .attr('transform', `translate(0, ${innerHeight})`);

  xAxisG.select('.domain').remove();

  const xAxisLabelHeight = Math.round( (height - innerHeight) / 4 );

  xAxisG.append('text')
      .attr('class', 'axis-label')
      .attr('y', xAxisLabelHeight )
      .attr('x', innerWidth / 2)
      .attr('fill', 'black')
      .text(xAxisLabel);

  const areaGenerator = d3.area()
    .x(d => xScale(xValue(d)))
    .y0(d => yScale(yLower(d)))
    .y1(d => yScale(yUpper(d)))
    .curve(d3.curveBasis);

  g.append('path')
    .attr('class', 'line-path')
    .attr('d', areaGenerator(dataTS));

  const lineGenerator = d3.line()
    .x(d => xScale(xValue(d)))
    .y(d => yScale(yMean(d)))
    .curve(d3.curveBasis);

  // from:
  // https://stackoverflow.com/questions/27026625/how-to-change-line-color-in-d3js-according-to-axis-value
  g.append('path')
    .attr('d', lineGenerator(
        dataTS.filter(
          function(d, i) {
            return i <= split;
        })
      )
    )
    .attr('class', 'continuous');

  g.append('path')
    .attr('d', lineGenerator(dataTS.filter(function(d, i) {
      return i > split;
    })))
    .attr('class', 'dashed');

  g.append('text')
    .attr('class', 'title')
    .attr('x', -100)
    .attr('y', -30)
    .text(title);

  // legend
  // Solution from: https://uscensusbureau.github.io/citysdk/examples/d3-line-chart/
  const legendHeight = Math.round( height - 55 );
  const legendWidth = innerWidth/2 + 50;

  const legend = selection
    .append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(
        ${legendWidth},
        ${legendHeight})`)
    .style('font-size', '16px');

  const legendElements = {
    0: {
      name: 'Total deaths',
      style: 'continuous'
    },
    1: {
      name: 'Total deaths (projected)',
      style: 'dashed',
    },
  };

  Object.keys(legendElements).forEach((elt, i) => {
    legend
      .append('text')
      .attr('x', '2em')
      .attr('y', `${i}em`)
      // .attr('dy', '.35em')
      .text(legendElements[elt].name);

    legend
      .append('line')
      .attr('x1', 0)
      .attr('x2', 20)
      .attr('y1', `${i - .25}em`)
      .attr('y2', `${i - .25}em`)
      .attr('class', legendElements[elt].style);
  });
}
