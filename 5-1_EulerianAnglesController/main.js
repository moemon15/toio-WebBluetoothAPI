'use strict';

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
      this.toioNorify = dataView.getUint8(1, true);
      this.toioEulerianAngles.x = dataView.getInt16(2, true);
      this.toioEulerianAngles.y = dataView.getInt16(4, true);
      this.toioEulerianAngles.z = dataView.getInt16(6, true);

      // console.log(`
      // Roll.x：${this.toioEulerianAngles.x}
      // Roll.y：${this.toioEulerianAngles.y}
      // Roll.z：${this.toioEulerianAngles.z}`
      // );

      this.updateEulerianAnglesDisplay();
    }
  }

  updateEulerianAnglesDisplay() {
    document.getElementById('roll').textContent = this.toioEulerianAngles.x;
    document.getElementById('pitch').textContent = this.toioEulerianAngles.y;
    document.getElementById('yaw').textContent = this.toioEulerianAngles.z;
  }
}



//インスタンス
const bluetoothController = new BluetoothController();
const eulerianAnglesController = new EulerianAnglesController(bluetoothController);

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

