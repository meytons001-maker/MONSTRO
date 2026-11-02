"use client";
import { useEffect, useState } from "react";
export function PwaRegister(){const [offline,setOffline]=useState(false);useEffect(()=>{if("serviceWorker" in navigator)void navigator.serviceWorker.register("/sw.js");const sync=()=>setOffline(!navigator.onLine);sync();addEventListener("online",sync);addEventListener("offline",sync);return()=>{removeEventListener("online",sync);removeEventListener("offline",sync)}},[]);return offline?<div role="status" className="offlineStatus">Sem conexão. Dados empresariais não são armazenados para uso offline.</div>:null}
