export function cardLabels(value:string):string[]{return [...new Set(value.split(',').map(s=>s.trim()).filter(Boolean))];}
export function practiceScore(ids:readonly string[],grades:Record<string,boolean>){
 const rated=ids.filter(id=>Object.hasOwn(grades,id));
 const correct=rated.filter(id=>grades[id]).length;
 return {answered:rated.length,correct,total:ids.length,complete:ids.length>0&&rated.length===ids.length,missed:ids.filter(id=>grades[id]===false)};
}
