# bachhoabot

Một con bot chụp ảnh trang web trong nhóm chat Cúc Cu. Ai dán một cái link, nó mở trang ấy bằng
Chrome thật ở khổ màn hình máy tính, chụp lại, rồi gửi tấm ảnh lên nhóm kèm một dòng:

```
Báo VnExpress - Báo tiếng Việt nhiều người xem nhất · vnexpress.net
[ảnh trang, 1280×800]
```

Một dòng, vì tấm ảnh đã nói trang ấy trông thế nào rồi. Thứ ảnh không nói được là nó **của ai** —
nên dòng chữ chỉ có tiêu đề và tên miền, và nếu link dẫn đi nơi khác thì nó nói ra chỗ ấy.

## Vì sao cần, khi ứng dụng đã có xem trước link

Cái xem trước sẵn có trong Cúc Cu là tiêu đề, một dòng mô tả và tấm `og:image` — tức là **thứ
trang ấy tự nói về mình**. Trang nào cũng viết được gì vào đó cũng được.

Ảnh chụp là thứ trang ấy **thật sự hiện ra**, và hiện ra ở bản máy tính — cái bản mà điện thoại
trong tay người ta không mở được. Một bảng giá, một biểu đồ, một trang ba cột, một bài báo có
ảnh chạy ngang: xem trước không mang được chúng về, ảnh chụp thì có.

Hai thứ này không thay nhau. Chúng nằm cạnh nhau trong cùng một tin nhắn.

## Dùng thế nào

| Gõ | Được gì |
| --- | --- |
| Dán một cái link vào nhóm | Bot chụp, không cần gõ gì thêm — **cần tắt chế độ riêng tư**, xem dưới |
| `/anh https://…` | Chụp một trang, cả nhóm thấy |
| `!anh https://…` | Như trên, chỉ người gõ thấy |
| `/anh dai https://…` | Chụp cả trang dài, không chỉ màn hình đầu |
| `@bachhoabot https://…` | Gọi tên, nếu ai quen lối ấy |
| `@bachhoabot` | Hướng dẫn |

`/chup` và `/xem` là tên khác của `/anh`.

Mỗi tin nhắn bot chỉ chụp **một** link, cái đầu tiên. Không phải vì khó làm nhiều hơn: mỗi tấm
ảnh là một tin nhắn nữa đẩy cuộc trò chuyện trôi lên, mà nền tảng chỉ cho mỗi phòng một tin mỗi
giây — ai dán năm cái link thì năm giây sau nhóm vẫn đang xem ảnh thay vì nói chuyện. Cần cái thứ
hai thì gõ `/anh` cho riêng nó.

Cùng một link, cùng một phòng, trong **mười phút** thì bot không chụp lại. Người ta trả lời nhau,
chuyển tiếp, dán nhầm hai lần — và ba tấm ảnh giống hệt nhau không nói thêm được gì.

## Chế độ riêng tư, và vì sao nó là quyết định chịu lực

Mặc định, một bot trong nhóm chỉ nghe thấy: tin bắt đầu bằng `/`, tin `@` gọi tên nó, và trả lời
cho chính tin của nó. Đó là chế độ riêng tư, và nó đúng — bỏ nó đi thì mọi bot trong phòng thức
dậy mỗi lần ai đó gõ một chữ.

Nhưng việc của con bot này là **thấy link người ta dán giữa lúc nói chuyện**. Không ai dán link
rồi gõ thêm một lệnh để nhờ xem nó; nếu phải gõ lệnh thì họ đã tự bấm vào link rồi. Nên để bot
tự chụp, chủ bot phải **tắt chế độ riêng tư** ở trang bot — và cả nhóm được ứng dụng báo cho
biết khi điều đó xảy ra. Đó là cái giá, và nó phải hiện ra, không được lặng lẽ.

Không tắt thì bot vẫn chạy, chỉ là phải gọi: `/anh <địa chỉ>` hoặc `@bachhoabot <địa chỉ>`.

Điều đó dẫn thẳng tới luật thứ hai: **nghe được không phải là được hỏi.** Bot nghe cả phòng,
nhưng không có link thì nó im. Và khi một cái link không mở được, nó **nói riêng với người dán**
(`onlyForUserId`) chứ không báo cả nhóm: họ đang nói chuyện với nhau, không ai hỏi bot cả, và một
dòng "không mở được" giữa câu chuyện là bot chen ngang để kể chuyện của nó. Ngược lại, ai gõ lệnh
hay gọi tên thì hỏng cũng phải nói trước cả phòng — họ đã hỏi trước mặt mọi người, và im lặng ở
đó là nói dối.

## Chụp lúc nào

Đây là chỗ khó nhất trong cả repo, và cả ba cách hiển nhiên đều sai. Mỗi cách sai một kiểu, và
kiểu nào cũng ra cùng một hậu quả: **một tấm ảnh trắng gửi lên nhóm, kèm một dòng log nói là
thành công.**

**Đợi `load`.** `example.com` nổ `load` sau 180ms; `github.com` và `vnexpress.net` thì **không
nổ trong 25 giây** — một request quảng cáo treo, một cái font không bao giờ về, và sự kiện ấy
không tới dù trang đã vẽ xong từ lâu. Đợi `load` là trả lời sau mười lăm giây cho đúng những
trang người ta hay gửi nhất.

**Đợi mạng lặng.** Hết 700ms không request nào mở ra, xong hay hỏng thì trang đứng yên — và một
request treo không giữ được nó lại, vì thứ đang treo thì không sinh sự kiện. Tốt hơn hẳn, nhưng
mạng lặng không có nghĩa là trang xong: đo `kuku.vn/bot/doc`, ở giây thứ 1 mạng đã lặng 927ms mà
trên trang có **0 chữ**; chữ hiện ra ở giây 1,5.

**Tin vào "đã vẽ" của Chrome.** Cũng không được: với trang ấy Chrome báo đã vẽ ở giây 1,9 — sau
cả lúc chữ đã hiện — còn với trang khác nó báo sớm, vì nó có vẽ thật, nó vẽ cái nền.

Nên bot **hỏi thẳng trang xem trong khung nhìn có gì**: chín điểm rải khắp 1280×800, dưới mỗi
điểm có phần tử nào không phải `body` với `html` không. Đếm chữ cả trang thì không đủ — và
`github.com` là chỗ nó gãy: trang ấy có thanh điều hướng từ giây đầu nên `innerText` khác 0 ngay
lập tức trong khi cả phần thân còn trắng, đo mười lượt thì ba lượt chụp phải khoảng trắng ấy.
Chín điểm kia thì nhìn đúng thứ sắp vào ảnh, và một trang chỉ có mỗi tấm ảnh hay một file PDF
nhúng cũng đếm được mà không phải kể tên từng loại.

Phải thấy có gì đó **ba nhịp liền** mới tính, vì trang dựng bằng JS thay cả phần thân trong một
nhịp vẽ — nhìn trúng lúc ấy thì thấy trắng, hoặc tệ hơn, thấy có rồi chụp ngay lúc nó vừa trống đi.

Có thế rồi thì ba đường về đích, cái nào tới trước thì chụp:

| | |
| --- | --- |
| **Mạng lặng** 700ms | Gần hết các trang đi đường này |
| **Đã có nội dung** rồi chờ thêm 3 giây | Cho trang không bao giờ lặng — `github.com` |
| **Hết 15 giây** | Cho trang không bao giờ xong |

Và một đường về không ai muốn: trang **vẫn trống** sau 5 giây mà mạng đã lặng thì chụp một trang
trống, có ghi một dòng cảnh báo vào log. Có trang trống thật, và bắt nó phải có gì đó là đợi hết
trần rồi mới chụp đúng cái đã thấy từ giây đầu.

Đo sau khi sửa, bốn lượt liền: `example.com` 1,5 giây · `kuku.vn/bot/doc` 2,1–3,9 ·
`wikipedia` 2,8 · `news.ycombinator.com` 3,6 · `vnexpress.net` 4,2 · `24h.com.vn` 4,7 ·
`github.com` 5,9–13,5. Lượt nào cũng ra đúng trang — `github.com` chậm vì khoảng trắng của nó
dài, và chậm mà đúng thì hơn nhanh mà trắng.

`untilReady` trong [`web/shot.mjs`](web/shot.mjs) nhận vào một cái đồng hồ và một hàm "nhìn thử",
nên cả bốn luật trên chạy được trong bộ test mà không cần Chrome lẫn internet — xem
[`web.test.mjs`](web.test.mjs).

## Những trang bot không mở

Con bot này mở địa chỉ do **người lạ gõ vào một ô chat**, rồi gửi ảnh chụp thứ nó thấy lên một
nhóm. Đó là hai nửa của một lỗ SSRF hoàn chỉnh: một nửa đi vào mạng nội bộ, một nửa mang cái thấy
được ra ngoài. Nên có một cái cửa, và nó đứng ở **địa chỉ IP**, không đứng ở tên miền.

| Không mở | Vì sao |
| --- | --- |
| `javascript:`, `data:`, `file:` | Chỉ http và https. Cái còn lại là cách một ô chat thành chỗ chạy mã |
| Địa chỉ trong nhà | `127/8`, `10/8`, `192.168/16`, `172.16/12`, `169.254/16` (và `169.254.169.254`), `100.64/10`, `::1`, `fc00::/7`, `fe80::/10`, v4 đội mũ v6, 6to4, NAT64 |
| Tên miền trỏ về nhà | Hỏi DNS rồi xét **từng** địa chỉ trả về, không phải địa chỉ đầu — chỉ cần trình duyệt thử cái thứ hai là xong |
| Cổng lạ | Chỉ 80 và 443. Không phải để chặn một trang web, mà để bot không thành máy quét cổng: hai câu trả lời khác nhau là đủ để dò cả mạng qua một ô chat |
| Link kèm mật khẩu | `https://an:mat@…` — mật khẩu nằm trong link thì nó nằm cả trong ảnh và trong nhóm chat này mãi mãi |

Và cái cửa ấy xét **mọi request**, không phải mỗi request đầu. Một trang công khai chuyển hướng
được về `127.0.0.1`; mà một `<img src="http://192.168.1.1/admin">` thì chẳng chuyển hướng gì cả,
nó chỉ lặng lẽ vẽ trang quản trị của router vào đúng tấm ảnh bot sắp gửi lên nhóm. Chuyển hướng là
một request mới, ảnh trong trang cũng vậy, nên cả hai đi qua cùng một chỗ.

Cái giá của nó đo được: chặn từng request đẩy lượt vẽ đầu tiên của `github.com` từ giây thứ 3,4
sang giây thứ 6,6. Nên phán quyết cho mỗi tên máy được **nhớ lại trong 5 phút và dùng chung cho
mọi lần chụp**, và khi đã biết thì cửa trả lời ngay trong lượt ấy chứ không `await` gì cả — một
trang là hàng trăm request, và mỗi lần nhường lượt cho vòng lặp sự kiện là một lần trang đứng chờ.

Ngoài ra, mỗi lần chụp là một **hồ sơ trình duyệt riêng**: hai người lạ gửi hai cái link không
dùng chung cookie, localStorage hay cache.

## Ảnh, và trần 2 MB

Nền tảng nhận nhiều nhất 2 MB một ảnh, và chỉ nhận PNG hoặc SVG — không có đường JPEG để nén cho
nhỏ. Thứ đổi được là số điểm ảnh, nên bot chụp rồi cân, quá trần thì thu nhỏ dần: 1 → 0,8 → 0,65
→ 0,5 → 0,4. Thu dần chứ không thu thẳng xuống đáy, vì gần hết các trang vừa ngay từ lần đầu và
một ảnh 1280 đọc được chữ thì hơn hẳn một ảnh 640 chắc chắn vừa.

`/anh dai` chụp cả trang, cắt ở 4000px. Dài hơn thì thành một tấm ảnh không ai đọc nổi trong
khung chat, và gần như chắc chắn vượt trần.

Mỗi tin nhắn kèm một `clientMessageId` dựng từ id tin nhắn và địa chỉ, nên gửi lại sau một cú 429
hay một lần mạng đứt không làm ra tấm ảnh thứ hai trong phòng.

## Chạy thế nào

Tạo bot ở [kuku.vn/bot](https://kuku.vn/bot), lấy token, rồi:

```sh
ZEPLAO_BOT_TOKEN=... node bachhoabot.mjs
```

Cần **Node 22 trở lên** (dùng `WebSocket` có sẵn) và một bản Chrome hoặc Chromium trên máy. Không
cần `npm install`: repo không phụ thuộc gói nào.

Bằng Docker thì Chromium và font đã nằm sẵn trong image:

```sh
docker run -d --name bachhoabot --restart unless-stopped \
  -e ZEPLAO_BOT_TOKEN=<token> \
  -v bachhoabot-data:/app/data \
  git.potatolabs.uk/zeplao/zeplao-bot-bachhoatonghop
```

| Biến | |
| --- | --- |
| `ZEPLAO_BOT_TOKEN` | Bắt buộc |
| `ZEPLAO_BOT_API` | Nền tảng bot. Mặc định `https://api-bot.kuku.vn` |
| `CHROME_PATH` | Chỗ Chrome nằm, nếu không nằm ở chỗ thường |
| `CHROME_NO_SANDBOX` | `1` để tắt sandbox — **chỉ trong container** |
| `BACHHOA_STATE` | File nhớ đã đọc tới đâu. Mặc định `data/state.json` |
| `SHOT_WIDTH`, `SHOT_HEIGHT` | Khổ màn hình. Mặc định 1280×800 |
| `SHOT_QUIET_MS`, `SHOT_PAINTED_MS`, `SHOT_BLANK_MS`, `SHOT_LOAD_MS` | Bốn cái mốc ở mục "Chụp lúc nào" (700 · 3000 · 5000 · 15000) |
| `BACHHOA_ORDERS`, `BACHHOA_WAITING` | Chụp mấy trang một lúc (2), hàng đợi dài nhất (12) |
| `BACHHOA_SAME_MS` | Cùng link cùng phòng thì bao lâu mới chụp lại. Mặc định 10 phút |

## Hàng đợi

Hai trang một lúc, không phải một: một trang chậm mất tới mười lăm giây, nối đuôi nhau thì cái
link thứ ba trong một nhóm đang nói chuyện rôm rả phải đợi gần một phút. Cũng không phải mười:
mỗi trang là một Chrome đang vẽ.

Hàng đợi có trần 12, và khi đầy thì **bỏ việc cũ nhất** chứ không bỏ việc mới. Một con bot cặm
cụi trả nợ hàng đợi là con bot trả lời những câu không ai còn nhớ đã hỏi.

`offset` được dời **trước** khi làm việc, không phải sau: một update làm bot ném lỗi mà chưa dời
thì lần hỏi sau nó lại về, và lại, mãi mãi.

Chrome chết — OOM killer lúc ba giờ sáng — thì bot dựng lại rồi chụp tiếp. Không có chỗ ấy thì cái
chết đó im lặng và vĩnh viễn: mọi câu trả lời sau đó đều là "không mở được trang", và log chỉ nói
đúng một câu ấy. Treo cũng tính là chết: quá 45 giây thì cắt, đóng Chrome, dựng cái mới.

## Bộ test

```sh
npm test
```

Không cần mạng, không cần Chrome, không cần token. `untilReady` nhận vào một cái đồng hồ giả,
`vetHost` nhận vào một cái DNS giả, `keeper` nhận vào một cái Chrome giả — vì một luật chỉ thử
được khi có cả trình duyệt lẫn internet là một luật không ai thử trước khi nó lên nhóm chat của
người khác.

## Cấu trúc

| | |
| --- | --- |
| [`bachhoabot.mjs`](bachhoabot.mjs) | Vòng lặp: đọc update, đọc tin nhắn ra thành việc, xếp hàng, gửi |
| [`web/links.mjs`](web/links.mjs) | Tìm link trong một câu, và cái cửa xét địa chỉ |
| [`web/shot.mjs`](web/shot.mjs) | Chrome qua CDP: bật, mở trang, đợi, chụp, thu cho vừa trần |
| [`web/message.mjs`](web/message.mjs) | Chữ đi kèm ảnh, và trí nhớ mười phút |
| [`bachhoabot.test.mjs`](bachhoabot.test.mjs), [`web.test.mjs`](web.test.mjs) | Hai nửa, hai bộ test |

Luật tìm link chép đúng luật của chính ứng dụng (`client/src/chat-logic.ts`, `linksIn`), không
viết lại theo ý mình: người ta gõ một câu, thấy ứng dụng gạch chân chỗ nào thì chờ bot chụp đúng
chỗ ấy.

Không có Puppeteer, không có Playwright — không phải vì chúng dở, mà vì cả repo này không phụ
thuộc gói nào. Phần CDP cần cho việc chụp một trang đọc hết trong một lần ngồi, nhỏ hơn hẳn cái
giá của một cây phụ thuộc phải trông cho khỏi cũ.

Tài liệu nền tảng: [kuku.vn/bot/doc](https://kuku.vn/bot/doc).
