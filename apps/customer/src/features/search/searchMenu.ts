import type { MenuItem, VendorMenu } from '@foodcourt/shared';

export interface SearchHit {
  item: MenuItem;
  score: number;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Consonant skeleton absorbs common menu spelling drift: biryani / biriyani, chilli / chili.
const skeleton = (s: string) => s.replace(/[aeiouy\s]/g, '').replace(/(.)\1+/g, '$1');

export function searchMenu(menu: VendorMenu, query: string, vegOnly: boolean): SearchHit[] {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(' ');
  const hits: SearchHit[] = [];

  for (const category of menu.categories) {
    const categoryText = normalize(category.name);
    for (const item of category.items) {
      if (vegOnly && !item.veg) continue;
      const name = normalize(item.name);
      const haystack = `${name} ${categoryText}`;
      let fuzzyHaystack: string | null = null;
      let score = 0;
      let matched = true;

      for (const word of words) {
        if (haystack.includes(word)) continue;
        const wordSkeleton = skeleton(word);
        fuzzyHaystack ??= skeleton(haystack);
        if (word.length >= 4 && wordSkeleton.length >= 2 && fuzzyHaystack.includes(wordSkeleton)) {
          score += 2;
          continue;
        }
        matched = false;
        break;
      }
      if (!matched) continue;

      if (name.startsWith(q)) score -= 2;
      else if (name.includes(q)) score -= 1;
      hits.push({ item, score });
    }
  }

  return hits.sort((a, b) => a.score - b.score);
}
