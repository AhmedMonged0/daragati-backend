import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cors from 'cors';

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// القاموس الشامل لجميع محافظات مصر الـ 27 لعام 2026
const GOV_MAPPING = {
  'القاهرة': 'Cairo',
  'الجيزة': 'Giza',
  'الإسكندرية': 'Alexandria',
  'المنوفية': 'Monufia',
  'الغربية': 'Gharbia',
  'الدقهلية': 'Dakahlia',
  'القليوبية': 'Qalyubia',
  'الشرقية': 'Sharqia',
  'البحيرة': 'Beheira',
  'دمياط': 'Damietta',
  'بورسعيد': 'Port-Said',
  'السويس': 'Suez',
  'إسماعيلية': 'Ismailia',
  'كفر الشيخ': 'Kafr-El-Sheikh',
  'الفيوم': 'Fayoum',
  'بني سويف': 'Beni-Suef',
  'المنيا': 'Minya',
  'أسيوط': 'Asyut',
  'سوهاج': 'Sohag',
  'قنا': 'Qena',
  'الأقصر': 'Luxor',
  'أسوان': 'Aswan',
  'البحر الأحمر': 'Red-Sea',
  'الوادي الجديد': 'New-Valley',
  'مطروح': 'Matrouh',
  'شمال سيناء': 'North-Sinai',
  'جنوب سيناء': 'South-Sinai'
};

app.get('/api/result', async (req, res) => {
  const { gov, seatNo } = req.query;

  if (!gov || !seatNo) {
    return res.status(400).json({ success: false, message: 'برجاء تحديد المحافظة ورقم الجلوس.' });
  }

  const govEn = GOV_MAPPING[gov.trim()];
  if (!govEn) {
    return res.status(400).json({ success: false, message: 'المحافظة المحددة غير مدعومة حالياً.' });
  }

  // 🎯 الرابط المستهدف من موقع نذاكر
  const targetUrl = `https://nezaker.com/prep/${govEn}/${seatNo}`;

  try {
    // 🔥 التعديل الجوهري: إرسال الطلب متخفي تماماً في شكل متصفح بشرى حقيقي لمنع الحظر
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        'Referer': 'https://nezaker.com/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Connection': 'keep-alive'
      },
      timeout: 10000 // مهلة 10 ثوانٍ لو السيرفر عندهم ثقيل
    });

    const $ = cheerio.load(response.data);

    // استخراج اسم الطالب وحالة النجاح
    const rawName = $('h2.text-center.font-bold').text().trim() || $('h2').first().text().trim();
    const cleanName = rawName.replace('نتيجة الطالب :', '').replace('نتيجة الطالب:', '').trim();
    
    const statusText = $('span.badge.bg-success').text().trim() || $('span.badge').text().trim();

    // استخراج المجموع الكلي المكتوب مباشرة لو موجود
    let scrapTotalScore = 0;
    $('div.alert.alert-info, div.alert-success').each((i, el) => {
      const txt = $(el).text();
      if (txt.includes('المجموع الكلي') || txt.includes('المجموع')) {
        const match = txt.match(/[\d.]+/);
        if (match) scrapTotalScore = parseFloat(match[0]);
      }
    });

    const grades = [];
    let calculatedTotal = 0;

    // سحب الجدول الخاص بالمواد والدرجات
    const tableRows = $('table.table tbody tr');
    if (tableRows.length > 0) {
      tableRows.each((i, element) => {
        const columns = $(element).find('td');
        if (columns.length >= 2) {
          const label = $(columns[0]).text().trim();
          const value = $(columns[1]).text().trim();
          const maxText = columns[2] ? $(columns[2]).text().trim() : "0";

          if (label && !label.includes('المجموع') && !label.includes('التقدير') && !label.includes('رقم') && !label.includes('الاسم')) {
            const scoreNum = parseFloat(value);
            if (value) {
              grades.push({ subject: label, score: value, max: maxText !== "0" ? maxText : "مادة أساسية" });
              if (!isNaN(scoreNum)) {
                if (label.includes('اللغة العربية') || label.includes('اللغة الانجليزية') || label.includes('اللغة الإنجليزية') || label.includes('مجموع الرياضيات') || label.includes('الدراسات') || label.includes('العلوم')) {
                  calculatedTotal += scoreNum;
                }
              }
            }
          }
        }
      });
    }

    const finalScore = scrapTotalScore || calculatedTotal || 0;

    if (finalScore === 0 && grades.length === 0) {
      return res.status(404).json({ success: false, message: `عذراً، نتيجة محافظة ${gov} لم تعتمد بعد أو رقم الجلوس غير صحيح.` });
    }

    const percentage = ((finalScore / 280) * 100).toFixed(1) + "%";

    res.json({
      success: true,
      result: { name: cleanName || "طالب ناجح", status: statusText || "ناجح", percentage: percentage, total: `${finalScore} / 280`, grades: grades }
    });

  } catch (error) {
    console.error(`Error fetching from Nezaker: ${error.message}`);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب النتيجة من السيرفر الرئيسي، برجاء المحاولة لاحقاً.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
