// Mở một trang bằng Chrome thật, ở khổ màn hình máy tính, rồi chụp lại.
//
// Nói thẳng với Chrome qua CDP — cái giao thức DevTools vẫn dùng — chứ không qua Puppeteer hay
// Playwright. Không phải vì chúng dở, mà vì cả repo này không phụ thuộc gói nào: `npm install`
// không chạy lần nào, không có lockfile để mà lệch, và cái image Docker là Node, Chromium và
// bốn file. Phần CDP cần cho việc chụp một trang vừa đúng chỗ ở dưới đây và đọc hết trong một
// lần ngồi — nhỏ hơn hẳn cái giá của một cây phụ thuộc phải trông cho khỏi cũ.
//
// Node 22 trở lên có sẵn `WebSocket`, nên cả phần nói chuyện cũng không cần gói nào.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { vetUrl } from './links.mjs';

/**
 * Khổ màn hình.
 *
 * 1280×800, và **không** phải chế độ điện thoại — đây là cả yêu cầu của con bot: người ta gửi
 * link trong nhóm rồi muốn thấy trang ấy *như trên máy tính*, chứ bản điện thoại thì điện thoại
 * của họ đã mở được rồi. Nhiều trang chọn bố cục theo chiều ngang và theo user agent, nên phải
 * đặt cả hai, không đặt mỗi cái.
 */
export const WIDTH = Number(process.env.SHOT_WIDTH ?? 1280);
export const HEIGHT = Number(process.env.SHOT_HEIGHT ?? 800);
export const UA = process.env.SHOT_UA
  ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/// Trần ảnh của nền tảng: 2 MB sau khi giải base64 (`BotImages.MaxBytes`). Cắt ở 1,9 MB để còn
/// chỗ cho sai số, vì vượt trần là `400 bot_image_size` — mất cả công mở trang.
export const MOST_BYTES = 1_900_000;

/**
 * Bao giờ thì chụp.
 *
 * **Không đợi `load`.** Đo thử trên chính Chrome: `example.com` nổ `load` sau 180ms, còn
 * `github.com` và `vnexpress.net` thì **không nổ trong 25 giây** — một request quảng cáo treo,
 * một cái font không về, và sự kiện ấy không bao giờ tới dù trang đã vẽ xong từ lâu. Bot đợi
 * `load` là bot trả lời sau 15 giây cho những trang người ta hay gửi nhất.
 *
 * Thứ đo được là **mạng có còn động đậy không**: mỗi request mở ra, xong, hoặc hỏng đều là một
 * sự kiện; hết `QUIET_MS` không có sự kiện nào thì trang đứng yên, chụp được. Một request treo
 * không sinh sự kiện, nên nó không giữ bot lại — đúng cái mà `load` không làm được.
 */
export const QUIET_MS = Number(process.env.SHOT_QUIET_MS ?? 700);
/// Đợi ít nhất chừng này kể cả khi mạng lặng ngay: lặng lúc 0ms là chưa bắt đầu, không phải xong.
export const LEAST_MS = Number(process.env.SHOT_LEAST_MS ?? 600);
/**
 * Vẽ xong chữ đầu tiên rồi thì chờ thêm nhiều nhất chừng này, dù mạng còn động.
 *
 * Có trang không bao giờ lặng: `github.com` gọi request đều đặn suốt, nên chỉ đo mạng thì bot
 * ngồi hết trần 15 giây. Tệ hơn cả chậm — chụp ở giây thứ 25 ra một trang **trắng**, vì đúng lúc
 * ấy trang đang thay nội dung; chụp ở giây thứ 8 thì đủ cả. Muộn hơn không phải là chắc hơn.
 *
 * Nên có hai đường về đích: mạng lặng, hoặc đã vẽ ra chữ và chờ thêm ngần này cho ảnh với font
 * kịp về. Cái nào tới trước thì chụp.
 */
export const PAINTED_MS = Number(process.env.SHOT_PAINTED_MS ?? 3000);
/**
 * Trang vẫn trống mà mạng đã lặng thì đợi tới đây rồi mới chịu chụp một trang trống.
 *
 * Mạng lặng **không** có nghĩa là trang xong, và sự kiện "đã vẽ" của Chrome cũng không. Đo
 * `kuku.vn/bot/doc` — một trang dựng bằng JS: ở giây thứ 1 mạng đã lặng 927ms mà trang có
 * **0 chữ**; chữ chỉ hiện ra ở giây thứ 1,5. Chrome vẫn báo đã vẽ, vì nó có vẽ — nó vẽ cái nền.
 * Tin vào hai tín hiệu ấy là gửi lên nhóm một tấm ảnh trắng và ghi vào log là đã chụp xong.
 *
 * Nên trước khi chụp thì **hỏi thẳng trang xem trên đó đã có gì chưa**. Trừ khi đã đợi ngần này:
 * có trang trống thật, và một file PDF hay một tấm ảnh thì không bao giờ có chữ nào cả.
 */
export const BLANK_MS = Number(process.env.SHOT_BLANK_MS ?? 5000);

/**
 * Hỏi trang xem **trong khung nhìn** có gì.
 *
 * Đếm chữ trong cả trang thì không đủ, và `github.com` là chỗ nó gãy: trang ấy có thanh điều
 * hướng ở trên cùng từ giây đầu, nên `innerText` khác 0 ngay lập tức trong khi cả phần thân còn
 * trắng. Đo mười lượt thì ba lượt bot chụp phải cái khoảng trắng ấy.
 *
 * Nên hỏi đúng thứ sẽ vào ảnh: chín điểm rải khắp khung nhìn, dưới mỗi điểm có gì không. `body`
 * với `html` không tính — đó là "không có gì" đội lốt một phần tử. Đây cũng là cách duy nhất
 * đếm được một trang chỉ có mỗi tấm ảnh, hay một file PDF nhúng, mà không phải kể tên từng loại.
 */
export const LOOK = `(() => {
  if (!document.body) return 0;
  const w = innerWidth, h = innerHeight;
  let hits = 0;
  for (const x of [0.2, 0.5, 0.8]) {
    for (const y of [0.2, 0.45, 0.7]) {
      const stack = document.elementsFromPoint(x * w, y * h) || [];
      if (stack.some((one) => one !== document.body && one !== document.documentElement)) hits += 1;
    }
  }
  return hits;
})()`;

/**
 * Phải thấy có gì đó mấy nhịp liền rồi mới chụp.
 *
 * Một lần là chưa đủ: trang dựng bằng JS thay cả phần thân trong một nhịp vẽ, và nhìn trúng đúng
 * lúc ấy thì thấy trắng — hoặc tệ hơn, thấy có rồi chụp ngay lúc nó vừa trống đi.
 */
export const SURE = 3;
/// Trần trên. Trang nào động đậy mãi mà cũng chẳng vẽ được gì thì tới đây chụp cái đang có. Một
/// ảnh trang vẽ gần hết vẫn là câu trả lời; không chụp gì thì không.
export const LOAD_MS = Number(process.env.SHOT_LOAD_MS ?? 15_000);
/// Mạng lặng rồi vẫn đợi thêm chừng này cho chữ nhảy vào chỗ sau khi font về, và cho mấy khung
/// dựng bằng JS kịp vẽ. Ngắn, vì phần chờ thật đã nằm ở `QUIET_MS` bên trên.
export const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS ?? 400);

/// Chụp cả trang dài thì cắt ở đây. Một bài báo dài 20.000px thành một cái ảnh không ai đọc nổi
/// trong khung chat, và gần như chắc chắn vượt 2 MB.
export const MOST_FULL_HEIGHT = 4000;

/// Những chỗ Chrome hay nằm, xếp theo thứ tự thử. `CHROME_PATH` đặt trước tất cả.
const PLACES = [
  process.env.CHROME_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

/**
 * Chrome ở sẵn một chỗ khác, thay vì bật một cái ở đây.
 *
 * `http://chrome:9222` (hỏi `/json/version` để lấy địa chỉ ws) hoặc thẳng `ws://…`. Đặt biến này
 * thì image của bot không cần chứa trình duyệt nào cả — và trình duyệt là **709 MiB** trong số
 * 828 MiB của image trước đó, tức là gần như toàn bộ. Máy dựng image hết chỗ chính vì con số ấy.
 */
export const CHROME_URL = process.env.CHROME_URL ?? null;

export function chromePath() {
  for (const place of PLACES) {
    if (place && existsSync(place)) return place;
  }
  return null;
}

/**
 * Một cuộc nói chuyện với Chrome.
 *
 * CDP là JSON hai chiều trên một WebSocket: mỗi lệnh mang một `id` và câu trả lời mang lại đúng
 * số ấy, còn sự kiện thì không có `id`. `sessionId` là cách một kết nối duy nhất điều khiển nhiều
 * tab — "flatten" — nên cả con bot chỉ mở một socket dù đang chụp mấy trang.
 */
function talk(socket) {
  const waiting = new Map();
  const listeners = new Map();
  let nextId = 1;
  let dead = null;

  socket.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.id && waiting.has(message.id)) {
      const { resolve, reject } = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message ?? 'CDP lỗi'} (${message.error.code ?? '?'})`));
      else resolve(message.result ?? {});
      return;
    }
    if (!message.method) return;
    for (const listener of listeners.get(message.method) ?? []) {
      try {
        listener(message.params ?? {}, message.sessionId);
      } catch (problem) {
        console.error(`nghe ${message.method}: ${problem}`);
      }
    }
  };

  const stop = (why) => {
    dead ??= new Error(why);
    for (const { reject } of waiting.values()) reject(dead);
    waiting.clear();
  };
  socket.onclose = () => stop('Chrome đã đóng kết nối');
  socket.onerror = () => stop('kết nối tới Chrome hỏng');

  return {
    send(method, params = {}, sessionId) {
      if (dead) return Promise.reject(dead);
      const id = nextId++;
      const body = { id, method, params };
      if (sessionId) body.sessionId = sessionId;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        try {
          socket.send(JSON.stringify(body));
        } catch (problem) {
          waiting.delete(id);
          reject(problem);
        }
      });
    },
    on(method, listener) {
      const list = listeners.get(method) ?? [];
      list.push(listener);
      listeners.set(method, list);
      return () => listeners.set(method, (listeners.get(method) ?? []).filter((one) => one !== listener));
    },
    close() {
      stop('đã đóng');
      try { socket.close(); } catch { /* đóng rồi thì thôi */ }
    },
  };
}

/// Cờ khởi động. Mỗi dòng là một thứ không cần cho việc chụp một trang, và mỗi thứ không cần là
/// một thứ có thể hỏng hoặc gọi ra ngoài.
function flags(dir, extra = []) {
  return [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${dir}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    `--user-agent=${UA}`,
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-sync',
    '--disable-default-apps',
    '--disable-background-networking',
    '--disable-client-side-phishing-detection',
    '--disable-popup-blocking',
    '--no-service-autorun',
    '--password-store=basic',
    '--use-mock-keychain',
    '--force-color-profile=srgb',
    '--disable-features=Translate,MediaRouter,OptimizationHints,BackForwardCache,AcceptCHFrame',
    '--lang=vi-VN',
    // Trong container Chrome không dựng được sandbox của nó nếu không có quyền; chỗ gọi bật cờ
    // này qua `CHROME_NO_SANDBOX`. Không bật mặc định: tắt sandbox trên máy thường là bỏ đi lớp
    // duy nhất đứng giữa một trang lạ và cái máy đang chạy bot.
    ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
    ...extra,
    'about:blank',
  ];
}

/**
 * Lấy một trình duyệt: nối vào cái có sẵn nếu được chỉ chỗ, không thì tự bật một cái.
 *
 * Chỗ gọi không cần biết là cái nào. Khác nhau đúng hai điều, và cả hai nằm gọn ở đây: cái tự
 * bật thì đóng là **giết**, cái nối vào thì đóng chỉ là cúp máy — nó không phải của mình; và cờ
 * khởi động chỉ đặt được cho cái tự bật, nên mọi thứ thật sự quan trọng (khổ màn hình, user
 * agent, thanh cuộn) đều đặt lại cho **từng trang** trong `shot`, không đặt bằng cờ.
 */
export async function open({ url = CHROME_URL, bin, args } = {}) {
  return url ? connect(url) : launch({ bin, args });
}

/**
 * Địa chỉ WebSocket của một Chrome ở sẵn.
 *
 * `ws://…` thì đã là nó rồi. `http://chrome:9222` thì phải hỏi `/json/version` — cổng gỡ lỗi cho
 * mỗi lần chạy một đường dẫn có chuỗi ngẫu nhiên, nên không đoán được và không viết cứng được.
 *
 * Tách ra khỏi `connect` để thử được mà không cần một Chrome thật đứng đó.
 */
export async function endpointFor(where, { ask = fetch } = {}) {
  const given = String(where ?? '').trim();
  if (!given) throw new Error('CHROME_URL rỗng');
  if (/^wss?:\/\//i.test(given)) return given;

  const answer = await ask(new URL('/json/version', given));
  if (!answer.ok) throw new Error(`${given} trả lời ${answer.status}`);
  const found = (await answer.json())?.webSocketDebuggerUrl;
  if (!found) throw new Error(`${given} không nói địa chỉ WebSocket`);
  return found;
}

/** Nối vào một Chrome đang chạy sẵn ở đâu đó. */
export async function connect(where) {
  const chrome = talk(await socketTo(await endpointFor(where)));
  // Không giết, chỉ cúp máy: Chrome ấy là của người khác, và có thể đang vẽ trang cho ai đó.
  return { chrome, close: () => chrome.close(), shot: (url, options) => shot(chrome, url, options) };
}

async function socketTo(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error(`không nối được vào Chrome ở ${endpoint}`));
  });
  return socket;
}

/**
 * Bật Chrome lên và giữ nó chạy.
 *
 * Một tiến trình cho cả đời con bot, nhưng **mỗi lần chụp một hồ sơ riêng** (`createBrowserContext`):
 * hai người lạ gửi hai link không được dùng chung cookie, localStorage hay cache. Bật lại Chrome
 * mỗi lần cũng cho như vậy nhưng tốn thêm nửa giây mỗi câu trả lời, mà nửa giây ấy nằm đúng chỗ
 * người ta đang chờ.
 */
export async function launch({ bin = chromePath(), args = [] } = {}) {
  if (!bin) throw new Error('Không tìm thấy Chrome. Cài chromium, hoặc đặt CHROME_PATH.');

  const dir = mkdtempSync(join(tmpdir(), 'bachhoa-chrome-'));
  const child = spawn(bin, flags(dir, args), { stdio: ['ignore', 'ignore', 'pipe'] });

  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    const giveUp = setTimeout(() => reject(new Error(`Chrome không nói gì sau 30 giây:\n${log.slice(-500)}`)), 30_000);
    child.stderr.on('data', (chunk) => {
      log += chunk;
      const found = log.match(/ws:\/\/\S+/);
      if (found) {
        clearTimeout(giveUp);
        resolve(found[0]);
      }
    });
    child.once('error', (problem) => { clearTimeout(giveUp); reject(problem); });
    child.once('exit', (code) => { clearTimeout(giveUp); reject(new Error(`Chrome tắt ngay, mã ${code}:\n${log.slice(-500)}`)); });
  });

  const chrome = talk(await socketTo(endpoint));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    chrome.close();
    try { child.kill('SIGTERM'); } catch { /* chết rồi thì thôi */ }
    setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* xong */ } }, 3000).unref?.();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* thư mục tạm, kệ */ }
  };
  child.once('exit', () => { closed = true; chrome.close(); });

  return { chrome, close, shot: (url, options) => shot(chrome, url, options) };
}

/**
 * Chụp một trang.
 *
 * Trả về `{ png, title, url, truncated }`, hoặc ném với một câu tiếng Việt nói vì sao không chụp
 * được. `png` là Buffer, đã vừa trần 2 MB của nền tảng.
 */
export async function shot(chrome, address, {
  width = WIDTH, height = HEIGHT, fullPage = false, loadMs = LOAD_MS, settleMs = SETTLE_MS,
  quietMs = QUIET_MS, leastMs = LEAST_MS, paintedMs = PAINTED_MS, blankMs = BLANK_MS,
  mostBytes = MOST_BYTES, vet = vetUrl,
} = {}) {
  const contextId = (await chrome.send('Target.createBrowserContext', { disposeOnDetach: false })).browserContextId;
  let targetId = null;
  const undo = [];

  try {
    targetId = (await chrome.send('Target.createTarget', {
      url: 'about:blank', browserContextId: contextId, width, height,
    })).targetId;
    const sessionId = (await chrome.send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
    const at = (method, params) => chrome.send(method, params, sessionId);

    /**
     * Cái cửa.
     *
     * Địa chỉ người ta gõ đã được xét trước khi tới đây — nhưng một trang công khai có thể
     * chuyển hướng về `127.0.0.1`, và một `<img src="http://192.168.1.1/admin">` thì không
     * chuyển hướng gì cả, nó chỉ vẽ trang quản trị của router vào đúng cái ảnh bot sắp gửi lên
     * nhóm. Nên xét **mọi request**, không phải mỗi request đầu: chuyển hướng cũng là một
     * request mới, và ảnh trong trang cũng vậy.
     *
     * Nhớ theo tên máy trong suốt một lần chụp, nên một trang trăm ảnh cùng CDN chỉ hỏi DNS một lần.
     */
    undo.push(chrome.on('Fetch.requestPaused', (params, from) => {
      if (from !== sessionId) return;
      const { requestId, request } = params;
      const deny = () => at('Fetch.failRequest', { requestId, errorReason: 'AccessDenied' }).catch(() => {});
      const allow = () => at('Fetch.continueRequest', { requestId }).catch(() => {});
      let key;
      try {
        const url = new URL(request.url);
        // `data:` và `blob:` không ra khỏi tiến trình, nên không có gì để chặn.
        if (url.protocol === 'data:' || url.protocol === 'blob:') return allow();
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return deny();
        key = `${url.protocol}//${url.host}`;
      } catch {
        return deny();
      }
      // Đã biết rồi thì trả lời **ngay trong lượt này**, không `await` gì cả. Đây là chỗ nóng
      // nhất trong cả file: một trang là hàng trăm request, và mỗi lần nhường lượt cho vòng lặp
      // sự kiện là một lần trang ấy đứng chờ. Đo được: để nó `await` một cách vô ích đẩy lượt
      // vẽ của `github.com` từ giây thứ 2 sang giây thứ 6.
      const known = verdicts.get(key);
      if (known === true) return allow();
      if (known === false) return deny();
      return asked(key, vet).then((ok) => (ok ? allow() : deny()));
    }));

    // `alert()` trong một trang lạ giữ cả tab lại cho tới khi có người bấm — mà ở đây không có ai.
    undo.push(chrome.on('Page.javascriptDialogOpening', (params, from) => {
      if (from === sessionId) at('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
    }));

    // Nhịp mạng: mỗi request mở ra, xong hoặc hỏng đều chạm vào đây. `untilQuiet` ở dưới chỉ đọc
    // một con số — lần cuối có gì đó xảy ra — nên nó không phải đếm request đang treo, và một
    // request không bao giờ về cũng không giữ được nó lại.
    const marks = { beat: 0, painted: 0 };
    for (const event of ['Network.requestWillBeSent', 'Network.responseReceived', 'Network.loadingFinished', 'Network.loadingFailed', 'Network.webSocketCreated']) {
      undo.push(chrome.on(event, (params, from) => { if (from === sessionId) marks.beat = Date.now(); }));
    }
    undo.push(chrome.on('Page.lifecycleEvent', (params, from) => {
      if (from !== sessionId || marks.painted) return;
      if (params.name === 'firstContentfulPaint' || params.name === 'firstMeaningfulPaintCandidate') marks.painted = Date.now();
    }));

    await at('Page.enable');
    await at('Page.setLifecycleEventsEnabled', { enabled: true });
    await at('Runtime.enable');
    await at('Network.enable');
    await at('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    // Một link tới file .zip là một cú tải về, không phải một trang. Từ chối, để tab không treo.
    await at('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
    await at('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height,
    });
    await at('Emulation.setUserAgentOverride', { userAgent: UA, acceptLanguage: 'vi-VN,vi;q=0.9,en;q=0.8' });
    // Đặt ở đây chứ không bằng cờ `--hide-scrollbars`, vì cờ chỉ đặt được cho Chrome do mình bật
    // — nối vào Chrome của người khác thì mọi ảnh dính một thanh cuộn xám bên phải.
    await at('Emulation.setScrollbarsHidden', { hidden: true }).catch(() => {});

    marks.beat = Date.now();
    const went = await at('Page.navigate', { url: address });
    if (went.errorText) throw new Error(reasonFor(went.errorText));

    const how = await untilReady(marks, {
      quietMs, leastMs, paintedMs, blankMs, loadMs,
      look: async () => {
        try {
          const answer = await at('Runtime.evaluate', { expression: LOOK, returnByValue: true, timeout: 1000 });
          return Number(answer?.result?.value ?? 0);
        } catch {
          // Không hỏi được thì coi như có: trang đang chuyển hướng, hoặc context vừa bị thay.
          // Nghiêng về chụp, vì đứng đợi mãi một câu trả lời không bao giờ tới là không trả lời.
          return 1;
        }
      },
    });
    if (how === 'trang-trong') console.warn(`${address}: trang vẫn trống sau ${blankMs}ms, chụp thế`);
    await wait(settleMs);

    const title = await pageTitle(at);
    const url = await currentUrl(at, address);

    let clip = { x: 0, y: 0, width, height, scale: 1 };
    let truncated = false;
    if (fullPage) {
      const metrics = await at('Page.getLayoutMetrics');
      const size = metrics.cssContentSize ?? metrics.contentSize ?? { width, height };
      const tall = Math.max(height, Math.ceil(size.height));
      truncated = tall > MOST_FULL_HEIGHT;
      clip = { x: 0, y: 0, width, height: Math.min(tall, MOST_FULL_HEIGHT), scale: 1 };
    }

    const png = await fit(at, clip, mostBytes, fullPage);
    return { png, title, url, truncated };
  } finally {
    for (const off of undo) off();
    if (targetId) await chrome.send('Target.closeTarget', { targetId }).catch(() => {});
    await chrome.send('Target.disposeBrowserContext', { browserContextId: contextId }).catch(() => {});
  }
}

/**
 * Phán quyết cho từng tên máy, dùng chung cho mọi lần chụp.
 *
 * Một CDN phục vụ trăm cái ảnh trong một trang, và mười trang sau vẫn cái CDN ấy — hỏi DNS lại
 * từ đầu mỗi lần là trả tiền cho một câu trả lời mình đã có. Nhớ có hạn, vì một cái tên đổi
 * được chỗ trỏ: sau `VERDICT_MS` thì hỏi lại.
 */
const VERDICT_MS = 5 * 60 * 1000;
const verdicts = new Map();
const asking = new Map();

function asked(key, vet) {
  if (asking.has(key)) return asking.get(key);
  const answer = vet(`${key}/`)
    .then((one) => Boolean(one.ok))
    .catch(() => false)
    .then((ok) => {
      verdicts.set(key, ok);
      asking.delete(key);
      setTimeout(() => verdicts.delete(key), VERDICT_MS).unref?.();
      return ok;
    });
  asking.set(key, answer);
  return answer;
}

/**
 * Đợi tới lúc chụp được: mạng lặng, hoặc đã vẽ ra chữ và chờ đủ, hoặc hết giờ.
 *
 * Nhìn đồng hồ mỗi 100ms chứ không cài hẹn giờ theo từng sự kiện: một trang gọi ba trăm request
 * là ba trăm lần huỷ và đặt lại một cái timer, để rồi cũng chỉ đọc ra đúng hai con số này.
 *
 * Tách khỏi `shot` và nhận vào một cái hộp hai con số, nên nó chạy được trong test mà không cần
 * Chrome — đây là chỗ hay sai nhất trong cả file, và một luật không gọi được là một luật không
 * thử được.
 */
export async function untilReady(marks, {
  quietMs = QUIET_MS, leastMs = LEAST_MS, paintedMs = PAINTED_MS, blankMs = BLANK_MS,
  loadMs = LOAD_MS, tick = 150, now = () => Date.now(), pause = wait, look = async () => 1,
} = {}) {
  const began = now();
  let sure = 0;
  for (;;) {
    const at = now();
    const waited = at - began;
    if (waited >= loadMs) return 'het-gio';
    sure = (await look()) > 0 ? sure + 1 : 0;
    const full = sure >= SURE;
    const quiet = waited >= leastMs && at - marks.beat >= quietMs;
    if (full && marks.painted && at - marks.painted >= paintedMs) return 've-xong';
    if (full && quiet) return 'lang';
    if (!full && quiet && waited >= blankMs) return 'trang-trong';
    await pause(tick);
  }
}

/**
 * Chụp cho tới khi vừa trần.
 *
 * Nền tảng chỉ nhận PNG và SVG, nên không có đường JPEG để mà nén cho nhỏ; thứ đổi được là số
 * điểm ảnh. Thu nhỏ dần chứ không thu thẳng xuống đáy: gần hết các trang vừa ngay từ lần đầu,
 * và một ảnh 1280 rõ chữ thì hơn hẳn một ảnh 640 chắc chắn vừa.
 */
async function fit(at, clip, mostBytes, beyondViewport) {
  const ladder = [1, 0.8, 0.65, 0.5, 0.4];
  let last = null;
  for (const scale of ladder) {
    const answer = await at('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: Boolean(beyondViewport),
      clip: { ...clip, scale },
      optimizeForSpeed: false,
    });
    last = Buffer.from(answer.data, 'base64');
    if (last.byteLength <= mostBytes) return last;
  }
  // Tới đây thì trang là một tấm ảnh chụp khổng lồ. Trả cái nhỏ nhất và để chỗ gọi nói ra.
  throw new Error(`ảnh quá nặng (${Math.round(last.byteLength / 1024)} KB) dù đã thu nhỏ hết cỡ`);
}

async function pageTitle(at) {
  try {
    const answer = await at('Runtime.evaluate', {
      expression: 'document.title || location.host', returnByValue: true, timeout: 2000,
    });
    return String(answer?.result?.value ?? '').trim().slice(0, 160);
  } catch {
    return '';
  }
}

async function currentUrl(at, fallback) {
  try {
    const answer = await at('Runtime.evaluate', { expression: 'location.href', returnByValue: true, timeout: 2000 });
    return String(answer?.result?.value ?? fallback) || fallback;
  } catch {
    return fallback;
  }
}

/// Mã lỗi mạng của Chrome, dịch sang câu người đọc được. Cái còn lại thì đưa nguyên, vì đoán sai
/// nguyên nhân còn tệ hơn là nói ra đúng chữ Chrome đã nói.
export function reasonFor(errorText) {
  const table = {
    'net::ERR_NAME_NOT_RESOLVED': 'không tìm thấy máy chủ',
    'net::ERR_CONNECTION_REFUSED': 'máy chủ từ chối kết nối',
    'net::ERR_CONNECTION_TIMED_OUT': 'máy chủ không trả lời',
    'net::ERR_CONNECTION_CLOSED': 'kết nối bị ngắt giữa chừng',
    'net::ERR_CERT_AUTHORITY_INVALID': 'chứng chỉ HTTPS không hợp lệ',
    'net::ERR_CERT_COMMON_NAME_INVALID': 'chứng chỉ HTTPS không khớp tên miền',
    'net::ERR_CERT_DATE_INVALID': 'chứng chỉ HTTPS đã hết hạn',
    'net::ERR_SSL_PROTOCOL_ERROR': 'lỗi HTTPS',
    'net::ERR_TOO_MANY_REDIRECTS': 'trang chuyển hướng vòng quanh',
    'net::ERR_BLOCKED_BY_CLIENT': 'địa chỉ bị chặn',
    'net::ERR_ABORTED': 'trang không mở được',
    'net::ERR_ADDRESS_UNREACHABLE': 'không tới được địa chỉ',
  };
  return table[errorText] ?? `không mở được trang (${errorText})`;
}
