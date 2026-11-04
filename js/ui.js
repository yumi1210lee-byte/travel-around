// 共用的小介面工具：提示訊息、複製到剪貼簿

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

/** 複製文字；label 用在提示訊息（例如「連結」），沒給就直接顯示內容 */
export async function copyText(text, label) {
  const done = label ? `已複製${label}` : `已複製 ${text}`;
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand?.('copy');
    ta.remove();
    toast(ok ? done : '無法複製，請長按文字手動複製');
    return Boolean(ok);
  }
}
