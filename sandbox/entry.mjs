import http from 'node:http';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const errors=new Set(['sandbox_setup_failed','pi_failed','pi_start_failed','agent_output_too_large','index_html_required','unsafe_artifact','artifact_file_too_large','artifact_bundle_too_large','artifact_file_limit','artifact_read_failed']);
const root='/workspace/project';
let proxy;

async function main(){
  const input=await new Promise((resolve,reject)=>{
    let data='',size=0;
    process.stdin.setEncoding('utf8');
    process.stdin.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>1024*1024){process.stdin.destroy();reject(new Error('sandbox_setup_failed'));return}data+=chunk});
    process.stdin.on('end',()=>resolve(data));process.stdin.on('error',reject);
  });
  const spec=JSON.parse(input);const agentDir='/workspace/agent';
  await fs.mkdir(root,{recursive:true});await fs.mkdir(agentDir,{recursive:true});
  process.env.HOME='/workspace/home';process.env.PI_CODING_AGENT_DIR=agentDir;process.env.PI_OFFLINE='1';process.env.PI_TELEMETRY='0';process.env.TIHU_RUN_TOKEN=spec.broker_token;
  await fs.mkdir(process.env.HOME,{recursive:true});
  proxy=http.createServer((req,res)=>{
    const upstream=http.request({socketPath:'/broker/bridge.sock',path:req.url,method:req.method,headers:req.headers},response=>{
      res.writeHead(response.statusCode??502,response.headers);response.pipe(res);
      response.on('error',()=>res.destroy());
    });
    upstream.on('error',()=>{
      if(!res.headersSent)res.writeHead(400,{'content-type':'application/json'});
      res.end(JSON.stringify({error:'broker_unavailable'}));
    });
    req.on('aborted',()=>upstream.destroy());
    res.on('close',()=>upstream.destroy());
    req.pipe(upstream);
  });
  await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(9090,'127.0.0.1',resolve)});
  const api={openai:'openai-completions',responses:'openai-responses',anthropic:'anthropic-messages'}[spec.protocol];
  const model={id:spec.model,name:spec.model,reasoning:spec.thinking!=='off',input:['text'],contextWindow:128000,maxTokens:spec.harness.output_tokens_per_call,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}};
  await fs.writeFile(path.join(agentDir,'models.json'),JSON.stringify({providers:{tihu:{baseUrl:'http://127.0.0.1:9090/v1',api,apiKey:'$TIHU_RUN_TOKEN',models:[model]}}}));
  const skillArgs=[];
  for(const [i,skill] of (spec.skills??[]).entries()){
    const dir=`/workspace/skills/${i}`;await fs.mkdir(dir,{recursive:true});
    for(const [name,body] of Object.entries(skill.files??{})){
      const dest=path.resolve(dir,name);
      if(!dest.startsWith(dir+'/'))throw new Error('sandbox_setup_failed');
      await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,String(body));
    }
    skillArgs.push('--skill',path.join(dir,'SKILL.md'));
  }
  const instructions=[spec.challenge_prompt,spec.rubric?`\nEvaluation rubric:\n${spec.rubric}`:'',spec.prompt?`\nAdditional user instructions:\n${spec.prompt}`:'','\nBuild the result as a self-contained web artifact in the current directory. You MUST create index.html. Use only local files. Do not include secrets, API keys, remote URLs, iframes, forms, or external dependencies.'].join('');
  const args=['-p','--no-session','--provider','tihu','--model',spec.model,'--thinking',spec.thinking??'off','--no-extensions','--no-prompt-templates','--no-context-files',...skillArgs,instructions];
  const child=spawn('pi',args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
  let outputBytes=0,tooLarge=false;
  const discard=chunk=>{outputBytes+=chunk.length;if(outputBytes>4*1024*1024){tooLarge=true;child.kill('SIGKILL')}};
  child.stdout.on('data',discard);child.stderr.on('data',discard);
  const code=await new Promise((resolve,reject)=>{child.once('error',()=>reject(new Error('pi_start_failed')));child.once('close',resolve)});
  if(tooLarge)throw new Error('agent_output_too_large');
  if(code!==0)throw new Error('pi_failed');
  const allowed=new Set(['.html','.css','.js','.mjs','.json','.txt','.svg','.png','.jpg','.jpeg','.webp']);
  const files={};let total=0,count=0;
  async function walk(dir){
    for(const ent of await fs.readdir(dir,{withFileTypes:true})){
      const full=path.join(dir,ent.name);const rel=path.relative(root,full).split(path.sep).join('/');
      if(ent.isSymbolicLink())throw new Error('unsafe_artifact');
      if(ent.isDirectory()){await walk(full);continue}
      if(!ent.isFile()||!allowed.has(path.extname(ent.name).toLowerCase()))continue;
      if(++count>50)throw new Error('artifact_file_limit');
      const file=await fs.open(full,constants.O_RDONLY|constants.O_NOFOLLOW);
      let data;
      try{
        if(!(await file.stat()).isFile())throw new Error('unsafe_artifact');
        const buffer=Buffer.alloc(512*1024+1);let size=0;
        while(size<buffer.length){const read=await file.read(buffer,size,buffer.length-size,null);if(!read.bytesRead)break;size+=read.bytesRead}
        if(size>512*1024)throw new Error('artifact_file_too_large');
        data=buffer.subarray(0,size);
      }finally{await file.close()}
      total+=data.length;if(total>2*1024*1024)throw new Error('artifact_bundle_too_large');
      files[rel]=data.toString('base64');
    }
  }
  try{await walk(root)}catch(error){throw new Error(errors.has(error.message)?error.message:'artifact_read_failed')}
  if(!files['index.html'])throw new Error('index_html_required');
  return {ok:true,files};
}

let packet;
try{packet=await main()}catch(error){packet={ok:false,error:errors.has(error.message)?error.message:'sandbox_setup_failed'};process.exitCode=2}
finally{if(proxy){proxy.close();proxy.closeAllConnections()}}
process.stdout.write(JSON.stringify(packet));
