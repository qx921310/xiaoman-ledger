// Build the icon assets from lucide-static 1.69.0 (ISC); pass its unpacked package directory.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const source = process.argv[2];
if (!source) throw Error('Pass the unpacked lucide-static package directory');
const names = [
  'heart-pulse','gift','graduation-cap','house','gamepad-2','train-front','utensils','shopping-bag',
  'paint-roller','paperclip','paw-print','shirt','baby','watch','plug','smartphone-charging','smartphone','sparkles','lamp',
  'wheat','utensils-crossed','carrot','popcorn','wine','moon-star','sun','sandwich',
  'wrench','plane','train-front','fuel','circle-parking','bus-front','car-taxi-front',
  'tickets','martini','dices','waves','dumbbell','clapperboard','luggage',
  'brush-cleaning','warehouse','house-plus','building-2','flame','droplet','lightbulb','phone',
  'graduation-cap','book-open','landmark','hand-coins','mail','hand-coins','gift','heart-handshake','pill','hospital','heart-pulse',
  'receipt','badge-dollar-sign','repeat-2','briefcase-business','clock','party-popper','hand-coins','gift','trending-up','trophy','ellipsis','heart-handshake','trending-down','triangle-alert'
];
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'));
if (names.length !== manifest.length) throw Error(`mapping count ${names.length} != ${manifest.length}`);
function icon(name,dest) {
  const src = fs.readFileSync(path.join(source,'icons',name+'.svg'),'utf8');
  const body = src.slice(src.indexOf('>', src.indexOf('<svg'))+1,src.lastIndexOf('</svg>')).trim();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n${body}\n</svg>\n`;
  if (Buffer.byteLength(svg)>2048) throw Error(`oversize ${dest}`);
  fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,svg);
}
manifest.forEach((item,i)=>icon(names[i],path.join(root,'public/icons/categories',item.group,item.key+'.svg')));
const assets = {cash:'banknote',savings_card:'credit-card',credit_card:'credit-card',debit_card:'credit-card',wallet:'wallet',fund:'chart-pie',stock:'chart-candlestick',investment:'chart-no-axes-combined',insurance:'shield-check',fixed_deposit:'calendar-clock',property:'house',vehicle:'car-front',deposit:'lock-keyhole',default:'wallet-cards'};
for (const [key,value] of Object.entries(assets)) icon(value,path.join(root,'public/icons/assets',`ic_asset_${key}.svg`));
