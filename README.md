# bachhoabot

Một con bot chụp ảnh trang web trong nhóm chat Cúc Cu. Ai dán một cái link, nó mở trang ấy bằng
Chrome thật ở khổ màn hình máy tính, cuộn xuống sáu màn hình, chụp lại, rồi gửi tấm ảnh lên nhóm.

Chỉ tấm ảnh. Không có dòng chữ nào dưới nó, không có lời chào lúc được thêm vào nhóm, không một
câu nào bot không được hỏi.

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
| `/anh https://…` | Chụp sáu màn hình đầu, cả nhóm thấy |
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

## Chụp bao nhiêu

Sáu màn hình — 1280×4800 — và **không bao giờ hơn**.

Một màn hình đầu của gần như mọi trang bây giờ là logo, thanh điều hướng, một cái banner nhận
cookie và đúng một cái tiêu đề: ảnh chụp ra thứ ai cũng đoán được, còn cái người ta dán link để
khoe thì nằm dưới mép.

Cái trần cứng ở sáu thì không phải chuyện gu. Rất nhiều trang **tự nạp thêm khi cuộn xuống**:
không có trần thì bot cuộn, trang dài ra, bot cuộn tiếp, và tấm ảnh lớn lên tới khi nào trang ấy
hết bài — tức là không bao giờ. Trang ngắn hơn sáu màn hình thì chụp đúng nó, không đệm thêm
khoảng trắng: nửa dưới trắng trơn trông y như trang bị lỗi.

### Thôi cho cái feed ăn

Trần ở trên chặn **tấm ảnh**, nhưng không chặn việc bot ngồi cho trang ăn. Cuộn tới đáy một cái
feed là bảo nó nạp tiếp, rồi cái đáy mới lại lùi ra xa — đuổi theo thì đuổi mãi, và thứ đuổi được
thêm cũng chỉ là thêm bài của cùng một cái feed.

Nên trong mỗi lượt cuộn, hễ trang tự đẻ ra quá **một màn hình** thì dừng ngay tại đó. Đo trên một
trang thử tự nạp 1400px mỗi lần cuộn — cùng cho ra một tấm ảnh 4800px:

| | Trang đã nạp | Sự kiện cuộn | Thời gian |
| --- | --- | --- | --- |
| Không chặn | **22 lô** — 30.800px | 20 | 8,6s |
| Có chặn | **5 lô** | 3 | 5,9s |

Và đi lượt cuộn thứ hai hay không thì hỏi **"đã phủ hết chỗ sắp chụp chưa"**, không hỏi "trang có
cao lên không". Hai chuyện khác nhau, và lúc đầu tôi gộp làm một nên hỏng: `theguardian.com` cao
lên vì dựng muộn, lượt đầu chỉ cuộn được 800px nên **phải** đi lại; một cái feed cũng cao lên,
nhưng nó cao lên *vì* mình vừa cuộn, và đi lại chỉ là cho nó đẻ tiếp. Cái phân biệt là đã đi qua
hết chỗ cần chụp hay chưa.

### Cuộn chậm, đợi ở đáy, rồi hỏi lại

Ảnh trên gần như mọi trang bây giờ chỉ tải khi trôi qua tầm mắt, mà "tầm mắt" của trang là chỗ
nó tưởng người ta đang nhìn — không phải vùng bot sắp chụp. Nên phải cuộn thật. Nhưng cuộn thế
nào thì quyết định được bao nhiêu:

| Cách cuộn qua `theguardian.com` | Ảnh tải xong |
| --- | --- |
| Một khung một nấc, dừng 150ms | **8** trên 112 |
| Nửa khung một nấc, đợi mạng im ở mỗi nấc, đợi thêm ở đáy | **22** trên 112 |

Lần đầu làm sai đúng kiểu khó thấy nhất: ảnh chụp ra bố cục đầy đủ, chữ đủ cả, mà **mọi ô ảnh
đều trắng** — 286 KB thay vì 880. Nhìn từ log thì đó là một lần chụp thành công, chỉ nhẹ bất
thường.

Dừng ở mỗi nấc thì **nghe mạng mà dừng**, không đếm giây: chờ tới khi mạng im được một nhịp
ngắn, nhiều nhất 400ms. Trang nhẹ đi hết mười hai nấc trong hơn một giây, trang nặng được đúng
chừng nó cần — đếm giây cố định thì trang nào cũng phải trả cái giá của trang chậm nhất.

Và phải đợi **ở đáy** rồi mới quay lên đầu trang, chứ không quay lên rồi mới đợi: cuộn là một
lần *gọi* ảnh, ảnh về tới nơi thì muộn hơn nửa giây.

Xong một lượt thì **hỏi lại trang xem nó đã cao lên chưa**, vì trang mọc ra sau khi mình tưởng
nó xong. Đo `theguardian.com`: ở giây thứ 7 cả tài liệu vẫn cao **đúng 800px** — một khung — nên
cuộn xuống đáy là cuộn vào chỗ không có gì, và ảnh ra đúng một khung, lại còn là khung dở dang
ở giữa trang. Tới quãng giây thứ 10 nó mới thành 9230px. Cao lên thì đi thêm **một** lượt nữa;
một thôi, vì trang tự nạp bài thì lượt nào cũng thấy nó cao lên.

Đo chiều cao **trước** khi cuộn lượt đầu, không bắt đầu từ 0 — bắt đầu từ 0 thì trang một khung
cũng tính là "đã cao lên", và mọi trang ngắn đều đi thừa một lượt. Và chỉ cuộn tới đáy trang
*hiện có*: cuộn xuống 4800 của một trang cao 800 là mười nấc đi qua chỗ trống. Hai chỗ ấy đưa
`example.com` từ 4,9 giây xuống **2,0**.

### Dọn lớp che

Banner "chấp nhận cookie" dính đáy màn hình là thứ hỏng nặng nhất với một tấm ảnh sáu màn hình:
nó nằm nguyên ở đáy khung chụp và ăn mất cả một dải ngang. Trang nào khoá cuộn sau cái banner ấy
thì ảnh chỉ còn mỗi nó.

Cách hiển nhiên là chụp 80% mỗi màn hình rồi ghép — nhưng thế là bỏ đi gần một nghìn điểm ảnh
nội dung **thật** trên sáu màn hình, mỗi lần chụp, kể cả những trang chẳng có banner nào; mà
banner cao hơn 20% thì vẫn lọt vào. Chữa cái nhìn thấy chứ không chữa cái gây ra.

Nên dọn thẳng: mọi thứ `position: fixed` mà **dính đáy và rộng quá nửa khung**, hoặc **phủ quá
60% ngang và 50% dọc**, đều bị ẩn. Hai luật ấy bắt banner cookie, lớp phủ mờ, hộp thoại đăng ký
nhận tin — còn thanh điều hướng dính đỉnh thì giữ, vì trong ảnh nó chỉ hiện một lần ở trên cùng.
Dọn lại ở đầu mỗi lượt cuộn, vì rất nhiều banner chỉ hiện ra **sau khi** cuộn. Và mở lại
`overflow` của `body`, không thì phần dưới không bao giờ cuộn tới được.

`sticky` từng nằm trong luật ấy, và nó dọn nhầm ngay: `theguardian.com` gói nội dung trong những
khối `sticky` rộng cả trang, nên luật "phủ nhiều" ăn luôn cả khối ảnh. Giờ chỉ `fixed`. Một
banner sót lại thì chỉ xấu; xoá nhầm nội dung thì là nói dối về trang ấy.

**Ẩn chứ không bấm "Đồng ý".** Bấm hộ người khác một nút đồng ý là quyết định thay họ một chuyện
không phải của mình — mà nút ấy mỗi trang một chữ, mỗi nước một luật.

## Câu trả lời là tấm ảnh, và chỉ tấm ảnh

Không có dòng chữ nào đi kèm. Đã có một dòng — tiêu đề với tên miền — rồi bỏ đi: nó nói lại thứ
trong ảnh đã có, và một con bot nói thừa trong nhóm chat của người khác thì mỗi ngày nó nói thừa
vài chục lần.

Cái mất, nói thẳng ra: **một ảnh chụp không kèm tên miền thì link rút gọn dẫn đi đâu không ai
thấy**. `bit.ly/abc` chuyển tới `cho-la.com` vẽ giao diện ngân hàng, và tấm ảnh trông y như thật.
Chỗ duy nhất còn giữ tên miền là tên file ảnh (`cho-la.com-2026-09-20.png`), mà nó chỉ hiện ra
lúc có người tải về. Ai đổi ý thì `caption` nằm trong lịch sử git.

Tài liệu nền tảng viết `text` là bắt buộc "unless `stickerId` is set". Không đúng cho tin có ảnh:
`RefusedAsWritten` trong `server/Zeplao.Api/BotApi.cs` chỉ xét độ dài và bàn phím, không hề đòi
`text`. Dòng ấy nói về tin nhắn chữ.

Lúc được thêm vào nhóm bot cũng **không chào**. Nhiều bot chào một câu, vì chế độ riêng tư nhìn
từ trong phòng thì không thấy được — nhưng con bot này được thêm vào để làm một việc im lặng, và
một lời chào là tin nhắn đầu tiên nó gửi lại chẳng phải việc ấy. Ai cần biết nó làm gì thì gõ tên
nó.

Chữ chỉ còn cho hai lúc: không chụp được, và có người hỏi nó làm được gì.

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
| **Đã có nội dung** rồi chờ thêm 1,5 giây | Cho trang không bao giờ lặng — `github.com` |
| **Hết 15 giây** | Cho trang không bao giờ xong |

Và một đường về không ai muốn: trang **vẫn trống** sau 5 giây mà mạng đã lặng thì chụp một trang
trống, có ghi một dòng cảnh báo vào log. Có trang trống thật, và bắt nó phải có gì đó là đợi hết
trần rồi mới chụp đúng cái đã thấy từ giây đầu.

Nhưng cửa thoát ấy chỉ mở cho trang **đã đọc xong** mà vẫn trống. Trang còn `loading` thì không
phải trống, nó là **chưa tới** — và `github.com` có lúc còn `loading` ở giây thứ 5 với mạng im
lìm, nên bắn cửa thoát ở đó là gửi lên nhóm một tấm ảnh trắng của một trang hoàn toàn bình
thường. Ba trong bốn lượt đo bị đúng cái đó.

Thứ tự trong phép đo ấy cũng phải đúng: **đếm nội dung trước, hỏi `readyState` sau**. Hỏi trước
thì một trang đang đọc dở mà đã vẽ xong nội dung vẫn bị coi là chưa tới, và mọi trang chậm đều
phải ngồi hết trần mười lăm giây.

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

## Ảnh, và cỡ ảnh

Hai cái trần, và cái chặt hơn không phải cái của nền tảng.

Nền tảng nhận nhiều nhất 2 MB một ảnh. Nhưng 2 MB là **quá nặng cho một tin nhắn**: người ta
đang ngồi 4G trong quán, và một tấm ảnh bot tự gửi vào giữa cuộc nói chuyện thì không ai chọn
tải nó cả. Nên bot nhắm **900 KB**.

Cái trần thứ hai là một sự thật vật lý, tìm ra bằng cách đâm vào nó: **`WebSocket` có sẵn của
Node có giới hạn kích thước gói.** Đo được — base64 3,88 MB qua lọt, cỡ gấp đôi thì *đứt kết
nối*: không lỗi, không mã đóng, chỉ là cái socket chết và mọi lệnh đang chờ hỏng theo. Ảnh nhiều
màn hình của một trang báo chụp ở tỉ lệ 1 nằm đúng vùng ấy, nên nâng từ bốn lên sáu màn hình làm
"Chrome chết" ngay ở trang thứ nhất — mà Chrome thì vẫn sống, chỉ là không ai nói chuyện với nó
được nữa.

Nên **đo trước rồi mới chụp**, chứ không chụp to rồi thu: chính tấm ảnh quá khổ ấy là thứ làm
đứt kết nối, nên nó không được phép tồn tại. Chụp thử **một khung** — nhỏ, chắc chắn qua lọt — để
biết trang này tốn bao nhiêu byte mỗi điểm ảnh, rồi nhân cho cả vùng sắp chụp. Số byte của PNG
đi gần như tuyến tính theo số điểm ảnh, mà số điểm ảnh đi theo bình phương tỉ lệ, nên tỉ lệ cần
là căn bậc hai của tỉ lệ byte. Đo rồi vẫn kiểm lại bằng số thật, vì khung đầu là banner với thanh
điều hướng chứ chưa phải phần ảnh ở dưới.

Không có đường nén nào khác ngoài giảm điểm ảnh. Nền tảng chỉ nhận PNG với SVG — không JPEG — và
SVG bọc một tấm JPEG cũng bị chặn có chủ ý: `href="data:"` nằm trong regex `UnsafeSvg` của
`BotApi.cs`.

### Nhẹ và đọc được: chọn một

Quá một mức thì hai cái đó không đi cùng nhau, và phép nhân quyết định chứ không phải ý thích.
Thử tám màn hình — 1280×6400, **8,2 triệu điểm ảnh** — rồi ép xuống 900 KB thì `vnexpress.net`
ra **544px ngang**, và ở cỡ ấy chữ tiếng Việt có dấu thành một vệt xám. Một tấm ảnh nhẹ mà không
đọc được thì nhẹ để làm gì.

Nên `AIM_BYTES` là cái **nhắm tới**, không phải cái phải đạt bằng mọi giá, và `LEAST_SCALE` là
**sàn thật**. Trang nào chạm sàn thì nặng hơn cái nhắm tới, và thế là đúng. Chỉ một thứ được
phép đẩy xuống dưới sàn: trần gói của socket — chữ nhỏ khó đọc còn hơn đứt kết nối rồi không có
ảnh nào.

Sáu màn hình là chỗ hai thứ ấy còn ngồi cạnh nhau được. Đo:

| | Cỡ ảnh | Cỡ file | Tỉ lệ | Thời gian |
| --- | --- | --- | --- | --- |
| `example.com` | 1280×800 | 17 KB | 1,00 | 1,9s |
| `news.ycombinator.com` | 1280×1217 | 273 KB | 1,00 | 6,0s |
| `theguardian.com` | 1280×4800 | 384 KB | 1,00 | 6,3s |
| `kuku.vn/bot/doc` | 1280×4800 | 792 KB | 1,00 | 3,8s |
| `24h.com.vn` | 640×2400 | 796 KB | 0,50 | 14,0s |
| `vnexpress.net` | 640×2400 | 806 KB | 0,50 | 11,3s |
| `cafef.vn` | 640×2400 | 930 KB | 0,50 | 9,4s |
| `bbc.com/news` | 653×2448 | 973 KB | 0,51 | 9,5s |

Trang chữ giữ nguyên 1280px và không bị đụng tới — ở sáu màn hình thì cả `theguardian.com` lẫn
`kuku.vn` đều còn nguyên độ nét. Chỉ trang nhiều ảnh mới chạm sàn, và đó cũng đúng là loại trang
mà thu nhỏ ít mất mát nhất.

Mỗi tin nhắn kèm một `clientMessageId` dựng từ id tin nhắn và địa chỉ, nên gửi lại sau một cú 429
hay một lần mạng đứt không làm ra tấm ảnh thứ hai trong phòng.

## Chrome nằm ở container riêng

Lúc đầu Chromium nằm ngay trong image của bot — một container, `docker run` một dòng là chạy. Nó
hỏng, và hỏng theo kiểu tốn nhất: `apk add` tải về và cài xong hết 828 MiB, rồi ngã ở dòng cuối
cùng lúc ghi layer, `no space left on device`, sau đúng năm mươi giây.

Đo lại thì cái sàn không lay chuyển được:

| | Cỡ cài đặt |
| --- | --- |
| `chromium` một mình | **709,5 MiB** |
| + bộ font tối thiểu (dejavu, liberation, noto-emoji) | 734,3 MiB |
| + thêm CJK | 823,1 MiB |
| Bộ font ban đầu (noto, noto-cjk, freefont) | 828,4 MiB |

Cắt font xuống mức tối thiểu chỉ được 94 MiB. 709 MiB kia là chính Chromium, và không có cách nào
làm một trình duyệt nhỏ đi.

Nên Chrome ra ở ngoài. Image của bot về lại đúng cỡ một con bot — Node và năm file — và dựng
trong vài giây; còn trình duyệt thành một container sẵn có, dùng chung được cho nhiều bot và nâng
cấp riêng khỏi bot. Cái giá là phải trông hai container thay vì một, và đó là cái giá đúng: mỗi
lần sửa một dòng mã mà phải dựng lại gần một gigabyte là một lần không ai muốn sửa gì nữa.

`CHROME_URL` trỏ vào nó. Không đặt thì bot tự bật một Chrome trên máy như cũ — hai đường cùng đi
qua `open()` trong [`web/shot.mjs`](web/shot.mjs), và chỗ gọi không cần biết là đường nào. Khác
nhau đúng hai điều: cái tự bật thì đóng là giết, cái nối vào thì đóng chỉ là cúp máy; và cờ khởi
động chỉ đặt được cho cái tự bật, nên khổ màn hình, user agent và thanh cuộn đều đặt lại cho từng
trang chứ không đặt bằng cờ.

> ⚠️ Cổng 9222 của Chrome là **toàn quyền** trên mọi trang nó mở. Đừng mở nó ra ngoài mạng nội
> bộ. `compose.yaml` dùng `expose`, không dùng `ports`, đúng vì thế.

## Chạy thế nào

Tạo bot ở [kuku.vn/bot](https://kuku.vn/bot), lấy token, rồi:

```sh
ZEPLAO_BOT_TOKEN=... docker compose up -d
```

`compose.yaml` dựng cả hai: con bot và một `zenika/alpine-chrome` cạnh nó.

Chạy trần trên máy mình, dùng Chrome sẵn có trong máy:

```sh
ZEPLAO_BOT_TOKEN=... node bachhoabot.mjs
```

Cần **Node 22 trở lên** (dùng `WebSocket` có sẵn), và một bản Chrome hoặc Chromium trên máy —
hoặc `CHROME_URL` trỏ vào một cái ở chỗ khác. Không cần `npm install`: repo không phụ thuộc gói nào.

| Biến | |
| --- | --- |
| `ZEPLAO_BOT_TOKEN` | Bắt buộc |
| `CHROME_URL` | `http://chrome:9222` — nối vào Chrome có sẵn thay vì tự bật một cái |
| `CHROME_PATH` | Chỗ Chrome nằm, nếu tự bật mà nó không nằm ở chỗ thường |
| `CHROME_NO_SANDBOX` | `1` để tắt sandbox — **chỉ khi tự bật Chrome bên trong container** |
| `ZEPLAO_BOT_API` | Nền tảng bot. Mặc định `https://api-bot.kuku.vn` |
| `BACHHOA_STATE` | File nhớ đã đọc tới đâu. Mặc định `data/state.json` |
| `SHOT_WIDTH`, `SHOT_HEIGHT` | Khổ màn hình. Mặc định 1280×800 |
| `SHOT_PAGES` | Chụp mấy màn hình. Mặc định 6 |
| `SHOT_AIM_BYTES`, `SHOT_LEAST_SCALE` | Cỡ file nhắm tới (900 KB) và sàn thu nhỏ (0,5). Sàn thắng |
| `SHOT_SAFE_BYTES` | Trần cho một gói CDP (2,6 MB). Vượt là đứt socket |
| `SHOT_DWELL_MS`, `SHOT_SCROLLED_MS` | Dừng lâu nhất ở mỗi nấc cuộn (400ms), đợi ảnh về ở đáy (4,5s) |
| `SHOT_GROW_BY` | Trang được tự đẻ chừng này trong một lượt cuộn rồi thôi (800px) |
| `SHOT_QUIET_MS`, `SHOT_PAINTED_MS`, `SHOT_BLANK_MS`, `SHOT_LOAD_MS` | Bốn cái mốc ở mục "Chụp lúc nào" (700 · 1500 · 5000 · 15000) |
| `BACHHOA_ORDERS`, `BACHHOA_WAITING` | Chụp mấy trang một lúc (4), hàng đợi dài nhất (12) |
| `BACHHOA_SAME_MS` | Cùng link cùng phòng thì bao lâu mới chụp lại. Mặc định 10 phút |

## Hàng đợi, và vì sao nhiều luồng không làm một tấm ảnh nhanh lên

Bốn trang một lúc. Một trang mất hai tới mười giây, nối đuôi nhau thì cái link thứ tư trong một
nhóm đang nói chuyện rôm rả phải đợi gần một phút. Mỗi lần chụp là một tab riêng trong cùng một
Chrome, nên bốn tab cùng vẽ rẻ hơn hẳn bốn Chrome.

Nhưng **một tấm ảnh không nhanh lên vì có nhiều luồng.** Mở trang, dựng, cuộn, đợi ảnh về rồi
chụp là một chuỗi việc nối tiếp nhau, và không khúc nào chạy trước khúc trước nó được. Nhiều
luồng chỉ giúp *nhiều link* xong sớm hơn. Một link thì nhanh lên nhờ bỏ bớt chỗ chờ thừa — đo
chiều cao trước khi cuộn, chỉ cuộn tới đáy trang hiện có, nghe mạng mà dừng thay vì đếm giây,
hỏi tiêu đề và địa chỉ trong một lượt thay vì hai — và đó là chỗ đã lấy lại được từ 4,9 giây
xuống 2,0 cho một trang ngắn, và 12,8 xuống 8,7 cho `theguardian.com`.

Hàng đợi có trần 12, và khi đầy thì **bỏ việc cũ nhất** chứ không bỏ việc mới. Một con bot cặm
cụi trả nợ hàng đợi là con bot trả lời những câu không ai còn nhớ đã hỏi.

`offset` được dời **trước** khi làm việc, không phải sau: một update làm bot ném lỗi mà chưa dời
thì lần hỏi sau nó lại về, và lại, mãi mãi.

Chrome chết — OOM killer lúc ba giờ sáng — thì bot dựng lại rồi chụp tiếp. Không có chỗ ấy thì cái
chết đó im lặng và vĩnh viễn: mọi câu trả lời sau đó đều là "không mở được trang", và log chỉ nói
đúng một câu ấy. Treo cũng tính là chết: quá 45 giây thì cắt, đóng Chrome, dựng cái mới. Và lời
trăng trối của nó — mấy dòng cuối trên stderr — được giữ lại để nói ra, vì "kết nối hỏng" một
mình thì không bao giờ chỉ ra được vì sao.

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
| [`compose.yaml`](compose.yaml) | Hai container: con bot, và một Chrome cho nó mượn |
| [`bachhoabot.test.mjs`](bachhoabot.test.mjs), [`web.test.mjs`](web.test.mjs) | Hai nửa, hai bộ test |

Luật tìm link chép đúng luật của chính ứng dụng (`client/src/chat-logic.ts`, `linksIn`), không
viết lại theo ý mình: người ta gõ một câu, thấy ứng dụng gạch chân chỗ nào thì chờ bot chụp đúng
chỗ ấy.

Không có Puppeteer, không có Playwright — không phải vì chúng dở, mà vì cả repo này không phụ
thuộc gói nào. Phần CDP cần cho việc chụp một trang đọc hết trong một lần ngồi, nhỏ hơn hẳn cái
giá của một cây phụ thuộc phải trông cho khỏi cũ.

Tài liệu nền tảng: [kuku.vn/bot/doc](https://kuku.vn/bot/doc).
