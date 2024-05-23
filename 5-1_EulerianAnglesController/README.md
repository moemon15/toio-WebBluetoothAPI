#概要
toio.jsを使わずにWebBluetoothAPIでtoioと接続し、操作
接続台数は何台でも可能

これは、Web Bluetooth APIを使用してBluetoothデバイス（toio）に接続し、姿勢角を取得して3D描画を行うウェブアプリケーションです。ユーザーはボタンを使用してデバイスを接続し、接続済みのデバイスを表示し、デバイスの姿勢角を取得して3D空間に描画することができます。

#ファイル構成
index.html - メインのHTMLファイル。ボタンと接続済デバイス一覧、姿勢角取得ボタン、および3D描画用のキャンバスを含みます。
main.js - Bluetooth接続ロジックを含むJavaScriptファイル。
main.css - プロジェクトのスタイルを定義するCSSファイル。
bulma.css - Bulma CSSライブラリを含むCSSファイル。


#使用技術
HTML
JavaScript
Three.js
Web Bluetooth API
Bulma CSSライブラリ

#クラス
BluetoothControllerクラス
EulerianAnglesControllerクラス
Drawing3DControllerクラス

#使用方法
ウェブページを開き、「接続」ボタンをクリックします。
Bluetoothデバイスのスキャンが開始されます。
デバイスを選択し、接続します。
接続済みデバイスが一覧に表示されます。
「連続姿勢角取得」ボタンをクリックして、デバイスの姿勢角を取得します。
取得した姿勢角が3D空間に描画されます。
「姿勢角取得停止」ボタンをクリックして、姿勢角の取得を停止します。


#注意
セキュリティのため、Web Bluetoothには以下の制限があります。

・https上でのみ動作(localhostなら問題ない)
・通信するにはユーザジェスチャー（クリックやタップなど）が必要

##three.js
基本的にはローカル環境で動作しますが、ローカルファイル（file://）として直接ブラウザで開くと、ブラウザのセキュリティ制限により、Three.jsのスクリプトがロードされずに動作しないことがあります。

1. ローカルに簡単なHTTPサーバーを立ち上げることで、ブラウザのセキュリティ制限を回避できます。
2. htmlファイル内に直接書く
3. npmを使ってThree.jsをインストール

#参考
##BLE、WEB Bluetooth API基礎
https://houwa-js.co.jp/2021/03/20210316/
https://www.musen-connect.co.jp/blog/course/trial-production/ble-beginner-1/
https://qiita.com/kasikoma/items/b4a2249d8ca30714b0d9

##toio接続
https://qiita.com/youtoy/items/791905964d871ac987d6


##toioリファレンス
https://toio.github.io/toio-spec/docs/about