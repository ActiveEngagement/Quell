const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const simpleParser = require('mailparser').simpleParser;
const axios = require('axios');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');


const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

app.post('/upload', upload.single('emlFile'), (req, res) => {
    handleUpload(req, res).catch(error => {
        console.error('Error processing file:', error);
        res.status(500).send({ error: error.message });
    });
});

async function handleUpload(req, res) {
    console.log('File received:', req.file);
    
    const rawEmail = await fs.readFile(req.file.path, 'utf8');
    const parsed = await simpleParser(rawEmail);
    
    let allContent = [
        parsed.text,
        parsed.html,
        parsed.textAsHtml,
        JSON.stringify(parsed.headers),
        parsed.subject,
        parsed.from ? parsed.from.text : '',
        parsed.to ? parsed.to.text : '',
        parsed.cc ? parsed.cc.text : '',
        parsed.bcc ? parsed.bcc.text : '',
        ...parsed.attachments.map(att => att.content.toString())
    ].join(' ');

    const links = extractLinks(allContent);
    const processedLinks = await processLinks(links);
    
    res.json(processedLinks);
}


function extractLinks(content) {
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/g;
    const matches = content.matchAll(linkRegex);
    const links = Array.from(matches, match => match[1])
        .filter(link => !link.startsWith('mailto:'))
        .filter(link => !/\.(jpg|jpeg|png|gif|bmp|svg)$/i.test(link));
    console.log('Extracted links count:', links.length);
    return links;
}


function parseURL(url) {
    const parsedURL = new URL(url);
    const baseURL = `${parsedURL.protocol}//${parsedURL.hostname}${parsedURL.pathname}`;
    const params = Object.fromEntries(parsedURL.searchParams);
    return { baseURL, params };
}


async function processLinks(links) {
    const processedLinks = {};
    for (const link of links) {
        console.log('Processing link:', link);
        const unwrappedLink = await unwrapLink(link);
        
        if (processedLinks[unwrappedLink]) {
            if (!processedLinks[unwrappedLink].wrapperHistory.includes(link)) {
                processedLinks[unwrappedLink].wrapperHistory.push(link);
            }
        } else {
            processedLinks[unwrappedLink] = { 
                originalLink: unwrappedLink,
                count: 1, 
                wrapperHistory: [link]
            };
        }
    }
    
    // Adjust counts based on unique wrapper links
    for (const info of Object.values(processedLinks)) {
        info.count = info.wrapperHistory.length;
    }
    
    return processedLinks;
}





const execPromise = util.promisify(exec);

async function unwrapLink(link) {
    try {
        const { stdout } = await execPromise(`curl -Ls -o /dev/null -w %{url_effective} "${link}"`);
        return stdout.trim();
    } catch (error) {
        console.log(`Unable to unwrap link: ${link}. Error: ${error.message}`);
        return link;
    }
}



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
