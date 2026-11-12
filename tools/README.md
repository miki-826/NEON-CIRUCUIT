# 制作用ツール

ゲームを遊ぶだけなら、これらのツールを実行する必要はありません。

## 検証

リポジトリのルートで実行します。

```bash
node tools/check.mjs
node tools/verify_circuit.cjs
node tools/verify_combat.cjs
node tools/verify_upgrade_combat.cjs
node tools/verify_encounters.cjs
```

`check.mjs`はJavaScript構文、HTML/CSSの参照、必須素材、LFS取得漏れを確認します。`verify_circuit.cjs`はチェイン倍率、順序増幅、所持ノードの移動と数の保存を検証します。`verify_combat.cjs`は既存スキル、敵の攻撃、固定シードの10ウェーブ戦闘を検証します。`verify_upgrade_combat.cjs`はゲーム本体の関数を実行し、強化プレビューと弾の威力・数・速度・追尾・貫通・爆発・分裂・充填・補助効果の一致を検証します。描画と音声は実際のブラウザでも確認してください。

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
