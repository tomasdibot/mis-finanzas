// Personal rules (the user's own, stored in their Profile) applied over the shared rules.js:
// merchant renames, and words that pick a category (checked before the Template's words, so they win).

export const KINDS = ["name", "word", "word_in"];

/** rules + [{ kind, match, value }] -> a new rules object (rules itself is never changed). */
export function withPersonal(rules, personal = []) {
  const renames = {}, out = [], inn = [];
  for (const { kind, match, value } of personal) {
    if (!match || !value) continue;
    if (kind === "name") renames[match] = value;
    else if (kind === "word") out.push([value, [match]]);
    else if (kind === "word_in") inn.push([value, [match]]);
  }
  return { ...rules, renames, keywords: [...out, ...rules.keywords], keywordsIn: [...inn, ...(rules.keywordsIn ?? [])] };
}
