<script>
  import { afterUpdate } from 'svelte';
  import { onMount } from 'svelte';


  import { lineChart } from './lineChart';
  import { colorLegendProjections } from './colorLegendProjections';

  export let projectionsTitle = '';
  export let projectionsXAxisLabel = '';
  export let projectionsYAxisLabel = '';
  export let language = '';

  let svg;

  // state   
  let selectedColorValues = ['United States', 'Brazil', 'Italy'];
  let selectedCountries = ['United States', 'Brazil', 'Italy'];
  let data;

  afterUpdate(() => {
    svg = d3.select('svg.projections');
  
    d3.csv('projections.csv')
      .then(inData => {
        inData.forEach(d => {
          d.totdea_mean = +d.totdea_mean;
        });
        data = inData;

        console.log('projections.csv')
        console.log(data);

        render();
      });
  }); 

  function removeItemOnce(arr, value) { 
    var index = arr.indexOf(value);
    if (index > -1) {
        arr.splice(index, 1);
    }
    return arr;
  }

  function onClick(cname) {
    if (selectedColorValues.includes(cname)
        // at least one has to be selected
        && selectedColorValues.length > 1) {
      removeItemOnce(selectedColorValues, cname);
      selectedCountries.splice(0, selectedCountries.length);
    } else {
      selectedCountries.splice(0, selectedCountries.length);
      selectedCountries.push(cname);
      selectedColorValues.push(cname);
    }
    render();
  } 

  const render = () => {

    // projections line chart
    let lineChartG = svg.selectAll('g.line-chart').data([null]);
    lineChartG = lineChartG
      .enter()
        .append('g')
        .attr('class', 'line-chart')
      .merge(lineChartG);

    // select country legend
    let colorLegendG = svg.selectAll('g.country-legend').data([null]);
    colorLegendG = colorLegendG
      .enter()
        .append('g')
        .attr('class', 'country-legend')
      .merge(colorLegendG);

    const width = +svg.attr('width');
    const height = +svg.attr('height');    

    const parseTime = d3.timeParse('%Y-%m-%d')
    const yValue = d => d.totdea_mean;
    const xValue = d => parseTime(d.date);

    const colorValue = d => d.country;

    // for nested use to sort
    const lastYValue = d =>
      yValue(d.values[d.values.length - 1]);  

    const nested = d3.nest()
      .key(colorValue)
      .entries(data)
      .sort((a, b) =>
        d3.descending(lastYValue(a), lastYValue(b))
      );

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    colorScale.domain(nested.map(d => d.key));
    
    const margin = { top: 55, right: 200, bottom: 50, left: 100 };

    lineChartG.call(lineChart, {
      colorScale,
      colorValue: d => d.key, // instead of colorValue(d) when using nested!
      yValue: yValue,
      title: projectionsTitle,
      xValue: xValue,
      xAxisLabel: projectionsXAxisLabel,
      yAxisLabel: projectionsYAxisLabel,
      margin: margin,
      width,
      height,
      data,
      nested,
      selectedColorValues,
      selectedCountries
    });

    colorLegendG
      .attr('transform', `translate(800, 45)`)
      .call(colorLegendProjections, {
        colorScale,
        circleRadius: 11,
        spacing: 30,
        textOffset: 15,
        onClick,
        selectedColorValues,
        language
      });
  }

</script>

<svg class='projections'
  width='960' height='450'>
  <style>
    .line {
      fill: none;
      stroke-width: 5;
      stroke-linejoin: round;
      stroke-linecap: round;
      mix-blend-mode: multiply;
    }
    .continuous {
      fill: none;  
      stroke-width: 4.5px;
      stroke-linejoin: round;
      stroke-linecap: round;
      mix-blend-mode: multiply;  
    }
    .dashed {
      fill: none;
      stroke-width: 4.5px;
      stroke-linejoin: round;
      stroke-linecap: round;
      mix-blend-mode: multiply;
      /* stroke-dasharray: 8 8; */
    }
    .alldashed {
      fill: none;
      stroke-width: 4.5px;
      stroke-linejoin: round;
      stroke-linecap: round;
      mix-blend-mode: multiply;
      stroke-dasharray: 8 8;
    }
    .legend-continuous {
      fill: none;
      stroke: black;
      stroke-width: 4.5px;  
      stroke-linejoin: round;
      stroke-linecap: round;
      mix-blend-mode: multiply;
    }
    .legend-dashed {
      fill: none;
      stroke: black;
      stroke-width: 4.5px;  
      stroke-linejoin: round;
      stroke-linecap: round;
      mix-blend-mode: multiply;
      stroke-dasharray: 8 8;
    }
    text {
      font-family: 'Roboto', sans-serif;
      font-size: 14px;
    }
    .tick-colorlegend {
      cursor: pointer;
    }
    .tick text {
      font-weight: normal;
      font-family: 'Roboto', sans-serif;
      font-size: 14px;
    }
    .tick line {
      stroke: #C0C0BB;
    }
    .axis-label {
      font-size: 15px;
      font-weight: 800;
      fill: rgba(72,72,72,1);
      font-family: 'Roboto', sans-serif;
    }
    .title {
      font-weight: 800;
      font-family: 'Roboto', sans-serif;
      fill: rgba(72,72,72,1);
      font-size: 17px;
    }
  </style>
</svg>
