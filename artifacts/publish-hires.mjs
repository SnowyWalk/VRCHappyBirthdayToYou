import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const data=JSON.parse(await fs.readFile('src/lib/world-view.json','utf8'));
for(const side of ['left','right','overview']){
 const crop=side==='overview'?{left:660,top:540,width:3480,height:1920}:{left:0,top:900,width:4800,height:1200};
 const buffer=await sharp(`artifacts/world-${side}-hires.png`).extract(crop).webp({lossless:true,effort:6}).toBuffer();
 const name=`/world-${side}-${createHash('sha256').update(buffer).digest('hex').slice(0,12)}.webp`;
 await fs.writeFile(`public${name}`,buffer);
 (side==='overview'?data.overview:data.views.find(v=>v.side===side)).image=name;
 console.log(side, crop.width, crop.height,buffer.length,name);
}
await fs.writeFile('src/lib/world-view.json',JSON.stringify(data,null,2)+'\n');
