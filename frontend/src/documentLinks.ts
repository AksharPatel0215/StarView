export function wikiLinks(content: string): { target: string; label: string; start: number; end: number }[] {
  let literal = false;
  const masked = content.split(/(?<=\n)/).map(line => {
    if (/\\begin\{(?:verbatim\*?|lstlisting|minted)\}/.test(line)) literal = true;
    if (literal) { if (/\\end\{(?:verbatim\*?|lstlisting|minted)\}/.test(line)) literal = false; return line.replace(/[^\n]/g, " "); }
    let result = "";
    for (let index = 0; index < line.length;) {
      const verb = line.slice(index).match(/^\\verb\*?([^\w\s]).*?\1/);
      if (verb) { result += " ".repeat(verb[0].length); index += verb[0].length; continue; }
      if (line[index] === "%") {
        let slashes = 0; for (let before = index - 1; before >= 0 && line[before] === "\\"; before--) slashes++;
        if (slashes % 2 === 0) { result += line.slice(index).replace(/[^\n]/g, " "); break; }
      }
      result += line[index++];
    }
    return result;
  }).join("");
  return Array.from(masked.matchAll(/\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g)).map(match => ({ target: match[1].trim(), label: (match[2] || match[1]).trim(), start: match.index!, end: match.index! + match[0].length }));
}
