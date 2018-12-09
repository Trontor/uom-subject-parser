const request = require('request');
const cheerio = require('cheerio');

let offerings = [];
class SubjectInfo {
    constructor(code, name, offered){
        this.code = code;
        this.name = name;
        this.offered = offered;
        this.offered.forEach(period=>{
            if (!offerings.includes(period)){
                offerings.push(period);
            }
        });
    }
    get fullCode() {
        let output =  this.code + ' - ' + this.name;
        output += '\n\tStudy Period(s):' + this.offered.join(',');
        return output;
    } 
}

/* https://stackoverflow.com/questions/6117814/get-week-of-year-in-javascript-like-in-php */
const getWeekNumber = d => {
    // Copy date so don't modify original
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    // Get first day of year
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    // Calculate full weeks to nearest Thursday
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    // Return array of year and week number
    return [d.getUTCFullYear(), weekNo];
}

/* This is the week number SWOTVAC is likely to fall under */
const sem1SwotVac = 22;
const sem2SwotVac = 43;

const semesterIdentifier = date =>{
    const currentWeek = getWeekNumber(date);
    if (currentWeek < sem1SwotVac){
        return 1;
    } else if (currentWeek < sem2SwotVac){
        return 2;
    }
    return 3;
}

const generateSearchURL = () => {
    const currDate = new Date();
    let year = currDate.getFullYear();
    let sem = semesterIdentifier(currDate); 
    if (sem === 3){
        sem = 1;
        year += 1;
    }
    const html = `https://handbook.unimelb.edu.au/search?query=&year=${year}&types%5B%5D=subject&level_type%5B%5D=all&area_of_study=all&faculty=all&department=all`;
    return html;
}

const getHTML = (URL, callback) => {
    request(URL, function (error, response, body) { 
        callback(body);
    });
}

const getPageCount = (callback) => {
    const searchURL = generateSearchURL();
    getHTML(searchURL, html => {
        const $ = cheerio.load(html);
        const pageCountDirty = $('.search-results__paginate > div > span').text();
        const pageCountClean = pageCountDirty.replace(/^\D+/g, '');
        console.log(`There are ${pageCountClean} pages to parse.`);
        callback(pageCountClean);
    });
}

const scrapePage = (number, maxPages, callback, finishedCallBack) => {
    const pageURL = generateSearchURL() + `&page=${number}`;
    getHTML(pageURL, html =>{ 
        pageSubjects = [];
        const $ = cheerio.load(html);
        const searchResults = $('.search-results__accordion > li').each(function(i, elm) {
            const subjectCode = $(this).find('.search-results__accordion-code').text();
            const title = $(this).find('.search-results__accordion-title').text().replace(subjectCode,"");
            const details = $(this).find('.search-results__accordion-detail').text();
            const leftBound = "Offered:";
            const rightBound = "Year:";
            const offered = details.substring(
                details.lastIndexOf(leftBound) + leftBound.length, 
                details.lastIndexOf(rightBound)
            );
            let studyPeriods = offered.split(',').map(function(item) {
                return item.trim();
              });
            const newSubject = new SubjectInfo(subjectCode, title, studyPeriods);
            pageSubjects.push(newSubject);
        });
        pagesScraped++; 
        callback(pageSubjects);
        if (pagesScraped == maxPages){
            finishedCallBack();
        }
    });     
}

let pagesScraped = 0;
let allSubjects = [];
const scrapeSubjects = (callback) =>{
    pagesScraped = 0;
    getPageCount(count => {
        for (let pageNo = 0; pageNo < count; pageNo++){
            scrapePage(pageNo, count, pageSubjects=>{
                allSubjects = allSubjects.concat(pageSubjects);
            }, callback);
        }
    });
    return null;
}

scrapeSubjects(() => {
    console.log(`A total of ${allSubjects.length} subjects were parsed. Offerings:\n\t${JSON.stringify(offerings)}`);
});