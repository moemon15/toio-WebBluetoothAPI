'use strict';

/* クラス */
class BluetoothController {
    static TOIO_SERVICE_UUID = "10b20100-5b3b-4571-9508-cf3efcd7bbae";
    static ID_SENSOR_CHARACTERISTICS_UUID = '10b20101-5b3b-4571-9508-cf3efcd7bbae';

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
            const sensorCharacteristic = await service.getCharacteristic(BluetoothController.ID_SENSOR_CHARACTERISTICS_UUID);

            //デバイスの追加
            this.devices.set(device.id, {
                device: device,
                characteristics: {
                    sensor: sensorCharacteristic,
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

            console.log(`
            キューブの中心の X 座標値:${dataView.getUint16(1, true)}, 
            キューブの中心の Y 座標値:${dataView.getUint16(3, true)}, 
            Cubeの角度:${dataView.getUint16(5, true)}`
            );
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



/* インスタンス */
const bluetoothController = new BluetoothController();
const positionController = new PositionController(bluetoothController);


/* イベントリスナー */
// toio接続
document.getElementById('connectButton').addEventListener('click', () => bluetoothController.connect());

//連続座標取得
document.getElementById('get-position-continuous').addEventListener('click', () => {
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