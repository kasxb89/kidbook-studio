"use client";
import { useState,type FormEvent } from "react";
import s from "./WorkbenchLogin.module.css";

export default function WorkbenchLogin() {
  const [username,setUsername]=useState(""),[password,setPassword]=useState(""),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy)return;setBusy(true);setError("");
    try {const response=await fetch("/api/local/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})}),body=await response.json();if(!response.ok)throw new Error(body.error||"登录失败，请重试。");window.location.assign("/custom");}
    catch(reason){setError(reason instanceof Error?reason.message:"暂时无法连接，请重试。");setBusy(false);}
  }
  return <main className={s.screen}><section className={s.card} aria-labelledby="studio-login-title">
    <div className={s.logo} aria-hidden="true">册</div><p className={s.brand}>KIDBOOK STUDIO</p><h1 id="studio-login-title">登录绘本工作台</h1><p className={s.description}>把每个小故事，做成值得收藏的绘本。</p>
    <form onSubmit={submit}>
      <label htmlFor="studio-username">账号<input id="studio-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={100} value={username} onChange={event=>setUsername(event.target.value)} disabled={busy}/></label>
      <div className={s.field}><label htmlFor="studio-password">密码</label><span className={s.password}><input id="studio-password" name="password" type={visible?"text":"password"} autoComplete="current-password" required maxLength={256} value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/><button type="button" aria-label={visible?"隐藏密码":"显示密码"} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?"隐藏":"显示"}</button></span></div>
      {error&&<p role="alert" className={s.error}>{error}</p>}<button className={s.submit} type="submit" disabled={busy}>{busy?"正在登录…":"进入工作台"}</button>
    </form><p className={s.hint}>故事、图片和制作进度都会自动保存。</p>
  </section></main>;
}
