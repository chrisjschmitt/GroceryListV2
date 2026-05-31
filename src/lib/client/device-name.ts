const STORAGE_KEY = "grocerylist-device-name";

function detectDeviceName(): string {
  if (typeof navigator === "undefined") return "Unknown";

  const ua = navigator.userAgent;

  let device = "Desktop";
  if (/iPhone/i.test(ua)) device = "iPhone";
  else if (/iPad/i.test(ua)) device = "iPad";
  else if (/Android/i.test(ua)) device = "Android";
  else if (/Macintosh/i.test(ua)) device = "Mac";
  else if (/Windows/i.test(ua)) device = "Windows";
  else if (/Linux/i.test(ua)) device = "Linux";

  let browser = "";
  if (/CriOS|Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Edg/i.test(ua)) browser = "Edge";

  return browser ? `${device} ${browser}` : device;
}

export function getDeviceName(): string {
  if (typeof window === "undefined") return "Server";

  let name = localStorage.getItem(STORAGE_KEY);
  if (!name) {
    name = detectDeviceName();
    localStorage.setItem(STORAGE_KEY, name);
  }
  return name;
}

export function setDeviceName(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, name);
}
