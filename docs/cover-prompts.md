# أوامر توليد صور الأغلفة (Photorealistic AI Prompts)

صور واقعية موحّدة الهوية لكل قسم وسلسلة ودورة في منصة المحجة البيضاء.
استعملها في أي أداة توليد صور، ثم ارفع الصورة من **لوحة التحكم ← السلاسل وقوائم التشغيل ← صور الأغلفة**،
أو ضعها في المسار المذكور بالاسم نفسه فتظهر تلقائيًا لكل الزوار.

## إعدادات مشتركة (أضِفها في آخر كل أمر)

```
photorealistic photograph, shot on full-frame DSLR, 35mm lens, shallow depth of field,
cinematic soft light, color grade in deep navy blue (#2c2853), muted violet and warm gold (#c9a46a) highlights,
calm uncluttered lower third (space for a title), 16:9, 1920x1080, high detail, natural textures
--no human figures depicting prophets or companions, no readable text, no letters, no watermark, no logo, no cartoon, no illustration, no 3D render
```

> **مهم:** اطلب دائمًا «no readable text». أدوات التوليد تكتب حروفًا عربية مشوّهة، ولا يليق ذلك بالمصحف أو الكتب الشرعية.
> القارئ في «دروس التجويد» يظهر بلباس محتشم ومن زاوية جانبية. ولا تُصوَّر شخصيات الأنبياء ولا الصحابة؛ يُعبَّر عن السيرة والصحابة بالأماكن والبيئة فقط.

## أقسام المنصة — `assets/covers/sections/`

| الملف | الموضوع | الأمر |
|---|---|---|
| `library.jpg` | المكتبة العلمية | Grand old Islamic library hall, tall dark wooden shelves of leather-bound books with gold-tooled spines, carved arches, warm lantern light, dust in light beams |
| `student.jpg` | فضاء الطلاب | Student's study desk in a mosque courtyard at dusk: open notebook, wooden reading stand with a closed book, pen, cup of tea, brass lantern glowing, soft bokeh arches |
| `courses.jpg` | الدورات والسلاسل | Neatly ordered row of matching navy cloth-bound book volumes with gold bands on a walnut shelf, one volume pulled slightly forward, warm side light |
| `about.jpg` | عن المنصة | Saharan mosque with stone minaret in a Mauritanian desert town at golden hour, palm trees, long soft shadows, deep blue sky turning violet |

## أقسام المكتبة — `assets/covers/<القسم>.jpg`

| الملف | القسم | الأمر |
|---|---|---|
| `fiqh.jpg` | شروح المتون الفقهية | Stack of antique Arabic manuscripts and leather-bound fiqh books on a low wooden table, reed pen and brass inkwell, oil lamp light |
| `seerah.jpg` | السيرة النبوية | Historic view of old Medina: mud-brick houses and palm groves around a simple early mosque, mountains (Uhud) on the horizon, golden dusk light, no people |
| `hadith.jpg` | الحديث النبوي | Scholar's wooden desk with multi-volume classical hadith books with ornate gold spines, one open (text blurred), reading glasses, reed pen, warm desk lamp |
| `sahaba.jpg` | حياة الصحابة | Symbolic early-Islamic era scene: ancient Arabian desert at sunrise, palm grove, mud-brick fortress ruins, distant camel caravan silhouettes, dust haze, no faces |
| `quran.jpg` | تلاوات القرآن الكريم | Open Mushaf on a carved wooden rehal (script soft and unreadable), calm beautiful light rays through a mosque window, prayer carpet, serene mood |
| `tajweed.jpg` | دروس التجويد | Modestly dressed reciter in a white thobe and cap, seen from the side in soft shadow, reciting before an open Mushaf on a rehal (text unreadable), mosque interior bokeh, respectful mood |
| `arabic.jpg` | دروس اللغة العربية | Old Arabic manuscripts, bamboo qalam pens and brass inkwell on a desk, elegant flowing calligraphic ink strokes (abstract, no misspelled letters), warm light |

## السلاسل — `assets/covers/series/`

| الملف | السلسلة | الأمر |
|---|---|---|
| `s-akh.jpg` | شرح مختصر الأخضري | Small antique leather book on a woven palm mat next to a copper water ewer (ibriq) and prayer beads, morning window light |
| `s-ibn.jpg` | شرح منظومة ابن عاشر | Courtyard of an old Fes madrasa with zellige tilework and carved cedar wood, an open manuscript on a stand in the foreground, golden light |
| `s-taj.jpg` | سلسلة التجويد | Wooden rehal holding an open Mushaf in a quiet mosque corner, a vintage microphone softly out of focus behind, violet dusk light |
| `s-ar.jpg` | سلسلة اللسان العربي | Traditional Mauritanian wooden writing tablets (lawh) leaning together, ink pot and reed pens, desert sand texture, warm sunlight |
| `s-seer.jpg` | سلسلة السيرة النبوية | White Quba Mosque at sunrise with palm trees, empty forecourt, soft golden haze, wide composition |

## قوائم التشغيل (الدورات) — `assets/covers/courses/`

| الملف | الدورة | الأمر |
|---|---|---|
| `c1.jpg` | كتاب الطهارة | Row of brass ablution taps over a marble basin in a mosque, water droplets, clean reflections, cool blue tones with gold accents |
| `c5.jpg` | كتاب الطهارة من المرشد المعين | Moroccan zellige ablution fountain in a mosque courtyard, clear water flowing, carved stucco arches |
| `c2.jpg` | التجويد للمبتدئين | Child's small hand following lines on an open Mushaf with a wooden pointer (text blurred), soft window light, rehal |
| `c3.jpg` | النحو الميسر — الآجرومية | Old open grammar manuscript with marginal notes (illegible), magnifying glass and reed pen, warm desk lamp |
| `c4.jpg` | دروس في السيرة النبوية | Desert road leading toward Medina at dusk, mountains on the horizon, first stars in a violet sky |

## المواصفات الفنية

- الأبعاد: **1920×1080** (16:9). تقصّها المنصة تلقائيًا للهاتف والحاسوب.
- الصيغة: JPG بجودة 80 تقريبًا (أو WebP) وبحجم أقل من 400 ك.ب.
- اجعل الجزء السفلي هادئًا، فالعنوان يُكتب فوقه بتدرّج كحلي.
