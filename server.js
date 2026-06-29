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

// 1. جلب المحافظات وحالاتها الفعلية من عناصر الداتا الجديدة
app.get('/api/v1/governorates', async (req, res) => {
  try {
    const response = await axios.get('https://natiga.nezakr.net/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);
    const scrapedGovs = [];

    // استهداف دقيق للكروت وعناصر القائمة المحدثة في الموقع الأصلي
    $('.gov-card, .governorate-link, a, div').each((index, element) => {
      const blockText = $(element).text().trim();
      
      Object.keys(GOV_MAPPING).forEach(govName => {
        if (blockText.includes(govName) && blockText.length < 150) {
          let status = "سيتم رفع النتيجة قريباً 🟡";
          
          if (blockText.includes('متاحة الآن') || blockText.includes('ظهرت الآن') || $(element).hasClass('live') || $(element).html().includes('🟢')) {
            status = "ظهرت الآن 🟢";
          } else if (blockText.includes('جاري الرصد') || blockText.includes('جاري التصحيح')) {
            status = "جاري الرصد والتصحيح 🔴";
          }

          if (!scrapedGovs.some(g => g.name === govName)) {
            scrapedGovs.push({ name: govName, status });
          }
        }
      });
    });

    // دمج وتحديث الحالات بناء على الكشط الفعلي
    let finalGovernoratesList = Object.keys(GOV_MAPPING).map(govName => {
      const scraped = scrapedGovs.find(g => g.name === govName);
      return scraped ? scraped : { name: govName, status: "سيتم رفع النتيجة قريباً 🟡" };
    });

    // الترتيب: المتاح الآن أولاً
    finalGovernoratesList.sort((a, b) => {
      const aIsLive = a.status.includes('ظهرت الآن') ? 1 : 0;
      const bIsLive = b.status.includes('ظهرت الآن') ? 1 : 0;
      return bIsLive - aIsLive;
    });

    res.json({ success: true, governorates: finalGovernoratesList });
  } catch (error) {
    // Fallback احتياطي متوازن في حالة الـ Timeout
    let fallbackList = Object.keys(GOV_MAPPING).map(govName => ({
      name: govName,
      status: "سيتم رفع النتيجة قريباً 🟡"
    }));
    res.json({ success: true, governorates: fallbackList });
  }
});

// 2. كشط النتيجة الفعلي مع فحص دقيق للـ Table و الـ Selectors الجديدة
app.get('/api/v1/result', async (req, res) => {
  const { seatNo, gov } = req.query;

  if (!seatNo || !gov) {
    return res.status(400).json({ success: false, message: 'برجاء إرسال رقم الجلوس والمحافظة بشكل صحيح.' });
  }

  const govSlug = GOV_MAPPING[gov];
  if (!govSlug) {
    return res.status(400).json({ success: false, message: 'المحافظة المختارة غير مدعومة.' });
  }

  const targetUrl = `https://natiga.nezakr.net/${govSlug}/num/${seatNo}/`;

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);

    // سحب الاسم من الـ Selectors المحدثة بالكامل
    let rawName = $('.student-name, h1, .name, .panel-heading').first().text().trim();
    let cleanName = rawName
      .replace(/نتيجة الطالب/g, '')
      .replace(/نتيجة/g, '')
      .replace(/بالشهادة الإعدادية/g, '')
      .replace(/محافظة/g, '')
      .replace(new RegExp(gov, 'g'), '')
      .trim();

    const grades = [];
    let scrapTotalScore = null;
    let calculatedTotal = 0;
    let statusText = "ناجح";

    // تفتيش دقيق في كل جداول الصفحة لضمان عدم تفويت الدرجات
    $('table tr, .result-row').each((index, element) => {
      const td = $(element).find('td, th');
      if (td.length >= 2) {
        const label = td.eq(0).text().trim();
        const value = td.eq(1).text().trim();
        const maxText = td.eq(2).text().trim() || "مادة أساسية";

        if (label.includes('المجموع الكلي') || label.includes('المجموع')) {
          const parsed = parseFloat(value);
          if (!isNaN(parsed)) scrapTotalScore = parsed;
          return;
        }

        if (label.includes('التقدير') || label.includes('الحالة')) {
          statusText = value;
          return;
        }

        // تصفية المواد وفصلها عن بيانات المدرسة والإدارة
        if (label && value && !label.includes('الاسم') && !label.includes('رقم') && !label.includes('المدرسة') && !label.includes('الإدارة')) {
          grades.push({ subject: label, score: value, max: maxText });
          
          const scoreNum = parseFloat(value);
          if (!isNaN(scoreNum) && (label.includes('عربية') || label.includes('انجليزي') || label.includes('إنجليزي') || label.includes('رياضيات') || label.includes('دراسات') || label.includes('علوم'))) {
            calculatedTotal += scoreNum;
          }
        }
      }
    });

    const finalScore = scrapTotalScore || calculatedTotal || 0;

    if (grades.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: `عذراً، لم يتم العثور على درجات لهذا الرقم، قد تكون النتيجة تحت الرفع حالياً.` 
      });
    }

    const percentage = ((finalScore / 280) * 100).toFixed(1) + "%";

    res.json({
      success: true,
      result: {
        name: cleanName || "طالب بالشهادة الإعدادية",
        status: statusText,
        percentage: percentage,
        total: `${finalScore} / 280`,
        grades: grades
      }
    });

  } catch (error) {
    res.status(404).json({ 
      success: false, 
      message: `عذراً، النتيجة غير متاحة حالياً لمحافظة ${gov} برقم الجلوس هذا، أو هناك ضغط على الموقع الأصلي.` 
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running`);
});

export default app;
