export const latexTokens: import('monaco-editor').languages.IMonarchLanguage={
 defaultToken:'',tokenizer:{root:[
  [/%.*$/,'comment'],
  [/\[\[[^\]]*\]\]/,'link'],
  [/\\(?:begin|end|documentclass|usepackage|section|subsection|chapter|title|author|label|ref|input|include|newtheorem)\b/,'keyword'],
  [/\\[a-zA-Z@]+\*?/,'command'],
  [/\\[^a-zA-Z]/,'escape'],
  [/\$\$?|\\\(|\\\)|\\\[|\\\]/,'math'],
  [/[{}\[\]]/,'delimiter'],
  [/[\^_&]/,'operator'],
  [/\b\d+(?:\.\d+)?\b/,'number'],
 ]},
};
