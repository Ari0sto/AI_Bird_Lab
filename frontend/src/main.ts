import Chart from 'chart.js/auto';
import { fetchHistory, fetchStats, recognize, removeHistory, login, register, logout, exportCsv } from './api';
import type { Analysis, HistoryItem, Statistics } from './api';
import './styles.css';

function get<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Отсутствует элемент интерфейса: ${selector}`);
  return found;
}

function element(tag: string, className = '', content = ''): HTMLElement {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (content) result.textContent = content;
  return result;
}

function percent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function status(id: string, message: string, error = false): void {
  const node = get<HTMLElement>(id);
  node.textContent = message;
  node.classList.toggle('error', error);
}

// --- Authentication ---
let registrationMode = false;

const authScreen = get<HTMLElement>('#auth-screen');
const appLayout = get<HTMLElement>('#app-layout');

const authForm = get<HTMLFormElement>('#auth-form');
const authEmail = get<HTMLInputElement>('#auth-email');
const authPassword = get<HTMLInputElement>('#auth-password');

const authTitle = get<HTMLElement>('#auth-title');
const authSubmit = get<HTMLButtonElement>('#auth-submit');
const authSwitch = get<HTMLButtonElement>('#auth-switch');

// Switch between login and registration
authSwitch.addEventListener('click', () => {
  registrationMode = !registrationMode;

  authTitle.textContent = registrationMode
    ? 'Регистрация'
    : 'Вход в систему';

  authSubmit.textContent = registrationMode
    ? 'Зарегистрироваться'
    : 'Войти';

  authSwitch.textContent = registrationMode
    ? 'Уже есть аккаунт? Войти'
    : 'Нет аккаунта? Зарегистрироваться';

  authPassword.autocomplete = registrationMode
    ? 'new-password'
    : 'current-password';

  status('#auth-status', '');
});

// Login and registration
authForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = authEmail.value.trim();
  const password = authPassword.value;

  authSubmit.disabled = true;

  status('#auth-status', 'Подождите...');

  try {
    if (registrationMode) {
      await register(email, password);
    }

    await login(email, password);

    authScreen.hidden = true;
    appLayout.hidden = false;

    status('#auth-status', '');
    authPassword.value = '';

  } catch (error) {
    status(
      '#auth-status',
      error instanceof Error ? error.message : 'Ошибка авторизации.',
      true
    );
  } finally {
    authSubmit.disabled = false;
  }
});

// Logout
get<HTMLButtonElement>('#logout-button')
  .addEventListener('click', () => {
    logout();
    window.location.reload();
  });

// --- Navigation ---
document.querySelectorAll<HTMLButtonElement>('.nav-button').forEach(button => {
  button.addEventListener('click', () => {
    const destination = button.dataset.tab;
    if (!destination) return;
    
    document.querySelectorAll('.nav-button').forEach(b =>
      b.classList.toggle('active', b === button));
      
    document.querySelectorAll('.page').forEach(p =>
      p.classList.toggle('active', p.id === destination));
      
    if (destination === 'history') void loadHistory();
    if (destination === 'stats') void loadStatistics();
  });
});

function addFact(host: HTMLElement, title: string, value: string): void {
  const wrapper = element('div', 'fact');
  wrapper.append(element('span', '', title), element('strong', '', value));
  host.append(wrapper);
}

// --- Analysis ---
function renderAnalysis(mode: 'image' | 'audio', result: Analysis): void {
  const host = get<HTMLElement>(`#${mode}-results`);
  host.replaceChildren();
  
  const best = result.predictions[0];
  
  if (!best) {
    host.append(
      element('p', 'empty', 'Модель не вернула результатов распознавания.')
    );
    return;
  }

  host.append(element('div', 'eyebrow', 'ОПРЕДЕЛЁННЫЙ ВИД'),
              element('h3', 'species-title', best.species));
              
  const badge = element('span', 'confidence-label', `${percent(best.confidence)} confidence`);
  host.append(badge);

  const top = element('div', 'predictions');
  top.append(element('h4', '', 'Топ-3 вариантов'));
  
  for (const prediction of result.predictions) {
    const entry = element('div', 'prediction');
    const header = element('div', 'prediction-heading');
    header.append(element('span', '', prediction.species),
                  element('strong', '', percent(prediction.confidence)));
                  
    const track = element('div', 'bar-track');
    const fill = element('div', 'bar-fill');
    fill.style.width = `${Math.max(0, Math.min(100, prediction.confidence * 100))}%`;
    
    track.append(fill);
    entry.append(header, track);
    top.append(entry);
  }
  host.append(top);

  const facts = element('div', 'fact-grid');
  addFact(facts, 'Научное название', result.info.scientific_name);
  addFact(facts, 'Семейство', result.info.family);
  addFact(facts, 'Ареал / эндемичность', result.info.range);
  addFact(facts, 'Основной корм', result.info.diet);
  host.append(facts);
  
  host.append(element('h4', 'section-label', 'Краткое описание'),
              element('p', 'description', result.info.description));

  if (result.info.wikipedia_url || result.info.wikidata_url) {
    const links = element('div', 'source-links');
    for (const [label, url] of [
      ['Wikipedia', result.info.wikipedia_url],
      ['Wikidata', result.info.wikidata_url],
    ] as const) {
      if (!url) continue;
      const link = document.createElement('a');
      link.href = url;
      link.textContent = `${label} ↗`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      links.append(link);
    }
    host.append(links);
  }
  
  host.append(element('p', 'model-notice', result.notice));
}

function setupUploader(mode: 'image' | 'audio'): void {
  const input = get<HTMLInputElement>(`#${mode}-file`);
  const button = get<HTMLButtonElement>(`#${mode}-run`);
  const preview = get<HTMLElement>(`#${mode}-preview`);
  let blobUrl: string | null = null;

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    
    preview.replaceChildren();
    get<HTMLElement>(`#${mode}-results`).replaceChildren(
      element('p', 'empty', 'Запустите распознавание выбранного файла.')
    );
    button.disabled = !file;
    status(`#${mode}-status`, '');
    
    if (!file) return;
    
    preview.append(element('p', 'filename', file.name));
    blobUrl = URL.createObjectURL(file);
    
    if (mode === 'image') {
      const image = document.createElement('img');
      image.src = blobUrl;
      image.alt = 'Предпросмотр фотографии';
      preview.append(image);
    } else {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = blobUrl;
      preview.append(audio);
    }
  });

  button.addEventListener('click', async () => {
    const file = input.files?.[0];
    if (!file) return;
    
    button.disabled = true;
    status(`#${mode}-status`, 'Анализ выполняется. При первом запуске скачиваются веса моделей…');
    
    try {
      const result = await recognize(file, mode);
      renderAnalysis(mode, result);
      status(`#${mode}-status`, `Анализ завершён. Запись №${result.id} сохранена.`);
    } catch (error) {
      status(`#${mode}-status`, error instanceof Error ? error.message : 'Неизвестная ошибка.', true);
    } finally {
      button.disabled = false;
    }
  });
}

setupUploader('image');
setupUploader('audio');

// --- History ---
function tableCell(text: string): HTMLTableCellElement {
  const node = document.createElement('td');
  node.textContent = text;
  return node;
}

let searchVersion = 0;
async function loadHistory(): Promise<void> {
  const version = ++searchVersion;
  const search = get<HTMLInputElement>('#history-search').value;
  const body = get<HTMLTableSectionElement>('#history-body');
  status('#history-status', 'Загрузка записей…');
  
  try {
    const items: HistoryItem[] = await fetchHistory(search);
    if (version !== searchVersion) return;
    
    body.replaceChildren();
    for (const item of items) {
      const row = document.createElement('tr');
      row.append(tableCell(String(item.id)),
                 tableCell(item.image_name),
                 tableCell(item.predicted_species),
                 tableCell(percent(item.confidence)),
                 tableCell(new Date(item.analysis_date).toLocaleString('ru-RU')));
                 
      const actions = document.createElement('td');
      const remove = element('button', 'danger', 'Удалить') as HTMLButtonElement;
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Удалить запись №${item.id}?`)) return;
        remove.disabled = true;
        try {
          await removeHistory(item.id);
          await loadHistory();
        } catch (error) {
          status('#history-status', error instanceof Error ? error.message : 'Ошибка удаления.', true);
          remove.disabled = false;
        }
      });
      
      actions.append(remove);
      row.append(actions);
      body.append(row);
    }
    status('#history-status', items.length ? `Найдено записей: ${items.length}` : 'Записи не найдены.');
  } catch (error) {
    if (version === searchVersion)
      status('#history-status', error instanceof Error ? error.message : 'Ошибка истории.', true);
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
get<HTMLInputElement>('#history-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { void loadHistory(); }, 300);
});

// Export CSV
get<HTMLButtonElement>('#export-button')
  .addEventListener('click', async () => {
    const button = get<HTMLButtonElement>('#export-button');
    button.disabled = true;

    try {
      const blob = await exportCsv();
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'bird_analysis.csv';

      document.body.append(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status('#history-status', 'CSV успешно экспортирован.');
    } catch (error) {
      status(
        '#history-status',
        error instanceof Error ? error.message : 'Ошибка экспорта.',
        true
      );
    } finally {
      button.disabled = false;
    }
  });

// --- Statistics ---
let chart: Chart<'bar'> | null = null;
function renderStatistics(data: Statistics): void {
  get<HTMLElement>('#stat-total').textContent = String(data.total);
  get<HTMLElement>('#stat-max').textContent = percent(data.max_confidence);
  get<HTMLElement>('#stat-min').textContent = percent(data.min_confidence);
  
  chart?.destroy();
  chart = null;
  
  if (!data.frequent_species.length) {
    status('#stats-status', 'Статистики пока нет. Выполните хотя бы один анализ.');
    return;
  }
  
  status('#stats-status', 'Показаны десять наиболее частых видов.');
  
  const canvas = get<HTMLCanvasElement>('#species-chart');
  chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.frequent_species.map(s => s.species),
      datasets: [{ label: 'Количество распознаваний',
                   data: data.frequent_species.map(s => s.count),
                   backgroundColor: '#47c69b', borderRadius: 5 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } },
                y: { ticks: { autoSkip: false } } },
    },
  });
}

async function loadStatistics(): Promise<void> {
  try {
    renderStatistics(await fetchStats());
  } catch (error) {
    status('#stats-status', error instanceof Error ? error.message : 'Ошибка статистики.', true);
  }
}