const request = require("request");
const cheerio = require("cheerio");
const _cliProgress = require("cli-progress");
const fs = require("fs");
const progressBarStyle = _cliProgress.Presets.shades_classic;

class SubjectInfo {
  constructor(code, name, offered) {
    this.code = code;
    this.name = name;
    this.offered = offered; 
  }
  get fullCode() {
    let output = this.code + " - " + this.name;
    output += "\n\tStudy Period(s):" + this.offered.join(",");
    return output;
  }
}

const generateSearchURL = (year, studyPeriod) => `https://handbook.unimelb.edu.au/search?query=&year=${year}&types%5B%5D=subject&study_periods%5B%5D=${studyPeriod}`;

const getHTML = (URL, callback) => {
  request(URL, function(error, response, body) {
    callback(body);
  });
};

const getPageCount = (baseURL, callback) => {
  getHTML(baseURL, html => {
    const $ = cheerio.load(html);
    const pageCountDirty = $(".search-results__paginate > div > span").text();
    const pageCountClean = parseInt(pageCountDirty.replace(/^\D+/g, ""));
    callback(pageCountClean);
  });
};

const scrapePage = (baseURL, number, maxPages, callback, finishedCallBack) => {
  const pageURL = baseURL + `&page=${number}`;
  getHTML(pageURL, html => {
    const pageSubjects = [];
    const $ = cheerio.load(html);
    const list = $(".search-results__accordion > li");
    list.each(function() {
      const subjectCode = $(this).find(".search-results__accordion-code").text();
      const title = $(this).find(".search-results__accordion-title").text().replace(subjectCode, "");
      const details = $(this).find(".search-results__accordion-detail").text();
      const leftBound = "Offered:";
      const rightBound = "Year:";
      const offered = details.substring(
        details.lastIndexOf(leftBound) + leftBound.length,
        details.lastIndexOf(rightBound)
      );
      let studyPeriods = offered.split(",").map(item => item.trim());
      const newSubject = new SubjectInfo(subjectCode, title, studyPeriods);
      pageSubjects.push(newSubject);
    });
    pagesScraped++;
    callback(pageSubjects);
    if (pagesScraped == maxPages) {
      finishedCallBack();
    }
  });
};

let pagesScraped = 0;
const scrapeSubjects = (year, studyPeriod, finishedCallBack) => {
  pagesScraped = 0;
  let allSubjects = [];
  const baseURL = generateSearchURL(year, studyPeriod);
  getPageCount(baseURL, count => {
    console.log(`There are ${count} pages to parse from ${decodeURI(baseURL)}.\n`);
    const scrapeBar = new _cliProgress.Bar({}, progressBarStyle);
    scrapeBar.start(count, 1);
    for (let pageNo = 1; pageNo <= count; pageNo++) {
      scrapePage(
        baseURL,
        pageNo,
        count,
        pageSubjects => {
          allSubjects = allSubjects.concat(pageSubjects);
          scrapeBar.update(pagesScraped);
        },
        () => {
            scrapeBar.stop();
            finishedCallBack(allSubjects);
        }
      );
    }
  });
};

const studyPeriods = [
    {
        "code": "semester_1",
        "name": "Semester 1"
    },
    {
        "code": "semester_2",
        "name": "Semester 2"
    },
    {
        "code": "summer_term",
        "name": "Summer Term"
    },
    {
        "code": "winter_term",
        "name": "Winter Term"
    }

    /* Year long and others not handled */
];
 
const scrapeYear = (year, finishedScrapingCallback, studyPeriodIndex = 0) => {
    const studyPeriodName = studyPeriods[studyPeriodIndex].name;
    console.log(`Scraping subjects for study period: ${studyPeriodName} in ${year}`);
    const semCode = studyPeriods[studyPeriodIndex].code;
    const begin = Date.now();
    scrapeSubjects(year, semCode, allSubjects => { 
        const end = Date.now();
        const timeSpent = (end - begin) / 1000;
        console.log(`\nA total of ${allSubjects.length} subjects were parsed in ${timeSpent} seconds.`);
        const fileContents = JSON.stringify(allSubjects);
        const outputFileName = `subjects_${year}_${semCode}.json`;
        fs.writeFile(outputFileName, fileContents, error => {
          if (error) {
            return console.log(`Could not save file, error encountered!\n${error}`);
          }
          console.log(`Subject information was saved in JSON format to ${outputFileName}!\n`)
          if (studyPeriodIndex < studyPeriods.length - 1){
            scrapeYear(year, finishedScrapingCallback, ++studyPeriodIndex);
          } else {
            finishedScrapingCallback();
          }
          return true;
        });
        
    });
}

const thisYear = new Date().getFullYear();
const nextYear = thisYear + 1;
const startYear = thisYear - 1;

let currentYear = startYear;
const finishedScrapingYear = ()=>{
    if (currentYear < nextYear){
        scrapeYear(++currentYear, finishedScrapingYear);
    }
};

/* driver function */
scrapeYear(startYear, finishedScrapingYear);