import { createContext,useContext,useLayoutEffect,useState } from 'react';
import type { ReactNode } from 'react';
import { themeTokens } from './themeTokens';
import {themes} from './themes';
export {themes} from './themes';
export type Preferences={theme:string;fontSize:number;wordWrap:boolean;reduceMotion:boolean};
const defaults:Preferences={theme:'night',fontSize:13,wordWrap:true,reduceMotion:false};
export function readPreferences():Preferences {
 try {const value=JSON.parse(localStorage.getItem('starview-preferences')||'null');return {theme:themes.some(theme=>theme.id===value?.theme)?value.theme:defaults.theme,fontSize:Number.isFinite(value?.fontSize)?Math.max(12,Math.min(20,value.fontSize)):13,wordWrap:typeof value?.wordWrap==='boolean'?value.wordWrap:true,reduceMotion:value?.reduceMotion===true};}catch{return defaults;}
}
const Context=createContext<{preferences:Preferences;update:(value:Partial<Preferences>)=>void;reset:()=>void}>({preferences:defaults,update:()=>{},reset:()=>{}});
export const usePreferences=()=>useContext(Context);
export default function PreferencesProvider({children}:{children:ReactNode}) {
 const [preferences,setPreferences]=useState(readPreferences);
 useLayoutEffect(()=>{
  const theme=themes.find(item=>item.id===preferences.theme)||themes[0];const root=document.documentElement;
  root.dataset.theme=theme.id;root.dataset.motion=preferences.reduceMotion?'reduced':'system';root.style.colorScheme=theme.light?'light':'dark';
  for(const [token,value] of Object.entries(themeTokens)){
   if(theme.id==='night')root.style.removeProperty(token);
   else root.style.setProperty(token,value.original.startsWith('#000')?value.original:theme.colors[value.role]+value.alpha);
  }
  root.style.setProperty('--document-background',theme.id==='night'?'#191d26':theme.colors.surface);
  root.style.setProperty('--document-foreground',theme.colors.text);
  root.style.setProperty('--settings-accent',theme.colors.accent);
  try{localStorage.setItem('starview-preferences',JSON.stringify(preferences));}catch{/* Preferences still work when storage is unavailable. */}
  window.dispatchEvent(new Event('starview-preferences-change'));
 },[preferences]);
 return <Context.Provider value={{preferences,update:value=>setPreferences(current=>({...current,...value})),reset:()=>setPreferences(defaults)}}>{children}</Context.Provider>;
}
