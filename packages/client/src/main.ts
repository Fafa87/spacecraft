import './ui/styles.css';
import { App } from './app/App.js';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const app = new App(canvas, ui);
void app.boot();
