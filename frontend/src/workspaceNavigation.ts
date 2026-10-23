export function closePagePlan(tabs:readonly string[],current:string,closing:string){
 const remaining=tabs.filter(path=>path!==closing);
 if(current!==closing)return {tabs:remaining,next:null};
 const index=tabs.indexOf(closing);
 return {tabs:remaining,next:remaining[Math.max(0,index-1)]||remaining[0]||'@home'};
}
