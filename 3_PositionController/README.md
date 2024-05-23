#概要
PositionControllerは、Bluetoothを使用してtoioキューブと連携するためのWebアプリケーションです。このアプリケーションを使用すると、ユーザーはtoioデバイスに接続し、位置データを追跡し、接続されたデバイスの位置データに基づいて描画操作を行うことができます。

#機能
Bluetooth接続: toioデバイスにBluetooth経由で接続します。
絶対位置取得: 接続されたtoioデバイスから座標を継続的に読み取り表示します。
描画インターフェース: toioマットを使用し、toioデバイスの動きに基づいて、キャンバスに描画します。
ローカルストレージ: 位置データを保存し、再生して分析および可視化します。
コントロールパネル: 描画の開始/停止、キャンバスのクリア、および接続デバイスの管理を行うインターフェース。

#ファイル構成
index.html: Webページの構造を定義するメインのHTMLファイル。
bulma.css: アプリケーションのスタイリングのためのCSSライブラリ。
main.js: Toioデバイスへの接続、位置データの読み取り、キャンバスへの描画のロジックを含むJavaScriptファイル。

#使用方法
アプリケーションの起動:

index.htmlをWebブラウザで開いてアプリケーションを起動します。
toioデバイスへの接続:

「接続」ボタンをクリックしてBluetooth接続プロセスを開始します。
接続されたデバイスは「toio接続済デバイス一覧」に表示されます。
描画操作:

「お絵かき開始」ボタンを使用してtoioデバイスの追跡とキャンバスへの描画を開始します。
「お絵かき停止」ボタンを使用して描画を停止します。
「全消し」ボタンを使用してキャンバスをクリアします。
「ストレージから読み出す」および「リプレイ」ボタンを使用して保存された位置データを取得し、再生します。
描画設定の調整:

カラーピッカー、サイズ、透明度のコントロールを使用して描画ペンをカスタマイズします。
依存関係
Bulma CSS: スタイリングのためのCSSフレームワーク。

#ライブラリインポート
index.htmlでCDN経由でインクルードされています:

<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@0.9.1/css/bulma.css" />
Pure CSS: ミニマルなスタイリングのための別のCSSライブラリ。

index.htmlでCDN経由でインクルードされています:
html
<link rel="stylesheet" href="https://unpkg.com/purecss@1.0.0/build/pure-min.css" />


#使用技術
HTML
JavaScript
Web Bluetooth API
Bulma CSSライブラリ


#注意
セキュリティのため、Web Bluetoothには以下の制限があります。

・https上でのみ動作(localhostなら問題ない)
・通信するにはユーザジェスチャー（クリックやタップなど）が必要

#参考
##BLE、WEB Bluetooth API基礎
https://houwa-js.co.jp/2021/03/20210316/
https://www.musen-connect.co.jp/blog/course/trial-production/ble-beginner-1/
https://qiita.com/kasikoma/items/b4a2249d8ca30714b0d9

##toio接続
https://qiita.com/youtoy/items/791905964d871ac987d6


##toioリファレンス
https://toio.github.io/toio-spec/docs/about