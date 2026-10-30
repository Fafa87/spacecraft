import QRCode from 'qrcode';

/** Renders a QR code for `text` into a canvas (client-side, no network). */
export async function renderQr(canvas: HTMLCanvasElement, text: string, size = 220): Promise<void> {
  await QRCode.toCanvas(canvas, text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#05080c', light: '#ffffff' },
  });
}
