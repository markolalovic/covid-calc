export const loadAndProcessData = () =>
  Promise
    .all([
        d3.csv('worldmap-fixed.csv'),
        d3.json('worldmap-fixed.json')
    ])
    .then(([csvData, topoJSONData]) => {
      const rowById = csvData.reduce((accumulator, d) => {
        accumulator[d.iso_n3] = d;
        return accumulator;
      }, {});

      const countries = topojson.feature(topoJSONData, topoJSONData.objects.countries);

      countries.features.forEach(d => {
        Object.assign(d.properties, rowById[d.id]);
      });

      return countries;
    }); 
