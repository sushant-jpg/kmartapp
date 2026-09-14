export interface Requirements {category?:string;brand?:string;minPrice?:number;maxPrice?:number;useCases?:string[];minRam?:number;feature?:string;sort?:'price'|'rating'|'battery'}
export type Intent='product_recommendation'|'comparison'|'order_support'|'return_policy'|'account_support';
export function extractIntent(message:string,previous:Requirements={},brands:string[]=[],categories:string[]=[]):{intent:Intent;filters:Requirements}{
 const text=message.toLowerCase().replace(/,/g,'');const filters={...previous};
 if(/\b(order|shipment|delivery|refund|cancel)\b/.test(text))return {intent:'order_support',filters};
 if(/\b(return|wrong item)\b/.test(text))return {intent:'return_policy',filters};
 if(/\b(address|password|account)\b/.test(text))return {intent:'account_support',filters};
 const categoriesMap:Record<string,string>={laptop:'Laptop',phone:'Phone',headphone:'Headphones',shoe:'Shoes',shirt:'Clothing'};
 for(const [word,category] of Object.entries(categoriesMap))if(text.includes(word))filters.category=category;
 for(const category of categories)if(text.includes(category.toLowerCase()))filters.category=category;
 for(const brand of brands)if(text.includes(brand.toLowerCase()))filters.brand=brand;
 if(/any brand|all brands/.test(text))delete filters.brand;
 const max=text.match(/(?:under|below|less than|budget(?: of)?|have|max(?:imum)?|up to)\s*(?:rs\.?\s*|npr\s*)?(\d+(?:\.\d+)?)\s*(k|lakh)?/);
 const min=text.match(/(?:above|at least|over|min(?:imum)?)\s*(?:rs\.?\s*|npr\s*)?(\d+(?:\.\d+)?)\s*(k|lakh)?/);
 const amount=(match:RegExpMatchArray)=>Math.round(Number(match[1])*(match[2]==='k'?1000:match[2]==='lakh'?100000:1)*100);
 if(max)filters.maxPrice=amount(max);if(min)filters.minPrice=amount(min);
 if(/cheaper/.test(text)){filters.sort='price';if(previous.maxPrice)filters.maxPrice=Math.floor(previous.maxPrice*.85);}
 if(/best|rating/.test(text))filters.sort='rating';if(/battery/.test(text))filters.sort='battery';
 const ram=text.match(/(\d+)\s*gb\s*(?:of\s*)?ram/);if(ram)filters.minRam=Number(ram[1]);
 const cases=['gaming','programming','coding','cybersecurity','virtualization','photography','running','gift'].filter(w=>text.includes(w));
 if(cases.length)filters.useCases=cases;
 if(/rtx/.test(text))filters.feature='RTX';
 return {intent:/compare|which one|first two/.test(text)?'comparison':'product_recommendation',filters};
}
