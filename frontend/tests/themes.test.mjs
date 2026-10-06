import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('../src/themes.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {themes}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function luminance(hex){const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);}
test('theme foreground and secondary text remain readable on writing surfaces',()=>{
 assert.equal(new Set(themes.map(theme=>theme.id)).size,5);assert.ok(themes.some(theme=>theme.light));
 for(const theme of themes)for(const background of ['canvas','surface','raised'])for(const foreground of ['text','muted'])assert.ok(contrast(theme.colors[foreground],theme.colors[background])>=4.5,`${theme.name}: ${foreground} on ${background}`);
});
test('theme accents remain readable against the page surface',()=>{for(const theme of themes)assert.ok(contrast(theme.colors.accent,theme.colors.surface)>=4.5,theme.name);});
