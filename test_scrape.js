import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
  const res = await axios.get('https://natiga.nezakr.net/Alexandria/num/185771/');
  const $ = cheerio.load(res.data);
  
  let statusText = "ناجح";
  let scrapTotalScore = null;
  const grades = [];
  let calculatedTotal = 0;

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
       if(state) statusText = state + " - " + statusText;
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

  console.log({ statusText, scrapTotalScore, calculatedTotal, grades });
}
test();
