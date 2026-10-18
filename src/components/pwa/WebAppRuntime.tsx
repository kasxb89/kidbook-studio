"use client";

import { useEffect, useState } from "react";

export default function WebAppRuntime() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    // Development chunks change continuously; never cache the development server.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
        // Browsing remains available when storage or registration is denied.
      });
    }
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return offline ? <div className="webapp-offline" role="status">当前离线 · 本机保存与编辑可用，模型生成需连接接口</div> : null;
}
