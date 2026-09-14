import { app } from './routes.js';
import { connect,disconnect } from './lib/db.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
await connect();
const server=app.listen(env.PORT,()=>logger.info({port:env.PORT},'API listening'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>{void disconnect().then(()=>process.exit(0));});setTimeout(()=>process.exit(1),10_000).unref();});
