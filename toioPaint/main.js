'use strict';

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

            /*--- 接続済一覧に追加 ---*/

            // デバイスリストの親要素を取得
            const deviceList = document.getElementById('device-list');
            // details要素を作成
            const details = document.createElement('details');
            // summary要素を作成してデバイス名を設定
            const summary = document.createElement('summary');
            summary.textContent = device.name;
            // ul要素を作成
            const ul = document.createElement('ul');
            // デバイスIDのli要素を作成
            const idLi = document.createElement('li');
            idLi.textContent = device.id;

            // ul要素にli要素を追加
            ul.appendChild(idLi);

            // details要素にsummary要素とul要素を追加
            details.appendChild(summary);
            details.appendChild(ul);

            // デバイスリストにdetails要素を追加
            deviceList.appendChild(details);


        } catch (error) {
            console.log("Argh! " + error);
        }
    }

    async disconnect() {
        try {
            for (let [id, deviceInfo] of this.devices) {
                console.log(`Disconnecting from device: ${deviceInfo.device.name}`);
                await deviceInfo.device.gatt.disconnect();
                console.log(`Disconnected from device: ${deviceInfo.device.name}`);

                // デバイスの削除
                this.devices.delete(id);

                // 接続デバイス一覧からの削除
                const deviceList = document.getElementById('device-list');
                deviceList.querySelectorAll('details').forEach(details => {
                    if (details.querySelector('li').textContent === id) {
                        details.remove();
                    }
                });
            }
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
        this.positionDisplayX = document.getElementById('dispX');
        this.positionDisplayY = document.getElementById('dispY');
        this.angleDisplay = document.getElementById('dispAngle');

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

            const deviceName = event.target.service.device.name;

            // キャッシュを更新
            if (this.storageController.dataCache && this.storageController.dataCache[deviceName] && this.storageController.dataCache[deviceName].length > 0) {
                const lastPosition = this.storageController.dataCache[deviceName][this.storageController.dataCache[deviceName].length - 1];
                lastPosition.isEndOfLine = true;
            }

            const storagedData = this.storageController.getData(deviceName) || [];

            if (storagedData.length > 0) {
                const lastPosition = storagedData[storagedData.length - 1];
                lastPosition.isEndOfLine = true;
                this.storageController.saveData(deviceName, storagedData);
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

            // データストアを抽象化
            this.storageController.storePositionData(deviceName, positionData);

            this.positionDisplayX.textContent = this.toioPosition.x;
            this.positionDisplayY.textContent = this.toioPosition.y;
            this.angleDisplay.textContent = this.toioPosition.angle;

            // console.log(`
            // キューブの中心の X 座標値:${dataView.getUint16(1, true)}, 
            // キューブの中心の Y 座標値:${dataView.getUint16(3, true)}, 
            // Cubeの角度:${dataView.getUint16(5, true)}`
            // );
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

            // デバイスID毎にローカルストレージからデータを取得し、存在しない場合は新しい配列を作成
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

    constructor(toioMatTopLeftX, toioMatTopLeftY, toioMatBottomRightX, toioMatBottomRightY, CanvasWidth, CanvasHeight, positionRegX, positionRegY) {
        // 描画の有効/無効を制御するフラグ
        this.isDrawingActive = false;

        // ペンの初期値を設定
        this.lineWidth = 3;
        this.alpha = 1;
        this.color = '#000000';

        this.registerEventListeners();

        /*
        ==============================
        Canvasの「描画バッファーのサイズ」と「表示サイズ」を設定
        ==============================
        */

        // toioマットのサイズを設定
        this.toioMatWidth = toioMatBottomRightX - toioMatTopLeftX;
        this.toioMatHeight = toioMatBottomRightY - toioMatTopLeftY;

        // 実際のCanvasのサイズを設定
        this.canvasWidth = CanvasWidth;
        this.canvasHeight = CanvasHeight;

        // Canvas表示サイズ (CSS)
        this.displayWidth = 1400;  // 表示される幅
        this.displayHeight = 1000; // 表示される高さ

        //toioマット座標調整　オフセット
        /* toioマットの座標を0にずらす */
        this.positionRegX = positionRegX;
        this.positionRegY = positionRegY;

        // 初期表示サイズを設定 ブラウザ幅によってCanavsの表示サイズを動的に変化
        this.updateDisplaySize();

        // スケール計算
        this.scaleX = this.canvasWidth / this.toioMatWidth;
        this.scaleY = this.canvasHeight / this.toioMatHeight;

        // ピクセルデータの履歴を保持する配列
        // this.imagePixelDataHistory = [];
        // this.drawPixelDataHistory = [];

        this.x = null;
        this.y = null;

        this.init();
    }

    /*
    ==============================
    初期化
    ==============================
    */
    init = () => {
        this.imageCanvas = document.getElementById('imageCanvas');
        this.drawCanvas = document.getElementById('drawCanvas');

        this.imageCtx = this.imageCanvas.getContext('2d');
        this.drawCtx = this.drawCanvas.getContext('2d');

        this.resizeCanvas();

        // ペンの初期化
        document.getElementById('size').textContent = this.lineWidth;
        document.getElementById('size-slider').value = this.lineWidth;
        document.getElementById('transparent').textContent = this.alpha;
        document.getElementById('alpha-slider').value = this.alpha;

        // スライダーの変更イベント
        document.getElementById('size-slider').addEventListener('input', (event) => {
            this.setLineWidth(event.target.value);
        });
        document.getElementById('alpha-slider').addEventListener('input', (event) => {
            this.setAlpha(event.target.value);
        });
        document.getElementById('pencilColor').addEventListener('input', (event) => {
            this.setColor(event.target.value);
        });

        // ウィンドウの幅が変化したときのリサイズイベントリスナー
        window.addEventListener('resize', this.handleResize);

        //toioが座標を読み取れなくなったとき実行イベント
        //PositionContorollerのPositionMissedメソッドで発火
        document.addEventListener('positionMissed', (event) => {
            if (this.isDrawingActive) {
                this.drawFinish();
            }
        });

    }

    /*
    ==============================
    Canvasサイズ設定
    ==============================
    */
    updateDisplaySize() {
        const cardBody = document.querySelector('.card-body');
        this.displayWidth = cardBody.clientWidth;
        this.displayHeight = cardBody.clientHeight;
    }

    handleResize = () => {
        this.updateDisplaySize();
        this.resizeCanvas();
    }

    resizeCanvas = () => {
        // 現在のCanvasの内容を保存
        const imageCanvasData = this.imageCanvas ? this.imageCtx.getImageData(0, 0, this.imageCanvas.width, this.imageCanvas.height) : null;
        const drawCanvasData = this.drawCtx.getImageData(0, 0, this.drawCanvas.width, this.drawCanvas.height);

        // Canvasのサイズを設定
        this.imageCanvas.width = this.canvasWidth;
        this.imageCanvas.height = this.canvasHeight;
        this.drawCanvas.width = this.canvasWidth;
        this.drawCanvas.height = this.canvasHeight;

        // CSSの表示サイズを設定
        this.imageCanvas.style.width = `${this.displayWidth}px`;
        this.imageCanvas.style.height = `${this.displayHeight}px`;
        this.drawCanvas.style.width = `${this.displayWidth}px`;
        this.drawCanvas.style.height = `${this.displayHeight}px`;

        // Canvasの縮尺を設定
        if (this.imageCtx) {
            this.imageCtx.setTransform(1, 0, 0, 1, 0, 0); // 既存のスケールをリセット
            this.imageCtx.scale(this.scaleX, this.scaleY);
        }
        this.drawCtx.setTransform(1, 0, 0, 1, 0, 0); // 既存のスケールをリセット
        this.drawCtx.scale(this.scaleX, this.scaleY);

        // 保存した内容を再描画
        if (this.imageCtx && imageCanvasData) {
            this.imageCtx.putImageData(imageCanvasData, 0, 0);
        }
        this.drawCtx.putImageData(drawCanvasData, 0, 0);
    }

    /*
    ==============================
    描画処理
    ==============================
    */

    // ペン設定
    // 太さ
    setLineWidth(value) {
        this.lineWidth = value;
        document.getElementById('size').textContent = value;
    }

    // 透過度
    setAlpha(value) {
        this.alpha = value;
        document.getElementById('transparent').textContent = value;
    }

    // 色
    setColor(value) {
        this.color = value;
    }

    //Canvasクリア
    clearCanvas = () => {
        this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        // this.setCanvasStyle();
    }

    // toioから座標が取れなくなったら、座標をリセット
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

    /* 描画処理 */
    draw = (info) => {
        const toX = info.x + this.positionRegX;
        const toY = info.y + this.positionRegY;

        const scale = 2;
        const PixeltoX = (info.x + this.positionRegX) * scale;
        const PixeltoY = (info.y + this.positionRegY) * scale;

        /*
        ==================
        採点機能　ピクセルデータ取得・保存
        ==================
        */

        // if (this.imageCtx) {
        //     // imageCtxピクセルデータの取得
        //     const imagePixelData = this.imageCtx.getImageData(PixeltoX, PixeltoY, 1, 1).data;
        //     // 履歴として保持
        //     this.imagePixelDataHistory.push(Array.from(imagePixelData));
        // }

        // imageCtxピクセルデータの取得
        // const imagePixelData = this.imageCtx.getImageData(PixeltoX, PixeltoY, 1, 1).data;
        // console.log(`画像ピクセル (${PixeltoX}, ${PixeltoY}):`, imagePixelData);

        // drawCtxピクセルデータの取得
        // const drawPixelData = this.drawCtx.getImageData(PixeltoX, PixeltoY, 1, 1).data;
        // console.log(`描画ピクセル (${PixeltoX}, ${PixeltoY}):`, drawPixelData);

        // 履歴として保持
        // this.imagePixelDataHistory.push(Array.from(imagePixelData));
        // this.drawPixelDataHistory.push(Array.from(drawPixelData));

        this.drawCtx.beginPath();

        const fromX = this.x || toX;
        const fromY = this.y || toY;

        this.drawCtx.moveTo(fromX, fromY);
        this.drawCtx.lineTo(toX, toY);

        //線の形状
        this.drawCtx.lineCap = 'round';
        //線の幅
        this.drawCtx.lineWidth = this.lineWidth;
        //線の色
        this.drawCtx.strokeStyle = this.color;
        //透明度
        this.drawCtx.globalAlpha = this.alpha;

        //現在の線のスタイルで描画
        this.drawCtx.stroke();

        this.x = toX;
        this.y = toY;
    }
}

class StorageController {
    constructor() {
        this.storage = localStorage;
        this.dataCache = {};
    }

    storePositionData(deviceName, data) {
        if (!this.dataCache[deviceName]) this.dataCache[deviceName] = [];
        this.dataCache[deviceName].push(data);

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

    displayLocalStorageKeys() {
        const localStorageKeys = Object.keys(this.storage);
        const ulElement = document.getElementById('localStorageKeys');
        ulElement.innerHTML = ''; // Clear existing content

        localStorageKeys.forEach(key => {
            const liElement = document.createElement('li');
            liElement.textContent = key;
            liElement.addEventListener('click', this.toggleDetails);

            const detailsElement = document.createElement('div');
            detailsElement.className = 'details';
            detailsElement.textContent = `${key}: ${this.storage.getItem(key)}`;

            ulElement.appendChild(liElement);
            ulElement.appendChild(detailsElement);
        });
    }

    toggleDetails(event) {
        const detailsElement = event.currentTarget.nextElementSibling;
        if (detailsElement.style.display === 'none' || !detailsElement.style.display) {
            detailsElement.style.display = 'block';
        } else {
            detailsElement.style.display = 'none';
        }
    }
}

/*
==============================
インスタンス
==============================
*/
const bluetoothController = new BluetoothController();
const storageController = new StorageController();
const positionController = new PositionController(bluetoothController, storageController);
// toioMatTopLeftX, toioMatTopLeftY, toioMatBottomRightX, toioMatBottomRightY, CanvasWidth, CanvasHeight, positionRegX, positionRegY
const drawingController = new DrawingController(90, 130, 410, 370, 1920, 1080, -90, -140);


/*
==============================
イベントリスナー
==============================
*/
//toio接続
document.getElementById('connectButton').addEventListener('click', () => bluetoothController.connect());
//toio切断
document.getElementById('disconnectButton').addEventListener('click', () => bluetoothController.disconnect());
// 描画処理
document.getElementById('startDrawingButton').addEventListener('click', () => {
    console.log('お絵かき開始ボタンがクリックされました');
    positionController.startReadingPosition();
    drawingController.startDrawing();
})
document.getElementById('stopDrawingButton').addEventListener('click', () => {
    console.log('お絵かき停止ボタンがクリックされました');
    positionController.stopReadingPosition();
    drawingController.stopDrawing();
})
document.getElementById('clearButton').addEventListener('click', () => {
    console.log('Canvasクリアボタンがクリックされました');
    drawingController.clearCanvas();
});

// 画像ファイルをCanvasに描画
document.getElementById('uploadfile').addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    if (file.type.indexOf("image") < 0) {
        alert("画像ファイルを指定してください。");
        return false;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.getElementById('imageCanvas');
            const ctx = canvas.getContext('2d');

            // canvasエリアと画像のスケールを計算（縦・横 スケール値が低い方を採用）
            const scale = Math.min(
                document.getElementById('canvas-area').offsetWidth / img.naturalWidth,
                document.getElementById('canvas-area').offsetHeight / img.naturalHeight
            );

            // canvasエリアの高さ・幅を設定
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            document.getElementById('drawCanvas').width = canvas.width;
            document.getElementById('drawCanvas').height = canvas.height;

            // 画像を縮小して設定
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // 説明文を非表示に
            // document.getElementById('explanation').style.display = 'none';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
});
// ローカルストレージデータ取得
document.addEventListener('DOMContentLoaded', () => {
    storageController.displayLocalStorageKeys();
});



