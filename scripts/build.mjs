import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'public');
const output=path.join(root,'dist');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
await cp(source,output,{recursive:true});
const url=process.env.SUPABASE_URL || '';
const key=process.env.SUPABASE_ANON_KEY || '';
await writeFile(path.join(output,'app-config.js'),`export const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_ANON_KEY = ${JSON.stringify(key)};\n`);
console.log(`CATALISA gerado em dist (${url&&key?'Supabase configurado':'sem credenciais do Supabase'}).`);
