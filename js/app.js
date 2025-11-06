/* global React, ReactDOM */
import {
  priceStr, norm, isAscii, latinToCyrillic,
  escapeRegExp, resolveIconPath, useDebounced, getIconCandidates
} from './utils.js';

(function () {
  const { useEffect, useMemo, useState, useCallback, useRef } = React;
  const DATA_URL = './data/data.json'; // URL для загрузки данных каталога

  /* Компонент подсветки совпадений в результатах поиска */
  function Highlight({ text, query }) {
    const src = String(text ?? '');
    if (!query) return React.createElement('span', null, src);
    
    // Нормализация запроса и транслитерация для расширенного поиска
    const qNorm = norm(query);
    const qCyr = isAscii(query) ? latinToCyrillic(query) : qNorm;
    
    // Разделение текста на части для подсветки совпадений
    const parts = src.split(new RegExp('(' + [qNorm, qCyr].filter(Boolean).map(escapeRegExp).join('|') + ')', 'gi'));
    
    return React.createElement(React.Fragment, null,
      parts.map((part, i) => i % 2
        ? React.createElement('mark', { key: i }, part) // Подсвеченная часть
        : React.createElement('span', { key: i }, part) // Обычный текст
      )
    );
  }

  /* Компонент строки таблицы товаров */
  const Row = React.memo(function Row({ r, indexLabel, isSelected, onSelect, onAdd, qDeb }) {
    // Получение кандидатов путей для иконок (fallback при 404)
    const candidates = getIconCandidates(r.icon_local_path);
    
    // Обработчик ошибок загрузки иконки - перебор кандидатов
    const onErr = (e)=>{
      const el = e.currentTarget;
      let i = Number(el.dataset.fidx || 0);
      if(i < candidates.length-1){ 
        i+=1; 
        el.dataset.fidx=String(i); 
        el.src=candidates[i]; // Пробуем следующий кандидат
      }
      else{ 
        el.classList.add('error'); 
        el.removeAttribute('src'); // Все кандидаты исчерпаны
      }
    };
    
    return React.createElement('tr', {
      'data-row-id': r.item_id || r._i,
      className: 'table-row' + (isSelected ? ' is-selected' : ''),
      onClick: onSelect
    },

      // Колонка с иконкой товара
      React.createElement('td', { className: 'cell icon-cell hide-xs' },
        candidates.length
          ? React.createElement('img', {
              src: candidates[0], alt: '', className: 'avatar',
              width: 36, height: 36, decoding: 'async', loading: 'lazy', fetchpriority: 'low',
              'data-fidx':'0', onError:onErr
            })
          : React.createElement('div', { className: 'avatar placeholder' })
      ),
      
      // Колонка с названием товара и подсветкой поиска
      React.createElement('td', { className: 'cell name-cell' },
        React.createElement('span', { className: 'clamp-2 table-text', title: r.item_name },
          React.createElement(Highlight, { text: r.item_name, query: qDeb })
        )
      ),
      
      // Колонка с ценой
      React.createElement('td', { className: 'cell num-cell' }, priceStr(r.price)),
      
      // Колонка с кнопкой добавления в корзину
      React.createElement('td', { className: 'cell num-cell right' },
        React.createElement('button', {
          className: 'icon-btn icon-btn--xs pressable ripple',
          onClick: (e) => { e.stopPropagation(); onAdd(); }, title: 'Добавить'
        }, '+')
      )
    );
  });

  /* Главный компонент приложения */
  function App() {
    // Состояния приложения
    const [data, setData] = useState([]); // Основные данные каталога
    const [query, setQuery] = useState(''); // Строка поиска
    const [selected, setSelected] = useState(null); // Выбранный товар
    const [cart, setCart] = useState(() => {
      // Восстановление корзины из localStorage
      try { return JSON.parse(localStorage.getItem('cart') || '{}'); }
      catch { return {}; }
    });
    const [loading, setLoading] = useState(false); // Статус загрузки
    const [error, setError] = useState(''); // Сообщения об ошибках
    const [limit, setLimit] = useState(window.innerWidth < 768 ? 25 : 50); // Лимит отображаемых товаров
    
    const qDeb = useDebounced(query, 200); // Дебаунс поискового запроса

    /* Загрузка данных каталога с сервера */
    const loadData = useCallback(async () => {
      try {
        setLoading(true);
        const resp = await fetch(DATA_URL, { cache: 'no-store' }); // Без кэширования
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const json = await resp.json();
        if (!Array.isArray(json)) throw new Error('Некорректный формат JSON');

        // Удаление дубликатов и обработка путей к иконкам
        const seen = new Set(); 
        const unique = [];
        for (let i = 0; i < json.length; i++) {
          const x = json[i]; 
          const id = x.item_id || x.item_name || i;
          if (!seen.has(id)) {
            seen.add(id);
            unique.push({ 
              ...x, 
              _i: i, // Внутренний индекс как fallback ID
              icon_local_path: resolveIconPath(x.icon_local_path) // Нормализация пути к иконке
            });
          }
        }
        setData(unique); 
        setError('');
      } catch (err) {
        setError('Ошибка загрузки данных: ' + (err?.message || String(err)));
      } finally {
        setLoading(false);
      }
    }, []);
    
    // Загрузка данных при монтировании компонента
    useEffect(() => { loadData(); }, [loadData]);

    /* Фильтрация данных по поисковому запросу */
    const filtered = useMemo(() => {
      const q = norm(qDeb); 
      if (!q) return data; // Если запрос пустой - возвращаем все данные
      
      // Поиск по нормализованному названию и кириллической транслитерации
      return data.filter(x => 
        norm(x.item_name).includes(q) || 
        norm(latinToCyrillic(x.item_name)).includes(q)
      );
    }, [data, qDeb]);

    const visible = filtered.slice(0, limit); // Видимые товары с учетом лимита
    const cartItems = Object.values(cart); // Товары в корзине
    const total = cartItems.reduce((s, i) => s + (Number(i.price)||0) * (Number(i.qty)||0), 0); // Общая сумма

    /* Добавление товара в корзину */
    const addToCart = useCallback((item, qty = 1) => {
      setCart(c => {
        const id = item.item_id || item._i;
        const n = { ...c };
        n[id] = n[id] 
          ? { ...n[id], qty: (n[id].qty || 0) + qty } // Увеличиваем количество
          : { ...item, qty }; // Добавляем новый товар
        return n;
      });
      
      // Анимация "вспышки" корзины при добавлении
      try {
        const el = document.querySelector('.calc');
        if (el) { 
          el.classList.remove('flash'); 
          void el.offsetWidth; // Принудительный reflow
          el.classList.add('flash'); 
          setTimeout(()=>el.classList.remove('flash'), 350); 
        }
      } catch {}
    }, []);

    const clearCart = useCallback(() => setCart({}), []); // Очистка корзины
    
    // Сохранение корзины в localStorage при изменении
    useEffect(() => { 
      try { 
        localStorage.setItem('cart', JSON.stringify(cart)); 
      } catch {} 
    }, [cart]);

    /* Автопрокрутка к выбранному элементу таблицы */
    const tableRef = useRef(null);
    const selectedIndex = filtered.findIndex(x => 
      (x.item_id || x._i) === (selected?.item_id || selected?._i)
    );
    
    useEffect(() => {
      if (selectedIndex < 0 || !tableRef.current) return;
      const id = (filtered[selectedIndex].item_id || filtered[selectedIndex]._i);
      const row = tableRef.current.querySelector('[data-row-id="' + id + '"]');
      if (row) row.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex, filtered]);


    /* Шапка */
    const header = React.createElement('header', { className: 'layout-header' },
      React.createElement('h1', null, 'SO-Wiki: ЗОНА'),
      React.createElement('button', { className: 'btn btn--outline pressable ripple', onClick: loadData, disabled: loading }, loading ? 'Загрузка…' : 'Обновить')
    );

    /* Поиск */
    const search = React.createElement('div', { className: 'search-bar' },
      React.createElement('input', { className: 'input input--terminal', type: 'text', placeholder: 'Поиск по названию…', value: query, onChange: (e) => setQuery(e.target.value) })
    );

    /* Таблица */
    const table = React.createElement('div', { className: 'table-wrap grid-left' },
      React.createElement('table', { className: 'table table--hover table--catalog elevate', ref: tableRef, 'data-empty': (!loading && visible.length === 0) ? '1' : '0' },
        React.createElement('thead', null, React.createElement('tr', null,
          React.createElement('th', { className: 'col-icon hide-xs' }, 'Иконка'),
          React.createElement('th', { className: 'col-name' }, 'Название'),
          React.createElement('th', { className: 'col-price num-cell' }, 'Цена'),
          React.createElement('th', { className: 'col-action num-cell' }, 'Добавить'),

        )),
        React.createElement('tbody', null,
          loading
            ? React.createElement('tr', null, React.createElement('td', { colSpan: 5, className: 'cell center muted' }, 'Загрузка…'))
            : (visible.length === 0
              ? React.createElement('tr', null, React.createElement('td', { colSpan: 5, className: 'cell center muted' }, 'Нет результатов.'))
              : visible.map((r, i) => {
                  const isSel = selected && (r.item_id || r._i) === (selected.item_id || selected._i);
                  return React.createElement(Row, { key: r.item_id || r._i, r, indexLabel: String(i + 1), isSelected: isSel, onSelect: () => setSelected(r), onAdd: () => addToCart(r, 1), qDeb });
                })
            )
        )
      ),
      (filtered.length > limit) && React.createElement('div', { className: 'show-more' },
        React.createElement('button', {
          className: 'btn btn--outline pressable ripple',
          onClick: () => setLimit(l => l + (window.innerWidth < 768 ? 25 : 50))
        }, 'Показать ещё ', String(window.innerWidth < 768 ? 25 : 50), ' (осталось ', String(Math.max(0, filtered.length - limit - (window.innerWidth < 768 ? 25 : 50))), ')')
      )
    );

    /* Правая панель: карточка + калькулятор */
    const selectionCard = React.createElement('div', { className: 'panel-box selection-card fade-in' },
      selected
        ? React.createElement('div', { className: 'selection', style:{display:'flex',gap:'.75rem',alignItems:'center'} },
            (() => {
              const cs = getIconCandidates(selected.icon_local_path);
              const onErr = (e) => {
                const el = e.currentTarget; let i = Number(el.dataset.fidx || 0);
                if (i < cs.length - 1) { i += 1; el.dataset.fidx = String(i); el.src = cs[i]; }
                else { el.classList.add('error'); el.removeAttribute('src'); }
              };
              return cs.length
                ? React.createElement('img', { src: cs[0], alt: '', className: 'avatar-lg', width:48, height:48, decoding:'async', loading:'lazy', fetchpriority:'low', 'data-fidx':'0', onError:onErr })
                : React.createElement('div', { className: 'avatar-lg placeholder' });
            })(),
            React.createElement('div', { className: 'selection-info', style:{display:'grid',gap:'.35rem',alignContent:'start'} },
              React.createElement('div', { className: 'selection-title clamp-2', title: selected.item_name }, selected.item_name || 'Без названия'),
              React.createElement('div', { className: 'selection-meta muted' }, 'ID: ', selected.item_id || '—'),
              selected.Url && React.createElement('div', null,
                React.createElement('a', { className: 'btn btn--outline btn--sm ripple', href: selected.Url, target: '_blank', rel: 'noreferrer noopener' }, 'Подробнее на SO-Wiki')
              )
            )
          )
        : React.createElement('div', { className: 'muted' }, 'Выберите позицию в таблице')
    );

    const calc = React.createElement('div', { className: 'calc calc--compact elevate' },
      React.createElement('div', { className: 'calc-head' },
        React.createElement('h3', null, 'Калькулятор'),
        React.createElement('div', { className: 'text-sm muted' }, String(cartItems.length), ' поз.')
      ),
      cartItems.length === 0
        ? React.createElement('p', { className: 'text-sm muted' }, 'Нажмите «+» в строке, чтобы добавить.')
        : cartItems.map(it =>
            React.createElement('div', { key: it.item_id || it._i, className: 'calc-row' },
              (() => {
                const cs = getIconCandidates(it.icon_local_path);
                const onErr = (e) => { const el = e.currentTarget; let i = Number(el.dataset.fidx || 0);
                  if (i < cs.length - 1) { i += 1; el.dataset.fidx = String(i); el.src = cs[i]; }
                  else { el.classList.add('error'); el.removeAttribute('src'); }
                };
                return cs.length
                  ? React.createElement('img', { src: cs[0], alt: '', className: 'calc-thumb', width:28, height:28, decoding:'async', loading:'lazy', fetchpriority:'low', 'data-fidx':'0', onError:onErr })
                  : React.createElement('div', { className: 'calc-thumb placeholder' });
              })(),
              React.createElement('div', { className: 'calc-main' },
                React.createElement('div', { className: 'calc-title clamp-2', title: it.item_name }, it.item_name),
                React.createElement('div', { className: 'calc-price muted' }, priceStr(it.price))
              ),
              React.createElement('div', { className: 'qty-group' },
                React.createElement('button', { className: 'qty-btn pressable ripple', title: 'Уменьшить',
                  onClick: () => setCart(c => ({ ...c, [it.item_id || it._i]: { ...it, qty: Math.max(1, (it.qty || 1) - 1) } })) }, '−'),
                React.createElement('input', { type: 'number', value: it.qty, min: 1,
                  onChange: (e) => setCart(c => ({ ...c, [it.item_id || it._i]: { ...it, qty: Math.max(1, +e.target.value || 1) } })) }),
                React.createElement('button', { className: 'qty-btn pressable ripple', title: 'Увеличить',
                  onClick: () => setCart(c => ({ ...c, [it.item_id || it._i]: { ...it, qty: (it.qty || 0) + 1 } })) }, '+')
              )
            )
          ),
      cartItems.length > 0 &&
        React.createElement('div', { className: 'calc-footer' },
          React.createElement('div', { className: 'total' }, 'Итого: ', priceStr(total)),
          React.createElement('button', { className: 'btn btn--outline pressable ripple', onClick: clearCart }, 'Очистить')
        )
    );

    const panel = React.createElement('aside', { className: 'side-panel grid-right' }, selectionCard, calc);

    return React.createElement('div', { className: 'app-container theme-stalker' },
      header, search,
      error && React.createElement('div', { className: 'alert show' }, error),
      React.createElement('section', { className: 'grid-main' }, table, panel)
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})();
