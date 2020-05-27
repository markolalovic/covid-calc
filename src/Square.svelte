<script>
  export let text = '';
  export let color = '';
  export let size = 18;
  export let factorWidth = 3;
  let fillText = 'fill: ' + color + '; ';
</script>

<svg width="{size*factorWidth}" height="{size}">
  <style>
    .small { 
      font-size: 14px;
      font-family: 'Roboto', sans-serif;
      font-weight: 400;
    }
  </style>
  <rect width="{size}" height="{size}"
    style="{fillText}"
    rx="1.7"
  />
  <text x="20" y="13.5" class="small">{text}</text>
</svg>