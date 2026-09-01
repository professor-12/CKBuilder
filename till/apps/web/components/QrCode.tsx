"use client";

import qrcodegen from "qrcode-generator";
import { useMemo } from "react";

/**
 * QR rendering as inline SVG. Byte mode is required: base64url payloads are
 * mixed-case and the denser alphanumeric mode is uppercase-only. A payload
 * too long to encode reports itself rather than failing silently.
 */
export function QrCode({ text, label }: { text: string; label: string }) {
  const svg = useMemo(() => {
    try {
      const qr = qrcodegen(0, "M");
      qr.addData(text, "Byte");
      qr.make();
      const n = qr.getModuleCount();
      const quiet = 3;
      const size = n + quiet * 2;
      let path = "";
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (qr.isDark(y, x)) {
            path += `M${x + quiet},${y + quiet}h1v1h-1z`;
          }
        }
      }
      return { size, path };
    } catch {
      return undefined;
    }
  }, [text]);

  if (!svg) {
    return (
      <p className="banner error">
        This invoice is too large for a QR code — share it as a link instead.
      </p>
    );
  }
  return (
    <div className="qr-wrap">
      <svg
        viewBox={`0 0 ${svg.size} ${svg.size}`}
        role="img"
        aria-label={label}
        shapeRendering="crispEdges"
      >
        <rect width={svg.size} height={svg.size} fill="#ffffff" />
        <path d={svg.path} fill="#1a1714" />
      </svg>
    </div>
  );
}
