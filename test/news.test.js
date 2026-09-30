const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeUrl, deduplicate, makeHtml } = require('../lib/core/news');
const { classify, offerType, fromFeedItem } = require('../lib/articles');
const { discover, normalizeGame, fetchGames } = require('../lib/steam');
const { parseCalendar } = require('../lib/events');
const { applyResults, enrichArticles } = require('../lib/ai');
const { build } = require('../scripts/build');
const now = new Date('2026-09-30T12:00:00Z');
const feed = { id: 'test', name: 'テスト媒体', url: 'https://example.test/rss' };
const article = (title, link, date = now.toISOString()) => fromFeedItem(feed, { title, link, pubDate: date, contentSnippet: '2026年10月1日発売。50%割引。2026年10月1日から8日まで。' }, now);
const entry = { item: { id: 123, type: 0 }, groups: ['top_sellers', 'new_releases', 'specials'], ranks: { top_sellers: 1 }, saleExpiration: '2026-10-08T17:00:00Z' };
const detail = { steam_appid: 123, type: 'game', name: 'Test Game', release_date: { coming_soon: false, date: '2026年9月30日' }, is_free: false, price_overview: { initial: 200000, final: 100000, currency: 'JPY', discount_percent: 50 }, genres: [{ description: 'RPG' }], supported_languages: '日本語<strong>*</strong>, 英語', header_image: 'https://example.test/image.jpg' };
const review = { total_reviews: 100, total_positive: 80, total_negative: 20, review_score_desc: 'Very Positive' };
const calendar = '<h2><strong>Autumn Sale 2026</strong> | 1 October, 2026 - 8 October, 2026</h2><h2>Winter Sale 2026 | 17 December, 2026 - 4 January, 2027</h2><h2>Next Fest | October 19 - October 26, 2026</h2><h2>2026 Fests</h2><table><tr><td>Oct 26<br>Nov 2</td><td>Steam Scream V</td><td><a href="https://partner.steamgames.com/doc/marketing/upcoming_events/test">More info</a></td></tr></table>';

test('RSS正規化・6カテゴリ・追跡パラメータ・古い記事の除外', () => {
  assert.equal(normalizeUrl('javascript:alert(1)'), '');
  assert.equal(normalizeUrl('https://example.test/a?utm_source=x#b'), 'https://example.test/a');
  assert.deepEqual(classify('話題の好評な新作を発売。Next Festでセール'), ['ニュース', '話題', '好評', '新作', 'セール', 'イベント']);
  assert.equal(article('old','https://example.test/old','2026-08-01T00:00:00Z'), null);
  assert.equal(article('『テストゲーム』発売', 'https://example.test/a').gameTitles[0], 'テストゲーム');
  assert.equal(offerType('基本無料の新作'), null);
  assert.equal(offerType('無料配布が開始'), 'giveaway-reported');
  assert.equal(offerType('週末は無料でプレイ可能'), 'free-play-reported');
});

test('ニュース重複の出典を保持し、別の続編・発売日・更新を混同しない', () => {
  const a = article('テストゲームの新作が発売', 'https://example.test/a');
  const b = article('テストゲームの新作が発売！', 'https://other.test/b'); b.sources[0].name = '他媒体';
  const result = deduplicate([a,b]);
  assert.equal(result.length, 1); assert.equal(result[0].sources.length, 2);
  assert.equal(deduplicate([article('『Test Game 2』が発売','https://example.test/2'),article('『Test Game 3』が発売','https://example.test/3')]).length,2);
  assert.equal(deduplicate([a,article(a.title,'https://example.test/later','2026-09-20T00:00:00Z')]).length,2);
});

test('Steam価格単位・好評基準・無料と不明価格・DLC除外', () => {
  const g = normalizeGame(entry, detail, review, now);
  assert.equal(g.currentPrice,1000); assert.equal(g.originalPrice,2000); assert.equal(g.positivePercent,80);
  assert.deepEqual(g.categories,['話題','好評','新作','セール']); assert.equal(g.saleEndsAt,entry.saleExpiration);
  assert.equal(g.japaneseSupported,true);
  const unknown = normalizeGame(entry,{...detail,price_overview:undefined},review,now);
  assert.equal(unknown.currentPrice,null); assert.equal(unknown.discountPercent,0);
  const free = normalizeGame(entry,{...detail,is_free:true,price_overview:undefined},review,now);
  assert.equal(free.offerType,'free-to-play'); assert.ok(!free.categories.includes('セール'));
  assert.equal(normalizeGame(entry,{...detail,type:'dlc'},review,now),null);
  assert.ok(!normalizeGame(entry,detail,{...review,total_reviews:99,total_positive:79},now).categories.includes('好評'));
  assert.equal(normalizeGame(entry,detail,{...review,total_positive:999},now).reviewCount,null);
  assert.equal(normalizeGame(entry,{...detail,price_overview:{...detail.price_overview,discount_percent:100,final:0}},review,now).offerType,'zero-price-offer');
});

test('Steamリストはカテゴリごとに制限し、重複appId・パッケージを除く', () => {
  const list = discover({ top_sellers:{items:[{id:123,type:0},{id:456,type:1}]}, specials:{items:[{id:123,type:0}]}, coming_soon:{items:[{id:789,type:0}]} });
  assert.equal(list.length,2); assert.deepEqual(list[0].groups,['top_sellers','specials']);
  assert.throws(()=>discover({unexpected:[]}),/形式変更/);
});

test('レビューAPI失敗でも商品情報を表示できる', async () => {
  const result = await fetchGames({ now, get: async url => {
    if(url.includes('featuredcategories')) return {top_sellers:{items:[entry.item]}};
    if(url.includes('appdetails')) return {123:{success:true,data:detail}};
    throw new Error('timeout');
  } });
  assert.equal(result.games.length,1); assert.equal(result.games[0].reviewCount,null); assert.equal(result.statuses[0].status,'partial');
});

test('公式日程から季節セール・年越し・Next Fest・テーマフェスを抽出', () => {
  const events = parseCalendar(calendar,now);
  assert.equal(events.length,4);
  assert.equal(events.find(e=>e.title.includes('Winter')).endDate,'2027-01-04');
  assert.equal(events.find(e=>e.title.includes('Next')).startDate,'2026-10-19');
  assert.equal(events.find(e=>e.title.includes('Scream')).endDate,'2026-11-02');
  assert.equal(parseCalendar('<h2>Next Fest | unknown</h2>',now).length,0);
  assert.equal(parseCalendar(calendar,new Date('2027-03-01')).length,0);
});

test('AIの根拠なき抽出、不正ID、不正カテゴリ、不当な統合を拒否', () => {
  const a=article('『テストゲーム』発売','https://example.test/a');
  const b=article('別のゲームがアップデート','https://example.test/b');
  const rows=[{id:a.id,summary:'ゲームの発売が発表された。',categories:['新作','fabricated'],gameTitles:['テストゲーム','幻のゲーム'],releaseDate:{text:'2026年10月1日',evidence:'2026年10月1日発売。'},saleInfo:{text:'90%',evidence:'90%割引。'},duplicateOf:b.id},{id:'fake',summary:'捏造'}];
  const result=applyResults([a,b],rows);
  assert.equal(result.length,2); assert.equal(result[0].releaseDate.text,'2026年10月1日');assert.equal(result[0].saleInfo,null);
  assert.ok(!result[0].categories.includes('fabricated'));assert.ok(!result[0].gameTitles.includes('幻のゲーム'));
});

test('AIが提案した重複を検証し、出典を統合', () => {
  const a=article('『テストゲーム』新作が発売','https://example.test/a');
  const b=article('『テストゲーム』新作が発売！','https://example.test/b');
  const result=applyResults([a,b],[{id:b.id,summary:'発売。',duplicateOf:a.id}]);
  assert.equal(result.length,1);assert.equal(result[0].sources.length,2);
});

test('AIは明示有効化時だけ1回送信し、不正応答・HTTP失敗で抜粋へ戻る', async () => {
  const articles=[article('テストゲーム発売','https://example.test/a')];let calls=0;
  const fake=async (url,options)=>{calls++;assert.ok(!url.includes('unit-test-key'));assert.equal(options.headers['x-goog-api-key'],'unit-test-key');return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({articles:[{id:articles[0].id,summary:'発売が発表された。'}]})}]}}],usageMetadata:{totalTokenCount:12}})};};
  assert.equal((await enrichArticles(articles,{key:'unit-test-key',model:'unit-model',fetchImpl:fake})).status,'disabled');assert.equal(calls,0);
  const result=await enrichArticles(articles,{enabled:true,key:'unit-test-key',model:'unit-model',fetchImpl:fake});assert.equal(result.status,'ok');assert.equal(result.usage.totalTokens,12);assert.equal(calls,1);
  const broken=await enrichArticles(articles,{enabled:true,key:'unit-test-key',model:'unit-model',fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'broken'}]}}]})})});assert.equal(broken.status,'error');assert.deepEqual(broken.articles,articles);
  const failure=await enrichArticles(articles,{enabled:true,key:'unit-test-key',model:'unit-model',fetchImpl:async()=>({ok:false})});assert.equal(failure.status,'error');
});

const testRoot=()=>{const dir=path.resolve(__dirname,'../history/test-runs');fs.mkdirSync(dir,{recursive:true});return fs.mkdtempSync(path.join(dir,'case-'));};
test('ビルドはゲームと記事を分離し、前回を保全、全件失敗で更新しない', async () => {
  const root=testRoot();
  const get=async url=>url.includes('featuredcategories')?{top_sellers:{items:[entry.item]}}:url.includes('appdetails')?{123:{success:true,data:detail}}:url.includes('appreviews')?{success:1,query_summary:review}:url.includes('upcoming_events')?calendar:'rss';
  const options={root,now,feeds:[feed],get,parse:async()=>({items:[{title:'テストゲーム発売',link:'https://example.test/a',pubDate:now.toISOString()}]})};
  const first=await build(options);assert.equal(first.games.length,1);assert.equal(first.articles.length,1);assert.equal(first.events.length,4);assert.equal(first.ai.status,'disabled');
  const second=await build({...options,now:new Date('2026-10-01T12:00:00Z'),get:async url=>{if(url===feed.url)throw new Error('timeout');return get(url);}});
  assert.equal(second.articles[0].stale,true);assert.ok(fs.readdirSync(path.join(root,'history')).length);
  const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8'),json=fs.readFileSync(path.join(root,'public/data.json'),'utf8');
  await assert.rejects(()=>build({...options,get:async()=>{throw new Error('all failed');}}),/前回のページとデータを保持/);
  assert.equal(fs.readFileSync(path.join(root,'public/index.html'),'utf8'),html);assert.equal(fs.readFileSync(path.join(root,'public/data.json'),'utf8'),json);
});

test('出力JSONのscript注入を防ぎ、ブラウザJSを構文検証', () => {
  assert.ok(!makeHtml('__NEWS_DATA__',{title:'</script><script>alert(1)</script>'}).includes('</script>'));
  const template=fs.readFileSync(path.resolve(__dirname,'../scripts/template.html'),'utf8');
  const script=[...template.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  assert.doesNotThrow(()=>new vm.Script(script));
});
