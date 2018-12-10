const request = require('request');
const cheerio = require('cheerio');
const _cliProgress = require('cli-progress');
const fs = require('fs');
const outputFileName = "subjects.json";

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
    const html = `https://handbook.unimelb.edu.au/search?query=&year=${year}&types%5B%5D=subject`;
    return html;
}

const getHTML = (URL, callback) => {
    request(URL, function (error, response, body) { 
        callback(body);
    });
}

const getPageCount = (baseURL, callback) => {
    getHTML(baseURL, html => {
        const $ = cheerio.load(html);
        const pageCountDirty = $('.search-results__paginate > div > span').text();
        const pageCountClean = parseInt(pageCountDirty.replace(/^\D+/g, ''));
        callback(pageCountClean);
    });
}

const scrapePage = (baseURL, number, maxPages, callback, finishedCallBack) => {
    const pageURL = baseURL + `&page=${number}`;
    getHTML(pageURL, html =>{ 
        const pageSubjects = [];
        const $ = cheerio.load(html);
        const list = $('.search-results__accordion > li');
        list.each(function() {
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
const scrapeBar = new _cliProgress.Bar({}, _cliProgress.Presets.shades_classic);
const scrapeSubjects = (finishedCallBack) => {
    pagesScraped = 0;
    let allSubjects = [];
    const baseURL = generateSearchURL();
    getPageCount(baseURL, count => {
        console.log(`There are ${count} pages to parse from ${decodeURI(baseURL)}.\n`);
        scrapeBar.start(count, 1);
        for (let pageNo = 1; pageNo <= count; pageNo++){
            scrapePage(baseURL, pageNo, count, pageSubjects=>{
                allSubjects = allSubjects.concat(pageSubjects);
                scrapeBar.update(pagesScraped);
            }, () => finishedCallBack(allSubjects));
        }
    });
}

const begin=Date.now(); 
scrapeSubjects((allSubjects) => {
    scrapeBar.stop();
    const end = Date.now();
    const timeSpent = (end-begin) / 1000; 
    console.log(`\nA total of ${allSubjects.length} subjects were parsed in ${timeSpent} seconds.`);
    const fileContents = JSON.stringify(allSubjects);
    fs.writeFile(outputFileName, fileContents, error=>{
        if (error) {
            return console.log(`Could not save file, error encountered!\n${error}`);
        }
        return console.log(`Subject information was saved in JSON format to ${outputFileName}!`);
    }); 
});