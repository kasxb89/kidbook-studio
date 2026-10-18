const closingPunctuation = /^[，。！？、：；）》」』】〕〉”’…,.!?;:%\)\]\}]$/u;
const openingPunctuation = /^[（《「『【〔〈“‘\(\[\{]$/u;

export function wrapBookText(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line: string[] = [];
    for (const character of Array.from(paragraph)) {
      if (line.length && measure(line.join("") + character) > maxWidth) {
        const carry: string[] = [];
        // Closing punctuation stays with the previous glyph; opening marks move
        // with the following glyph instead of being stranded at a line end.
        if (closingPunctuation.test(character) && line.length > 1) {
          do { carry.unshift(line.pop()!); }
          while (line.length > 1 && closingPunctuation.test(carry[0]));
        }
        while (line.length > 1 && openingPunctuation.test(line.at(-1)!))
          carry.unshift(line.pop()!);
        lines.push(line.join(""));
        line = [...carry, character];
      } else line.push(character);
    }
    lines.push(line.join(""));
  }
  return lines;
}
