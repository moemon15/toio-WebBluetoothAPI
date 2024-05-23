'use strict';
import * as THREE from "three";

class BluetoothController {
  static TOIO_SERVICE_UUID = "10b20100-5b3b-4571-9508-cf3efcd7bbae";
  static EulerianAngles_CHARACTERISTICS_UUID = '10b20106-5b3b-4571-9508-cf3efcd7bbae';
  static CONFIGURATION_CHARACTERISTIC_UUID = '10b201ff-5b3b-4571-9508-cf3efcd7bbae';

  constructor() {
    this.devices = new Map();
    this.connectedDisplay = document.getElementById('connectedDisplay');
  }

  async connect() {
    try {
      console.log("Requesting Bluetooth Device...");
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BluetoothController.TOIO_SERVICE_UUID] }]
      });

      console.log("Connecting to GATT Server...");
      const server = await device.gatt.connect();

      console.log("Getting Service...");
      const service = await server.getPrimaryService(BluetoothController.TOIO_SERVICE_UUID);

      console.log("Getting Characteristic...");
      const toio_configuration = await service.getCharacteristic(BluetoothController.CONFIGURATION_CHARACTERISTIC_UUID);
      const EulerianAnglesCharacteristic = await service.getCharacteristic(BluetoothController.EulerianAngles_CHARACTERISTICS_UUID);

      //デバイスの追加
      this.devices.set(device.id, {
        device: device,
        characteristics: {
          config: toio_configuration,
          EulerianAngles: EulerianAnglesCharacteristic
        }
      });

      console.log(`Connected to device: ${device.name}`);

      //接続済一覧に追加
      const ul = document.createElement('ul');
      this.connectedDisplay.appendChild(ul);
      const li = document.createElement('li');
      li.textContent = `デバイス名: ${device.name}, デバイスID: ${device.id}`;
      ul.appendChild(li);

    } catch (error) {
      console.log("Argh! " + error);
    }
  }
}

class EulerianAnglesController {
  /*
=============================================
姿勢角検出の設定 
データ位置	タイプ	  内容	                      例
0	          UInt8	  情報の種類	                 0x0d（姿勢角検出の設定）
1	          UInt8	  Reserved	                  0x00
2	          UInt8	  通知内容の種類		           0x01（0x01：オイラー角, 0x02：クォータニオン, 0x03：高精度オイラー角）
3	          UInt8	  通知間隔	                  0x01（10ミリ秒）
4	          UInt8	　通知条件　　　　　　　　　	  0x01（0x00：変化がなくても通知, 0x01：変化があったときだけ通知）
=============================================
*/
  // 初期設定
  static configuration_Buf = new Uint8Array([0x1d, 0x00, 0x01, 0x01, 0x01]);

  constructor(bluetoothController) {
    this.bluetoothController = bluetoothController;
    this.toioEulerianAngles = { x: 0, y: 0, z: 0 };
  }

  async Euleriansetting() {
    await this._sendEulerianCommand(EulerianAnglesController.configuration_Buf);
  }

  //全てのデバイスを制御
  async _sendEulerianCommand(command) {
    if (this.bluetoothController.devices.size > 0) {
      for (const [deviceId, deviceInfo] of this.bluetoothController.devices.entries()) {
        // console.log("Device ID:", deviceId); // デバイスIDをログに出力
        // console.log("Device Info:", deviceInfo); // deviceInfoの内容をログに出力
        if (deviceInfo.characteristics && deviceInfo.characteristics.config) {
          console.log("Writing command to EulerianAngles...");
          await deviceInfo.characteristics.config.writeValue(command);
        } else {
          console.log(`デバイスID:${deviceId}のEulerianAngles characteristicが見つかりません`);
        }
      }
    } else {
      console.log('デバイスが接続されていません');
    }
  }

  async startReadingEulerian() {
    if (this.bluetoothController.devices.size > 0) {
      for (const [deviceId, deviceInfo] of this.bluetoothController.devices.entries()) {
        if (deviceInfo.characteristics && deviceInfo.characteristics.EulerianAngles) {
          console.log("Reading EulerianAngles sensor data from device:", deviceId);
          try {
            console.log('Starting Notifications...');
            await deviceInfo.characteristics.EulerianAngles.startNotifications();
            deviceInfo.characteristics.EulerianAngles.addEventListener('characteristicvaluechanged', this.decodeEulerianAnglesContinuous);
          } catch (error) {
            console.log('Argh! Error reading sensor data:', error);
          }
        } else {
          console.log(`デバイスID:${deviceId}のSensor characteristicが見つかりません`);
        }
      }
    } else {
      console.log('デバイスが接続されていません');
    }
  }

  async stopReadingEulerian() {
    if (this.bluetoothController.devices.size > 0) {
      for (const [deviceId, deviceInfo] of this.bluetoothController.devices.entries()) {
        if (deviceInfo.characteristics && deviceInfo.characteristics.EulerianAngles) {
          console.log("ReadingStop sensor data from device:", deviceId);
          try {
            console.log('Stop Notifications...');
            await deviceInfo.characteristics.EulerianAngles.stopNotifications();
            deviceInfo.characteristics.EulerianAngles.removeEventListener('characteristicvaluechanged', this.decodeEulerianAnglesContinuous);
          } catch (error) {
            console.log('Argh! Error readingStop sensor data:', error);
          }
        } else {
          console.log(`デバイスID:${deviceId}のSensor characteristicが見つかりません`);
        }
      }
    } else {
      console.log('デバイスが接続されていません');
    }
  }

  // このケースは startReadingPosition からのイベントで呼び出された場合
  decodeEulerianAnglesContinuous = (event) => {
    let value = event.target.value;
    let deviceName = event.target.service.device.name;
    let deviceId = event.target.service.device.id;
    const dataView = new DataView(value.buffer);
    /*
    ==============================
    データ位置	タイプ	　内容	　　　　　　　　　 例　　　　　　　　　　　　　　　　範囲
    0	　　　　　UInt8	　　情報の種類	　　　　　　 0x03（姿勢角検出）　　　　　　　　
    1	　　　　　UInt8	　　通知内容の種類	　　　　 0x02（クォータニオンでの通知）　　
    2	　　　　　Float32	　Roll（ロール/X 軸）	　　0x00003443（180.0°）　　　　　　-179°(0xFF4D) から 180°(0x00B4)
    6	　　　　　Float32	　Pitch（ピッチ/Y 軸）	　0x00000000（0.0°）　　　　　　　-90°(0xFFA6) から 90°(0x005A) 
    10	　　　　Float32	　Yaw（ヨー/Z 軸）	　　　0x00000000（0.0°）　　　　　　　-179°(0xFF4D) から 180°(0x00B4)
    ==============================
    */

    // DataViewのバイト長をチェック
    if (dataView.byteLength >= 7) {
      console.log(`Roll.x：${value.getInt16(2, true)}`);
      console.log(`Roll.y：${value.getInt16(4, true)}`);
      console.log(`Roll.z：${value.getInt16(6, true)}`);

      this.toioNorify = dataView.getUint8(1, true);
      this.toioEulerianAngles.x = dataView.getInt16(2, true);
      this.toioEulerianAngles.y = dataView.getInt16(4, true);
      this.toioEulerianAngles.z = dataView.getInt16(6, true);

      //toioのオイラー角が更新されたらDrawing3DControllerクラスのメソッドを実行
      //drawingControllerクラスのregisterEventListeners()メソッドに定義
      const EulerianAnglesUpdatedEvent = new CustomEvent('EulerianAnglesUpdated', {
        detail: this.toioEulerianAngles
      });
      document.dispatchEvent(EulerianAnglesUpdatedEvent);
    }
  }
}

class Drawing3DController {
  constructor(bluetoothController, eulerianAnglesController, width, height) {
    this.bluetoothController = bluetoothController;
    this.eulerianAnglesController = eulerianAnglesController;

    //Canvasサイズ
    this.width = width;
    this.height = height;

    // レンダラーを作成
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.querySelector("#myCanvas")
    });

    // シーンを作成
    //オブジェクトや光源などの置き場
    this.scene = new THREE.Scene();

    // カメラを作成
    //THREE.PerspectiveCamera(画角, アスペクト比, 描画開始距離, 描画終了距離)
    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000);

    //ジオメトリ(形状)生成
    // new THREE.BoxGeometry(幅, 高さ, 奥行き)
    this.geometry = new THREE.BoxGeometry(500, 500, 500);

    // 各面に適用するマテリアルの配列を作成
    this.materials = [
      new THREE.MeshBasicMaterial({ color: 0xff0000 }), // 赤
      new THREE.MeshBasicMaterial({ color: 0x00ff00 }), // 緑
      new THREE.MeshBasicMaterial({ color: 0x0000ff }), // 青
      new THREE.MeshBasicMaterial({ color: 0xffff00 }), // 黄
      new THREE.MeshBasicMaterial({ color: 0x00ffff }), // シアン
      new THREE.MeshBasicMaterial({ color: 0xff00ff })  // マゼンタ
    ];

    // new THREE.Mesh(ジオメトリ,マテリアル)
    this.box = new THREE.Mesh(this.geometry, this.materials);

    //toioの回転順序にあわせる
    this.camera.rotation.order = "ZYX";

    // 平行光源
    // new THREE.DirectionalLight(色)
    this.light = new THREE.DirectionalLight(0xFFFFFF);

    this.registerEulerianEventListeners();

    this.init();
  }

  init = () => {
    //レンダラー初期化
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // カメラの初期座標を設定（X座標:0, Y座標:0, Z座標:0）
    this.camera.position.set(0, 0, 2000);

    // シーンに追加
    this.scene.add(this.box);


    this.light.intensity = 2; // 光の強さを倍に
    // ライトの位置を変更
    this.light.position.set(1, 1, 1); // ライトの方向 set(X方向、Y方向、Z方向)
    // シーンに追加
    this.scene.add(this.light);

    this.tick();
  }

  //toioの座標が更新されたらdrawメソッドを実行
  //decodePositionDataContinuousメソッドで発火
  registerEulerianEventListeners() {
    document.addEventListener('EulerianAnglesUpdated', (event) => {
      //{ x: 0, y: 0, z: 0 };
      const EulerianAngles = event.detail;
      // ToioのZ座標を原点に合わせるために調整
      this.box.position.set(EulerianAngles.x, EulerianAngles.y, EulerianAngles.z - 160);
      const radianFactor = Math.PI / 180; //度からラジアンへの変換係数

      // THREE.jsはデフォルトでラジアンを使用するため、度からラジアンに変換
      // this.box.rotation.x = EulerianAngles.x * radianFactor;
      this.box.rotation.x = EulerianAngles.y * radianFactor; //toioのY軸回転（角度）をThree.jsオブジェクトのX軸回転に適用

      // this.box.rotation.y = EulerianAngles.y * radianFactor;
      this.box.rotation.y = -(EulerianAngles.z) * radianFactor; //toioのZ軸回転（角度）をThree.jsオブジェクトのY軸回転に適用

      // this.box.rotation.z = EulerianAngles.z * radianFactor;
      this.box.rotation.z = -(EulerianAngles.x) * radianFactor; //toioのX軸回転（角度）をThree.jsオブジェクトのZ軸回転に適用
      // if (this.isDrawingActive) {
      //   this.draw(event.detail);
      // }
    });
  }

  tick = () => {
    requestAnimationFrame(this.tick);

    // レンダリング
    this.renderer.render(this.scene, this.camera);
  }
}



//インスタンス
const bluetoothController = new BluetoothController();
const eulerianAnglesController = new EulerianAnglesController(bluetoothController);
const drawing3DController = new Drawing3DController(bluetoothController, eulerianAnglesController, 600, 600);

/* イベントリスナー */
//toio接続
document.getElementById('connectButton').addEventListener('click', () => bluetoothController.connect());

//姿勢角取得
document.getElementById('get-EulerianAngles-continuous').addEventListener('click', () => {
  eulerianAnglesController.Euleriansetting();
  eulerianAnglesController.startReadingEulerian();
});

//姿勢角取得停止
document.getElementById('get-EulerianAngles-continuous-stop').addEventListener('click', () => {
  eulerianAnglesController.stopReadingEulerian();
});

