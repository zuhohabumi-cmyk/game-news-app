const { request, mapLimit } = require('./core/http');
const { cleanText, normalizeUrl } = require('./core/news');
const GROUPS = ['top_sellers', 'specials', 'new_releases', 'coming_soon'];
function discover(payload, perGroup = 10) {
  if (!GROUPS.some(key => Array.isArray(payload?.[key]?.items))) throw new Error('Steamリスト形式変更');
  const games = new Map();
  // Round robin ensures every group gets represented before the request cap.
  for (let rank = 0; rank < perGroup; rank++) for (const group of GROUPS) {
    const item = payload[group]?.items?.[rank];
    if (!item || item.type !== 0 || !Number.isSafeInteger(item.id) || item.id <= 0) continue;
    if (!games.has(item.id)) games.set(item.id, { item, groups: [], ranks: {} });
    const game = games.get(item.id); game.groups.push(group); game.ranks[group] = rank + 1;
    if (group === 'specials') game.saleExpiration = Number.isFinite(item.discount_expiration) ? new Date(item.discount_expiration * 1000).toISOString() : null;
  }
  return [...games.values()].slice(0, 40);
}
const money = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v / 100 : null;
function normalizeGame(entry, detail, review, now = new Date()) {
  const id = entry.item.id;
  if (detail?.steam_appid !== id || detail.type !== 'game' || !detail.name) return null;
  const price = detail.price_overview;
  const initial = detail.is_free ? 0 : money(price?.initial);
  const current = detail.is_free ? 0 : money(price?.final);
  const discount = initial !== null && initial > 0 && current !== null && current <= initial && Number.isFinite(price?.discount_percent) && price.discount_percent >= 0 && price.discount_percent <= 100 ? price.discount_percent : 0;
  const validReview = review && Number.isInteger(review.total_reviews) && review.total_reviews >= 0 && Number.isInteger(review.total_positive) && Number.isInteger(review.total_negative) && review.total_positive >= 0 && review.total_negative >= 0 && review.total_positive + review.total_negative === review.total_reviews;
  const count = validReview ? review.total_reviews : null;
  const positivePercent = count > 0 ? Math.round(review.total_positive / count * 1000) / 10 : null;
  const comingSoon = Boolean(detail.release_date?.coming_soon);
  const categories = [];
  if (entry.groups.includes('top_sellers')) categories.push('話題');
  if (!comingSoon && count >= 100 && positivePercent >= 80) categories.push('好評');
  if (comingSoon || entry.groups.includes('new_releases')) categories.push('新作');
  if (discount > 0) categories.push('セール');
  if (!categories.length) return null;
  const saleEndsAt = discount > 0 ? entry.saleExpiration || null : null;
  return { id: `steam-${id}`, appId: id, kind: 'game', title: cleanText(detail.name),
    thumbnail: normalizeUrl(detail.header_image || entry.item.header_image), steamUrl: `https://store.steampowered.com/app/${id}/`,
    releaseDate: cleanText(detail.release_date?.date) || null, comingSoon,
    originalPrice: initial, currentPrice: current, currency: detail.is_free ? 'JPY' : price?.currency || null,
    discountPercent: discount, saleEndsAt, offerType: detail.is_free ? 'free-to-play' : discount === 100 && current === 0 ? 'zero-price-offer' : discount > 0 ? 'discount' : null,
    reviewLabel: validReview ? cleanText(review.review_score_desc) : null, reviewCount: count, positivePercent,
    reviewScope: '全言語・全購入種別', genres: (detail.genres || []).map(x => cleanText(x.description)), tags: [],
    supportedLanguages: cleanText(detail.supported_languages), japaneseSupported: /日本語/.test(cleanText(detail.supported_languages)),
    description: cleanText(detail.short_description).slice(0, 240), aiSummary: null, categories,
    groups: entry.groups, ranks: entry.ranks, fetchedAt: now.toISOString(), detailsFetchedAt: now.toISOString(),
    reviewsFetchedAt: validReview ? now.toISOString() : null, reviewStatus: validReview ? 'ok' : 'unavailable' };
}
async function fetchGames({ get = request, now = new Date() } = {}) {
  const statuses = [], games = [];
  let entries;
  try { entries = discover(await get('https://store.steampowered.com/api/featuredcategories/?cc=jp&l=japanese')); }
  catch (e) { return { games, statuses: [{ id: 'steam', name: 'Steamストア', status: 'error', count: 0, error: 'リスト取得・解析失敗' }] }; }
  let errors = 0, reviewErrors = 0;
  const results = await mapLimit(entries, 2, async entry => {
    try {
      const id = entry.item.id;
      const payload = await get(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=jp&l=japanese`);
      if (!payload[id]?.success) throw new Error('detail unavailable');
      const detail = payload[id].data;
      if (detail?.type !== 'game') return null;
      let review = null;
      if (!detail.release_date?.coming_soon) {
        try {
          const response = await get(`https://store.steampowered.com/appreviews/${id}?json=1&filter=all&language=all&purchase_type=all&num_per_page=1`);
          if (response.success !== 1) throw new Error('review unavailable');
          review = response.query_summary;
        } catch { reviewErrors++; }
      }
      return normalizeGame(entry, detail, review, now);
    } catch { errors++; return null; }
  });
  games.push(...results.filter(Boolean));
  statuses.push({ id: 'steam', name: 'Steamストア', status: games.length ? errors || reviewErrors ? 'partial' : 'ok' : 'error', count: games.length, detailErrors: errors, reviewErrors, fetchedAt: now.toISOString() });
  return { games, statuses };
}
module.exports = { discover, normalizeGame, fetchGames };
