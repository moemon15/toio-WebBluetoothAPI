'use strict';

class BluetoothController {
    static TOIO_SERVICE_UUID = "10b20100-5b3b-4571-9508-cf3efcd7bbae";

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

            //デバイスの追加
            this.devices.set(device.id, {
                device: device,
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

//インスタンス
const bluetoothController = new BluetoothController();

/* イベントリスナー */
//toio接続
document.getElementById('connectButton').addEventListener('click', () => bluetoothController.connect());