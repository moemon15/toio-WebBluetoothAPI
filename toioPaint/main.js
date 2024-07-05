'use strict';

// 変数のグローバル定義
let replayController;
let canvasToToio;

class BluetoothController {
    static TOIO_SERVICE_UUID = "10b20100-5b3b-4571-9508-cf3efcd7bbae";
    static MOTOR_CHARACTERISTIC_UUID = "10b20102-5b3b-4571-9508-cf3efcd7bbae";
    static ID_SENSOR_CHARACTERISTICS_UUID = '10b20101-5b3b-4571-9508-cf3efcd7bbae';
    static EulerianAngles_CHARACTERISTICS_UUID = '10b20106-5b3b-4571-9508-cf3efcd7bbae';
    static CONFIGURATION_CHARACTERISTIC_UUID = '10b201ff-5b3b-4571-9508-cf3efcd7bbae';

    constructor() {
        this.devices = new Map();
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

    async sendToioCommand(command, characteristicType) {
        
        if (this.devices.size > 0) {
            for (const [deviceId, deviceInfo] of this.devices.entries()) {
                console.log("Device ID:", deviceId); // デバイスIDをログに出力
                console.log("Device Info:", deviceInfo); // deviceInfoの内容をログに出力

                if (deviceInfo.characteristics && deviceInfo.characteristics[characteristicType]) {
                    console.log("Writing command to motor...");
                    await deviceInfo.characteristics[characteristicType].writeValue(command);
                } else {
                    console.log(`デバイスID:${deviceId}の${characteristicType} characteristicが見つかりません`);
                }
            }
        } else {
            console.log('デバイスが接続されていません');
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
        this.storageController = storageController;

        // 描画の有効/無効を制御するフラグ
        this.isDrawingActive = false;
        // imageCanvasの画像の有無を制御するフラグ
        this.isImageDrawn = false;

        // ペンの初期値を設定
        this.color = '#000000';
        this.alpha = 1;
        this.lineWidth = 3;

        this.mode = 'pen';

        this.registerEventListeners();

        /*
        ==============================
        Canvasの「描画バッファーのサイズ」と「表示サイズ」を設定
        ==============================
        */
        //toioマット座標調整　オフセット
        /* toioマットの座標を0にずらす */
        this.positionRegX = positionRegX;
        this.positionRegY = positionRegY;

        // toioマットのサイズ計算
        this.toioMatWidth = toioMatBottomRightX - toioMatTopLeftX;
        this.toioMatHeight = toioMatBottomRightY - toioMatTopLeftY;

        // デバイスピクセル比を取得
        const dpr = window.devicePixelRatio || 1;

        // ブラウザに表示するCanvasのサイズ
        // / 任意のサイズ
        this.displayWidth = 320 * 4.5;
        // toioマットの縦横比を維持
        this.displayHeight = this.displayWidth * (this.toioMatHeight / this.toioMatWidth);

        // Canvasサイズの初期設定を保持
        this.defaultCanvasWidth = this.displayWidth;
        this.defaultCanvasHeight = this.displayHeight;

        // Canvasのサイズを設定
        this.canvasWidth = this.defaultCanvasWidth;
        this.canvasHeight = this.defaultCanvasHeight;

        // Canvas表示サイズ初期設定を保持 (CSS)
        // this.defaultDisplayWidth = 1400;
        // this.defaultDisplayHeight = 1000;
        // Canvas表示サイズ (CSS)
        // this.displayWidth = this.defaultDisplayWidth;  
        // this.displayHeight = this.defaultDisplayHeight;


        // スケール計算
        this.scaleX = this.canvasWidth / this.toioMatWidth;
        this.scaleY = this.canvasHeight / this.toioMatHeight;

        // ピクセルデータの履歴を保持する配列
        this.imagePixelDataHistory = [];
        this.drawPixelDataHistory = [];

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

        // Canvas初期化
        this.setCanvas();

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

    setCanvas = () => {
        // Canvasのサイズを設定
        this.imageCanvas.width = this.canvasWidth;
        this.imageCanvas.height = this.canvasHeight;
        this.drawCanvas.width = this.canvasWidth;
        this.drawCanvas.height = this.canvasHeight;

        // CSSの表示サイズを設定
        // this.imageCanvas.style.width = `${this.displayWidth}px`;
        // this.imageCanvas.style.height = `${this.displayHeight}px`;
        // this.drawCanvas.style.width = `${this.displayWidth}px`;
        // this.drawCanvas.style.height = `${this.displayHeight}px`;
    }

    // 画像が設定された場合にCanvasのサイズを変更
    // updateCanvasSizeForImage = (img) => {
    //     this.canvasWidth = img.width;
    //     console.log(`update.canvasWidth：${this.canvasWidth}`);
    //     this.canvasHeight = img.height;
    //     console.log(`update.canvasHeight：${this.canvasHeight}`);
    //     // this.scaleX = this.canvasWidth / this.toioMatWidth;
    //     // this.scaleY = this.canvasHeight / this.toioMatHeight;
    //     console.log(this.scaleX);
    //     console.log(this.scaleY);
    //     // CSSの表示サイズも同じに設定
    //     this.displayWidth = img.width;
    //     console.log(`update.displayWidth:${this.displayWidth}`);
    //     this.displayHeight = img.height;
    //     this.setCanvas();
    // }

    // Canvasを初期設定に戻す
    resetCanvasSize = () => {
        this.canvasWidth = this.defaultCanvasWidth;
        this.canvasHeight = this.defaultCanvasHeight;
        this.setCanvas();
    }

    /*
    ==============================
    描画処理
    ==============================
    */

    setMode(mode) {
        this.mode = mode;
    }

    // ペン設定
    // 色
    setColor(value) {
        this.color = value;
        this.storageController.updateDrawingState(this.color, this.alpha, this.lineWidth);
    }

    // 透過度
    setAlpha(value) {
        this.alpha = value;
        document.getElementById('transparent').textContent = value;
        this.storageController.updateDrawingState(this.color, this.alpha, this.lineWidth);
    }

    // 太さ
    setLineWidth(value) {
        this.lineWidth = value;
        document.getElementById('size').textContent = value;
        this.storageController.updateDrawingState(this.color, this.alpha, this.lineWidth);
    }

    // toio座標をCanvas座標に変換するメソッド
    toioToCanvasCoords(x, y) {
        const canvasX = (x + this.positionRegX) * this.scaleX;
        const canvasY = (y + this.positionRegY) * this.scaleY;
        return { x: canvasX, y: canvasY };
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
        const { x: toX, y: toY } = this.toioToCanvasCoords(info.x, info.y);

        const PixeltoX = (info.x + this.positionRegX) * this.scaleX;
        const PixeltoY = (info.y + this.positionRegY) * this.scaleY;

        /*
        ==================
        ピクセルデータ取得・保存
        ==================
        */

        if (this.imageCtx) {
            // imageCtxピクセルデータの取得
            const imagePixelData = this.imageCtx.getImageData(PixeltoX, PixeltoY, 1, 1).data;
            // 履歴として保持
            this.imagePixelDataHistory.push(Array.from(imagePixelData));
        }

        // imageCtxピクセルデータの取得
        const imagePixelData = this.imageCtx.getImageData(PixeltoX, PixeltoY, 1, 1).data;
        console.log(`画像ピクセル (${PixeltoX}, ${PixeltoY}):`, imagePixelData);

        // drawCtxピクセルデータの取得
        const drawPixelData = this.drawCtx.getImageData(PixeltoX, PixeltoY, 1, 1).data;
        console.log(`描画ピクセル (${PixeltoX}, ${PixeltoY}):`, drawPixelData);

        // 履歴として保持
        this.imagePixelDataHistory.push(Array.from(imagePixelData));
        this.drawPixelDataHistory.push(Array.from(drawPixelData));

        this.drawCtx.beginPath();

        const fromX = this.x || toX;
        const fromY = this.y || toY;

        this.drawCtx.moveTo(fromX, fromY);
        this.drawCtx.lineTo(toX, toY);

        //線の形状
        this.drawCtx.lineCap = 'round';
        //線の幅
        this.drawCtx.lineWidth = this.lineWidth;

        if (this.mode === 'pen') {
            //線の色
            this.drawCtx.strokeStyle = this.color;
            //透明度
            this.drawCtx.globalAlpha = this.alpha;
        } else if (this.mode === 'eraser') {
            this.drawCtx.strokeStyle = 'white';
            this.drawCtx.globalAlpha = 1;
        }

        //現在の線のスタイルで描画
        this.drawCtx.stroke();

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

    drawStoragePoints = (deviceName) => {
        this.storageData = this.storageController.getData(deviceName);

        this.updateSlider(this.storageData.length);
        this.drawPoints(parseInt(this.slider.value, 10));
    }

    updateSlider = (length) => {
        this.stopReplay();
        this.slider.max = length - 1;
        this.slider.value = 0;
    }

    startReplay = () => {
        let index = parseInt(this.slider.value, 10);
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

    replayDrawFinish = () => {
        this.drawingController.drawCtx.closePath(); // 現在のパスを終了
        this.x = null;
        this.y = null;
    }

    drawPoints = (index) => {
        this.drawingController.clearCanvas();

        for (let i = 0; i <= index; i++) {
            const point = this.storageData[i];
            if (i > 0 && !this.storageData[i - 1].isEndOfLine) {
                this.ReplayDraw(this.storageData[i - 1], point);
            }

            if (point.isEndOfLine) {
                this.replayDrawFinish();
            }
        }
    }

    ReplayDraw = (fromInfo, toInfo) => {
        const { x: fromX, y: fromY } = this.drawingController.toioToCanvasCoords(fromInfo.x, fromInfo.y);
        const { x: toX, y: toY } = this.drawingController.toioToCanvasCoords(toInfo.x, toInfo.y);

        this.drawingController.drawCtx.beginPath();
        this.drawingController.drawCtx.strokeStyle = toInfo.color || this.drawingController.color;
        this.drawingController.drawCtx.globalAlpha = toInfo.alpha || this.drawingController.alpha;
        this.drawingController.drawCtx.lineWidth = toInfo.lineWidth || this.drawingController.lineWidth;

        this.drawingController.drawCtx.moveTo(fromX, fromY);
        this.drawingController.drawCtx.lineTo(toX, toY);
        this.drawingController.drawCtx.lineCap = 'round';


        this.drawingController.drawCtx.stroke();
    }

}

class StorageController {
    constructor() {
        this.storage = localStorage;
        this.dataCache = {};

        this.currentDrawingState = {
            color: '#000000',
            alpha: 1,
            lineWidth: 3
        };
    }

    updateDrawingState(color, alpha, lineWidth) {
        this.currentDrawingState = { color, alpha, lineWidth };
    }

    storePositionData(deviceName, data) {
        if (!this.dataCache[deviceName]) this.dataCache[deviceName] = [];

        const graphicProperties = {
            ...data,
            ...this.currentDrawingState
        };

        this.dataCache[deviceName].push(graphicProperties);

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

    displayLocalStorageKeys(replayController, canvasToToio) {
        const localStorageKeys = Object.keys(this.storage);
        const ulElement = document.getElementById('localStorageKeys');
        ulElement.innerHTML = ''; // Clear existing content

        localStorageKeys.forEach(key => {
            const liElement = document.createElement('li');
            liElement.textContent = key;
            liElement.addEventListener('click', (event) => {
                this.handleKeyClick(event, key, replayController, canvasToToio);
            });
            liElement.addEventListener('click', this.toggleDetails);

            const detailsElement = document.createElement('div');
            detailsElement.className = 'details';
            detailsElement.textContent = `${key}: ${this.storage.getItem(key)}`;

            ulElement.appendChild(liElement);
            ulElement.appendChild(detailsElement);
        });
    }

    // クリックイベントハンドラ
    // クリックイベントのハンドラを変更
    // handleKeyClick(event, key, replayController) {
    //     replayController.drawStoragePoints(key);
    // }

    handleKeyClick(event, key, replayController) {
        if (replayController) {
            replayController.drawStoragePoints(key);
        } else {
            console.error('ReplayController is not defined');
        }

        if (canvasToToio) {
            canvasToToio.getStorageData(key);
        } else {
            console.error('CanvasToToio is not defined');
        }
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

class ScoringSystem {
    constructor() {
        this.imageCanvas = document.getElementById('imageCanvas');
        this.drawCanvas = document.getElementById('drawCanvas');

        this.imageCtx = this.imageCanvas.getContext('2d');
        this.drawCtx = this.drawCanvas.getContext('2d');

    }

    /*
    calculateSimilarity(userData, modelImageData, targetColor, tolerance) {
        let matchCount = 0;
        let modelColorCount = 0;
        let userDrawnPixelCount = 0;

        for (let i = 0; i < modelImageData.data.length; i += 4) {
            const userR = userData.data[i];
            const userG = userData.data[i + 1];
            const userB = userData.data[i + 2];
            const modelR = modelImageData.data[i];
            const modelG = modelImageData.data[i + 1];
            const modelB = modelImageData.data[i + 2];

            if (Math.abs(modelR - targetColor.r) <= tolerance &&
                Math.abs(modelG - targetColor.g) <= tolerance &&
                Math.abs(modelB - targetColor.b) <= tolerance) {
                if (Math.abs(userR - modelR) <= tolerance &&
                    Math.abs(userG - modelG) <= tolerance &&
                    Math.abs(userB - modelB) <= tolerance) {
                    matchCount++;
                    // 一致している箇所を青でマーキング
                    userData.data[i] = 0;     // R
                    userData.data[i + 1] = 0;   // G
                    userData.data[i + 2] = 255;   // B
                    userData.data[i + 3] = 255; // A
                } else {
                    // 一致していない箇所を赤でマーキング
                    userData.data[i] = 255;     // R
                    userData.data[i + 1] = 0;   // G
                    userData.data[i + 2] = 0;   // B
                    userData.data[i + 3] = 255; // A
                }
            }
        }

        this.drawCtx.putImageData(userData, 0, 0); // マーキングされたイメージをキャンバスに描画
        const similarity = (matchCount / totalCount) * 100;
        return similarity.toFixed(2);
    }
    */


    // ユークリッド距離
    calculateSimilarity(userData, modelImageData, targetColor, tolerance) {
        let matchCount = 0;
        let modelColorCount = 0;
        let userDrawnPixelCount = 0;

        // ユーザーが描画したピクセル数をカウント
        /*
        ==================== 
        RGBAの透明度を表すAlpha値が0でないなら、ユーザーが描画した部分と特定
        Canvasのデフォルト状態は(R:0, G:0, B:0, A:0)
        ====================
        */
        for (let i = 0; i < userData.data.length; i += 4) {
            const userA = userData.data[i + 3];
            if (userA !== 0) {
                userDrawnPixelCount++;
            }
        }

        // drawCanvasのピクセルデータを基にループ
        for (let i = 0; i < userData.data.length; i += 4) {
            const userR = userData.data[i];
            const userG = userData.data[i + 1];
            const userB = userData.data[i + 2];
            const userA = userData.data[i + 3];

            // ユーザーが描画した部分を特定
            if (userA !== 0) {
                if (i < modelImageData.data.length) {
                    const modelR = modelImageData.data[i];
                    const modelG = modelImageData.data[i + 1];
                    const modelB = modelImageData.data[i + 2];

                    const colorDistanceModel = Math.sqrt(
                        Math.pow(modelR - targetColor.r, 2) +
                        Math.pow(modelG - targetColor.g, 2) +
                        Math.pow(modelB - targetColor.b, 2)
                    );

                    if (colorDistanceModel <= tolerance) {
                        modelColorCount++;

                        const colorDistanceUser = Math.sqrt(
                            Math.pow(userR - modelR, 2) +
                            Math.pow(userG - modelG, 2) +
                            Math.pow(userB - modelB, 2)
                        );

                        if (colorDistanceUser <= tolerance) {
                            matchCount++;
                            // 一致している箇所を青でマーキング
                            userData.data[i] = 0;
                            userData.data[i + 1] = 0;
                            userData.data[i + 2] = 255;
                            userData.data[i + 3] = 255;
                        }
                    } else {
                        // modelImageDataに対応するピクセルが一致していない場合
                        userData.data[i] = 255;
                        userData.data[i + 1] = 0;
                        userData.data[i + 2] = 0;
                        userData.data[i + 3] = 255;
                    }
                }
            }
        }

        // マーキング部分をキャンバスに描画
        this.drawCtx.putImageData(userData, 0, 0);
        const similarity = (matchCount / userDrawnPixelCount) * 100;
        console.log(`モデルピクセルトータル：${modelColorCount} `);
        console.log(`ユーザーピクセルトータル：${userDrawnPixelCount} `);
        console.log(`一致数：${matchCount} `);
        return similarity.toFixed(2);
    }

    computeSimilarity(targetColor, tolerance) {
        const userImageData = this.drawCtx.getImageData(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        const modelImageData = this.imageCtx.getImageData(0, 0, this.imageCanvas.width, this.imageCanvas.height);
        const similarity = this.calculateSimilarity(userImageData, modelImageData, targetColor, tolerance);
        console.log(`一致度: ${similarity}% `);
        alert(`あなたの点数は${similarity}点です`);
    }
}

class CanvasToToio {
    constructor(bluetoothController, storageController) {
        this.bluetoothController = bluetoothController;
        this.storageController = storageController;
        this.storageData = {};
        this.responseMotorControl = { controlType: 0, controlValue: 0, responseContent: 0 };
    }

    getStorageData(deviceName) {
        this.storageData = this.storageController.getData(deviceName);
    }

    startReplay = () => {
        this.toioPoints();
    }

    toioPoints = async () =>{
        for (let i = 0; i <= this.storageData.length; i++) {
            const sensorX = this.storageData[i].sensorX;
            const sensorY = this.storageData[i].sensorY;
            const sensorAngle = this.storageData[i].sensorAngle;
            await this.moveTo(sensorX, sensorY, sensorAngle);
        }
    }

    async moveTo(x, y, angle) {

        let buffer = new ArrayBuffer(13);
        let dataView = new DataView(buffer);

        dataView.setUint8(0, 0x03);
        dataView.setUint8(1, 0x00);
        dataView.setUint8(2, 0x05);
        dataView.setUint8(3, 0x00);
        dataView.setUint8(4, 0x50);
        dataView.setUint8(5, 0x00);
        dataView.setUint8(6, 0x00);
        dataView.setUint16(7, x, true);
        dataView.setUint16(9, y, true);
        dataView.setUint16(11, angle, true);

        let motorBuffer = new Uint8Array(buffer);
        await this.bluetoothController.sendToioCommand(motorBuffer, 'motor');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
const drawingController = new DrawingController(90, 130, 410, 370, 320, 240, -90, -140, storageController);
// const canvasToToio = new CanvasToToio(bluetoothController, storageController);
document.addEventListener('DOMContentLoaded', () => {
    replayController = new ReplayController(drawingController, storageController);
    canvasToToio = new CanvasToToio(bluetoothController, storageController);
    storageController.displayLocalStorageKeys(replayController, canvasToToio);
});
const scoringSystem = new ScoringSystem();



/*
==============================
イベントリスナー
==============================
*/
// toio接続
document.getElementById('connectButton').addEventListener('click', () => bluetoothController.connect());
// toio切断
document.getElementById('disconnectButton').addEventListener('click', () => bluetoothController.disconnect());
// 描画処理
document.getElementById('startDrawingButton').addEventListener('click', () => {
    console.log('お絵かき開始ボタンがクリックされました');
    positionController.startReadingPosition();
    drawingController.startDrawing();
});
document.getElementById('stopDrawingButton').addEventListener('click', () => {
    console.log('お絵かき停止ボタンがクリックされました');
    positionController.stopReadingPosition();
    drawingController.stopDrawing();
});
document.getElementById('clearButton').addEventListener('click', () => {
    console.log('Canvasクリアボタンがクリックされました');
    drawingController.clearCanvas();
});

// モード切り替え
document.addEventListener('DOMContentLoaded', () => {
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    modeRadios.forEach(radio => {
        radio.addEventListener('change', (event) => {
            if (event.target.value === '1') {
                drawingController.setMode('pen');
                console.log('ペンに切り替わりました');
            } else if (event.target.value === '2') {
                drawingController.setMode('eraser');
                console.log('消しゴムに切り替わりました');
            }
        });
    });
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
            const imageCanvas = document.getElementById('imageCanvas');
            const drawCanvas = document.getElementById('drawCanvas');
            const imageCtx = imageCanvas.getContext('2d');
            const drawCtx = drawCanvas.getContext('2d');

            const toioMatWidth = drawingController.toioMatWidth;
            const toioMatHeight = drawingController.toioMatHeight;

            // canvasエリアと画像のスケールを計算（縦・横 スケール値が低い方を採用）
            const scale = Math.min(
                document.getElementById('canvas-area').clientWidth / img.naturalWidth,
                document.getElementById('canvas-area').clientHeight / img.naturalHeight
            );

            // 画像の縮小後の幅と高さを計算
            const scaledWidth = img.naturalWidth * scale;
            const scaledHeight = img.naturalHeight * scale;

            // toioマットの比率を維持するためのスケール
            const toioMatScale = Math.min(scaledWidth / toioMatWidth, scaledHeight / toioMatHeight);

            // Canvasエリアの高さ・幅を設定
            imageCanvas.width = toioMatWidth * toioMatScale;
            imageCanvas.height = toioMatHeight * toioMatScale;

            drawCanvas.width = imageCanvas.width;
            drawCanvas.height = imageCanvas.height;

            // Canvasをクリア
            imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);

            imageCtx.drawImage(img, 0, 0, imageCanvas.width, imageCanvas.height);

            drawingController.isImageDrawn = true;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
});

// 画像削除
document.getElementById('removeImage').addEventListener('click', () => {
    const imageCanvas = document.getElementById('imageCanvas');
    const drawCanvas = document.getElementById('drawCanvas');
    const ctx = imageCanvas.getContext('2d');

    // ファイル選択をクリア
    document.getElementById('uploadfile').value = '';
    // Canvasをクリア
    ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);

    // Canvasサイズを初期設定に戻す
    drawingController.resetCanvasSize();

    drawingController.isImageDrawn = false;
});

// ローカルストレージデータ取得
document.addEventListener('DOMContentLoaded', () => {
    storageController.displayLocalStorageKeys(replayController);
});

// リプレイ
document.getElementById('replayDraw-start').addEventListener('click', () => {
    replayController.startReplay();
});

// リプレイ停止
document.getElementById('replayDraw-stop').addEventListener('click', () => {
    replayController.stopReplay();
});

// 採点
document.getElementById('calculate-similarity').addEventListener('click', () => {
    // 一致と判定するモデルの色
    const targetColor = { r: 74, g: 74, b: 74 };
    // 許容範囲
    const tolerance = 100;
    scoringSystem.computeSimilarity(targetColor, tolerance);
});




