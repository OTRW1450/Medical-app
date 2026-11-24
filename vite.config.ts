import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// In production builds, lock the app down with a Content-Security-Policy that
// forbids any network connection. Patient data can never leave the device.
const csp: Plugin = {
  name: 'offline-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "frame-src blob:",
      "object-src blob:",
      "connect-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
    ].join('; ');
    return html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    );
  },
};

export default defineConfig({
  base: './',
  plugins: [react(), csp],
});
