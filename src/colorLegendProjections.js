export const colorLegendProjections = (selection, props) => {
  const {
    colorScale,
    circleRadius,
    spacing,
    textOffset,
    onClick,
    selectedColorValues,
    language
  } = props;

  const enToZh = {'Brazil': '巴西',
                  'Colombia': '哥伦比亚',
                  'Egypt': '埃及',
                  'France': '法国',
                  'Germany': '德国',
                  'Italy': '意大利',
                  'Philippines': '菲律宾',
                  'Turkey': '火鸡',
                  'United Kingdom': '英国',
                  'United States': '美国'};

  const enToEs = {'Brazil': 'Brasil',
                  'Colombia': 'Colombia',
                  'Egypt': 'Egipto',
                  'France': 'Francia',
                  'Germany': 'Alemania',
                  'Italy': 'Italia',
                  'Philippines': 'Filipinas',
                  'Turkey': 'Turquía',
                  'United Kingdom': 'Reino Unido',
                  'United States': 'Estados Unidos'};

  function getText(d) {
    switch(language) {
      case 'en':
        return d;
        break;
      case 'es':
        return enToEs[d];
        break;
      case 'zh':
        return enToZh[d];
        break;
      default:
        console.log(d);  
    }
  }

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
      .text(getText)
      .attr('dy', '0.32em')
      .attr('x', textOffset);
}