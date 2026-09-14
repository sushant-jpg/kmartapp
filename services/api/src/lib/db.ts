import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';
// Every query is built from validated scalar fields. Never spread request objects
// into a MongoDB filter; global sanitizeFilter also rewrites our trusted operators.
mongoose.set('strictQuery','throw');
export const redis=new Redis(env.REDIS_URL,{lazyConnect:true,maxRetriesPerRequest:2});
redis.on('error',()=>logger.error({code:'REDIS_CONNECTION'},'Redis unavailable'));
export async function connect(){await mongoose.connect(env.MONGO_URI,{maxPoolSize:30,autoIndex:env.NODE_ENV!=='production'});await redis.connect();}
export async function disconnect(){await mongoose.disconnect();if(redis.status!=='end')await redis.quit();}
