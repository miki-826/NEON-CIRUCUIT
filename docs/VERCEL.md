# Vercelで公開する

このゲームは静的HTML/CSS/JavaScriptとしてVercelで配信できます。ゲーム処理はブラウザで動き、サーバーやデータベースは不要です。

## 初回設定

1. Vercelで「Add New → Project」から `miki-826/NEON-CIRUCUIT` をImportします。
2. Framework Presetは **Other**、Root Directoryはリポジトリのルートにします。
3. `vercel.json` によりBuild Commandは `node tools/build-static.mjs`、Output Directoryは `dist` になります。依存パッケージのインストールは不要です。Node.jsは20以上を使用してください。
4. プロジェクトの **Settings → Git → Git Large File Storage (LFS)** を有効にします。
5. LFS有効化後は **Redeploy** してください。初回Import時にLFS未取得でビルドが失敗しても、有効化後の再デプロイで取得できます。

動画・音楽・3DモデルはLFS管理です。有効にしないと実体ではなくポインタファイルになり、ビルドの検証が失敗します。

公式資料: [Git設定・LFS](https://vercel.com/docs/project-configuration/git-settings)、[Git連携](https://vercel.com/docs/git)。

## ローカルで公開用ファイルを確認

```powershell
git lfs pull
node tools/build-static.mjs
node tools/verify_combat.cjs
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

ブラウザで `http://127.0.0.1:8000` を開きます。`dist` にはゲームと必要素材のみを出力し、開発ツール・Git情報・共同開発ドキュメントは含めません。

## 公開後の確認と共同開発

- オープニング動画、タイトル画面、3クラスの戦闘、スキル画像、BGM・発射音を確認します。ブラウザの音声再生制限があるため、開始ボタンを操作して確認してください。
- WebGL対応ブラウザが必要です。3D表示が利用できない場合の2D表示も確認してください。
- Git連携後はブランチのPreviewで確認し、PRレビュー後にmainへマージする運用にします。Production Branchはmainです。
- 動画や音楽の配信量はVercelの利用量に影響します。利用状況はダッシュボードで確認してください。
- この設定の追加だけではVercelプロジェクトや公開URLは作成されません。

## 変更が本番に反映されない場合

- 作業ブランチへのpushは本番mainの更新ではありません。PRをmainへマージし、VercelのProductionデプロイがそのコミットで成功していることを確認します。作業ブランチはPreviewで確認します。
- Vercel側でProduction Branchを変更している場合は、そのブランチがデプロイ対象です。
- `tools/build-static.mjs`は公開ファイルを明示的にコピーします。新しいJS/CSSを追加したらentriesにも追加し、`node tools/build-static.mjs`でdistを生成してください。生成後はindex.htmlのローカル参照がdist内に存在するか検証し、コピー漏れをビルドエラーにします。
