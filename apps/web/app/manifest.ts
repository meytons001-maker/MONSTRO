import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest { return { name:"MONSTRO / DIVULGADO", short_name:"MONSTRO", description:"Inteligência comercial privada", start_url:"/divulgado", display:"standalone", background_color:"#f4f8f7", theme_color:"#078b72", icons:[{src:"/monstro-icon.svg",sizes:"any",type:"image/svg+xml",purpose:"maskable"}] }; }
