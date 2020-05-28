<script>
  import { afterUpdate } from 'svelte';
  import { visualList } from './visualList';

  export let compareData = [];

  export let titleListMain = '';
  export let titleListName = '';
  export let titleListNumber = '';

  export let colorsList = [];

  const transitionDuration = 200;

	afterUpdate(() => {
    d3.select('svg.compare').call(visualList, {
      dataList: compareData,
      titleListName: titleListName,
      titleListNumber: titleListNumber,
      titleListMain: titleListMain,
      sortList: true,
      reverseRange: false,
      xValue: d => d.number,
      yValue: d => d.name,
      margin: {
        top: 70,
        right: 220,
        bottom: 0,
        left: 90,
      },
      barPadding: .2,
      verticalSpacing: 55,
      transitionDuration: transitionDuration,
      colors: colorsList
    });
  });
</script>

<div>
  <!-- style="text-align: center"> -->
  <!-- style='background-color: blue' -->
	<svg
    class='compare'
    width='700'
    height='420'>
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
