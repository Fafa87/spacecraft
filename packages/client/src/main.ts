import './ui/styles.css';
import { App } from './app/App.js';
import { initDeviceDetection } from './input/device.js';
import { initOrientation } from './input/orientation.js';
import { initIosInstallHint } from './ui/iosInstallHint.js';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
initDeviceDetection();
initOrientation();
const app = new App(canvas, ui);
void app.boot();
initIosInstallHint();
