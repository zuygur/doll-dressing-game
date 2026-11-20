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
    wheel.addEventListener("pointerup", function () { dragging = false; });
    wheel.addEventListener("pointercancel", function () { dragging = false; });

    slider.addEventListener("input", function () {
        state.v = Number(slider.value);
        state.active = true;
        notify();
    });

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
