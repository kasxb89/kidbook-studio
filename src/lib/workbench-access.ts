// This module is safe in both Next middleware and the Node route runtime.
export type WorkbenchEnvironment={STORYBLOOM_WORKBENCH_ORIGIN?:string;STORYBLOOM_WORKBENCH_USERNAME?:string;STORYBLOOM_WORKBENCH_PASSWORD_HASH?:string;[key:string]:string|undefined};
const loopback=new Set(["localhost","127.0.0.1","[::1]"]);
export function workbenchServerMode(env:WorkbenchEnvironment=process.env) {return !!env.STORYBLOOM_WORKBENCH_ORIGIN;}
export function workbenchLoginEnabled(env:WorkbenchEnvironment=process.env) {return workbenchServerMode(env)||!!(env.STORYBLOOM_WORKBENCH_USERNAME||env.STORYBLOOM_WORKBENCH_PASSWORD_HASH);}
export function workbenchCredentialsConfigured(env:WorkbenchEnvironment=process.env) {return !!env.STORYBLOOM_WORKBENCH_USERNAME?.trim()&&/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(env.STORYBLOOM_WORKBENCH_PASSWORD_HASH||"");}
// Address/CSRF checks run in middleware AND Node handlers; sessions are checked
// against SQLite in the Node handlers, not trusted to middleware alone.
export function workbenchRequestError(request:Request,env:WorkbenchEnvironment=process.env,checkOrigin=true):{status:number;message:string}|null {
  const url=new URL(request.url),host=request.headers.get("host")||url.host;
  let actual:URL;
  try{actual=new URL(`${url.protocol}//${host}`);}catch{return {status:403,message:"无效的工作空间地址。"};}
  if(actual.host!==host)return {status:403,message:"无效的工作空间地址。"};
  let origin=actual.origin;
  if(env.STORYBLOOM_WORKBENCH_ORIGIN) {
    let configured:URL;
    try {configured=new URL(env.STORYBLOOM_WORKBENCH_ORIGIN);if(!["http:","https:"].includes(configured.protocol)||configured.username||configured.password||configured.pathname!=="/"||configured.search||configured.hash)throw Error();}
    catch{return {status:503,message:"服务器工作空间地址配置无效。"};}
    if(host!==configured.host)return {status:403,message:"工作空间地址不匹配。"};
    origin=configured.origin;
  }else if(!loopback.has(actual.hostname))return {status:403,message:"本地工作台仅允许本机访问。"};
  if(workbenchLoginEnabled(env)&&!workbenchCredentialsConfigured(env))return {status:503,message:"工作空间登录配置不完整。"};
  const received=request.headers.get("origin");
  if(checkOrigin&&((received&&received!==origin)||request.headers.get("sec-fetch-site")==="cross-site"))return {status:403,message:"不接受其他网站发起的工作空间操作。"};
  return null;
}
