export const colorLegendProjections = (selection, props) => {
  const {
    colorScale,
    circleRadius,
    spacing,
    textOffset,
    onClick,
    selectedColorValues
  } = props;

  const groups = selection.selectAll('g')
    .data(colorScale.domain());
  const groupsEnter = groups
    .enter().append('g')
      .attr('class', 'tick-colorlegend')
      .attr('opacity', 0.8);
  groupsEnter
    .merge(groups)
      .attr('transform', (d, i) =>
        `translate(0, ${i * spacing})`
      )
      .attr('opacity', d =>
      selectedColorValues.includes(d)
        ? 1
        : 0.1
      )
      .on('click', d => onClick(d));
    groups.exit().remove();

  groupsEnter.append('circle')
    .merge(groups.select('circle'))
      .attr('r', circleRadius)
      .attr('fill', colorScale);

  groupsEnter.append('text')
    .merge(groups.select('text'))
      .text(d => d)
      .attr('dy', '0.32em')
      .attr('x', textOffset);
}