<script>
	import { afterUpdate } from 'svelte';

	import { loadAndProcessData } from './loadAndProcessData';
	import { choroplethMap } from './choroplethMap';
	import { colorLegend } from './colorLegend';

	export let selectedRisk = 0;

	// selectedColorValue,
	// handleMouseOver,
	// handleMouseOut
		
	let svg;

	let svgWidth = 960;
	let svgHeight = 500;

	// domain and range arrays
	let incomeColors = ['rgb(208,28,139)','rgb(241,182,218)','rgb(184,225,134)',
		'rgb(77,172,38)','darkgrey'];
	let incomeLegend = ['No data', '4. High income', '3. Upper middle income',
											'2. Lower middle income', '1. Low income'].reverse();

	let propsColors = ['rgb(166,97,26)','rgb(223,194,125)','rgb(128,205,193)',
		'rgb(1,133,113)','darkgrey'];
	let propsLegend = ['No data', '<5%', '5- 10%', '10- 20%', '>20%'].reverse();

	afterUpdate(() => {
		svg = d3.select('svg.worldmap');

		// choropleth map
		let g = svg.selectAll('g').data([null]);
		g = g.enter().append('g')
		  .merge(g);

		// update legend on each property switch
		let legend = svg.selectAll('g.legend').data([null]);
		legend = legend.enter()
			.append('g')
			.attr('class', 'legend')
		  .merge(legend)
		    .attr('transform', `translate(40, 310)`);

		const colorScale = d3.scaleOrdinal();
		let colorValue; // strange to send null to choroplethMap

		let selectedColorValue;
		let features;

		function handleMouseOver(d, i) {
		 	selectedColorValue = d;
		 	render();
		};

		function handleMouseOut(d, i) {
			selectedColorValue = null;
			render();
		}

		loadAndProcessData().then(countries => {
			features = countries.features;
			render();
		});

		function render() {
			switch (selectedRisk) {
				case 0:
					colorValue = d => d.properties.prop;
					colorScale
						.domain(propsLegend)
						.range(propsColors);
					break;
				default:
					colorValue = d => d.properties.income_grp;
					colorScale
						.domain(incomeLegend)
						.range(incomeColors);
					break;
			}

			g.call(choroplethMap, {
				features,
				colorScale,
				colorValue,
				selectedColorValue,
			});

			legend.call(colorLegend, {
				colorScale,
				circleRadius: 8,
				spacing: 20,
				textOffset: 12,
				backgroundRectWidth: 235,
				selectedColorValue,
  			handleMouseOver,
  			handleMouseOut
			});
		}
	});
</script>


<div class='center'>
	<svg
		class='worldmap'
		width='{svgWidth}'
		height='{svgHeight}'>

		<style>
			.sphere {
				/* fill: #0077be; */
				fill: rgba(189,215,231 ,1);
				opacity: 0.1;
			}
			.country {
				stroke: black;
				stroke-width: 0.05px;
			}
			.country:hover {
				opacity: 1;
        stroke: black;
        stroke-width: 1px;
        fill: rgba(228,26,28, 1);
			}
			.tick text {
				font-size: .9em;
				fill: #635F5D;
				font-family: sans-serif;
			}
			.tick {
				cursor: pointer;
			}
			.tick circle {
				stroke: black;
				stroke-opacity: 0.5;
			}
		</style>
	</svg>
</div>


<style>
	.center {
		text-align: center;
	}
</style>
