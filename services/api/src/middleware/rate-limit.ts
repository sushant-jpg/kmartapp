import type { RequestHandler } from 'express';
import { redis } from '../lib/db.js';
import { AppError } from '../lib/errors.js';
const script="local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n";
export const rateLimit=(scope:string,max:number,windowMs=60_000):RequestHandler=>async(req,res,next)=>{
 try{const count=Number(await redis.eval(script,1,`limit:${scope}:${req.ip}`,windowMs));if(count>max){res.setHeader('Retry-After',Math.ceil(windowMs/1000));throw new AppError(429,'RATE_LIMITED','Too many requests. Try again later.');}next();}catch(e){next(e);}
};
