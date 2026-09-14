import { defineConfig } from 'tsup';
export default defineConfig({entry:['src/server.ts','src/worker.ts'],format:['esm'],sourcemap:true,clean:true,noExternal:['@kmart/shared']});
