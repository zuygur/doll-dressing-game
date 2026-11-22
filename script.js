// ============================================================
// TEMEL DOM REFERANSLARI
// ============================================================
const menu = document.getElementById("menu");

const baseDoll = document.getElementById("base-doll");
const hairFrontLayer = document.getElementById("layer-hair-front");
const hairBackLayer = document.getElementById("layer-hair-back");

const wrapBaseDoll = document.getElementById("wrap-base-doll");
const wrapHairFront = document.getElementById("wrap-hair-front");
const wrapHairBack = document.getElementById("wrap-hair-back");

const ASSET_MANIFEST = (typeof DOLL_ASSETS !== "undefined") ? DOLL_ASSETS : null;
const COLOR_DEFAULTS = Object.assign(
    { skin: "#fcddc1", hair: "#5d3c29", skinBoost: 1, hairBoost: 3 },
    (ASSET_MANIFEST && ASSET_MANIFEST.colorDefaults) || {}
);

// Hazır ten renkleri (yalnızca Skin sekmesinde gösterilir).
// Bunlar sabit tanımlardır; çarktan özel renk seçimi bu listeyi değiştirmez.
const SKIN_PRESETS = [
    { name: "Açık porselen", hex: "#ffe0cf" },
    { name: "Açık şeftali", hex: "#f7cdaa" },
    { name: "Doğal bej", hex: "#e8b98f" },
    { name: "Sıcak buğday", hex: "#d99a63" },
    { name: "Bronz", hex: "#b06f3f" },
    { name: "Karamel", hex: "#8d5524" },
    { name: "Koyu kahve", hex: "#5c3317" },
    { name: "Derin koyu kahve", hex: "#3a2110" }
];

// Renk seçici örnekleri (kapasite yenileme için dışarıdan erişilir).
let skinPicker = null;
let hairPicker = null;

// Varsayılan ten paleti (yeni bebeklerde kullanılır).
const SKIN_DEFAULT_PALETTE = SKIN_PRESETS.map(function (p) { return p.hex; });

// Aktif bebek bilgisi
const currentDoll = {
    name: "Bebeğim",
    gender: "girl"
};

// Cinsiyete göre temel bebek görseli
const GENDER_BASE_IMAGES = {
    girl: "doll.png",
    boy: "boydoll.png"
};

// Taban görsel yüklenemezse bebeğin kaybolmaması için cinsiyet görseline dön.
if (baseDoll) {
    baseDoll.addEventListener("error", function () {
        const fallback = GENDER_BASE_IMAGES[currentDoll.gender] || GENDER_BASE_IMAGES.girl;
        if (baseDoll.getAttribute("src") !== fallback) {
            baseDoll.setAttribute("src", fallback);
        }
    });
}

// Renk özelleştirmeleri.
// skinColor: null = orijinal ten; hairColor: saça uygulanan TEK renk.
// (Paletteki kutular ayrı saklanır; yalnızca aktif kutunun rengi uygulanır.)
const customization = {
    skinColor: null,
    hairColor: null
};

// ============================================================
// RENK DÖNÜŞÜM YARDIMCILARI (HSV / RGB / HEX)
// ============================================================
function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

function hsvToRgb(h, s, v) {
    s /= 100;
    v /= 100;
    const c = v * s;
    const hp = ((h % 360) + 360) % 360 / 60;
    const x = c * (1 - Math.abs(hp % 2 - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    const m = v - c;
    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255)
    ];
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
    }
    h = (h + 360) % 360;
    const s = max === 0 ? 0 : (d / max) * 100;
    return { h, s, v: max * 100 };
}

function rgbToHex(r, g, b) {
    return "#" + [r, g, b]
        .map(n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0"))
        .join("");
}

function hsvToHex(h, s, v) {
    const [r, g, b] = hsvToRgb(h, s, v);
    return rgbToHex(r, g, b);
}

function parseHex(value) {
    if (typeof value !== "string") return null;
    let m = value.trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(m)) {
        m = m.split("").map(c => c + c).join("");
    }
    if (!/^[0-9a-f]{6}$/i.test(m)) return null;
    return {
        r: parseInt(m.slice(0, 2), 16),
        g: parseInt(m.slice(2, 4), 16),
        b: parseInt(m.slice(4, 6), 16)
    };
}

function hexToHsv(hex) {
    const rgb = parseHex(hex);
    return rgb ? rgbToHsv(rgb.r, rgb.g, rgb.b) : null;
}

function normalizeHex(value) {
    const rgb = parseHex(value);
    return rgb ? rgbToHex(rgb.r, rgb.g, rgb.b) : null;
}

// ============================================================
// PER-PIXEL RENKLENDİRME (inline SVG duotone filtresi)
// ============================================================
// Görselin kendi alfa kanalı maske görevi görür. Akış:
//   grayscale -> parlaklık artır (slope=boost) -> hedef renkle multiply
//   -> kaynak alfasıyla kırp.
// Böylece shading, highlight ve siyah outline korunur; sadece hedef
// katman (ten / saç) renklenir. file:// altında CORS gerektirmez.
const SVG_NS = "http://www.w3.org/2000/svg";
const duotoneFloods = {};
let filterRoot = null;

// Tüm filtreler tek bir gizli SVG içinde tutulur.
function getFilterRoot() {
    if (!filterRoot) {
        filterRoot = document.createElementNS(SVG_NS, "svg");
        filterRoot.setAttribute("width", "0");
        filterRoot.setAttribute("height", "0");
        filterRoot.setAttribute("aria-hidden", "true");
        filterRoot.style.position = "absolute";
        filterRoot.style.width = "0";
        filterRoot.style.height = "0";
        filterRoot.style.overflow = "hidden";
        document.body.appendChild(filterRoot);
    }
    return filterRoot;
}

function createDuotoneFilter(id, boost) {
    const filter = document.createElementNS(SVG_NS, "filter");
    filter.setAttribute("id", id);
    filter.setAttribute("color-interpolation-filters", "sRGB");

    const grayscale = document.createElementNS(SVG_NS, "feColorMatrix");
    grayscale.setAttribute("type", "saturate");
    grayscale.setAttribute("values", "0");
    grayscale.setAttribute("in", "SourceGraphic");
    grayscale.setAttribute("result", "gray");

    const transfer = document.createElementNS(SVG_NS, "feComponentTransfer");
    transfer.setAttribute("in", "gray");
    transfer.setAttribute("result", "boosted");
    ["R", "G", "B"].forEach(function (channel) {
        const func = document.createElementNS(SVG_NS, "feFunc" + channel);
        func.setAttribute("type", "linear");
        func.setAttribute("slope", String(boost));
        func.setAttribute("intercept", "0");
        transfer.appendChild(func);
    });

    const flood = document.createElementNS(SVG_NS, "feFlood");
    flood.setAttribute("flood-color", "#808080");
    flood.setAttribute("result", "tint");

    const blend = document.createElementNS(SVG_NS, "feBlend");
    blend.setAttribute("in", "boosted");
    blend.setAttribute("in2", "tint");
    blend.setAttribute("mode", "multiply");
    blend.setAttribute("result", "tintedColor");

    // Flood opak olduğu için alfa 1 olur; kaynak alfasıyla kırpıyoruz.
    const mask = document.createElementNS(SVG_NS, "feComposite");
    mask.setAttribute("in", "tintedColor");
    mask.setAttribute("in2", "SourceAlpha");
    mask.setAttribute("operator", "in");
    mask.setAttribute("result", "final");

    filter.append(grayscale, transfer, flood, blend, mask);
    getFilterRoot().appendChild(filter);

    duotoneFloods[id] = flood;
    return filter;
}

createDuotoneFilter("doll-duotone-skin", COLOR_DEFAULTS.skinBoost);
// Saç için tek renk filtresi: aynı anda yalnızca tek renk uygulanır.
createDuotoneFilter("doll-duotone-hair", COLOR_DEFAULTS.hairBoost);

// Ten katmanını hedef renkle renklendirir. hex === null ise orijinal görsel geri gelir.
function setSkinTint(hex) {
    if (!wrapBaseDoll) return;

    wrapBaseDoll.classList.remove("tinted-skin");
    if (!hex) return;

    const flood = duotoneFloods["doll-duotone-skin"];
    if (flood) flood.setAttribute("flood-color", hex);
    wrapBaseDoll.classList.add("tinted-skin");
}

function applySkinColor() {
    setSkinTint(customization.skinColor);
}

// Saça AYNI ANDA YALNIZCA TEK renk uygular. Palet yalnızca renkleri saklar;
// uygulama buradan bağımsızdır. Orijinal renk seçiliyse tint kaldırılır.
// (İleride bölge maskeli saç görselleri eklenirse yalnızca bu fonksiyon
//  genişletilmelidir; palet/kayıt yapısı aynı kalır.)
function applyHairColor() {
    const hex = customization.hairColor;
    const isOriginal = !hex || hex.toLowerCase() === COLOR_DEFAULTS.hair.toLowerCase();

    [wrapHairFront, wrapHairBack].forEach(function (wrapper) {
        if (wrapper) wrapper.classList.remove("tinted-hair");
    });

    if (isOriginal) return;

    const flood = duotoneFloods["doll-duotone-hair"];
    if (flood) flood.setAttribute("flood-color", hex);
    if (wrapHairFront) wrapHairFront.classList.add("tinted-hair");
    if (wrapHairBack) wrapHairBack.classList.add("tinted-hair");
}

// Yeni bebek oluşturulurken giyili her şeyi ve renkleri sıfırlar.
function resetDollAppearance() {
    ["layer-hair-back", "layer-face", "layer-hair-front", "layer-upper",
        "layer-lower", "layer-shoes", "layer-accessory"].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.removeAttribute("src");
    });

    const layerUpper = document.getElementById("layer-upper");
    const layerLower = document.getElementById("layer-lower");
    if (layerUpper) layerUpper.style.zIndex = "";
    if (layerLower) layerLower.style.zIndex = "";

    document.querySelectorAll(".opt-btn-act").forEach(function (btn) {
        btn.classList.remove("opt-btn-act");
    });

    // Her yeni bebek kendi renk paletiyle başlar: önceki bebeğin eklediği
    // kutular taşınmaz; yalnızca varsayılan/orijinal renkler kalır.
    customization.skinColor = null;
    customization.hairColor = null;

    if (skinPicker) {
        skinPicker.setPalette(SKIN_DEFAULT_PALETTE, true);
        skinPicker.reset(true);
    }
    if (hairPicker) {
        hairPicker.setColors([COLOR_DEFAULTS.hair], true);
        hairPicker.reset(true);
    }

    applySkinColor();
    applyHairColor();
}

// ============================================================
// MENÜ SEKMELERİ
// ============================================================
const categoryButtons = document.querySelectorAll(".categ-btn");
const optionPanels = document.querySelectorAll(".opt");

function showMenuTab(targetId) {
    optionPanels.forEach(function (box) {
        box.style.display = "none";
    });
    categoryButtons.forEach(function (b) {
        b.classList.remove("categ-btn-act");
    });
    const targetBtn = Array.from(categoryButtons).find(function (b) {
        return b.getAttribute("target") === targetId;
    });
    if (targetBtn) targetBtn.classList.add("categ-btn-act");
    const targetBox = document.getElementById(targetId);
    if (targetBox) targetBox.style.display = "flex";

    // Skin sekmesi görünür olduğunda palet kapasitesini yeniden ölç.
    if (targetId === "skin" && skinPicker) {
        skinPicker.refreshCapacity();
    }
}

categoryButtons.forEach(function (button) {
    button.addEventListener("click", function () {
        showMenuTab(button.getAttribute("target"));
    });
});

// ============================================================
// ENTEGRE GİYDİRME, ÇIKARMA VE KATMAN YÖNETİMİ
// ============================================================
const allOptButtons = document.querySelectorAll(".opt-btn");

// Menüdeki görsel büyük fotoğraf olabilir; bebeğe giydirilecek asıl dosya
// data-item / data-front ile belirtilir.
function getButtonItemSrc(btn) {
    if (btn.hasAttribute("data-item")) return btn.getAttribute("data-item");
    if (btn.hasAttribute("data-front")) return btn.getAttribute("data-front");
    const img = btn.querySelector("img");
    return img ? img.getAttribute("src") : "";
}

// Seçilen cinsiyete göre menü öğelerini göster/gizle.
function applyGenderMenu(gender) {
    if (menu) menu.classList.toggle("gender-boy", gender === "boy");
}

allOptButtons.forEach(btn => {
    btn.addEventListener("click", function () {

        // =========================================================
        // 1. DURUM: TIKLANAN BUTON SAÇ KATEGORİSİNDEYSE
        // =========================================================
        if (this.closest("#hair")) {
            const frontSrc = this.getAttribute('data-front') || this.querySelector("img").getAttribute('src');
            const backSrc = this.getAttribute('data-back'); // Yoksa null döner

            const currentFront = hairFrontLayer.getAttribute('src');

            if (currentFront === frontSrc) {
                // Zaten aynı saç giyiliyse: ÇIKAR!
                hairFrontLayer.removeAttribute('src');
                hairBackLayer.removeAttribute('src');
                this.classList.remove("opt-btn-act");
            } else {
                // Farklı saç seçildiyse: Önce eskisini sil, yenisini GİYDİR!
                hairFrontLayer.setAttribute('src', frontSrc);
                if (backSrc) {
                    hairBackLayer.setAttribute('src', backSrc);
                } else {
                    hairBackLayer.removeAttribute('src');
                }

                // Menüdeki diğer saç butonlarının aktifliğini temizle
                this.parentElement.querySelectorAll(".opt-btn").forEach(b => b.classList.remove("opt-btn-act"));
                this.classList.add("opt-btn-act");
            }

            // Seçilen tek saç rengini yeni saça uygula
            applyHairColor();
            saveCurrentDoll();
            return; // Saç işi bitti, aşağıdaki giysi kodlarının çalışmasını engelle!
        }

        // =========================================================
        // 2. DURUM: DİĞER TÜM KIYAFETLER VE AKSESUARLAR İÇİN
        // =========================================================
        const itemImg = getButtonItemSrc(this);
        let layerId = "";

        if (this.closest("#face")) layerId = "layer-face";
        else if (this.closest(".upper")) layerId = "layer-upper";
        else if (this.closest(".lower")) layerId = "layer-lower";
        else if (this.closest(".dress")) layerId = "layer-upper";
        else if (this.closest("#shoes")) layerId = "layer-shoes";
        else if (this.closest("#accessory")) layerId = "layer-accessory";

        if (layerId) {
            const layer = document.getElementById(layerId);
            const layerLower = document.getElementById("layer-lower");
            const layerUpper = document.getElementById("layer-upper");

            const currentSrc = layer.getAttribute('src');

            // Eğer zaten giyiliyse: ÇI-KAR!
            if (currentSrc === itemImg) {
                layer.removeAttribute('src');
                this.classList.remove("opt-btn-act");
            }
            // Giyili değilse: GİY-DİR!
            else {
                layer.setAttribute('src', itemImg);

                // Elbise/Tulum giyilirse pantolonu otomatik çıkar
                if (this.closest(".dress")) {
                    layerLower.removeAttribute('src');
                    document.querySelectorAll(".lower .opt-btn").forEach(b => b.classList.remove("opt-btn-act"));
                }

                // Üst kıyafetin pantolonun altına girme (z-index) kontrolü
                if (this.closest(".upper")) {
                    const position = this.getAttribute("data-position");
                    if (position === 'under') {
                        layerUpper.style.zIndex = "5";
                        layerLower.style.zIndex = "6"; // Altlık üstte kalır
                    } else {
                        layerUpper.style.zIndex = "6"; // Üstlük üstte kalır (Varsayılan CSS sıralaması)
                        layerLower.style.zIndex = "5";
                    }
                }

                // Menü buton görünümlerini düzenle
                const parentDiv = this.parentElement;
                parentDiv.querySelectorAll(".opt-btn").forEach(b => b.classList.remove("opt-btn-act"));
                this.classList.add("opt-btn-act");
            }

            // Bebeğin güncel halini otomatik kaydet
            saveCurrentDoll();
        }
    });
});

// ============================================================
// GİRİŞ EKRANI, KARAKTER SEÇİMİ VE KAYIT SİSTEMİ (BÖLÜM 1)
// ============================================================

const startScreen = document.getElementById("start-screen");
const startMainView = document.getElementById("start-main-view");
const startNewDollPanel = document.getElementById("start-new-doll-panel");
const startContinuePanel = document.getElementById("start-continue-panel");

const btnStartGame = document.getElementById("btn-start-game");
const btnContinueGame = document.getElementById("btn-continue-game");
const btnCancelNewDoll = document.getElementById("btn-cancel-new-doll");
const btnConfirmNewDoll = document.getElementById("btn-confirm-new-doll");
const btnBackFromContinue = document.getElementById("btn-back-from-continue");
const dollNameInput = document.getElementById("doll-name-input");
const nameErrorMsg = document.getElementById("name-error-msg");
const savedDollsList = document.getElementById("saved-dolls-list");
const currentDollNameDisplay = document.getElementById("current-doll-name-display");
const btnSaveDoll = document.getElementById("btn-save-doll");
const btnHomeScreen = document.getElementById("btn-home-screen");
const saveToast = document.getElementById("save-toast");

// 1. "Start (New Doll)" butonuna basınca yeni bebek paneli açılır
if (btnStartGame) {
    btnStartGame.addEventListener("click", function () {
        startMainView.style.display = "none";
        startNewDollPanel.style.display = "block";
        if (nameErrorMsg) nameErrorMsg.style.display = "none";
        if (dollNameInput) {
            dollNameInput.value = "";
            dollNameInput.style.borderColor = "#66e4f7";
            dollNameInput.focus();
        }
    });
}

// 2. Yeni bebek panelinden "Geri" butonu
if (btnCancelNewDoll) {
    btnCancelNewDoll.addEventListener("click", function () {
        startNewDollPanel.style.display = "none";
        startMainView.style.display = "block";
        if (nameErrorMsg) nameErrorMsg.style.display = "none";
    });
}

// 3. Cinsiyet seçimi (Kız / Erkek)
const genderGirlBtn = document.getElementById("gender-girl");
const genderBoyBtn = document.getElementById("gender-boy");

function selectGender(gender) {
    currentDoll.gender = gender;
    if (genderGirlBtn) genderGirlBtn.classList.toggle("gender-btn-act", gender === "girl");
    if (genderBoyBtn) genderBoyBtn.classList.toggle("gender-btn-act", gender === "boy");
}

if (genderGirlBtn) {
    genderGirlBtn.addEventListener("click", function () {
        selectGender("girl");
    });
}

if (genderBoyBtn) {
    genderBoyBtn.addEventListener("click", function () {
        selectGender("boy");
    });
}

// 4. İsim onaylanıp "İlerle (Ten Rengi)" butonuna basılınca:
if (btnConfirmNewDoll) {
    btnConfirmNewDoll.addEventListener("click", function () {
        const enteredName = dollNameInput ? dollNameInput.value.trim() : "";

        // İsim girilmediyse sonraki sayfaya geçme, kırmızı uyarı göster
        if (!enteredName) {
            if (nameErrorMsg) nameErrorMsg.style.display = "block";
            if (dollNameInput) {
                dollNameInput.style.borderColor = "#e53935";
                dollNameInput.focus();
            }
            return;
        }

        // Geçerli bir isim girildiyse uyarıyı gizle
        if (nameErrorMsg) nameErrorMsg.style.display = "none";
        if (dollNameInput) dollNameInput.style.borderColor = "#66e4f7";

        // Seçili cinsiyeti kesinleştir
        currentDoll.gender = (genderBoyBtn && genderBoyBtn.classList.contains("gender-btn-act"))
            ? "boy"
            : "girl";

        // Yeni bebek: kıyafetleri ve renkleri sıfırla
        resetDollAppearance();
        if (baseDoll) {
            baseDoll.setAttribute("src", GENDER_BASE_IMAGES[currentDoll.gender]);
        }
        applyGenderMenu(currentDoll.gender);

        currentDoll.name = enteredName;
        if (currentDollNameDisplay) {
            currentDollNameDisplay.textContent = currentDoll.name;
        }

        // Giriş ekranını kapat -> giydirme odasına geç (Skin sekmesi açık)
        if (startScreen) {
            startScreen.style.display = "none";
        }
        if (menu) {
            menu.style.display = "flex";
        }
        showMenuTab("skin");

        // Yeni bebeği ilk haliyle kaydet
        saveCurrentDoll();
    });
}

// Kullanıcı bir şey yazmaya başlayınca hata mesajını gizle ve Enter ile geçişi destekle
if (dollNameInput) {
    dollNameInput.addEventListener("input", function () {
        if (dollNameInput.value.trim()) {
            if (nameErrorMsg) nameErrorMsg.style.display = "none";
            dollNameInput.style.borderColor = "#66e4f7";
        }
    });

    dollNameInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            btnConfirmNewDoll.click();
        }
    });
}

// 5. "Continue" butonuna basınca kayıtlı bebekler listesi açılır
if (btnContinueGame) {
    btnContinueGame.addEventListener("click", function () {
        startMainView.style.display = "none";
        startContinuePanel.style.display = "block";
        renderSavedDollsList();
    });
}

// 6. Kayıtlı bebekler listesinden "Geri" butonu
if (btnBackFromContinue) {
    btnBackFromContinue.addEventListener("click", function () {
        startContinuePanel.style.display = "none";
        startMainView.style.display = "block";
    });
}

// 7. Bebeğin güncel halini localStorage'a kaydeden fonksiyon
function saveCurrentDoll() {
    if (!currentDoll.name) return;

    const equippedLayers = {};
    const layerIds = [
        "layer-hair-back",
        "layer-face",
        "layer-hair-front",
        "layer-upper",
        "layer-lower",
        "layer-shoes",
        "layer-accessory"
    ];

    layerIds.forEach(id => {
        const el = document.getElementById(id);
        equippedLayers[id] = el ? el.getAttribute("src") : "";
    });

    const dollData = {
        name: currentDoll.name,
        gender: currentDoll.gender,
        skin: baseDoll ? baseDoll.getAttribute("src") : "doll.png",
        skinColor: customization.skinColor,
        // Palet kutuları bebek bazında saklanır; uygulanan renk ayrı tutulur.
        skinPalette: (typeof skinPicker !== "undefined" && skinPicker) ? skinPicker.getPalette() : [],
        hairColors: (typeof hairPicker !== "undefined" && hairPicker) ? hairPicker.getColors() : [],
        hairActiveIndex: (typeof hairPicker !== "undefined" && hairPicker) ? hairPicker.getActiveIndex() : 0,
        hairColor: customization.hairColor,
        layers: equippedLayers,
        savedAt: new Date().toLocaleDateString("tr-TR")
    };

    try {
        let saves = [];
        const raw = localStorage.getItem("doll_dressing_saves");
        if (raw) saves = JSON.parse(raw);

        // Aynı isimde kayıt varsa güncelle, yoksa başa ekle
        const existingIdx = saves.findIndex(d => d.name === currentDoll.name);
        if (existingIdx >= 0) {
            saves[existingIdx] = dollData;
        } else {
            saves.unshift(dollData);
        }

        localStorage.setItem("doll_dressing_saves", JSON.stringify(saves));
    } catch (err) {
        console.error("Kayıt hatası:", err);
    }
}

// Renk değişimlerinde sık kayıt yapmamak için ufak gecikmeli kayıt
let colorSaveTimer = null;
function scheduleColorSave() {
    if (colorSaveTimer) clearTimeout(colorSaveTimer);
    colorSaveTimer = setTimeout(function () {
        saveCurrentDoll();
    }, 350);
}

// 8. Kayıtlı bebekleri listeleyen fonksiyon
function renderSavedDollsList() {
    if (!savedDollsList) return;
    savedDollsList.replaceChildren();

    let saves = [];
    try {
        const raw = localStorage.getItem("doll_dressing_saves");
        if (raw) saves = JSON.parse(raw);
    } catch (e) {
        saves = [];
    }

    if (!Array.isArray(saves) || saves.length === 0) {
        const emptyMsg = document.createElement("p");
        emptyMsg.style.color = "#777";
        emptyMsg.style.padding = "20px 0";
        emptyMsg.textContent = "Henüz kayıtlı bir bebek bulunmuyor. Yeni bir bebek oluşturmak için 'Start' butonuna basın!";
        savedDollsList.appendChild(emptyMsg);
        return;
    }

    saves.forEach((savedDoll) => {
        const item = document.createElement("div");
        item.className = "saved-doll-item";

        const infoDiv = document.createElement("div");
        infoDiv.style.textAlign = "left";

        const nameSpan = document.createElement("div");
        nameSpan.className = "saved-doll-name";
        nameSpan.textContent = `🎀 ${savedDoll.name}`;

        const dateSpan = document.createElement("div");
        dateSpan.style.fontSize = "12px";
        dateSpan.style.color = "#888";
        dateSpan.textContent = `Kayıt: ${savedDoll.savedAt || "Bugün"}`;

        infoDiv.appendChild(nameSpan);
        infoDiv.appendChild(dateSpan);

        const actionsDiv = document.createElement("div");
        actionsDiv.style.display = "flex";
        actionsDiv.style.gap = "8px";

        const loadBtn = document.createElement("button");
        loadBtn.className = "saved-doll-load-btn";
        loadBtn.textContent = "Continue ▶";
        loadBtn.addEventListener("click", function () {
            loadSavedDoll(savedDoll);
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "saved-doll-delete-btn";
        deleteBtn.textContent = "🗑️ Sil";
        deleteBtn.title = "Bebeği Sil";
        deleteBtn.addEventListener("click", function () {
            if (confirm(`"${savedDoll.name}" isimli bebeği silmek istediğinize emin misiniz?`)) {
                deleteSavedDoll(savedDoll.name);
            }
        });

        actionsDiv.appendChild(loadBtn);
        actionsDiv.appendChild(deleteBtn);

        item.appendChild(infoDiv);
        item.appendChild(actionsDiv);
        savedDollsList.appendChild(item);
    });
}

// Kayıtlı bebeği listeden silen fonksiyon
function deleteSavedDoll(dollName) {
    try {
        let saves = [];
        const raw = localStorage.getItem("doll_dressing_saves");
        if (raw) saves = JSON.parse(raw);
        saves = saves.filter(d => d.name !== dollName);
        localStorage.setItem("doll_dressing_saves", JSON.stringify(saves));
        renderSavedDollsList();
    } catch (err) {
        console.error("Silme hatası:", err);
    }
}

// 9. Kayıtlı bebeği yükleyen fonksiyon
function loadSavedDoll(savedDoll) {
    currentDoll.name = savedDoll.name;
    currentDoll.gender = savedDoll.gender === "boy" ? "boy" : "girl";
    if (currentDollNameDisplay) {
        currentDollNameDisplay.textContent = currentDoll.name;
    }

    // Cinsiyete göre menü ve temel bebek görseli.
    // Kayıtta eski/silinmiş bir görsel yolu olsa bile bebek görünür kalsın:
    // taban görsel her zaman cinsiyetin geçerli dosyasıdır.
    applyGenderMenu(currentDoll.gender);
    if (baseDoll) {
        baseDoll.setAttribute("src", GENDER_BASE_IMAGES[currentDoll.gender]);
    }

    // Kıyafet katmanlarını geri yükle
    if (savedDoll.layers) {
        Object.entries(savedDoll.layers).forEach(([layerId, src]) => {
            const el = document.getElementById(layerId);
            if (el) {
                if (src) el.setAttribute("src", src);
                else el.removeAttribute("src");
            }
        });

        // Menüdeki butonların aktiflik durumunu katmanlara göre senkronize et
        allOptButtons.forEach(btn => {
            const itemImg = getButtonItemSrc(btn);
            const isEquipped = Object.values(savedDoll.layers).includes(itemImg);
            if (isEquipped) {
                btn.classList.add("opt-btn-act");
            } else {
                btn.classList.remove("opt-btn-act");
            }
        });
    }

    // Renk özelleştirmelerini geri yükle
    customization.skinColor = savedDoll.skinColor || null;
    const savedHairColors = (Array.isArray(savedDoll.hairColors) && savedDoll.hairColors.length > 0)
        ? savedDoll.hairColors
        : (savedDoll.hairColor ? [savedDoll.hairColor] : [COLOR_DEFAULTS.hair]);

    applySkinColor();
    if (skinPicker) {
        // Ten paleti bebeğe özel: kayıtlıysa geri yükle, yoksa varsayılan set.
        skinPicker.setPalette(
            (Array.isArray(savedDoll.skinPalette) && savedDoll.skinPalette.length > 0)
                ? savedDoll.skinPalette
                : SKIN_DEFAULT_PALETTE,
            true
        );
        skinPicker.setFromHex(customization.skinColor, true);
    }

    if (hairPicker) {
        hairPicker.setColors(savedHairColors, true);

        let idx = Number.isInteger(savedDoll.hairActiveIndex) ? savedDoll.hairActiveIndex : -1;
        if (idx < 0 && savedDoll.hairColor) {
            idx = savedHairColors.findIndex(function (c) {
                return c.toLowerCase() === String(savedDoll.hairColor).toLowerCase();
            });
        }
        hairPicker.setActiveIndex(idx >= 0 ? idx : 0, true);
        customization.hairColor = hairPicker.getActiveColor();
    } else {
        customization.hairColor = savedHairColors[0] || null;
    }

    applyHairColor();

    // Giriş ekranını kapat ve giydirme odasına geç
    if (startScreen) startScreen.style.display = "none";
    if (menu) menu.style.display = "flex";
    showMenuTab("skin");
}

// ============================================================
// RENK SEÇİCİ BİLEŞENİ (Paint benzeri: çark + parlaklık + HEX)
// ============================================================
function createColorPicker(root, options) {
    if (!root) return null;

    const slotsMode = options.paletteMode === "slots";
    const initialHsv = hexToHsv(options.initialHex) || { h: 0, s: 0, v: 100 };
    const state = {
        h: initialHsv.h,
        s: initialHsv.s,
        v: initialHsv.v,
        active: slotsMode
    };

    root.replaceChildren();

    const picker = document.createElement("div");
    picker.className = "color-picker";

    const wheel = document.createElement("div");
    wheel.className = "cp-wheel";
    wheel.setAttribute("role", "application");
    wheel.setAttribute("aria-label", options.label || "Renk seçici");

    const wheelColor = document.createElement("div");
    wheelColor.className = "cp-wheel-color";
    const wheelDark = document.createElement("div");
    wheelDark.className = "cp-wheel-dark";
    const marker = document.createElement("div");
    marker.className = "cp-wheel-marker";
    wheel.append(wheelColor, wheelDark, marker);

    const controls = document.createElement("div");
    controls.className = "cp-controls";

    const previewRow = document.createElement("div");
    previewRow.className = "cp-preview-row";
    const preview = document.createElement("div");
    preview.className = "cp-preview";
    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.className = "cp-hex";
    hexInput.maxLength = 7;
    hexInput.value = options.initialHex;
    hexInput.setAttribute("aria-label", "HEX renk kodu");
    hexInput.spellcheck = false;
    previewRow.append(preview, hexInput);

    const sliderLabel = document.createElement("label");
    sliderLabel.className = "cp-slider-label";
    sliderLabel.textContent = "Parlaklık";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.className = "cp-brightness";
    sliderLabel.appendChild(slider);

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "cp-reset";
    resetBtn.textContent = "Orijinale Dön";

    controls.append(previewRow, sliderLabel, resetBtn);

    // Üst satır: çark + kontroller. Palet varsa altına yerleşir.
    const topRow = document.createElement("div");
    topRow.className = "cp-top";
    topRow.append(wheel, controls);

    // Palet: presets modu (ten) veya slots modu (saç).
    const paletteEnabled = slotsMode || Array.isArray(options.presets);
    let presetButtons = [];
    let paletteColors = [];
    let paletteCapacity = Infinity;
    let presetsWrap = null;
    let activeIndex = 0;

    if (paletteEnabled) {
        presetsWrap = document.createElement("div");

        if (slotsMode) {
            const initialColors = (Array.isArray(options.initialColors) && options.initialColors.length > 0)
                ? options.initialColors
                : [options.initialHex];
            paletteColors = initialColors.map(normalizeHex).filter(Boolean);
            if (paletteColors.length === 0) {
                paletteColors = [normalizeHex(options.initialHex)];
            }
            activeIndex = 0;
            applyColorToState(paletteColors[0]);

            presetsWrap.className = "cp-slots";
            picker.classList.add("with-slots");
        } else {
            // Palet bebek bazında saklanır; başlangıçta yalnızca varsayılan set.
            paletteColors = options.presets.map(p => normalizeHex(p.hex));

            presetsWrap.className = "cp-presets";
            picker.classList.add("with-palette");
        }

        picker.append(topRow, presetsWrap);
    } else {
        picker.append(topRow);
    }

    root.appendChild(picker);

    if (paletteEnabled) {
        renderPalette();
        if (!slotsMode) {
            // Menü henüz görünmüyorsa ölçüm 0 döner; sekme açıldığında tekrar denenir.
            requestAnimationFrame(refreshCapacity);
        }
    }

    function applyColorToState(hex) {
        const hsv = hexToHsv(hex);
        if (!hsv) return;
        state.h = hsv.h;
        state.s = hsv.s;
        state.v = hsv.v;
    }

    function presetName(hex) {
        const match = (options.presets || []).find(p => p.hex.toLowerCase() === hex.toLowerCase());
        return match ? match.name : hex.toUpperCase();
    }

    // Palet listesi değiştiğinde (ekleme/silme/kırpma) bebeği kaydet.
    function notifyPaletteChange() {
        if (typeof options.onPaletteChange === "function") {
            options.onPaletteChange();
        }
    }

    function buildRemoveButton(hex, index) {
        const removeBtn = document.createElement("span");
        removeBtn.className = "cp-swatch-remove";
        removeBtn.textContent = "×";
        removeBtn.title = "Bu rengi sil";
        removeBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            if (slotsMode) removeSlot(index);
            else removeColor(hex);
        });
        return removeBtn;
    }

    function buildSwatch(hex, index, canRemove) {
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "cp-swatch";
        swatch.style.backgroundColor = hex;
        swatch.dataset.hex = hex.toLowerCase();

        if (slotsMode) {
            swatch.title = hex.toUpperCase();
            swatch.setAttribute("aria-label", hex.toUpperCase());
            if (canRemove) swatch.appendChild(buildRemoveButton(hex, index));
            swatch.addEventListener("click", function () {
                selectSlot(index);
            });
        } else {
            swatch.title = presetName(hex);
            swatch.setAttribute("aria-label", presetName(hex));
            swatch.appendChild(buildRemoveButton(hex, index));
            swatch.addEventListener("click", function () {
                api.setFromHex(hex, false);
            });
        }

        return swatch;
    }

    function buildAddButton() {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "cp-swatch cp-swatch-add";
        addBtn.textContent = "+";
        addBtn.title = "Yeni renk ekle";
        addBtn.setAttribute("aria-label", "Yeni renk ekle");
        addBtn.addEventListener("click", addCurrentColor);
        return addBtn;
    }

    function renderPalette() {
        if (!presetsWrap) return;
        presetsWrap.replaceChildren();
        presetButtons = [];

        // Saç modu: her kutu bağımsız bir renk yuvasıdır, silme en az 1 kalacak şekilde.
        if (slotsMode) {
            paletteColors.forEach(function (hex, index) {
                const swatch = buildSwatch(hex, index, paletteColors.length > 1);
                presetButtons.push(swatch);
                presetsWrap.appendChild(swatch);
            });
            presetsWrap.appendChild(buildAddButton());
            updateUI();
            return;
        }

        // Ten modu: kapasiteye kadar hazır renkler + "en sonda" ekleme kutusu.
        const canAdd = paletteColors.length < paletteCapacity;
        const visibleColors = paletteColors.slice(0, canAdd ? paletteCapacity - 1 : paletteCapacity);

        visibleColors.forEach(function (hex) {
            const swatch = buildSwatch(hex, presetButtons.length, true);
            presetButtons.push(swatch);
            presetsWrap.appendChild(swatch);
        });

        if (canAdd) {
            presetsWrap.appendChild(buildAddButton());
        }

        updateUI();
    }

    function addCurrentColor() {
        if (!presetsWrap) return;

        // Saç modu: yeni yuva aktif rengin kopyasıyla eklenir, hemen düzenlemeye açılır.
        // Renkler palet sırasına göre saçta bant olarak kullanılır.
        if (slotsMode) {
            const hex = normalizeHex(currentHex());
            if (!hex) return;
            paletteColors.push(hex);
            activeIndex = paletteColors.length - 1;
            renderPalette();
            notify();
            return;
        }

        if (paletteColors.length >= paletteCapacity) return;

        const hex = normalizeHex(state.active ? currentHex() : options.initialHex);
        if (!hex) return;

        // Renk zaten paletde varsa onu seç, yenisini ekleme.
        if (paletteColors.some(c => c.toLowerCase() === hex.toLowerCase())) {
            api.setFromHex(hex, false);
            return;
        }

        paletteColors.push(hex);
        notifyPaletteChange();
        renderPalette();
    }

    function removeColor(hex) {
        paletteColors = paletteColors.filter(c => c.toLowerCase() !== hex.toLowerCase());
        notifyPaletteChange();
        renderPalette();
    }

    function removeSlot(index) {
        if (paletteColors.length <= 1) return;

        paletteColors.splice(index, 1);
        if (activeIndex > index) activeIndex -= 1;
        if (activeIndex >= paletteColors.length) activeIndex = paletteColors.length - 1;
        if (activeIndex < 0) activeIndex = 0;

        applyColorToState(paletteColors[activeIndex]);
        renderPalette();
        notify();
    }

    function selectSlot(index) {
        if (!slotsMode || index < 0 || index >= paletteColors.length) return;
        activeIndex = index;
        applyColorToState(paletteColors[index]);
        // Kutu seçimi aynı zamanda "bu rengi saça uygula" demektir.
        notify();
    }

    // Paletin mavi panel içinde kaç kutu alabildiğini ölçer.
    function refreshCapacity() {
        if (!presetsWrap) return;

        const gap = 6;
        const cell = 30;
        const width = presetsWrap.clientWidth;
        const height = presetsWrap.clientHeight;
        if (!width || !height) return; // panel görünmüyor

        const cols = Math.max(1, Math.floor((width + gap) / (cell + gap)));
        const rows = Math.max(1, Math.floor((height + gap) / (cell + gap)));
        const capacity = cols * rows;
        if (capacity === paletteCapacity) return;

        paletteCapacity = capacity;
        if (paletteColors.length > capacity) {
            paletteColors = paletteColors.slice(0, capacity);
            notifyPaletteChange();
        }
        renderPalette();
    }

    function currentHex() {
        return hsvToHex(state.h, state.s, state.v);
    }

    function activeHex() {
        return state.active ? currentHex() : null;
    }

    function updateUI() {
        const sat = state.s / 100;
        const rad = state.h * Math.PI / 180;
        marker.style.left = (50 + Math.cos(rad) * sat * 50) + "%";
        marker.style.top = (50 + Math.sin(rad) * sat * 50) + "%";
        wheelDark.style.opacity = String(1 - state.v / 100);
        slider.value = Math.round(state.v);
        preview.style.backgroundColor = state.active ? currentHex() : options.initialHex;
        if (document.activeElement !== hexInput) {
            hexInput.value = state.active ? currentHex() : options.initialHex;
            hexInput.classList.remove("invalid");
        }

        // Saç modu: aktif yuva belirgin çerçeveyle işaretlenir.
        // Ten modu: seçili renk bir hazır renge denk geliyorsa o işaretlenir.
        if (slotsMode) {
            presetButtons.forEach(function (btn, idx) {
                btn.classList.toggle("selected", idx === activeIndex);
            });
            const activeSwatch = presetButtons[activeIndex];
            if (activeSwatch) {
                const hex = currentHex();
                activeSwatch.style.backgroundColor = hex;
                activeSwatch.dataset.hex = hex.toLowerCase();
                activeSwatch.title = hex.toUpperCase();
                activeSwatch.setAttribute("aria-label", hex.toUpperCase());
            }
        } else {
            const activeKey = state.active ? currentHex().toLowerCase() : null;
            presetButtons.forEach(function (btn) {
                btn.classList.toggle("selected", activeKey !== null && btn.dataset.hex === activeKey);
            });
        }
    }

    function notify() {
        if (slotsMode) {
            paletteColors[activeIndex] = currentHex();
        }
        updateUI();
        if (typeof options.onChange === "function") {
            if (slotsMode) options.onChange(currentHex(), paletteColors.slice());
            else options.onChange(activeHex());
        }
    }

    function setFromPointer(e) {
        const rect = wheel.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const radius = rect.width / 2;
        const dist = Math.min(Math.hypot(dx, dy), radius);

        state.s = (dist / radius) * 100;
        state.h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        state.active = true;
        notify();
    }

    function commitColor() {
        if (typeof options.onCommit === "function" && state.active) {
            options.onCommit(currentHex());
        }
    }

    let dragging = false;
    wheel.addEventListener("pointerdown", function (e) {
        dragging = true;
        if (wheel.setPointerCapture) {
            try { wheel.setPointerCapture(e.pointerId); } catch (err) { /* yoksay */ }
        }
        setFromPointer(e);
        e.preventDefault();
    });
    wheel.addEventListener("pointermove", function (e) {
        if (dragging) setFromPointer(e);
    });
    wheel.addEventListener("pointerup", function () {
        if (dragging) {
            dragging = false;
            commitColor();
        }
    });
    wheel.addEventListener("pointercancel", function () { dragging = false; });

    slider.addEventListener("input", function () {
        state.v = Number(slider.value);
        state.active = true;
        notify();
    });
    slider.addEventListener("change", commitColor);

    hexInput.addEventListener("input", function () {
        const rgb = parseHex(hexInput.value);
        if (!rgb) {
            hexInput.classList.add("invalid");
            return;
        }
        hexInput.classList.remove("invalid");
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        state.h = hsv.h;
        state.s = hsv.s;
        state.v = hsv.v;
        state.active = true;
        notify();
    });

    hexInput.addEventListener("change", function () {
        if (parseHex(hexInput.value)) commitColor();
    });

    hexInput.addEventListener("blur", function () {
        updateUI();
    });

    resetBtn.addEventListener("click", function () {
        api.reset(false);
    });

    const api = {
        reset: function (silent) {
            const hsv = hexToHsv(options.initialHex) || { h: 0, s: 0, v: 100 };
            state.h = hsv.h;
            state.s = hsv.s;
            state.v = hsv.v;
            state.active = slotsMode;

            // Saç modu: "Orijinale Dön" yalnızca aktif yuvanın rengini sıfırlar.
            if (slotsMode) {
                paletteColors[activeIndex] = normalizeHex(options.initialHex);
            }

            if (silent) updateUI();
            else notify();
        },
        setFromHex: function (hex, silent) {
            const rgb = parseHex(hex);
            if (!rgb) {
                api.reset(silent);
                return;
            }
            const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
            state.h = hsv.h;
            state.s = hsv.s;
            state.v = hsv.v;
            state.active = true;

            if (slotsMode) {
                paletteColors[activeIndex] = rgbToHex(rgb.r, rgb.g, rgb.b);
            }

            if (silent) updateUI();
            else notify();
        },
        refreshCapacity: refreshCapacity,
        getColors: function () {
            return slotsMode ? paletteColors.slice() : [];
        },
        // Ten paleti (presets modu) — bebek bazında saklanır.
        getPalette: function () {
            return paletteColors.slice();
        },
        setPalette: function (colors, silent) {
            if (!paletteEnabled || slotsMode) return;

            const normalized = (Array.isArray(colors) ? colors : [])
                .map(normalizeHex)
                .filter(Boolean);
            paletteColors = normalized.length > 0
                ? normalized
                : options.presets.map(p => normalizeHex(p.hex));

            renderPalette();
            if (!silent) notify();
        },
        setColors: function (colors, silent) {
            if (!slotsMode) return;

            const normalized = (Array.isArray(colors) ? colors : [])
                .map(normalizeHex)
                .filter(Boolean);
            paletteColors = normalized.length > 0
                ? normalized
                : [normalizeHex(options.initialHex)];

            if (activeIndex >= paletteColors.length) activeIndex = paletteColors.length - 1;
            if (activeIndex < 0) activeIndex = 0;

            applyColorToState(paletteColors[activeIndex]);
            renderPalette();

            if (!silent) notify();
        },
        getActiveIndex: function () {
            return activeIndex;
        },
        getActiveColor: function () {
            if (!slotsMode) return null;
            return paletteColors[activeIndex] || currentHex();
        },
        setActiveIndex: function (index, silent) {
            if (!slotsMode) return;

            let i = Number(index);
            if (!Number.isFinite(i)) i = 0;
            i = Math.max(0, Math.min(paletteColors.length - 1, Math.floor(i)));

            activeIndex = i;
            applyColorToState(paletteColors[i]);
            updateUI();

            if (!silent) notify();
        }
    };

    updateUI();
    return api;
}

// Ten rengi seçici
skinPicker = createColorPicker(document.getElementById("skin-picker"), {
    initialHex: COLOR_DEFAULTS.skin,
    label: "Ten rengi seçici",
    presets: SKIN_PRESETS,
    onPaletteChange: scheduleColorSave,
    onChange: function (hex) {
        customization.skinColor = hex;
        applySkinColor();
        scheduleColorSave();
    }
});

// Saç rengi seçici
hairPicker = createColorPicker(document.getElementById("hair-picker"), {
    initialHex: COLOR_DEFAULTS.hair,
    label: "Saç rengi seçici",
    paletteMode: "slots",
    onChange: function (hex) {
        // Yalnızca aktif kutunun rengi saça uygulanır; diğer kutular sadece saklanır.
        customization.hairColor = hex;
        applyHairColor();
        scheduleColorSave();
    }
});

// İlk açılışta saç rengini (orijinal) uygula.
applyHairColor();

// ============================================================
// ÜST BAR İŞLEMLERİ: MANUEL KAYDET VE GİRİŞ EKRANINA DÖNÜŞ
// ============================================================

let saveToastTimer = null;
function showSaveToast() {
    if (!saveToast) return;
    saveToast.style.display = "block";
    if (saveToastTimer) clearTimeout(saveToastTimer);
    saveToastTimer = setTimeout(() => {
        saveToast.style.display = "none";
    }, 1800);
}

// Manuel "💾 Kaydet" butonu
if (btnSaveDoll) {
    btnSaveDoll.addEventListener("click", function () {
        saveCurrentDoll();
        showSaveToast();
    });
}

// "🏠 Giriş Ekranı" butonu
if (btnHomeScreen) {
    btnHomeScreen.addEventListener("click", function () {
        saveCurrentDoll(); // Çıkmadan önce son halini kaydet
        if (startScreen) {
            startScreen.style.display = "flex";
            startMainView.style.display = "block";
            startNewDollPanel.style.display = "none";
            startContinuePanel.style.display = "none";
        }
    });
}

// ============================================================
// AI FASHION STUDIO (arayüz ve gezinme)
// ============================================================
const studioOverlay = document.getElementById("studio-overlay");
const studioWindow = document.getElementById("studio-window");
const btnOpenStudio = document.getElementById("btn-open-studio");
const studioMaximizeBtn = document.getElementById("studio-maximize");
const studioRestoreBtn = document.getElementById("studio-restore");
const studioCloseBtn = document.getElementById("studio-close");
const studioViews = document.querySelectorAll(".studio-view");
const studioBody = document.querySelector(".studio-body");

let studioLastFocus = null;

function showStudioView(viewName) {
    studioViews.forEach(function (view) {
        view.hidden = view.getAttribute("data-view") !== viewName;
    });
    if (studioBody) studioBody.scrollTop = 0;

    // Çizim görünümünde normal pencereyi uzat: palet + tuval + kontroller
    // kaydırmadan tek ekrana sığsın. Maximize hâlini etkilemez.
    if (studioWindow) {
        studioWindow.classList.toggle("draw-active", viewName === "draw");
    }

    // Çizim görünümü açılırken taslak/zoom/geçmiş durumunu tazele.
    if (viewName === "draw" && typeof onDrawViewOpened === "function") {
        onDrawViewOpened();
    }
    // Tasarım arşivi her açılışta güncel olsun.
    if (viewName === "designs" && typeof renderDesignsArchive === "function") {
        renderDesignsArchive();
    }
    // AI Design state her açılışta geri yüklenir; bilgi kaybolmaz.
    if (viewName === "ai" && typeof onAiDesignViewOpened === "function") {
        onAiDesignViewOpened();
    }
    if (viewName === "ai-ready" && typeof aiRenderReadyView === "function") {
        aiRenderReadyView();
    }
}

function setStudioMaximized(maximized) {
    if (!studioWindow || !studioOverlay) return;
    studioWindow.classList.toggle("maximized", maximized);
    studioOverlay.classList.toggle("maximized", maximized);
    if (studioMaximizeBtn) studioMaximizeBtn.hidden = maximized;
    if (studioRestoreBtn) studioRestoreBtn.hidden = !maximized;

    // Pencere boyutu değiştiğinde çizim alanını yeniden sığdır.
    requestAnimationFrame(function () {
        if (typeof fitDrawWorkspace === "function") fitDrawWorkspace();
    });
}

function openStudio() {
    if (!studioOverlay) return;

    studioLastFocus = document.activeElement;
    showStudioView("home");
    setStudioMaximized(false);
    studioOverlay.hidden = false;
    document.body.classList.add("studio-open");

    if (studioCloseBtn) {
        studioCloseBtn.focus({ preventScroll: true });
    }
}

function closeStudio() {
    if (!studioOverlay) return;

    studioOverlay.hidden = true;
    document.body.classList.remove("studio-open");
    setStudioMaximized(false);

    if (studioLastFocus && typeof studioLastFocus.focus === "function") {
        studioLastFocus.focus({ preventScroll: true });
    }
}

if (btnOpenStudio) btnOpenStudio.addEventListener("click", openStudio);
if (studioCloseBtn) studioCloseBtn.addEventListener("click", closeStudio);
if (studioMaximizeBtn) studioMaximizeBtn.addEventListener("click", function () { setStudioMaximized(true); });
if (studioRestoreBtn) studioRestoreBtn.addEventListener("click", function () { setStudioMaximized(false); });

document.querySelectorAll("[data-studio-view]").forEach(function (btn) {
    btn.addEventListener("click", function () {
        showStudioView(btn.getAttribute("data-studio-view"));
    });
});

document.querySelectorAll("[data-studio-back]").forEach(function (btn) {
    btn.addEventListener("click", function () {
        showStudioView("home");
    });
});

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && studioOverlay && !studioOverlay.hidden) {
        closeStudio();
    }
});

// ============================================================
// DRAW YOUR OWN — çizim motoru, geçmiş, taslak ve kayıt akışı
// ============================================================
const DRAW_W = 800;
const DRAW_H = 800;
const DRAW_HISTORY_LIMIT = 25;
const STUDIO_DESIGNS_KEY = "doll_studio_designs";
const STUDIO_DRAFT_KEY = "doll_studio_draft";
const STUDIO_AI_PENDING_KEY = "doll_studio_ai_pending";

const STUDIO_CUSTOM_COLORS_KEY = "doll_studio_custom_colors";

const DRAW_BASIC_COLORS = [
    "#000000", // Black
    "#ffffff", // White
    "#ff9800", // Orange
    "#e53935", // Red
    "#ffeb3b", // Yellow
    "#1e88e5", // Blue
    "#43a047", // Green
    "#8e24aa", // Purple
    "#f06292", // Pink
    "#795548"  // Brown
];

const DRAW_FAMILY_COLORS = [
    // Yellow / orange
    "#fff9c4", "#fff176", "#fdd835", "#f9a825", "#ffccbc",
    "#ffb74d", "#fb8c00", "#e65100", "#f5c9a6", "#f0d9c0",
    // Red
    "#ff8a80", "#ff5a5f", "#ff7043", "#d7263d", "#c62828", "#8e1c2e", "#5e0b15",
    // Blue
    "#bbdefb", "#64b5f6", "#90caf9", "#26c6da", "#00bcd4", "#1e60d5", "#1a237e", "#0d1b52",
    // Green
    "#b2dfdb", "#a5d6a7", "#a3b18a", "#7cb342", "#4caf50", "#2e7d32", "#1b5e20",
    // Pink / purple
    "#f8bbd0", "#f48fb1", "#ec407a", "#ff4081", "#d500f9", "#d1c4e9", "#b39ddb", "#7e57c2", "#4a148c",
    // Brown / gray / black
    "#e8d3b9", "#fff8e1", "#b08968", "#a1662f", "#6d4c41", "#3e2723", "#cfd8dc", "#90a4ae", "#546e7a", "#263238"
];

const DRAW_PREDEFINED_COLORS = DRAW_BASIC_COLORS.concat(DRAW_FAMILY_COLORS);

const DRAW_TOOL_DEFS = {
    pencil: { size: 4, opacity: 100, softness: 0, showSize: true, showOpacity: true, showSoftness: false, mode: "stroke" },
    pen: { size: 2, opacity: 100, softness: 0, showSize: true, showOpacity: true, showSoftness: false, mode: "stroke" },
    marker: { size: 28, opacity: 55, softness: 10, showSize: true, showOpacity: true, showSoftness: false, mode: "stroke" },
    watercolor: { size: 36, opacity: 35, softness: 75, showSize: true, showOpacity: true, showSoftness: true, mode: "soft" },
    brush: { size: 18, opacity: 100, softness: 35, showSize: true, showOpacity: true, showSoftness: true, mode: "soft" },
    airbrush: { size: 45, opacity: 30, softness: 95, showSize: true, showOpacity: true, showSoftness: true, mode: "soft" },
    fill: { size: 10, opacity: 100, softness: 0, showSize: false, showOpacity: false, showSoftness: false, mode: "fill" },
    eyedropper: { size: 10, opacity: 100, softness: 0, showSize: false, showOpacity: false, showSoftness: false, mode: "eyedropper" },
    eraser: { size: 24, opacity: 100, softness: 0, showSize: true, showOpacity: true, showSoftness: false, mode: "erase" },
    hand: { size: 10, opacity: 100, softness: 0, showSize: false, showOpacity: false, showSoftness: false, mode: "hand" }
};

const drawCanvas = document.getElementById("draw-canvas");
const drawWrap = document.getElementById("draw-canvas-wrap");
const drawStage = document.getElementById("draw-stage");
const drawZoomLabel = document.getElementById("draw-zoom-label");
const drawDraftBanner = document.getElementById("draw-draft-banner");
const drawModeButtons = document.querySelectorAll("[data-draw-mode]");
const drawToolButtons = document.querySelectorAll("[data-tool]");
const drawDollRef = document.getElementById("draw-doll-ref");
const drawDollVisibleInput = document.getElementById("draw-doll-visible");
const drawPaletteTrack = document.getElementById("palette-track");
const drawPaletteViewport = document.getElementById("palette-viewport");
const drawPalettePage = document.getElementById("palette-page");
const drawColorPanel = document.getElementById("draw-color-panel");
const drawActiveSwatch = document.getElementById("draw-active-swatch");
const drawSizeInput = document.getElementById("draw-size");
const drawSizeValue = document.getElementById("draw-size-value");
const drawOpacityInput = document.getElementById("draw-opacity");
const drawOpacityValue = document.getElementById("draw-opacity-value");
const drawSoftnessInput = document.getElementById("draw-softness");
const drawSoftnessValue = document.getElementById("draw-softness-value");

const refImages = {
    hairBack: document.getElementById("ref-hair-back"),
    base: document.getElementById("ref-base"),
    face: document.getElementById("ref-face"),
    hairFront: document.getElementById("ref-hair-front"),
    upper: document.getElementById("ref-upper"),
    lower: document.getElementById("ref-lower"),
    shoes: document.getElementById("ref-shoes"),
    accessory: document.getElementById("ref-accessory")
};

const drawToolSettings = {};
Object.keys(DRAW_TOOL_DEFS).forEach(function (key) {
    const def = DRAW_TOOL_DEFS[key];
    drawToolSettings[key] = { size: def.size, opacity: def.opacity, softness: def.softness };
});

let drawCtx = null;
let drawTool = "pencil";
let drawBrushColor = "#f06292";
let drawMode = "doll";
let drawDollLayerVisible = true;
let drawZoom = 1;
let drawHistory = [];
let drawRedoStack = [];
let isDrawingStroke = false;
let drawRestoring = false;
let drawDirty = false;
let drawLastPoint = null;
let drawPrevMid = null;
let drawActivePointerId = null;
let drawBaseSize = 480;
let drawCustomColors = [];
let drawPaletteScroll = 0;
let drawHandPanning = false;
let drawPanStart = null;
let draftSaveTimer = null;
let studioToastTimer = null;

function readStudioJson(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        return null;
    }
}

function showStudioToast(message) {
    const toast = document.getElementById("studio-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    if (studioToastTimer) clearTimeout(studioToastTimer);
    studioToastTimer = setTimeout(function () {
        toast.hidden = true;
    }, 2600);
}

// ---------- Geçmiş ----------
function drawSnapshot() {
    return drawCanvas ? drawCanvas.toDataURL("image/png") : "";
}

function updateDrawHistoryButtons() {
    const undoBtn = document.getElementById("draw-undo");
    const redoBtn = document.getElementById("draw-redo");
    if (undoBtn) undoBtn.disabled = drawRestoring || drawHistory.length <= 1;
    if (redoBtn) redoBtn.disabled = drawRestoring || drawRedoStack.length === 0;
}

function commitDrawHistory() {
    if (!drawCanvas) return;
    drawHistory.push(drawSnapshot());
    if (drawHistory.length > DRAW_HISTORY_LIMIT) drawHistory.shift();
    drawRedoStack = [];
    updateDrawHistoryButtons();
}

function restoreDrawSnapshot(dataUrl) {
    if (!drawCtx) return;
    drawRestoring = true;
    updateDrawHistoryButtons();

    const img = new Image();
    img.onload = function () {
        drawCtx.clearRect(0, 0, DRAW_W, DRAW_H);
        drawCtx.drawImage(img, 0, 0, DRAW_W, DRAW_H);
        drawRestoring = false;
        drawDirty = true;
        updateDrawHistoryButtons();
        scheduleDraftSave();
    };
    img.onerror = function () {
        drawRestoring = false;
        updateDrawHistoryButtons();
    };
    img.src = dataUrl;
}

function undoDraw() {
    if (drawRestoring || drawHistory.length <= 1) return;
    drawRedoStack.push(drawHistory.pop());
    restoreDrawSnapshot(drawHistory[drawHistory.length - 1]);
}

function redoDraw() {
    if (drawRestoring || drawRedoStack.length === 0) return;
    const next = drawRedoStack.pop();
    drawHistory.push(next);
    restoreDrawSnapshot(next);
}

// ---------- Çizim ----------
function getDrawPoint(e) {
    if (!drawCanvas) return null;
    const rect = drawCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
        x: (e.clientX - rect.left) * (DRAW_W / rect.width),
        y: (e.clientY - rect.top) * (DRAW_H / rect.height)
    };
}

function hexToRgba(hex, alpha) {
    const rgb = parseHex(hex) || { r: 0, g: 0, b: 0 };
    return "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", " + alpha + ")";
}

function paintStamp(point) {
    if (!drawCtx) return;

    const settings = drawToolSettings[drawTool];
    const isEraser = drawTool === "eraser";
    const alpha = Math.max(0.02, Math.min(1, settings.opacity / 100));
    const radius = Math.max(0.5, settings.size / 2);
    const softness = Math.max(0, Math.min(100, settings.softness)) / 100;

    drawCtx.save();
    drawCtx.globalCompositeOperation = isEraser ? "destination-out" : "source-over";

    if (softness > 0.02) {
        const gradient = drawCtx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
        const solidStop = Math.max(0, 1 - softness);
        const color = hexToRgba(drawBrushColor, alpha);
        gradient.addColorStop(0, color);
        gradient.addColorStop(solidStop, color);
        gradient.addColorStop(1, hexToRgba(drawBrushColor, 0));
        drawCtx.fillStyle = isEraser ? "#000000" : gradient;
        drawCtx.globalAlpha = isEraser ? alpha : 1;
        drawCtx.beginPath();
        drawCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        drawCtx.fill();
    } else {
        drawCtx.globalAlpha = alpha;
        drawCtx.fillStyle = isEraser ? "#000000" : drawBrushColor;
        drawCtx.beginPath();
        drawCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        drawCtx.fill();
    }

    drawCtx.restore();
}

function paintSegment(from, to) {
    if (!drawCtx) return;

    const def = DRAW_TOOL_DEFS[drawTool];
    const settings = drawToolSettings[drawTool];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);

    // Tek tıklamada da iz bırak (sıfır uzunluklu çizgi bazı tarayıcılarda görünmez).
    if (def.mode !== "soft" && distance < 0.5) {
        const isDotEraser = drawTool === "eraser";
        drawCtx.save();
        drawCtx.globalCompositeOperation = isDotEraser ? "destination-out" : "source-over";
        drawCtx.globalAlpha = Math.max(0.02, Math.min(1, settings.opacity / 100));
        drawCtx.fillStyle = isDotEraser ? "#000000" : drawBrushColor;
        drawCtx.beginPath();
        drawCtx.arc(from.x, from.y, Math.max(0.5, settings.size / 2), 0, Math.PI * 2);
        drawCtx.fill();
        drawCtx.restore();
        return;
    }

    if (def.mode === "soft") {
        const spacing = Math.max(1, settings.size * 0.12);
        const steps = Math.max(1, Math.ceil(distance / spacing));

        for (let i = 1; i <= steps; i += 1) {
            const t = i / steps;
            paintStamp({
                x: from.x + (to.x - from.x) * t,
                y: from.y + (to.y - from.y) * t
            });
        }
        return;
    }

    const isEraser = drawTool === "eraser";
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const start = drawPrevMid || from;

    drawCtx.save();
    drawCtx.globalCompositeOperation = isEraser ? "destination-out" : "source-over";
    drawCtx.globalAlpha = Math.max(0.02, Math.min(1, settings.opacity / 100));
    drawCtx.strokeStyle = isEraser ? "#000000" : drawBrushColor;
    drawCtx.lineWidth = Math.max(0.5, settings.size);
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    drawCtx.beginPath();
    drawCtx.moveTo(start.x, start.y);
    drawCtx.quadraticCurveTo(from.x, from.y, midX, midY);
    drawCtx.stroke();
    drawCtx.restore();

    drawPrevMid = { x: midX, y: midY };
}

function floodFillAt(point) {
    if (!drawCtx) return false;

    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= DRAW_W || y >= DRAW_H) return false;

    const image = drawCtx.getImageData(0, 0, DRAW_W, DRAW_H);
    const data = image.data;
    const startIndex = (y * DRAW_W + x) * 4;
    const target = [
        data[startIndex],
        data[startIndex + 1],
        data[startIndex + 2],
        data[startIndex + 3]
    ];

    const rgb = parseHex(drawBrushColor) || { r: 0, g: 0, b: 0 };
    const fillColor = [rgb.r, rgb.g, rgb.b, 255];

    if (target[0] === fillColor[0] && target[1] === fillColor[1]
        && target[2] === fillColor[2] && target[3] === fillColor[3]) {
        return false;
    }

    const tolerance = 24;
    const matches = function (idx) {
        return Math.abs(data[idx] - target[0]) <= tolerance
            && Math.abs(data[idx + 1] - target[1]) <= tolerance
            && Math.abs(data[idx + 2] - target[2]) <= tolerance
            && Math.abs(data[idx + 3] - target[3]) <= tolerance;
    };

    const visited = new Uint8Array(DRAW_W * DRAW_H);
    const stack = [y * DRAW_W + x];

    while (stack.length > 0) {
        const pixel = stack.pop();
        if (visited[pixel]) continue;
        visited[pixel] = 1;

        const idx = pixel * 4;
        if (!matches(idx)) continue;

        data[idx] = fillColor[0];
        data[idx + 1] = fillColor[1];
        data[idx + 2] = fillColor[2];
        data[idx + 3] = fillColor[3];

        const px = pixel % DRAW_W;
        const py = Math.floor(pixel / DRAW_W);
        if (px > 0) stack.push(pixel - 1);
        if (px < DRAW_W - 1) stack.push(pixel + 1);
        if (py > 0) stack.push(pixel - DRAW_W);
        if (py < DRAW_H - 1) stack.push(pixel + DRAW_W);
    }

    drawCtx.putImageData(image, 0, 0);
    return true;
}

function pickColorAt(point) {
    if (!drawCtx) return;

    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= DRAW_W || y >= DRAW_H) return;

    const pixel = drawCtx.getImageData(x, y, 1, 1).data;
    if (pixel[3] === 0) {
        showStudioToast("Bu noktada çizim yok.");
        return;
    }

    const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
    setActiveDrawColor(hex);
    registerCustomColor(hex);
    showStudioToast("Renk alındı: " + hex.toUpperCase());
}

function beginDrawStroke(e) {
    if (drawRestoring) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const point = getDrawPoint(e);
    if (!point) return;

    const toolMode = DRAW_TOOL_DEFS[drawTool].mode;

    if (toolMode === "hand") {
        drawHandPanning = true;
        drawActivePointerId = e.pointerId;
        drawPanStart = {
            x: e.clientX,
            y: e.clientY,
            left: drawStage ? drawStage.scrollLeft : 0,
            top: drawStage ? drawStage.scrollTop : 0
        };
        if (drawStage) drawStage.style.cursor = "grabbing";
        if (drawCanvas.setPointerCapture) {
            try { drawCanvas.setPointerCapture(e.pointerId); } catch (err) { /* yoksay */ }
        }
        e.preventDefault();
        return;
    }

    if (toolMode === "eyedropper") {
        pickColorAt(point);
        return;
    }

    if (toolMode === "fill") {
        registerCustomColor(drawBrushColor);
        if (floodFillAt(point)) {
            drawDirty = true;
            commitDrawHistory();
            scheduleDraftSave();
        }
        return;
    }

    isDrawingStroke = true;
    drawActivePointerId = e.pointerId;
    drawLastPoint = point;
    drawPrevMid = { x: point.x, y: point.y };

    if (drawDraftBanner) drawDraftBanner.hidden = true;
    registerCustomColor(drawBrushColor);

    if (drawCanvas.setPointerCapture) {
        try { drawCanvas.setPointerCapture(e.pointerId); } catch (err) { /* yoksay */ }
    }

    paintSegment(point, point);
    e.preventDefault();
}

function continueDrawStroke(e) {
    if (drawHandPanning) {
        if (!drawPanStart || !drawStage) return;
        drawStage.scrollLeft = drawPanStart.left - (e.clientX - drawPanStart.x);
        drawStage.scrollTop = drawPanStart.top - (e.clientY - drawPanStart.y);
        e.preventDefault();
        return;
    }

    if (!isDrawingStroke || drawRestoring) return;
    if (drawActivePointerId !== null && e.pointerId !== drawActivePointerId) return;

    // Tarayıcının birleştirdiği ara noktaları da işle: daha yumuşak eğriler.
    const coalesced = (typeof e.getCoalescedEvents === "function")
        ? e.getCoalescedEvents()
        : null;

    if (coalesced && coalesced.length > 0) {
        coalesced.forEach(function (event) {
            const point = getDrawPoint(event);
            if (!point) return;
            paintSegment(drawLastPoint || point, point);
            drawLastPoint = point;
        });
    } else {
        const point = getDrawPoint(e);
        if (!point) return;
        paintSegment(drawLastPoint || point, point);
        drawLastPoint = point;
    }

    e.preventDefault();
}

function endDrawStroke(e) {
    if (drawHandPanning) {
        drawHandPanning = false;
        drawPanStart = null;
        drawActivePointerId = null;
        if (drawStage) drawStage.style.cursor = "";
        return;
    }

    if (!isDrawingStroke) return;
    if (drawActivePointerId !== null && e && e.pointerId !== undefined && e.pointerId !== drawActivePointerId) return;

    // Sert uçlarda eğri, son noktaya kadar tamamlansın.
    if (drawCtx && drawPrevMid && drawLastPoint && DRAW_TOOL_DEFS[drawTool].mode !== "soft") {
        const settings = drawToolSettings[drawTool];
        const isEraser = drawTool === "eraser";
        drawCtx.save();
        drawCtx.globalCompositeOperation = isEraser ? "destination-out" : "source-over";
        drawCtx.globalAlpha = Math.max(0.02, Math.min(1, settings.opacity / 100));
        drawCtx.strokeStyle = isEraser ? "#000000" : drawBrushColor;
        drawCtx.lineWidth = Math.max(0.5, settings.size);
        drawCtx.lineCap = "round";
        drawCtx.lineJoin = "round";
        drawCtx.beginPath();
        drawCtx.moveTo(drawPrevMid.x, drawPrevMid.y);
        drawCtx.lineTo(drawLastPoint.x, drawLastPoint.y);
        drawCtx.stroke();
        drawCtx.restore();
    }

    isDrawingStroke = false;
    drawActivePointerId = null;
    drawLastPoint = null;
    drawPrevMid = null;
    drawDirty = true;
    commitDrawHistory();
    scheduleDraftSave();
}

// ---------- Bebek referans katmanı ----------
function syncDollReference() {
    if (!drawDollRef) return;

    // Yalnızca dosyadaki temel bebek görseli gösterilir:
    // kız -> doll.png, erkek -> boydoll.png (giydirilmiş hâli değil).
    Object.keys(refImages).forEach(function (key) {
        const img = refImages[key];
        if (!img) return;
        img.removeAttribute("src");
        img.style.display = "none";
        img.style.filter = "none";
        img.style.zIndex = "";
    });

    const baseSrc = GENDER_BASE_IMAGES[currentDoll.gender] || GENDER_BASE_IMAGES.girl;
    if (refImages.base) {
        refImages.base.src = baseSrc;
        refImages.base.style.display = "block";
        refImages.base.style.zIndex = "1";
    }

    applyDollReferenceVisibility();
}

function applyDollReferenceVisibility() {
    if (!drawDollRef) return;
    const visible = drawMode === "doll" && drawDollLayerVisible;
    drawDollRef.style.display = visible ? "block" : "none";
}

function setDrawMode(mode, silent) {
    drawMode = mode === "blank" ? "blank" : "doll";

    drawModeButtons.forEach(function (btn) {
        btn.classList.toggle("is-active", btn.getAttribute("data-draw-mode") === drawMode);
    });

    applyDollReferenceVisibility();
    if (!silent) scheduleDraftSave();
}

// ---------- Renk paleti ----------
function loadCustomColors() {
    const stored = readStudioJson(STUDIO_CUSTOM_COLORS_KEY);
    if (!Array.isArray(stored)) return [];

    const seen = {};
    const result = [];
    stored.forEach(function (value) {
        const hex = normalizeHex(value);
        if (!hex || seen[hex.toLowerCase()]) return;
        seen[hex.toLowerCase()] = true;
        result.push(hex);
    });
    return result;
}

function persistCustomColors() {
    try {
        localStorage.setItem(STUDIO_CUSTOM_COLORS_KEY, JSON.stringify(drawCustomColors));
    } catch (err) { /* depolama dolu olabilir */ }
}

function colorPaletteHas(hex) {
    const key = hex.toLowerCase();
    return DRAW_PREDEFINED_COLORS.some(function (c) { return c.toLowerCase() === key; })
        || drawCustomColors.some(function (c) { return c.toLowerCase() === key; });
}

function registerCustomColor(value) {
    const hex = normalizeHex(value);
    if (!hex || colorPaletteHas(hex)) return;
    drawCustomColors.push(hex);
    persistCustomColors();
    renderColorPalette();
    updatePalettePageInfo();
}

function removeCustomColor(value) {
    const key = String(value).toLowerCase();
    drawCustomColors = drawCustomColors.filter(function (c) { return c.toLowerCase() !== key; });
    persistCustomColors();
    renderColorPalette();
    updatePalettePageInfo();
    // Aktif renk paletten silinse bile çizim rengi korunur.
    syncActiveColorUI();
}

function setActiveDrawColor(value) {
    const hex = normalizeHex(value);
    if (!hex) return;
    drawBrushColor = hex;
    syncActiveColorUI();
}

function updatePaletteActiveState() {
    if (!drawPaletteTrack) return;
    const activeKey = drawBrushColor.toLowerCase();
    drawPaletteTrack.querySelectorAll(".palette-swatch").forEach(function (swatch) {
        swatch.classList.toggle("is-active", (swatch.dataset.hex || "").toLowerCase() === activeKey);
    });
}

function syncActiveColorUI() {
    if (drawActiveSwatch) drawActiveSwatch.style.backgroundColor = drawBrushColor;
    updatePaletteActiveState();
}

function renderColorPalette() {
    if (!drawPaletteTrack) return;

    drawPaletteTrack.replaceChildren();
    const allColors = DRAW_PREDEFINED_COLORS.concat(drawCustomColors);

    allColors.forEach(function (hex, index) {
        const isCustom = index >= DRAW_PREDEFINED_COLORS.length;
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "palette-swatch" + (isCustom ? " is-custom" : "");
        swatch.style.backgroundColor = hex;
        swatch.dataset.hex = hex;
        swatch.title = hex.toUpperCase();
        swatch.setAttribute("aria-label", hex.toUpperCase());

        if (hex.toLowerCase() === drawBrushColor.toLowerCase()) {
            swatch.classList.add("is-active");
        }

        swatch.addEventListener("click", function () {
            setActiveDrawColor(hex);
        });

        if (isCustom) {
            const remove = document.createElement("span");
            remove.className = "palette-swatch-remove";
            remove.textContent = "×";
            remove.title = "Bu rengi sil";
            remove.addEventListener("click", function (e) {
                e.stopPropagation();
                removeCustomColor(hex);
            });
            swatch.appendChild(remove);
        }

        drawPaletteTrack.appendChild(swatch);
    });
}

function updatePalettePageInfo() {
    if (!drawPalettePage || !drawPaletteViewport || !drawPaletteTrack) return;

    const total = DRAW_PREDEFINED_COLORS.length + drawCustomColors.length;
    const swatches = drawPaletteTrack.querySelectorAll(".palette-swatch");
    if (swatches.length === 0) {
        drawPalettePage.textContent = "0 / " + total;
        return;
    }

    const viewportRect = drawPaletteViewport.getBoundingClientRect();
    let first = 0;
    let last = 0;

    swatches.forEach(function (swatch, index) {
        const rect = swatch.getBoundingClientRect();
        const visible = rect.right > viewportRect.left + 1 && rect.left < viewportRect.right - 1;
        if (visible) {
            if (!first) first = index + 1;
            last = index + 1;
        }
    });

    if (!first) first = 1;
    drawPalettePage.textContent = first + "–" + last + " / " + total;
}

function scrollPalette(direction) {
    if (!drawPaletteViewport) return;
    const amount = Math.max(140, drawPaletteViewport.clientWidth * 0.9);
    if (drawPaletteViewport.scrollBy) {
        drawPaletteViewport.scrollBy({ left: direction * amount, behavior: "smooth" });
    } else {
        drawPaletteViewport.scrollLeft += direction * amount;
    }
}

// ---------- Araç ayarları ----------
function updateToolSettingsUI() {
    const def = DRAW_TOOL_DEFS[drawTool];
    const settings = drawToolSettings[drawTool];
    if (!def || !settings) return;

    if (drawSizeInput) drawSizeInput.value = String(settings.size);
    if (drawSizeValue) drawSizeValue.textContent = String(settings.size);
    if (drawOpacityInput) drawOpacityInput.value = String(settings.opacity);
    if (drawOpacityValue) drawOpacityValue.textContent = String(settings.opacity);
    if (drawSoftnessInput) drawSoftnessInput.value = String(settings.softness);
    if (drawSoftnessValue) drawSoftnessValue.textContent = String(settings.softness);

    const sizeRow = document.getElementById("setting-size");
    const opacityRow = document.getElementById("setting-opacity");
    const softnessRow = document.getElementById("setting-softness");
    if (sizeRow) sizeRow.hidden = !def.showSize;
    if (opacityRow) opacityRow.hidden = !def.showOpacity;
    if (softnessRow) softnessRow.hidden = !def.showSoftness;
}

function setDrawTool(tool) {
    if (!DRAW_TOOL_DEFS[tool]) return;
    drawTool = tool;

    drawToolButtons.forEach(function (btn) {
        btn.classList.toggle("is-active", btn.getAttribute("data-tool") === tool);
    });

    updateToolSettingsUI();

    if (drawCanvas) {
        if (tool === "hand") drawCanvas.style.cursor = "grab";
        else if (tool === "eyedropper") drawCanvas.style.cursor = "copy";
        else if (tool === "fill") drawCanvas.style.cursor = "cell";
        else drawCanvas.style.cursor = "crosshair";
    }
}

// ---------- Zoom / yerleşim ----------
function applyDrawWrapSize() {
    if (!drawWrap) return;
    drawWrap.style.width = Math.round(drawBaseSize * drawZoom) + "px";
    drawWrap.style.setProperty("--draw-zoom", String(drawZoom));
}

function fitDrawWorkspace() {
    if (!drawStage || !drawWrap) return;

    const view = document.querySelector(".studio-draw-view");
    const body = document.querySelector(".studio-body");
    const topbar = document.querySelector(".draw-topbar");
    const workspace = document.querySelector(".draw-workspace");
    if (!view || view.hidden || !body || !topbar || !workspace) return;

    const bodyStyle = getComputedStyle(body);
    const innerHeight = body.clientHeight
        - (parseFloat(bodyStyle.paddingTop) || 0)
        - (parseFloat(bodyStyle.paddingBottom) || 0);
    const topbarStyle = getComputedStyle(topbar);
    const topbarHeight = topbar.offsetHeight + (parseFloat(topbarStyle.marginBottom) || 0);

    const availableHeight = Math.max(300, innerHeight - topbarHeight);
    workspace.style.height = Math.round(availableHeight) + "px";

    const stageWidth = drawStage.clientWidth;
    const stageHeight = drawStage.clientHeight;
    if (!stageWidth || !stageHeight) return;

    drawBaseSize = Math.max(180, Math.min(stageWidth - 10, stageHeight - 10));
    applyDrawWrapSize();
    updatePalettePageInfo();
}

function setDrawZoom(value) {
    drawZoom = Math.max(0.5, Math.min(2.5, Math.round(value * 100) / 100));
    applyDrawWrapSize();
    if (drawZoomLabel) drawZoomLabel.textContent = Math.round(drawZoom * 100) + "%";
    scheduleDraftSave();
}

// ---------- Taslak (draft) ----------
function scheduleDraftSave() {
    if (draftSaveTimer) clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(saveDrawDraftNow, 600);
}

function saveDrawDraftNow() {
    if (!drawCanvas || !drawDirty) return;
    try {
        const payload = {
            imageDataUrl: drawCanvas.toDataURL("image/png"),
            width: DRAW_W,
            height: DRAW_H,
            mode: drawMode,
            dollVisible: drawDollLayerVisible,
            zoom: drawZoom,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify(payload));
    } catch (err) {
        /* Depolama dolu olabilir; sessizce geç. */
    }
}

function checkDrawDraft() {
    if (!drawDraftBanner) return;
    const draft = readStudioJson(STUDIO_DRAFT_KEY);
    if (!draft || !draft.imageDataUrl || drawDirty) {
        drawDraftBanner.hidden = true;
        return;
    }
    drawDraftBanner.hidden = false;
}

function restoreDrawDraft() {
    const draft = readStudioJson(STUDIO_DRAFT_KEY);
    if (!draft || !draft.imageDataUrl || !drawCtx) {
        if (drawDraftBanner) drawDraftBanner.hidden = true;
        return;
    }

    // Eski taslaklardaki "free"/"template" değerlerini yeni modlara eşle.
    drawMode = (draft.mode === "blank" || draft.mode === "free") ? "blank" : "doll";
    drawDollLayerVisible = draft.dollVisible !== false;
    if (drawDollVisibleInput) drawDollVisibleInput.checked = drawDollLayerVisible;
    setDrawMode(drawMode, true);
    if (draft.zoom) setDrawZoom(draft.zoom);

    const img = new Image();
    img.onload = function () {
        drawCtx.clearRect(0, 0, DRAW_W, DRAW_H);
        drawCtx.drawImage(img, 0, 0, DRAW_W, DRAW_H);
        drawHistory = [drawSnapshot()];
        drawRedoStack = [];
        drawDirty = true;
        updateDrawHistoryButtons();
        if (drawDraftBanner) drawDraftBanner.hidden = true;
        showStudioToast("Taslak geri yüklendi.");
        requestAnimationFrame(fitDrawWorkspace);
    };
    img.src = draft.imageDataUrl;
}

function discardDrawDraft() {
    try { localStorage.removeItem(STUDIO_DRAFT_KEY); } catch (err) { /* yoksay */ }
    if (drawDraftBanner) drawDraftBanner.hidden = true;
    clearCanvasSilently();
    drawDirty = false;
    drawHistory = [drawSnapshot()];
    drawRedoStack = [];
    updateDrawHistoryButtons();
    requestAnimationFrame(fitDrawWorkspace);
}

// ---------- Temizleme / kontrol ----------
function clearCanvasSilently() {
    if (!drawCtx) return;
    drawCtx.clearRect(0, 0, DRAW_W, DRAW_H);
}

function canvasHasContent() {
    if (!drawCtx) return false;
    const data = drawCtx.getImageData(0, 0, DRAW_W, DRAW_H).data;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) return true;
    }
    return false;
}

// ---------- Kayıt akışı ----------
function getSelectedDesignCategory() {
    const selected = document.querySelector('input[name="save-category"]:checked');
    return selected ? selected.value : null;
}

function openSaveFlow() {
    if (!canvasHasContent()) {
        showStudioToast("Önce bir şey çiz.");
        return;
    }

    const preview = document.getElementById("save-preview-img");
    if (preview) preview.src = drawCanvas.toDataURL("image/png");

    const error = document.getElementById("save-category-error");
    if (error) error.hidden = true;

    document.querySelectorAll('input[name="save-category"]').forEach(function (radio) {
        radio.checked = false;
    });

    const nameInput = document.getElementById("save-design-name");
    if (nameInput) {
        nameInput.value = nameInput.value || ("Tasarım " + new Date().toLocaleDateString("tr-TR"));
    }

    const dollSpan = document.getElementById("save-doll-name");
    if (dollSpan) dollSpan.textContent = currentDoll.name || "Bebeğim";

    const wardrobeCheckbox = document.getElementById("save-add-to-wardrobe");
    if (wardrobeCheckbox) wardrobeCheckbox.checked = false;

    showStudioView("save");
}

function addDesignToArchive(design) {
    const existing = readStudioJson(STUDIO_DESIGNS_KEY);
    const designs = Array.isArray(existing) ? existing : [];
    designs.unshift(design);
    while (designs.length > 24) designs.pop();

    try {
        localStorage.setItem(STUDIO_DESIGNS_KEY, JSON.stringify(designs));
        return true;
    } catch (err) {
        try {
            localStorage.setItem(STUDIO_DESIGNS_KEY, JSON.stringify(designs.slice(0, 8)));
            return true;
        } catch (err2) {
            return false;
        }
    }
}

function saveDesignFlow() {
    const category = getSelectedDesignCategory();
    const error = document.getElementById("save-category-error");

    if (!category) {
        if (error) error.hidden = false;
        return;
    }
    if (error) error.hidden = true;

    const nameInput = document.getElementById("save-design-name");
    const rawName = nameInput ? nameInput.value.trim() : "";
    const wardrobeCheckbox = document.getElementById("save-add-to-wardrobe");
    const addToWardrobe = !!(wardrobeCheckbox && wardrobeCheckbox.checked);

    const design = {
        id: "design-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        name: rawName || ("Tasarım " + new Date().toLocaleDateString("tr-TR")),
        source: "draw",
        imageDataUrl: drawCanvas.toDataURL("image/png"),
        width: DRAW_W,
        height: DRAW_H,
        mode: drawMode,
        template: null,
        dollPlacement: {
            visible: drawMode === "doll" && drawDollLayerVisible,
            heightRatio: 0.82,
            aspect: "320/700"
        },
        category: category,
        addedToWardrobe: addToWardrobe,
        wardrobeTarget: addToWardrobe
            ? { name: currentDoll.name, gender: currentDoll.gender }
            : null,
        createdAt: new Date().toISOString()
    };

    if (!addDesignToArchive(design)) {
        showStudioToast("Tasarım kaydedilemedi (depolama dolu olabilir).");
        return;
    }

    try {
        localStorage.removeItem(STUDIO_DRAFT_KEY);
        localStorage.removeItem(STUDIO_AI_PENDING_KEY);
    } catch (err) { /* yoksay */ }

    drawDirty = false;
    if (drawDraftBanner) drawDraftBanner.hidden = true;

    renderDesignsArchive();
    showStudioToast("Tasarım kaydedildi.");
    showStudioView("designs");
}

// ---------- AI hazırlık akışı ----------
function openAiPrepareFlow() {
    if (!canvasHasContent()) {
        showStudioToast("Önce bir şey çiz.");
        return;
    }

    const payload = {
        imageDataUrl: drawCanvas.toDataURL("image/png"),
        width: DRAW_W,
        height: DRAW_H,
        mode: drawMode,
        template: null,
        dollPlacement: {
            visible: drawMode === "doll" && drawDollLayerVisible,
            heightRatio: 0.82,
            aspect: "320/700"
        },
        category: null,
        status: "pending-ai",
        createdAt: new Date().toISOString()
    };

    try {
        localStorage.setItem(STUDIO_AI_PENDING_KEY, JSON.stringify(payload));
    } catch (err) { /* yoksay */ }

    const image = document.getElementById("ai-pending-img");
    if (image) image.src = payload.imageDataUrl;

    showStudioView("ai-pending");
}

// ---------- My Designs ----------
function renderDesignsArchive() {
    const grid = document.getElementById("designs-grid");
    const empty = document.getElementById("designs-empty");
    if (!grid || !empty) return;

    const existing = readStudioJson(STUDIO_DESIGNS_KEY);
    const designs = Array.isArray(existing) ? existing : [];

    grid.replaceChildren();

    if (designs.length === 0) {
        grid.hidden = true;
        empty.hidden = false;
        return;
    }

    grid.hidden = false;
    empty.hidden = true;

    const categoryLabels = {
        skin: "Skin",
        hair: "Hair",
        haircolor: "Hair Color",
        face: "Face",
        clothes: "Clothes",
        shoes: "Shoes",
        accessories: "Accessories"
    };

    designs.forEach(function (design) {
        const card = document.createElement("article");
        card.className = "design-card";

        const thumb = document.createElement("div");
        thumb.className = "design-thumb";
        const image = document.createElement("img");
        image.src = design.imageDataUrl;
        image.alt = design.name || "Tasarım";
        thumb.appendChild(image);

        const meta = document.createElement("div");
        meta.className = "design-meta";
        const title = document.createElement("strong");
        title.textContent = design.name || "Tasarım";
        const sub = document.createElement("span");
        sub.textContent = (categoryLabels[design.category] || design.category || "—")
            + (design.addedToWardrobe ? " • bebeğe atandı" : "");
        meta.append(title, sub);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "design-delete";
        remove.textContent = "🗑️";
        remove.title = "Tasarımı sil";
        remove.addEventListener("click", function () {
            if (!confirm("Bu tasarım silinsin mi?")) return;
            deleteDesign(design.id);
        });

        card.append(thumb, meta, remove);
        grid.appendChild(card);
    });
}

function deleteDesign(id) {
    const existing = readStudioJson(STUDIO_DESIGNS_KEY);
    const designs = Array.isArray(existing) ? existing : [];
    const filtered = designs.filter(function (d) { return d.id !== id; });

    try {
        localStorage.setItem(STUDIO_DESIGNS_KEY, JSON.stringify(filtered));
    } catch (err) { /* yoksay */ }

    renderDesignsArchive();
}

// ---------- Görünüm açılışı ----------
function onDrawViewOpened() {
    syncDollReference();
    setDrawMode(drawMode, true);
    updateToolSettingsUI();
    renderColorPalette();
    updatePalettePageInfo();
    syncActiveColorUI();
    updateDrawHistoryButtons();
    checkDrawDraft();
    if (drawZoomLabel) drawZoomLabel.textContent = Math.round(drawZoom * 100) + "%";

    // Görünüm açıldıktan sonra tuvali mevcut alana sığdır.
    requestAnimationFrame(fitDrawWorkspace);
}

// ---------- Başlatma ----------
function initDrawStudio() {
    if (!drawCanvas) return;

    drawCtx = drawCanvas.getContext("2d");
    if (!drawCtx) return;

    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";

    drawHistory = [drawSnapshot()];
    drawRedoStack = [];
    drawCustomColors = loadCustomColors();

    setDrawTool("pencil");
    setDrawMode("doll", true);
    setDrawZoom(1);
    syncDollReference();
    renderColorPalette();
    updatePalettePageInfo();
    syncActiveColorUI();

    // Renk seçici (sağ panelde, varsayılan olarak kapalı)
    const colorRoot = document.getElementById("draw-color-root");
    if (colorRoot && typeof createColorPicker === "function") {
        createColorPicker(colorRoot, {
            initialHex: drawBrushColor,
            label: "Fırça rengi",
            onChange: function (hex) {
                if (!hex) return;
                drawBrushColor = hex;
                syncActiveColorUI();
            },
            onCommit: function (hex) {
                if (!hex) return;
                drawBrushColor = hex;
                registerCustomColor(hex);
                syncActiveColorUI();
            }
        });
    }

    function openColorPanel() {
        if (!drawColorPanel) return;
        drawColorPanel.hidden = false;
        drawColorPanel.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    const colorToggle = document.getElementById("draw-color-toggle");
    if (colorToggle) colorToggle.addEventListener("click", function () {
        if (!drawColorPanel) return;
        if (drawColorPanel.hidden) {
            openColorPanel();
        } else {
            drawColorPanel.hidden = true;
        }
    });

    const paletteAdd = document.getElementById("palette-add");
    if (paletteAdd) paletteAdd.addEventListener("click", openColorPanel);

    // Sol araç çubuğu
    drawToolButtons.forEach(function (btn) {
        btn.addEventListener("click", function () {
            setDrawTool(btn.getAttribute("data-tool"));
        });
    });

    // Araç ayarları
    if (drawSizeInput) drawSizeInput.addEventListener("input", function () {
        const settings = drawToolSettings[drawTool];
        settings.size = Number(drawSizeInput.value) || 1;
        if (drawSizeValue) drawSizeValue.textContent = String(settings.size);
    });

    if (drawOpacityInput) drawOpacityInput.addEventListener("input", function () {
        const settings = drawToolSettings[drawTool];
        settings.opacity = Number(drawOpacityInput.value) || 100;
        if (drawOpacityValue) drawOpacityValue.textContent = String(settings.opacity);
    });

    if (drawSoftnessInput) drawSoftnessInput.addEventListener("input", function () {
        const settings = drawToolSettings[drawTool];
        settings.softness = Number(drawSoftnessInput.value) || 0;
        if (drawSoftnessValue) drawSoftnessValue.textContent = String(settings.softness);
    });

    // Çizim modları
    drawModeButtons.forEach(function (btn) {
        btn.addEventListener("click", function () {
            setDrawMode(btn.getAttribute("data-draw-mode"));
        });
    });

    // Bebek katmanı görünürlüğü
    if (drawDollVisibleInput) drawDollVisibleInput.addEventListener("change", function () {
        drawDollLayerVisible = drawDollVisibleInput.checked;
        applyDollReferenceVisibility();
        scheduleDraftSave();
    });

    // Zoom
    const zoomIn = document.getElementById("draw-zoom-in");
    const zoomOut = document.getElementById("draw-zoom-out");
    const zoomReset = document.getElementById("draw-zoom-reset");
    if (zoomIn) zoomIn.addEventListener("click", function () { setDrawZoom(drawZoom + 0.25); });
    if (zoomOut) zoomOut.addEventListener("click", function () { setDrawZoom(drawZoom - 0.25); });
    if (zoomReset) zoomReset.addEventListener("click", function () {
        setDrawZoom(1);
        if (drawStage) {
            drawStage.scrollLeft = 0;
            drawStage.scrollTop = 0;
        }
    });

    // Düzenleme
    const undoBtn = document.getElementById("draw-undo");
    const redoBtn = document.getElementById("draw-redo");
    if (undoBtn) undoBtn.addEventListener("click", undoDraw);
    if (redoBtn) redoBtn.addEventListener("click", redoDraw);

    const clearBtn = document.getElementById("draw-clear");
    if (clearBtn) clearBtn.addEventListener("click", function () {
        if (!canvasHasContent()) return;
        if (!confirm("Tüm çizim silinsin mi? Bu işlem geri alınabilir.")) return;
        clearCanvasSilently();
        drawDirty = true;
        commitDrawHistory();
        scheduleDraftSave();
    });

    // Renk paleti gezinme
    const palettePrev = document.getElementById("palette-prev");
    const paletteNext = document.getElementById("palette-next");
    if (palettePrev) palettePrev.addEventListener("click", function () { scrollPalette(-1); });
    if (paletteNext) paletteNext.addEventListener("click", function () { scrollPalette(1); });

    if (drawPaletteViewport) {
        drawPaletteViewport.addEventListener("scroll", updatePalettePageInfo);
        drawPaletteViewport.addEventListener("pointerup", updatePalettePageInfo);
    }
    window.addEventListener("resize", function () {
        fitDrawWorkspace();
        updatePalettePageInfo();
    });

    // Çizim / taşıma / damlalık / kova
    drawCanvas.addEventListener("pointerdown", beginDrawStroke);
    drawCanvas.addEventListener("pointermove", continueDrawStroke);
    drawCanvas.addEventListener("pointerup", endDrawStroke);
    drawCanvas.addEventListener("pointercancel", endDrawStroke);
    window.addEventListener("pointerup", endDrawStroke);
    window.addEventListener("pointercancel", endDrawStroke);

    // Tasarım aksiyonları
    const saveBtn = document.getElementById("draw-save");
    const createAiBtn = document.getElementById("draw-create-ai");
    if (saveBtn) saveBtn.addEventListener("click", openSaveFlow);
    if (createAiBtn) createAiBtn.addEventListener("click", openAiPrepareFlow);

    // Taslak
    const draftRestore = document.getElementById("draw-draft-restore");
    const draftDiscard = document.getElementById("draw-draft-discard");
    if (draftRestore) draftRestore.addEventListener("click", restoreDrawDraft);
    if (draftDiscard) draftDiscard.addEventListener("click", discardDrawDraft);

    // Kayıt / AI görünüm butonları
    const saveBack = document.getElementById("save-back-to-draw");
    const saveCancel = document.getElementById("save-cancel");
    const saveConfirm = document.getElementById("save-confirm");
    if (saveBack) saveBack.addEventListener("click", function () { showStudioView("draw"); });
    if (saveCancel) saveCancel.addEventListener("click", function () { showStudioView("draw"); });
    if (saveConfirm) saveConfirm.addEventListener("click", saveDesignFlow);

    const aiBack = document.getElementById("ai-pending-back");
    const aiCancel = document.getElementById("ai-pending-cancel");
    const aiSave = document.getElementById("ai-pending-save");
    if (aiBack) aiBack.addEventListener("click", function () { showStudioView("draw"); });
    if (aiCancel) aiCancel.addEventListener("click", function () { showStudioView("draw"); });
    if (aiSave) aiSave.addEventListener("click", openSaveFlow);
}

initDrawStudio();

// Kaydedilmemiş çizim varken sayfadan ayrılmayı engelle.
window.addEventListener("beforeunload", function (e) {
    if (drawDirty) {
        e.preventDefault();
        e.returnValue = "";
    }
});

// ============================================================
// AI DESIGN — yazılı konsept üretimi
// ------------------------------------------------------------
// Bu modül dış bir API çağırmaz. Yazılı açıklamayı yerel, kural
// tabanlı bir motorla analiz edip 4 farklı konsept üretir.
// Seçilen konsept, gelecekteki görsel üretim aşamasına girdi olacak
// yapılandırılmış veri olarak saklanır. Bu aşamada görsel üretilmez.
// ============================================================
const STUDIO_AI_STATE_KEY = "doll_studio_ai_state";
const STUDIO_AI_PREPARED_KEY = "doll_studio_ai_prepared";
const AI_STATE_VERSION = 1;
const AI_CONCEPT_COUNT = 4;
const AI_PROMPT_MAX = 600;
const AI_REFINE_MAX = 300;
const AI_HISTORY_LIMIT = 12;
const AI_RETIRED_LIMIT = 40;

// Tüm varyantlar kullanıldıysa bireysel yeniden üretimde ayırt edici
// bir detay eklemek için kullanılan küçük havuz.
const AI_REROLL_DETAILS = [
    "kontrast biye", "metal düğme", "asimetrik etek ucu", "katmanlı kol ucu",
    "işlemeli yaka", "yan cepler", "bağcık detayı", "parlak dikiş"
];

const AI_CATEGORY_LABELS = {
    clothes: "Clothes",
    shoes: "Shoes",
    accessories: "Accessories",
    hair: "Hair",
    haircolor: "Hair Color",
    face: "Face",
    skin: "Skin"
};

const AI_CHARACTER_LABELS = {
    girl: "Kız bebek",
    boy: "Erkek bebek"
};

const AI_DEFAULT_TYPES = {
    dress: "Elbise",
    top: "Üst",
    bottom: "Alt Giyim",
    outerwear: "Dış Giyim",
    outfit: "Kombin",
    shoes: "Ayakkabı",
    accessories: "Aksesuar",
    hair: "Saç Modeli",
    haircolor: "Saç Rengi",
    face: "Yüz",
    skin: "Ten"
};

const AI_FAMILY_CATEGORY = {
    dress: "clothes",
    top: "clothes",
    bottom: "clothes",
    outerwear: "clothes",
    outfit: "clothes",
    shoes: "shoes",
    accessories: "accessories",
    hair: "hair",
    haircolor: "haircolor",
    face: "face",
    skin: "skin"
};

// ---------- metin yardımcıları ----------
function aiNormalize(text) {
    return String(text || "")
        .toLocaleLowerCase("tr-TR")
        .replace(/ı/g, "i")
        .replace(/ş/g, "s")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .replace(/\s+/g, " ")
        .trim();
}

function aiEscapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Kısa/çakışan anahtarlar tam kelime olarak aranır: "minimal" -> "mini"
// veya "saçak" -> "saç" gibi yanlış eşleşmeleri önler.
const AI_EXACT_KEYS = {
    mini: true, midi: true, maksi: true, maxi: true,
    mor: true, red: true, deri: true,
    sac: true, ten: true, kas: true, bot: true, tac: true, kot: true,
    kemer: true, ring: true, bag: true, tie: true, hat: true,
    mask: true, bow: true, bun: true, bob: true,
    lace: true, fur: true
};

// 4+ harfli anahtarlarda Türkçe ekleri de yakalamak için substring,
// kısa anahtarlarda yanlış eşleşmeyi önlemek için kelime başı aranır.
function aiHas(norm, key) {
    if (!norm || !key) return false;
    if (AI_EXACT_KEYS[key]) {
        return new RegExp("(^|[^a-z0-9])" + aiEscapeRegExp(key) + "([^a-z0-9]|$)").test(norm);
    }
    if (key.length >= 4) return norm.indexOf(key) !== -1;
    return new RegExp("(^|[^a-z0-9])" + aiEscapeRegExp(key)).test(norm);
}

function aiMatchDefinition(norm, defs) {
    let best = null;
    let bestLen = 0;
    (defs || []).forEach(function (def) {
        (def.keys || []).forEach(function (key) {
            if (aiHas(norm, key) && key.length > bestLen) {
                best = def;
                bestLen = key.length;
            }
        });
    });
    return best;
}

function aiCollectTags(norm, defs, limit) {
    const out = [];
    (defs || []).forEach(function (def) {
        if ((def.keys || []).some(function (key) { return aiHas(norm, key); })) {
            if (out.indexOf(def.label) === -1) out.push(def.label);
        }
    });
    return out.slice(0, limit || out.length);
}

function aiUnique(list) {
    const out = [];
    (list || []).forEach(function (item) {
        if (item && out.indexOf(item) === -1) out.push(item);
    });
    return out;
}

function aiUniqueByText(list) {
    const seen = {};
    const out = [];
    (list || []).forEach(function (item) {
        const key = aiNormalize(item);
        if (!key || seen[key]) return;
        seen[key] = true;
        out.push(item);
    });
    return out;
}

function aiUniqueColors(colors) {
    const out = [];
    (colors || []).forEach(function (color) {
        if (!color) return;
        const exists = out.some(function (c) {
            return c.hex === color.hex || c.name === color.name;
        });
        if (!exists) out.push(color);
    });
    return out;
}

function aiMixHex(hex, target, ratio) {
    const a = parseHex(hex);
    const b = parseHex(target);
    if (!a || !b) return hex;
    const mix = function (x, y) { return Math.round(x + (y - x) * ratio); };
    return rgbToHex(mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b));
}

function aiTruncate(text, max) {
    const value = String(text || "");
    return value.length > max ? value.slice(0, max - 1).trim() + "…" : value;
}

// ---------- renk sözlüğü ----------
// Anahtarlar aiNormalize çıktısıyla aynı biçimde (ASCII, küçük harf) yazılır.
const AI_COLOR_DEFS = [
    { keys: ["pastel pembe", "acik pembe", "baby pink"], name: "Pastel Pembe", hex: "#f8bbd0" },
    { keys: ["fusya", "fuschia", "magenta"], name: "Fuşya", hex: "#d81b8c" },
    { keys: ["pembe", "pink", "rose"], name: "Pembe", hex: "#f48fb1" },
    { keys: ["kirmizi", "red"], name: "Kırmızı", hex: "#d7263d" },
    { keys: ["bordo", "burgundy", "marsala"], name: "Bordo", hex: "#6d1f3a" },
    { keys: ["somon", "salmon"], name: "Somon", hex: "#ff9f8a" },
    { keys: ["seftali", "peach"], name: "Şeftali", hex: "#ffcba4" },
    { keys: ["turuncu", "orange"], name: "Turuncu", hex: "#fb8c00" },
    { keys: ["hardal", "mustard"], name: "Hardal", hex: "#d4a017" },
    { keys: ["limon", "lemon"], name: "Limon Sarısı", hex: "#f4ef6b" },
    { keys: ["sari", "yellow"], name: "Sarı", hex: "#fdd835" },
    { keys: ["zumrut", "emerald"], name: "Zümrüt Yeşili", hex: "#1b7a4d" },
    { keys: ["fistik", "pistachio"], name: "Fıstık Yeşili", hex: "#b5cf6b" },
    { keys: ["yesil", "green"], name: "Yeşil", hex: "#4caf50" },
    { keys: ["mint", "nane"], name: "Mint", hex: "#a8e6d5" },
    { keys: ["turkuaz", "turquoise", "teal"], name: "Turkuaz", hex: "#26c6da" },
    { keys: ["gok mavisi", "sky blue", "acik mavi"], name: "Açık Mavi", hex: "#b5d8f7" },
    { keys: ["lacivert", "navy"], name: "Lacivert", hex: "#1a237e" },
    { keys: ["denim"], name: "Denim Mavisi", hex: "#4a6fa5" },
    { keys: ["mavi", "blue"], name: "Mavi", hex: "#4a90d9" },
    { keys: ["lila", "lavanta", "lavender"], name: "Lila", hex: "#cdb4f6" },
    { keys: ["orkide", "orchid"], name: "Orkide", hex: "#c17fd4" },
    { keys: ["mor", "purple", "violet"], name: "Mor", hex: "#8e5bb5" },
    { keys: ["karamel", "caramel"], name: "Karamel", hex: "#b26a3c" },
    { keys: ["kahverengi", "brown"], name: "Kahverengi", hex: "#795548" },
    { keys: ["bej", "beige"], name: "Bej", hex: "#e8d3b9" },
    { keys: ["krem", "cream"], name: "Krem", hex: "#f2e3c8" },
    { keys: ["ekru", "ivory"], name: "Ekru", hex: "#f6efe3" },
    { keys: ["gumus", "silver"], name: "Gümüş", hex: "#cfd8dc" },
    { keys: ["altin", "gold"], name: "Altın", hex: "#d4af37" },
    { keys: ["antrasit", "charcoal"], name: "Antrasit", hex: "#3d4650" },
    { keys: ["gri", "gray", "grey"], name: "Gri", hex: "#9aa3ad" },
    { keys: ["siyah", "black"], name: "Siyah", hex: "#2b2b33" },
    { keys: ["beyaz", "white"], name: "Beyaz", hex: "#fdfbf7" }
];

const AI_STYLE_DEFS = [
    { keys: ["prenses", "princess"], label: "Prenses" },
    { keys: ["gotik", "gothic"], label: "Gotik" },
    { keys: ["vintage", "retro"], label: "Vintage" },
    { keys: ["spor", "sporty", "sport", "atletik", "athletic"], label: "Spor" },
    { keys: ["gundelik", "casual", "gunluk"], label: "Gündelik" },
    { keys: ["resmi", "formal", "abiye", "balo", "gece", "davet", "party", "parti"], label: "Davet" },
    { keys: ["yazlik", "summer"], label: "Yazlık" },
    { keys: ["kislik", "winter"], label: "Kışlık" },
    { keys: ["pastel"], label: "Pastel" },
    { keys: ["lolita"], label: "Lolita" },
    { keys: ["denizci", "nautical", "marin"], label: "Denizci" },
    { keys: ["denim", "jean"], label: "Denim" },
    { keys: ["deri", "derili", "leather"], label: "Deri" },
    { keys: ["peri", "fairy"], label: "Peri" },
    { keys: ["kawaii", "seker", "cute", "tatli"], label: "Kawaii" },
    { keys: ["minimal", "sade", "clean"], label: "Minimal" },
    { keys: ["bohem", "boho"], label: "Bohem" },
    { keys: ["akademi", "preppy", "okul"], label: "Akademi" },
    { keys: ["punk", "rock", "grunge"], label: "Punk" },
    { keys: ["fantezi", "fantasy"], label: "Fantezi" },
    { keys: ["kahraman", "superhero"], label: "Süper Kahraman" },
    { keys: ["hayvan", "animal"], label: "Hayvan Temalı" },
    { keys: ["etnik", "ethnic", "folk"], label: "Etnik" },
    { keys: ["masal", "masalsi"], label: "Masalsı" },
    { keys: ["romantik", "romantic"], label: "Romantik" }
];

const AI_DETAIL_DEFS = [
    { keys: ["fiyonk", "kurdele", "bow"], label: "Fiyonk" },
    { keys: ["dantel", "lace"], label: "Dantel" },
    { keys: ["payet", "sequin"], label: "Payet" },
    { keys: ["inci", "pearl"], label: "İnci" },
    { keys: ["tas isleme", "tasli", "rhinestone", "crystal"], label: "Taş İşleme" },
    { keys: ["nakis", "embroider", "islemeli"], label: "Nakış" },
    { keys: ["cicek", "floral", "flower"], label: "Çiçek Deseni" },
    { keys: ["yildiz", "starry"], label: "Yıldız Deseni" },
    { keys: ["puantiye", "polka", "puantiyeli"], label: "Puantiyeli" },
    { keys: ["cizgili", "striped", "stripe"], label: "Çizgili" },
    { keys: ["kareli", "plaid", "ekose"], label: "Kareli" },
    { keys: ["deri", "derili", "leather"], label: "Deri" },
    { keys: ["denim", "jean"], label: "Denim" },
    { keys: ["saten", "satin"], label: "Saten" },
    { keys: ["kadife", "velvet"], label: "Kadife" },
    { keys: ["tullu", "tulle", "tul etek"], label: "Tül" },
    { keys: ["orgu", "knit", "knitted"], label: "Örgü" },
    { keys: ["firfir", "ruffle", "volan"], label: "Fırfır" },
    { keys: ["cep", "pocket"], label: "Cep" },
    { keys: ["dugme", "button"], label: "Düğme" },
    { keys: ["bagcik", "lace-up", "lacing"], label: "Bağcık" },
    { keys: ["kemerli", "kemer", "belt", "belted"], label: "Kemer" },
    { keys: ["kapuson", "hood", "hooded"], label: "Kapüşon" },
    { keys: ["asimetrik", "asymmetric"], label: "Asimetrik" },
    { keys: ["pilise", "pilili", "pleated"], label: "Pile" },
    { keys: ["yirtmac", "slit"], label: "Yırtmaç" },
    { keys: ["kuyruk", "train"], label: "Kuyruk" },
    { keys: ["pelerin", "cape"], label: "Pelerin" },
    { keys: ["simli", "glitter", "sparkle"], label: "Sim" },
    { keys: ["kurk", "fur"], label: "Kürk" },
    { keys: ["zincir", "chain"], label: "Zincir" },
    { keys: ["baski", "print", "grafik"], label: "Baskı" }
];

const AI_LENGTH_DEFS = [
    { keys: ["cok kisa"], label: "Çok kısa boy" },
    { keys: ["diz ustu"], label: "Diz üstü boy" },
    { keys: ["diz alti", "diz boyu"], label: "Diz boyu" },
    { keys: ["maksi", "maxi", "yerlere kadar"], label: "Maksi boy" },
    { keys: ["midi"], label: "Midi boy" },
    { keys: ["mini"], label: "Mini boy" },
    { keys: ["uzun"], label: "Uzun boy" },
    { keys: ["kisa"], label: "Kısa boy" }
];

const AI_SLEEVE_DEFS = [
    { keys: ["uzun kollu", "uzun kol", "long sleeve", "long-sleeve"], label: "Uzun kol" },
    { keys: ["kisa kollu", "kisa kol", "short sleeve", "short-sleeve"], label: "Kısa kol" },
    { keys: ["balon kol", "puf kol", "puff sleeve"], label: "Balon kol" },
    { keys: ["volanli kol", "firfir kol", "ruffle sleeve"], label: "Fırfırlı kol" },
    { keys: ["dusuk omuz", "drop shoulder"], label: "Düşük omuz" },
    { keys: ["tek omuz", "one shoulder"], label: "Tek omuz" },
    { keys: ["pelerin kol", "cape sleeve"], label: "Pelerin kol" },
    { keys: ["kolsuz", "sleeveless"], label: "Kolsuz" },
    { keys: ["askili", "spaghetti strap", "strappy"], label: "Askılı" }
];

const AI_NECKLINE_DEFS = [
    { keys: ["v yaka", "v-neck", "v neck"], label: "V yaka" },
    { keys: ["bisiklet yaka", "crew neck"], label: "Bisiklet yaka" },
    { keys: ["kalp yaka", "sweetheart"], label: "Kalp yaka" },
    { keys: ["kare yaka", "square neck"], label: "Kare yaka" },
    { keys: ["balikci yaka", "turtleneck", "polo yaka"], label: "Balıkçı yaka" },
    { keys: ["gomlek yaka", "shirt collar", "klasik yaka"], label: "Gömlek yaka" },
    { keys: ["tek omuz", "one shoulder"], label: "Tek omuz" },
    { keys: ["off shoulder", "acik omuz"], label: "Açık omuz" },
    { keys: ["kruvaze yaka", "wrap neck"], label: "Kruvaze yaka" },
    { keys: ["kapusonlu yaka", "hooded"], label: "Kapüşonlu yaka" },
    { keys: ["drapeli yaka", "drape"], label: "Drapeli yaka" },
    { keys: ["halter"], label: "Halter yaka" }
];

const AI_SILHOUETTE_DEFS = [
    { keys: ["a kesim", "a-line"], label: "A kesim" },
    { keys: ["balik kesim", "mermaid"], label: "Balık kesim" },
    { keys: ["prenses kesim", "princess cut"], label: "Prenses kesim" },
    { keys: ["vucuda oturan", "fitted", "bodycon"], label: "Vücuda oturan" },
    { keys: ["oversize", "oversized", "bol kesim"], label: "Oversize" },
    { keys: ["boxy", "kutu kesim"], label: "Boxy" },
    { keys: ["katmanli", "layered", "kat kat"], label: "Katmanlı" },
    { keys: ["asimetrik", "asymmetric"], label: "Asimetrik" },
    { keys: ["pilise", "pilili", "pleated"], label: "Pilili" },
    { keys: ["empire bel", "empire waist"], label: "Empire bel" },
    { keys: ["kruvaze kesim", "wrap"], label: "Kruvaze" },
    { keys: ["duz kesim", "straight"], label: "Düz kesim" },
    { keys: ["salincak kesim", "swing"], label: "Salıncak kesim" },
    { keys: ["korse kesim", "corset"], label: "Korse kesim" }
];

const AI_WAIST_DEFS = [
    { keys: ["yuksek bel", "high waist"], label: "Yüksek bel" },
    { keys: ["dusuk bel", "low rise", "low waist"], label: "Düşük bel" },
    { keys: ["lastikli bel", "elastic waist"], label: "Lastikli bel" },
    { keys: ["baglamali bel", "tie waist"], label: "Bağlamalı bel" },
    { keys: ["kemerli bel", "belted waist"], label: "Kemerli bel" }
];

const AI_HAIR_LENGTH_DEFS = [
    { keys: ["uzun sac", "uzun sacli"], label: "Uzun" },
    { keys: ["kisa sac", "kisa sacli", "kisa bob"], label: "Kısa" },
    { keys: ["omuz hizasi", "omuz boyu"], label: "Omuz hizası" },
    { keys: ["bel hizasi"], label: "Bel hizası" },
    { keys: ["sirt ortasi"], label: "Sırt ortası" },
    { keys: ["cene hizasi"], label: "Çene hizası" }
];

// ---------- kıyafet / kategori tespiti ----------
// En uzun eşleşen anahtar kazanır (ör. "saç tokası" > "saç").
const AI_GARMENT_RULES = [
    { keys: ["sac rengi", "sac boyasi", "hair color", "hair colour", "ombre", "balyaj", "highlight"], family: "haircolor", type: "Saç Rengi" },

    { keys: ["sac tokasi", "toka", "hair clip", "klips"], family: "accessories", type: "Saç Tokası" },
    { keys: ["sirt cantasi", "backpack"], family: "accessories", type: "Sırt Çantası" },
    { keys: ["el cantasi", "canta", "bag", "purse"], family: "accessories", type: "Çanta" },
    { keys: ["gozluk", "glasses", "sunglasses"], family: "accessories", type: "Gözlük" },
    { keys: ["bandana", "headband"], family: "accessories", type: "Bandana" },
    { keys: ["tacli", "tac", "crown"], family: "accessories", type: "Taç" },
    { keys: ["kupe", "earring"], family: "accessories", type: "Küpe" },
    { keys: ["kolye", "necklace"], family: "accessories", type: "Kolye" },
    { keys: ["bileklik", "bracelet"], family: "accessories", type: "Bileklik" },
    { keys: ["yuzuk", "ring"], family: "accessories", type: "Yüzük" },
    { keys: ["sapka", "kasket", "hat", "bere", "beanie"], family: "accessories", type: "Şapka" },
    { keys: ["atki", "scarf"], family: "accessories", type: "Atkı" },
    { keys: ["eldiven", "glove"], family: "accessories", type: "Eldiven" },
    { keys: ["kemer", "belt"], family: "accessories", type: "Kemer" },
    { keys: ["corap", "socks"], family: "accessories", type: "Çorap" },
    { keys: ["kravat", "tie"], family: "accessories", type: "Kravat" },
    { keys: ["papyon", "bow tie"], family: "accessories", type: "Papyon" },
    { keys: ["bros", "brooch"], family: "accessories", type: "Broş" },
    { keys: ["maske", "mask"], family: "accessories", type: "Maske" },
    { keys: ["kanat", "wings"], family: "accessories", type: "Kanat" },

    { keys: ["spor ayakkabi", "sneaker"], family: "shoes", type: "Sneaker" },
    { keys: ["bot", "boots", "cizme"], family: "shoes", type: "Bot" },
    { keys: ["sandalet", "sandals"], family: "shoes", type: "Sandalet" },
    { keys: ["terlik", "slipper"], family: "shoes", type: "Terlik" },
    { keys: ["topuklu", "heels"], family: "shoes", type: "Topuklu Ayakkabı" },
    { keys: ["babet", "loafer", "bale ayakkabisi"], family: "shoes", type: "Babet" },
    { keys: ["ayakkabi", "shoes"], family: "shoes", type: "Ayakkabı" },

    { keys: ["orgulu", "orgu", "braid", "balik sirti"], family: "hair", type: "Örgülü Saç" },
    { keys: ["at kuyrugu", "ponytail"], family: "hair", type: "At Kuyruğu" },
    { keys: ["topuz", "bun"], family: "hair", type: "Topuz" },
    { keys: ["kivircik", "curly", "bukle"], family: "hair", type: "Kıvırcık Saç" },
    { keys: ["dalgali", "dalga", "wavy"], family: "hair", type: "Dalgalı Saç" },
    { keys: ["kakul", "bangs", "perde kakul"], family: "hair", type: "Kaküllü Saç" },
    { keys: ["bob", "kisa bob"], family: "hair", type: "Bob Kesim" },
    { keys: ["sac modeli", "saclar", "sacli", "sac"], family: "hair", type: "Saç Modeli" },
    { keys: ["makyaj", "makeup", "yuz", "face", "kaslar", "kas"], family: "face", type: "Yüz" },
    { keys: ["ten rengi", "ten", "skin"], family: "skin", type: "Ten" },

    { keys: ["takim elbise", "kostum", "suit"], family: "outfit", type: "Kombin" },
    { keys: ["esofman takimi", "tracksuit set"], family: "outfit", type: "Kombin" },
    { keys: ["tulum", "jumpsuit", "overalls"], family: "dress", type: "Tulum" },
    { keys: ["gelinlik"], family: "dress", type: "Gelinlik" },
    { keys: ["abiye"], family: "dress", type: "Abiye" },
    { keys: ["elbise", "dress", "gown"], family: "dress", type: "Elbise" },

    { keys: ["trenckot", "trenchcoat", "trench"], family: "outerwear", type: "Trençkot" },
    { keys: ["kaban", "coat"], family: "outerwear", type: "Kaban" },
    { keys: ["mont", "parka", "puffer"], family: "outerwear", type: "Mont" },
    { keys: ["ceket", "jacket", "blazer"], family: "outerwear", type: "Ceket" },
    { keys: ["hirka", "cardigan"], family: "outerwear", type: "Hırka" },
    { keys: ["yelek", "vest"], family: "outerwear", type: "Yelek" },

    { keys: ["gomlek", "shirt"], family: "top", type: "Gömlek" },
    { keys: ["bluz", "blouse"], family: "top", type: "Bluz" },
    { keys: ["tisort", "tshirt", "t-shirt"], family: "top", type: "Tişört" },
    { keys: ["sweatshirt", "sweat"], family: "top", type: "Sweatshirt" },
    { keys: ["kazak", "sweater"], family: "top", type: "Kazak" },
    { keys: ["bustiyer", "corset"], family: "top", type: "Büstiyer" },
    { keys: ["crop"], family: "top", type: "Crop Üst" },
    { keys: ["polo"], family: "top", type: "Polo Yaka Üst" },

    { keys: ["pantolon", "pants", "trousers", "jean", "kot"], family: "bottom", type: "Pantolon" },
    { keys: ["etek", "skirt"], family: "bottom", type: "Etek" },
    { keys: ["sort", "shorts"], family: "bottom", type: "Şort" },
    { keys: ["esofman", "tracksuit"], family: "bottom", type: "Eşofman" },
    { keys: ["jogger"], family: "bottom", type: "Jogger" },
    { keys: ["tayt", "leggings"], family: "bottom", type: "Tayt" }
];

const AI_FAMILY_FIELDS = {
    dress: ["silhouette", "neckline", "sleeves", "lengthShape", "details"],
    top: ["silhouette", "neckline", "sleeves", "lengthShape", "details"],
    outfit: ["silhouette", "neckline", "sleeves", "lengthShape", "details"],
    outerwear: ["silhouette", "neckline", "sleeves", "lengthShape", "details"],
    bottom: ["silhouette", "lengthShape", "details"],
    shoes: ["silhouette", "toe", "heel", "lengthShape", "details"],
    accessories: ["silhouette", "material", "details"],
    hair: ["silhouette", "lengthShape", "texture", "details"],
    haircolor: ["technique", "finish", "details"],
    face: ["expression", "eyes", "brows", "details"],
    skin: ["finish", "coverage", "details"]
};

const AI_FIELD_LABELS = {
    silhouette: "Siluet / kesim",
    neckline: "Yaka",
    sleeves: "Kol",
    lengthShape: "Boy ve form",
    details: "Süsleme ve detaylar",
    toe: "Burun",
    heel: "Topuk / taban",
    material: "Materyal",
    texture: "Doku",
    technique: "Uygulama",
    finish: "Bitiş",
    expression: "İfade",
    eyes: "Göz",
    brows: "Kaş",
    coverage: "Kaplama"
};

function aiFieldLabel(family, key) {
    if (key === "silhouette") {
        if (family === "shoes") return "Form / kesim";
        if (family === "accessories") return "Form / boyut";
        if (family === "hair") return "Kesim";
    }
    if (key === "lengthShape" && (family === "shoes" || family === "hair")) return "Boy";
    if (key === "details" && family === "accessories") return "Detaylar";
    return AI_FIELD_LABELS[key] || key;
}

const AI_PALETTES = {
    pastel: [
        { name: "Pembe", hex: "#f7a8c4" }, { name: "Lila", hex: "#cdb4f6" },
        { name: "Mint", hex: "#a8e6d5" }, { name: "Şeftali", hex: "#ffcba4" },
        { name: "Açık Mavi", hex: "#b5d8f7" }, { name: "Krem", hex: "#f6e7d8" },
        { name: "Sarı", hex: "#ffe38a" }, { name: "Orkide", hex: "#dda9e8" }
    ],
    dark: [
        { name: "Siyah", hex: "#2b2b33" }, { name: "Bordo", hex: "#6d1f3a" },
        { name: "Mor", hex: "#5b2a86" }, { name: "Gümüş", hex: "#cfd8dc" },
        { name: "Koyu Yeşil", hex: "#1b5e20" }, { name: "Lacivert", hex: "#1a237e" },
        { name: "Antrasit", hex: "#3d4650" }, { name: "Koyu Kırmızı", hex: "#8e1c2e" }
    ],
    vivid: [
        { name: "Kırmızı", hex: "#d7263d" }, { name: "Turuncu", hex: "#fb8c00" },
        { name: "Turkuaz", hex: "#26c6da" }, { name: "Sarı", hex: "#fdd835" },
        { name: "Fuşya", hex: "#d81b8c" }, { name: "Mor", hex: "#8e5bb5" },
        { name: "Limon", hex: "#f4ef6b" }, { name: "Mavi", hex: "#4a90d9" }
    ],
    earth: [
        { name: "Karamel", hex: "#b26a3c" }, { name: "Bej", hex: "#e8d3b9" },
        { name: "Zeytin", hex: "#7c8a3e" }, { name: "Terracotta", hex: "#c96f4a" },
        { name: "Krem", hex: "#f2e3c8" }, { name: "Kahverengi", hex: "#795548" },
        { name: "Hardal", hex: "#d4a017" }, { name: "Gri", hex: "#9aa3ad" }
    ],
    denim: [
        { name: "Denim Mavisi", hex: "#4a6fa5" }, { name: "Açık Mavi", hex: "#b5d8f7" },
        { name: "Beyaz", hex: "#fdfbf7" }, { name: "Kırmızı", hex: "#d7263d" },
        { name: "Gri", hex: "#9aa3ad" }, { name: "Lacivert", hex: "#1a237e" }
    ],
    neutral: [
        { name: "Krem", hex: "#f2e3c8" }, { name: "Gri", hex: "#9aa3ad" },
        { name: "Lacivert", hex: "#1a237e" }, { name: "Beyaz", hex: "#fdfbf7" },
        { name: "Siyah", hex: "#2b2b33" }, { name: "Bej", hex: "#e8d3b9" },
        { name: "Antrasit", hex: "#3d4650" }, { name: "Altın", hex: "#d4af37" }
    ],
    hair: [
        { name: "Karamel", hex: "#b26a3c" }, { name: "Bal Köpüğü", hex: "#c98b52" },
        { name: "Koyu Kahve", hex: "#4a2c1d" }, { name: "Kızıl", hex: "#a33b20" },
        { name: "Sarı", hex: "#e0b96a" }, { name: "Siyah", hex: "#2b2b33" },
        { name: "Platin", hex: "#e8e2d9" }, { name: "Lila", hex: "#c9b6f2" }
    ],
    skin: [
        { name: "Açık Porselen", hex: "#ffe0cf" }, { name: "Şeftali", hex: "#f7cdaa" },
        { name: "Buğday", hex: "#d99a63" }, { name: "Bronz", hex: "#b06f3f" },
        { name: "Karamel", hex: "#8d5524" }, { name: "Koyu Kahve", hex: "#5c3317" }
    ]
};

// ---------- konsept varyantları ----------
// Her varyant silüet, yaka, kol, boy ve detay eksenlerinde farklıdır.
// Kullanıcının açıkça istediği değerler (ör. "uzun kollu") tüm
// konseptlerde korunur; varyasyon serbest kalan eksenlerden gelir.
const AI_VARIANTS = {
    dress: [
        { id: "d1", hint: "Fırfırlı", silhouette: "A kesim, belden hafif oturan", neckline: "Kalp yaka", sleeves: "Kısa balon kol", lengthShape: "Diz üstü, hacimli etek", details: "Fırfırlı etek ucu, saten kurdele, inci düğmeler", flavor: "Romantik" },
        { id: "d2", hint: "Payetli", silhouette: "Vücuda oturan, balık kesim", neckline: "V yaka", sleeves: "Uzun, dar kol", lengthShape: "Maksi, diz altında daralan", details: "Payet işleme, yan yırtmaç, dantel bordür", flavor: "Gece şıklığı" },
        { id: "d3", hint: "Tek Omuzlu", silhouette: "Asimetrik, tek omuz", neckline: "Tek omuz, drapeli", sleeves: "Tek kolda pelerin, diğer kol açık", lengthShape: "Uzun, asimetrik etek ucu", details: "Drapaj, metal broş, kuyruk detayı", flavor: "Modern" },
        { id: "d4", hint: "Dantelli", silhouette: "Empire bel, bebek kesim", neckline: "Fırfırlı bisiklet yaka", sleeves: "Uzun dantel kol", lengthShape: "Mini, bol etek", details: "Dantel, fiyonk, çiçek aplik", flavor: "Lolita" },
        { id: "d5", hint: "Gömlek Kesim", silhouette: "Gömlek elbise, rahat kesim", neckline: "Klasik gömlek yaka", sleeves: "Uzun, manşetli kol", lengthShape: "Midi, düz etek", details: "Kemer, düğme patı, yan cepler", flavor: "Gündelik" },
        { id: "d6", hint: "Tüllü", silhouette: "Kabarık, katmanlı prenses kesim", neckline: "Kare yaka", sleeves: "Kısa tül balon kol", lengthShape: "Uzun, çok katmanlı tül etek", details: "Tül katmanlar, taş işleme, büyük sırt fiyonğu", flavor: "Masalsı" },
        { id: "d7", hint: "Saten Askılı", silhouette: "Dökümlü, kruvaze kesim", neckline: "V yaka, ince askı", sleeves: "Kolsuz", lengthShape: "Midi, eğik kesim", details: "Saten döküm, biye, minimal yüzük detay", flavor: "Minimal" },
        { id: "d8", hint: "Volanlı", silhouette: "Katmanlı, salıncak kesim", neckline: "Yuvarlak yaka", sleeves: "Kısa volan kol", lengthShape: "Midi, katmanlı etek", details: "Volanlar, püskül, etnik nakış", flavor: "Bohem" }
    ],
    top: [
        { id: "t1", hint: "Grafikli", silhouette: "Gevşek boxy kesim", neckline: "Bisiklet yaka", sleeves: "Kısa, düşük omuz", lengthShape: "Kalça boyu, düz etek ucu", details: "Grafik baskı, ribana yaka, yan yırtmaç", flavor: "Sokak stili" },
        { id: "t2", hint: "Klasik", silhouette: "Vücuda oturan gömlek kesim", neckline: "Klasik gömlek yaka", sleeves: "Uzun, manşetli kol", lengthShape: "Kalça boyu, kavisli etek ucu", details: "Düğme patı, göğüs cebi, kontrast biye", flavor: "Akademi" },
        { id: "t3", hint: "Fırfırlı", silhouette: "Belden oturan, balon gövde", neckline: "Kare yaka", sleeves: "Kısa, balon kol", lengthShape: "Kalça üstü, lastikli etek ucu", details: "Fırfır, kurdele bağcık, dantel", flavor: "Romantik" },
        { id: "t4", hint: "Oversize", silhouette: "Oversize, düşük omuz", neckline: "Bisiklet yaka", sleeves: "Uzun, geniş kol", lengthShape: "Kalça altı, uzun etek ucu", details: "Örgü dokusu, yan yırtmaç, ribana", flavor: "Rahat" },
        { id: "t5", hint: "Kruvaze", silhouette: "Kruvaze, belden bağlamalı", neckline: "V yaka", sleeves: "Uzun, dökümlü kol", lengthShape: "Kısa, asimetrik etek ucu", details: "Yan bağlama, drapaj, çan düğme", flavor: "Zarif" },
        { id: "t6", hint: "Korse", silhouette: "Korse kesim, vücuda oturan", neckline: "Kalp yaka", sleeves: "Kolsuz / askılı", lengthShape: "Kısa, sivri etek ucu", details: "Boning dikişleri, bağcık, saten kurdele", flavor: "Parti" },
        { id: "t7", hint: "Polo", silhouette: "Rahat, düz kesim", neckline: "Polo yaka", sleeves: "Kısa kol", lengthShape: "Kalça boyu, düz etek ucu", details: "Düğmeli yaka, kontrast yaka, küçük nakış", flavor: "Spor" },
        { id: "t8", hint: "Kapüşonlu", silhouette: "Bol, düşük omuz", neckline: "Kapüşonlu yaka", sleeves: "Uzun, ribanalı kol", lengthShape: "Kalça boyu, düz etek ucu", details: "Kanguru cep, kapüşon bağcığı, ribana", flavor: "Sokak stili" }
    ],
    bottom: [
        { id: "b1", hint: "Pilili", silhouette: "A kesim, pilili", waist: "Yüksek bel, lastikli", lengthShape: "Midi, hacimli", details: "Pileler, kemer köprüsü, yan fermuar", flavor: "Zarif" },
        { id: "b2", hint: "Kot", silhouette: "Yüksek bel şort", waist: "Yüksek bel", lengthShape: "Mini, kısa paça", details: "Kot dikişleri, yırtmaç, metal düğme, cepler", flavor: "Gündelik" },
        { id: "b3", hint: "Bol Paça", silhouette: "Bol paça, düz kesim", waist: "Yüksek bel", lengthShape: "Uzun, ayak bileği", details: "Pile, kemer köprüsü, düğme patı", flavor: "Minimal" },
        { id: "b4", hint: "Kargo", silhouette: "Rahat, düşük bel", waist: "Düşük bel, lastikli", lengthShape: "Uzun, daralan paça", details: "Kargo cepler, bağcık, dikiş detayları", flavor: "Sokak stili" },
        { id: "b5", hint: "Tüllü", silhouette: "Kabarık, katmanlı", waist: "Lastikli bel", lengthShape: "Diz üstü", details: "Tül katmanlar, saten kuşak, fiyonk", flavor: "Masalsı" },
        { id: "b6", hint: "Kalem", silhouette: "Vücuda oturan kalem kesim", waist: "Yüksek bel", lengthShape: "Midi, arka yırtmaç", details: "Gizli fermuar, yan cep, astar", flavor: "Ofis şıklığı" },
        { id: "b7", hint: "Jogger", silhouette: "Rahat, daralan paça", waist: "Lastikli bel", lengthShape: "Ayak bileği", details: "Yan şerit, cepler, ribanalı paça", flavor: "Spor" },
        { id: "b8", hint: "Kruvaze", silhouette: "Kruvaze, asimetrik", waist: "Bağlamalı bel", lengthShape: "Midi, eğik kesim", details: "Yan bağlama, volan, halka detay", flavor: "Bohem" }
    ],
    outerwear: [
        { id: "o1", hint: "Kısa Ceket", silhouette: "Kısa, boxy kesim", neckline: "Klasik yaka", sleeves: "Uzun, düşük omuz", lengthShape: "Kısa, bel üstü", details: "Metal düğmeler, göğüs cepleri, astar", flavor: "Sokak stili" },
        { id: "o2", hint: "Trençkot", silhouette: "Uzun trençkot kesim", neckline: "Kruvaze yaka", sleeves: "Uzun, manşetli", lengthShape: "Diz altı", details: "Kemer, omuz apoletleri, çift sıra düğme", flavor: "Klasik" },
        { id: "o3", hint: "Şişme", silhouette: "Şişme, hacimli", neckline: "Kapüşonlu yaka", sleeves: "Uzun, lastikli kol", lengthShape: "Kalça boyu", details: "Yatay kapitone, fermuar, cepler", flavor: "Kışlık" },
        { id: "o4", hint: "Blazer", silhouette: "Vücuda oturan blazer", neckline: "İşlemeli yaka", sleeves: "Uzun kol", lengthShape: "Kalça boyu", details: "Tek düğme, astarlı, cepler", flavor: "Resmi" },
        { id: "o5", hint: "Hırka", silhouette: "Dökümlü, uzun hırka", neckline: "V yaka", sleeves: "Uzun, düşük omuz", lengthShape: "Diz altı", details: "Örgü, cepler, büyük düğmeler", flavor: "Rahat" },
        { id: "o6", hint: "Pelerin", silhouette: "Pelerin kesim", neckline: "Yuvarlak yaka", sleeves: "Kolsuz / pelerin", lengthShape: "Midi", details: "Bağcık, broş, dökümlü kumaş", flavor: "Fantezi" }
    ],
    outfit: [
        { id: "u1", hint: "Rahat Spor", silhouette: "Rahat kombin, boxy üst + jogger alt", neckline: "Bisiklet yaka", sleeves: "Uzun, düşük omuz", lengthShape: "Kalça boyu üst + ayak bileği alt", details: "Kontrast şerit, kapüşon, cepler", flavor: "Spor" },
        { id: "u2", hint: "Gömlek & Şort", silhouette: "Düz üst + rahat şort", neckline: "Klasik gömlek yaka", sleeves: "Uzun kollu gömlek", lengthShape: "Kalça boyu üst + diz üstü alt", details: "Cep detayı, kemer, düğmeler", flavor: "Gündelik" },
        { id: "u3", hint: "Sweat & Pantolon", silhouette: "Boxy üst + düz pantolon", neckline: "Bisiklet yaka", sleeves: "Uzun, düşük omuz", lengthShape: "Kalça boyu üst + uzun alt", details: "Ribana, yan şerit, cepler", flavor: "Sokak stili" },
        { id: "u4", hint: "Kazak & Etek", silhouette: "Rahat üst + pilili alt", neckline: "Bisiklet yaka", sleeves: "Uzun kol", lengthShape: "Kalça boyu üst + midi alt", details: "Örgü, pile, kemer", flavor: "Zarif" },
        { id: "u5", hint: "Kruvaze Takım", silhouette: "Kruvaze üst + düz alt", neckline: "V yaka", sleeves: "Uzun, dökümlü kol", lengthShape: "Kalça boyu üst + uzun alt", details: "Kemer, drapaj, düğmeler", flavor: "Şık" },
        { id: "u6", hint: "Denim Kombin", silhouette: "Boxy ceket + düz paça alt", neckline: "Klasik yaka", sleeves: "Uzun kol", lengthShape: "Kalça boyu üst + uzun alt", details: "Denim dikişleri, metal düğmeler, cepler", flavor: "Gündelik" }
    ],
    shoes: [
        { id: "s1", hint: "Sneaker", silhouette: "Spor ayakkabı", toe: "Yuvarlak burun", heel: "Düz taban, kalın tabanlık", lengthShape: "Bilek hizası", details: "Dikiş detayları, yan şerit, bağcık", flavor: "Spor" },
        { id: "s2", hint: "Bot", silhouette: "Bağcıklı bot", toe: "Yuvarlak burun", heel: "Kalın taban", lengthShape: "Bilek üstü", details: "Metal halkalar, dişli taban, bağcık", flavor: "Sokak stili" },
        { id: "s3", hint: "Babet", silhouette: "Mary Jane babet", toe: "Yuvarlak burun", heel: "Kısa topuk", lengthShape: "Bilek hizası", details: "Kemer toka, kalp kesim, rugan", flavor: "Romantik" },
        { id: "s4", hint: "Sandalet", silhouette: "İnce bantlı sandalet", toe: "Açık burun", heel: "İnce topuk", lengthShape: "Bilekten bağlamalı", details: "İnce bantlar, payet, çiçek detay", flavor: "Parti" },
        { id: "s5", hint: "Loafer", silhouette: "Loafer", toe: "Yuvarlak burun", heel: "Düz taban", lengthShape: "Bilek hizası", details: "Metal toka, püskül, dikiş", flavor: "Akademi" },
        { id: "s6", hint: "Platform Bot", silhouette: "Platform bot", toe: "Kalın burun", heel: "Platform taban", lengthShape: "Diz altı", details: "Fermuar, bağcık, blok topuk", flavor: "Punk" },
        { id: "s7", hint: "Bale", silhouette: "Bale ayakkabısı", toe: "Sivri burun", heel: "İnce taban", lengthShape: "Bilek hizası", details: "Fiyonk, elastik bant, yumuşak deri", flavor: "Zarif" },
        { id: "s8", hint: "Slip-on", silhouette: "Slip-on", toe: "Yuvarlak burun", heel: "Düz taban", lengthShape: "Bilek hizası", details: "Lastik yan panel, dikiş, minimal logo", flavor: "Gündelik" }
    ],
    accessories: [
        { id: "a1", hint: "Fiyonklu", silhouette: "Küçük, yuvarlak çanta", material: "Saten", details: "Zincir askı, fiyonk, inci detay", flavor: "Romantik" },
        { id: "a2", hint: "Sırt Çantası", silhouette: "Kompakt sırt çantası", material: "Kadife", details: "Fermuar, cepler, kalp kilit", flavor: "Kawaii" },
        { id: "a3", hint: "Taç", silhouette: "Geniş taç / bandana", material: "Saten", details: "Fiyonk, taş, dantel", flavor: "Prenses" },
        { id: "a4", hint: "Oval", silhouette: "Oval gözlük", material: "Asetat", details: "Renkli cam, ince sap, çiçek vida", flavor: "Retro" },
        { id: "a5", hint: "Katmanlı", silhouette: "Kısa, katmanlı kolye", material: "Altın ton", details: "Kalp kolye ucu, inci, yıldız", flavor: "Zarif" },
        { id: "a6", hint: "Kelebek", silhouette: "Büyük kelebek toka", material: "Sedef", details: "Taş işleme, parlak kaplama", flavor: "Kawaii" },
        { id: "a7", hint: "İpek", silhouette: "Kare bandana", material: "İpek", details: "Çiçek deseni, saçak, renk geçişi", flavor: "Bohem" },
        { id: "a8", hint: "İnce", silhouette: "İnce bele oturan kemer", material: "Deri", details: "Metal toka, delik detayı, yıldız zımba", flavor: "Minimal" }
    ],
    hair: [
        { id: "h1", hint: "Dalgalı", silhouette: "Uzun dalgalı kesim", lengthShape: "Sırt ortası", texture: "Yumuşak dalgalar", details: "Katmanlı kesim, yüz çerçeveleyen tutamlar", flavor: "Romantik" },
        { id: "h2", hint: "Topuz", silhouette: "Yüksek topuz", lengthShape: "Topuz", texture: "Parlak, düz", details: "Fiyonk toka, dağınık tutamlar", flavor: "Zarif" },
        { id: "h3", hint: "Örgülü", silhouette: "İkili örgü", lengthShape: "Omuz altı", texture: "Sıkı örgü", details: "İnce kurdeleler, çiçek tokalar", flavor: "Masalsı" },
        { id: "h4", hint: "At Kuyruğu", silhouette: "Yüksek at kuyruğu", lengthShape: "Bel hizası", texture: "Düz ve parlak", details: "Kabarık kök, renkli bağ", flavor: "Spor" },
        { id: "h5", hint: "Bob", silhouette: "Kısa bob kesim", lengthShape: "Çene hizası", texture: "Hafif dalgalı", details: "Küt kesim, perde kakül", flavor: "Modern" },
        { id: "h6", hint: "Kıvırcık", silhouette: "Hacimli kıvırcık", lengthShape: "Omuz hizası", texture: "Sık bukleler", details: "Hacimli üst, nemli görünüm", flavor: "Doğal" }
    ],
    haircolor: [
        { id: "hc1", hint: "Düz Boya", technique: "Tüm saça eşit uygulama", finish: "Parlak ve homojen", details: "Sağlıklı görünüm, ışık yansıması", flavor: "Klasik" },
        { id: "hc2", hint: "Balyaj", technique: "Uçlara doğru açılan geçiş", finish: "Doğal geçiş", details: "Yüzü çevreleyen açık tutamlar", flavor: "Doğal" },
        { id: "hc3", hint: "Ombre", technique: "Kök koyu, uçlar açık", finish: "Kontrastlı geçiş", details: "Belirgin renk geçişi", flavor: "Modern" },
        { id: "hc4", hint: "Highlight", technique: "İnce ışıltı çizgileri", finish: "Boyutlu görünüm", details: "Işık yakalayan tutamlar", flavor: "Zarif" },
        { id: "hc5", hint: "Renkli Uçlar", technique: "Uçlara canlı renk", finish: "Yarı mat", details: "Kontrast uçlar, parlak ışıltı", flavor: "Punk" },
        { id: "hc6", hint: "Pastel Ton", technique: "Açık zemin üzerine pastel", finish: "Yumuşak, mat", details: "Yumuşak renk geçişi", flavor: "Kawaii" }
    ],
    face: [
        { id: "f1", hint: "Neşeli", expression: "Neşeli, hafif gülümseme", eyes: "Işıltılı far, ince eyeliner", brows: "Doğal yay", details: "Yanak allığı, parlak dudak", flavor: "Gündelik" },
        { id: "f2", hint: "Dramatik", expression: "Sakin, çekici bakış", eyes: "Dumanlı göz makyajı", brows: "Keskin hatlar", details: "Koyu eyeliner, mat ruj", flavor: "Gece" },
        { id: "f3", hint: "Masalsı", expression: "Yumuşak, huzurlu bakış", eyes: "Pastel far, sim", brows: "İnce ve doğal", details: "Işıltılı allık, parlak dudak", flavor: "Peri" },
        { id: "f4", hint: "Doğal", expression: "Sıcak gülümseme", eyes: "Şeffaf maskara", brows: "Doğal", details: "Hafif allık, nemli dudak", flavor: "Minimal" },
        { id: "f5", hint: "Retro", expression: "Kendinden emin bakış", eyes: "Kedi gözü eyeliner", brows: "Belirgin", details: "Kırmızı dudak, hafif allık", flavor: "Vintage" },
        { id: "f6", hint: "Kawaii", expression: "Parlak, neşeli bakış", eyes: "Büyük göz ışıltısı", brows: "Yumuşak", details: "Pembe allık, parlak dudak", flavor: "Kawaii" }
    ],
    skin: [
        { id: "sk1", hint: "Işıltılı", finish: "Doğal ışıltı", coverage: "Hafif", details: "Hafif allık, nemli görünüm", flavor: "Gündelik" },
        { id: "sk2", hint: "Mat", finish: "İpeksi mat", coverage: "Orta", details: "Pürüzsüz görünüm, hafif kontur", flavor: "Minimal" },
        { id: "sk3", hint: "Şeftali", finish: "Sıcak ışıltı", coverage: "Hafif", details: "Şeftali allık, hafif bronz", flavor: "Yazlık" },
        { id: "sk4", hint: "Porselen", finish: "Pürüzsüz porselen", coverage: "Orta-yüksek", details: "Aydınlık görünüm, ince highlight", flavor: "Zarif" },
        { id: "sk5", hint: "Bronz", finish: "Bronz ışıltı", coverage: "Hafif-orta", details: "Sıcak tonlar, hafif kontur", flavor: "Yazlık" },
        { id: "sk6", hint: "Kadifemsi", finish: "Kadifemsi mat", coverage: "Orta", details: "Yumuşak odak, doğal allık", flavor: "Gece" }
    ]
};

// Belirli bir ürün istendiğinde (ör. "etek", "bot", "çanta") o ürünün
// türünde kalırız; yalnızca kesim, renk ve süslemeler çeşitlenir.
function aiBuildProfile(family, prefix, rows) {
    return rows.map(function (row, i) {
        const variant = { id: prefix + (i + 1) };
        if (family === "bottom") {
            variant.hint = row[0];
            variant.silhouette = row[1];
            variant.waist = row[2];
            variant.lengthShape = row[3];
            variant.details = row[4];
            variant.flavor = row[5];
        } else if (family === "shoes") {
            variant.hint = row[0];
            variant.silhouette = row[1];
            variant.toe = row[2];
            variant.heel = row[3];
            variant.lengthShape = row[4];
            variant.details = row[5];
            variant.flavor = row[6];
        } else if (family === "accessories") {
            variant.hint = row[0];
            variant.silhouette = row[1];
            variant.material = row[2];
            variant.details = row[3];
            variant.flavor = row[4];
        } else if (family === "hair") {
            variant.hint = row[0];
            variant.silhouette = row[1];
            variant.lengthShape = row[2];
            variant.texture = row[3];
            variant.details = row[4];
            variant.flavor = row[5];
        } else {
            variant.hint = row[0];
            variant.silhouette = row[1];
            variant.neckline = row[2];
            variant.sleeves = row[3];
            variant.lengthShape = row[4];
            variant.details = row[5];
            variant.flavor = row[6];
        }
        return variant;
    });
}

const AI_TYPE_PROFILES = {
    // ----- ALT GİYİM -----
    "Etek": aiBuildProfile("bottom", "p-sk", [
        ["Pilili", "A kesim, pilili", "Yüksek bel, lastikli", "Midi, hacimli", "Pileler, kemer köprüsü, yan fermuar", "Zarif"],
        ["Tüllü", "Kabarık, katmanlı", "Lastikli bel", "Diz üstü", "Tül katmanlar, saten kuşak, fiyonk", "Masalsı"],
        ["Kalem", "Vücuda oturan kalem kesim", "Yüksek bel", "Midi, arka yırtmaç", "Gizli fermuar, yan cep, astar", "Ofis şıklığı"],
        ["Kruvaze", "Kruvaze, asimetrik", "Bağlamalı bel", "Midi, eğik kesim", "Yan bağlama, volan, halka detay", "Bohem"],
        ["Pileli Mini", "A kesim, pileli", "Yüksek bel", "Mini", "Pileler, düğmeli pat, cepler", "Gündelik"]
    ]),
    "Pantolon": aiBuildProfile("bottom", "p-pn", [
        ["Bol Paça", "Bol paça, düz kesim", "Yüksek bel", "Uzun, ayak bileği", "Pile, kemer köprüsü, düğme patı", "Minimal"],
        ["Kargo", "Rahat, düşük bel", "Düşük bel, lastikli", "Uzun, daralan paça", "Kargo cepler, bağcık, dikiş detayları", "Sokak stili"],
        ["Jogger", "Rahat, daralan paça", "Lastikli bel", "Ayak bileği", "Yan şerit, cepler, ribanalı paça", "Spor"],
        ["Düz Paça", "Vücuda oturan, düz paça", "Yüksek bel", "Uzun, ayak bileği", "Gizli fermuar, yan cep, kemer köprüsü", "Ofis şıklığı"],
        ["Kot Pantolon", "Dar kesim, klasik kot", "Yüksek bel", "Uzun, ayak bileği", "Kot dikişleri, metal düğme, cepler", "Gündelik"]
    ]),
    "Şort": aiBuildProfile("bottom", "p-st", [
        ["Kot", "Yüksek bel şort", "Yüksek bel", "Mini, kısa paça", "Kot dikişleri, yırtmaç, metal düğme, cepler", "Gündelik"],
        ["Pilili", "A kesim, pilili şort", "Yüksek bel", "Mini", "Pileler, kemer köprüsü, yan fermuar", "Zarif"],
        ["Spor", "Rahat, lastikli şort", "Lastikli bel", "Mini, rahat kesim", "Yan şerit, cepler, ribana", "Spor"],
        ["Kargo", "Rahat, kargo şort", "Düşük bel, lastikli", "Diz üstü", "Kargo cepler, bağcık, dikiş detayları", "Sokak stili"],
        ["Tüllü", "Kabarık, katmanlı şort", "Lastikli bel", "Mini", "Tül katmanlar, saten kuşak, fiyonk", "Masalsı"]
    ]),
    "Eşofman": aiBuildProfile("bottom", "p-es", [
        ["Jogger", "Rahat, daralan paça", "Lastikli bel", "Ayak bileği", "Yan şerit, cepler, ribanalı paça", "Spor"],
        ["Bol Alt", "Bol paça, rahat", "Lastikli bel", "Uzun", "Kontrast şerit, cepler, ribana", "Sokak stili"],
        ["Kısa Paça", "Rahat, kısa paça", "Lastikli bel", "Diz altı", "Cepler, ribana, bağcık", "Spor"],
        ["Yüksek Bel", "Vücuda oturan", "Yüksek bel, lastikli", "Uzun", "Dikiş detayları, yan şerit, cepler", "Atletik"]
    ]),
    "Jogger": aiBuildProfile("bottom", "p-jg", [
        ["Klasik", "Rahat, daralan paça", "Lastikli bel", "Ayak bileği", "Yan şerit, cepler, ribanalı paça", "Spor"],
        ["Kargo", "Rahat, kargo kesim", "Lastikli bel", "Ayak bileği", "Kargo cepler, bağcık, ribana", "Sokak stili"],
        ["Kısa", "Rahat, kısa paça", "Lastikli bel", "Diz altı", "Cepler, ribana, kontrast şerit", "Spor"],
        ["Yüksek Bel", "Vücuda oturan", "Yüksek bel, lastikli", "Ayak bileği", "Dikiş detayları, yan şerit, cepler", "Atletik"]
    ]),
    "Tayt": aiBuildProfile("bottom", "p-ty", [
        ["Yüksek Bel", "Vücuda oturan", "Yüksek bel, lastikli", "Ayak bileği", "Dikişsiz görünüm, geniş bel bandı", "Spor"],
        ["Bisiklet", "Vücuda oturan, bisiklet kesim", "Yüksek bel", "Diz üstü", "Yan cep, dikiş detayı, esnek bel", "Atletik"],
        ["Kruvaze", "Kruvaze bel", "Bağlamalı bel", "Ayak bileği", "Yan bağlama, dikiş detayı", "Yoga"],
        ["Şort Tayt", "Vücuda oturan", "Yüksek bel", "Mini", "Yan cep, kontrast dikiş", "Spor"]
    ]),

    // ----- AYAKKABI -----
    "Bot": aiBuildProfile("shoes", "p-bt", [
        ["Bağcıklı", "Bağcıklı bot", "Yuvarlak burun", "Kalın taban", "Bilek üstü", "Metal halkalar, dişli taban, bağcık", "Sokak stili"],
        ["Platform", "Platform bot", "Kalın burun", "Platform taban", "Diz altı", "Fermuar, bağcık, blok topuk", "Punk"],
        ["Chelsea", "Chelsea bot", "Yuvarlak burun", "Blok topuk", "Bilek hizası", "Elastik yan panel, çekme halkası, dikiş", "Minimal"],
        ["Uzun Konçlu", "Uzun konçlu bot", "Sivri burun", "İnce topuk", "Diz altı", "Fermuar, bağcık, metal detay", "Şık"],
        ["Kısa", "Kısa bot", "Yuvarlak burun", "Kalın taban", "Bilek hizası", "Bağcık, dikiş, yan fermuar", "Gündelik"]
    ]),
    "Sneaker": aiBuildProfile("shoes", "p-sn", [
        ["Düz", "Spor ayakkabı", "Yuvarlak burun", "Düz taban", "Bilek hizası", "Dikiş detayları, yan şerit, bağcık", "Spor"],
        ["Platform", "Platform sneaker", "Yuvarlak burun", "Platform taban", "Bilek hizası", "Kalın taban, bağcık, yan şerit", "Sokak stili"],
        ["Yüksek Bilek", "Yüksek bilekli sneaker", "Yuvarlak burun", "Düz taban", "Bilek üstü", "Yastıklı bilek, bağcık, dikiş", "Spor"],
        ["Slip-on", "Slip-on sneaker", "Yuvarlak burun", "Düz taban", "Bilek hizası", "Lastik yan panel, dikiş, minimal logo", "Gündelik"]
    ]),
    "Sandalet": aiBuildProfile("shoes", "p-sd", [
        ["İnce Bant", "İnce bantlı sandalet", "Açık burun", "İnce topuk", "Bilekten bağlamalı", "İnce bantlar, payet, çiçek detay", "Parti"],
        ["Platform", "Platform sandalet", "Açık burun", "Platform taban", "Bilek hizası", "Kalın bantlar, toka, dikiş", "Sokak stili"],
        ["Spor", "Spor sandalet", "Açık burun", "Düz taban", "Bilek hizası", "Cırt cırt bant, yastıklı taban, dikiş", "Spor"],
        ["Bağcıklı", "Bağcıklı sandalet", "Açık burun", "İnce topuk", "Bilekten bağlamalı", "İnce bağcıklar, taş detay", "Zarif"]
    ]),
    "Babet": aiBuildProfile("shoes", "p-bb", [
        ["Mary Jane", "Mary Jane babet", "Yuvarlak burun", "Kısa topuk", "Bilek hizası", "Kemer toka, kalp kesim, rugan", "Romantik"],
        ["Bale", "Bale ayakkabısı", "Sivri burun", "İnce taban", "Bilek hizası", "Fiyonk, elastik bant, yumuşak deri", "Zarif"],
        ["Loafer", "Loafer", "Yuvarlak burun", "Düz taban", "Bilek hizası", "Metal toka, püskül, dikiş", "Akademi"],
        ["Kare Burun", "Kare burunlu babet", "Kare burun", "Kısa topuk", "Bilek hizası", "Metal toka, dikiş, yumuşak deri", "Minimal"]
    ]),
    "Topuklu Ayakkabı": aiBuildProfile("shoes", "p-tk", [
        ["Stiletto", "Stiletto topuklu", "Sivri burun", "İnce topuk", "Bilek hizası", "Saten kaplama, ince bant, iç taban detayı", "Gece şıklığı"],
        ["Blok Topuk", "Blok topuklu ayakkabı", "Yuvarlak burun", "Blok topuk", "Bilek hizası", "Kemer toka, dikiş, kaymaz taban", "Ofis şıklığı"],
        ["Platform", "Platform topuklu", "Yuvarlak burun", "Platform taban", "Bilek hizası", "Kalın bant, bağcık, dikiş", "Parti"],
        ["İnce Bant", "İnce bantlı topuklu", "Açık burun", "İnce topuk", "Bilekten bağlamalı", "İnce bantlar, taş detay, çiçek", "Zarif"]
    ]),
    "Terlik": aiBuildProfile("shoes", "p-tr", [
        ["Parmak Arası", "Parmak arası terlik", "Açık burun", "Düz taban", "Bilek hizası", "İnce bant, taş detay, yumuşak taban", "Yazlık"],
        ["Platform", "Platform terlik", "Açık burun", "Platform taban", "Bilek hizası", "Kalın bant, dikiş, kaymaz taban", "Sokak stili"],
        ["Kapalı Burun", "Kapalı burun terlik", "Yuvarlak burun", "Düz taban", "Bilek hizası", "Kürk detay, yumuşak iç, dikiş", "Rahat"],
        ["Spor", "Spor terlik", "Açık burun", "Düz taban", "Bilek hizası", "Cırt cırt bant, yastıklı taban", "Spor"]
    ]),

    // ----- DIŞ GİYİM -----
    "Ceket": aiBuildProfile("outerwear", "p-ck", [
        ["Kısa", "Kısa, boxy kesim", "Klasik yaka", "Uzun, düşük omuz", "Kısa, bel üstü", "Metal düğmeler, göğüs cepleri, astar", "Sokak stili"],
        ["Blazer", "Vücuda oturan blazer", "İşlemeli yaka", "Uzun kol", "Kalça boyu", "Tek düğme, astarlı, cepler", "Resmi"],
        ["Biker", "Biker ceket", "Kruvaze yaka", "Uzun kol", "Kısa, bel üstü", "Fermuar, metal toka, cepler", "Punk"],
        ["Denim", "Denim ceket", "Klasik yaka", "Uzun kol", "Kalça boyu", "Kot dikişleri, metal düğmeler, cepler", "Gündelik"]
    ]),
    "Mont": aiBuildProfile("outerwear", "p-mn", [
        ["Şişme", "Şişme, hacimli", "Kapüşonlu yaka", "Uzun, lastikli kol", "Kalça boyu", "Yatay kapitone, fermuar, cepler", "Kışlık"],
        ["Parka", "Parka kesim", "Kapüşonlu yaka", "Uzun kol", "Diz üstü", "Kürk kapüşon, cepler, bağcık", "Kışlık"],
        ["Kısa", "Kısa, şişme", "Bisiklet yaka", "Uzun kol", "Kısa, bel üstü", "Kapitone, fermuar, cepler", "Spor"],
        ["Uzun", "Uzun, şişme", "Kapüşonlu yaka", "Uzun kol", "Diz altı", "Kapitone, kemer, cepler", "Minimal"]
    ]),
    "Kaban": aiBuildProfile("outerwear", "p-kb", [
        ["Klasik", "Uzun kaban kesim", "Kruvaze yaka", "Uzun kol", "Diz altı", "Yün doku, kemer, cepler", "Klasik"],
        ["Trençkot", "Trençkot kesim", "Kruvaze yaka", "Uzun, manşetli", "Diz altı", "Kemer, omuz apoletleri, çift sıra düğme", "Şık"],
        ["Oversize", "Oversize kaban", "Klasik yaka", "Düşük omuz", "Diz altı", "Dökümlü kumaş, cepler", "Minimal"],
        ["Kısa", "Kısa kaban", "Klasik yaka", "Uzun kol", "Kalça boyu", "Düğme, cepler, astar", "Gündelik"]
    ]),
    "Trençkot": aiBuildProfile("outerwear", "p-tc", [
        ["Klasik", "Uzun trençkot kesim", "Kruvaze yaka", "Uzun, manşetli", "Diz altı", "Kemer, omuz apoletleri, çift sıra düğme", "Klasik"],
        ["Kısa", "Kısa trençkot", "Kruvaze yaka", "Uzun kol", "Kalça boyu", "Kemer, düğme, cepler", "Gündelik"],
        ["Oversize", "Oversize trençkot", "Kruvaze yaka", "Düşük omuz", "Diz altı", "Kemer, dökümlü kumaş, cepler", "Minimal"],
        ["Yarı Şeffaf", "Şeffaf trençkot", "Kruvaze yaka", "Uzun kol", "Diz altı", "Şeffaf kumaş, kemer, dikiş", "Modern"]
    ]),
    "Hırka": aiBuildProfile("outerwear", "p-hr", [
        ["Uzun", "Dökümlü, uzun hırka", "V yaka", "Uzun, düşük omuz", "Diz altı", "Örgü, cepler, büyük düğmeler", "Rahat"],
        ["Crop", "Kısa hırka", "V yaka", "Uzun kol", "Kısa, bel üstü", "Düğmeler, ribana, cepler", "Gündelik"],
        ["Kapüşonlu", "Kapüşonlu hırka", "Kapüşonlu yaka", "Uzun kol", "Kalça boyu", "Fermuar, cepler, ribana", "Spor"],
        ["Düğmeli", "Düğmeli hırka", "Yuvarlak yaka", "Uzun kol", "Kalça boyu", "Örgü, düğmeler, cepler", "Akademi"]
    ]),
    "Yelek": aiBuildProfile("outerwear", "p-yl", [
        ["Şişme", "Şişme yelek", "Bisiklet yaka", "Kolsuz", "Kalça boyu", "Kapitone, fermuar, cepler", "Spor"],
        ["Örgü", "Örgü yelek", "V yaka", "Kolsuz", "Kalça boyu", "Örgü doku, ribana, cepler", "Akademi"],
        ["Takım", "Takım yeleği", "Klasik yaka", "Kolsuz", "Kalça boyu", "Düğmeler, astar, cepler", "Resmi"],
        ["Kürk", "Kürk yelek", "Yuvarlak yaka", "Kolsuz", "Kalça boyu", "Kürk detay, bağcık, astar", "Fantezi"]
    ]),

    // ----- ELBİSE ALTI TÜRLER -----
    "Tulum": aiBuildProfile("dress", "p-tl", [
        ["Uzun", "Uzun tulum", "V yaka", "Askılı", "Uzun, düz paça", "Yan cepler, kemer, düğmeler", "Gündelik"],
        ["Kısa", "Kısa tulum", "Kare yaka", "Askılı", "Mini, rahat kesim", "Cepler, düğmeler, bağcık", "Yazlık"],
        ["Kruvaze", "Kruvaze tulum", "Kruvaze yaka", "Uzun kol", "Uzun, dar paça", "Yan bağlama, kemer, cepler", "Şık"],
        ["Spor", "Spor tulum", "Bisiklet yaka", "Kısa kol", "Kalça boyu, rahat", "Kontrast şerit, cepler, ribana", "Spor"]
    ]),
    "Abiye": aiBuildProfile("dress", "p-ab", [
        ["Payetli", "Vücuda oturan, balık kesim", "V yaka", "Uzun, dar kol", "Maksi", "Payet işleme, yırtmaç, dantel", "Gece şıklığı"],
        ["Tüllü", "Kabarık, prenses kesim", "Kalp yaka", "Kolsuz", "Maksi, katmanlı tül", "Tül, taş işleme, sırt fiyonğu", "Masalsı"],
        ["Saten", "Dökümlü, kruvaze", "V yaka", "Askılı", "Maksi, eğik kesim", "Saten döküm, biye, yüzük detay", "Minimal"],
        ["Tek Omuz", "Asimetrik, tek omuz", "Tek omuz", "Tek kol pelerin", "Maksi, asimetrik uç", "Drapaj, broş, kuyruk", "Modern"]
    ]),
    "Gelinlik": aiBuildProfile("dress", "p-gl", [
        ["Prenses", "Kabarık, prenses kesim", "Kalp yaka", "Kolsuz", "Maksi, katmanlı tül", "Tül, dantel, taş işleme", "Masalsı"],
        ["A Kesim", "A kesim, belden oturan", "V yaka", "Uzun dantel kol", "Maksi, düz etek", "Dantel, inci, saten kuşak", "Romantik"],
        ["Balık", "Vücuda oturan, balık kesim", "Kalp yaka", "Askılı", "Maksi, kuyruklu", "Dantel, payet, kuyruk", "Göz alıcı"],
        ["Sade", "Düz kesim", "Bisiklet yaka", "Kolsuz", "Maksi, düz etek", "Saten, ince dikiş, kemer", "Minimal"]
    ]),

    // ----- ÜST TÜRLERİ -----
    "Gömlek": aiBuildProfile("top", "p-gm", [
        ["Klasik", "Vücuda oturan gömlek kesim", "Klasik gömlek yaka", "Uzun, manşetli kol", "Kalça boyu, kavisli etek ucu", "Düğme patı, göğüs cebi, kontrast biye", "Akademi"],
        ["Oversize", "Oversize gömlek kesim", "Klasik gömlek yaka", "Uzun, düşük omuz", "Kalça altı", "Düğme patı, cepler, yan yırtmaç", "Gündelik"],
        ["Crop", "Kısa gömlek kesim", "Klasik gömlek yaka", "Kısa kol", "Krop, düz etek ucu", "Düğme patı, cepler, biye", "Yazlık"],
        ["Fırfırlı", "Belden oturan gömlek", "Kare yaka", "Kısa balon kol", "Kalça üstü", "Fırfır, düğmeler, dantel", "Romantik"]
    ]),
    "Tişört": aiBuildProfile("top", "p-ts", [
        ["Boxy", "Gevşek boxy kesim", "Bisiklet yaka", "Kısa, düşük omuz", "Kalça boyu, düz etek ucu", "Grafik baskı, ribana yaka", "Sokak stili"],
        ["Fitted", "Vücuda oturan", "Bisiklet yaka", "Kısa kol", "Kalça boyu", "Dikiş detayı, ribana yaka", "Minimal"],
        ["Crop", "Kısa, dar kesim", "Bisiklet yaka", "Kısa kol", "Krop, düz etek ucu", "Baskı, ribana, yan dikiş", "Yazlık"],
        ["Oversize", "Oversize, düşük omuz", "Bisiklet yaka", "Kısa, geniş kol", "Kalça altı", "Baskı, ribana, yan yırtmaç", "Gündelik"]
    ]),
    "Kazak": aiBuildProfile("top", "p-kz", [
        ["Oversize", "Oversize, düşük omuz", "Bisiklet yaka", "Uzun, geniş kol", "Kalça altı", "Örgü dokusu, ribana, yan yırtmaç", "Rahat"],
        ["Balıkçı", "Vücuda oturan", "Balıkçı yaka", "Uzun kol", "Kalça boyu", "Örgü, ribana, dikiş", "Minimal"],
        ["Crop", "Kısa kazak", "Bisiklet yaka", "Uzun kol", "Krop", "Örgü, ribana, düğmeler", "Gündelik"],
        ["Kruvaze", "Kruvaze kazak", "V yaka", "Uzun kol", "Kalça boyu", "Yan bağlama, örgü, düğmeler", "Zarif"]
    ]),
    "Sweatshirt": aiBuildProfile("top", "p-sw", [
        ["Oversize", "Oversize, düşük omuz", "Bisiklet yaka", "Uzun, geniş kol", "Kalça altı", "Ribana, kapüşon bağcığı, cepler", "Sokak stili"],
        ["Kapüşonlu", "Rahat, düşük omuz", "Kapüşonlu yaka", "Uzun kol", "Kalça boyu", "Kanguru cep, kapüşon, ribana", "Spor"],
        ["Crop", "Kısa sweatshirt", "Bisiklet yaka", "Uzun kol", "Krop", "Ribana, baskı, yan dikiş", "Gündelik"],
        ["Yarım Fermuar", "Rahat, düşük omuz", "Bisiklet yaka", "Uzun kol", "Kalça boyu", "Yarım fermuar, ribana, cepler", "Spor"]
    ]),
    "Bluz": aiBuildProfile("top", "p-bl", [
        ["Fırfırlı", "Belden oturan, balon gövde", "Kare yaka", "Kısa balon kol", "Kalça üstü, lastikli etek ucu", "Fırfır, kurdele bağcık, dantel", "Romantik"],
        ["Saten", "Dökümlü, kruvaze", "V yaka", "Uzun, dökümlü kol", "Kalça boyu", "Saten döküm, biye, yüzük detay", "Zarif"],
        ["Dantelli", "Vücuda oturan", "Kalp yaka", "Uzun dantel kol", "Kalça boyu", "Dantel, düğmeler, biye", "Gece"],
        ["Gömlek Bluz", "Rahat gömlek kesim", "Klasik gömlek yaka", "Uzun manşetli kol", "Kalça boyu", "Düğme patı, cepler, biye", "Ofis şıklığı"]
    ]),
    "Büstiyer": aiBuildProfile("top", "p-bs", [
        ["Korse", "Korse kesim, vücuda oturan", "Kalp yaka", "Kolsuz / askılı", "Kısa, sivri etek ucu", "Boning dikişleri, bağcık, saten kurdele", "Parti"],
        ["Bandeau", "Düz kesim", "Düz yaka", "Kolsuz", "Kısa", "Lastik üst, dikiş, minimal detay", "Minimal"],
        ["Askılı", "Vücuda oturan", "V yaka", "İnce askı", "Kısa", "İnce askılar, dikiş, dantel", "Gece"],
        ["Fırfırlı", "Vücuda oturan", "Kalp yaka", "Kolsuz", "Kısa", "Fırfır, kurdele, dantel", "Romantik"]
    ]),
    "Crop Üst": aiBuildProfile("top", "p-cr", [
        ["Boxy", "Gevşek boxy kesim", "Bisiklet yaka", "Kısa kol", "Krop", "Baskı, ribana, yan yırtmaç", "Sokak stili"],
        ["Fitted", "Vücuda oturan", "Bisiklet yaka", "Uzun kol", "Krop", "Ribana, dikiş, yan dikiş", "Minimal"],
        ["Fırfırlı", "Belden oturan", "Kare yaka", "Kısa balon kol", "Krop, fırfırlı uç", "Fırfır, kurdele, dantel", "Romantik"],
        ["Kruvaze", "Kruvaze, bağlamalı", "V yaka", "Uzun kol", "Krop", "Yan bağlama, drapaj, düğme", "Şık"]
    ]),
    "Polo Yaka Üst": aiBuildProfile("top", "p-pl", [
        ["Klasik", "Rahat, düz kesim", "Polo yaka", "Kısa kol", "Kalça boyu", "Düğmeli yaka, kontrast yaka, nakış", "Spor"],
        ["Slim", "Vücuda oturan", "Polo yaka", "Kısa kol", "Kalça boyu", "Düğmeli yaka, ribana, dikiş", "Akademi"],
        ["Uzun Kol", "Rahat, düz kesim", "Polo yaka", "Uzun kol", "Kalça boyu", "Düğmeli yaka, ribana, cepler", "Gündelik"],
        ["Çizgili", "Boxy kesim", "Polo yaka", "Kısa kol", "Kalça boyu", "Çizgili örgü, düğmeler, kontrast yaka", "Retro"]
    ]),

    // ----- AKSESUARLAR -----
    "Çanta": aiBuildProfile("accessories", "p-cn", [
        ["Fiyonklu", "Küçük, yuvarlak çanta", "Saten", "Zincir askı, fiyonk, inci detay", "Romantik"],
        ["Sırt", "Kompakt sırt çantası", "Kadife", "Fermuar, cepler, kalp kilit", "Kawaii"],
        ["Omuz", "Dikdörtgen omuz çantası", "Deri", "Ayarlanabilir askı, metal toka, cepler", "Minimal"],
        ["Clutch", "Kompakt clutch", "Saten", "Manyetik kapak, zincir, taş detay", "Gece şıklığı"],
        ["Hasır", "Hasır çanta", "Hasır", "Saplar, fiyonk, dantel detay", "Yazlık"]
    ]),
    "Sırt Çantası": aiBuildProfile("accessories", "p-sc", [
        ["Kompakt", "Kompakt sırt çantası", "Kadife", "Fermuar, cepler, kalp kilit", "Kawaii"],
        ["Okul", "Okul sırt çantası", "Deri", "Fermuar, cepler, metal toka", "Akademi"],
        ["Spor", "Spor sırt çantası", "Naylon", "Fermuar, cepler, askı detayı", "Spor"],
        ["Mini", "Mini sırt çantası", "Saten", "Zincir askı, fiyonk, inci", "Romantik"]
    ]),
    "Saç Tokası": aiBuildProfile("accessories", "p-tk", [
        ["Kelebek", "Büyük kelebek toka", "Sedef", "Taş işleme, parlak kaplama", "Kawaii"],
        ["Fiyonklu", "Fiyonk toka", "Saten", "Kurdele, inci, dantel", "Romantik"],
        ["İnce Taç", "İnce taç", "Metal", "Taş işleme, yıldız detay", "Prenses"],
        ["Kutu Klips", "Kutu klips", "Asetat", "Minimal kaplama, düz yüzey", "Gündelik"]
    ]),
    "Kolye": aiBuildProfile("accessories", "p-kl", [
        ["Katmanlı", "Kısa, katmanlı kolye", "Altın ton", "Kalp kolye ucu, inci, yıldız", "Zarif"],
        ["Choker", "İnce choker", "Saten", "Fiyonk, inci, dantel", "Romantik"],
        ["Uzun", "Uzun kolye", "Gümüş ton", "Ay yıldız kolye ucu, taş, zincir", "Bohem"],
        ["Kalp", "Kalp kolye", "Altın ton", "Kalp uç, taş işleme, ince zincir", "Kawaii"]
    ]),
    "Gözlük": aiBuildProfile("accessories", "p-gz", [
        ["Oval", "Oval gözlük", "Asetat", "Renkli cam, ince sap, çiçek vida", "Retro"],
        ["Kedi Gözü", "Kedi gözü gözlük", "Asetat", "Renkli cam, taş, ince sap", "Vintage"],
        ["Yuvarlak", "Yuvarlak gözlük", "Metal", "İnce çerçeve, renkli cam, dikiş", "Minimal"],
        ["Kare", "Kare gözlük", "Asetat", "Kalın çerçeve, koyu cam, metal sap", "Sokak stili"]
    ]),
    "Taç": aiBuildProfile("accessories", "p-tac", [
        ["İnce", "İnce taç", "Metal", "Taş işleme, yıldız, inci", "Prenses"],
        ["Çiçekli", "Çiçekli taç", "Kumaş", "Çiçek aplik, inci, kurdele", "Peri"],
        ["Kristal", "Kristal taç", "Kristal", "Işık yansıtan taşlar, metal taban", "Masalsı"],
        ["Yıldız", "Yıldız taç", "Metal", "Yıldız form, taş işleme, ince bant", "Gece şıklığı"]
    ]),
    "Bandana": aiBuildProfile("accessories", "p-bnd", [
        ["Kare", "Kare bandana", "İpek", "Çiçek deseni, saçak, renk geçişi", "Bohem"],
        ["Fiyonklu", "Fiyonk bandana", "Saten", "Fiyonk, inci, dantel", "Romantik"],
        ["Saç Bandı", "Kalın saç bandı", "Saten", "Fiyonk, dantel, taş", "Romantik"],
        ["Çiçekli", "Çiçekli bandana", "Kumaş", "Çiçek aplik, inci, kurdele", "Peri"]
    ]),
    "Atkı": aiBuildProfile("accessories", "p-at", [
        ["Kare", "Kare fular", "İpek", "Çiçek deseni, saçak, renk geçişi", "Bohem"],
        ["Uzun", "Uzun atkı", "Yün", "Saçak, örgü doku, dikiş", "Kışlık"],
        ["Örgü", "Örgü atkı", "Yün", "Ribana, saçak, dikiş", "Rahat"],
        ["Fular", "İnce fular", "Saten", "Fiyonk, dantel, inci", "Zarif"]
    ]),
    "Kemer": aiBuildProfile("accessories", "p-km", [
        ["İnce", "İnce bele oturan kemer", "Deri", "Metal toka, delik detayı, yıldız zımba", "Minimal"],
        ["Kalın", "Kalın kemer", "Deri", "Büyük toka, dikiş, cepler", "Sokak stili"],
        ["Zincir", "Zincir kemer", "Metal", "Zincir halkalar, kalp kilit, taş", "Parti"],
        ["Bağcıklı", "Bağcıklı kemer", "Kumaş", "Bağcık, halka, dikiş", "Bohem"]
    ]),
    "Şapka": aiBuildProfile("accessories", "p-sp", [
        ["Bere", "Bere", "Yün", "Ribana, ponpon, dikiş", "Kışlık"],
        ["Kasket", "Kasket", "Pamuk", "Dikiş, siperlik, metal detay", "Spor"],
        ["Hasır", "Hasır şapka", "Hasır", "Kurdele, çiçek, geniş siperlik", "Yazlık"],
        ["Bucket", "Bucket şapka", "Pamuk", "Dikiş, siperlik, minimal logo", "Gündelik"]
    ]),
    "Küpe": aiBuildProfile("accessories", "p-kp", [
        ["Halka", "Büyük halka küpe", "Metal", "Parlak kaplama, ince halka", "Minimal"],
        ["İnci", "İnci küpe", "Altın ton", "İnci, dikiş, damla form", "Zarif"],
        ["Damla", "Damla küpe", "Gümüş ton", "Taş işleme, damla form, ışıltı", "Gece şıklığı"],
        ["Kelebek", "Kelebek küpe", "Renkli metal", "Mine işleme, taş, parlak kaplama", "Kawaii"]
    ]),
    "Bileklik": aiBuildProfile("accessories", "p-bk", [
        ["İnce", "İnce zincir bileklik", "Altın ton", "Kalp uç, inci, ince zincir", "Zarif"],
        ["Boncuk", "Boncuk bileklik", "Renkli boncuk", "Boncuklar, fiyonk, dikiş", "Kawaii"],
        ["Taşlı", "Taşlı bileklik", "Gümüş ton", "Taş işleme, metal kilit", "Gece şıklığı"],
        ["Deri", "Deri bileklik", "Deri", "Metal toka, dikiş, yıldız zımba", "Sokak stili"]
    ]),
    "Yüzük": aiBuildProfile("accessories", "p-yz", [
        ["İnce", "İnce yüzük", "Altın ton", "Minimal dikiş, ince bant", "Minimal"],
        ["Taşlı", "Taşlı yüzük", "Gümüş ton", "Taş işleme, metal yuva", "Gece şıklığı"],
        ["Kalp", "Kalp yüzük", "Altın ton", "Kalp form, taş, parlak yüzey", "Romantik"],
        ["Mühür", "Mühür yüzük", "Gümüş ton", "Düz yüzey, dikiş, eskitme", "Vintage"]
    ]),
    "Çorap": aiBuildProfile("accessories", "p-cp", [
        ["Kısa", "Kısa çorap", "Pamuk", "Ribana, dikiş, kontrast uç", "Gündelik"],
        ["Diz Altı", "Diz altı çorap", "Pamuk", "Ribana, dikiş, ince desen", "Akademi"],
        ["Külotlu", "Külotlu çorap", "Naylon", "İnce doku, dikiş, mat bitiş", "Minimal"],
        ["Fiyonklu", "Fiyonklu çorap", "Pamuk", "Fiyonk, dantel, ribana", "Kawaii"]
    ]),
    "Kravat": aiBuildProfile("accessories", "p-kv", [
        ["Klasik", "Klasik kravat", "İpek", "Düz doku, ince dikiş", "Resmi"],
        ["Çizgili", "Çizgili kravat", "İpek", "Çizgi deseni, dikiş", "Akademi"],
        ["İnce", "İnce kravat", "İpek", "Minimal dikiş, mat yüzey", "Minimal"],
        ["Puantiye", "Puantiyeli kravat", "İpek", "Puantiye deseni, dikiş", "Retro"]
    ]),
    "Papyon": aiBuildProfile("accessories", "p-pp", [
        ["Klasik", "Klasik papyon", "Saten", "Düz doku, ayarlanabilir bant", "Resmi"],
        ["Fiyonklu", "Fiyonk papyon", "Saten", "Katmanlı fiyonk, inci", "Romantik"],
        ["Çizgili", "Çizgili papyon", "İpek", "Çizgi deseni, dikiş", "Akademi"],
        ["Mini", "Mini papyon", "Kadife", "Kadife doku, metal klips", "Vintage"]
    ]),
    "Broş": aiBuildProfile("accessories", "p-br", [
        ["Çiçek", "Çiçek broş", "Sedef", "Çiçek form, taş, inci", "Romantik"],
        ["Yıldız", "Yıldız broş", "Metal", "Yıldız form, taş işleme", "Prenses"],
        ["Kalp", "Kalp broş", "Metal", "Kalp form, parlak kaplama", "Kawaii"],
        ["Böcek", "Böcek broş", "Metal", "Mine işleme, taş, iğne", "Vintage"]
    ]),
    "Maske": aiBuildProfile("accessories", "p-ms", [
        ["Göz", "Göz maskesi", "Kadife", "Dantel, kurdele, inci", "Masalsı"],
        ["Parti", "Parti maskesi", "Tüy", "Tüy, taş, payet", "Parti"],
        ["Yüz", "Yüz maskesi", "Kumaş", "Dikiş, bağcık, desen", "Fantezi"],
        ["Kahraman", "Kahraman maskesi", "Plastik", "Metalik kaplama, lastik bant", "Süper Kahraman"]
    ]),
    "Kanat": aiBuildProfile("accessories", "p-kn", [
        ["Peri", "Peri kanadı", "Tül", "Tül, sim, tel", "Peri"],
        ["Kelebek", "Kelebek kanadı", "Kumaş", "Desen, tel, lastik bant", "Kawaii"],
        ["Melek", "Melek kanadı", "Tüy", "Tüy, kurdele, tel", "Masalsı"],
        ["Ejder", "Ejder kanadı", "Deri", "Deri doku, tel, bağcık", "Fantezi"]
    ]),
    "Eldiven": aiBuildProfile("accessories", "p-el", [
        ["Kısa", "Kısa eldiven", "Saten", "Dikiş, fiyonk, inci", "Zarif"],
        ["Uzun", "Uzun eldiven", "Kadife", "Dikiş, dantel, inci", "Gece şıklığı"],
        ["Parmaksız", "Parmaksız eldiven", "Deri", "Dikiş, metal halka, yırtmaç", "Punk"],
        ["Örgü", "Örgü eldiven", "Yün", "Örgü doku, ribana, ponpon", "Kışlık"]
    ]),

    // ----- SAÇ MODELLERİ -----
    "Örgülü Saç": aiBuildProfile("hair", "p-org", [
        ["İkili", "Sıkı ikili örgü", "Omuz altı", "Sıkı örgü", "İnce kurdeleler, çiçek tokalar", "Masalsı"],
        ["Yan", "Yan örgü", "Omuz hizası", "Dökümlü örgü", "Yüz çerçeveleyen tutamlar, inci toka", "Romantik"],
        ["Balık Sırtı", "Balık sırtı örgü", "Sırt ortası", "Sıkı örgü", "Parlak görünüm, ince kurdele", "Zarif"],
        ["Taç Örgü", "Taç örgü", "Kulak üstü", "Örgü", "Çiçek tokalar, ışıltılı sprey", "Peri"]
    ]),
    "At Kuyruğu": aiBuildProfile("hair", "p-ak", [
        ["Yüksek", "Yüksek at kuyruğu", "Bel hizası", "Düz ve parlak", "Kabarık kök, renkli bağ", "Spor"],
        ["Düşük", "Düşük at kuyruğu", "Sırt ortası", "Düz", "Yan ayrım, ince saç bağı", "Minimal"],
        ["Yan", "Yan at kuyruğu", "Omuz hizası", "Hafif dalgalı", "Çiçek toka, yüz çerçeveleyen tutam", "Romantik"],
        ["Kabarık", "Kabarık at kuyruğu", "Omuz altı", "Hacimli dalgalar", "Kabarık kök, sprey, kurdele", "Retro"]
    ]),
    "Topuz": aiBuildProfile("hair", "p-tpz", [
        ["Yüksek", "Yüksek topuz", "Topuz", "Parlak, düz", "Fiyonk toka, dağınık tutamlar", "Zarif"],
        ["Dağınık", "Dağınık topuz", "Topuz", "Hacimli", "Doğal tutamlar, ince lastik", "Gündelik"],
        ["Yan", "Yan topuz", "Kulak altı", "Parlak", "Çiçek toka, parlak sprey", "Romantik"],
        ["Örgülü", "Örgülü topuz", "Topuz", "Sıkı örgü", "İnce kurdele, inci toka", "Masalsı"]
    ]),
    "Dalgalı Saç": aiBuildProfile("hair", "p-dlg", [
        ["Uzun", "Uzun dalgalı kesim", "Sırt ortası", "Yumuşak dalgalar", "Katmanlı kesim, yüz çerçeveleyen tutamlar", "Romantik"],
        ["Katmanlı", "Katmanlı dalgalı kesim", "Omuz altı", "Hacimli dalgalar", "Katmanlar, parlak sprey", "Modern"],
        ["Beach", "Plaj dalgaları", "Omuz hizası", "Doğal dalgalar", "Dağınık doku, deniz spreyi", "Yazlık"],
        ["Büyük Dalga", "Büyük dalgalı kesim", "Bel hizası", "İri dalgalar", "Parlak görünüm, yan ayrım", "Gece şıklığı"]
    ]),
    "Kıvırcık Saç": aiBuildProfile("hair", "p-kvr", [
        ["Hacimli", "Hacimli kıvırcık", "Omuz hizası", "Sık bukleler", "Hacimli üst, nemli görünüm", "Doğal"],
        ["Küçük", "Küçük bukleli kesim", "Çene hizası", "Sıkı bukleler", "Katmanlı kesim, parlak sprey", "Kawaii"],
        ["Uzun", "Uzun kıvırcık kesim", "Sırt ortası", "Dökümlü bukleler", "Katmanlar, nemli görünüm", "Bohem"],
        ["Yarı Toplu", "Yarı toplu kıvırcık", "Omuz altı", "Hacimli bukleler", "Üstte toplama, yüz çerçeveleyen bukleler", "Romantik"]
    ]),
    "Kaküllü Saç": aiBuildProfile("hair", "p-kkl", [
        ["Perde", "Perde kaküllü kesim", "Omuz hizası", "Düz", "İki yana ayrılan kakül, parlak sprey", "Modern"],
        ["Küt", "Küt kaküllü kesim", "Çene hizası", "Düz", "Düz kesim kakül, yumuşak doku", "Retro"],
        ["Yan", "Yan kaküllü kesim", "Omuz altı", "Hafif dalgalı", "Yana taranan kakül, katman", "Zarif"],
        ["Kısa", "Kısa kaküllü kesim", "Kulak hizası", "Düz", "Kısa kakül, parlak görünüm", "Gündelik"]
    ]),
    "Bob Kesim": aiBuildProfile("hair", "p-bob", [
        ["Küt", "Kısa küt bob", "Çene hizası", "Düz", "Küt kesim, perde kakül", "Modern"],
        ["Katmanlı", "Katmanlı bob", "Omuz hizası", "Hafif dalgalı", "Katmanlı kesim, yüz çerçeveleyen tutamlar", "Zarif"],
        ["Mikro", "Mikro bob", "Kulak hizası", "Düz", "Keskin hatlar, parlak görünüm", "Minimal"],
        ["Kıvırcık", "Kıvırcık bob", "Çene hizası", "Sık bukleler", "Hacimli uçlar, nemli görünüm", "Kawaii"]
    ])
};

// Profili olmayan aksesuar türleri için yine türe sadık formlar üret.
function aiBuildGenericAccessoryProfile(type) {
    return [
        { id: "p-ga1", hint: "Zarif", silhouette: type + " · yuvarlak form", material: "Altın ton", details: "İnce dikiş, taş detay", flavor: "Zarif" },
        { id: "p-ga2", hint: "Minimal", silhouette: type + " · geometrik form", material: "Gümüş ton", details: "Düz yüzey, minimal dikiş", flavor: "Minimal" },
        { id: "p-ga3", hint: "Fantezi", silhouette: type + " · kalp form", material: "Saten", details: "Fiyonk, inci, dantel", flavor: "Romantik" },
        { id: "p-ga4", hint: "Işıltılı", silhouette: type + " · damla form", material: "Metal", details: "Taş işleme, parlak kaplama", flavor: "Gece şıklığı" }
    ];
}

function aiGetVariantPool(analysis) {
    const profile = AI_TYPE_PROFILES[analysis.garmentType];
    if (profile && profile.length) return profile;
    if (analysis.family === "accessories"
        && analysis.garmentType
        && analysis.garmentType !== "Aksesuar") {
        return aiBuildGenericAccessoryProfile(analysis.garmentType);
    }
    return AI_VARIANTS[analysis.family] || AI_VARIANTS.outfit;
}

// ---------- analiz ve üretim ----------
function aiDetectColors(norm) {
    const sorted = AI_COLOR_DEFS.slice().sort(function (a, b) {
        const aMax = Math.max.apply(null, a.keys.map(function (k) { return k.length; }));
        const bMax = Math.max.apply(null, b.keys.map(function (k) { return k.length; }));
        return bMax - aMax;
    });

    const found = [];
    const claimed = [];

    sorted.forEach(function (def) {
        let matchedKey = null;
        def.keys.forEach(function (key) {
            if (aiHas(norm, key) && (!matchedKey || key.length > matchedKey.length)) {
                matchedKey = key;
            }
        });
        if (!matchedKey) return;
        const covered = claimed.some(function (key) { return key.indexOf(matchedKey) !== -1; });
        if (covered) return;
        claimed.push(matchedKey);
        if (!found.some(function (color) { return color.name === def.name; })) {
            found.push({ name: def.name, hex: def.hex });
        }
    });

    const pastel = /(^|[^a-z0-9])pastel/.test(norm);
    const dark = /(^|[^a-z0-9])(koyu|dark)/.test(norm);

    return found.map(function (color) {
        let name = color.name;
        let hex = color.hex;
        if (pastel && name.indexOf("Pastel") !== 0) {
            name = "Pastel " + name;
            hex = aiMixHex(hex, "#ffffff", 0.45);
        }
        if (dark && name.indexOf("Koyu") !== 0 && ["Siyah", "Antrasit", "Lacivert"].indexOf(name) === -1) {
            name = "Koyu " + name;
            hex = aiMixHex(hex, "#1c1c22", 0.3);
        }
        return { name: name, hex: hex };
    });
}

function aiPalettePool(analysis) {
    const style = aiNormalize((analysis.styleTags || []).join(" "));
    if (/gotik|punk|gece|dramatik|deri/.test(style)) return AI_PALETTES.dark;
    if (/prenses|peri|pastel|lolita|kawaii|romantik|masal/.test(style)) return AI_PALETTES.pastel;
    if (/spor|sokak/.test(style)) return AI_PALETTES.vivid;
    if (/bohem|vintage|retro|etnik/.test(style)) return AI_PALETTES.earth;
    if (/denizci|denim/.test(style)) return AI_PALETTES.denim;
    if (/minimal|resmi|akademi|ofis/.test(style)) return AI_PALETTES.neutral;
    if (analysis.family === "hair") return AI_PALETTES.hair;
    if (analysis.family === "haircolor") return AI_PALETTES.hair;
    if (analysis.family === "skin") return AI_PALETTES.skin;
    if (analysis.family === "shoes" || analysis.family === "accessories") return AI_PALETTES.neutral;
    return AI_PALETTES.pastel;
}

function aiComposeColors(analysis, index, seed) {
    if (analysis.colors && analysis.colors.length) {
        const base = analysis.colors.slice(0, 3);
        if (base.length < 2) {
            const accents = [
                { name: "Krem", hex: "#f2e3c8" },
                { name: "Gümüş", hex: "#cfd8dc" },
                { name: "Siyah", hex: "#2b2b33" },
                { name: "Altın", hex: "#d4af37" }
            ];
            base.push(accents[(seed + index) % accents.length]);
        }
        return aiUniqueColors(base);
    }

    const pool = aiPalettePool(analysis);
    const start = (seed + index) % pool.length;
    const second = pool[(start + 2 + (index % 2)) % pool.length];
    return aiUniqueColors([pool[start], second]);
}

function aiComposeStyle(analysis, variant) {
    const parts = [variant.flavor || "Özgün"];
    (analysis.styleTags || []).forEach(function (tag) { parts.push(tag); });
    return aiUnique(parts).slice(0, 3).join(" · ");
}

function aiComposeDetails(analysis, variant) {
    const parts = [];
    (analysis.detailTags || []).forEach(function (tag) { parts.push(tag); });
    String(variant.details || "").split(",").forEach(function (piece) {
        const trimmed = piece.trim();
        if (trimmed) parts.push(trimmed);
    });
    const unique = aiUniqueByText(parts);
    if ((analysis.styleTags || []).indexOf("Minimal") !== -1 && unique.length > 2) {
        return unique.slice(0, 2).join(", ");
    }
    return unique.slice(0, 6).join(", ");
}

function aiMergeAttribute(required, base) {
    if (!required) return base || null;
    if (!base) return required;
    const reqNorm = aiNormalize(required);
    const baseNorm = aiNormalize(base);
    if (baseNorm.indexOf(reqNorm) !== -1) return base;
    if (reqNorm.indexOf(baseNorm) !== -1) return required;
    return required + " · " + base;
}

function aiMergeLength(required, base) {
    if (!required) return base || null;
    if (!base) return required;
    const parts = String(base).split(",");
    const tail = parts.length > 1 ? parts.slice(1).join(",").trim() : "";
    return tail ? required + ", " + tail : required;
}

function aiBuildTitle(color, hint, type, styleTags) {
    const parts = [];
    if (styleTags && styleTags.length) parts.push(styleTags[0]);
    if (color && color.name) parts.push(color.name);
    if (hint) parts.push(hint);
    if (type) parts.push(type);
    let title = aiUnique(parts).join(" ").replace(/\s+/g, " ").trim();
    if (title.length > 64) title = title.slice(0, 61).trim() + "…";
    return title || "Yeni Konsept";
}

function aiNewConceptId(index) {
    return "aic-" + Date.now().toString(36) + "-" + index + "-" + Math.random().toString(36).slice(2, 7);
}

function aiDefaultFamily(character, styleTags) {
    const style = aiNormalize((styleTags || []).join(" "));
    if (/prenses|peri|masal|gelin|balo|abiye/.test(style)) return "dress";
    if (/spor|sokak|gundelik|casual|atletik/.test(style)) return "outfit";
    if (character && character.gender === "boy") return "outfit";
    return "dress";
}

function aiFamilyForCategory(category, detected, character, styleTags) {
    if (category === "clothes") {
        if (detected && AI_FAMILY_CATEGORY[detected.family] === "clothes") return detected.family;
        return aiDefaultFamily(character, styleTags);
    }
    if (category === "shoes") return "shoes";
    if (category === "accessories") return "accessories";
    if (category === "hair") return "hair";
    if (category === "haircolor") return "haircolor";
    if (category === "face") return "face";
    if (category === "skin") return "skin";
    return aiDefaultFamily(character, styleTags);
}

function aiAnalyzePrompt(prompt, categoryChoice, character) {
    character = character || { name: "Bebeğim", gender: "girl" };
    const norm = aiNormalize(prompt);
    const colors = aiDetectColors(norm);
    const styleTags = aiCollectTags(norm, AI_STYLE_DEFS, 4);
    const detailTags = aiCollectTags(norm, AI_DETAIL_DEFS, 8);

    // "uzun kollu" / "uzun saç" gibi ifadeler kıyafet boyu sayılmasın.
    const lengthNorm = norm
        .replace(/(uzun sac|kisa sac|saclar uzun|saclar kisa|uzun sacli|kisa sacli)/g, " ")
        .replace(/(uzun kollu|uzun kol|kisa kollu|kisa kol|long sleeve|short sleeve|kolsuz)/g, " ");
    const lengthDef = aiMatchDefinition(lengthNorm, AI_LENGTH_DEFS);
    const sleeveDef = aiMatchDefinition(norm, AI_SLEEVE_DEFS);
    const necklineDef = aiMatchDefinition(norm, AI_NECKLINE_DEFS);
    const silhouetteDef = aiMatchDefinition(norm, AI_SILHOUETTE_DEFS);
    const waistDef = aiMatchDefinition(norm, AI_WAIST_DEFS);
    const hairLengthDef = aiMatchDefinition(norm, AI_HAIR_LENGTH_DEFS);

    let hairLength = hairLengthDef ? hairLengthDef.label : null;
    if (!hairLength && /sac/.test(norm)) {
        if (/(^|[^a-z0-9])uzun/.test(norm)) hairLength = "Uzun";
        else if (/(^|[^a-z0-9])kisa/.test(norm)) hairLength = "Kısa";
    }

    const constraints = {
        length: lengthDef ? lengthDef.label : null,
        sleeves: sleeveDef ? sleeveDef.label : null,
        neckline: necklineDef ? necklineDef.label : null,
        silhouette: silhouetteDef ? silhouetteDef.label : null,
        waist: waistDef ? waistDef.label : null,
        hairLength: hairLength
    };

    const detected = aiMatchDefinition(norm, AI_GARMENT_RULES);
    const requestedItems = [];
    AI_GARMENT_RULES.forEach(function (rule) {
        const hit = rule.keys.some(function (key) { return aiHas(norm, key); });
        if (hit && requestedItems.indexOf(rule.type) === -1) requestedItems.push(rule.type);
    });

    let family;
    let category;
    if (categoryChoice && categoryChoice !== "auto") {
        category = categoryChoice;
        family = aiFamilyForCategory(category, detected, character, styleTags);
    } else if (detected) {
        family = detected.family;
        category = AI_FAMILY_CATEGORY[family] || "clothes";
    } else {
        family = aiDefaultFamily(character, styleTags);
        category = "clothes";
    }

    if (family === "hair" && !constraints.hairLength) {
        if (/(^|[^a-z0-9])uzun/.test(norm)) constraints.hairLength = "Uzun";
        else if (/(^|[^a-z0-9])kisa/.test(norm)) constraints.hairLength = "Kısa";
    }

    const useDetectedType = detected && AI_FAMILY_CATEGORY[detected.family] === category;
    const garmentType = useDetectedType ? detected.type : (AI_DEFAULT_TYPES[family] || "Tasarım");

    let requestedTarget = null;
    if (/(^|[^a-z0-9])(erkek|boy)([^a-z0-9]|$)/.test(norm)) requestedTarget = "boy";
    else if (/(^|[^a-z0-9])(kiz|girl)([^a-z0-9]|$)/.test(norm)) requestedTarget = "girl";

    return {
        prompt: prompt,
        norm: norm,
        colors: colors,
        styleTags: styleTags,
        detailTags: detailTags,
        constraints: constraints,
        requestedItems: requestedItems,
        requestedTarget: requestedTarget,
        detected: detected,
        family: family,
        category: category,
        categoryLabel: AI_CATEGORY_LABELS[category] || category,
        garmentType: garmentType,
        character: character
    };
}

function aiBuildConcept(analysis, variant, index, character, seed) {
    character = character || analysis.character || { name: "Bebeğim", gender: "girl" };
    const family = analysis.family;
    const fields = AI_FAMILY_FIELDS[family] || AI_FAMILY_FIELDS.outfit;
    const req = analysis.constraints || {};
    const attributes = [];

    fields.forEach(function (key) {
        let value = null;
        if (key === "details") {
            value = aiComposeDetails(analysis, variant);
        } else if (key === "silhouette") {
            let base = variant.silhouette || "";
            if (family === "bottom" && variant.waist) {
                base = base + " · " + (req.waist || variant.waist);
            }
            value = aiMergeAttribute(req.silhouette, base);
        } else if (key === "neckline") {
            value = req.neckline || variant.neckline || null;
        } else if (key === "sleeves") {
            value = req.sleeves || variant.sleeves || null;
        } else if (key === "lengthShape") {
            value = family === "hair"
                ? (req.hairLength || variant.lengthShape || null)
                : aiMergeLength(req.length, variant.lengthShape);
        } else {
            value = variant[key] || null;
        }
        if (value) {
            attributes.push({
                key: key,
                label: aiFieldLabel(family, key),
                value: String(value)
            });
        }
    });

    const mainColors = aiComposeColors(analysis, index, seed);
    const styleTags = aiUnique((analysis.styleTags || []).slice());
    const style = aiComposeStyle(analysis, variant);
    const variantHint = variant.hint || "";

    return {
        id: aiNewConceptId(index),
        index: index,
        title: aiBuildTitle(mainColors[0], variantHint, analysis.garmentType, styleTags),
        category: analysis.category,
        categoryLabel: analysis.categoryLabel,
        garmentType: analysis.garmentType,
        mainColors: mainColors,
        style: style,
        attributes: attributes,
        variantId: variant.id,
        variantHint: variantHint,
        styleTags: styleTags,
        detailTags: (analysis.detailTags || []).slice(),
        baseStyle: variant.flavor || "Özgün",
        characterContext: { name: character.name, gender: character.gender },
        essentialRequirements: {
            prompt: analysis.prompt,
            colors: (analysis.colors || []).map(function (c) { return { name: c.name, hex: c.hex }; }),
            styleTags: styleTags.slice(),
            detailTags: (analysis.detailTags || []).slice(),
            requestedItems: (analysis.requestedItems || []).slice(),
            requestedTarget: analysis.requestedTarget,
            constraints: Object.assign({}, analysis.constraints)
        },
        refinements: [],
        designNotes: [],
        createdAt: new Date().toISOString()
    };
}

function aiGenerateConcepts(analysis, seed, count) {
    const variants = aiGetVariantPool(analysis);
    const total = Math.max(AI_CONCEPT_COUNT, count || AI_CONCEPT_COUNT);
    const concepts = [];
    for (let i = 0; i < total; i++) {
        const variant = variants[(seed + i) % variants.length];
        concepts.push(aiBuildConcept(analysis, variant, i, analysis.character, seed));
    }
    return concepts;
}

// ---------- konsept iyileştirme ----------
function aiAttrValue(concept, key) {
    const found = (concept.attributes || []).find(function (attr) { return attr.key === key; });
    return found ? found.value : null;
}

function aiAttributeExists(concept, key) {
    return (concept.attributes || []).some(function (attr) { return attr.key === key; });
}

function aiSetAttribute(concept, key, value) {
    if (!value) return false;
    const found = (concept.attributes || []).find(function (attr) { return attr.key === key; });
    if (!found) return false;
    if (found.value === value) return false;
    found.value = value;
    return true;
}

function aiSetAttributeMerged(concept, key, required) {
    if (!required) return false;
    const current = aiAttrValue(concept, key);
    if (!current) return false;
    return aiSetAttribute(concept, key, aiMergeAttribute(required, current));
}

function aiSetAttributeLength(concept, required) {
    if (!required) return false;
    const current = aiAttrValue(concept, "lengthShape");
    if (!current) return false;
    return aiSetAttribute(concept, "lengthShape", aiMergeLength(required, current));
}

function aiRefreshConceptTitle(concept) {
    const color = concept.mainColors && concept.mainColors[0] ? concept.mainColors[0] : null;
    const styleWord = concept.styleTags && concept.styleTags.length ? concept.styleTags[0] : "";
    concept.title = aiBuildTitle(color, concept.variantHint, concept.garmentType, styleWord ? [styleWord] : []);
}

// Ek yönergeyi yapılandırılmış alanlara uygular. Önceki gereksinimler
// yalnızca yönerge o alanı açıkça değiştiriyorsa güncellenir.
function aiApplyInstructionToConcept(concept, instruction, silent) {
    const norm = aiNormalize(instruction);
    if (!norm) return false;

    // Eski kayıtlardan gelen eksik alanları tamamla.
    concept.mainColors = concept.mainColors || [];
    concept.styleTags = concept.styleTags || [];
    concept.designNotes = concept.designNotes || [];
    concept.refinements = concept.refinements || [];

    let changed = false;

    // 1) Renkler
    const colors = aiDetectColors(norm);
    if (colors.length) {
        const wantsAdd = /(^|[^a-z0-9])(ekle|ilave|accent|detay)/.test(norm) && concept.mainColors.length < 4;
        concept.mainColors = wantsAdd
            ? aiUniqueColors(concept.mainColors.concat(colors)).slice(0, 4)
            : colors.slice(0, 4);
        changed = true;
    }

    // 2) Kol (boy kısıtından önce; "uzun kol" etek boyu sayılmasın)
    const sleeveDef = aiMatchDefinition(norm, AI_SLEEVE_DEFS);
    const targetsSleeve = /kol|sleeve/.test(norm);
    const handledSleeve = targetsSleeve;
    if (targetsSleeve) {
        let sleeveChanged = false;
        if (sleeveDef) {
            sleeveChanged = aiSetAttribute(concept, "sleeves", sleeveDef.label);
        } else if (/uzat|uzun/.test(norm)) {
            sleeveChanged = aiSetAttribute(concept, "sleeves", "Uzun kol");
        } else if (/kisalt|kisa/.test(norm)) {
            sleeveChanged = aiSetAttribute(concept, "sleeves", "Kısa kol");
        }
        if (sleeveChanged) changed = true;
    }

    // 3) Boy
    if (!handledSleeve) {
        const lengthNorm = norm
            .replace(/(uzun sac|kisa sac|saclar uzun|saclar kisa|uzun sacli|kisa sacli)/g, " ")
            .replace(/(uzun kollu|uzun kol|kisa kollu|kisa kol|long sleeve|short sleeve|kolsuz)/g, " ");
        const lengthDef = aiMatchDefinition(lengthNorm, AI_LENGTH_DEFS);
        if (lengthDef) {
            if (aiSetAttributeLength(concept, lengthDef.label)) changed = true;
        } else if (/daha uzun|uzat|uzun olsun/.test(norm)) {
            if (aiSetAttributeLength(concept, "Uzun boy")) changed = true;
        } else if (/daha kisa|kisalt|kisa olsun/.test(norm)) {
            if (aiSetAttributeLength(concept, "Kısa boy")) changed = true;
        }
    }

    // 4) Yaka
    const necklineDef = aiMatchDefinition(norm, AI_NECKLINE_DEFS);
    if (necklineDef) {
        if (aiSetAttribute(concept, "neckline", necklineDef.label)) changed = true;
    }

    // 5) Silüet
    const silhouetteDef = aiMatchDefinition(norm, AI_SILHOUETTE_DEFS);
    if (silhouetteDef) {
        if (aiSetAttributeMerged(concept, "silhouette", silhouetteDef.label)) changed = true;
    } else if (/daha bol|bol yap|gevset/.test(norm)) {
        if (aiSetAttributeMerged(concept, "silhouette", "Oversize")) changed = true;
    } else if (/daha dar|dar yap|vucuda otur/.test(norm)) {
        if (aiSetAttributeMerged(concept, "silhouette", "Vücuda oturan")) changed = true;
    }

    // 6) Bel (alt giyim)
    const waistDef = aiMatchDefinition(norm, AI_WAIST_DEFS);
    if (waistDef && aiAttributeExists(concept, "silhouette")) {
        const current = aiAttrValue(concept, "silhouette") || "";
        const next = aiNormalize(current).indexOf(aiNormalize(waistDef.label)) !== -1
            ? current
            : current + " · " + waistDef.label;
        if (aiSetAttribute(concept, "silhouette", next)) changed = true;
    }

    // 7) Süsleme / detaylar
    const detailTags = aiCollectTags(norm, AI_DETAIL_DEFS, 8);
    if (detailTags.length && aiAttributeExists(concept, "details")) {
        const current = aiAttrValue(concept, "details") || "";
        const pieces = current.split(",").map(function (p) { return p.trim(); }).filter(Boolean);
        detailTags.forEach(function (tag) { pieces.push(tag); });
        if (aiSetAttribute(concept, "details", aiUniqueByText(pieces).slice(0, 8).join(", "))) changed = true;
    }

    // 8) Genel stil
    const styleTags = aiCollectTags(norm, AI_STYLE_DEFS, 3);
    if (styleTags.length) {
        concept.styleTags = aiUnique((concept.styleTags || []).concat(styleTags));
        const parts = [concept.baseStyle || "Özgün"].concat(concept.styleTags);
        concept.style = aiUnique(parts).slice(0, 4).join(" · ");
        changed = true;
    }

    if (aiNormalize(concept.style).indexOf("minimal") !== -1 && aiAttributeExists(concept, "details")) {
        const current = aiAttrValue(concept, "details") || "";
        const pieces = current.split(",").map(function (p) { return p.trim(); }).filter(Boolean).slice(0, 2);
        if (aiSetAttribute(concept, "details", pieces.join(", "))) changed = true;
    }

    if (changed) {
        aiRefreshConceptTitle(concept);
    } else if (!silent) {
        // Yapılandırılmış bir alana çevrilemeyen yönerge kaybolmasın:
        // görsel üretim aşaması için tasarım notu olarak saklanır.
        concept.designNotes.push(instruction);
    }
    return changed;
}

// ---------- görsel üretim aşaması için yapılandırılmış çıktı ----------
function aiBuildImagePrompt(concept, generation) {
    const parts = [];
    const colorNames = (concept.mainColors || []).map(function (c) { return c.name; }).join(" ve ");
    if (colorNames) parts.push(colorNames + " tonlarında");
    if (concept.garmentType) parts.push(concept.garmentType);

    ["silhouette", "neckline", "sleeves", "lengthShape"].forEach(function (key) {
        const value = aiAttrValue(concept, key);
        if (value) parts.push(value);
    });
    const details = aiAttrValue(concept, "details");
    if (details) parts.push("detaylar: " + details);
    if (concept.style) parts.push("stil: " + concept.style);

    const character = generation.character || { name: "Bebeğim", gender: "girl" };
    const genderLabel = character.gender === "boy" ? "erkek bebek" : "kız bebek";
    parts.push("hedef: " + genderLabel + " (" + character.name + ")");
    return parts.join(", ");
}

function aiBuildPreparedPayload(generation, concept) {
    const structured = {
        title: concept.title,
        category: concept.category,
        categoryLabel: concept.categoryLabel,
        garmentType: concept.garmentType,
        mainColors: concept.mainColors,
        overallStyle: concept.style
    };

    (concept.attributes || []).forEach(function (attr) {
        structured[attr.key] = attr.value;
    });
    if (structured.details) structured.decorations = structured.details;

    return {
        schemaVersion: 1,
        kind: "doll-ai-written-concept",
        status: "ready-for-image-generation",
        preparedAt: new Date().toISOString(),
        generationId: generation.id,
        conceptId: concept.id,
        characterContext: generation.character || concept.characterContext,
        source: {
            prompt: generation.prompt,
            categoryChoice: generation.categoryChoice
        },
        category: concept.category,
        categoryLabel: concept.categoryLabel,
        title: concept.title,
        garmentType: concept.garmentType,
        mainColors: concept.mainColors,
        attributes: (concept.attributes || []).map(function (attr) {
            return { key: attr.key, label: attr.label, value: attr.value };
        }),
        structured: structured,
        essentialRequirements: concept.essentialRequirements,
        refinementInstructions: (concept.refinements || []).map(function (r) { return r.instruction; }),
        designNotes: (concept.designNotes || []).slice(),
        imageGeneration: {
            requested: false,
            status: "not-started",
            imagePrompt: aiBuildImagePrompt(concept, generation),
            note: "Görsel üretimi bu sürümde çalıştırılmaz. Bu payload sonraki aşamanın girişidir."
        }
    };
}

// ---------- kalıcı durum ----------
function aiDefaultState() {
    return {
        version: AI_STATE_VERSION,
        character: { name: "Bebeğim", gender: "girl" },
        draftPrompt: "",
        categoryChoice: "auto",
        generations: [],
        activeGenerationId: null,
        selectedConceptId: null,
        refinementInstructions: [],
        preparedConcept: null,
        generationCount: 0,
        updatedAt: null
    };
}

function aiLoadState() {
    const stored = readStudioJson(STUDIO_AI_STATE_KEY);
    const state = aiDefaultState();
    if (!stored || typeof stored !== "object") return state;

    Object.keys(stored).forEach(function (key) { state[key] = stored[key]; });
    state.version = AI_STATE_VERSION;
    if (!Array.isArray(state.generations)) state.generations = [];
    state.generations = state.generations.filter(function (gen) {
        return gen && Array.isArray(gen.concepts);
    });
    if (!state.character || typeof state.character !== "object") {
        state.character = { name: "Bebeğim", gender: "girl" };
    }
    if (!Array.isArray(state.refinementInstructions)) state.refinementInstructions = [];
    if (typeof state.draftPrompt !== "string") state.draftPrompt = "";
    if (!state.categoryChoice) state.categoryChoice = "auto";
    return state;
}

let aiState = aiLoadState();
let aiBusy = false;
let aiBusyInterval = null;
let aiBusyTimeout = null;
let aiDraftTimer = null;
let aiRenderedSelectionId = null;

function aiPersistState() {
    aiState.updatedAt = new Date().toISOString();
    try {
        localStorage.setItem(STUDIO_AI_STATE_KEY, JSON.stringify(aiState));
        return true;
    } catch (err) {
        // Kota dolarsa eski üretimleri küçültüp tekrar dene.
        try {
            aiState.generations = aiState.generations.slice(0, 3);
            const activeExists = aiState.generations.some(function (gen) {
                return gen.id === aiState.activeGenerationId;
            });
            if (!activeExists) {
                aiState.activeGenerationId = aiState.generations.length
                    ? aiState.generations[0].id
                    : null;
                aiState.selectedConceptId = null;
            }
            localStorage.setItem(STUDIO_AI_STATE_KEY, JSON.stringify(aiState));
            return true;
        } catch (err2) {
            return false;
        }
    }
}

function aiClearPrepared() {
    aiState.preparedConcept = null;
    try { localStorage.removeItem(STUDIO_AI_PREPARED_KEY); } catch (err) { /* yoksay */ }
}

function aiSnapshotCharacter() {
    return {
        name: currentDoll.name || "Bebeğim",
        gender: currentDoll.gender === "boy" ? "boy" : "girl"
    };
}

function aiGetActiveGeneration() {
    if (!aiState.activeGenerationId) return null;
    const found = aiState.generations.find(function (gen) {
        return gen.id === aiState.activeGenerationId;
    });
    return found || null;
}

function aiGetSelectedConcept(gen) {
    if (!gen || !aiState.selectedConceptId) return null;
    return gen.concepts.find(function (concept) {
        return concept.id === aiState.selectedConceptId;
    }) || null;
}

// ---------- DOM referansları ----------
const aiPromptInput = document.getElementById("ai-prompt");
const aiPromptError = document.getElementById("ai-prompt-error");
const aiPromptCount = document.getElementById("ai-prompt-count");
const aiCategorySelect = document.getElementById("ai-category");
const aiGenerateBtn = document.getElementById("ai-generate");
const aiClearPromptBtn = document.getElementById("ai-clear-prompt");
const aiEditPromptBtn = document.getElementById("ai-edit-prompt");
const aiNewSetBtn = document.getElementById("ai-new-set");
const aiHistoryToggle = document.getElementById("ai-history-toggle");
const aiHistoryPanel = document.getElementById("ai-history-panel");
const aiHistoryList = document.getElementById("ai-history-list");
const aiStatus = document.getElementById("ai-status");
const aiStatusText = document.getElementById("ai-status-text");
const aiEmpty = document.getElementById("ai-empty");
const aiResultsGrid = document.getElementById("ai-results-grid");
const aiResultsSub = document.getElementById("ai-results-sub");
const aiSelectedPanel = document.getElementById("ai-selected");
const aiSelectedTitle = document.getElementById("ai-selected-title");
const aiSelectedCategory = document.getElementById("ai-selected-category");
const aiSelectedSwatches = document.getElementById("ai-selected-swatches");
const aiSelectedAttrs = document.getElementById("ai-selected-attrs");
const aiRefineInput = document.getElementById("ai-refine-input");
const aiRefineApplyBtn = document.getElementById("ai-refine-apply");
const aiRefineList = document.getElementById("ai-refine-list");
const aiContinueBtn = document.getElementById("ai-continue");
const aiCharacterIcon = document.getElementById("ai-character-icon");
const aiCharacterName = document.getElementById("ai-character-name");
const aiCharacterGender = document.getElementById("ai-character-gender");
const aiContextNoteText = document.getElementById("ai-context-note-text");
const aiReadyTitle = document.getElementById("ai-ready-title");
const aiReadyCategory = document.getElementById("ai-ready-category");
const aiReadySwatches = document.getElementById("ai-ready-swatches");
const aiReadyAttrs = document.getElementById("ai-ready-attrs");
const aiReadySummary = document.getElementById("ai-ready-summary");
const aiReadyJson = document.getElementById("ai-ready-json");
const aiReadyBackBtn = document.getElementById("ai-ready-back");
const aiReadyHomeBtn = document.getElementById("ai-ready-home");
const aiReadyNewBtn = document.getElementById("ai-ready-new");

// ---------- durum güncellemeleri ----------
function aiSetBusy(busy) {
    aiBusy = busy;
    if (aiStatus) aiStatus.hidden = !busy;
    if (aiGenerateBtn) aiGenerateBtn.disabled = busy;
    if (aiRefineApplyBtn) aiRefineApplyBtn.disabled = busy;
    if (aiContinueBtn) aiContinueBtn.disabled = busy;
    const hasGeneration = !!aiGetActiveGeneration();
    if (aiNewSetBtn) aiNewSetBtn.disabled = busy || !hasGeneration;
    if (aiEditPromptBtn) aiEditPromptBtn.disabled = busy || !hasGeneration;
    document.querySelectorAll(".ai-select-btn, .ai-reroll-btn").forEach(function (btn) {
        btn.disabled = busy;
    });
}

function aiRunGeneration(messages, task) {
    if (aiBusy) return;
    aiSetBusy(true);
    if (aiStatus) aiStatus.hidden = false;

    let msgIndex = 0;
    const setMessage = function () {
        if (aiStatusText) {
            aiStatusText.textContent = messages[Math.min(msgIndex, messages.length - 1)];
        }
        msgIndex += 1;
    };
    setMessage();
    if (aiBusyInterval) clearInterval(aiBusyInterval);
    aiBusyInterval = setInterval(setMessage, 320);

    if (aiBusyTimeout) clearTimeout(aiBusyTimeout);
    aiBusyTimeout = setTimeout(function () {
        if (aiBusyInterval) clearInterval(aiBusyInterval);
        aiBusyInterval = null;
        try {
            task();
        } catch (err) {
            console.error("AI Design üretim hatası:", err);
            showStudioToast("Konseptler oluşturulamadı. Lütfen tekrar dene.");
        }
        aiSetBusy(false);
        if (aiStatus) aiStatus.hidden = true;
    }, 900);
}

function aiUpdatePromptCount() {
    if (aiPromptCount && aiPromptInput) {
        aiPromptCount.textContent = aiPromptInput.value.length + " / " + AI_PROMPT_MAX;
    }
}

function aiValidatePrompt() {
    if (!aiPromptInput) return false;
    const prompt = aiPromptInput.value.trim();
    if (prompt.length < 3) {
        if (aiPromptError) aiPromptError.hidden = false;
        showStudioToast("En az 3 karakterlik bir tasarım fikri yaz.");
        aiPromptInput.focus();
        return false;
    }
    if (aiPromptError) aiPromptError.hidden = true;
    return true;
}

function aiRequestNewSet() {
    if (aiBusy || !aiPromptInput) return;
    if (!aiValidatePrompt()) return;

    const prompt = aiPromptInput.value.trim();
    const categoryChoice = (aiCategorySelect && aiCategorySelect.value) || "auto";
    const character = aiSnapshotCharacter();

    aiState.draftPrompt = prompt;
    aiState.categoryChoice = categoryChoice;
    aiPersistState();

    aiRunGeneration([
        "Açıklama analiz ediliyor…",
        "Silüetler ve kesimler çeşitlendiriliyor…",
        "Renkler ve detaylar yerleştiriliyor…"
    ], function () {
        aiState.generationCount = (aiState.generationCount || 0) + 1;
        const seed = aiState.generationCount * 3;
        const analysis = aiAnalyzePrompt(prompt, categoryChoice, character);
        const concepts = aiGenerateConcepts(analysis, seed, AI_CONCEPT_COUNT);

        const generation = {
            id: "aigen-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
            prompt: prompt,
            categoryChoice: categoryChoice,
            character: character,
            concepts: concepts,
            retiredConcepts: [],
            seed: seed,
            rerollCounter: 0,
            createdAt: new Date().toISOString()
        };

        aiState.generations.unshift(generation);
        while (aiState.generations.length > AI_HISTORY_LIMIT) aiState.generations.pop();
        aiState.activeGenerationId = generation.id;
        aiState.selectedConceptId = null;
        aiClearPrepared();

        const saved = aiPersistState();
        aiRenderAll();
        showStudioToast(saved
            ? concepts.length + " yeni konsept hazır. Birini seçerek detaylandır."
            : "Konseptler hazır ancak depolama sınırı nedeniyle kalıcı kaydedilemedi.");
    });
}

function aiSelectConcept(id) {
    const gen = aiGetActiveGeneration();
    if (!gen) return;
    const exists = gen.concepts.some(function (concept) { return concept.id === id; });
    if (!exists) return;

    aiState.selectedConceptId = id;
    aiPersistState();
    aiRenderResults();
    if (aiSelectedPanel) {
        aiSelectedPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
}

function aiRegenerateConcept(conceptId) {
    if (aiBusy) return;
    const gen = aiGetActiveGeneration();
    if (!gen) return;

    const index = gen.concepts.findIndex(function (concept) { return concept.id === conceptId; });
    if (index === -1) return;
    const previous = gen.concepts[index];

    aiRunGeneration([
        "Konsept yeniden yorumlanıyor…",
        "Yeni bir kesim ve detay kombinasyonu seçiliyor…"
    ], function () {
        const character = gen.character || { name: "Bebeğim", gender: "girl" };
        const analysis = aiAnalyzePrompt(gen.prompt, gen.categoryChoice, character);
        const variants = aiGetVariantPool(analysis);
        const usedIds = gen.concepts.map(function (concept) { return concept.variantId; });

        let candidates = variants.filter(function (variant) {
            return variant.id !== previous.variantId && usedIds.indexOf(variant.id) === -1;
        });
        const hadUnusedCandidate = candidates.length > 0;
        if (!candidates.length) {
            candidates = variants.filter(function (variant) { return variant.id !== previous.variantId; });
        }
        if (!candidates.length) candidates = variants.slice();

        gen.rerollCounter = (gen.rerollCounter || 0) + 1;
        const seedBase = typeof gen.seed === "number" ? gen.seed : 0;
        const variant = candidates[gen.rerollCounter % candidates.length];
        const replacement = aiBuildConcept(analysis, variant, index, character, seedBase + gen.rerollCounter);

        // Tüm tür varyantları zaten sette kullanılıyorsa bile yenilenen
        // konsept diğerlerinden bir detayla ayrışsın.
        if (!hadUnusedCandidate) {
            const extra = AI_REROLL_DETAILS[(gen.rerollCounter - 1) % AI_REROLL_DETAILS.length];
            const currentDetails = aiAttrValue(replacement, "details");
            if (currentDetails) {
                aiSetAttribute(replacement, "details", currentDetails + ", " + extra);
            }
        }

        // Önceki ek yönergeler yeni varyanta da uygulanır; bilgi kaybolmaz.
        (previous.refinements || []).forEach(function (refinement) {
            aiApplyInstructionToConcept(replacement, refinement.instruction, true);
        });
        replacement.refinements = (previous.refinements || []).slice();
        replacement.designNotes = (previous.designNotes || []).slice();
        replacement.id = aiNewConceptId(index);

        gen.retiredConcepts = gen.retiredConcepts || [];
        gen.retiredConcepts.push(previous);
        while (gen.retiredConcepts.length > AI_RETIRED_LIMIT) gen.retiredConcepts.shift();
        gen.concepts[index] = replacement;

        if (aiState.selectedConceptId === previous.id) {
            aiState.selectedConceptId = replacement.id;
        }
        aiClearPrepared();
        aiPersistState();
        aiRenderAll();
        showStudioToast("Konsept yenilendi.");
    });
}

function aiApplyRefinementFromUI() {
    if (aiBusy) return;
    const gen = aiGetActiveGeneration();
    const concept = aiGetSelectedConcept(gen);
    if (!concept) {
        showStudioToast("Önce bir konsept seç.");
        return;
    }

    const instruction = aiRefineInput ? aiRefineInput.value.trim() : "";
    if (!instruction) {
        showStudioToast("Uygulamak için bir yönerge yaz.");
        if (aiRefineInput) aiRefineInput.focus();
        return;
    }
    if (instruction.length > AI_REFINE_MAX) {
        showStudioToast("Yönerge çok uzun.");
        return;
    }

    const changed = aiApplyInstructionToConcept(concept, instruction, false);
    const at = new Date().toISOString();
    concept.refinements = concept.refinements || [];
    concept.refinements.push({ instruction: instruction, at: at });
    aiState.refinementInstructions.push({ conceptId: concept.id, instruction: instruction, at: at });
    while (aiState.refinementInstructions.length > 100) aiState.refinementInstructions.shift();

    aiClearPrepared();
    aiPersistState();
    aiRenderResults();
    if (aiRefineInput) aiRefineInput.value = "";
    showStudioToast(changed
        ? "Konsept yönergene göre güncellendi."
        : "Yönerge kaydedildi; yapılandırılmış öznitelikler korunuyor.");
}

function aiContinueWithSelected() {
    const gen = aiGetActiveGeneration();
    const concept = aiGetSelectedConcept(gen);
    if (!gen || !concept) {
        showStudioToast("Devam etmek için bir konsept seç.");
        return;
    }

    const prepared = aiBuildPreparedPayload(gen, concept);
    aiState.preparedConcept = prepared;
    const stateSaved = aiPersistState();

    let payloadSaved = true;
    try {
        localStorage.setItem(STUDIO_AI_PREPARED_KEY, JSON.stringify(prepared));
    } catch (err) {
        payloadSaved = false;
    }

    showStudioView("ai-ready");
    showStudioToast(stateSaved && payloadSaved
        ? "Konsept görsel aşaması için hazırlandı."
        : "Konsept hazır; depolama sınırı nedeniyle bazı veriler kalıcı olmayabilir.");
}

function aiStartNewDesign() {
    if (aiBusy) return;
    aiState.activeGenerationId = null;
    aiState.selectedConceptId = null;
    aiState.draftPrompt = "";
    aiState.categoryChoice = "auto";
    aiClearPrepared();

    if (aiPromptInput) {
        aiPromptInput.value = "";
        aiUpdatePromptCount();
    }
    if (aiPromptError) aiPromptError.hidden = true;
    if (aiCategorySelect) aiCategorySelect.value = "auto";

    aiPersistState();
    showStudioView("ai");
    aiRenderAll();
    if (aiPromptInput) aiPromptInput.focus();
}

function aiSyncCharacterUI() {
    const character = aiSnapshotCharacter();
    const isBoy = character.gender === "boy";
    if (aiCharacterIcon) aiCharacterIcon.textContent = isBoy ? "👦" : "🎀";
    if (aiCharacterName) aiCharacterName.textContent = character.name;
    if (aiCharacterGender) aiCharacterGender.textContent = AI_CHARACTER_LABELS[character.gender];
    if (aiContextNoteText) {
        aiContextNoteText.textContent = "Öneriler " + AI_CHARACTER_LABELS[character.gender]
            + " bağlamına göre uyarlanır; istediğin tarzı yazabilirsin, cinsiyet seni kısıtlamaz.";
    }
}

// ---------- render yardımcıları ----------
function aiBuildSwatches(colors) {
    const wrap = document.createElement("div");
    wrap.className = "ai-swatches";
    (colors || []).forEach(function (color) {
        const chip = document.createElement("span");
        chip.className = "ai-swatch";
        chip.title = color.name + " · " + color.hex;
        const dot = document.createElement("span");
        dot.className = "ai-swatch-dot";
        dot.style.backgroundColor = color.hex;
        const label = document.createElement("span");
        label.textContent = color.name;
        chip.append(dot, label);
        wrap.appendChild(chip);
    });
    return wrap;
}

function aiCopySwatches(target, colors) {
    if (!target) return;
    const built = aiBuildSwatches(colors);
    target.replaceChildren();
    while (built.firstChild) target.appendChild(built.firstChild);
}

function aiFillAttrList(list, attrs, overallStyle) {
    if (!list) return;
    list.replaceChildren();
    (attrs || []).forEach(function (attr) {
        const dt = document.createElement("dt");
        dt.textContent = attr.label;
        const dd = document.createElement("dd");
        dd.textContent = attr.value;
        list.append(dt, dd);
    });
    if (overallStyle) {
        const dt = document.createElement("dt");
        dt.textContent = "Genel stil";
        const dd = document.createElement("dd");
        dd.textContent = overallStyle;
        list.append(dt, dd);
    }
}

function aiRenderAll() {
    aiRenderResults();
    aiRenderHistory();
}

function aiRenderResults() {
    if (!aiResultsGrid) return;
    const gen = aiGetActiveGeneration();
    const selected = aiGetSelectedConcept(gen);

    if (!gen) aiState.selectedConceptId = null;

    if (aiEditPromptBtn) aiEditPromptBtn.disabled = aiBusy || !gen;
    if (aiNewSetBtn) aiNewSetBtn.disabled = aiBusy || !gen;

    if (aiResultsSub) {
        if (gen) {
            const character = gen.character || { name: "Bebeğim", gender: "girl" };
            const gender = AI_CHARACTER_LABELS[character.gender === "boy" ? "boy" : "girl"];
            aiResultsSub.textContent = "“" + aiTruncate(gen.prompt, 90) + "” · "
                + gen.concepts.length + " konsept · " + gender;
        } else {
            aiResultsSub.textContent = "Fikrini yazıp “Konseptleri oluştur”a bas.";
        }
    }

    aiResultsGrid.replaceChildren();

    if (!gen || !gen.concepts.length) {
        aiResultsGrid.hidden = true;
        if (aiEmpty) aiEmpty.hidden = false;
        if (aiSelectedPanel) aiSelectedPanel.hidden = true;
        return;
    }

    if (aiEmpty) aiEmpty.hidden = true;
    aiResultsGrid.hidden = false;

    gen.concepts.forEach(function (concept, index) {
        const isSelected = !!(selected && selected.id === concept.id);
        aiResultsGrid.appendChild(aiBuildConceptCard(concept, index, isSelected));
    });

    if (selected) {
        aiRenderSelectedConcept(selected);
    } else if (aiSelectedPanel) {
        aiSelectedPanel.hidden = true;
    }
}

function aiBuildConceptCard(concept, index, selected) {
    const card = document.createElement("article");
    card.className = "ai-concept-card" + (selected ? " is-selected" : "");
    card.setAttribute("data-concept-id", concept.id);
    card.tabIndex = 0;

    const top = document.createElement("div");
    top.className = "ai-concept-top";
    const number = document.createElement("span");
    number.className = "ai-concept-index";
    number.textContent = ("0" + (index + 1)).slice(-2);
    const badge = document.createElement("span");
    badge.className = "ai-badge";
    badge.textContent = concept.categoryLabel || "—";
    top.append(number, badge);

    const title = document.createElement("h5");
    title.className = "ai-concept-title";
    title.textContent = concept.title;

    const styleLine = document.createElement("p");
    styleLine.className = "ai-concept-style";
    styleLine.textContent = concept.style || "—";

    card.append(top, title, aiBuildSwatches(concept.mainColors), styleLine);

    const attrs = document.createElement("dl");
    attrs.className = "ai-concept-attrs";
    (concept.attributes || []).forEach(function (attr) {
        const dt = document.createElement("dt");
        dt.textContent = attr.label;
        const dd = document.createElement("dd");
        dd.textContent = attr.value;
        attrs.append(dt, dd);
    });
    card.appendChild(attrs);

    const actions = document.createElement("div");
    actions.className = "ai-concept-actions";

    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "ai-select-btn" + (selected ? " is-selected" : "");
    selectBtn.textContent = selected ? "✓ Seçildi" : "Bu konsepti seç";
    selectBtn.disabled = aiBusy;
    selectBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        aiSelectConcept(concept.id);
    });

    const rerollBtn = document.createElement("button");
    rerollBtn.type = "button";
    rerollBtn.className = "ai-reroll-btn";
    rerollBtn.title = "Bu konsepti yeniden üret";
    rerollBtn.setAttribute("aria-label", "Bu konsepti yeniden üret");
    rerollBtn.textContent = "↻";
    rerollBtn.disabled = aiBusy;
    rerollBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        aiRegenerateConcept(concept.id);
    });

    actions.append(selectBtn, rerollBtn);
    card.appendChild(actions);

    card.addEventListener("click", function (e) {
        if (e.target && e.target.closest && e.target.closest("button")) return;
        aiSelectConcept(concept.id);
    });

    card.addEventListener("keydown", function (e) {
        if (e.target && e.target.closest && e.target.closest("button")) return;
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            aiSelectConcept(concept.id);
        }
    });

    return card;
}

function aiRenderSelectedConcept(concept) {
    if (!aiSelectedPanel) return;
    aiSelectedPanel.hidden = false;

    if (aiSelectedTitle) aiSelectedTitle.textContent = concept.title;
    if (aiSelectedCategory) aiSelectedCategory.textContent = concept.categoryLabel || "—";
    aiCopySwatches(aiSelectedSwatches, concept.mainColors);
    aiFillAttrList(aiSelectedAttrs, concept.attributes, concept.style);

    if (aiRefineList) {
        aiRefineList.replaceChildren();
        (concept.refinements || []).forEach(function (refinement) {
            const li = document.createElement("li");
            li.textContent = "↳ " + refinement.instruction;
            aiRefineList.appendChild(li);
        });
    }

    if (aiRenderedSelectionId !== concept.id && aiRefineInput) {
        aiRefineInput.value = "";
    }
    aiRenderedSelectionId = concept.id;

    if (aiContinueBtn) aiContinueBtn.disabled = aiBusy;
}

function aiRenderHistory() {
    if (!aiHistoryList) return;
    aiHistoryList.replaceChildren();

    if (!aiState.generations.length) {
        const empty = document.createElement("p");
        empty.className = "ai-history-empty";
        empty.textContent = "Henüz önceki üretim yok. İlk konseptlerini oluşturduğunda burada listelenir.";
        aiHistoryList.appendChild(empty);
        return;
    }

    aiState.generations.forEach(function (gen) {
        const item = document.createElement("div");
        item.className = "ai-history-item" + (gen.id === aiState.activeGenerationId ? " is-active" : "");

        const info = document.createElement("div");
        info.className = "ai-history-info";

        const title = document.createElement("strong");
        title.textContent = aiTruncate(gen.prompt, 74);

        const meta = document.createElement("span");
        const date = new Date(gen.createdAt);
        const dateText = isNaN(date.getTime()) ? "" : date.toLocaleString("tr-TR");
        const character = gen.character || { name: "Bebeğim", gender: "girl" };
        meta.textContent = gen.concepts.length + " konsept · "
            + AI_CHARACTER_LABELS[character.gender === "boy" ? "boy" : "girl"]
            + (dateText ? " · " + dateText : "");

        info.append(title, meta);

        const restore = document.createElement("button");
        restore.type = "button";
        restore.className = "ai-ghost-btn ai-history-restore";
        if (gen.id === aiState.activeGenerationId) {
            restore.textContent = "Aktif";
            restore.disabled = true;
        } else {
            restore.textContent = "Geri yükle";
            restore.addEventListener("click", function () { aiRestoreGeneration(gen.id); });
        }

        item.append(info, restore);
        aiHistoryList.appendChild(item);
    });
}

function aiRestoreGeneration(id) {
    if (aiBusy) return;
    const gen = aiState.generations.find(function (g) { return g.id === id; });
    if (!gen) return;

    aiState.activeGenerationId = gen.id;
    aiState.selectedConceptId = null;
    aiState.draftPrompt = gen.prompt || "";
    aiState.categoryChoice = gen.categoryChoice || "auto";

    if (aiPromptInput) {
        aiPromptInput.value = aiState.draftPrompt;
        aiUpdatePromptCount();
    }
    if (aiCategorySelect) aiCategorySelect.value = aiState.categoryChoice;
    if (aiPromptError) aiPromptError.hidden = true;

    aiClearPrepared();
    aiPersistState();
    aiRenderAll();
    showStudioToast("Önceki üretim geri yüklendi.");
}

function aiRenderReadyView() {
    const prepared = aiState.preparedConcept || readStudioJson(STUDIO_AI_PREPARED_KEY);

    if (!prepared) {
        if (aiReadyTitle) aiReadyTitle.textContent = "—";
        if (aiReadyCategory) aiReadyCategory.textContent = "—";
        if (aiReadySwatches) aiReadySwatches.replaceChildren();
        if (aiReadyAttrs) aiReadyAttrs.replaceChildren();
        if (aiReadySummary) aiReadySummary.textContent = "Henüz hazırlanmış bir konsept yok.";
        if (aiReadyJson) aiReadyJson.textContent = "{}";
        return;
    }

    if (aiReadyTitle) aiReadyTitle.textContent = prepared.title || "—";
    if (aiReadyCategory) {
        aiReadyCategory.textContent = prepared.categoryLabel || prepared.category || "—";
    }
    aiCopySwatches(aiReadySwatches, prepared.mainColors);
    aiFillAttrList(aiReadyAttrs, prepared.attributes,
        prepared.structured ? prepared.structured.overallStyle : null);
    if (aiReadySummary) {
        aiReadySummary.textContent = (prepared.imageGeneration && prepared.imageGeneration.imagePrompt)
            || "—";
    }
    if (aiReadyJson) {
        try {
            aiReadyJson.textContent = JSON.stringify(prepared, null, 2);
        } catch (err) {
            aiReadyJson.textContent = "{}";
        }
    }
}

function onAiDesignViewOpened() {
    if (!aiPromptInput) return;
    aiSyncCharacterUI();
    if (!aiPromptInput.value && aiState.draftPrompt) {
        aiPromptInput.value = aiState.draftPrompt;
    }
    aiUpdatePromptCount();
    if (aiCategorySelect && aiState.categoryChoice) {
        aiCategorySelect.value = aiState.categoryChoice;
        if (!aiCategorySelect.value) aiCategorySelect.value = "auto";
    }
    aiRenderAll();
}

// ---------- başlatma ----------
function initAiDesignStudio() {
    if (!aiPromptInput || !aiCategorySelect) return;

    aiPromptInput.value = aiState.draftPrompt || "";
    aiCategorySelect.value = aiState.categoryChoice || "auto";
    if (!aiCategorySelect.value) aiCategorySelect.value = "auto";
    aiUpdatePromptCount();
    aiSyncCharacterUI();
    aiRenderAll();

    aiPromptInput.addEventListener("input", function () {
        aiUpdatePromptCount();
        if (aiPromptError) aiPromptError.hidden = true;
        if (aiDraftTimer) clearTimeout(aiDraftTimer);
        aiDraftTimer = setTimeout(function () {
            aiState.draftPrompt = aiPromptInput.value;
            aiPersistState();
        }, 300);
    });

    aiPromptInput.addEventListener("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            aiRequestNewSet();
        }
    });

    // Sekmeler arasında geçerken son yazılan açıklama da kaybolmasın.
    aiPromptInput.addEventListener("blur", function () {
        if (aiDraftTimer) clearTimeout(aiDraftTimer);
        aiState.draftPrompt = aiPromptInput.value;
        aiPersistState();
    });

    aiCategorySelect.addEventListener("change", function () {
        aiState.categoryChoice = aiCategorySelect.value || "auto";
        aiPersistState();
    });

    if (aiGenerateBtn) aiGenerateBtn.addEventListener("click", aiRequestNewSet);
    if (aiNewSetBtn) aiNewSetBtn.addEventListener("click", aiRequestNewSet);

    if (aiClearPromptBtn) {
        aiClearPromptBtn.addEventListener("click", function () {
            aiPromptInput.value = "";
            aiState.draftPrompt = "";
            aiPersistState();
            aiUpdatePromptCount();
            if (aiPromptError) aiPromptError.hidden = true;
            aiPromptInput.focus();
        });
    }

    if (aiEditPromptBtn) {
        aiEditPromptBtn.addEventListener("click", function () {
            const gen = aiGetActiveGeneration();
            if (!gen) return;
            aiPromptInput.value = gen.prompt || "";
            aiUpdatePromptCount();
            aiPromptInput.focus();
            aiPromptInput.select();
            aiPromptInput.scrollIntoView({ behavior: "smooth", block: "center" });
            showStudioToast("Açıklamayı düzenleyip yeni set oluşturabilirsin.");
        });
    }

    if (aiHistoryToggle) {
        aiHistoryToggle.addEventListener("click", function () {
            if (!aiHistoryPanel) return;
            const willOpen = aiHistoryPanel.hidden;
            aiHistoryPanel.hidden = !willOpen;
            aiHistoryToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
        });
    }

    if (aiRefineApplyBtn) aiRefineApplyBtn.addEventListener("click", aiApplyRefinementFromUI);
    if (aiRefineInput) {
        aiRefineInput.addEventListener("keydown", function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                aiApplyRefinementFromUI();
            }
        });
    }

    if (aiContinueBtn) aiContinueBtn.addEventListener("click", aiContinueWithSelected);
    if (aiReadyBackBtn) {
        aiReadyBackBtn.addEventListener("click", function () { showStudioView("ai"); });
    }
    if (aiReadyHomeBtn) {
        aiReadyHomeBtn.addEventListener("click", function () { showStudioView("home"); });
    }
    if (aiReadyNewBtn) aiReadyNewBtn.addEventListener("click", aiStartNewDesign);

    // Gelecekteki görsel üretim aşaması için salt okunur köprü.
    window.DollAIStudio = {
        storageKeys: {
            state: STUDIO_AI_STATE_KEY,
            prepared: STUDIO_AI_PREPARED_KEY
        },
        getPreparedConcept: function () {
            return readStudioJson(STUDIO_AI_PREPARED_KEY) || aiState.preparedConcept || null;
        },
        getState: function () {
            try {
                return JSON.parse(JSON.stringify(aiState));
            } catch (err) {
                return null;
            }
        }
    };
}

initAiDesignStudio();
