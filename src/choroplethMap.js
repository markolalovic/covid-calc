const projection = d3.geoNaturalEarth1();
const pathGenerator = d3.geoPath().projection(projection);

export const choroplethMap = (selection, props) => {
  const {
    features,
    colorScale,
    colorValue,
    selectedColorValue
  } = props;

  const gUpdate = selection.selectAll('g')
    .data([null]);

  const gEnter = gUpdate.enter()
    .append('g');
  const g = gUpdate.merge(gEnter);

  gEnter
    .append('path')
      .attr('class', 'sphere')
      .attr('d', pathGenerator({type: 'Sphere'}))
    .merge(gUpdate.select('.sphere'))
      .attr('opacity', selectedColorValue ? 0.05 : 1);

  selection.call(d3.zoom().on('zoom', () => {
    g.attr('transform', d3.event.transform);
  }));

  const countryPaths = g.selectAll('.country')
    .data(features);
  const countryPathsEnter = countryPaths
    .enter().append('path')
      .attr('class', 'country');
  countryPaths
    .merge(countryPathsEnter)
      .attr('d', pathGenerator)
      .attr('fill', d => colorScale(colorValue(d)))
      .attr('opacity', d =>
        (!selectedColorValue || selectedColorValue === colorValue(d))
          ? 1
          : 0.1
      )
      .classed('highlighted', d =>
        selectedColorValue && selectedColorValue === colorValue(d)
      );

  countryPathsEnter.append('title')
  // give user info from worldmap-fixed.csv: name,economy,income_grp,iso_n3,prop
      .text(d =>
        d.properties.name + ': ' + '\n' +
        'Income: ' + d.properties.income_grp + '\n' +
        'People over 60: ' + d.properties.prop);
};
