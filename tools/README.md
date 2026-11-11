# 制作用ツール

ゲームを遊ぶだけなら、これらのツールを実行する必要はありません。

## 検証

リポジトリのルートで実行します。

```bash
node tools/check.mjs
node tools/verify_circuit.cjs
node tools/verify_combat.cjs
```

`check.mjs`はJavaScript構文、HTML/CSSのローカル参照、必須素材、LFS取得漏れを確認します。`verify_circuit.cjs`は回路の結合・分離、分岐保持、変更失敗時のロールバック、Undo/Redoと上限を検証します。`verify_combat.cjs`はブラウザを模した環境で、独立したスキル充填、スキル効果、敵の攻撃、固定シードでのラッシュ進行を確認します。描画と音声の再生は実際のブラウザでも確認してください。

## 武器音とボスBGM

```bash
python -m pip install -r tools/requirements.txt
python tools/audio/reforge_weapon_audio.py
python tools/audio/compose_combat_music.py
```

武器音は `assets/audio/` の対象WAV、ボスBGMは `assets/audio/core-lockdown.mp3` を上書きします。中間WAVは `tools/audio/out/` に出力され、Git管理から除外されます。音を変えたらゲーム内でBGMやほかの効果音と一緒に鳴らして確認してください。

## ロボットモデル

Blender 5.2で作成されたスクリプトです。BlenderがPATHにある環境では、次のように再生成します。

```bash
blender -b --factory-startup --python tools/robots/build_players.py
blender -b --factory-startup --python tools/robots/build_enemies.py
python tools/robots/embed_models.py
```

GLBとプレビューは `tools/robots/out/` と `tools/robots/preview/` に生成されます。埋め込み処理はGLBを読み、`vendor/models.js` に書き出します。`vendor/models.js` はLFS管理される生成物なので、手で編集せずスクリプトと一緒に更新します。

オープニングは完成済みのMP4を `assets/movie/` に収録しています。このリポジトリにはオープニング制作環境と全中間素材は含めていません。再制作する場合は管理者と元の制作データを共有してください。
