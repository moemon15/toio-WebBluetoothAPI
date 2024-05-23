'use strict';

class BluetoothController {
  static TOIO_SERVICE_UUID = "10b20100-5b3b-4571-9508-cf3efcd7bbae";
  static MOTOR_CHARACTERISTIC_UUID = "10b20102-5b3b-4571-9508-cf3efcd7bbae";

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
      const motorCharacteristic = await service.getCharacteristic(BluetoothController.MOTOR_CHARACTERISTIC_UUID);

      //デバイスの追加
      this.devices.set(device.id, {
        device: device,
        characteristics: {
          motor: motorCharacteristic,
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

class CubeController {
  // 初期設定
  static stopmotorBuf = new Uint8Array([0x01, 0x01, 0x01, 0x00, 0x02, 0x01, 0x00]);
  static forwardmotorBuf = new Uint8Array([0x01, 0x01, 0x01, 0x30, 0x02, 0x01, 0x30]);
  static backwardmotorBuf = new Uint8Array([0x01, 0x01, 0x02, 0x30, 0x02, 0x02, 0x30]);
  static rightmotorBuf = new Uint8Array([0x01, 0x01, 0x01, 0x30, 0x02, 0x02, 0x30]);
  static leftmotorBuf = new Uint8Array([0x01, 0x01, 0x02, 0x30, 0x02, 0x01, 0x30]);
  /*
  =============================================
  モーター制御
  TypedArray()を使用

  0x01 次の書き込みが行われるまで動き続ける
  0x02 指定した時間だけ、モーターを制御
  0x03 指定した座標に移動
  0x04 複数指定した座標に移動
  0x05 モーターそれぞれの速度を指定するのではなくキューブとしての並進速度や回転速度を指定して制御

  Uint8Array([制御の種類, 制御するモーターのID(左:0x01), 左モーターの回転方向(前:0x01 後:0x02), 左モーターの速度指示値(0~255), 制御するモーターのID(右:0x02), 右モーターの回転方向(前:0x01 後:0x02), 右モーターの速度指示値(0~255), モーターの制御時間(0~255)]
  Uint8Array([0x02, 制御するモーターのID(左:0x01), モーターの回転方向(前:0x01 後:0x02), モーターの速度指示値, 制御するモーターのID(右:0x02), モーターの回転方向, モーターの速度指示値, モーターの制御時間]

  =============================================
  */

  constructor(bluetoothController) {
    this.bluetoothController = bluetoothController;
  }


  async forwardMotors() {
    // console.log(this);
    await this._sendMotorCommand(CubeController.forwardmotorBuf);
  }

  async backwardMotors() {
    await this._sendMotorCommand(CubeController.backwardmotorBuf);
  }

  async rightMotors() {
    await this._sendMotorCommand(CubeController.rightmotorBuf);
  }

  async leftMortors() {
    await this._sendMotorCommand(CubeController.leftmotorBuf);
  }

  async stopMotors() {
    await this._sendMotorCommand(CubeController.stopmotorBuf);
  }

  //全てのデバイスを制御
  async _sendMotorCommand(command) {
    if (this.bluetoothController.devices.size > 0) {
      for (const [deviceId, deviceInfo] of this.bluetoothController.devices.entries()) {
        // console.log("Device ID:", deviceId); // デバイスIDをログに出力
        // console.log("Device Info:", deviceInfo); // deviceInfoの内容をログに出力
        if (deviceInfo.characteristics && deviceInfo.characteristics.motor) {
          console.log("Writing command to motor...");
          await deviceInfo.characteristics.motor.writeValue(command);
        } else {
          console.log(`デバイスID:${deviceId}のMotor characteristicが見つかりません`);
        }
      }
    } else {
      console.log('デバイスが接続されていません');
    }
  }

  //個別にデバイスIDとtoioに渡すデータを引数とする
  async sendMotorCommand(deviceId, commandBuffer) {
    const device = this.devices.get(deviceId);
    if (device && device.characteristics.motor) {
      console.log(`Sending command to motor on device ${device.device.name}...`);
      await device.characteristics.motor.writeValue(commandBuffer);
    } else {
      console.log(`Motor characteristic not found on device ${deviceId}`);
    }
  }

}



//インスタンス
const bluetoothController = new BluetoothController();
const cubeController = new CubeController(bluetoothController);


/* イベントリスナー */
//toio接続
document.getElementById('connectButton').addEventListener('click', () => bluetoothController.connect());

//前進
document.getElementById('move-forward').addEventListener('mousedown', () => cubeController.forwardMotors());
document.getElementById('move-forward').addEventListener('mouseup', () => cubeController.stopMotors());

//後進
document.getElementById('move-backward').addEventListener('mousedown', () => cubeController.backwardMotors());
document.getElementById('move-backward').addEventListener('mouseup', () => cubeController.stopMotors());

//右
document.getElementById('move-right').addEventListener('mousedown', () => cubeController.rightMotors());
document.getElementById('move-right').addEventListener('mouseup', () => cubeController.stopMotors());

//左
document.getElementById('move-left').addEventListener('mousedown', () => cubeController.leftMortors());
document.getElementById('move-left').addEventListener('mouseup', () => cubeController.stopMotors());