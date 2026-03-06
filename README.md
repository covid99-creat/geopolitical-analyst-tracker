# Geo-Political Analyst Tracker

אתר שסורק מקורות ברשת (RSS), מזהה תחזיות גיאו-פוליטיות, ובודק/מדורג לפי אירועים בפועל.

## מה יש בפרויקט

- `server.js` - שרת Node ללא תלות בחבילות חיצוניות.
- `index.html`, `app.js`, `styles.css` - ממשק משתמש.
- `data/sources.json` - רשימת מקורות RSS לסריקה.
- `data/predictions.seed.json` - תחזיות בסיס לדוגמה.
- `data/live_predictions.json` - תחזיות שנסרקו מהרשת.
- `data/events.json` - אירועים בפועל להשוואה.

## איך להריץ מקומית

1. ודא ש-Node 18+ מותקן.
2. בתיקיית הפרויקט:

```powershell
npm start
```

3. פתח בדפדפן:

- `http://localhost:3000`

4. לחץ על "רענון מהרשת" כדי למשוך תחזיות חדשות מהמקורות ב-`data/sources.json`.

## איך זה עובד

- השרת מושך RSS מכל מקור.
- מסנן אייטמים עם ניסוח תחזיתי (למשל `will`, `likely`, `forecast`, `צפוי`).
- מייצר רשומת תחזית עם:
  - פרשן
  - טענה
  - דדליין משוער
  - הסתברות משוערת
  - `eventKey` אם זוהתה התאמה לאירוע ידוע
- הדירוג מחושב רק על תחזיות עם `eventKey` שקיים ב-`events.json`.

## שיטת ניקוד

- דיוק בינארי (`p>=0.5` מול התממשות בפועל)
- Brier Score
- ציון סופי: `60% דיוק + 40% (1 - Brier)`

## חיבור לאונליין (הכי פשוט: Render)

1. העלה את הקוד ל-GitHub.
2. פתח חשבון ב-Render.
3. צור `Web Service` חדש מה-Repo.
4. הגדר:
   - Runtime: `Node`
   - Build Command: ריק (אין dependencies)
   - Start Command: `npm start`
5. אשר Deploy.

האתר יהיה זמין ב-URL ציבורי של Render.

## הערות פרודקשן חשובות

- `live_predictions.json` נכתב לדיסק מקומי; בחלק מהפלטפורמות הדיסק אפמרלי.
- לפרודקשן אמיתי מומלץ לעבור ל-DB (למשל Postgres) במקום קבצי JSON.
- יש להקשיח את זיהוי התחזיות/מיפוי אירועים (כרגע heuristic בסיסי).
