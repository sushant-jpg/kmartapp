import { expect,it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
it('serves a process liveness check',async()=>{const r=await request(app).get('/health');expect(r.status).toBe(200);expect(r.headers['x-content-type-options']).toBe('nosniff');});
it('rejects insecure production configuration',()=>{expect(()=>parseEnv({...process.env,NODE_ENV:'production'})).toThrow();});
