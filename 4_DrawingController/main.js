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

    constructor(bluetoothController, storageController) {
        this.bluetoothController = bluetoothController;
        this.storageController = storageController;

        this.toioPosition = { x: 0, y: 0, angle: 0, sensorX: 0, sensorY: 0, sensorAngle: 0 };
        this.positionDisplay = document.getElementById('position-display');

        // メソッドのバインド
        this.PositionMissed = this.PositionMissed.bind(this);
        this.decodePositionDataContinuous = this.decodePositionDataContinuous.bind(this);
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

            // DrawingControllerのinit()に処理内容記述あり
            document.dispatchEvent(new CustomEvent('positionMissed', {
            }));

            const deviceId = event.target.service.device.id;
            const deviceName = event.target.service.device.name;

            //直前の座標データにフラグを立てる

            // キャッシュを更新
            if (this.storageController.dataCache && this.storageController.dataCache[deviceName] && this.storageController.dataCache[deviceName].length > 0) {
                const lastPosition = this.storageController.dataCache[deviceName][this.storageController.dataCache[deviceName].length - 1];
                lastPosition.isEndOfLine = true;
            }

            // ストレージデータのisEndOfLineフラグをtrueに
            const storagedData = JSON.parse(this.storageController.getData(deviceName) || "[]");

            if (storagedData.length > 0) {
                const lastPosition = storagedData[storagedData.length - 1];
                lastPosition.isEndOfLine = true;
                this.storageController.saveData(deviceName, JSON.stringify(storagedData));
            }
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
            const positionData = {
                'deviceName': deviceName,
                'deviceId': deviceId,
                'x': this.toioPosition.x,
                'y': this.toioPosition.y,
                'angle': this.toioPosition.angle,
                'sensorX': this.toioPosition.sensorX,
                'sensorY': this.toioPosition.sensorY,
                'sensorAngle': this.toioPosition.sensorAngle,
                'isEndOfLine': false
            }

            this.storageController.storePositionData(deviceName, positionData);  // データストアを抽象化
        } else {
            //  console.error('Received data is too short.');
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
            const positionData = {
                'daviceName': deviceName,
                'deviceID': deviceId,
                'x': this.toioPosition.x,
                'y': this.toioPosition.y,
                'angle': this.toioPosition.angle,
                'sensorX': this.toioPosition.sensorX,
                'sensorY': this.toioPosition.sensorY,
                'sensorAngle': this.toioPosition.sensorAngle
            }

            // deviceName毎にローカルストレージからデータを取得し、存在しない場合は新しい配列を作成
            let deviceData = JSON.parse(this.storage.getItem(deviceName) || "[]");

            // データを追加
            deviceData.push(positionData);

            // ローカルストレージに保存
            this.storage.setItem(deviceName, JSON.stringify(deviceData));

            // console.log('キューブの中心の X 座標値:', dataView.getUint16(1, true));
            // console.log('キューブの中心の Y 座標値:', dataView.getUint16(3, true));
            // console.log('Cubeの角度:', dataView.getUint16(5, true));
        }

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

    replayDrawFinish = () => {
        this.context.closePath(); // 現在のパスを終了
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
        //線の色
        this.context.strokeStyle = this.penColor;

        //現在の線のスタイルで描画
        this.context.stroke();

        this.x = toX;
        this.y = toY;
    }

}

class ReplayController {
    constructor(drawingController, storageController) {
        this.drawingController = drawingController;
        this.storageController = storageController;
        this.slider = document.getElementById('slider');
        this.replayInterval = null;
        this.isReplaying = false;
        this.storageData = [];

        this.slider.oninput = () => {
            if (!this.isReplaying) {
                this.drawPoints(parseInt(this.slider.value, 10));
            }
        };

        this.slider.onchange = () => {
            this.stopReplay();
            this.drawPoints(parseInt(this.slider.value, 10));
        };
    }

    drawStoragePoints = () => {
        const deviceId = this.getDeviceId();
        this.storageData = this.storageController.getData(deviceId);

        this.updateSlider(this.storageData.length);
        this.drawPoints(0); // 初期位置を描画
    }

    updateSlider = (length) => {
        this.stopReplay();
        this.slider.max = length - 1;
        this.slider.value = 0;
    }

    startReplay = () => {
        let index = 0;
        this.isReplaying = true;

        this.drawingController.clearCanvas();

        clearInterval(this.replayInterval);
        this.replayInterval = setInterval(() => {
            if (index < this.storageData.length) {
                this.slider.value = index;
                this.drawPoints(index);
                index++;
            } else {
                clearInterval(this.replayInterval);
                this.isReplaying = false;
            }
        }, 50);
    }

    stopReplay = () => {
        clearInterval(this.replayInterval);
        this.isReplaying = false;
    }

    drawPoints = (index) => {
        this.drawingController.clearCanvas();

        for (let i = 0; i <= index; i++) {
            const point = this.storageData[i];
            if (i > 0 && !this.storageData[i - 1].isEndOfLine) {
                this.ReplayDraw(this.storageData[i - 1], point);
            }

            if (point.isEndOfLine) {
                this.drawingController.replayDrawFinish();
            }
        }
    }

    ReplayDraw = (fromInfo, toInfo) => {
        const fromX = fromInfo.x + this.drawingController.positionRegX;
        const fromY = fromInfo.y + this.drawingController.positionRegY;
        const toX = toInfo.x + this.drawingController.positionRegX;
        const toY = toInfo.y + this.drawingController.positionRegY;

        this.drawingController.context.beginPath();
        this.drawingController.context.globalAlpha = this.drawingController.penOpacity;

        this.drawingController.context.moveTo(fromX, fromY);
        this.drawingController.context.lineTo(toX, toY);
        this.drawingController.context.lineCap = 'round';
        this.drawingController.context.lineWidth = this.drawingController.penSize;
        this.drawingController.context.strokeStyle = this.drawingController.penColor;

        this.drawingController.context.stroke();
    }

    getDeviceId = () => {
        return document.getElementById('deviceId').value;
    }
}

class StorageController {
    constructor() {
        this.storage = localStorage;
        this.dataCache = {};
    }

    storePositionData(devieName, data) {
        if (!this.dataCache[devieName]) this.dataCache[devieName] = [];
        this.dataCache[devieName].push(data);

        if (!this.saveInterval) {
            this.saveInterval = setInterval(() => {
                for (const [name, positions] of Object.entries(this.dataCache)) {
                    const storedData = this.getData(name) || [];
                    const updatedData = storedData.concat(positions);
                    this.saveData(name, updatedData);
                    this.dataCache[name] = [];
                }
            }, 5000);
        }
    }

    getData(deviceName) {
        const data = this.storage.getItem(deviceName);
        return data ? JSON.parse(data) : [];
    }

    saveData(deviceName, data) {
        this.storage.setItem(deviceName, JSON.stringify(data));
    }
}



/* インスタンス */
const bluetoothController = new BluetoothController();
const storageController = new StorageController();
const positionController = new PositionController(bluetoothController, storageController);
const drawingController = new DrawingController(bluetoothController, positionController, 608, 432, -100, -140);
const replayController = new ReplayController(drawingController, storageController);


/* イベントリスナー */
// toio接続
document.getElementById('connectButton').addEventListener('click', () => bluetoothController.connect());

// 描画処理
document.getElementById('draw-start').addEventListener('click', () => {
    console.log('お絵かき開始ボタンがクリックされました');
    positionController.startReadingPosition();
    drawingController.startDrawing();
})
document.getElementById('draw-stop').addEventListener('click', () => {
    console.log('お絵かき停止ボタンがクリックされました');
    positionController.stopReadingPosition();
})
document.getElementById('clear-button').addEventListener('click', () => {
    console.log('Canvasクリアボタンがクリックされました');
    drawingController.clearCanvas();
});

//ストレージから座標を読み出す
document.getElementById('get-positon-storage').addEventListener('click', () => {
    drawingController.clearCanvas();
    replayController.drawStoragePoints();
});

//リプレイ
document.getElementById('replayDraw-start').addEventListener('click', () => {
    replayController.drawStoragePoints();
    drawingController.clearCanvas();
    replayController.startReplay();
});

//リプレイ停止
document.getElementById('replayDraw-stop').addEventListener('click', () => {
    replayController.stopReplay();
});