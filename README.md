# Rubik Küp Çözücü

Telefon kamerasıyla Rubik küpünü tarayan ve adım adım çözümünü gösteren web uygulaması.

**Canlı:** https://ozdmrysn.github.io/rubic/

## Nasıl kullanılır

1. **Tara** — "Kamerayla tara"ya bas, küpün 6 yüzünü sırayla ızgaraya oturtup çek.
   Ekrandaki küçük küp, bir sonraki yüz için küpü nasıl çevireceğini gösterir.
2. **Kontrol et** — okunan renkleri küpünle karşılaştır. Yanlış kare varsa alttan rengi seçip kareye dokun.
3. **Çöz** — küpü ekranda söylenen şekilde tut, "İleri"ye bastıkça gösterilen hamleyi uygula.

İpuçları: aydınlık ama parlama olmayan bir yerde tara; küpü sadece ekranda gösterildiği gibi çevir.
Kamera kullanamıyorsan "Renkleri elle gir" ile de çözebilirsin.

## Nasıl çalışır

- **Renk okuma** (`js/scanner.js`, `js/color.js`): Her karenin ortasından ortanca renk okunur. 6 yüz bitince
  kareler, orta kareler referans alınarak ve her renkten tam 9 tane olacak şekilde gruplanır; bu, ışığa göre
  kayan kırmızı/turuncu ve beyaz/sarı ayrımını tek tek tahminden çok daha sağlam yapar.
- **Hata düzeltme** (`js/repair.js`): Küp geçersiz çıkarsa yanlış yöne çevrilmiş yüzler ve bir-iki yanlış
  okunmuş kare, tek bir geçerli düzeltme varsa otomatik düzeltilir.
- **Çözüm** (`js/solver-worker.js`): Kociemba'nın iki aşamalı algoritması ([cubejs](https://github.com/ldez/cubejs), MIT)
  arka planda çalışır; çözümler genelde 20–22 hamledir.
- **3B küp** (`js/cube3d.js`): CSS 3B dönüşümleriyle çizilir, parmakla çevrilebilir.

Sunucu ya da derleme adımı yok; her şey tarayıcıda çalışır, kamera görüntüsü cihazdan çıkmaz.

## Geliştirme

```bash
python3 -m http.server 8123   # http://localhost:8123
node test/model.test.mjs      # küp modeli, tarama ve çözücü testleri
```

Kamerasız tarama testi için tarayıcı konsolunda:
`await import('./test/fakecam.js'); await __runScan()`
