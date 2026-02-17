import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
// 确保 logger 初始化（会在控制台显示启动信息）
import './lib/logger';
// 初始化 i18n
import './i18n';

console.log(
  '%c🦞 OpenClaw Manager  启动',
  'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-size: 16px; padding: 8px 16px; border-radius: 4px; font-weight: bold;'
);
console.log(
  '%c提示: 打开开发者工具 (Cmd+Option+I / Ctrl+Shift+I) 可以查看详细日志',
  'color: #888; font-size: 12px;'
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
