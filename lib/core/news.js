// Migrated from fashion-news/lib/articles.js: source-neutral news primitives.
const crypto = require('node:crypto');
const { decodeHTML } = require('entities');
function cleanText(value) {
  return decodeHTML(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function normalizeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    url.pathname = url.pathname.replace(/\/$/, '') || '/';
    return url.toString();
  } catch { return ''; }
}
const idFor = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 20);
const titleKey = title => cleanText(title).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 8 || b.length < 8) return 0;
  const grams = value => new Set(Array.from({ length: value.length - 1 }, (_, i) => value.slice(i, i + 2)));
  const x = grams(a), y = grams(b);
  let common = 0;
  for (const gram of x) if (y.has(gram)) common++;
  return (2 * common) / (x.size + y.size);
}
function canMerge(a, b, threshold = 0.9) {
  if (a.link === b.link) return true;
  if (!a.timestamp || !b.timestamp || Math.abs(a.timestamp - b.timestamp) > 3 * 86400000) return false;
  const x = titleKey(a.title), y = titleKey(b.title);
  // Distinct sequel numbers / dates / discount amounts must not merge.
  const nums = s => (s.match(/\d+/g) || []).join(',');
  if (nums(x) !== nums(y)) return false;
  return Boolean(x && (x === y || similarity(x, y) >= threshold));
}
function mergeSources(target, other) {
  target.sources = [...new Map([...target.sources, ...other.sources].map(s => [s.link, s])).values()];
  target.categories = [...new Set([...target.categories, ...other.categories])];
  target.mergedIds = [...new Set([...(target.mergedIds || []), other.id, ...(other.mergedIds || [])])];
}
function deduplicate(articles) {
  const unique = [];
  for (const article of [...articles].sort((a, b) => b.timestamp - a.timestamp)) {
    const existing = unique.find(a => canMerge(a, article));
    if (existing) mergeSources(existing, article);
    else unique.push({ ...article, sources: [...article.sources], categories: [...article.categories] });
  }
  return unique;
}
// Same safe JSON embedding as fashion-news/scripts/build.js.
function makeHtml(template, data) {
  return template.replace('__NEWS_DATA__', JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'));
}
module.exports = { cleanText, normalizeUrl, idFor, titleKey, similarity, canMerge, mergeSources, deduplicate, makeHtml };
