const move_next = document.getElementById("move_next");
const skin = document.getElementById("skin");
const menu = document.getElementById("menu");

move_next.addEventListener("click", function(){
    skin.style.display = "none";
    menu.style.display = "block";
});

const category = document.querySelectorAll(".categ-btn");
const option = document.querySelectorAll(".opt");

category.forEach(function(button){
    button.addEventListener("click", function(){
        option.forEach(function(box){
            box.style.display = "none";
        });
        category.forEach(function(b){
            b.classList.remove("categ-btn-act");
        });
        button.classList.add("categ-btn-act");
        const targetBox = button.getAttribute("target");
        document.getElementById(targetBox).style.display = "flex";
    });
});

const skinButtons = document.querySelectorAll(".skin-btn");
const baseDoll = document.getElementById("base-doll");

skinButtons.forEach(button => {
    button.addEventListener("click", function() {
        // 1. Menüdeki diğer ten rengi butonlarının aktiflik ışığını söndür
        skinButtons.forEach(btn => btn.classList.remove("skin-btn-act"));
        
        // 2. Tıklanan butona aktiflik klasını ekle
        this.classList.add("skin-btn-act");
        
        // 3. Butondaki data-img değerini al ve ana bebeğin (base-doll) resmi yap
        const selectedSkinSrc = this.getAttribute("data-img");
        baseDoll.setAttribute("src", selectedSkinSrc);
    });
});

// --- ENTEGRE GİYDİRME, ÇIKARMA VE KATMAN YÖNETİMİ ---

const allOptButtons = document.querySelectorAll(".opt-btn");

allOptButtons.forEach(btn => {
    btn.addEventListener("click", function() {
        
        // =========================================================
        // 1. DURUM: EĞER TIKLANAN BUTON SAÇ KATEGORİSİNDEYSE
        // =========================================================
        if (this.closest("#hair")) {
            const hairFront = document.getElementById('layer-hair-front');
            const hairBack = document.getElementById('layer-hair-back');
            
            // Eğer data-front tanımlanmamışsa butonun içindeki görselin adını referans al
            const frontSrc = this.getAttribute('data-front') || this.querySelector("img").getAttribute('src');
            const backSrc = this.getAttribute('data-back'); // Yoksa null döner

            // Aç/Kapat (Toggle) Kontrolü: URL karmasından kaçmak için getAttribute('src') kullanıyoruz
            const currentFront = hairFront.getAttribute('src');

            if (currentFront === frontSrc) {
                // Zaten aynı saç giyiliyse: ÇIKAR!
                hairFront.removeAttribute('src');
                hairBack.removeAttribute('src');
                this.classList.remove("opt-btn-act");
            } else {
                // Farklı saç seçildiyse: Önce eskisini sil, yenisini GİYDİR!
                hairFront.setAttribute('src', frontSrc);
                if (backSrc) {
                    hairBack.setAttribute('src', backSrc);
                } else {
                    hairBack.removeAttribute('src');
                }
                
                // Menüdeki diğer saç butonlarının aktifliğini temizle
                this.parentElement.querySelectorAll(".opt-btn").forEach(b => b.classList.remove("opt-btn-act"));
                this.classList.add("opt-btn-act");
            }
            return; // Saç işi bitti, aşağıdaki giysi kodlarının çalışmasını engelle!
        }

        // =========================================================
        // 2. DURUM: DİĞER TÜM KIYAFETLER VE AKSESUARLAR İÇİN
        // =========================================================
        const itemImg = this.querySelector("img").getAttribute('src');
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
                    const position = this.getAttribute('data-position');
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
        }
    });
});