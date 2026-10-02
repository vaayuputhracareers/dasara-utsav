import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrImage({ text, dark = '#000000', size = 512, className = 'qrimg', alt = 'QR code' }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { margin: 2, width: size, errorCorrectionLevel: 'M', color: { dark, light: '#ffffff' } })
      .then((u) => alive && setSrc(u)).catch(() => {});
    return () => { alive = false; };
  }, [text, dark, size]);
  return src ? <img className={className} src={src} alt={alt} /> : <div className={className} />;
}
export const qrDataUrl = (text, opts = {}) => QRCode.toDataURL(text, { margin: 2, width: 900, errorCorrectionLevel: 'M', ...opts });
