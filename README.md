# Doll Dressing Game

Kız ve erkek bebekleri giydirip ten ve saç renklerini özelleştirebileceğiniz, tarayıcıda çalışan bir giydirme oyunu.

Saf HTML, CSS ve JavaScript ile yazılmıştır. Framework, build aracı veya bağımlılık yoktur.

## Nasıl Çalıştırılır

`index.html` dosyasını bir tarayıcıda açmanız yeterlidir.

```
index.html dosyasına çift tıkla
```

> **Not:** Proje `file://` üzerinden çalışacak şekilde tasarlandı. Local server gerekmez.

## Özellikler

- **Başlangıç ekranı**
  - Yeni bebek oluşturma (isim + cinsiyet)
  - Kayıtlı bebeklere devam etme
  - Kayıtlı bebeği silme

- **Cinsiyet desteği**
  - Kız bebek: `doll.png`
  - Erkek bebek: `boydoll.png`
  - Menüdeki kıyafet, ayakkabı, saç ve yüz seçenekleri seçilen cinsiyete göre filtrelenir.

- **Giydirme kategorileri**
  - Skin
  - Hair
  - Hair Col.
  - Face
  - Clothes
  - Shoes
  - Acc.

- **Renk özelleştirme**
  - Paint benzeri renk çarkı (hue + saturation)
  - Parlaklık slider'ı
  - HEX renk girişi (3/6 haneli)
  - "Orijinale Dön"
  - Pixel-art dokusunu, gölgeleri ve konturları koruyan renklendirme (SVG duotone filtresi)

- **Renk paletleri**
  - Hazır ten tonları ve kullanıcı paletleri
  - Ten paleti: renk ekleme / silme, bebek bazında saklanır
  - Saç paleti: birden fazla renk kutusu, her kutu bağımsız saklanır; saça aynı anda yalnızca aktif kutunun rengi uygulanır

- **Kayıt sistemi**
  - Bebek adı, cinsiyet, giyilen katmanlar, ten/saç rengi ve paletler `localStorage`'a kaydedilir.
  - Tarayıcı yenilense de "Continue" ile geri yüklenebilir.

- **Arayüz**
  - Kategori butonları üstte sabit
  - İçerik alanı kendi içinde kaydırılır (sayfa kaymaz)
  - Kaydet ve Giriş Ekranı butonları pembe alanın sağ alt köşesinde

## Klasör Yapısı

```
doll/
├── index.html          # Oyun arayüzü
├── style.css           # Tüm stiller
├── script.js           # Oyun mantığı
├── assets.js           # Varlık (asset) manifesti
├── doll.png            # Kız bebek taban görseli (320x700)
├── boydoll.png         # Erkek bebek taban görseli (320x700)
├── clothes/            # Üst/alt giyim
├── shoes/              # Ayakkabılar
├── hair/               # Saçlar (ön/arka katmanlar)
├── face/               # Yüzler (göz/kaş)
└── accesor/            # Aksesuarlar (çanta, gözlük, toka vb.)
```

## Görsel Kuralları

- Bebeğe giydirilen görseller **320x700** tuval boyutundadır ve taban bebekle aynı hizaya çizilmiştir.
- `*-removebg-preview.png` dosyaları **yalnızca menü önizlemesi** için kullanılan büyük/kırpılmış görsellerdir; bebeğe giydirilmez.
- Saçlar ön (`önsaçN.png`) ve gerektiğinde arka (`arkasaçN.png`) katman olarak giydirilir.
- Erkek varlıkları `boy...` önekini kullanır (ör. `boygömlek1.png`, `boyayakkabı2.png`, `boyyüz3.png`).

## Yeni İçerik Ekleme

### Kıyafet / ayakkabı
`index.html` içinde ilgili bölüme bir buton ekleyin:

```html
<button class="opt-btn" data-item="clothes/yeni-parca.png"
        style="background-color: rgb(215, 254, 252);">
    <img src="clothes/yeni-parca-removebg-preview.png"
         style="height: 60px; width: 60px;">
</button>
```

- `data-item`: bebeğe giydirilecek asıl (320x700) görsel
- `img src`: menüde görünecek büyük/kırpılmış görsel
- Erkek ürünleri için butona ayrıca `boy-item` sınıfını ekleyin.
- Üst giyimde tişört gibi alt katmanlar için `data-position="under"` kullanılır.

### Saç
```html
<button class="opt-btn" data-front="hair/yeni-ön.png"
        data-back="hair/yeni-arka.png"
        style="background-color: rgb(215, 254, 252);">
    <img src="hair/yeni-ön.png" style="height: 60px; width: 60px;">
</button>
```

- Yalnızca ön katman varsa `data-back` eklenmez.
- Erkek saçları için `boy-item` sınıfı eklenir.

### Yüz
```html
<button class="opt-btn" data-item="face/yüzN.png" style="background-color: rgb(215, 254, 252);">
    <img src="face/yüzN-removebg-preview.png" style="height: 60px; width: 60px;">
</button>
```

## Teknik Notlar

- **Kayıt anahtarı:** `doll_dressing_saves` (`localStorage`)
- **Renklendirme:** Görselin alfa kanalını maske olarak kullanan inline SVG `feColorMatrix` + `feComponentTransfer` + `feFlood` + `feBlend` + `feComposite` zinciri. Gri tonlama × hedef renk (multiply) mantığıyla gölge ve konturlar korunur.
- **`file://` uyumluluğu:** CSS `mask-image` dosya protokolünde CORS nedeniyle engellendiği için renklendirme SVG filtresiyle yapılır.
- **Cinsiyet filtresi:** `.menu.gender-boy` sınıfı ile `boy-item` olmayan öğeler gizlenir.
- **Paletler:** Ten paleti `skinPalette`, saç kutusu renkleri `hairColors` ve aktif indeks `hairActiveIndex` olarak bebek kaydında saklanır.

## Bilinen Sınırlamalar

- Tasarım sabit **1000x600** oyun alanına göre yapılmıştır; çok küçük ekranlarda sayfa kaydırma gerekebilir.
- Saç görselleri bölge maskesi içermediği için bir saça aynı anda tek renk uygulanır. İleride bölge maskeli saç görselleri eklenirse `applyHairColor()` fonksiyonu genişletilebilir.
- Erkek bebek için aksesuar ve bazı kategoriler henüz boş olabilir.

## Lisans

Bu proje kişisel kullanım için geliştirilmiştir.
