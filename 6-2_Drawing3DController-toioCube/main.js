'use strict';
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

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

    this.scene.background = new THREE.Color( "rgb(153, 153, 153)" );

    // カメラを作成
    //THREE.PerspectiveCamera(画角, アスペクト比, 描画開始距離, 描画終了距離)
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);

    // カメラコントローラーを作成
    this.controls = new OrbitControls(this.camera, document.querySelector("#myCanvas"));
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    // カメラの初期座標を設定（X座標:0, Y座標:0, Z座標:0）
    this.camera.position.set(3, 3, 3);

    // グループを作成してピボットポイントを設定
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    this.loader = new GLTFLoader();
    this.model = null;

    // GLTF形式のモデルデータを読み込む
    this.loader.load('toiocorecube_v003.gltf', (gltf) => {
      this.model = gltf.scene;

      // X軸周りに90度回転させ、ZアップからYアップに変更
      this.model.rotation.set(Math.PI / 2, 0, 0);

      // 初期設定：Z軸周り回転(ラジアン)
      // this.model.rotation.z((210 * Math.PI) / 180); // 必要に応じて調整

      this.model.scale.set(30, 30, 30); // 必要に応じてスケールを設定

      // モデルをピボットグループに追加
      this.pivot.add(this.model);

      // this.scene.add(this.model);
    }, undefined, (error) => {
      console.error(error);
    });

    // toioの回転順序にあわせる
    this.camera.rotation.order = "ZYX";

    // 平行光源　上
    // new THREE.DirectionalLight(色)
    this.light = new THREE.DirectionalLight(0xFFFFFF);

    // 光の強さを倍に
    this.light.intensity = 2;
    // ライトの位置を変更
    this.light.position.set(5, 5, 5); // ライトの方向 set(X方向、Y方向、Z方向)
    // シーンに追加
    this.scene.add(this.light);

    // 平行光源　横
    this.light2 = new THREE.DirectionalLight(0xFFFFFF);
    // 光の強さを倍に
    this.light2.intensity = 2;
    this.light2.position.set(5, 0, 5);
    this.scene.add(this.light2);

    // 平行光源　横
    this.light3 = new THREE.DirectionalLight(0xFFFFFF);
    // 光の強さを倍に
    this.light3.intensity = 2;
    this.light3.position.set(-5, 0, -5);
    this.scene.add(this.light3);

    // 平行光源　下
    this.light4 = new THREE.DirectionalLight(0xFFFFFF);
    // 光の強さを倍に
    this.light4.intensity = 2;
    this.light4.position.set(-5, -5, -5);
    this.scene.add(this.light4);

    //レンダラー初期化
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.registerEulerianEventListeners();

    this.tick();
  }

  //toioの座標が更新されたらdrawメソッドを実行
  //decodePositionDataContinuousメソッドで発火
  registerEulerianEventListeners() {
    document.addEventListener('EulerianAnglesUpdated', (event) => {

      //{ x: 0, y: 0, z: 0 };
      const EulerianAngles = event.detail;
      const radianFactor = Math.PI / 180; //度からラジアンへの変換係数

      // ToioのZ座標を原点に合わせるために調整
      // this.pivot.position.set(EulerianAngles.x, EulerianAngles.y, EulerianAngles.z);

      // THREE.jsはデフォルトでラジアンを使用するため、度からラジアンに変換
      // this.pivot.rotation.x = EulerianAngles.x * radianFactor;
      this.pivot.rotation.x = -(EulerianAngles.y) * radianFactor; //toioのY軸回転（角度）をThree.jsオブジェクトのX軸回転に適用

      // this.pivot.rotation.y = EulerianAngles.y * radianFactor;
      this.pivot.rotation.y = -(EulerianAngles.z) * radianFactor; //toioのZ軸回転（角度）をThree.jsオブジェクトのY軸回転に適用

      // this.pivot.rotation.z = EulerianAngles.z * radianFactor;
      this.pivot.rotation.z = EulerianAngles.x * radianFactor; //toioのX軸回転（角度）をThree.jsオブジェクトのZ軸回転に適用
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

