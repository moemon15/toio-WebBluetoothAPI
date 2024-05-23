#概要
toio.jsを使わずにWebBluetoothAPIでtoioと接続
BluetoothControllerクラス
接続台数は何台でも可能

これは、Web Bluetooth APIを利用してデバイスと接続するウェブアプリケーションです。ユーザーはボタンをクリックして、Bluetoothデバイスを検出・接続し、接続済みのデバイスリストを表示することができます。

#ファイル構成
index.html - メインのHTMLファイル。ボタンと接続済デバイス一覧の表示領域を含みます。
main.js - Bluetooth接続ロジックを含むJavaScriptファイル。
bulma.css - Bulma CSSライブラリを含むCSSファイル。


#使用技術
HTML
JavaScript
Web Bluetooth API
Bulma CSSライブラリ


#使用方法
ウェブページを開き、「接続」ボタンをクリックします。
Bluetoothデバイスのスキャンが開始されます。
デバイスを選択し、接続します。
接続済みデバイスが一覧に表示されます。


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