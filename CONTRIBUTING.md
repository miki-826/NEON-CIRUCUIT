# 共同開発の進め方

ゲームを変更する前に、READMEの起動手順を確認してください。最初のクローン後は `git lfs pull` が必要です。

## 1. 作業内容を共有する

- 不具合や改善案をIssueに書き、担当者を決めます。小さい修正でも、誰がどのファイルを触るか共有してください。
- `game.js` は戦闘とメニューの処理を含むため、同時編集が衝突しやすいファイルです。変更範囲を先に相談します。
- 1つのPull Requestでは1つの目的を扱います。音の調整と敵AIの変更など、別の目的は別のブランチに分けると確認しやすくなります。

## 2. ブランチを作る

共同編集者として招待されている場合は、リポジトリをクローンして作業用ブランチを作ります。

```bash
gh repo clone miki-826/NEON-CIRUCUIT
cd NEON-CIRUCUIT
git lfs install
git lfs pull
git switch main
git pull --ff-only origin main
git switch -c feat/your-name-enemy-pattern
```

ブランチ名の例は `feat/miki-new-skill`、`fix/your-name-audio`、`docs/your-name-setup` です。

書き込み権限がない場合はForkを使います。

```bash
gh repo fork miki-826/NEON-CIRUCUIT --clone
cd NEON-CIRUCUIT
git lfs install
git lfs pull
git remote -v
git switch -c fix/your-name-bug
```

Forkでは `origin` が自分のFork、`upstream` が元リポジトリになっていることを確認してください。設定が異なる場合は、`git remote -v` の表示に合わせて取得先を選びます。Git LFSの保存容量や転送量は利用先アカウントの枠を消費するため、大容量素材を追加する前に管理者へ相談します。

## 3. 変更を検証する

```bash
node tools/check.mjs
python -m http.server 8000 --bind 127.0.0.1
```

ブラウザで `http://127.0.0.1:8000/` を開き、変更に関係する操作を確認します。

- 起動画面 → オープニング再生・スキップ → 出撃 → クラス・マスター選択。
- WASD・矢印キー・タッチ移動、自動攻撃、レベルアップ、スキル別の充填表示。
- Escメニュー、ノード接続、BGMと効果音の個別切り替え、戦闘への復帰。
- 描画を変えた場合は3D表示と2Dフォールバック、狭い画面、動きを減らす設定。
- 音や映像を変えた場合は、再生・スキップ・一時停止と、別の音が重なった場合の聞きやすさ。

`tools/check.mjs` は構文、ローカル参照、必須素材とLFSポインターの取得漏れを確認します。ゲームバランスや見た目の正しさは手動確認が必要です。戦闘処理を変えた場合は、加えて `node tools/verify_combat.cjs` を実行します。このテストはブラウザを模した環境で行う固定条件の検証です。

## 4. push前に確認する

```bash
git status --short
git diff --check
git diff
git add game.js
git diff --cached --stat
git diff --cached
git commit -m "fix: describe the player-visible change"
git push -u origin HEAD
gh pr create --base main
```

`git add game.js` は例です。自分が変更したファイルを明示して追加します。別の人の途中の変更まで一括でコミットしないでください。

- `main` への直接pushとforce pushは避け、作業ブランチからPull Requestを作ります。
- push前に `git remote -v` と `git branch --show-current` を見て、送信先とブランチを確認します。
- `git diff --cached` で、APIキー、トークン、個人情報、ローカルの絶対パス、作業用ファイルが含まれていないか確認します。
- 動画、音源、モデルの追加・差し替えでは、下のGit LFS手順を確認します。
- Pull Requestには目的、変更内容、確認した操作、スクリーンショットや短い動画、既知の問題を記載します。
- レビュー担当者が確認してからマージします。リポジトリの保護設定が未設定でも、この手順で進めます。

ForkからのPull Requestは、送信先を指定できます。

```bash
gh pr create --repo miki-826/NEON-CIRUCUIT --base main --head YOUR_GITHUB_NAME:fix/your-name-bug
```

## 5. ほかの人の変更を取り込む

共同編集者の作業ブランチでは、まず変更をコミットし、最新のmainをマージします。

```bash
git fetch origin
git merge origin/main
```

Forkの場合は元リポジトリのmainを取り込みます。

```bash
git fetch upstream
git merge upstream/main
```

衝突したら `git status` で対象ファイルを確認し、両方の変更意図を読んでから修正します。判断できない変更は担当者へ確認してください。解消後に検証してコミットします。取り込みをやめる場合は `git merge --abort` を使います。変更を捨てる `reset --hard` で衝突をごまかさないでください。

共有中のブランチは履歴を書き換えずに進めます。個人ブランチでrebaseした場合も、関係者と合意し、必要なときだけ `git push --force-with-lease` を使います。`main` には実行しません。

## 6. 動画・音源・モデルとGit LFS

次のファイルは `.gitattributes` によりGit LFSで管理します。

- `assets/movie/*.mp4`
- `assets/audio/*.wav` と `assets/audio/*.mp3`
- `vendor/models.js`

```bash
git lfs install
git lfs pull
git lfs ls-files
```

LFSを取得していないと、動画や音楽の代わりに数行のポインターファイルが残り、ゲームが正常に動きません。GitHubの「Download ZIP」では、リポジトリ設定によってLFS実体が含まれない場合があります。開発時はGitでクローンしてください。

新しい保存場所や拡張子を使うときは、素材をステージする前に `.gitattributes` を更新します。LFS管理されているファイルを、LFSを使わずに同じ名前で登録しないでください。動画やGLBはテキストのようにマージできないため、1素材につき1人が担当します。

`vendor/models.js` は生成物です。`tools/robots/` のPythonスクリプトを変更して再生成し、スクリプトとモデルを同じPull Requestで更新してください。作業用のレンダリング画像や中間WAV、古い動画の別バージョンをコミットする必要はありません。

新素材の取得元・作者・利用条件は [docs/ASSETS.md](docs/ASSETS.md) に記録します。外部サイトに置かれた素材が無料でも、この公開リポジトリに収録できるかを確認してください。

## 管理者がGitHubで設定するとよい項目

管理者は友達を共同編集者に招待し、`Settings → Rules → Rulesets` などからmainへの直接pushを制限し、Pull Requestとレビューを必須にできます。このリポジトリの初回登録では、共同編集者の招待と保護ルールの変更は行っていません。
