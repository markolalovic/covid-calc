<script>
  import { afterUpdate } from 'svelte';
  import { visualList } from './visualList';

  export let compareData = [];
  export let titleListMain = "";
  export let titleListName = "";
  export let titleListNumber = "";

  // colors for: other, emphasize, estimate
  const colors = ['#fdc086', '#beaed4', '#7fc97f'];

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
      colors
    });
  });
</script>

<div>
	<svg
    class='compare'
    width='700'
    height='410'>
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
