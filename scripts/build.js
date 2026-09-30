const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { CATEGORIES, fetchArticles } = require('../lib/articles');
const { fetchGames } = require('../lib/steam');
const { fetchEvents } = require('../lib/events');
const { enrichArticles } = require('../lib/ai');
const { makeHtml, deduplicate, titleKey } = require('../lib/core/news');
const ROOT = path.resolve(__dirname, '..');
function writeNew(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { encoding: 'utf8', flag: 'wx' });
}
function readPrevious(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'public', 'data.json'), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return {}; throw new Error('前回data.jsonが破損しています。保全したまま停止します'); }
}
function recover(result, previous, now) {
  const failedFeeds = new Set(result.sources.filter(s => ['error', 'empty'].includes(s.status)).map(s => s.id));
  const staleArticles = (previous.articles || []).filter(a => failedFeeds.has(a.sourceId) && a.timestamp && a.timestamp >= now.getTime() - 30 * 86400000).map(a => ({ ...a, stale: true, aiSummary: null }));
  result.articles = deduplicate([...result.articles, ...staleArticles]);
  if (failedFeeds.has('steam')) result.games = (previous.games || []).map(g => ({ ...g, stale: true }));
  if (failedFeeds.has('steam-calendar')) result.events = (previous.events || []).filter(e => e.endDate >= now.toISOString().slice(0, 10)).map(e => ({ ...e, stale: true }));
  for (const s of result.sources) {
    if (failedFeeds.has(s.id)) s.previousFetchedAt = previous.sources?.find(p => p.id === s.id)?.fetchedAt || previous.sources?.find(p => p.id === s.id)?.previousFetchedAt || null;
  }
  return result;
}
async function build({ root = ROOT, feeds, get, parse, now = new Date(), ai = {} } = {}) {
  const started = Date.now(), runId = now.toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex');
  const previous = readPrevious(root);
  const sourceFeeds = feeds || JSON.parse(fs.readFileSync(path.join(root, 'data', 'feeds.json'), 'utf8'));
  const [news, steam, calendar] = await Promise.all([fetchArticles(sourceFeeds, { get, parse, now }), fetchGames({ get, now }), fetchEvents({ get, now })]);
  const sources = [...news.statuses, ...steam.statuses, ...calendar.statuses];
  for (const source of sources) console.log(`[Source] ${source.name}: ${source.status} / ${source.count}件`);
  if (!news.articles.length && !steam.games.length && !calendar.events.length) {
    writeNew(path.join(root, 'logs', `${runId}.json`), JSON.stringify({ runId, status: 'failed', sources, durationMs: Date.now() - started }, null, 2));
    throw new Error('有効な情報を取得できませんでした。前回のページとデータを保持します');
  }
  const recovered = recover({ articles: news.articles, games: steam.games, events: calendar.events, sources }, previous, now);
  const aiResult = await enrichArticles(recovered.articles, ai);
  const articles = aiResult.articles.map(a => ({ ...a, relatedAppIds: recovered.games.filter(g => {
    const key = titleKey(g.title);
    return key.length >= 4 && (a.gameTitles.some(t => titleKey(t) === key) || titleKey(a.title).includes(key));
  }).map(g => g.appId) }));
  const games = recovered.games.map(g => {
    const related = articles.find(a => a.aiSummary && a.relatedAppIds.includes(g.appId));
    return { ...g, aiSummary: related ? { text: related.aiSummary, articleId: related.id, link: related.link, basis: '関連ニュースのAI要約' } : null };
  });
  const { articles: ignored, ...aiStatus } = aiResult;
  const data = { schemaVersion: 1, updatedAt: now.toISOString(), region: 'JP', categories: CATEGORIES, games, articles, events: recovered.events, sources, ai: aiStatus };
  const template = fs.readFileSync(path.join(ROOT, 'scripts', 'template.html'), 'utf8');
  const html = makeHtml(template, data);
  // Back up BOTH prior artifacts before touching either. Never remove existing files.
  for (const file of ['index.html', 'data.json']) {
    const current = path.join(root, 'public', file);
    if (fs.existsSync(current)) {
      const backup = path.join(root, 'history', runId, file);
      fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.copyFileSync(current, backup, fs.constants.COPYFILE_EXCL);
    }
  }
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  const dataFile = path.join(root, 'public', 'data.json'), htmlFile = path.join(root, 'public', 'index.html');
  writeNew(dataFile + '.' + runId + '.tmp', JSON.stringify(data, null, 2));
  writeNew(htmlFile + '.' + runId + '.tmp', html);
  fs.renameSync(dataFile + '.' + runId + '.tmp', dataFile);
  fs.renameSync(htmlFile + '.' + runId + '.tmp', htmlFile);
  writeNew(path.join(root, 'logs', `${runId}.json`), JSON.stringify({ runId, status: 'ok', sources, ai: aiStatus, counts: { games: games.length, articles: articles.length, events: data.events.length }, durationMs: Date.now() - started }, null, 2));
  console.log(`[Build] ゲーム${games.length}件 / 記事${articles.length}件 / イベント${data.events.length}件 / ${aiResult.reason}`);
  return data;
}
if (require.main === module) build({ ai: { enabled: process.argv.includes('--ai') } }).catch(e => { console.error(`[Build] ${e.message}`); process.exitCode = 1; });
module.exports = { build, recover };
