<script>
  import { afterUpdate } from 'svelte';
  import { visualList } from './visualList';

  export let infectedData = [];
  export let infectedTitle = '';
  export let infectedTitleListName = '';
  export let infectedTitleListNumber = '';

  export let deathsData = [];
  export let deathsTitle = '';
  export let deathsTitleListName = '';
  export let deathsTitleListNumber = '';


  // other, emphasize, estimate
  const colors = ['#e0f3db','#a8ddb5','#43a2ca'];

  const transitionDuration = 200;

  function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function textValue(d, i) {
    return `${d.name}: ${numberWithCommas(d.number)}`
  }

	afterUpdate(() => {
    d3.select('svg.infected').call(visualList, {
      dataList: infectedData,
      titleListName: infectedTitleListName,
      titleListNumber: infectedTitleListNumber,
      titleListMain: infectedTitle,
      sortList: false,
      reverseRange: true,
      xValue: d => d.number,
      yValue: d => d.name,
      textValue: textValue,
      margin: {
          top: 70,
          right: 100,
          bottom: 0,
          left: 0,
      },
      barPadding: .2,
      verticalSpacing: 55,
      transitionDuration: transitionDuration,
      colors
    });

    d3.select('svg.deaths').call(visualList, {
      dataList: deathsData,
      titleListName: deathsTitleListName,
      titleListNumber: deathsTitleListNumber,
      titleListMain: deathsTitle,
      sortList: false,
      reverseRange: true,
      xValue: d => d.number,
      yValue: d => d.name,
      textValue: textValue,
      margin: {
          top: 70,
          right: 100,
          bottom: 0,
          left: 0,
      },
      barPadding: .2,
      verticalSpacing: 55,
      transitionDuration: transitionDuration,
      colors
    });
  });
</script>

<div style='margin-top: 25px'>
	<!-- {JSON.stringify(data, null, ' ')}     -->
	<svg class='infected' width='450' height='320'>
    <style>
      .hover-rect:hover {
        opacity: 1;
        stroke: black;
        stroke-width: 1px;
        fill: rgba(228,26,28, 1);
      }
    </style>
  </svg>
  <svg class='deaths' width='450' height='320'>
    <style>
      .hover-rect:hover {
        opacity: 1;
        stroke: black;
        stroke-width: 1px;
        fill: rgba(228,26,28, 1);
      }
    </style>
  </svg>
</div>
