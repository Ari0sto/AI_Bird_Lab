// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchHistory: vi.fn(), fetchStats: vi.fn(), recognize: vi.fn(), removeHistory: vi.fn(),
  login: vi.fn(), register: vi.fn(), logout: vi.fn(), exportCsv: vi.fn(),
  fetchQuota: vi.fn(), fetchWalletStatus: vi.fn(), fetchWalletConfig: vi.fn(),
  createWalletChallenge: vi.fn(), verifyWalletSignature: vi.fn(),
  requestWalletAddress: vi.fn(), signWalletMessage: vi.fn(), purchaseSubscription: vi.fn(),
  chartDestroy: vi.fn(), chartCreate: vi.fn(),
}));
vi.mock('../api', () => ({
  fetchHistory: mocks.fetchHistory, fetchStats: mocks.fetchStats, recognize: mocks.recognize,
  removeHistory: mocks.removeHistory, login: mocks.login, register: mocks.register,
  logout: mocks.logout, exportCsv: mocks.exportCsv, fetchQuota: mocks.fetchQuota,
  fetchWalletStatus: mocks.fetchWalletStatus, fetchWalletConfig: mocks.fetchWalletConfig,
  createWalletChallenge: mocks.createWalletChallenge, verifyWalletSignature: mocks.verifyWalletSignature,
}));
vi.mock('../subscription', () => ({
  requestWalletAddress: mocks.requestWalletAddress, signWalletMessage: mocks.signWalletMessage,
  purchaseSubscription: mocks.purchaseSubscription,
}));
vi.mock('chart.js/auto', () => ({
  default: class {
    constructor(...args: unknown[]) { mocks.chartCreate(...args); }
    destroy() { mocks.chartDestroy(); }
  },
}));

const IDs = [
  'auth-screen','app-layout','auth-form','auth-email','auth-password','auth-title',
  'auth-submit','auth-switch','auth-status','logout-button','wallet-connect',
  'subscription-buy','subscription-refresh','subscription-status','wallet-summary',
  'plan-summary','quota-summary','image-file','image-run','image-preview','image-results',
  'image-status','audio-file','audio-run','audio-preview','audio-results','audio-status',
  'history-search','history-status','export-button','stat-total',
  'stat-max','stat-min','species-chart','stats-status',
];
function fixture() {
  const tags: Record<string,string> = {
    'auth-form':'form','auth-email':'input','auth-password':'input','image-file':'input',
    'audio-file':'input','history-search':'input','species-chart':'canvas',
  };
  document.body.innerHTML = IDs.map(id => `<${tags[id] ?? 'div'} id="${id}"></${tags[id] ?? 'div'}>`).join('') +
    '<button class="nav-button" data-tab="history">History</button>' +
    '<button class="nav-button" data-tab="stats">Statistics</button>' +
    '<section class="page" id="history"><table><tbody id="history-body"></tbody></table></section><section class="page" id="stats"></section>';
  document.getElementById('app-layout')!.hidden = true;
  for (const kind of ['image','audio']) {
    const input = document.getElementById(`${kind}-file`) as HTMLInputElement;
    input.type = 'file';
  }
}
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
const btn = (id:string) => document.getElementById(id) as HTMLButtonElement;
const el = (id:string) => document.getElementById(id)!;
const quota = { subscriptionActive:false, freeLimit:5, usedAttempts:1, remainingAttempts:4 };
const unlinkedWallet = { linked:false, walletAddress:null, subscriptionActive:false };
const info = { scientific_name:'Corvus corax', family:'Corvidae', range:'Europe', diet:'Omnivore', description:'A raven', wikipedia_url:'https://en.wikipedia.org/wiki/Common_raven', wikidata_url:null };
const analysis = { id:9, predictions:[{species:'Common raven',confidence:0.9}], info, notice:'Model disclaimer' };

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  fixture();
  mocks.login.mockResolvedValue(undefined);
  mocks.register.mockResolvedValue(undefined);
  mocks.fetchQuota.mockResolvedValue(quota);
  mocks.fetchWalletStatus.mockResolvedValue(unlinkedWallet);
  mocks.fetchHistory.mockResolvedValue([]);
  mocks.fetchStats.mockResolvedValue({total:0,max_confidence:null,min_confidence:null,frequent_species:[]});
  mocks.recognize.mockResolvedValue(analysis);
  mocks.exportCsv.mockResolvedValue(new Blob(['data']));
  mocks.removeHistory.mockResolvedValue(undefined);
  mocks.requestWalletAddress.mockResolvedValue('0xabc');
  mocks.createWalletChallenge.mockResolvedValue({message:'Sign this',nonce:'nonce'});
  mocks.signWalletMessage.mockResolvedValue('0xsigned');
  mocks.verifyWalletSignature.mockResolvedValue(undefined);
  vi.stubGlobal('confirm', vi.fn(() => true));
  Object.defineProperty(URL, 'createObjectURL', { configurable:true, value:vi.fn(()=>'blob:test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable:true, value:vi.fn() });
  await import('../main');
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML=''; });

describe('Web interface / main.ts', () => {
  it('switches between login and registration', () => {
    btn('auth-switch').click();
    expect(el('auth-title').textContent).toBe('Регистрация');
    expect((el('auth-password') as HTMLInputElement).autocomplete).toBe('new-password');
    btn('auth-switch').click();
    expect(el('auth-title').textContent).toBe('Вход в систему');
  });
  it('submits login and renders quota and wallet status', async () => {
    (el('auth-email') as HTMLInputElement).value=' user@test.local ';
    (el('auth-password') as HTMLInputElement).value='pw';
    el('auth-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    await tick();
    expect(mocks.login).toHaveBeenCalledWith('user@test.local','pw');
    expect(el('app-layout').hidden).toBe(false);
    expect(el('quota-summary').textContent).toContain('Осталось 4 из 5');
    expect(el('wallet-summary').textContent).toBe('Кошелёк не привязан');
  });
  it('registers then logs in after toggling form mode', async () => {
    btn('auth-switch').click();
    (el('auth-email') as HTMLInputElement).value='new@test.local';
    (el('auth-password') as HTMLInputElement).value='secret';
    el('auth-form').dispatchEvent(new Event('submit',{cancelable:true}));
    await tick();
    expect(mocks.register).toHaveBeenCalledWith('new@test.local','secret');
    expect(mocks.login).toHaveBeenCalledWith('new@test.local','secret');
  });
  it('renders authentication failure and re-enables submit', async () => {
    mocks.login.mockRejectedValueOnce(new Error('Invalid credentials'));
    el('auth-form').dispatchEvent(new Event('submit',{cancelable:true}));
    await tick();
    expect(el('auth-status').textContent).toBe('Invalid credentials');
    expect(el('auth-status').classList.contains('error')).toBe(true);
    expect(btn('auth-submit').disabled).toBe(false);
  });
  it('shows an empty history after changing tab', async () => {
    (document.querySelector('[data-tab="history"]') as HTMLButtonElement).click();
    await tick();
    expect(mocks.fetchHistory).toHaveBeenCalledWith('');
    expect(el('history-status').textContent).toBe('Записи не найдены.');
  });
  it('renders a history row and removes it after confirmation', async () => {
    mocks.fetchHistory.mockResolvedValueOnce([{
      id:3,image_name:'bird.jpg',predicted_species:'Raven',confidence:0.88,
      analysis_date:'2026-11-10T10:00:00Z',
    }]).mockResolvedValueOnce([]);
    (document.querySelector('[data-tab="history"]') as HTMLButtonElement).click();
    await tick();
    expect(el('history-body').textContent).toContain('Raven');
    (el('history-body').querySelector('button') as HTMLButtonElement).click();
    await tick();
    expect(mocks.removeHistory).toHaveBeenCalledWith(3);
  });
  it('renders empty statistics', async () => {
    (document.querySelector('[data-tab="stats"]') as HTMLButtonElement).click();
    await tick();
    expect(el('stat-total').textContent).toBe('0');
    expect(el('stats-status').textContent).toContain('Статистики пока нет');
    expect(mocks.chartCreate).not.toHaveBeenCalled();
  });
  it('renders populated chart statistics', async () => {
    mocks.fetchStats.mockResolvedValueOnce({total:2,max_confidence:0.9,min_confidence:0.6,frequent_species:[{species:'Raven',count:2}]});
    (document.querySelector('[data-tab="stats"]') as HTMLButtonElement).click();
    await tick();
    expect(el('stat-total').textContent).toBe('2');
    expect(el('stat-max').textContent).toBe('90.0%');
    expect(mocks.chartCreate).toHaveBeenCalledOnce();
  });
  it('uploads an image and displays species and metadata', async () => {
    const input=el('image-file') as HTMLInputElement;
    const file=new File(['bird'],'bird.png',{type:'image/png'});
    Object.defineProperty(input,'files',{configurable:true,value:[file]});
    input.dispatchEvent(new Event('change'));
    expect(el('image-preview').textContent).toContain('bird.png');
    btn('image-run').click();
    await tick();
    expect(mocks.recognize).toHaveBeenCalledWith(file,'image');
    expect(el('image-results').textContent).toContain('Common raven');
    expect(el('image-results').textContent).toContain('Corvus corax');
    expect(el('image-status').textContent).toContain('Запись №9');
  });
  it('handles analysis errors and no predictions', async () => {
    const input=el('audio-file') as HTMLInputElement;
    const file=new File(['noise'],'bird.wav',{type:'audio/wav'});
    Object.defineProperty(input,'files',{configurable:true,value:[file]});
    input.dispatchEvent(new Event('change'));
    mocks.recognize.mockRejectedValueOnce(new Error('AI server unavailable'));
    btn('audio-run').click();
    await tick();
    expect(el('audio-status').textContent).toContain('AI server unavailable');
    expect(btn('audio-run').disabled).toBe(false);
    mocks.recognize.mockResolvedValueOnce({...analysis, predictions:[]});
    btn('audio-run').click();
    await tick();
    expect(el('audio-results').textContent).toContain('Модель не вернула результатов');
  });
  it('handles wallet connection and signing with mocked provider calls', async () => {
    el('app-layout').hidden=false;
    btn('wallet-connect').click();
    await tick();
    expect(mocks.requestWalletAddress).toHaveBeenCalledOnce();
    expect(mocks.createWalletChallenge).toHaveBeenCalledWith('0xabc');
    expect(mocks.signWalletMessage).toHaveBeenCalledWith('Sign this','0xabc');
    expect(mocks.verifyWalletSignature).toHaveBeenCalledWith('0xabc','nonce','0xsigned');
    expect(btn('wallet-connect').disabled).toBe(false);
  });
});
