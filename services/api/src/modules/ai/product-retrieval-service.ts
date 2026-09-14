import type { FilterQuery } from 'mongoose';
import { Product } from '../catalog/models.js';
import { effectivePrice,escapeRegex } from '../catalog/service.js';
import type { Requirements } from './intent-service.js';
export interface VectorSearch {search(query:string,limit:number):Promise<string[]>}
export let vectorSearch:VectorSearch|undefined;
export function configureVectorSearch(adapter:VectorSearch){vectorSearch=adapter;}
export async function retrieveProducts(filters:Requirements,message:string,ids?:string[]){
 const query:FilterQuery<typeof Product>={active:true,$expr:{$and:[{$gt:[{$subtract:['$stock','$reservedStock']},0]},{$lte:[{$ifNull:['$salePrice','$regularPrice']},filters.maxPrice??Number.MAX_SAFE_INTEGER]},{$gte:[{$ifNull:['$salePrice','$regularPrice']},filters.minPrice??0]}]}};
 if(filters.category)query.category={$regex:`^${escapeRegex(filters.category)}s?$`,$options:'i'};
 if(filters.brand)query.brand={$regex:`^${escapeRegex(filters.brand)}$`,$options:'i'};
 if(ids?.length)query._id={$in:ids};
 else if(vectorSearch){try{const matches=await vectorSearch.search(message,40);if(matches.length)query._id={$in:matches};}catch{/* fall back to database filters */}}
 const candidates=await Product.find(query).sort({averageRating:-1,_id:1}).limit(40).lean();
 return candidates.filter(p=>{
  const specs=p.specifications as Record<string,string>;const text=Object.values(specs).join(' ');
  return (!filters.minRam||Number.parseInt(specs.RAM??specs.ram??'0',10)>=filters.minRam)&&(!filters.feature||text.toLowerCase().includes(filters.feature.toLowerCase()));
 }).map(p=>{
  const terms=[...p.tags,p.shortDescription,Object.values(p.specifications as Record<string,string>).join(' ')].join(' ').toLowerCase();
  const matched=(filters.useCases??[]).filter(c=>terms.includes(c)||(c==='programming'&&terms.includes('coding'))||(c==='photography'&&terms.includes('camera')));
  const score=matched.length*10+p.averageRating+(filters.sort==='price'?-effectivePrice(p)/1e7:0);
  return {...p,score,reason:matched.length?`Catalog tags and specifications match ${matched.join(', ')}.`:'Matches your selected price, brand and availability filters.'};
 }).sort((a,b)=>b.score-a.score).slice(0,6).map(({score:_score,...p})=>p);
}
