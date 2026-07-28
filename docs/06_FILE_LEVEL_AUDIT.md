# تدقيق الملفات الحالية

## `src/types/models.ts`

- جيد كبداية، لكنه يخلط بعض المفاهيم.
- `extras` يجب ألا يبقى المصدر النهائي للمبالغ الإضافية.
- يلزم إضافة حالات Typed unions بدلاً من `string`.
- يلزم إضافة بيانات الإلغاء والـsoft delete.

## `src/db/database.ts`

- مخطط v1 بسيط ويعمل.
- ممنوع تعديله بأثر رجعي.
- يجب إضافة `version(2)` وما بعدها مع upgrade functions.
- يلزم Transactions لتسلسل الإيصالات والعمليات المركبة.

## `src/services/export.ts`

- Excel أولي.
- PDF الحالي صورة Screenshot؛ لا يحقق PDF عربي نصي احترافي.
- يجب استبداله تدريجياً بخدمة PDF تدعم خطاً عربياً مدمجاً.

## `src/services/backup.ts`

- يصدر JSON داخل ZIP فقط.
- لا توجد مرفقات أو Blobs.
- الاستعادة تستبدل مباشرة دون تحقق أو rollback.
- يجب إضافة validate + preview + merge/replace.

## الصفحات

- معظم الصفحات تجمع UI وbusiness logic وDB calls في ملف واحد.
- يلزم فصل hooks/services/repositories تدريجياً.
- لا توجد آلية موحدة للبحث والفلاتر أو الأخطاء.

## `vite.config.ts`

- الإعداد الحالي مناسب لمستودع `building-manager`.
- القيم المطلقة تجعل إعادة تسمية المستودع تحتاج تعديلاً يدوياً.
- لاحقاً يمكن اعتماد متغير بيئة للـbase path.

## `.github/workflows/deploy.yml`

- يعمل مع GitHub Pages.
- الأفضل استخدام `npm ci` بعد إضافة lockfile.
