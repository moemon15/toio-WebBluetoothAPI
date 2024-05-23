'use strict';
import * as THREE from "three";

class BluetoothController {
  static TOIO_SERVICE_UUID = "10b20100-5b3b-4571-9508-cf3efcd7bbae";
  static MOTOR_CHARACTERISTIC_UUID = "10b20102-5b3b-4571-9508-cf3efcd7bbae";
  static ID_SENSOR_CHARACTERISTICS_UUID = '10b20101-5b3b-4571-9508-cf3efcd7bbae';
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
      const motorCharacteristic = await service.getCharacteristic(BluetoothController.MOTOR_CHARACTERISTIC_UUID);
      const sensorCharacteristic = await service.getCharacteristic(BluetoothController.ID_SENSOR_CHARACTERISTICS_UUID);
      const EulerianAnglesCharacteristic = await service.getCharacteristic(BluetoothController.EulerianAngles_CHARACTERISTICS_UUID);

      //デバイスの追加
      this.devices.set(device.id, {
        device: device,
        characteristics: {
          config: toio_configuration,
          motor: motorCharacteristic,
          sensor: sensorCharacteristic,
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

  //全てのデバイスを制御
  // async sendMotorCommandToAllDevices(commandBuffer) {
  //   for (const [deviceId, deviceInfo] of this.bluetoothController.devices.entries()) {
  //     if (deviceInfo.characteristics.motor) {
  //       console.log(`Sending command to motor on device ${deviceInfo.device.name}...`);
  //       await deviceInfo.characteristics.motor.writeValue(commandBuffer);
  //     } else {
  //       console.log(`Motor characteristic not found on device ${deviceId}`);
  //     }
  //   }
  // }



  // async readSensorData(deviceId) {
  //   const device = this.devices.get(deviceId);
  //   if (device && device.characteristics.sensor) {
  //     console.log(`Reading sensor data from device ${device.device.name}...`);
  //     const value = await device.characteristics.sensor.readValue();
  //     console.log(`Sensor data from device ${device.device.name}: ${new TextDecoder().decode(value)}`);
  //     return value;
  //   } else {
  //     console.log(`Sensor characteristic not found on device ${deviceId}`);
  //   }
  // }

}

class PositionController {
  /*
  =============================================
  PositionID読み出し リトルエンディアン形式
  ArrayBuffer(),DataView()を使用する
  データ位置	タイプ	  内容	                      例
  0	          UInt8	  情報の種類	                 0x01（Position ID）
  1	          UInt16	キューブの中心の X 座標値	    0x02c5（709）
  3	          UInt16	キューブの中心の Y 座標値	    0x017f（383）
  5	          UInt16	キューブの角度	             0x0132（306 度）
  7	          UInt16	読み取りセンサーの X 座標値	  0x02bc（700）
  9	          UInt16	読み取りセンサーの Y 座標値	  0x0182（386）
  11	        UInt16	読み取りセンサーの角度	      0x0132（306 度）
  
  UInt8は1バイト、UInt16は2バイト消費
  UInt8がひとつ、UInt16が６つで合計13バイト消費する
  =============================================
  */

  constructor(bluetoothController) {
    this.bluetoothController = bluetoothController;
    this.toioPosition = { x: 0, y: 0, angle: 0, sensorX: 0, sensorY: 0, sensorAngle: 0 };
    this.positionDisplay = document.getElementById('position-display');
    this.storage = localStorage;
  }

  async startReadingPosition() {
    if (this.bluetoothController.devices.size > 0) {
      for (const [deviceId, deviceInfo] of this.bluetoothController.devices.entries()) {
        if (deviceInfo.characteristics && deviceInfo.characteristics.sensor) {
          console.log("Reading sensor data from device:", deviceId);
          try {
            console.log('Starting Notifications...');
            await deviceInfo.characteristics.sensor.startNotifications();
            deviceInfo.characteristics.sensor.addEventListener('characteristicvaluechanged', this.decodePositionDataContinuous);
            deviceInfo.characteristics.sensor.addEventListener('characteristicvaluechanged', this.PositionMissed);
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

  async stopReadingPosition() {
    if (this.bluetoothController.devices.size > 0) {
      for (const [deviceId, deviceInfo] of this.bluetoothController.devices.entries()) {
        if (deviceInfo.characteristics && deviceInfo.characteristics.sensor) {
          console.log("ReadingStop sensor data from device:", deviceId);
          try {
            console.log('Stop Notifications...');
            await deviceInfo.characteristics.sensor.stopNotifications();
            deviceInfo.characteristics.sensor.removeEventListener('characteristicvaluechanged', this.decodePositionDataContinuous);
            deviceInfo.characteristics.sensor.removeEventListener('characteristicvaluechanged', this.PositionMissed);
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

  async PositionMissed(event) {
    let value = event.target.value
    const dataView = new DataView(value.buffer);
    if (dataView.getUint8(0) === 0x03) {
      console.log('座標を取得できません');
      document.dispatchEvent(new CustomEvent('positionMissed', {
      }));
    }
  }

  async getPosition() {
    if (this.bluetoothController.devices.size > 0) {
      for (const [deviceId, deviceInfo] of this.bluetoothController.devices.entries()) {
        if (deviceInfo.characteristics && deviceInfo.characteristics.sensor) {
          console.log("Reading sensor data from device:", deviceId);
          try {
            const value = await deviceInfo.characteristics.sensor.readValue();
            this.decodePositionDataOnce(deviceId, deviceInfo.device.name, value);
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

  /*
  ２つの関数を統合したい
  */
  // このケースは startReadingPosition からのイベントで呼び出された場合
  decodePositionDataContinuous = (event) => {
    let value = event.target.value;
    let deviceName = event.target.service.device.name;
    let deviceId = event.target.service.device.id;
    const dataView = new DataView(value.buffer);

    // DataViewのバイト長をチェック
    if (dataView.byteLength >= 13) { // 必要な最小バイト数を確認 (x, y, angleがそれぞれ2バイト、最初の1バイト分のオフセットを含む)
      this.toioPosition.x = dataView.getUint16(1, true);
      this.toioPosition.y = dataView.getUint16(3, true);
      this.toioPosition.angle = dataView.getUint16(5, true);
      this.toioPosition.sensorX = dataView.getUint16(7, true);
      this.toioPosition.sensorY = dataView.getUint16(9, true);
      this.toioPosition.sensorAngle = dataView.getUint16(11, true);

      //toioの座標が更新されたらdrawメソッドを実行
      //drawingControllerクラスのregisterEventListeners()メソッドに定義
      const positionUpdatedEvent = new CustomEvent('positionUpdated', {
        detail: this.toioPosition
      });
      document.dispatchEvent(positionUpdatedEvent);

      //ローカルストレージに保存
      const PositionID = {
        'deviceName': deviceName,
        'deviceId': deviceId,
        'x': this.toioPosition.x,
        'y': this.toioPosition.y,
        'angle': this.toioPosition.angle,
        'sensorX': this.toioPosition.sensorX,
        'sensorY': this.toioPosition.sensorY,
        'sensorAngle': this.toioPosition.sensorAngle
      }

      this.storePositionData(deviceId, PositionID);  // データストアを抽象化　追加

      // デバイスID毎にローカルストレージからデータを取得し、存在しない場合は新しい配列を作成
      // let deviceData = JSON.parse(this.storage.getItem(deviceName) || "[]");

      // データを追加
      // deviceData.push(PositionID);

      // ローカルストレージに保存
      // this.storage.setItem(deviceName, JSON.stringify(deviceData));

      // console.log('キューブの中心の X 座標値:', dataView.getUint16(1, true));
      // console.log('キューブの中心の Y 座標値:', dataView.getUint16(3, true));
      // console.log('Cubeの角度:', dataView.getUint16(5, true));
    } else {
      //  console.error('Received data is too short.');
    }
  }

  //一時的にキャッシュを作成し、５秒毎にローカルストレージに保存 連続座標取得時に使用
  storePositionData(deviceId, data) {
    // データの一時的なキャッシュと定期的な保存
    if (!this.dataCache) this.dataCache = {};
    if (!this.dataCache[deviceId]) this.dataCache[deviceId] = [];
    this.dataCache[deviceId].push(data);

    if (!this.saveInterval) {
      this.saveInterval = setInterval(() => {
        for (const [name, positions] of Object.entries(this.dataCache)) {
          const storedData = JSON.parse(this.storage.getItem(name) || "[]");
          const updatedData = storedData.concat(positions);
          this.storage.setItem(name, JSON.stringify(updatedData));
          this.dataCache[name] = [];  // キャッシュをリセット
        }
      }, 5000);  // 5秒ごとに保存
    }
  }

  // このケースは getPosition からのデータで呼び出された場合
  decodePositionDataOnce = (deviceId, deviceName, sensor) => {
    const dataView = new DataView(sensor.buffer);

    if (dataView.byteLength >= 13) {
      this.toioPosition.x = dataView.getUint16(1, true);
      this.toioPosition.y = dataView.getUint16(3, true);
      this.toioPosition.angle = dataView.getUint16(5, true);
      this.toioPosition.sensorX = dataView.getUint16(7, true);
      this.toioPosition.sensorY = dataView.getUint16(9, true);
      this.toioPosition.sensorAngle = dataView.getUint16(11, true);

      //ローカルストレージに保存
      const PositionID = {
        'daviceName': deviceName,
        'deviceID': deviceId,
        'x': this.toioPosition.x,
        'y': this.toioPosition.y,
        'angle': this.toioPosition.angle,
        'sensorX': this.toioPosition.sensorX,
        'sensorY': this.toioPosition.sensorY,
        'sensorAngle': this.toioPosition.sensorAngle
      }

      // デバイスID毎にローカルストレージからデータを取得し、存在しない場合は新しい配列を作成
      let deviceData = JSON.parse(this.storage.getItem(deviceId) || "[]");

      // データを追加
      deviceData.push(PositionID);

      // ローカルストレージに保存
      this.storage.setItem(deviceId, JSON.stringify(deviceData));

      this.positionDisplay.value = this.positionDisplay.value + `X: ${this.toioPosition.x}, Y: ${this.toioPosition.y}, Angle: ${this.toioPosition.angle}\n`;
      this.positionDisplay.scrollTop = this.positionDisplay.scrollHeight; // 自動スクロール

      // console.log('キューブの中心の X 座標値:', dataView.getUint16(1, true));
      // console.log('キューブの中心の Y 座標値:', dataView.getUint16(3, true));
      // console.log('Cubeの角度:', dataView.getUint16(5, true));
    }

  }

  positionDisplayClear = () => {
    console.log('クリアボタンがクリックされました');
    this.positionDisplay.value = '';
  }
}

class DrawingController {

  constructor(bluetoothController, positionController, width, height, positionRegX, positionRegY, pencilSelector = {
    colorPencil: '#pencilColor',
    colorPalette: '.color-palette',
    pencilSize: '#pencilSize',
    pencilOpacity: '#pencilOpacity',
    clearButton: '#clearButton',
  }) {
    this.bluetoothController = bluetoothController;
    this.positionController = positionController; // PositionControllerのインスタンスを保持
    this.isDrawingActive = false;  // 描画の有効/無効を制御するフラグ
    this.registerEventListeners();
    this.storageData = {}; //ローカルストレージから読み出したオブジェクトを保存
    this.replayInterval; //リプレイインターバル宣言
    this.slider = document.getElementById('slider');
    this.isReplaying = false; // リプレイがアクティブかどうかを追跡するフラグ

    //Canvasサイズ
    this.width = width;
    this.height = height;
    //toioマット座標調整
    this.positionRegX = positionRegX;
    this.positionRegY = positionRegY;

    this.pencilSelector = pencilSelector

    this.x = null;
    this.y = null;

    this.init();
  }


  //初期化
  init = () => {
    this.canvas = document.getElementById('draw-area');
    this.context = this.canvas.getContext('2d');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    //Canvasの縮尺
    this.context.scale(2, 2);


    //イベントリスナー関連もクラス化？
    document.getElementById('draw-start').addEventListener('click', () => {
      console.log('お絵かき開始ボタンがクリックされました');
      this.positionController.startReadingPosition();
      drawingController.startDrawing();
    })
    document.getElementById('draw-stop').addEventListener('click', () => {
      console.log('お絵かき停止ボタンがクリックされました');
      this.positionController.stopReadingPosition();
      console.log(this);
    })
    document.getElementById('clear-button').addEventListener('click', () => {
      console.log('Canvasクリアボタンがクリックされました');
      this.clearCanvas();
    });

    //toioが座標を読み取れなくなったとき実行イベント
    //PositionContorollerのPositionMissedメソッドで発火
    document.addEventListener('positionMissed', (event) => {
      if (this.isDrawingActive) {
        this.drawFinish();
      }
    });

    this.initColorPencilElements();
    this.setCanvasStyle();
  }

  /**
 * 初期化colored pencils
 */
  initColorPencilElements = () => {
    const { colorPencil: color, colorPalette: palette, pencilSize: size, pencilOpacity: opacity } = this.pencilSelector;
    const colorPencil = document.querySelector(color);
    const colorPalette = document.querySelector(palette);
    const pencilSize = document.querySelector(size);
    const pencilOpacity = document.querySelector(opacity);

    if (colorPencil != null) {
      colorPencil.value = this.penColor;

      colorPencil.addEventListener('click', (ev) => {
        ev.target.type = 'color'
      });
      colorPencil.addEventListener('blur', (ev) => {
        ev.target.type = 'text';
        if (colorPalette != null) {
          colorPalette.style.backgroundColor = ev.target.value;
        }
      });
      colorPencil.addEventListener('change', (ev) => {
        this.penColor = ev.target.value;
      });
    }

    if (colorPalette != null) {
      colorPalette.style.backgroundColor = this.penColor;
    }

    if (pencilSize != null) {
      pencilSize.value = this.penSize;
      pencilSize.addEventListener('change', (ev) => {
        this.penSize = ev.target.value;
      });
    }

    if (pencilOpacity != null) {
      pencilOpacity.value = this.penOpacity;
      pencilOpacity.addEventListener('change', ev => {
        this.penOpacity = ev.target.value;
      });
    }
  }

  //CanvasStyle
  setCanvasStyle = () => {
    this.canvas.style.border = '1px solid #778899';
    //Canvas背景設定
    //this.context.beginPath();
    //this.context.fillStyle = "#f5f5f5";
    //this.context.fillRect(0, 0, this.width, this.height);
  }

  //Canvasクリア
  clearCanvas = () => {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.setCanvasStyle();
  }

  /**
  * toioから座標が取れなくなったら、座標をリセット
  */
  drawFinish = () => {
    this.x = null;
    this.y = null;
  }

  //toioの座標が更新されたらdrawメソッドを実行
  //decodePositionDataContinuousメソッドで発火
  registerEventListeners() {
    document.addEventListener('positionUpdated', (event) => {
      if (this.isDrawingActive) {
        this.draw(event.detail);
      }
    });
  }

  //描画開始フラグ
  startDrawing() {
    this.isDrawingActive = true;
  }

  stopDrawing() {
    this.isDrawingActive = false;
  }

  /**
 * 描画処理 
 */
  draw = (info) => {
    const toX = info.x + this.positionRegX;
    const toY = info.y + this.positionRegY;

    this.context.beginPath();
    //透明度
    this.context.globalAlpha = this.penOpacity;

    const fromX = this.x || toX;
    const fromY = this.y || toY;

    this.context.moveTo(fromX, fromY);
    this.context.lineTo(toX, toY);
    //線の形状
    this.context.lineCap = 'round';
    //線の幅
    this.context.lineWidth = this.penSize;
    // this.context.lineWidth = 3;
    //線の色
    this.context.strokeStyle = this.penColor;
    // this.context.strokeStyle = 'black';

    //現在の線のスタイルで描画
    this.context.stroke();

    this.x = toX;
    this.y = toY;
  }

  /*
  =================
 リプレイ描画
 ==================
 */
  // ストレージから読み出した座標を描画する関数
  drawStoragePoints = () => {
    const storage = this.positionController.storage;
    //テキストボックスからdeviceIdを取得
    let getdeviceId = document.getElementById('deviceId').value
    //ローカルストレージから読み出す
    this.storageData = JSON.parse(storage.getItem(getdeviceId));
    //ストレージデータをもとに描画
    this.storageData.forEach((point) => {
      this.draw(point);
    });
    this.updateSlider(this.storageData.length); // スライダーの最大値を設定
  }

  updateSlider = (length) => {
    this.stopReplay(); // リプレイを停止
    this.slider.max = length - 1; // スライダーの最大値を設定
    this.slider.oninput = () => {
      this.drawPoints(this.slider.value); // スライダーが動かされたときの処理
    }
  }

  //読み出した座標をリプレイで再生
  startReplay = () => {
    let index = 0;
    this.isReplaying = true; // リプレイを開始する

    const slider = this.slider;
    const storageData = this.storageData;
    const replayInterval = this.replayInterval;
    const drawPoints = this.drawPoints.bind(this);

    this.clearCanvas(); // キャンバスをクリア

    clearInterval(replayInterval); // 既存のインターバルをクリア
    this.replayInterval = setInterval(function () {
      if (index < storageData.length) {
        slider.value = index; // スライダーの位置を更新
        drawPoints(index);
        index++;
      } else {
        clearInterval(replayInterval); // 全ての点を描画したらインターバルを停止
      }
    }, 50);
  }

  stopReplay = () => {
    clearInterval(this.replayInterval);
    this.isReplaying = false; // リプレイが非アクティブであることを示す
  }

  drawPoints = (index) => {
    if (index < this.storageData.length && this.storageData[index] && this.storageData[index - 1] &&
      this.storageData[index].x !== undefined && this.storageData[index].y !== undefined &&
      this.storageData[index - 1].x !== undefined && this.storageData[index - 1].y !== undefined) {
      // 前回の座標から今回の座標まで線を引く
      this.ReplayDraw(this.storageData[index - 1], this.storageData[index]);
    } else {
      console.error('Invalid data at index:', index); // 不正なデータがある場合はエラーを出力
    }
  }

  //リプレイ描画処理
  ReplayDraw = (fromInfo, toInfo) => {
    const fromX = fromInfo.x + this.positionRegX;
    const fromY = fromInfo.y + this.positionRegY;
    const toX = toInfo.x + this.positionRegX;
    const toY = toInfo.y + this.positionRegY;

    this.context.beginPath();
    //透明度
    this.context.globalAlpha = this.penOpacity;

    this.context.moveTo(fromX, fromY);
    this.context.lineTo(toX, toY);
    //線の形状
    this.context.lineCap = 'round';
    //線の幅
    this.context.lineWidth = this.penSize;
    //線の色
    this.context.strokeStyle = this.penColor;

    //現在の線のスタイルで描画
    this.context.stroke();

    // 最後の点を更新
    this.x = toX;
    this.y = toY;
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

  constructor(bluetoothController, positionController) {
    this.bluetoothController = bluetoothController;
    this.positionController = positionController;
    this.toioEulerianAngles = { x: 0, y: 0, z: 0 };
    // this.positionDisplay = document.getElementById('position-display');
    this.storage = this.positionController.storage;
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
    データ位置	タイプ	　内容	　　　　　　　　　 例
    0	　　　　　UInt8	　　情報の種類	　　　　　　 0x03（姿勢角検出）
    1	　　　　　UInt8	　　通知内容の種類	　　　　 0x02（クォータニオンでの通知）
    2	　　　　　Float32	　Roll（ロール/X 軸）	　　0x00003443（180.0°）
    6	　　　　　Float32	　Pitch（ピッチ/Y 軸）	　0x00000000（0.0°）
    10	　　　　Float32	　Yaw（ヨー/Z 軸）	　　　0x00000000（0.0°）
    ==============================
    */

    // DataViewのバイト長をチェック
    if (dataView.byteLength >= 6) {
      // console.log(`Roll.x：${value.getInt16(2, true)}`);
      // console.log(`Roll.y：${value.getInt16(4, true)}`);
      // console.log(`Roll.z：${value.getInt16(6, true)}`);

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

      //ローカルストレージに保存
      const EulerianAngles = {
        'deviceName': deviceName,
        'deviceId': deviceId,
        '通知内容': this.toioNorify,
        'x軸': this.toioEulerianAngles.x,
        'y軸': this.toioEulerianAngles.y,
        'z軸': this.toioEulerianAngles.z,
      }

      this.storeEulerianAnglesData(deviceId, EulerianAngles);  // データストアを抽象化　追加
    } else {
      //  console.error('Received data is too short.');
    }
  }

  //一時的にキャッシュを作成し、５秒毎にローカルストレージに保存 連続姿勢角取得時に使用
  storeEulerianAnglesData(deviceId, data) {
    // データの一時的なキャッシュと定期的な保存
    if (!this.dataCache) this.dataCache = {};
    if (!this.dataCache[deviceId]) this.dataCache[deviceId] = [];
    this.dataCache[deviceId].push(data);

    if (!this.saveInterval) {
      this.saveInterval = setInterval(() => {
        for (const [name, positions] of Object.entries(this.dataCache)) {
          const storedData = JSON.parse(this.storage.getItem(name) || "[]");
          const updatedData = storedData.concat(positions);
          this.storage.setItem(name, JSON.stringify(updatedData));
          this.dataCache[name] = [];  // キャッシュをリセット
        }
      }, 5000);  // 5秒ごとに保存
    }
  }
}

class Drawing3DController {
  constructor(bluetoothController, positionController, eulerianAnglesController, width, height) {
    this.bluetoothController = bluetoothController;
    this.positionController = positionController;
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

    //マテリアル(質感)生成
    // this.material = new THREE.MeshStandardMaterial({ color: 0x0000FF }); //素材

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

    // this.renderer.render(this.scene, this.camera);
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

    // 箱を回転させる
    // this.box.rotation.x += 0.01;
    // this.box.rotation.y += 0.01;

    // レンダリング
    this.renderer.render(this.scene, this.camera);
  }
}



//インスタンス
const bluetoothController = new BluetoothController();
const cubeController = new CubeController(bluetoothController);
const positionController = new PositionController(bluetoothController);
const drawingController = new DrawingController(bluetoothController, positionController, 608, 432, -100, -140);
const eulerianAnglesController = new EulerianAnglesController(bluetoothController, positionController);
const drawing3DController = new Drawing3DController(bluetoothController, positionController, eulerianAnglesController, 600, 600);

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

//連続座標取得
document.getElementById('get-position-continuous').addEventListener('click', () => {
  drawingController.stopDrawing(); // 念のため描画を無効化
  positionController.startReadingPosition();
});

//一時座標取得
document.getElementById('get-position-once').addEventListener('click', () => positionController.getPosition());

document.getElementById('position-clear').addEventListener('click', () => positionController.positionDisplayClear());

//座標取得停止（描画も停止）
document.getElementById('get-position-continuous-stop').addEventListener('click', () => {
  positionController.stopReadingPosition();
  drawingController.stopDrawing();
});

//姿勢角取得
document.getElementById('get-EulerianAngles-continuous').addEventListener('click', () => {
  eulerianAnglesController.Euleriansetting();
  eulerianAnglesController.startReadingEulerian();
});

//姿勢角取得停止
document.getElementById('get-EulerianAngles-continuous-stop').addEventListener('click', () => {
  eulerianAnglesController.stopReadingEulerian();
});

//ストレージから座標を読み出す
document.getElementById('get-positon-storage').addEventListener('click', () => {
  drawingController.clearCanvas();
  drawingController.drawStoragePoints();
});

//リプレイ
document.getElementById('replayDraw-start').addEventListener('click', () => {
  drawingController.drawStoragePoints(); // 最初にストレージから座標を読み出す
  drawingController.clearCanvas();
  drawingController.startReplay(); // リプレイ開始
});

//リプレイ停止
document.getElementById('replayDraw-stop').addEventListener('click', () => {
  drawingController.stopReplay();
});
