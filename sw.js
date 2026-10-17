// 错题回顾 Service Worker —— 处理推送通知与图标角标
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }

  const count = (typeof data.badge === 'number') ? data.badge : null;
  const title = data.title || '📝 错题回顾';
  const body = data.body || '该复习啦！';
  const url = data.url || './';

  event.waitUntil((async () => {
    // 更新 app 图标角标（iOS 16.4+ / 桌面 Chrome / Android）
    if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
      try {
        if (count === null || count <= 0) {
          await navigator.clearAppBadge();
        } else {
          await navigator.setAppBadge(count);
        }
      } catch (e) { /* 忽略角标失败 */ }
    }

    return self.registration.showNotification(title, {
      body: body,
      icon: 'icon.png',
      badge: 'icon.png',
      tag: 'mistake-review-reminder',
      renotify: true,
      data: { url: url }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if ('focus' in client) {
        await client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
