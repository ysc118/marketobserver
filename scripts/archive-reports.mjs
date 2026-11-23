import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {open,seal,validateTeam} from './crypto.mjs';
const [manifestFile,linkFile]=process.argv.slice(2);
if(!manifestFile||!linkFile)throw Error('Usage: archive-reports <private publication manifest> <team link file>');
const input=JSON.parse(await fs.readFile(manifestFile,'utf8'));
const team=validateTeam((await fs.readFile(linkFile,'utf8')).match(/[?&]team=([A-Za-z0-9_-]{43})(?:\s|$|&)/)?.[1]);
const root=new URL('../site/data/',import.meta.url);
const catalog=JSON.parse(gunzipSync(open(await fs.readFile(new URL('catalog.enc',root)),team,'hkbeat-catalog-v1/')));
const writes=[];
for(const row of input.reports){
  if(row.kind==='weekly'?!input.userConfirmed:row.kind!=='lingxi'||!input.sourceReviewed)throw Error('Report approval or source review is missing');
  const route=[row.kind,row.start,row.end].join('/');
  if(!/^(weekly|lingxi)\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(route)||row.start>row.end)throw Error('Invalid report period');
  const bytes=await fs.readFile(row.pdf);
  if(bytes.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('Approved file changed');
  const domain='team-report-pdf/v1/'+route+'/';
  const encrypted=Buffer.concat([Buffer.from('TEAMPDF1'),seal(bytes,team,domain)]);
  if(!open(encrypted.subarray(8),team,domain).equals(bytes))throw Error('Encrypted PDF verification failed');
  writes.push([new URL('pdf/'+route.replaceAll('/','_')+'.enc',root),encrypted]);
  catalog.library.files=catalog.library.files.filter(r=>!(r.kind===row.kind&&r.start===row.start&&r.end===row.end));
  catalog.library.files.push({kind:row.kind,start:row.start,end:row.end});
}
catalog.library.files.sort((a,b)=>b.end.localeCompare(a.end)||b.kind.localeCompare(a.kind));
const bytes=seal(gzipSync(JSON.stringify(catalog)),team,'hkbeat-catalog-v1/');
if(JSON.stringify(JSON.parse(gunzipSync(open(bytes,team,'hkbeat-catalog-v1/'))))!==JSON.stringify(catalog))throw Error('Encrypted catalog verification failed');
await fs.mkdir(new URL('pdf/',root),{recursive:true});
for(const [file,data] of [...writes,[new URL('catalog.enc',root),bytes]]){
  await fs.writeFile(new URL(file.href+'.tmp'),data);
  await fs.rename(new URL(file.href+'.tmp'),file);
}
console.log(JSON.stringify({prepared:input.reports.map(r=>({kind:r.kind,start:r.start,end:r.end})),encrypted:true,published:false}));

