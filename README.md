# Doll Dressing Game

Kız ve erkek bebekleri giydirip ten ve saç renklerini özelleştirebileceğiniz, tarayıcıda çalışan bir giydirme oyunu. Proje saf HTML, CSS ve JavaScript ile yazılmıştır; framework, build aracı veya çalışma zamanı bağımlılığı yoktur.

Projenin oyun kısmı ve **AI Fashion Studio**'nun mevcut yazılı/çizim özellikleri çalışır durumdadır. Gerçek AI görsel üretimi ve otomatik kıyafet giydirme entegrasyonu ise **tamamlanmamıştır**; harici API maliyeti nedeniyle durdurulmuştur. Bu README, çalışan özellikler ile yalnızca hazırlanmış altyapıyı birbirinden ayırır.

## Hızlı Başlangıç

Oyunu çalıştırmak için ek kurulum gerekmez:

```text
index.html dosyasını bir tarayıcıda açın
```

Proje `file://` üzerinden çalışacak şekilde tasarlanmıştır. AI Design ve Draw Your Own da tarayıcı içinde, tamamen yerel olarak çalışır; oyun için local server veya backend zorunlu değildir.

İsterseniz basit bir statik sunucu da kullanabilirsiniz:

```bash
python -m http.server 8000
# http://localhost:8000
```

> Bu statik sunucu yalnızca oyun dosyalarını sunar; `api/generate.js`'yi çalıştırmaz. Backend/Phase komutları ayrıdır (aşağıda).

## Oyun Özellikleri

### Başlangıç ve bebek sistemi

- **Start (New Doll)** ile isim ve cinsiyet seçilerek yeni bebek oluşturulur.
- **Continue** ile `localStorage`'daki kayıtlı bebekler listelenir, açılır veya silinir.
- Kız bebek `doll.png`, erkek bebek `boydoll.png` taban görselini kullanır.
- Menüdeki yüz, saç, kıyafet ve ayakkabı seçenekleri seçilen cinsiyete göre filtrelenir; erkek öğeleri `boy-item` sınıfıyla ayrılır.
- Bebek 320×700 taban tuvalinde çizilmiştir ve oyun alanında 220 px genişlikte gösterilir.

### Giydirme kategorileri

- **Skin**: Ten rengi seçici.
- **Hair**: Ön/arka katmanlardan oluşan saç modelleri.
- **Hair Col.**: Saç rengi seçici.
- **Face**: Yüz/göz seçenekleri.
- **Clothes**: Üst (Upper) ve alt (Lower) giyim bölümleri. Ayrı bir Dress sekmesi veya katmanı yoktur.
- **Shoes**: Ayakkabılar.
- **Acc.**: Aksesuar paneli şu anda **boş** bırakılmıştır. `accesor/` klasöründe ve `assets.js` manifestinde aksesuar yolları bulunsa da menüde aksesuar butonları oluşturulmamıştır.

Giydirme katman sırası: arka saç → taban bebek → yüz → ön saç → üst → alt → ayakkabı → aksesuar.

### Renk özelleştirme

- Ten ve saç rengi için Paint benzeri renk çarkı (hue + saturation), parlaklık slider'ı ve HEX girişi (3/6 haneli) vardır.
- "Orijinale Dön" ile varsayılan tona dönülebilir.
- Renklendirme, görselin alfa kanalını maske olarak kullanan SVG duotone filtresiyle yapılır (`feColorMatrix` + `feComponentTransfer` + `feFlood` + `feBlend` + `feComposite`); gri tonlama × hedef renk mantığıyla pixel-art dokusu, gölgeler ve konturlar korunur.
- CSS `mask-image` yerine SVG filtresi kullanılmasının nedeni `file://` protokolündeki CORS kısıtıdır.
- **Ten paleti**: Hazır ten tonları ve kullanıcı renkleri; renk ekleme/silme desteklenir ve bebek bazında saklanır.
- **Saç paleti**: Birden fazla renk kutusu saklanabilir; saça aynı anda yalnızca aktif kutunun rengi uygulanır.
- Kıyafetler için arayüzden renk değiştirme özelliği yoktur. `assets.js` içindeki kıyafet renk varyantı alanları ileride kullanılmak üzere boştur.

### Kayıt sistemi

- Bebek adı, cinsiyet, giyilen katmanların görsel yolları, ten/saç rengi ve paletler `doll_dressing_saves` anahtarıyla `localStorage`'a kaydedilir.
- Kıyafet giydirme/çıkarma ve renk değişikliklerinde otomatik kayıt yapılır; üst bardaki **Kaydet** butonu da manuel kayıt sağlar.
- Kayıtlı bebekler **Continue** ekranından geri yüklenebilir veya silinebilir.
- Kayıtlar görsel dosya yollarını saklar; görsel dosyaları taşınırsa/silinirse eski kayıtlar bozulabilir.

### Arayüz

- Kategori butonları üstte sabittir; içerik alanı kendi içinde kaydırılır.
- Oyun alanı sabit **1000×600** ölçüsüne göre tasarlanmıştır; çok küçük ekranlarda sayfa kaydırma gerekebilir.
- AI Fashion Studio, oyun durumunu değiştirmeyen ayrı bir overlay olarak açılır; kapatıldığında bebek/giysi durumu korunur.

## AI Fashion Studio

Stüdyo üst bardaki **✨ AI Fashion Studio** butonuyla açılır. Pencere büyütülebilir, geri yüklenebilir ve `Escape` ile kapatılabilir. Ana bölümler AI Design, Draw Your Own, My Designs ve Studio Settings'tir.

### AI Design — yazılı konsept üretimi

- Yazılı açıklamadan **4 farklı konsept** üretir. Her konseptin başlığı, kategorisi, renkleri, silüeti, yakası, kolları, boyu ve süslemeleri ayrı gösterilir.
- Kategori **Otomatik** veya Clothes, Shoes, Accessories, Hair, Hair Color, Face, Skin olarak seçilebilir.
- Seçili bebeğin adı ve kız/erkek bağlamı önerilere yansıtılır; bu bir kısıtlama değildir. Örneğin erkek bebek için de elbise istenebilir.
- Açıkça istenen renk, kesim, yaka, kol ve boy korunur; serbest özellikler çeşitlendirilir. Ürün türüne özel varyant profilleri, "etek" isteğinin şort olarak veya "bot" isteğinin sandalet olarak üretilmesini engeller.
- Konsept seçme, bireysel konsepti yeniden üretme, yeni set isteme, seçili konsepte ek yönerge verme ve orijinal açıklamayı düzenleme desteklenir.
- Açıklama, üretim geçmişi, tüm konseptler, seçim ve ek yönergeler stüdyo ekranları arasında korunur.
- **Devam et**, seçilen konsepti gelecekteki görsel üretim aşaması için yapılandırılmış veri olarak `doll_studio_ai_prepared` anahtarına yazar. Bu aşamada **görsel üretilmez**.
- AI Design konseptleri My Designs arşivine veya bebeğin gardırobuna otomatik eklenmez.
- Motor tamamen yereldir ve kural tabanlıdır; LLM veya harici API kullanmaz.

Geliştirici köprüsü: `window.DollAIStudio.getPreparedConcept()` hazırlanan veriyi, `window.DollAIStudio.getState()` tüm AI Design durumunu döndürür.

### Draw Your Own — serbest çizim

- **Bebek Üzerine** modunda yalnızca temel bebek (`doll.png` / `boydoll.png`) referans olarak gösterilir; mevcut giyilmiş kıyafet katmanları çizim referansına dahil edilmez. Bebek katmanı görünürlüğü kapatılabilir.
- **Boş Tuval** modunda referans bebek gizlenir.
- Çizim tuvali **800×800** boyutundadır. Tuval üzerindeki çizim katmanı şeffaf PNG olarak dışa aktarılır; referans bebek dışa aktarıma dahil edilmez.
- Araçlar: kurşun kalem, ince uçlu kalem, işaretleyici, sulu boya, boya fırçası, airbrush, boya kovası, damlalık, silgi ve tuvali taşıma (hand).
- Her araç için boyut, opaklık ve (destekliyorsa) yumuşaklık ayarı vardır.
- Alt palet hazır renkler ve kullanıcı renklerini içerir; özel renkler `doll_studio_custom_colors` anahtarında saklanır ve tek tek silinebilir. Renk seçicide renk çarkı, parlaklık ve HEX girişi de vardır.
- Zoom %50–%250 aralığındadır; hand aracıyla tuval kaydırılabilir. Zoom sıfırlanabilir.
- Geri al / yinele (25 adımlık snapshot geçmişi) ve tuvali temizleme vardır; temizleme geri alınabilir.
- Çizimler 600 ms gecikmeyle otomatik taslak olarak `doll_studio_draft` anahtarına kaydedilir. Stüdyo açıldığında yarım kalan taslak "Devam et" / "Yeni çizim" seçenekleriyle sunulur.
- Sayfadan çizim kaydedilmeden ayrılmaya çalışılırsa tarayıcı uyarısı gösterilir.

**Create with AI** butonu, çizimi AI dönüşümü için hazırlar ve önizleme ekranını açar. Bu ekranda yapay zekâ dönüşümünün bu sürümde **aktif olmadığı** açıkça belirtilir; kullanıcı yalnızca orijinal çizimi kayıt akışına gönderebilir.

### Kaydetme ve My Designs

- **Save Drawing** akışında çizim önizlenir, tasarım adı girilir ve zorunlu olarak bir kategori seçilir.
- Kayıt, 800×800 şeffaf PNG data URL'i, kategori, mod, bebek yerleşimi ve tarih bilgisiyle `doll_studio_designs` anahtarına yazılır.
- **Bu bebeğe ata** seçeneği yalnızca `addedToWardrobe` / `wardrobeTarget` metadata'sını kaydeder. Çizim gerçekten gardıroba eklenmez, bebeğe giydirilmez ve sonraki oturumda kullanılabilir bir kıyafet olmaz.
- **My Designs** kaydedilen çizimlerin ortak arşividir: başlık, kategori, varsa "bebeğe atandı" etiketi ve silme butonu gösterilir. Arşiv en fazla 24 tasarım tutar; depolama dolarsa 8'e düşürülmeye çalışılır.
- My Designs'ta tasarımı yeniden açma, düzenleme veya bebeğe uygulama özelliği yoktur. AI Design konseptleri de bu arşivde yer almaz.

### Studio Settings

Studio Settings şu anda yalnızca bir yer tutucudur. Ekranda "Ayarlar bir sonraki adımda eklenecek" notu bulunur; bu sürümde değiştirilebilir bir stüdyo ayarı yoktur.

## Yeni Kıyafet/İçerik Ekleme

Kullanıcılar oyun arayüzünden **kıyafet yükleyemez**. Yeni kıyafet eklemek geliştirici tarafında dosya ve HTML düzenlemesi gerektirir.

### Görsel kuralları

- Kıyafet ve ayakkabı için bebeğe giydirilen asıl görsel **320×700** şeffaf PNG olmalı ve taban bebekle aynı tuvale hizalı çizilmelidir. Aksesuar görselleri farklı boyutlarda olabilir; eklenecekse ayrıca hizalanmalıdır.
- Menüde kullanılan `*-removebg-preview.png` görselleri yalnızca önizlemedir; boyutları/kırpımları farklı olabilir ve **bebeğe giydirilmez**.
- Kız ve erkek bebekler farklı taban silüetlerine sahiptir. Aynı kıyafet iki cinsiyette kullanılacaksa her cinsiyet için ayrı, doğru hizalanmış 320×700 görsel gerekir; otomatik hizalama/fitting yoktur.
- Erkek ürünleri `boy-item` sınıfını kullanır ve erkek menüsünde gösterilir.

### Üst ve alt giyim

- Üst parçalar `Clothes → Upper` (`.upper`), alt parçalar `Clothes → Lower` (`.lower`) bölümüne eklenir.
- Tişört gibi alt katmana giren üst parçalarda `data-position="under"` kullanılır; z-index buna göre ayarlanır.
- Ayrı bir Dress paneli, sekmesi veya katmanı yoktur.

### Tam vücut ve ceket/mont davranışı

- Elbise/abiye/tulum gibi tam vücut parçaları da `Upper` içine eklenir.
- `data-covers-lower="true"` (veya `data-garment-kind="dress"` / `gown` / `fullbody` / `tulum` / `jumpsuit`) giyildiğinde alt giyim katmanı ve alt giyim seçimi temizlenir.
- Ceket ve mont gibi üst parçalarda bu işaretler kullanılmaz; böylece alt giyim korunur ve ceket/mont alt giyimle birlikte kullanılabilir.
- `assets.js` bir asset manifestidir; menü öğelerini otomatik üretmez. Yeni bir kıyafetin gardıropta görünmesi için `index.html` içine buton eklenmesi gerekir.

### Aksesuar

- `accesor/` klasöründe aksesuar görselleri vardır ve `assets.js` içinde bazı yollar listelenir; ancak `index.html` içindeki `#accessory` paneli boştur. Bu nedenle aksesuarlar şu anda oyun arayüzünden kullanılamaz.
- Manuel aksesuar butonu eklenirse mevcut katman mantığı `layer-accessory` üzerinden çalışır; aksesuarın türüne göre ayrı hizalama ve gerekirse ayrı cinsiyet görselleri gerekir.

## Dosya Yapısı

```text
doll/
├── .gitignore                 # env, node_modules ve phase2/output kuralları
├── index.html                 # Oyun ve AI Studio arayüzü
├── style.css                  # Tüm stiller
├── script.js                  # Oyun, AI Design, Draw ve kayıt mantığı
├── assets.js                  # Asset manifesti ve renk varsayılanları
├── doll.png                   # Kız bebek tabanı (320×700)
├── boydoll.png                # Erkek bebek tabanı (320×700)
├── clothes/                   # Üst/alt giyim ve önizlemeleri
├── shoes/                     # Ayakkabılar
├── hair/                      # Saç ön/arka katmanları
├── face/                      # Yüz seçenekleri
├── accesor/                   # Aksesuar görselleri
├── phase0/                    # Kalibrasyon profilleri, şema, test seti
├── phase1/                    # API skeleton dokümantasyonu/testleri
├── phase2/                    # Provider pilot harness'ı, mock runner, report
├── api/
│   └── generate.js            # Vercel serverless endpoint iskeleti
└── server/
    ├── phase1/                # API validation, beta gate, adapter iskeletleri
    └── phase2/                # Pilot runner, report, provider adapters
```

`phase2/output/` çalıştırma çıktıları içindir ve git tarafından izlenmez.

## Yerel Depolama Anahtarları

- `doll_dressing_saves` — kayıtlı bebekler, katmanlar, ten/saç renkleri ve paletler.
- `doll_studio_designs` — My Designs çizim arşivi.
- `doll_studio_draft` — Draw Your Own otomatik taslağı.
- `doll_studio_ai_pending` — AI dönüşümü için hazırlanan çizim.
- `doll_studio_ai_state` — AI Design açıklaması, geçmiş, konseptler, seçim ve yönergeler.
- `doll_studio_ai_prepared` — görsel aşaması için hazırlanan seçili konsept.
- `doll_studio_custom_colors` — Draw özel renkleri.

## Gizli Bilgiler ve Ortam Değişkenleri

- Oyun ve stüdyo client kodu (`index.html`, `style.css`, `assets.js`, `script.js`) API anahtarı okumaz.
- Provider anahtarları yalnızca server-side ortam değişkeni adları olarak geçer: `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`, `STABILITY_API_KEY`. Şu anda hiçbiri yapılandırılmamıştır ve gerçek provider çağrısı yapılmamıştır.
- Phase 1 API ayarları: `PHASE1_GENERATION_ENABLED`, `PHASE1_DRY_RUN`, `PHASE1_PROVIDER`, `PHASE1_BETA_GATE_ENABLED`, `PHASE1_BETA_TOKEN`, `PHASE1_MAX_BODY_BYTES`, `PHASE1_JOB_TTL_SECONDS`, `PHASE1_LOG_LEVEL`. `PHASE1_BETA_TOKEN` yalnızca server-side'dır.
- Phase 2 pilot/CLI ayarları: `PHASE2_PILOT_CONFIRM_COST`, `PHASE2_PRICE_PER_IMAGE_USD`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_SIZE`, `OPENAI_IMAGE_QUALITY`, `REPLICATE_MODEL`, `REPLICATE_VERSION`, `REPLICATE_SKETCH_INPUT_KEY`, `REPLICATE_INPUT_JSON`, `REPLICATE_POLL_ATTEMPTS`, `REPLICATE_POLL_INTERVAL_MS`.
- Repoda `.env`/`.env.local` dosyası ve gerçek API anahtarı değeri yoktur. Kök `.gitignore` dosyası `.env`, `.env.*`, `!.env.example`, `node_modules/` ve `phase2/output/` kurallarını içerir; `phase2/.gitignore` da ayrıca mevcuttur.
- Vercel'de değerler Environment Variables üzerinden verilmelidir. `NEXT_PUBLIC_`, `VITE_` veya benzeri public prefix'ler kullanılmamalıdır.

## Phase 0, Phase 1 ve Phase 2

### Phase 0 — Kalibrasyon ve sözleşmeler

Tamamlandı; ancak kalibrasyon değerleri **görsel sign-off bekleyen taslak** durumundadır.

- `phase0/fit-profiles.girl.json` ve `phase0/fit-profiles.boy.json`: 320×700 tuval üzerinde ölçülmüş landmark'lar, slot/subtype hedef ve güvenli kutuları; `status: "draft-needs-visual-signoff"`.
- `phase0/asset-contract.schema.json`: master garment, girl/boy fitted asset, preview, thumbnail, fit profile, generation result/job ve design record şeması.
- `phase0/test-set.json`: 13 mevcut Upper/Lower kıyafet ve 5 gelecekte üretilecek case.
- `phase0/calibrate.html`: geliştirme amaçlı overlay görüntüleyici.
- `phase0/analyze_assets.py`: boyut/alfa/geometri doğrulaması ve overlay üretimi.
- `phase0/calibration-overlay-girl.png`, `phase0/calibration-overlay-boy.png`.

Bu fazda hiçbir canlı oyun davranışı değiştirilmedi.

### Phase 1 — Backend skeleton ve private beta gate

Tamamlandı; gerçek üretim **kapalı**.

- `api/generate.js`: `POST /api/generate` Vercel Function iskeleti.
- `server/phase1/`: request validation, structured errors, body limitleri, beta gate, redakte edilmiş logging, job envelope ve provider adapter iskeletleri.
- `phase1/local-server.cjs`: geliştirme amaçlı yerel HTTP wrapper.
- `phase1/tests/generate.test.cjs`: API testleri.
- Varsayılanlar: `PHASE1_GENERATION_ENABLED=false`, `PHASE1_DRY_RUN=true`, `PHASE1_PROVIDER=none`, beta gate kapalı.
- Endpoint oyuna bağlı değildir; AI Studio veya Draw tarafından çağrılmaz.
- Provider adapter'ları (OpenAI/Replicate/Stability) Phase 1'de yer tutucudur; gerçek API çağrısı yapılmaz.

### Phase 2 — Provider pilot harness

Hazırlandı; gerçek provider pilotu **çalıştırılmadı**.

- `phase2/pilot-cases.json`: 5 konsept case'i (`dress`, `gown`, `coat`, `oversized top`, `wide-leg pants`) ve 2 sketch case'i.
- `phase2/pilot-runner.cjs`: varsayılan olarak mock/dry-run; API anahtarı gerektirmez, ağ çağrısı yapmaz.
- `server/phase2/providers/`: mock, OpenAI ve Replicate adapter'ları; Stability ileride eklenmek üzere rezerve.
- `phase2/evaluation-report.schema.json`: garment-only uyum, şeffaflık/kenar, stil, sketch sadakati, silüet, fitting uygunluğu, latency ve tahmini maliyet alanları.
- `phase2/make_sketch_fixtures.py`: iki sentetik 800×800 sketch fixture'ı üretir. Bunlar gerçek Draw export'ları değildir; gerçek pilot öncesi değiştirilmelidir.
- `phase2/analyze_outputs.py`: gerçek çıktılar için PNG/alfa ölçümleri.
- `phase2/output/` altında üretilen raporlar **simulated** olarak işaretlenir; kalite skorları `null` kalır.
- `phase2/tests/pilot.test.cjs`: mock modun ağ çağrısı yapmadığını, gerçek modun anahtar/ücret onayı olmadan engellendiğini ve rapor alanlarını doğrulayan testler.

Mock pilot çalıştırma (API anahtarı gerektirmez, ağ çağrısı yapmaz):

```bash
node phase2/pilot-runner.cjs
```

Gerçek pilot için provider/model, bütçe onayı ve server-side anahtarlar gerekir. Şu anda hiçbir sağlayıcı seçilmedi, hiçbir gerçek kalite sonucu yok ve hiçbir provider "geçti" kabul edilmedi.

## Backend/API Durumu

- `api/generate.js` ve `server/` altyapısı gelecekteki görsel üretim için hazırlanmıştır; mevcut oyun bu endpoint'i kullanmaz.
- Hazırlanan görsel hattı yalnızca **Clothes → Upper/Lower** kapsamındadır; Shoes, Accessories ve diğer kategoriler kapsam dışıdır.
- Generation varsayılan olarak kapalıdır; endpoint açılsa bile dry-run modu varsayılandır.
- Beta gate opsiyoneldir; production'da generation açıkken gate zorunlu tutulur.
- Gerçek provider anahtarı eklenmemiş, provider API çağrısı yapılmamış ve ücretli servis/Blob/KV/database kurulmamıştır.
- Phase 2 adapters ve pilot runner ayrı bir geliştirme hattıdır; canlı oyuna bağlı değildir.
- Gerçek bir görsel üretim servisi çalıştırılacaksa statik `file://` yeterli olmaz; Vercel/Node serverless ortamı ve server-side anahtarlar gerekir.

## AI Görsel Üretimi Neden Durduruldu?

- Gerçek kıyafet görseli üretmek OpenAI, Replicate veya Stability gibi harici API sağlayıcıları gerektirir.
- Her üretim ve yeniden üretim ücret oluşturabilir; görsel başına maliyet model/kaliteye göre değişir.
- Proje kişisel ve eğlence amaçlı geliştirildiği için API maliyeti ödenmemesine karar verildi.
- Bu nedenle gerçek AI görsel üretimi, otomatik kıyafet giydirme/fitting ve gardırop entegrasyonu tamamlanmadı.
- AI Fashion Studio silinmedi: AI Design yazılı konsept motoru, Draw Your Own, kayıt akışı ve My Designs arşivi mevcut haliyle korunuyor.
- Phase 1 ve Phase 2'de hiçbir AI görsel üretim sağlayıcısına API çağrısı yapılmadı; mock/test sistemleri gerçek AI üretimi değildir.

## Tamamlanan, Kısmen Tamamlanan ve Gelecek İşler

### Tamamlanan

- Başlangıç ekranı, yeni bebek, Continue ve kayıtlı bebek silme.
- Kız/erkek bebek seçimi ve cinsiyete göre menü filtreleme.
- Skin, Hair, Hair Col., Face, Clothes, Shoes kategorileri; Upper/Lower giydirme.
- Ten/saç rengi, renk çarkı, HEX, parlaklık, paletler ve orijinal renge dönme.
- Kıyafet giydirme/çıkarma, `data-position="under"`, tam vücut giysilerin alt giyimi kaldırması.
- Otomatik ve manuel bebek kaydı; Continue ile geri yükleme.
- AI Fashion Studio overlay'i, AI Design yerel konsept motoru ve hazırlık verisi.
- Draw Your Own: çizim modları, 10 araç, renk paleti/özel renkler, zoom/pan, undo/redo, taslak ve şeffaf PNG kaydı.
- My Designs çizim arşivi ve silme.
- Phase 0 kalibrasyon artefaktları; Phase 1 API skeleton; Phase 2 mock pilot harness'ı.

### Kısmen tamamlanan

- AI Design: yazılı konsept üretimi çalışır; gerçek görsel üretimi yoktur.
- Draw **Create with AI**: yalnızca eskiz hazırlama/önizleme vardır; AI dönüşümü yoktur.
- My Designs: çizim kaydı ve arşiv vardır; "bebeğe ata" yalnızca metadata'dır, gardıroba giydirme yoktur.
- Acc. paneli: görseller/manifest hazırlığı var, arayüz butonları yok.
- Phase 0 profilleri: ölçümler var, görsel sign-off yok; `draft-needs-visual-signoff`.
- Phase 2: harness/adapters/mock raporu var; gerçek provider pilotu yok.
- Studio Settings: yalnızca yer tutucu.

### Geleceğe bırakılan

- Provider seçimi, gerçek görsel üretim pilotu ve maliyet/kalite değerlendirmesi.
- Tek master görselden kız/erkek fitted varyant üretimi; çift cinsiyet önizleme ve kabul akışı.
- Şeffaflık temizleme, mesh/affine fitting ve 320×700 worn asset üretimi.
- Dinamik gardırop kaydı; AI tasarımlarının bebeğe giydirilmesi.
- Kullanıcı arayüzünden kıyafet yükleme ve otomatik hizalama.
- Studio Settings'in gerçek ayarları.
- Aksesuar panelinin doldurulması ve kıyafet renk varyantları.
- Durable job/kuyruk, quota/rate limit ve public kullanım altyapısı.

## Bilinen Sınırlamalar

- Kıyafetler otomatik hizalanmaz; her görsel 320×700 tuvale elle hizalanmalıdır.
- Kız ve erkek bebek için ayrı kıyafet görselleri gerekir.
- Aksesuar kategorisi arayüzde boştur.
- Kıyafet renk özelleştirmesi yoktur.
- AI Design yalnızca yazılı konsept üretir; görsel üretmez.
- My Designs tasarımları oyunda kullanılamaz; yalnızca arşivdir.
- `localStorage` kapasitesi ve tarayıcıya bağlı veri saklama geçerlidir.
- Sabit 1000×600 oyun alanı küçük ekranlarda kaydırma gerektirebilir.

## Lisans

Bu proje kişisel ve eğlence amaçlı geliştirilmiştir.
