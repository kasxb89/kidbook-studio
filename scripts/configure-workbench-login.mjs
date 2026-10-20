import fs from 'node:fs';
import crypto from 'node:crypto';
import {promisify} from 'node:util';
import readline from 'node:readline/promises';
import {Writable} from 'node:stream';

// Automation may pass {username,password} via stdin. Credentials never appear
// in process arguments or the script's output.
let username,password;
if(process.stdin.isTTY){
  const terminal=readline.createInterface({input:process.stdin,output:process.stdout});
  username=(await terminal.question('工作台账号：')).trim();terminal.close();
  process.stdout.write('工作台密码（输入隐藏）：');
  const muted=new Writable({write(_chunk,_encoding,done){done();}});
  const secret=readline.createInterface({input:process.stdin,output:muted,terminal:true});
  password=await secret.question('');secret.close();process.stdout.write('\n');
}else{
  const data=JSON.parse(fs.readFileSync(0,'utf8'));username=data.username;password=data.password;
}
if(typeof username!=='string'||!username.trim()||username.length>100||/[\r\n=]/.test(username)||typeof password!=='string'||!password||password.length>256)throw Error('账号或密码格式无效。');
const salt=crypto.randomBytes(16).toString('hex');
const hash=await promisify(crypto.scrypt)(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
const values={STORYBLOOM_WORKBENCH_USERNAME:username.trim(),STORYBLOOM_WORKBENCH_PASSWORD_HASH:`scrypt:${salt}:${hash.toString('hex')}`};
const target=process.argv[2]||'.env.local';
let contents=fs.existsSync(target)?fs.readFileSync(target,'utf8'):'';
for(const [name,value]of Object.entries(values)){
  const line=`${name}=${JSON.stringify(value)}`;
  contents=new RegExp(`^${name}=.*$`,'m').test(contents)?contents.replace(new RegExp(`^${name}=.*$`,'m'),()=>line):contents.replace(/\n?$/,'\n')+line+'\n';
}
fs.writeFileSync(target,contents,{mode:0o600});fs.chmodSync(target,0o600);
console.log('工作台登录已配置；密码仅保存为带随机盐的 scrypt 哈希。');
