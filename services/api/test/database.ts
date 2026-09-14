import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { spawn,type ChildProcess } from 'node:child_process';
import mongoose from 'mongoose';
import { beforeAll,afterAll } from 'vitest';
import { redis } from '../src/lib/db.js';
let mongo:MongoMemoryReplSet;
let cache:ChildProcess;
export function useDatabase(){
 beforeAll(async()=>{
  cache=spawn('redis-server',['--port','16389','--save','','--appendonly','no'],{stdio:'ignore'});
  mongo=await MongoMemoryReplSet.create({binary:{version:'7.0.24',downloadDir:'/tmp/kmart-mongodb'},replSet:{count:1}});
  await mongoose.connect(mongo.getUri());await redis.connect();
 });
 afterAll(async()=>{await mongoose.disconnect();if(redis.status!=='end')await redis.quit();await mongo?.stop();cache?.kill();});
}
