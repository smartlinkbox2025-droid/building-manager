# خط الأساس للمشروع — Building Manager PWA

## النسخة التي تم تحليلها

- المصدر: نسخة GitHub العاملة المرفوعة باسم `building-manager-main.zip`.
- الحالة الحالية: التطبيق منشور ويعمل على GitHub Pages.
- التقنية الحالية: React + TypeScript + Vite + Dexie + PWA.
- قاعدة البيانات: IndexedDB باسم `BuildingManagerDB`، إصدار المخطط الحالي 1.
- مسار النشر: `/building-manager/`.
- التوجيه: `HashRouter`، وهو مناسب لـ GitHub Pages.

## الملفات الحالية الأساسية

- `src/types/models.ts`
- `src/db/database.ts`
- `src/pages/*`
- `src/services/export.ts`
- `src/services/backup.ts`
- `vite.config.ts`
- `.github/workflows/deploy.yml`

## قاعدة مهمة

هذه النسخة هي **خط الأساس الرسمي**. يجب عدم إعادة كتابة المشروع من الصفر، وعدم حذف أي وظيفة تعمل، وعدم تغيير أسماء قاعدة البيانات أو الجداول الحالية دون Migration آمن يحافظ على بيانات المستخدم.

## أولويات الحماية

1. عدم فقدان بيانات IndexedDB الحالية.
2. عدم كسر رابط GitHub Pages.
3. عدم كسر تثبيت PWA.
4. عدم حذف أو استبدال السجلات المالية القائمة.
5. اختبار البناء بعد كل مرحلة.
