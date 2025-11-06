/* global React */

/* Система обработки и отображения ошибок приложения */
(function () {
  const box = document.getElementById('errorBox');
  const show = (msg) => {
    if (!box) return;
    box.textContent = 'Ошибка:\n' + msg;
    box.classList.add('show');
  };
  
  // Глобальные обработчики ошибок JavaScript
  window.addEventListener('error', (e) => show(e.message || String(e)));
  window.addEventListener('unhandledrejection', (e) =>
    show((e.reason && e.reason.message) || String(e.reason))
  );
})();

/** Утилиты форматирования цены в русскую локализацию */
const fmt = new Intl.NumberFormat('ru-RU');
export const priceStr = (v) => fmt.format(Number(v||0));

/** Утилиты нормализации текста для поиска */
export const norm = (s) => String(s ?? '').trim().toLowerCase(); // Приведение к нижнему регистру и обрезка пробелов

/** Проверка, содержит ли строка только ASCII-символы */
export const isAscii = (s) => /^[\x00-\x7F]*$/.test(String(s ?? ''));

/** Транслитерация латинских символов в кириллицу для расширенного поиска */
export const latinToCyrillic = (s) =>
  String(s ?? '').replace(/[A-Za-z]/g, (c) => ({
    A: 'А', a: 'а', B: 'В', E: 'Е', e: 'е', K: 'К', k: 'к',
    M: 'М', H: 'Н', O: 'О', o: 'о', P: 'Р', p: 'р',
    C: 'С', c: 'с', T: 'Т', t: 'т', Y: 'У', y: 'у', X: 'Х', x: 'х'
  })[c] || c);

/** Экранирование специальных символов для использования в RegExp */
export const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Нормализация пути к иконке: добавление расширения, обработка относительных путей */
export function resolveIconPath(p){
  if(!p) return '';
  
  // Нормализация разделителей путей и удаление лишних точек
  let s = String(p).trim().replace(/\\/g,'/').replace(/^\.\/+/, '');
  const m = /^([^?#]+)([?#].*)?$/.exec(s); 
  let base = (m && m[1])||s; 
  const tail = (m && m[2])||'';
  
  const hasExt = /\.[a-zA-Z0-9]{2,5}$/.test(base); 
  const isHttp = /^https?:\/\//i.test(base);

  // Добавление расширения .png по умолчанию если отсутствует
  if(isHttp){ 
    if(!hasExt) base += '.png'; 
    return base + tail; 
  }
  
  if(base.startsWith('/')){ 
    if(!hasExt) base += '.png'; 
    return base + tail; 
  }

  // Для локальных путей - добавление папки icons по умолчанию
  if(!base.includes('/')) base = 'icons/' + base;
  if(!hasExt) base += '.png';
  return './' + base + tail;
}

/** Генерация списка кандидатов путей для загрузки иконок (fallback при 404) */
export function getIconCandidates(p){
  const first = resolveIconPath(p);
  const out = []; 
  const seen = new Set(); 
  const add = x => { if(x && !seen.has(x)){ seen.add(x); out.push(x); } };

  const sp = /^([^?#]+)([?#].*)?$/.exec(first)||[]; 
  const head = sp[1]||first; 
  const tail = sp[2]||'';
  add(head + tail);

  // Генерация кандидатов с разными расширениями изображений
  const extm = /\.[a-zA-Z0-9]{2,5}$/.exec(head); 
  const exts=['.png','.webp','.jpg','.jpeg']; // Приоритет расширений
  
  if(extm){ 
    const stem = head.slice(0,-extm[0].length); 
    for(const e of exts) add(stem+e+tail); 
  }
  else{ 
    for(const e of exts) add(head+e+tail); 
  }

  // Дополнительные кандидаты в папке icons
  const local = head.replace(/^\.\/+/,'');
  if(!/^https?:\/\//i.test(local)){
    const just = local.includes('/') ? local.split('/').pop() : local;
    const stem = just.replace(/\.[a-zA-Z0-9]{2,5}$/,'');
    for(const e of exts) add(`./icons/${stem}${e}${tail}`);
  }
  return out;
}

/** React Hook для дебаунса значений с задержкой */
export function useDebounced(value, delay=200){
  const {useEffect,useState} = React;
  const [v,setV] = useState(value);
  useEffect(()=>{ 
    const t = setTimeout(()=>setV(value), delay); 
    return ()=>clearTimeout(t); 
  }, [value,delay]);
  return v;
}