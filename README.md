# ゲームニュース / Game Dispatch

Steamの話題・好評・新作・セールと、公式イベント・ゲームニュースを1ページで確認する独立アプリです。ファッションニュースのRSS・静的ページ基盤と、AIニュースのGemini方式を移植しています。既存2アプリの設定・データには依存しません。

## すぐ見る

生成済みの `public/index.html` をブラウザで開けます。通常は以下のローカルサーバーを使います。これは生成済み情報の表示だけで、情報の更新は行いません。

```powershell
cd C:\Users\zuhoh\Desktop\AI_assistant\apps\game-news
npm.cmd run serve
```

ブラウザで **http://127.0.0.1:4175** を開きます。起動したターミナルで `Ctrl+C` を押すとサーバーを停止できます。既に起動中の場合は同じURLを開いてください。

## 情報を更新する

Node.js 20以上が必要です。初回の依存関係の復元と、その後の更新は次のとおりです。

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run build
```

`build` は公開RSS・Steamから情報を取得し、`public/index.html` と `public/data.json` を更新します。表示中のブラウザは再読み込みしてください。APIキーは不要です。更新は手動で、定期実行はまだ登録していません。

GitHub Pages配備後は `.github/workflows/daily_update.yml` が毎日 5:30 JST ごろに取得・更新します。GitHub Actionsのスケジュールは混雑時に遅れることがあります。Actions画面からの手動実行、`main` へのpushでも更新します。最新の `public/data.json` だけをリポジトリへ保存して前回値を次の実行へ渡し、ページ本体は Pages artifact から配信します。AIは無効のままなので、キーと追加費用は不要です。

## 表示と判定

| カテゴリ | 初版の根拠 |
| --- | --- |
| 🔥 話題 | 日本Steamの売れ筋リスト掲載＋RSS見出しの人気・話題関連語 |
| ⭐ 好評 | 取得したゲームのうちレビュー100件以上・好評率80%以上＋媒体の好評報道 |
| 🆕 新作 | Steam新作欄・発売予定＋記事の発売/発表関連語 |
| 💰 セール | Steam現在割引＋媒体の無料配布/無料プレイ/セール報道 |
| 🎮 イベント | Steamworks公式の今後180日の日程＋記事のフェス/ゲームショウ等 |
| 📰 ニュース | 発表・DLC・アップデート・開発・業界を含むRSS全記事 |

同じゲームや記事は関連する複数カテゴリに表示されます。合計件数は重複しない情報数です。カテゴリごとに6件を表示し、「残り○件を表示」で全件を確認できます。ゲーム名・ジャンル・記事キーワードで検索し、Steam/記事/公式日程、オファーの種類、未読/既読で絞り込めます。既読状態はブラウザの `game_news_read_ids_v1` に保存し、AI・ファッションニュースとは独立しています。

Steamは4リスト各最大10件・合計最大40候補のうちゲーム本体だけを採用します。DLC、パッケージ、ソフトウェアは除外します。「好評」はこの取得範囲の判定で、Steam全作品の評価ランキングではありません。レビューは全言語・全購入種別。ジャンルと言語は商品詳細から取得し、ユーザータグはまだ取得していません。

価格は日本ストア、通貨はAPIの値を使用します。予定作品などの未発表価格は0円にせず欠損として表示します。**基本無料、0円オファー、無料配布の報道、無料プレイの報道は別扱い**です。無料配布はニュース掲載時点の報道で、現在の配布状況はリンク先で確認してください。配布の受取りや購入は自動化しません。Steam公式日程は現地日付で表示し、時間帯が不明な日程を日本時間へ変換しません。

## 任意のAI処理

既定ではAI送信は無効で、RSS抜粋を表示します。実AIの応答品質・費用はまだ検証していません。送信と利用費用を承認した後に、実行環境へ次の2つの環境変数を設定して `npm.cmd run build:ai` を実行してください。

- `GEMINI_API_KEY`: Gemini APIキー。ログ・HTML・URLに出しません。
- `GAME_NEWS_AI_MODEL`: 使用するモデルID。利用可能なIDは [Gemini公式モデル一覧](https://ai.google.dev/gemini-api/docs/models) で確認します。

キーのあるファイルや `01_private/` はアプリが自動で読みません。キーのコピーをアプリや成果物へ保存しないでください。

AIの入力は最大30記事の公開ID・見出し・RSS抜粋だけ。要約、ゲーム名抽出、分類、発売日・セール条件・イベント期間抽出、重複候補の判定を行います。抽出の根拠は入力中の引用を検証し、重複の提案も日時・タイトル・数字を照合してから統合します。Steam価格やレビューの確定値はAIで書き換えません。ゲームのAI要約欄には関連ニュースの要約と元記事リンクを紐づけます。

API呼出しは1回、60秒まで、自動モデル切替や再送はありません。未設定、HTTPエラー、不正JSON、利用可能な要約がない場合はRSS表示へ戻ります。Googleのモデル別料金・上限は契約環境で確認してください。

## 情報源・保全・ログ

- [4Gamer RSS](https://www.4gamer.net/rss/rss.shtml)、[AUTOMATON RSS](https://automaton-media.com/feed/)、[Steam公式ニュース](https://store.steampowered.com/feeds/news/collection/steam/?l=japanese)。`data/feeds.json` で設定。
- Steam `featuredcategories` / `appdetails` は公開ストアのJSONエンドポイント。正式な安定性保証は未確認のため、形式変更時は取得失敗を表示。
- レビュー: [Steamworks公式API](https://partner.steamgames.com/doc/store/getreviews)。集計だけ保存し、レビュー本文・投稿者データを保存しない。
- イベント: [Steamworks公式予定](https://partner.steamgames.com/doc/marketing/upcoming_events)。ページ形式が変わって抽出できない場合は警告。

30日より古いRSS記事を除外します。各情報の取得日時、記事の掲載日時、ソースごとの成否を表示します。失敗した系統は前回データを「前回取得」として表示します。全情報源から新しい有効データを取れない場合はビルドを失敗させ、前回のページとデータを維持します。

出力の更新前に `history/<実行ID>/` へ前回HTML/JSONを複製します。`logs/<実行ID>.json` にソース状況、件数、時間、AIモデルとトークン使用量を保存します。キーやレビュー投稿者のデータは保存しません。履歴・ログ・秘密設定・node_modulesはGit除外です。復元するときも現在の `public/` を別名で複製してから、選んだ履歴を戻してください。

## 構成

```text
data/feeds.json         ニュース取得元
lib/core/news.js        URL・ID・類似度・重複統合・安全なJSON埋込み
lib/core/http.js        通信と同時実行数制限
lib/articles.js         ゲーム記事の正規化・分類・取得
lib/steam.js            Steam商品/レビュー/価格
lib/events.js           公式イベント日程
lib/ai.js               任意AIアダプター・検証
scripts/build.js        収集→補完→AI→保存・履歴・ログ
scripts/template.html   スマホ対応UI
scripts/serve.js        ローカル表示
public/data.json        games/articles/events/sources を別配列で保存
```

共通部分は `lib/core/` に分離し、後から共通パッケージへ移せる構成です。初版では独立配備のため移植しており、既存2アプリと同一の共通パッケージを参照する方式にはまだ変更していません。

検証: `npm.cmd test`。外部通信やAI費用なしで異常系・分類・価格・保全・AI応答を検証します。テスト成果物はアプリ内の `history/test-runs/` に保全します。

## 次の拡張
Steamウィッシュリスト、所有ゲーム除外、好み/興味なし、価格履歴と過去最安、SNS急上昇、レビュー増加、発売/セール通知、AI週次おすすめ、Discord通知は初版に含めません。各機能の取得方法と権限を確認してから追加できます。

公開と定期運用は [DEPLOYMENT.md](DEPLOYMENT.md) を参照してください。
