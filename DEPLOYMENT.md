# 公開・定期更新の準備

初版はローカル作成と検証まで。公開URLとGitHubリポジトリはまだ作成していません。日次のGitHub Actionsワークフローは `.github/workflows/daily_update.yml` に準備済みです。

ファッション版と同じ静的ページ方式です。親ワークスペース、PKB、秘密情報、ログ、履歴はリポジトリへ含めません。

初版はGitHub Pagesを想定します。GitHub FreeではPagesの提供元リポジトリをPublicにする必要があり、公開されたURLは誰でも閲覧できます。PrivateリポジトリからPagesを使うにはPro等の対象プランが必要です。公開したくない情報を入れないでください。既定のアプリデータは公開RSSの短い記事抜粋とSteam公開情報です。可視性の確認後、専用リポジトリ `game-news-app` へアプリ単体を配置します。

## 初回だけ行う設定

1. 独立リポジトリ `game-news-app` を作り、アプリのファイルだけを `main` へ配置。
2. **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定。
3. **Actions → Daily Game News Update & Deploy → Run workflow** で `main` を選んで実行。
4. `github-pages` のデプロイ成功を確認。URLは `https://<GitHubユーザー名>.github.io/game-news-app/`。

毎日5:30 JSTの定期実行は、初回のGitHub Pages設定とデプロイ成功の後に有効になります。初回にActionsを設定していなければPages工程で停止します。PagesのSourceを設定してから `main` でワークフローを再実行してください。

導入時に決めること:
1. 公開URLを誰でも閲覧できる状態にするか。
2. 更新頻度は1日1回。大量取得を避けるため候補数制限を維持。
3. AIは初版では無効。利用するときは公開RSSの見出し・抜粋をGoogleへ送ること、モデル、予算を別途確認。
4. 失敗時はページ公開の工程が停止し前回サイトを維持。ソース状況とログをActions実行記録から確認し、手動再実行。

現行の `build` はローカル履歴を保全します。クラウド定期運用では、前回の `public/data.json` を次回へ引き継ぐ仕組みとログ保存期間を設定してください。引継ぎがなければ、初回と同様に失敗系統の前回データを表示できません。

価格・レビュー・イベントページの形式変更は `lib/steam.js` / `lib/events.js` の担当範囲です。変更時はテスト後に再配置します。全文転載、Steamログイン、購入、無料配布の受取り、Discord送信は実装していません。
