<script>
  export let text = '';
  export let type = '';
  export let size = 18;
  export let factorWidth = 3;
  let y = 10;
</script>
{#if type === 'continuous'}
  <svg width="{size*factorWidth}" height="{size}">
    <style>
      .small { 
        font-size: 14px;
        font-family: 'Roboto', sans-serif;
        font-weight: 400;
      }
    </style>
    <line x1="10" x2="30" y1="{y}" y2="{y}" 
      fill="none"
      stroke="black" 
      stroke-width="4.5px"
      stroke-linejoin="round"
      stroke-linecap="round"
      mix-blend-mode="multiply"/>
    <text x="40" y="13.5" class="small">{text}</text>
  </svg>
{/if}
{#if type === 'dashed'}
  <svg width="{size*factorWidth}" height="{size}">
    <style>
      .small { 
        font-size: 14px;
        font-family: 'Roboto', sans-serif;
        font-weight: 400;
      }
    </style>
    <line x1="10" x2="30" y1="{y}" y2="{y}"
      fill="none"
      stroke="black" 
      stroke-width="4.5px"
      stroke-linejoin="round"
      stroke-linecap="round"
      mix-blend-mode="multiply"
      stroke-dasharray="8 8"/>
    <text x="40" y="13.5" class="small">{text}</text>
  </svg>
{/if}
