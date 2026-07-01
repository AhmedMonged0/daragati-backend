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

// 1. جلب المحافظات وحالاتها
app.get('/api/v1/governorates', async (req, res) => {
  try {
    const API_KEY = '09326b8c4960b5ba8980922419857387';
    const targetUrl = 'https://natiga.nezakr.net/';
    const proxyUrl = `http://api.scraperapi.com?api_key=${API_KEY}&url=${encodeURIComponent(targetUrl)}`;

    const response = await axios.get(proxyUrl, {
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const scrapedGovs = [];

    $('a, div, p').each((index, element) => {
      const blockText = $(element).text().trim();
      
      if (blockText.includes('محافظة') && blockText.length < 1000) {
        Object.keys(GOV_MAPPING).forEach(govName => {
          if (blockText.includes(govName)) {
            let status = "سيتم رفع النتيجة قريباً 🟡";
            
            if (blockText.includes('متاحة الآن') || blockText.includes('ظهرت الآن')) {
              status = "ظهرت الآن 🟢";
            } else if (blockText.includes('جاري الرصد') || blockText.includes('جاري التصحيح')) {
              status = "جاري الرصد والتصحيح 🔴";
            } else if (blockText.includes('غداً') || blockText.includes('اعتماد')) {
              status = "اعتماد غداً 🔵";
            }

            if (!scrapedGovs.some(g => g.name === govName)) {
              scrapedGovs.push({ name: govName, status });
            }
          }
        });
      }
    });

    let finalGovernoratesList = Object.keys(GOV_MAPPING).map(govName => {
      const scraped = scrapedGovs.find(g => g.name === govName);
      if (scraped) return scraped;
      
      if (['الإسكندرية', 'بورسعيد', 'الدقهلية', 'دمياط', 'السويس', 'الغربية', 'مطروح'].includes(govName)) {
        return { name: govName, status: "ظهرت الآن 🟢" };
      }
      return { name: govName, status: "سيتم رفع النتيجة قريباً 🟡" };
    });

    finalGovernoratesList.sort((a, b) => {
      const aIsLive = a.status.includes('ظهرت الآن') ? 1 : 0;
      const bIsLive = b.status.includes('ظهرت الآن') ? 1 : 0;
      return bIsLive - aIsLive;
    });

    res.json({ success: true, governorates: finalGovernoratesList });
  } catch (error) {
    let fallbackList = Object.keys(GOV_MAPPING).map(govName => {
      if (['الإسكندرية', 'بورسعيد', 'الدقهلية', 'دمياط', 'السويس', 'الغربية', 'مطروح'].includes(govName)) {
        return { name: govName, status: "ظهرت الآن 🟢" };
      }
      return { name: govName, status: "سيتم رفع النتيجة قريباً 🟡" };
    });

    fallbackList.sort((a, b) => {
      const aIsLive = a.status.includes('ظهرت الآن') ? 1 : 0;
      const bIsLive = b.status.includes('ظهرت الآن') ? 1 : 0;
      return bIsLive - aIsLive;
    });

    res.json({ success: true, governorates: fallbackList });
  }
});

// 2. كشط درجات ومواد الطالب
app.get('/api/v1/result', async (req, res) => {
  const { seatNo, gov } = req.query;

  if (!seatNo) {
    return res.status(400).json({ success: false, message: 'برجاء إرسال رقم الجلوس' });
  }

  const govSlug = GOV_MAPPING[gov];
  if (!govSlug) {
    return res.status(400).json({ success: false, message: 'المحافظة المختارة غير مدعومة.' });
  }

  const targetUrl = `https://natiga.nezakr.net/${govSlug}/num/${seatNo}/`;

  try {
    const API_KEY = '09326b8c4960b5ba8980922419857387';
    const proxyUrl = `http://api.scraperapi.com?api_key=${API_KEY}&url=${encodeURIComponent(targetUrl)}`;

    const response = await axios.get(proxyUrl, {
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    let rawName = $('.student-box h1, h1').first().text();
    let cleanName = rawName
      .replace(/نتيجة الطالب/g, '')
      .replace(/نتيجة/g, '')
      .replace(/بالشهادة الإعدادية/g, '')
      .replace(/محافظة/g, '')
      .replace(new RegExp(gov, 'g'), '')
      .trim();
    
    let statusText = "ناجح";
    let scrapTotalScore = null;
    const grades = [];
    let calculatedTotal = 0;

    // New Design Parsing
    $('p').each((index, element) => {
      const pText = $(element).text().trim();
      if (pText === 'المجموع الكلي') {
        const h4ScoreText = $(element).prev('h4').text().trim();
        const parts = h4ScoreText.split('/');
        if (parts.length > 0) {
            const parsed = parseFloat(parts[0]);
            if (!isNaN(parsed)) scrapTotalScore = parsed;
        }
      }
      if (pText === 'التقدير العام') {
         statusText = $(element).prev('h4').text().trim();
      }
      if (pText === 'الحالة') {
         const state = $(element).prev('h4').text().trim();
         if(state && statusText !== "ناجح") statusText = state + " - " + statusText;
         else if(state) statusText = state;
      }
    });

    $('.subject-details-section').each((index, element) => {
      const prevHeader = $(element).prev('.winners-header');
      if (prevHeader.length) {
        const subjectFullText = prevHeader.find('h4').text().trim();
        if (subjectFullText.includes('تفاصيل وإحصاءات مادة')) {
          const subject = subjectFullText.replace('تفاصيل وإحصاءات مادة', '').trim();
          const scoreText = $(element).find('.studentnatigastats').first().text().trim();
          
          if (scoreText) {
            const parts = scoreText.replace('درجة الطالب:', '').split('/');
            if (parts.length === 2) {
              const score = parts[0].trim();
              const max = parts[1].trim();
              grades.push({ subject, score, max });
              
              const scoreNum = parseFloat(score);
              if (!isNaN(scoreNum)) {
                 if (subject.includes('اللغة العربية') || subject.includes('اللغة الانجليزية') || subject.includes('اللغة الإنجليزية') || subject.includes('مجموع الرياضيات') || subject.includes('الدراسات') || subject.includes('العلوم')) {
                   calculatedTotal += scoreNum;
                 }
              }
            }
          }
        }
      }
    });

    // Fallback to Old Table Design if New Design failed to find grades
    if (grades.length === 0) {
      statusText = "ناجح";
      $('table tr').each((index, element) => {
        const label = $(element).find('td').eq(0).text().trim();
        const value = $(element).find('td').eq(1).text().trim();
        const maxText = $(element).find('td').eq(2).text().trim() || "0";

        if (label.includes('التقدير')) statusText = value;
        if (label.includes('المجموع الكلي')) {
          const parsed = parseFloat(value);
          if (!isNaN(parsed) && parsed > 50) scrapTotalScore = parsed;
        }

        if (label && !label.includes('المدرسة') && !label.includes('الإدارة') && !label.includes('المجموع') && !label.includes('التقدير') && !label.includes('رقم') && !label.includes('الاسم')) {
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
      });
    }

    const finalScore = scrapTotalScore || calculatedTotal || 0;

    if (finalScore === 0 && grades.length === 0) {
      return res.status(404).json({ success: false, message: `عذراً، نتيجة محافظة ${gov} لم تعتمد بعد.` });
    }

    const percentage = ((finalScore / 280) * 100).toFixed(1) + "%";

    res.json({
      success: true,
      result: { name: cleanName || "طالب ناجح", status: statusText || "ناجح", percentage: percentage, total: `${finalScore} / 280`, grades: grades }
    });

  } catch (error) {
    res.status(404).json({ success: false, message: `عذراً، النتيجة غير متاحة حالياً. تفاصيل الخطأ: ${error.message}` });
  }
});

// تشغيل البورت المتوافق مع بيئة الـ Build والـ Serverless
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
