const Parser = require('rss-parser');
const { request } = require('./core/http');
const { cleanText, normalizeUrl, idFor, deduplicate } = require('./core/news');
const CATEGORIES = ['話題', '好評', '新作', 'セール', 'イベント', 'ニュース'];
const parser = new Parser();
function classify(title) {
  const t = cleanText(title).normalize('NFKC');
  const cats = ['ニュース'];
  if (/話題|人気|売上|売り上げ|同時接続|ヒット|急上昇/.test(t)) cats.push('話題');
  if (/好評|高評価|圧倒的に好評/.test(t)) cats.push('好評');
  if (/新作|発売|リリース|配信開始|発売予定|予約開始|発表/.test(t)) cats.push('新作');
  if (/セール|割引|値引き|無料配布|無料プレイ|フリープレイ|無料提供|無料で配布|無料で入手|無料でプレイ|無料開放|%オフ|％オフ/.test(t)) cats.push('セール');
  if (/フェス|Fest\b|ゲームショウ|ゲームショー|TGS\b|gamescom|The Game Awards|Summer Game Fest|State of Play|Nintendo Direct|ニンテンドーダイレクト|イベント|フリーウィークエンド|季節セール|オータムセール|ウィンターセール|サマーセール|スプリングセール/i.test(t)) cats.push('イベント');
  return [...new Set(cats)];
}
function offerType(text) {
  if (/無料配布|無料で配布|無料提供|無料で入手|無料で貰|無料でゲット/.test(text)) return 'giveaway-reported';
  if (/無料プレイ|無料でプレイ|無料開放|フリープレイ|フリーウィークエンド/i.test(text)) return 'free-play-reported';
  if (/セール|割引|値引き|%オフ|％オフ/.test(text)) return 'sale-reported';
  return null;
}
function fromFeedItem(feed, item, now = new Date()) {
  const link = normalizeUrl(item.link || item.guid), title = cleanText(item.title);
  if (!link || !title) return null;
  const timestamp = Date.parse(item.isoDate || item.pubDate || '') || 0;
  if (timestamp && (timestamp < now.getTime() - 30 * 86400000 || timestamp > now.getTime() + 86400000)) return null;
  const snippet = cleanText(item.contentSnippet || item.summary || item.content).slice(0, 240);
  const gameTitles = [...new Set([...title.matchAll(/[『「]([^』」]{2,100})[』」]/g)].map(x => x[1]))].slice(0, 6);
  return { id: idFor(link), kind: 'article', title, link, snippet, timestamp,
    sourceId: feed.id, sourceName: feed.name, sources: [{ name: feed.name, link }],
    categories: classify(title), offerType: offerType(title), gameTitles,
    releaseDate: null, saleInfo: null, eventPeriod: null, aiSummary: null, fetchedAt: now.toISOString() };
}
async function fetchArticles(feeds, { get = request, parse = s => parser.parseString(s), now = new Date() } = {}) {
  const articles = [], statuses = [];
  // Migrated RSS fetch/partial failure pipeline from fashion-news.
  for (const feed of feeds) {
    try {
      const parsed = await parse(await get(feed.url, { json: false }));
      const items = (parsed.items || []).slice(0, 50).map(item => fromFeedItem(feed, item, now)).filter(Boolean).slice(0, 20);
      articles.push(...items);
      statuses.push({ id: feed.id, name: feed.name, status: items.length ? 'ok' : 'empty', count: items.length, fetchedAt: now.toISOString() });
    } catch (e) { statuses.push({ id: feed.id, name: feed.name, status: 'error', count: 0, error: /^HTTP \d+$/.test(e.message) ? e.message : '取得・解析失敗' }); }
  }
  return { articles: deduplicate(articles), statuses };
}
module.exports = { CATEGORIES, classify, offerType, fromFeedItem, fetchArticles };
