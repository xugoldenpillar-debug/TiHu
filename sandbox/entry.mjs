import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const input = await new Promise((resolve,reject)=>{let data='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>{data+=c;if(data.length>1024*1024)reject(new Error('spec too large'))});process.stdin.on('end',()=>resolve(data));});
const spec = JSON.parse(input);
const root='/workspace/project'; const agentDir='/workspace/agent';
await fs.mkdir(root,{recursive:true}); await fs.mkdir(agentDir,{recursive:true});
process.env.HOME='/workspace/home'; process.env.PI_CODING_AGENT_DIR=agentDir; process.env.PI_OFFLINE='1'; process.env.PI_TELEMETRY='0'; process.env.TIHU_RUN_TOKEN=spec.broker_token;
await fs.mkdir(process.env.HOME,{recursive:true});

const proxy=http.createServer((req,res)=>{
  const upstream=http.request({socketPath:'/broker/bridge.sock',path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode??502,r.headers);r.pipe(res)});
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'content-type':'application/json'});res.end('{"error":"broker_unavailable"}')});req.pipe(upstream);
});
await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(9090,'127.0.0.1',resolve)});

const api={openai:'openai-completions',responses:'openai-responses',anthropic:'anthropic-messages'}[spec.protocol];
const model={id:spec.model,name:spec.model,reasoning:spec.thinking!=='off',input:['text'],contextWindow:128000,maxTokens:spec.harness.output_tokens_per_call,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}};
await fs.writeFile(path.join(agentDir,'models.json'),JSON.stringify({providers:{tihu:{baseUrl:'http://127.0.0.1:9090/v1',api,apiKey:'$TIHU_RUN_TOKEN',models:[model]}}}));

const skillArgs=[];
for(const [i,skill] of (spec.skills??[]).entries()){
  const dir=`/workspace/skills/${i}`; await fs.mkdir(dir,{recursive:true});
  for(const [name,body] of Object.entries(skill.files??{})){const dest=path.join(dir,name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,String(body));}
  skillArgs.push('--skill',path.join(dir,'SKILL.md'));
}
const instructions=[spec.challenge_prompt, spec.rubric?`\nEvaluation rubric:\n${spec.rubric}`:'', spec.prompt?`\nAdditional user instructions:\n${spec.prompt}`:'', '\nBuild the result as a self-contained web artifact in the current directory. You MUST create index.html. Use only local files. Do not include secrets, API keys, remote URLs, iframes, forms, or external dependencies.'].join('');
const args=['-p','--no-session','--provider','tihu','--model',spec.model,'--thinking',spec.thinking??'off','--no-extensions','--no-prompt-templates','--no-context-files',...skillArgs,instructions];
const child=spawn('pi',args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
let out=0,err=0;child.stdout.on('data',b=>{out+=b.length;if(out>2*1024*1024)child.kill('SIGKILL')});child.stderr.on('data',b=>{err+=b.length;if(err>2*1024*1024)child.kill('SIGKILL')});
const code=await new Promise(resolve=>child.on('close',resolve));
proxy.close();
if(code!==0){process.stdout.write(JSON.stringify({ok:false,error:'pi_failed'}));process.exit(2)}
const allowed=new Set(['.html','.css','.js','.mjs','.json','.txt','.svg','.png','.jpg','.jpeg','.webp']);const files={};let total=0,count=0;
async function walk(dir){for(const ent of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,ent.name);const rel=path.relative(root,full).split(path.sep).join('/');if(ent.isSymbolicLink())throw new Error('symlink denied');if(ent.isDirectory()){await walk(full);continue}if(!ent.isFile()||!allowed.has(path.extname(ent.name).toLowerCase()))continue;const data=await fs.readFile(full);total+=data.length;count++;if(data.length>512*1024||total>2*1024*1024||count>50)throw new Error('artifact limit');files[rel]=data.toString('base64')}}
await walk(root);if(!files['index.html']){process.stdout.write(JSON.stringify({ok:false,error:'index_html_required'}));process.exit(3)}process.stdout.write(JSON.stringify({ok:true,files}));
