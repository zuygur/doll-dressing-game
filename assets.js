/**
 * Doll Dressing Game asset manifest.
 *
 * Paths are kept in sync with the files that actually exist in the
 * clothes/ hair/ shoes/ face/ accesor/ folders. Leave future paths out
 * until the real artwork is added; the UI must not invent replacement assets.
 */
const DOLL_ASSETS = {
    version: 1,
    // Renklendirme başlangıç değerleri (orijinal görsellerin tonları).
    // boost: duotone multiply öncesi gri tonlamanın parlaklık çarpanı.
    colorDefaults: {
        skin: "#fcddc1",
        hair: "#5d3c29",
        skinBoost: 1,
        hairBoost: 3
    },
    // Not: Saça aynı anda tek renk uygulanır. İleride bölge maskeli saç
    // görselleri eklendiğinde bölge verileri buraya eklenebilir.
    characters: {
        girl: {
            id: "girl",
            name: "Girl",
            body: {
                default: "doll.png",
                skinTones: [
                    { id: "light", path: "doll.png", color: "bisque" }
                ]
            },
            face: [
                { id: "girl-face-1", path: "face/yüz1.png", default: true },
                { id: "girl-face-2", path: "face/yüz2.png" },
                { id: "girl-face-3", path: "face/yüz3.png" },
                { id: "girl-face-4", path: "face/yüz4.png" },
                { id: "girl-face-5", path: "face/yüz5.png" }
            ],
            hair: [
                { id: "girl-hair-1", path: "hair/önsaç1.png", thumbnail: "hair/tümsaç1.png", backPath: "hair/arkasaç1.png" },
                { id: "girl-hair-2", path: "hair/önsaç2.png", thumbnail: "hair/tümsaç2.png", backPath: "hair/arkasaç2.png" },
                { id: "girl-hair-3", path: "hair/önsaç3.png", thumbnail: "hair/tümsaç3.png" },
                { id: "girl-hair-4", path: "hair/önsaç4.png", thumbnail: "hair/tümsaç4.png", backPath: "hair/arkasaç4.png" },
                { id: "girl-hair-5", path: "hair/önsaç5.png", thumbnail: "hair/tümsaç5.png", backPath: "hair/arkasaç5.png" }
            ],
            tops: [
                { id: "girl-top-shirt-1", path: "clothes/gömlek1.png" },
                { id: "girl-top-shirt-2", path: "clothes/gömlek2.png" },
                { id: "girl-top-sweatshirt-1", path: "clothes/sweat1.png" },
                { id: "girl-top-sweatshirt-2", path: "clothes/sweat2.png" },
                { id: "girl-top-tshirt-1", path: "clothes/tişört1.png", position: "under" },
                { id: "girl-top-tshirt-2", path: "clothes/tişört2.png", position: "under" }
            ],
            bottoms: [
                { id: "girl-bottom-trousers", path: "clothes/pantolon.png" },
                { id: "girl-bottom-tracksuit", path: "clothes/eşofman.png" },
                { id: "girl-bottom-skirt-1", path: "clothes/etek1.png" },
                { id: "girl-bottom-skirt-2", path: "clothes/etek2.png" }
            ],
            shoes: [
                { id: "girl-shoe-1", path: "shoes/ayakkabı1.png" },
                { id: "girl-shoe-2", path: "shoes/ayakkabı2.png" },
                { id: "girl-shoe-3", path: "shoes/ayakkabı3.png" },
                { id: "girl-shoe-4", path: "shoes/ayakkabı4.png" },
                { id: "girl-shoe-5", path: "shoes/ayakkabı5.png" },
                { id: "girl-shoe-6", path: "shoes/ayakkabı6.png" }
            ],
            accessories: [
                { id: "girl-accessory-bag-1", path: "accesor/bag1.png", slot: "hand", default: true },
                { id: "girl-accessory-bag-2", path: "accesor/bag2.png", slot: "hand" },
                { id: "girl-accessory-bag-3", path: "accesor/bag3.png", slot: "hand" },
                { id: "girl-accessory-headband", path: "accesor/headband.png", slot: "head" },
                { id: "girl-accessory-headphones", path: "accesor/headphones.png", slot: "head" },
                { id: "girl-accessory-hair-clip-1", path: "accesor/toka1.png", slot: "head" },
                { id: "girl-accessory-hair-clip-2", path: "accesor/toka2.png", slot: "head" },
                { id: "girl-accessory-glasses", path: "accesor/glasses.png", slot: "face" }
            ],
            // Reserved for future supplied artwork. No temporary images are used.
            hairColorVariants: [],
            clothingColorVariants: []
        },
        boy: {
            id: "boy",
            name: "Boy",
            body: {
                default: "boydoll.png",
                skinTones: [
                    { id: "light", path: "boydoll.png", color: "bisque" }
                ]
            },
            face: [
                { id: "boy-face-1", path: "face/boyyüz1.png", thumbnail: "face/boyyüz1-removebg-preview.png", default: true },
                { id: "boy-face-2", path: "face/boyyüz2.png", thumbnail: "face/boyyüz2-removebg-preview.png" },
                { id: "boy-face-3", path: "face/boyyüz3.png", thumbnail: "face/boyyüz3-removebg-preview.png" },
                { id: "boy-face-4", path: "face/boyyüz4.png", thumbnail: "face/boyyüz4-removebg-preview.png" },
                { id: "boy-face-5", path: "face/boyyüz5.png", thumbnail: "face/boyyüz5-removebg-preview.png" }
            ],
            hair: [
                { id: "boy-hair-1", path: "hair/boysaç1.png", thumbnail: "hair/boysaç1-removebg-preview.png" },
                { id: "boy-hair-2", path: "hair/boysaç2.png", thumbnail: "hair/boysaç2-removebg-preview.png" },
                { id: "boy-hair-3", path: "hair/boysaç3.png", thumbnail: "hair/boysaç3-removebg-preview.png" },
                { id: "boy-hair-4", path: "hair/boysaç4.png", thumbnail: "hair/boysaç4-removebg-preview.png" },
                { id: "boy-hair-5", path: "hair/boysaç5.png", thumbnail: "hair/boysaç5-removebg-preview.png" }
            ],
            tops: [
                { id: "boy-top-shirt-1", path: "clothes/boygömlek1.png" },
                { id: "boy-top-shirt-2", path: "clothes/boygömlek2.png" },
                { id: "boy-top-sweatshirt", path: "clothes/boysweat.png" },
                { id: "boy-top-tshirt-1", path: "clothes/boytişört1.png", position: "under" },
                { id: "boy-top-tshirt-2", path: "clothes/boytişört2.png", position: "under" }
            ],
            bottoms: [
                { id: "boy-bottom-trousers-1", path: "clothes/boypantolon1.png" },
                { id: "boy-bottom-trousers-2", path: "clothes/boypantolon2.png" },
                { id: "boy-bottom-tracksuit", path: "clothes/boyeşofman.png" },
                { id: "boy-bottom-shorts-1", path: "clothes/boyşort1.png" },
                { id: "boy-bottom-shorts-2", path: "clothes/boyşort2.png" }
            ],
            shoes: [
                { id: "boy-shoe-1", path: "shoes/boyayakkabı1.png" },
                { id: "boy-shoe-2", path: "shoes/boyayakkabı2.png" },
                { id: "boy-shoe-3", path: "shoes/boyayakkabı3.png" },
                { id: "boy-shoe-4", path: "shoes/boyayakkabı4.png" },
                { id: "boy-shoe-5", path: "shoes/boyayakkabı5.png" }
            ],
            accessories: [],
            // Add supplied variations here later; empty means not available yet.
            hairColorVariants: [],
            clothingColorVariants: []
        }
    }
};

function assetIsConfigured(asset) {
    return Boolean(asset && typeof asset.path === "string" && asset.path.trim());
}
