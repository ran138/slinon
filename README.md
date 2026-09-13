# Slinon

⁧סלינון הוא פרויקט לעדכון פיננסי אישי בעברית. המוצר מאפשר למשתמש לבחור נכסים ונושאים שמעניינים אותו, לאסוף מידע עדכני ממקורות, ולהפוך אותו לתקציר קצר שאפשר לקרוא או לשמוע כפודקאסט אישי.⁩

⁧המאגר כולל אתר שיווק, עמוד מוצר נוסף, אב־טיפוס עצמאי של ממשק המשתמש ויישום מקומי מלא בשם ⁦Vestory⁩.⁩

## ⁧רכיבי הפרויקט⁩

⁧א. ⁦marketing_page⁩ — אתר השיווק הראשי של ⁦Vestory⁩ מבית סלינון. זהו אתר סטטי ללא תהליך בנייה, הכולל דף ראשי, הדגמה, דוגמאות, הסבר על המוצר, עמודי השוואה ועמוד אמון ומקורות.⁩

⁧ב. ⁦on_slinon_page⁩ — עמוד מוצר סטטי נוסף המציג את רעיון הפודקאסט האישי ואת תהליך ההצטרפות.⁩

⁧ג. ⁦ui_web_app⁩ — אב־טיפוס עצמאי של ממשק ⁦Vestory⁩, ארוז בתוך קובץ ⁦HTML⁩ יחיד. הוא מיועד להדגמה ואינו מחובר לשרת הפעיל.⁩

⁧ד. ⁦vestory⁩ — יישום המוצר המלא. זהו יישום ⁦Next.js⁩ מקומי בעברית, הכולל ממשק משתמש, נתיבי שרת, מסד נתונים מקומי, מחקר בעזרת ⁦OpenAI⁩ ויצירת קובצי שמע.⁩

## ⁧מבנה המאגר⁩

```text
slinon/
├── .github/workflows/pages.yml   # GitHub Pages deployment
├── vestory/                      # Full-stack local application
├── marketing_page/               # Main static marketing website
├── on_slinon_page/               # Alternative static product page
├── ui_web_app/
│   └── vestory.html              # Standalone UI prototype
└── README.md
```

## ⁧היישום המקומי⁩

⁧⁦Vestory⁩ הוא יישום מודולרי יחיד המבוסס על ⁦Next.js 16⁩, ⁦React⁩, ⁦TypeScript⁩ ו־⁦SQLite⁩. הוא מאזין כברירת מחדל רק למחשב המקומי בכתובת הבאה:⁩

```text
http://127.0.0.1:5173
```

⁧היישום שומר פרופיל, נכסים, רשימת מעקב, תחומי עניין, תקצירים, פרקים ומקורות. הוא משתמש ב־⁦OpenAI Responses API⁩ לצורך מחקר ויצירת תסריט בעברית, וב־⁦Speech API⁩ לצורך הפקת שמע.⁩

⁧נתיבי השרת המרכזיים הם:⁩

```text
GET  /api/profile
PUT  /api/profile
GET  /api/onboarding/draft
PUT  /api/onboarding/draft
DELETE /api/onboarding/draft
POST /api/portfolio/parse
GET  /api/briefs
POST /api/briefs
GET  /api/briefs/:id
GET  /api/briefs/:id/audio/:chapter
```

## ⁧דרישות מערכת⁩

⁧א. ⁦Node.js 22.13⁩ או גרסה חדשה יותר.⁩

⁧ב. מפתח ⁦OpenAI API⁩ עם גישה למודלי הטקסט והדיבור המוגדרים בפרויקט.⁩

## ⁧התקנה והפעלה⁩

⁧עברו לתיקיית היישום:⁩

```bash
cd vestory
```

⁧צרו קובץ הגדרות מקומי אם הוא עדיין אינו קיים:⁩

```bash
cp .env.example .env.local
```

⁧הוסיפו לקובץ את מפתח השירות ואת הגדרות המודלים:⁩

```dotenv
OPENAI_API_KEY=
OPENAI_TEXT_MODEL=gpt-5.6-terra
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=coral
```

⁧התקינו את התלויות והפעילו את סביבת הפיתוח:⁩

```bash
npm ci
npm run dev
```

⁧לאחר ההפעלה פתחו בדפדפן:⁩

```text
http://127.0.0.1:5173
```

## ⁧פקודות שימושיות⁩

```bash
npm run dev        # Start the local development server
npm run build      # Create a production build
npm start          # Start the production build locally
npm run typecheck  # Validate TypeScript
npm run lint       # Run ESLint
npm run db:generate
```

## ⁧הרצת האתרים הסטטיים⁩

⁧אפשר לפתוח את קובצי ⁦HTML⁩ ישירות, או להפעיל שרת מקומי פשוט מתוך שורש המאגר.⁩

⁧אתר השיווק הראשי:⁩

```bash
python3 -m http.server 8000 --directory marketing_page
```

```text
http://127.0.0.1:8000
```

⁧עמוד המוצר הנוסף:⁩

```bash
python3 -m http.server 8001 --directory on_slinon_page
```

```text
http://127.0.0.1:8001
```

⁧אב־הטיפוס העצמאי:⁩

```bash
python3 -m http.server 8002 --directory ui_web_app
```

```text
http://127.0.0.1:8002/vestory.html
```

## ⁧נתונים מקומיים וסודות⁩

⁧המידע המתמשך של ⁦Vestory⁩ נשמר מקומית ואינו אמור להיכנס לבקרת הגרסאות:⁩

```text
vestory/data/vestory.sqlite
vestory/data/audio/
vestory/.env.local
```

⁧מסד הנתונים שומר את הפרופיל, הארכיון, התסריטים ופרטי המקורות. קובצי השמע נשמרים בתיקיית ⁦audio⁩. מומלץ לגבות את תיקיית ⁦data⁩ כדי לשמור את המידע והתקצירים שנוצרו.⁩

⁧מפתח ⁦OpenAI API⁩ נקרא רק בצד השרת. אין להכניס אותו לקוד, לקובץ ⁦README⁩ או לבקרת הגרסאות.⁩

## ⁧פריסה⁩

⁧כל דחיפה לענף ⁦main⁩ מפעילה את תהליך ⁦GitHub Pages⁩ ומפרסמת את התוכן של ⁦marketing_page⁩. הדומיין המוגדר כרגע הוא:⁩

```text
slinon.me
```

⁧הגדרת ⁦Vercel⁩ המקומית מקשרת את הפרויקט לתיקיית ⁦vestory⁩. עם זאת, היישום משתמש כרגע במסד ⁦SQLite⁩ ובקובצי שמע הנשמרים בדיסק המקומי. לפני פריסה בסביבה שבה מערכת הקבצים אינה מתמשכת, צריך להעביר את הנתונים והקבצים לאחסון מתמשך מתאים.⁩

## ⁧מצב ידוע לאחר ארגון התיקיות⁩

⁧בחלק מדפי ⁦marketing_page⁩ עדיין קיימים קישורים לנתיב הישן:⁩

```text
site/index.html
site/assets/slinon-logo.png
```

⁧תיקיית ⁦site⁩ הוחלפה במבנה החדש ואינה קיימת עוד כתיקיית מוצר פעילה. לכן יש לעדכן את הקישורים ואת נתיב הלוגו לפני פרסום גרסת השיווק החדשה.⁩

## ⁧הבהרה פיננסית⁩

⁧הפרויקט מיועד להצגת מידע כללי בלבד. הוא אינו מספק המלצות קנייה, מכירה או החזקה, תחזיות מחיר או ייעוץ השקעות אישי.⁩
